-- 006_request_flow
-- The request lifecycle. Every fairness rule is enforced here, not only in the UI:
--   submit_request()  the ONLY way to create a request
--   close_request()   who may set which status
--   client_report_outcome()  "Did you hire them?"
--   expire_requests() hourly via pg_cron
-- Public functions are SECURITY INVOKER wrappers; the logic is in `private` (not exposed by the Data API).

create extension if not exists pg_cron;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
-- Normalised job text used for duplicate detection (pg_trgm similarity).
create or replace function private.job_fingerprint(p_title text, p_description text)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(regexp_replace(lower(coalesce(p_title, '') || ' ' || coalesce(p_description, '')), '[^a-z0-9]+', ' ', 'g'));
$$;

create or replace function private.current_billing_month()
returns date
language sql
stable
set search_path = ''
as $$
  select (date_trunc('month', now() at time zone 'utc'))::date;
$$;

create or replace function private.result(p_ok boolean, p_code text, p_extra jsonb default '{}'::jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object('ok', p_ok, 'code', p_code) || coalesce(p_extra, '{}'::jsonb);
$$;

create or replace function private.refresh_avg_response(p_provider_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.providers pr
     set avg_response_hours = sub.avg_hours
    from (
      select round((avg(extract(epoch from (r.responded_at - r.created_at))) / 3600)::numeric, 2) as avg_hours
        from public.requests r
       where r.provider_id = p_provider_id and r.responded_at is not null and not r.is_invalid
    ) sub
   where pr.id = p_provider_id;
$$;

-- ---------------------------------------------------------------------------
-- submit_request
-- ---------------------------------------------------------------------------
create or replace function private.submit_request(
  p_provider_slug text,
  p_category_id uuid,
  p_title text,
  p_description text,
  p_zip text,
  p_city text,
  p_preferred_timing text,
  p_contact_name text,
  p_entry_path public.entry_path,
  p_device_fingerprint text default null,
  p_ip text default null,
  p_user_agent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_email text;
  v_email_confirmed timestamptz;
  v_settings public.app_settings%rowtype;
  v_provider public.providers%rowtype;
  v_provider_status public.account_status;
  v_month date := private.current_billing_month();
  v_month_start timestamptz := date_trunc('month', now() at time zone 'utc') at time zone 'utc';
  v_used int;
  v_is_overage boolean := false;
  v_cap_reached boolean := false;
  v_fp text;
  v_dup_id uuid;
  v_dup_sim real;
  v_new_status public.account_status;
  v_request_id uuid;
  v_title text := btrim(coalesce(p_title, ''));
  v_desc text := btrim(coalesce(p_description, ''));
  v_zip text := btrim(coalesce(p_zip, ''));
  v_city text := nullif(btrim(coalesce(p_city, '')), '');
  v_timing text := nullif(btrim(coalesce(p_preferred_timing, '')), '');
  v_name text := btrim(coalesce(p_contact_name, ''));
  v_device text := nullif(left(btrim(coalesce(p_device_fingerprint, '')), 128), '');
  v_ip text := nullif(left(btrim(coalesce(p_ip, '')), 64), '');
begin
  if v_uid is null then
    return private.result(false, 'NOT_AUTHENTICATED');
  end if;

  -- 1. Caller is a client. Lock the profile row to serialise this client's submissions.
  select * into v_profile from public.profiles where id = v_uid for update;
  if not found or v_profile.role <> 'client' then
    return private.result(false, 'NOT_CLIENT');
  end if;

  -- 2. Account status allows submitting.
  if v_profile.status = 'suspended' then
    return private.result(false, 'ACCOUNT_LOCKED', jsonb_build_object('account_status', 'suspended'));
  end if;
  if v_profile.status = 'locked' then
    if v_profile.locked_until is not null and v_profile.locked_until <= now() then
      update public.profiles set status = 'warned', locked_until = null where id = v_uid;
    else
      return private.result(false, 'ACCOUNT_LOCKED',
        jsonb_build_object('account_status', 'locked', 'locked_until', v_profile.locked_until));
    end if;
  end if;

  -- 3. Email and phone verified.
  select u.email, u.email_confirmed_at into v_email, v_email_confirmed from auth.users u where u.id = v_uid;
  if v_email_confirmed is null or v_profile.phone is null or v_profile.phone_verified_at is null then
    return private.result(false, 'NOT_VERIFIED');
  end if;

  -- 4. Fairness acknowledgement for the current statement version.
  select * into v_settings from public.app_settings where id;
  if not exists (
    select 1 from public.fairness_acknowledgements a
     where a.client_id = v_uid and a.statement_version = v_settings.fairness_statement_version
  ) then
    return private.result(false, 'NO_ACK');
  end if;

  -- 5. No active request anywhere on the platform.
  if exists (select 1 from public.requests r where r.client_id = v_uid and r.status = 'active') then
    return private.result(false, 'ALREADY_ACTIVE');
  end if;

  -- Input checks (the UI validates too; this is the backstop).
  if char_length(v_title) not between 3 and 120
     or char_length(v_desc) not between 20 and 4000
     or v_zip !~ '^[0-9]{5}$'
     or char_length(v_name) not between 2 and 120
     or coalesce(char_length(v_city), 0) > 80
     or coalesce(char_length(v_timing), 0) > 80
     or p_entry_path is null
     or p_category_id is null then
    return private.result(false, 'INVALID_INPUT');
  end if;

  -- 6. Rate limits: per user, IP and device, per 24 hours. Counted even when later checks fail.
  if not private.hit_rate_limit('user:' || v_uid || ':submit', 86400, 5)
     or (v_ip is not null and not private.hit_rate_limit('ip:' || v_ip || ':submit', 86400, 10))
     or (v_device is not null and not private.hit_rate_limit('device:' || v_device || ':submit', 86400, 10)) then
    perform private.record_violation(v_uid, 'rate_limit',
      jsonb_build_object('ip', v_ip, 'device_fingerprint', v_device, 'provider_slug', p_provider_slug), false);
    return private.result(false, 'RATE_LIMITED');
  end if;

  -- 7. Duplicate job check: same category + ZIP + similar text within 72 hours.
  --    Requests the provider declined, closed or let expire do not count: the client may take
  --    that job to someone else. Client-closed or completed ones do (that is shopping around).
  v_fp := private.job_fingerprint(v_title, v_desc);
  select r.id, extensions.similarity(r.fingerprint, v_fp)
    into v_dup_id, v_dup_sim
    from public.requests r
   where r.client_id = v_uid
     and r.created_at > now() - interval '72 hours'
     and r.category_id = p_category_id
     and r.zip = v_zip
     and r.status in ('active', 'closed_by_client', 'completed')
     and extensions.similarity(r.fingerprint, v_fp) >= 0.6
   order by 2 desc
   limit 1;
  if v_dup_id is not null then
    v_new_status := private.record_violation(v_uid, 'duplicate_job',
      jsonb_build_object('matched_request_id', v_dup_id, 'similarity', v_dup_sim,
                         'provider_slug', p_provider_slug, 'fingerprint', v_fp), true);
    return private.result(false, 'DUPLICATE_JOB', jsonb_build_object('account_status', v_new_status));
  end if;

  -- 8. Provider availability. Lock the provider row so cap counting is safe under concurrency.
  select * into v_provider from public.providers where slug = p_provider_slug for update;
  if not found or not v_provider.is_listed or v_provider.onboarded_at is null then
    return private.result(false, 'PROVIDER_NOT_FOUND');
  end if;
  select p.status into v_provider_status from public.profiles p where p.id = v_provider.profile_id;
  if v_provider_status = 'suspended' then
    return private.result(false, 'PROVIDER_PAUSED');
  end if;

  -- A cap pause from an earlier month has lapsed.
  if v_provider.requests_paused and v_provider.paused_reason = 'cap_reached' and v_provider.paused_at < v_month_start then
    update public.providers set requests_paused = false, paused_reason = null, paused_at = null where id = v_provider.id;
    v_provider.requests_paused := false;
  end if;

  if v_provider.requests_paused then
    return private.result(false, case when v_provider.paused_reason = 'cap_reached' then 'PROVIDER_AT_CAP' else 'PROVIDER_PAUSED' end);
  end if;

  if not exists (
    select 1 from public.provider_categories pc where pc.provider_id = v_provider.id and pc.category_id = p_category_id
  ) then
    return private.result(false, 'INVALID_INPUT', jsonb_build_object('field', 'category_id'));
  end if;

  select count(*) into v_used
    from public.requests r
   where r.provider_id = v_provider.id and r.billing_month = v_month and not r.is_invalid;

  if v_used >= v_provider.monthly_cap then
    if v_provider.overage_opt_in then
      v_is_overage := true;
    else
      update public.providers set requests_paused = true, paused_reason = 'cap_reached', paused_at = now()
       where id = v_provider.id;
      return private.result(false, 'PROVIDER_AT_CAP');
    end if;
  end if;

  -- 9. Insert. The partial unique index is the final guard against a concurrent second request.
  begin
    insert into public.requests (
      client_id, provider_id, category_id, title, description, zip, city, preferred_timing,
      contact_name, contact_email, contact_phone, entry_path, status, is_overage, billing_month,
      fingerprint, device_fingerprint, ip, user_agent, expires_at
    ) values (
      v_uid, v_provider.id, p_category_id, v_title, v_desc, v_zip, v_city, v_timing,
      v_name, coalesce(v_email, v_profile.email), v_profile.phone, p_entry_path, 'active', v_is_overage, v_month,
      v_fp, v_device, v_ip, left(p_user_agent, 500), now() + make_interval(days => v_settings.request_expiry_days)
    )
    returning id into v_request_id;
  exception when unique_violation then
    return private.result(false, 'ALREADY_ACTIVE');
  end;

  insert into public.request_events (request_id, actor_id, event, meta)
  values (v_request_id, v_uid, 'created',
          jsonb_build_object('entry_path', p_entry_path, 'is_overage', v_is_overage, 'ip', v_ip, 'device_fingerprint', v_device));

  -- 10. The included allowance is now used up: pause unless the provider opted in to extra requests.
  if not v_provider.overage_opt_in and v_used + 1 >= v_provider.monthly_cap then
    update public.providers set requests_paused = true, paused_reason = 'cap_reached', paused_at = now()
     where id = v_provider.id and not requests_paused;
    v_cap_reached := true;
  end if;

  return private.result(true, 'OK', jsonb_build_object(
    'request_id', v_request_id,
    'provider_id', v_provider.id,
    'is_overage', v_is_overage,
    'provider_cap_reached', v_cap_reached,
    'used', v_used + 1,
    'cap', v_provider.monthly_cap
  ));
end;
$$;

create or replace function public.submit_request(
  p_provider_slug text,
  p_category_id uuid,
  p_title text,
  p_description text,
  p_zip text,
  p_city text,
  p_preferred_timing text,
  p_contact_name text,
  p_entry_path public.entry_path,
  p_device_fingerprint text default null,
  p_ip text default null,
  p_user_agent text default null
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.submit_request(p_provider_slug, p_category_id, p_title, p_description, p_zip, p_city,
    p_preferred_timing, p_contact_name, p_entry_path, p_device_fingerprint, p_ip, p_user_agent);
$$;

-- ---------------------------------------------------------------------------
-- close_request: who may set which status
--   client:   closed_by_client (optional client outcome)
--   provider: declined | completed | closed_by_provider (outcome required unless declined)
--   admin:    closed_by_admin
-- ---------------------------------------------------------------------------
create or replace function private.close_request(
  p_request_id uuid,
  p_new_status public.request_status,
  p_outcome public.request_outcome default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_role public.user_role;
  v_req public.requests%rowtype;
  v_provider_id uuid;
  v_note text := nullif(left(btrim(coalesce(p_note, '')), 1000), '');
  v_event public.request_event_type;
begin
  if v_uid is null then
    return private.result(false, 'NOT_AUTHENTICATED');
  end if;
  select role into v_role from public.profiles where id = v_uid;

  select * into v_req from public.requests where id = p_request_id for update;
  if not found then
    return private.result(false, 'NOT_FOUND');
  end if;

  if v_role = 'client' then
    if v_req.client_id <> v_uid then return private.result(false, 'NOT_FOUND'); end if;
    if p_new_status <> 'closed_by_client' then return private.result(false, 'NOT_ALLOWED'); end if;
  elsif v_role = 'provider' then
    select id into v_provider_id from public.providers where profile_id = v_uid;
    if v_req.provider_id is distinct from v_provider_id then return private.result(false, 'NOT_FOUND'); end if;
    if p_new_status not in ('declined', 'completed', 'closed_by_provider') then
      return private.result(false, 'NOT_ALLOWED');
    end if;
    if p_new_status in ('completed', 'closed_by_provider') and p_outcome is null then
      return private.result(false, 'OUTCOME_REQUIRED');
    end if;
  elsif v_role = 'admin' then
    if p_new_status <> 'closed_by_admin' then return private.result(false, 'NOT_ALLOWED'); end if;
  else
    return private.result(false, 'NOT_ALLOWED');
  end if;

  if v_req.status <> 'active' then
    return private.result(false, 'NOT_ACTIVE', jsonb_build_object('status', v_req.status));
  end if;

  update public.requests
     set status = p_new_status,
         closed_at = now(),
         closed_by = v_uid,
         outcome = case when v_role in ('provider', 'admin') and p_new_status <> 'declined' then p_outcome else outcome end,
         outcome_note = case when v_role in ('provider', 'admin') then v_note else outcome_note end,
         client_outcome = case when v_role = 'client' then p_outcome else client_outcome end,
         client_outcome_at = case when v_role = 'client' and p_outcome is not null then now() else client_outcome_at end,
         responded_at = case when v_role = 'provider' then coalesce(responded_at, now()) else responded_at end
   where id = p_request_id;

  v_event := case p_new_status
    when 'declined' then 'declined'::public.request_event_type
    when 'completed' then 'completed'::public.request_event_type
    when 'closed_by_admin' then 'admin_action'::public.request_event_type
    else 'closed'::public.request_event_type
  end;
  insert into public.request_events (request_id, actor_id, event, note, meta)
  values (p_request_id, v_uid, v_event, v_note,
          jsonb_build_object('status', p_new_status, 'outcome', p_outcome, 'by_role', v_role));

  if v_role = 'provider' then
    perform private.refresh_avg_response(v_req.provider_id);
  end if;

  return private.result(true, 'OK', jsonb_build_object('request_id', p_request_id, 'status', p_new_status));
end;
$$;

create or replace function public.close_request(
  p_request_id uuid,
  p_new_status public.request_status,
  p_outcome public.request_outcome default null,
  p_note text default null
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.close_request(p_request_id, p_new_status, p_outcome, p_note);
$$;

-- ---------------------------------------------------------------------------
-- client_report_outcome: the client's answer to "Did you hire them?"
-- ---------------------------------------------------------------------------
create or replace function private.client_report_outcome(p_request_id uuid, p_outcome public.request_outcome)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_req public.requests%rowtype;
begin
  select * into v_req from public.requests where id = p_request_id for update;
  if not found or v_req.client_id is distinct from v_uid then
    return private.result(false, 'NOT_FOUND');
  end if;
  if v_req.status = 'active' then
    return private.result(false, 'NOT_ALLOWED');
  end if;
  update public.requests set client_outcome = p_outcome, client_outcome_at = now() where id = p_request_id;
  insert into public.request_events (request_id, actor_id, event, meta)
  values (p_request_id, v_uid, 'closed', jsonb_build_object('client_outcome', p_outcome, 'kind', 'client_outcome_report'));
  return private.result(true, 'OK');
end;
$$;

create or replace function public.client_report_outcome(p_request_id uuid, p_outcome public.request_outcome)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.client_report_outcome(p_request_id, p_outcome);
$$;

-- ---------------------------------------------------------------------------
-- Scheduled jobs
-- ---------------------------------------------------------------------------
create or replace function private.expire_requests()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  with expired as (
    update public.requests
       set status = 'expired', closed_at = now()
     where status = 'active' and expires_at <= now()
    returning id
  ), ev as (
    insert into public.request_events (request_id, event, meta)
    select id, 'expired', jsonb_build_object('by', 'system') from expired
    returning 1
  )
  select count(*) into v_count from ev;
  return v_count;
end;
$$;

-- Lift cap pauses at the start of a new month.
create or replace function private.reset_cap_pauses()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  update public.providers
     set requests_paused = false, paused_reason = null, paused_at = null
   where requests_paused and paused_reason = 'cap_reached'
     and paused_at < date_trunc('month', now() at time zone 'utc') at time zone 'utc';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function private.cleanup_rate_limits()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.rate_limits where window_start < now() - interval '3 days';
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke all on function private.job_fingerprint(text, text) from public, anon, authenticated;
revoke all on function private.current_billing_month() from public, anon, authenticated;
revoke all on function private.result(boolean, text, jsonb) from public, anon, authenticated;
revoke all on function private.refresh_avg_response(uuid) from public, anon, authenticated;
revoke all on function private.submit_request(text, uuid, text, text, text, text, text, text, public.entry_path, text, text, text) from public, anon;
revoke all on function private.close_request(uuid, public.request_status, public.request_outcome, text) from public, anon;
revoke all on function private.client_report_outcome(uuid, public.request_outcome) from public, anon;
revoke all on function private.expire_requests() from public, anon, authenticated;
revoke all on function private.reset_cap_pauses() from public, anon, authenticated;
revoke all on function private.cleanup_rate_limits() from public, anon, authenticated;

grant execute on function private.submit_request(text, uuid, text, text, text, text, text, text, public.entry_path, text, text, text) to authenticated;
grant execute on function private.close_request(uuid, public.request_status, public.request_outcome, text) to authenticated;
grant execute on function private.client_report_outcome(uuid, public.request_outcome) to authenticated;

revoke all on function public.submit_request(text, uuid, text, text, text, text, text, text, public.entry_path, text, text, text) from public, anon;
revoke all on function public.close_request(uuid, public.request_status, public.request_outcome, text) from public, anon;
revoke all on function public.client_report_outcome(uuid, public.request_outcome) from public, anon;
grant execute on function public.submit_request(text, uuid, text, text, text, text, text, text, public.entry_path, text, text, text) to authenticated;
grant execute on function public.close_request(uuid, public.request_status, public.request_outcome, text) to authenticated;
grant execute on function public.client_report_outcome(uuid, public.request_outcome) to authenticated;

-- ---------------------------------------------------------------------------
-- pg_cron schedules (UTC)
-- ---------------------------------------------------------------------------
select cron.schedule('fairground-expire-requests', '0 * * * *', $$select private.expire_requests()$$);
select cron.schedule('fairground-reset-cap-pauses', '5 0 1 * *', $$select private.reset_cap_pauses()$$);
select cron.schedule('fairground-cleanup-rate-limits', '30 3 * * *', $$select private.cleanup_rate_limits()$$);

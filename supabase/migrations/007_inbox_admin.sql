-- 007_inbox_admin
-- Provider inbox actions, admin tools and beta metrics.
-- Admin functions check private.is_admin() inside, run with the admin's own session (so
-- auth.uid() is recorded), and are exposed through SECURITY INVOKER wrappers.

-- ---------------------------------------------------------------------------
-- Provider: viewed / responded
-- ---------------------------------------------------------------------------
create or replace function private.provider_mark_request(p_request_id uuid, p_action text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_provider_id uuid;
  v_req public.requests%rowtype;
begin
  select id into v_provider_id from public.providers where profile_id = v_uid;
  select * into v_req from public.requests where id = p_request_id for update;
  if not found or v_provider_id is null or v_req.provider_id <> v_provider_id then
    return private.result(false, 'NOT_FOUND');
  end if;

  if p_action = 'viewed' then
    if v_req.viewed_at is null then
      update public.requests set viewed_at = now() where id = p_request_id;
      insert into public.request_events (request_id, actor_id, event) values (p_request_id, v_uid, 'viewed');
    end if;
  elsif p_action = 'responded' then
    if v_req.status <> 'active' then
      return private.result(false, 'NOT_ACTIVE');
    end if;
    if v_req.responded_at is null then
      update public.requests set responded_at = now(), viewed_at = coalesce(viewed_at, now()) where id = p_request_id;
      insert into public.request_events (request_id, actor_id, event) values (p_request_id, v_uid, 'responded');
      perform private.refresh_avg_response(v_provider_id);
    end if;
  else
    return private.result(false, 'NOT_ALLOWED');
  end if;
  return private.result(true, 'OK');
end;
$$;

create or replace function public.provider_mark_request(p_request_id uuid, p_action text)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.provider_mark_request(p_request_id, p_action);
$$;

-- ---------------------------------------------------------------------------
-- Admin: mark a request invalid (spam or fake). Invalid requests do not count toward the
-- provider's monthly allowance, which is the safety valve for the no-refund policy.
-- ---------------------------------------------------------------------------
create or replace function private.admin_set_request_invalid(p_request_id uuid, p_invalid boolean, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_req public.requests%rowtype;
  v_provider public.providers%rowtype;
  v_used int;
begin
  if not private.is_admin() then
    return private.result(false, 'NOT_ALLOWED');
  end if;
  select * into v_req from public.requests where id = p_request_id for update;
  if not found then
    return private.result(false, 'NOT_FOUND');
  end if;

  update public.requests
     set is_invalid = p_invalid,
         invalid_reason = case when p_invalid then nullif(left(btrim(coalesce(p_reason, '')), 500), '') else null end,
         invalid_at = case when p_invalid then now() else null end,
         invalid_by = case when p_invalid then v_uid else null end
   where id = p_request_id;

  insert into public.request_events (request_id, actor_id, event, note, meta)
  values (p_request_id, v_uid, 'admin_action', nullif(left(btrim(coalesce(p_reason, '')), 1000), ''),
          jsonb_build_object('action', case when p_invalid then 'mark_invalid' else 'mark_valid' end));

  -- Freed allowance: lift a cap pause for this month if the provider is under the cap again.
  select * into v_provider from public.providers where id = v_req.provider_id for update;
  select count(*) into v_used from public.requests
   where provider_id = v_provider.id and billing_month = private.current_billing_month() and not is_invalid;
  if p_invalid and v_provider.requests_paused and v_provider.paused_reason = 'cap_reached' and v_used < v_provider.monthly_cap then
    update public.providers set requests_paused = false, paused_reason = null, paused_at = null where id = v_provider.id;
  end if;

  perform private.refresh_avg_response(v_provider.id);
  return private.result(true, 'OK', jsonb_build_object('used', v_used, 'cap', v_provider.monthly_cap));
end;
$$;

create or replace function public.admin_set_request_invalid(p_request_id uuid, p_invalid boolean, p_reason text default null)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.admin_set_request_invalid(p_request_id, p_invalid, p_reason);
$$;

-- ---------------------------------------------------------------------------
-- Admin: client account status (warn, lock 7 days, suspend, restore)
-- ---------------------------------------------------------------------------
create or replace function private.admin_set_client_status(
  p_client_id uuid,
  p_status public.account_status,
  p_reset_violations boolean default false,
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
begin
  if not private.is_admin() then
    return private.result(false, 'NOT_ALLOWED');
  end if;
  select role into v_role from public.profiles where id = p_client_id;
  if v_role is null then
    return private.result(false, 'NOT_FOUND');
  end if;
  if v_role = 'admin' then
    return private.result(false, 'NOT_ALLOWED');
  end if;

  update public.profiles
     set status = p_status,
         locked_until = case when p_status = 'locked' then now() + interval '7 days' else null end,
         violation_count = case when p_reset_violations then 0 else violation_count end
   where id = p_client_id;

  insert into public.abuse_flags (client_id, type, details, status, resolved_by, resolved_at)
  values (p_client_id, 'manual',
          jsonb_build_object('action', 'set_status', 'status', p_status, 'reset_violations', p_reset_violations,
                             'note', nullif(left(btrim(coalesce(p_note, '')), 500), ''), 'admin_id', v_uid),
          'resolved', v_uid, now());
  return private.result(true, 'OK');
end;
$$;

create or replace function public.admin_set_client_status(
  p_client_id uuid,
  p_status public.account_status,
  p_reset_violations boolean default false,
  p_note text default null
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.admin_set_client_status(p_client_id, p_status, p_reset_violations, p_note);
$$;

-- ---------------------------------------------------------------------------
-- Admin: resolve or dismiss an abuse flag
-- ---------------------------------------------------------------------------
create or replace function private.admin_resolve_flag(p_flag_id uuid, p_status public.abuse_flag_status)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    return private.result(false, 'NOT_ALLOWED');
  end if;
  update public.abuse_flags
     set status = p_status,
         resolved_by = case when p_status = 'open' then null else auth.uid() end,
         resolved_at = case when p_status = 'open' then null else now() end
   where id = p_flag_id;
  if not found then
    return private.result(false, 'NOT_FOUND');
  end if;
  return private.result(true, 'OK');
end;
$$;

create or replace function public.admin_resolve_flag(p_flag_id uuid, p_status public.abuse_flag_status)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.admin_resolve_flag(p_flag_id, p_status);
$$;

-- ---------------------------------------------------------------------------
-- Admin: provider listing, admin pause, plan and included requests
-- ---------------------------------------------------------------------------
create or replace function private.admin_update_provider(
  p_provider_id uuid,
  p_is_listed boolean default null,
  p_admin_pause boolean default null,
  p_plan public.plan_type default null,
  p_monthly_cap int default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_provider public.providers%rowtype;
begin
  if not private.is_admin() then
    return private.result(false, 'NOT_ALLOWED');
  end if;
  select * into v_provider from public.providers where id = p_provider_id for update;
  if not found then
    return private.result(false, 'NOT_FOUND');
  end if;
  if p_monthly_cap is not null and (p_monthly_cap < 0 or p_monthly_cap > 1000) then
    return private.result(false, 'INVALID_INPUT');
  end if;

  update public.providers
     set is_listed = coalesce(p_is_listed, is_listed),
         plan = coalesce(p_plan, plan),
         monthly_cap = coalesce(p_monthly_cap, monthly_cap),
         requests_paused = case
           when p_admin_pause is true then true
           when p_admin_pause is false and paused_reason = 'admin' then false
           else requests_paused end,
         paused_reason = case
           when p_admin_pause is true then 'admin'::public.paused_reason
           when p_admin_pause is false and paused_reason = 'admin' then null
           else paused_reason end,
         paused_at = case
           when p_admin_pause is true then now()
           when p_admin_pause is false and paused_reason = 'admin' then null
           else paused_at end
   where id = p_provider_id;
  return private.result(true, 'OK');
end;
$$;

create or replace function public.admin_update_provider(
  p_provider_id uuid,
  p_is_listed boolean default null,
  p_admin_pause boolean default null,
  p_plan public.plan_type default null,
  p_monthly_cap int default null
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.admin_update_provider(p_provider_id, p_is_listed, p_admin_pause, p_plan, p_monthly_cap);
$$;

-- ---------------------------------------------------------------------------
-- Admin: app_settings is editable by admins only (RLS + column grant)
-- ---------------------------------------------------------------------------
create policy "app_settings admin update" on public.app_settings
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

grant update (
  request_expiry_days, included_requests, beta_open, beta_signup_deadline, ga_launch_date,
  beta_monthly_cents, beta_setup_cents, beta_overage_cents, std_monthly_cents, std_setup_cents,
  std_overage_cents, beta_capacity, founding_lock_months, fairness_statement_version, fairness_statement
) on public.app_settings to authenticated;

-- ---------------------------------------------------------------------------
-- Beta metrics
-- ---------------------------------------------------------------------------
create or replace function private.admin_metrics()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_month date := private.current_billing_month();
  v_result jsonb;
begin
  if not private.is_admin() then
    return private.result(false, 'NOT_ALLOWED');
  end if;

  with active_providers as (
    select pr.id, pr.monthly_cap, pr.overage_opt_in, pr.plan
      from public.providers pr
     where pr.onboarded_at is not null
  ),
  month_usage as (
    select ap.id, ap.monthly_cap, ap.overage_opt_in,
           count(r.id) filter (where r.billing_month = v_month and not r.is_invalid) as used
      from active_providers ap
      left join public.requests r on r.provider_id = ap.id
     group by ap.id, ap.monthly_cap, ap.overage_opt_in
  ),
  weekly as (
    select r.provider_id, date_trunc('week', r.created_at) as wk, count(*) as n
      from public.requests r
     where not r.is_invalid and r.created_at > now() - interval '12 weeks'
     group by 1, 2
  ),
  monthly as (
    select r.provider_id, r.billing_month, count(*) as n
      from public.requests r
     where not r.is_invalid and r.billing_month > (v_month - interval '12 months')
     group by 1, 2
  ),
  outcomes as (
    select coalesce(r.client_outcome, r.outcome) as o
      from public.requests r
     where r.status <> 'active' and not r.is_invalid and coalesce(r.client_outcome, r.outcome) is not null
  )
  select jsonb_build_object(
    'ok', true,
    'providers_total', (select count(*) from active_providers),
    'providers_beta', (select count(*) from active_providers where plan = 'beta'),
    'clients_total', (select count(*) from public.profiles where role = 'client'),
    'requests_total', (select count(*) from public.requests where not is_invalid),
    'requests_this_month', (select count(*) from public.requests where billing_month = v_month and not is_invalid),
    'requests_active', (select count(*) from public.requests where status = 'active'),
    'requests_invalid', (select count(*) from public.requests where is_invalid),
    'avg_per_provider_week', (select round(avg(n)::numeric, 2) from weekly),
    'avg_per_provider_month', (select round(avg(n)::numeric, 2) from monthly),
    'pct_hit_cap_this_month', (
      select case when count(*) = 0 then null
                  else round(100.0 * count(*) filter (where monthly_cap > 0 and used >= monthly_cap) / count(*), 1) end
        from month_usage),
    'pct_overage_opt_in', (
      select case when count(*) = 0 then null
                  else round(100.0 * count(*) filter (where overage_opt_in) / count(*), 1) end
        from active_providers),
    'overage_requests_this_month', (select count(*) from public.requests where billing_month = v_month and is_overage and not is_invalid),
    'avg_response_hours', (
      select round((avg(extract(epoch from (responded_at - created_at))) / 3600)::numeric, 1)
        from public.requests where responded_at is not null and not is_invalid),
    'outcomes_reported', (select count(*) from outcomes),
    'hire_rate_pct', (
      select case when count(*) = 0 then null
                  else round(100.0 * count(*) filter (where o = 'hired') / count(*), 1) end
        from outcomes),
    'open_flags', (select count(*) from public.abuse_flags where status = 'open'),
    'entry_link_pct', (
      select case when count(*) = 0 then null
                  else round(100.0 * count(*) filter (where entry_path = 'link') / count(*), 1) end
        from public.requests where not is_invalid),
    'monthly', (
      select coalesce(jsonb_agg(jsonb_build_object('month', m, 'requests', c, 'providers', p) order by m), '[]'::jsonb)
        from (select billing_month as m, sum(n) as c, count(*) as p from monthly group by billing_month) s),
    'per_provider_month', (
      select coalesce(jsonb_agg(jsonb_build_object('provider_id', id, 'used', used, 'cap', monthly_cap, 'overage', overage_opt_in) order by used desc), '[]'::jsonb)
        from month_usage)
  ) into v_result;
  return v_result;
end;
$$;

create or replace function public.admin_metrics()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.admin_metrics();
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke all on function private.provider_mark_request(uuid, text) from public, anon;
revoke all on function private.admin_set_request_invalid(uuid, boolean, text) from public, anon;
revoke all on function private.admin_set_client_status(uuid, public.account_status, boolean, text) from public, anon;
revoke all on function private.admin_resolve_flag(uuid, public.abuse_flag_status) from public, anon;
revoke all on function private.admin_update_provider(uuid, boolean, boolean, public.plan_type, int) from public, anon;
revoke all on function private.admin_metrics() from public, anon;
grant execute on function private.provider_mark_request(uuid, text) to authenticated;
grant execute on function private.admin_set_request_invalid(uuid, boolean, text) to authenticated;
grant execute on function private.admin_set_client_status(uuid, public.account_status, boolean, text) to authenticated;
grant execute on function private.admin_resolve_flag(uuid, public.abuse_flag_status) to authenticated;
grant execute on function private.admin_update_provider(uuid, boolean, boolean, public.plan_type, int) to authenticated;
grant execute on function private.admin_metrics() to authenticated;

revoke all on function public.provider_mark_request(uuid, text) from public, anon;
revoke all on function public.admin_set_request_invalid(uuid, boolean, text) from public, anon;
revoke all on function public.admin_set_client_status(uuid, public.account_status, boolean, text) from public, anon;
revoke all on function public.admin_resolve_flag(uuid, public.abuse_flag_status) from public, anon;
revoke all on function public.admin_update_provider(uuid, boolean, boolean, public.plan_type, int) from public, anon;
revoke all on function public.admin_metrics() from public, anon;
grant execute on function public.provider_mark_request(uuid, text) to authenticated;
grant execute on function public.admin_set_request_invalid(uuid, boolean, text) to authenticated;
grant execute on function public.admin_set_client_status(uuid, public.account_status, boolean, text) to authenticated;
grant execute on function public.admin_resolve_flag(uuid, public.abuse_flag_status) to authenticated;
grant execute on function public.admin_update_provider(uuid, boolean, boolean, public.plan_type, int) to authenticated;
grant execute on function public.admin_metrics() to authenticated;

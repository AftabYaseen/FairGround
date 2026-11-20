-- 001_core_schema
-- FairGround core schema: enums, tables, indexes, triggers, RLS, helpers, settings, seed.
--
-- Security model
--   * Every table has RLS enabled with policies written here.
--   * Privileged logic lives in the `private` schema, which is NOT exposed through the
--     Data API. Public RPC entry points (added in later migrations) are thin
--     SECURITY INVOKER wrappers around private SECURITY DEFINER functions.
--   * Protected columns (role, status, verification, billing, ...) are guarded by
--     BEFORE UPDATE triggers that reject changes made by the `authenticated` / `anon`
--     roles. Admin writes go through server code using the secret key (service_role)
--     after a server-side role check, or through definer functions.

create extension if not exists pg_trgm with schema extensions;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('admin', 'provider', 'client');
create type public.account_status as enum ('active', 'warned', 'locked', 'suspended');
create type public.request_status as enum (
  'active', 'declined', 'completed', 'closed_by_provider', 'closed_by_client', 'expired', 'closed_by_admin'
);
create type public.request_outcome as enum ('hired', 'not_hired', 'no_response');
create type public.entry_path as enum ('link', 'browse');
create type public.plan_type as enum ('beta', 'standard');
create type public.paused_reason as enum ('manual', 'cap_reached', 'billing', 'admin');
create type public.billing_status as enum ('not_started', 'active', 'past_due', 'canceled');
create type public.request_event_type as enum (
  'created', 'viewed', 'responded', 'declined', 'completed', 'closed', 'expired', 'admin_action'
);
create type public.abuse_flag_type as enum ('duplicate_job', 'rate_limit', 'shared_device', 'multi_account', 'manual');
create type public.abuse_flag_status as enum ('open', 'resolved', 'dismissed');

-- ---------------------------------------------------------------------------
-- Generic helpers
-- ---------------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- True when the current statement comes from an end user through the Data API.
create or replace function private.is_end_user()
returns boolean
language sql
stable
set search_path = ''
as $$
  select current_user in ('authenticated', 'anon');
$$;

-- ---------------------------------------------------------------------------
-- app_settings (single row)
-- ---------------------------------------------------------------------------
create table public.app_settings (
  id boolean primary key default true check (id),
  request_expiry_days int not null default 10 check (request_expiry_days between 1 and 90),
  included_requests int not null default 15 check (included_requests between 0 and 1000),
  beta_open boolean not null default true,
  beta_signup_deadline date,
  ga_launch_date date,
  beta_monthly_cents int not null default 3900 check (beta_monthly_cents >= 0),
  beta_setup_cents int not null default 0 check (beta_setup_cents >= 0),
  beta_overage_cents int not null default 800 check (beta_overage_cents >= 0),
  std_monthly_cents int not null default 5900 check (std_monthly_cents >= 0),
  std_setup_cents int not null default 7900 check (std_setup_cents >= 0),
  std_overage_cents int not null default 1000 check (std_overage_cents >= 0),
  beta_capacity int not null default 250 check (beta_capacity >= 0),
  founding_lock_months int not null default 12 check (founding_lock_months >= 0),
  fairness_statement_version int not null default 1 check (fairness_statement_version >= 1),
  fairness_statement text not null default 'FairGround is built to treat service providers fairly. You may submit one active request to one provider at a time. If a provider cannot complete a job, you may submit a new request after closing the current one.',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger app_settings_updated_at before update on public.app_settings
  for each row execute function private.set_updated_at();
insert into public.app_settings (id) values (true);

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null default 'client',
  full_name text not null default '' check (char_length(full_name) <= 120),
  email text not null,
  phone text check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$'),
  phone_verified_at timestamptz,
  status public.account_status not null default 'active',
  locked_until timestamptz,
  violation_count int not null default 0 check (violation_count >= 0),
  device_fingerprint text check (device_fingerprint is null or char_length(device_fingerprint) <= 128),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- One account per (verified) phone number. Email uniqueness is enforced by Supabase Auth.
create unique index profiles_verified_phone_key on public.profiles (phone) where phone_verified_at is not null;
create index profiles_device_fingerprint_idx on public.profiles (device_fingerprint) where device_fingerprint is not null;
create index profiles_email_lower_idx on public.profiles (lower(email));
create index profiles_role_idx on public.profiles (role);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();

-- Role helpers (SECURITY DEFINER so they can be used inside RLS policies without recursion)
create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin'
  );
$$;

create or replace function private.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role from public.profiles p where p.id = (select auth.uid());
$$;

-- Users may only change their own display name. Everything else is set by the system.
create or replace function private.protect_profile_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.is_end_user() then
    if new.id is distinct from old.id
      or new.role is distinct from old.role
      or new.email is distinct from old.email
      or new.phone is distinct from old.phone
      or new.phone_verified_at is distinct from old.phone_verified_at
      or new.status is distinct from old.status
      or new.locked_until is distinct from old.locked_until
      or new.violation_count is distinct from old.violation_count
      or new.device_fingerprint is distinct from old.device_fingerprint
      or new.created_at is distinct from old.created_at then
      raise exception 'Not allowed to change protected profile fields' using errcode = '42501';
    end if;
  end if;

  -- The admin role can only be granted with direct SQL by the database owner.
  if new.role = 'admin' and old.role is distinct from 'admin'
     and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'The admin role can only be granted directly in the database' using errcode = '42501';
  end if;

  -- Changing the phone number always clears verification.
  if new.phone is distinct from old.phone and new.phone_verified_at is not distinct from old.phone_verified_at then
    new.phone_verified_at := null;
  end if;
  return new;
end;
$$;
create trigger profiles_protect_columns before update on public.profiles
  for each row execute function private.protect_profile_columns();

-- ---------------------------------------------------------------------------
-- service_categories
-- ---------------------------------------------------------------------------
create table public.service_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 2 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger service_categories_updated_at before update on public.service_categories
  for each row execute function private.set_updated_at();

insert into public.service_categories (name, slug, sort_order) values
  ('General Contracting', 'general-contracting', 10),
  ('Plumbing', 'plumbing', 20),
  ('Electrical', 'electrical', 30),
  ('HVAC', 'hvac', 40),
  ('Roofing', 'roofing', 50),
  ('Painting', 'painting', 60),
  ('Flooring', 'flooring', 70),
  ('Landscaping', 'landscaping', 80),
  ('Cleaning', 'cleaning', 90),
  ('Handyman', 'handyman', 100),
  ('Pest Control', 'pest-control', 110),
  ('Moving', 'moving', 120),
  ('Pool and Spa', 'pool-and-spa', 130),
  ('Appliance Repair', 'appliance-repair', 140),
  ('Facilities Maintenance', 'facilities-maintenance', 150),
  ('Commercial Cleaning', 'commercial-cleaning', 160),
  ('Security Services', 'security-services', 170),
  ('Consulting', 'consulting', 180),
  ('Other', 'other', 1000);

-- ---------------------------------------------------------------------------
-- providers
-- ---------------------------------------------------------------------------
create table public.providers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles (id) on delete cascade,
  business_name text not null check (char_length(business_name) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 70),
  tagline text check (tagline is null or char_length(tagline) <= 160),
  description text check (description is null or char_length(description) <= 4000),
  logo_url text check (logo_url is null or char_length(logo_url) <= 500),
  phone_public text check (phone_public is null or char_length(phone_public) <= 30),
  website text check (website is null or char_length(website) <= 300),
  city text check (city is null or char_length(city) <= 80),
  state text check (state is null or char_length(state) <= 40),
  service_zips text[] not null default '{}' check (cardinality(service_zips) <= 200),
  years_in_business int check (years_in_business is null or years_in_business between 0 and 200),
  typical_jobs text check (typical_jobs is null or char_length(typical_jobs) <= 1000),
  is_listed boolean not null default true,
  onboarded_at timestamptz,
  requests_paused boolean not null default false,
  paused_reason public.paused_reason,
  paused_at timestamptz,
  monthly_cap int not null default 15 check (monthly_cap >= 0),
  overage_opt_in boolean not null default false,
  plan public.plan_type not null default 'beta',
  plan_price_locked_until date,
  billing_status public.billing_status not null default 'not_started',
  avg_response_hours numeric(8, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint providers_pause_reason_consistent check (
    (requests_paused and paused_reason is not null) or (not requests_paused and paused_reason is null)
  )
);
create index providers_service_zips_idx on public.providers using gin (service_zips);
create index providers_directory_idx on public.providers (is_listed, onboarded_at);

create trigger providers_updated_at before update on public.providers
  for each row execute function private.set_updated_at();

create or replace function private.current_provider_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select pr.id from public.providers pr where pr.profile_id = (select auth.uid());
$$;

create or replace function private.slugify(v text)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    nullif(trim(both '-' from regexp_replace(lower(coalesce(v, '')), '[^a-z0-9]+', '-', 'g')), ''),
    'provider'
  );
$$;

create or replace function private.unique_provider_slug(v_name text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  base text := trim(both '-' from left(private.slugify(v_name), 60));
  candidate text;
  n int := 1;
begin
  if base = '' then base := 'provider'; end if;
  candidate := base;
  while exists (select 1 from public.providers where slug = candidate) loop
    n := n + 1;
    candidate := base || '-' || n;
  end loop;
  return candidate;
end;
$$;

-- On insert: system decides slug, plan, cap and billing fields.
create or replace function private.provider_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.app_settings%rowtype;
begin
  select * into s from public.app_settings where id;

  if new.slug is null or new.slug = '' or private.is_end_user() then
    new.slug := private.unique_provider_slug(new.business_name);
  end if;

  if private.is_end_user() then
    new.monthly_cap := s.included_requests;
    new.plan := case when s.beta_open then 'beta'::public.plan_type else 'standard'::public.plan_type end;
    new.plan_price_locked_until := case
      when s.beta_open then (current_date + make_interval(months => s.founding_lock_months))::date
      else null end;
    new.billing_status := 'not_started';
    new.is_listed := true;
    new.avg_response_hours := null;
    new.requests_paused := false;
    new.paused_reason := null;
    new.paused_at := null;
  end if;
  return new;
end;
$$;
create trigger providers_defaults before insert on public.providers
  for each row execute function private.provider_defaults();

-- On update by the provider: protect system fields and enforce pause rules.
create or replace function private.protect_provider_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  month_start timestamptz := date_trunc('month', now() at time zone 'utc') at time zone 'utc';
begin
  if not private.is_end_user() then
    return new;
  end if;

  if new.id is distinct from old.id
    or new.profile_id is distinct from old.profile_id
    or new.slug is distinct from old.slug
    or new.is_listed is distinct from old.is_listed
    or new.monthly_cap is distinct from old.monthly_cap
    or new.plan is distinct from old.plan
    or new.plan_price_locked_until is distinct from old.plan_price_locked_until
    or new.billing_status is distinct from old.billing_status
    or new.avg_response_hours is distinct from old.avg_response_hours
    or new.created_at is distinct from old.created_at then
    raise exception 'Not allowed to change protected provider fields' using errcode = '42501';
  end if;

  -- Opting in to overage lifts a cap pause straight away.
  if new.overage_opt_in and not old.overage_opt_in
     and old.requests_paused and old.paused_reason = 'cap_reached'
     and new.requests_paused is not distinct from old.requests_paused then
    new.requests_paused := false;
  end if;

  if new.requests_paused and not old.requests_paused then
    -- Provider pauses: always a manual pause.
    new.paused_reason := 'manual';
    new.paused_at := now();
  elsif not new.requests_paused and old.requests_paused then
    -- Provider resumes.
    if old.paused_reason = 'manual'
       or (old.paused_reason = 'cap_reached' and (new.overage_opt_in or old.paused_at < month_start)) then
      new.paused_reason := null;
      new.paused_at := null;
    elsif old.paused_reason = 'cap_reached' then
      raise exception 'CAP_REACHED: You have used all included requests this month. Opt in to extra requests or wait until next month.'
        using errcode = 'P0001';
    else
      raise exception 'PAUSE_LOCKED: This pause was set by FairGround and can only be lifted by an admin.'
        using errcode = 'P0001';
    end if;
  else
    -- No change to the paused flag: the reason and timestamp stay as they were.
    new.paused_reason := old.paused_reason;
    new.paused_at := old.paused_at;
  end if;
  return new;
end;
$$;
create trigger providers_protect_columns before update on public.providers
  for each row execute function private.protect_provider_columns();

-- ---------------------------------------------------------------------------
-- provider_categories
-- ---------------------------------------------------------------------------
create table public.provider_categories (
  provider_id uuid not null references public.providers (id) on delete cascade,
  category_id uuid not null references public.service_categories (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (provider_id, category_id)
);
create index provider_categories_category_idx on public.provider_categories (category_id);

-- ---------------------------------------------------------------------------
-- fairness_acknowledgements
-- ---------------------------------------------------------------------------
create table public.fairness_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles (id) on delete cascade,
  statement_version int not null check (statement_version >= 1),
  accepted_at timestamptz not null default now(),
  ip text check (ip is null or char_length(ip) <= 64),
  user_agent text check (user_agent is null or char_length(user_agent) <= 500),
  created_at timestamptz not null default now()
);
create index fairness_ack_client_idx on public.fairness_acknowledgements (client_id, statement_version);

-- ---------------------------------------------------------------------------
-- requests
-- ---------------------------------------------------------------------------
create table public.requests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles (id) on delete restrict,
  provider_id uuid not null references public.providers (id) on delete restrict,
  category_id uuid not null references public.service_categories (id) on delete restrict,
  title text not null check (char_length(title) between 3 and 120),
  description text not null check (char_length(description) between 20 and 4000),
  zip text not null check (zip ~ '^[0-9]{5}$'),
  city text check (city is null or char_length(city) <= 80),
  preferred_timing text check (preferred_timing is null or char_length(preferred_timing) <= 80),
  contact_name text not null check (char_length(contact_name) between 2 and 120),
  contact_email text not null,
  contact_phone text not null,
  entry_path public.entry_path not null,
  status public.request_status not null default 'active',
  outcome public.request_outcome,
  outcome_note text check (outcome_note is null or char_length(outcome_note) <= 1000),
  client_outcome public.request_outcome,
  client_outcome_at timestamptz,
  is_overage boolean not null default false,
  is_invalid boolean not null default false,
  invalid_reason text check (invalid_reason is null or char_length(invalid_reason) <= 500),
  invalid_at timestamptz,
  invalid_by uuid references public.profiles (id) on delete set null,
  billing_month date not null,
  fingerprint text not null,
  device_fingerprint text,
  ip text,
  user_agent text,
  expires_at timestamptz not null,
  viewed_at timestamptz,
  responded_at timestamptz,
  closed_at timestamptz,
  closed_by uuid references public.profiles (id) on delete set null,
  closed_notified_at timestamptz,
  followup_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Rule 1: one active request per client, platform wide.
create unique index requests_one_active_per_client on public.requests (client_id) where status = 'active';
create index requests_fingerprint_trgm_idx on public.requests using gin (fingerprint extensions.gin_trgm_ops);
create index requests_client_created_idx on public.requests (client_id, created_at desc);
create index requests_provider_month_idx on public.requests (provider_id, billing_month);
create index requests_provider_created_idx on public.requests (provider_id, created_at desc);
create index requests_active_expiry_idx on public.requests (expires_at) where status = 'active';
create index requests_category_idx on public.requests (category_id);
create index requests_closed_by_idx on public.requests (closed_by);
create index requests_invalid_by_idx on public.requests (invalid_by);

create trigger requests_updated_at before update on public.requests
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- request_events (audit trail)
-- ---------------------------------------------------------------------------
create table public.request_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  event public.request_event_type not null,
  note text check (note is null or char_length(note) <= 1000),
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index request_events_request_idx on public.request_events (request_id, created_at);
create index request_events_actor_idx on public.request_events (actor_id);

-- ---------------------------------------------------------------------------
-- abuse_flags
-- ---------------------------------------------------------------------------
create table public.abuse_flags (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles (id) on delete cascade,
  type public.abuse_flag_type not null,
  details jsonb not null default '{}'::jsonb,
  status public.abuse_flag_status not null default 'open',
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index abuse_flags_client_idx on public.abuse_flags (client_id);
create index abuse_flags_status_idx on public.abuse_flags (status, created_at desc);
create index abuse_flags_resolved_by_idx on public.abuse_flags (resolved_by);
create trigger abuse_flags_updated_at before update on public.abuse_flags
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- rate_limits
-- ---------------------------------------------------------------------------
create table public.rate_limits (
  id uuid primary key default gen_random_uuid(),
  key text not null check (char_length(key) <= 300),
  window_start timestamptz not null,
  count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (key, window_start)
);
create index rate_limits_window_idx on public.rate_limits (window_start);
create trigger rate_limits_updated_at before update on public.rate_limits
  for each row execute function private.set_updated_at();

-- Fixed-window counter. Returns true when the call is within the limit.
create or replace function private.hit_rate_limit(p_key text, p_window_seconds int, p_max int)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_count int;
begin
  insert into public.rate_limits as rl (key, window_start, count)
  values (p_key, v_window, 1)
  on conflict (key, window_start) do update set count = rl.count + 1
  returning rl.count into v_count;
  return v_count <= p_max;
end;
$$;

-- Server-side (service_role only) entry point, used for sign-up limits by IP and device.
create or replace function public.hit_rate_limit(p_key text, p_window_seconds int, p_max int)
returns boolean
language sql
set search_path = ''
as $$
  select private.hit_rate_limit(p_key, p_window_seconds, p_max);
$$;

-- ---------------------------------------------------------------------------
-- notifications_log
-- ---------------------------------------------------------------------------
create table public.notifications_log (
  id uuid primary key default gen_random_uuid(),
  to_email text not null,
  template text not null,
  related_id uuid,
  status text not null check (status in ('sent', 'failed', 'skipped')),
  error text,
  created_at timestamptz not null default now()
);
create index notifications_log_related_idx on public.notifications_log (related_id);
create index notifications_log_created_idx on public.notifications_log (created_at desc);

-- ---------------------------------------------------------------------------
-- Abuse: escalation ladder
-- ---------------------------------------------------------------------------
-- Inserts a flag. When p_escalate is true it also applies the ladder:
--   1st violation: warned, 2nd: locked for 7 days, 3rd+: suspended.
create or replace function private.record_violation(
  p_client_id uuid,
  p_type public.abuse_flag_type,
  p_details jsonb default '{}'::jsonb,
  p_escalate boolean default true
)
returns public.account_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
  v_status public.account_status;
begin
  insert into public.abuse_flags (client_id, type, details) values (p_client_id, p_type, coalesce(p_details, '{}'::jsonb));

  if not p_escalate then
    select status into v_status from public.profiles where id = p_client_id;
    return v_status;
  end if;

  update public.profiles
     set violation_count = violation_count + 1
   where id = p_client_id
  returning violation_count into v_count;

  if v_count is null then
    return null;
  elsif v_count = 1 then
    v_status := 'warned';
    update public.profiles set status = 'warned' where id = p_client_id and status = 'active';
  elsif v_count = 2 then
    v_status := 'locked';
    update public.profiles set status = 'locked', locked_until = now() + interval '7 days'
     where id = p_client_id and status <> 'suspended';
  else
    v_status := 'suspended';
    update public.profiles set status = 'suspended', locked_until = null where id = p_client_id;
  end if;
  return v_status;
end;
$$;

-- ---------------------------------------------------------------------------
-- Auth user -> profile
-- ---------------------------------------------------------------------------
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.user_role;
  v_phone text := nullif(new.raw_user_meta_data ->> 'phone', '');
  v_fp text := left(nullif(new.raw_user_meta_data ->> 'device_fingerprint', ''), 128);
begin
  -- Only provider or client can come from sign-up metadata. Never admin.
  v_role := case
    when new.raw_user_meta_data ->> 'role' = 'provider' then 'provider'::public.user_role
    else 'client'::public.user_role
  end;
  if v_phone is not null and v_phone !~ '^\+[1-9][0-9]{7,14}$' then
    v_phone := null;
  end if;

  insert into public.profiles (id, role, full_name, email, phone, device_fingerprint)
  values (
    new.id,
    v_role,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120),
    coalesce(new.email, ''),
    v_phone,
    v_fp
  );
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

create or replace function private.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = coalesce(new.email, '') where id = new.id;
  return new;
end;
$$;
create trigger on_auth_user_email_changed after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function private.handle_user_email_change();

-- Flag accounts that share a device fingerprint with a suspended account.
create or replace function private.check_shared_device()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match uuid;
begin
  if new.device_fingerprint is null then
    return new;
  end if;
  select p.id into v_match
    from public.profiles p
   where p.device_fingerprint = new.device_fingerprint
     and p.status = 'suspended'
     and p.id <> new.id
   limit 1;
  if v_match is not null then
    perform private.record_violation(
      new.id, 'shared_device',
      jsonb_build_object('matched_profile_id', v_match, 'device_fingerprint', new.device_fingerprint),
      false
    );
  end if;
  return new;
end;
$$;
create trigger profiles_check_shared_device_ins after insert on public.profiles
  for each row execute function private.check_shared_device();
create trigger profiles_check_shared_device_upd after update of device_fingerprint on public.profiles
  for each row when (old.device_fingerprint is distinct from new.device_fingerprint)
  execute function private.check_shared_device();

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------
revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function private.is_admin() to anon, authenticated, service_role;
grant execute on function private.current_user_role() to anon, authenticated, service_role;
grant execute on function private.current_provider_id() to anon, authenticated, service_role;
grant execute on function private.is_end_user() to anon, authenticated, service_role;
grant execute on function private.hit_rate_limit(text, int, int) to service_role;

revoke all on function public.hit_rate_limit(text, int, int) from public, anon, authenticated;
grant execute on function public.hit_rate_limit(text, int, int) to service_role;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.app_settings enable row level security;
alter table public.profiles enable row level security;
alter table public.service_categories enable row level security;
alter table public.providers enable row level security;
alter table public.provider_categories enable row level security;
alter table public.fairness_acknowledgements enable row level security;
alter table public.requests enable row level security;
alter table public.request_events enable row level security;
alter table public.abuse_flags enable row level security;
alter table public.rate_limits enable row level security;
alter table public.notifications_log enable row level security;

-- Table privileges (defence in depth on top of RLS)
revoke all on public.profiles, public.fairness_acknowledgements, public.requests, public.request_events,
  public.abuse_flags, public.rate_limits, public.notifications_log from anon;
revoke insert, update, delete on public.app_settings, public.service_categories from anon, authenticated;
revoke insert, delete on public.profiles from authenticated;
revoke insert, update, delete on public.requests, public.request_events, public.abuse_flags,
  public.rate_limits, public.notifications_log from authenticated;
revoke update, delete on public.fairness_acknowledgements from authenticated;
revoke delete on public.providers from authenticated;
revoke insert, update, delete on public.providers, public.provider_categories from anon;

-- Anonymous visitors only see public provider columns.
revoke select on public.providers from anon;
grant select (
  id, business_name, slug, tagline, description, logo_url, phone_public, website, city, state,
  service_zips, years_in_business, typical_jobs, is_listed, onboarded_at, requests_paused,
  avg_response_hours, created_at
) on public.providers to anon;

-- app_settings: public read (pricing and dates are shown on marketing pages)
create policy "app_settings readable by everyone" on public.app_settings
  for select to anon, authenticated using (true);

-- profiles
create policy "profiles select own or admin" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select private.is_admin()));
create policy "profiles update own" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- service_categories
create policy "categories readable by anon" on public.service_categories
  for select to anon using (is_active);
create policy "categories readable by users" on public.service_categories
  for select to authenticated using (is_active or (select private.is_admin()));

-- providers
create policy "providers listed readable by anon" on public.providers
  for select to anon using (is_listed and onboarded_at is not null);
create policy "providers readable by users" on public.providers
  for select to authenticated
  using (
    (is_listed and onboarded_at is not null)
    or profile_id = (select auth.uid())
    or (select private.is_admin())
  );
create policy "providers insert own" on public.providers
  for insert to authenticated
  with check (profile_id = (select auth.uid()) and (select private.current_user_role()) = 'provider');
create policy "providers update own" on public.providers
  for update to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

-- provider_categories
create policy "provider categories readable" on public.provider_categories
  for select to anon, authenticated using (true);
create policy "provider categories insert own" on public.provider_categories
  for insert to authenticated with check (provider_id = (select private.current_provider_id()));
create policy "provider categories delete own" on public.provider_categories
  for delete to authenticated using (provider_id = (select private.current_provider_id()));

-- fairness_acknowledgements
create policy "acks select own or admin" on public.fairness_acknowledgements
  for select to authenticated
  using (client_id = (select auth.uid()) or (select private.is_admin()));
create policy "acks insert own as client" on public.fairness_acknowledgements
  for insert to authenticated
  with check (client_id = (select auth.uid()) and (select private.current_user_role()) = 'client');

-- requests: read only. Creation and status changes go through definer functions.
create policy "requests select participants or admin" on public.requests
  for select to authenticated
  using (
    client_id = (select auth.uid())
    or provider_id = (select private.current_provider_id())
    or (select private.is_admin())
  );

-- request_events: visible to whoever can see the request
create policy "request events select participants or admin" on public.request_events
  for select to authenticated
  using (
    (select private.is_admin())
    or exists (
      select 1 from public.requests r
       where r.id = request_events.request_id
         and (r.client_id = (select auth.uid()) or r.provider_id = (select private.current_provider_id()))
    )
  );

-- admin-only tables
create policy "abuse flags admin read" on public.abuse_flags
  for select to authenticated using ((select private.is_admin()));
create policy "rate limits admin read" on public.rate_limits
  for select to authenticated using ((select private.is_admin()));
create policy "notifications admin read" on public.notifications_log
  for select to authenticated using ((select private.is_admin()));

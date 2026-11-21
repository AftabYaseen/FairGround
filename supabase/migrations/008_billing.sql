-- 008_billing
-- Authorize.net billing: customer profiles (CIM), ARB subscriptions, one-off charges
-- (setup fee, month-end extra requests), invoices and a webhook event log.
-- Card data never reaches FairGround: Accept.js tokenises it in the browser and only
-- the brand, last 4 digits and expiry are stored here.
-- All writes to these tables happen on the server with the secret key (service_role).

create type public.invoice_kind as enum ('setup_fee', 'subscription', 'overage');
create type public.invoice_status as enum ('pending', 'paid', 'failed', 'void');

-- When true, providers without an active subscription are paused (reason: billing).
alter table public.app_settings add column billing_required boolean not null default false;
grant update (billing_required) on public.app_settings to authenticated;

-- Price agreed for each extra request, captured when the request arrives.
alter table public.requests add column overage_price_cents int check (overage_price_cents is null or overage_price_cents >= 0);

-- ---------------------------------------------------------------------------
-- billing_accounts: one per provider
-- ---------------------------------------------------------------------------
create table public.billing_accounts (
  provider_id uuid primary key references public.providers (id) on delete cascade,
  authnet_customer_profile_id text,
  authnet_payment_profile_id text,
  arb_subscription_id text unique,
  subscription_status text check (subscription_status is null or subscription_status in ('active', 'suspended', 'canceled', 'terminated', 'expired')),
  subscription_amount_cents int check (subscription_amount_cents is null or subscription_amount_cents >= 0),
  subscription_started_on date,
  paid_through date,
  card_brand text check (card_brand is null or char_length(card_brand) <= 40),
  card_last4 text check (card_last4 is null or card_last4 ~ '^[0-9]{4}$'),
  card_exp text check (card_exp is null or char_length(card_exp) <= 10),
  consent_at timestamptz,
  consent_ip text,
  consent_text text check (consent_text is null or char_length(consent_text) <= 2000),
  scheduled_amount_cents int check (scheduled_amount_cents is null or scheduled_amount_cents >= 0),
  scheduled_change_on date,
  price_notice_sent_at timestamptz,
  canceled_at timestamptz,
  last_failure_reason text check (last_failure_reason is null or char_length(last_failure_reason) <= 500),
  last_failure_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger billing_accounts_updated_at before update on public.billing_accounts
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- invoices
-- ---------------------------------------------------------------------------
create sequence public.invoice_number_seq start 1001;

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers (id) on delete restrict,
  number text not null unique default ('FG-' || lpad(nextval('public.invoice_number_seq')::text, 6, '0')),
  kind public.invoice_kind not null,
  period_month date,
  quantity int not null default 1 check (quantity >= 1),
  unit_cents int not null check (unit_cents >= 0),
  amount_cents int not null check (amount_cents >= 0),
  description text not null check (char_length(description) <= 255),
  status public.invoice_status not null default 'pending',
  authnet_transaction_id text unique,
  authnet_subscription_id text,
  failure_reason text check (failure_reason is null or char_length(failure_reason) <= 500),
  attempted_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- One overage invoice per provider per month (makes month-end billing idempotent).
create unique index invoices_one_overage_per_month on public.invoices (provider_id, period_month) where kind = 'overage';
-- The setup fee is paid at most once.
create unique index invoices_one_paid_setup_fee on public.invoices (provider_id) where kind = 'setup_fee' and status = 'paid';
create index invoices_provider_created_idx on public.invoices (provider_id, created_at desc);
create index invoices_status_idx on public.invoices (status) where status in ('pending', 'failed');
create trigger invoices_updated_at before update on public.invoices
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- billing_events: Authorize.net webhook log (idempotent on notification id)
-- ---------------------------------------------------------------------------
create table public.billing_events (
  id uuid primary key default gen_random_uuid(),
  notification_id text not null unique,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error text
);
create index billing_events_received_idx on public.billing_events (received_at desc);

-- ---------------------------------------------------------------------------
-- Snapshot the extra-request price on insert
-- ---------------------------------------------------------------------------
create or replace function private.snapshot_overage_price()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_overage and new.overage_price_cents is null then
    select case when p.plan = 'beta' then s.beta_overage_cents else s.std_overage_cents end
      into new.overage_price_cents
      from public.providers p cross join public.app_settings s
     where p.id = new.provider_id and s.id;
  end if;
  return new;
end;
$$;
create trigger requests_snapshot_overage_price before insert on public.requests
  for each row execute function private.snapshot_overage_price();

-- ---------------------------------------------------------------------------
-- billing_required: new providers start paused for billing; toggling the setting
-- pauses or releases providers who have not set up billing.
-- ---------------------------------------------------------------------------
create or replace function private.provider_defaults()
returns trigger
language plpgsql
security invoker
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
    new.monthly_cap := coalesce(s.included_requests, 15);
    new.plan := case when coalesce(s.beta_open, true) then 'beta'::public.plan_type else 'standard'::public.plan_type end;
    new.plan_price_locked_until := case
      when coalesce(s.beta_open, true) then (current_date + make_interval(months => coalesce(s.founding_lock_months, 12)))::date
      else null end;
    new.billing_status := 'not_started';
    new.is_listed := true;
    new.avg_response_hours := null;
    if coalesce(s.billing_required, false) then
      new.requests_paused := true;
      new.paused_reason := 'billing';
      new.paused_at := now();
    else
      new.requests_paused := false;
      new.paused_reason := null;
      new.paused_at := null;
    end if;
  end if;
  return new;
end;
$$;

create or replace function private.apply_billing_required()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.billing_required and not old.billing_required then
    update public.providers
       set requests_paused = true, paused_reason = 'billing', paused_at = now()
     where billing_status <> 'active' and coalesce(paused_reason::text, '') <> 'admin';
  elsif old.billing_required and not new.billing_required then
    -- Release only providers paused because they never set up billing (not failed payments).
    update public.providers
       set requests_paused = false, paused_reason = null, paused_at = null
     where paused_reason = 'billing' and billing_status = 'not_started';
  end if;
  return new;
end;
$$;
create trigger app_settings_billing_required after update of billing_required on public.app_settings
  for each row execute function private.apply_billing_required();

-- ---------------------------------------------------------------------------
-- RLS and grants
-- ---------------------------------------------------------------------------
alter table public.billing_accounts enable row level security;
alter table public.invoices enable row level security;
alter table public.billing_events enable row level security;

revoke all on public.billing_accounts, public.invoices, public.billing_events from anon, authenticated;
grant select, insert, update, delete on public.billing_accounts, public.invoices, public.billing_events to service_role;
grant usage, select on sequence public.invoice_number_seq to service_role;

-- Providers see their own billing summary, never the Authorize.net profile ids.
grant select (
  provider_id, subscription_status, subscription_amount_cents, subscription_started_on, paid_through,
  card_brand, card_last4, card_exp, scheduled_amount_cents, scheduled_change_on, canceled_at,
  last_failure_reason, last_failure_at, created_at, updated_at
) on public.billing_accounts to authenticated;
grant select on public.invoices to authenticated;
grant select on public.billing_events to authenticated;

create policy "billing accounts own or admin" on public.billing_accounts
  for select to authenticated
  using (provider_id = (select private.current_provider_id()) or (select private.is_admin()));
create policy "invoices own or admin" on public.invoices
  for select to authenticated
  using (provider_id = (select private.current_provider_id()) or (select private.is_admin()));
create policy "billing events admin read" on public.billing_events
  for select to authenticated using ((select private.is_admin()));

revoke all on function private.snapshot_overage_price() from public, anon, authenticated;
revoke all on function private.apply_billing_required() from public, anon, authenticated;

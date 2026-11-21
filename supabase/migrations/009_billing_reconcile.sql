-- 009_billing_reconcile
-- The daily billing job checks each ARB subscription with Authorize.net, oldest check first.
alter table public.billing_accounts add column last_reconciled_at timestamptz;
create index billing_accounts_reconcile_idx on public.billing_accounts (last_reconciled_at nulls first)
  where arb_subscription_id is not null;

-- 005_provider_defaults_invoker
-- provider_defaults() must run as the caller so private.is_end_user() can see that a provider
-- (not the system) is inserting. As SECURITY DEFINER it ran as the owner, so the founding-member
-- price lock was never applied. Column grants already stopped users from setting plan or cap.

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
    new.requests_paused := false;
    new.paused_reason := null;
    new.paused_at := null;
  end if;
  return new;
end;
$$;

-- The slug generator is called from the trigger as the end user.
grant execute on function private.unique_provider_slug(text) to authenticated;
grant execute on function private.slugify(text) to authenticated;

-- Backfill providers created before this fix.
update public.providers p
   set plan_price_locked_until = (p.created_at::date + make_interval(months => s.founding_lock_months))::date
  from public.app_settings s
 where p.plan = 'beta' and p.plan_price_locked_until is null;

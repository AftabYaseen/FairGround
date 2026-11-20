-- 002_api_grants
-- This project does not grant table privileges to the API roles by default, so every
-- grant is explicit and least-privilege. RLS policies (001) still decide which rows.

-- service_role: server-side admin client (bypasses RLS by design)
grant select, insert, update, delete on all tables in schema public to service_role;

-- anon: public marketing and directory data only
grant select on public.app_settings, public.service_categories, public.provider_categories to anon;
-- providers: column grant for anon was set in 001 (public columns only)

-- authenticated: reads (rows limited by RLS)
grant select on
  public.app_settings,
  public.service_categories,
  public.provider_categories,
  public.providers,
  public.profiles,
  public.fairness_acknowledgements,
  public.requests,
  public.request_events,
  public.abuse_flags,
  public.rate_limits,
  public.notifications_log
to authenticated;

-- authenticated: writes, column-limited
grant update (full_name) on public.profiles to authenticated;

grant insert (
  profile_id, business_name, tagline, description, logo_url, phone_public, website, city, state,
  service_zips, years_in_business, typical_jobs, onboarded_at
) on public.providers to authenticated;

grant update (
  business_name, tagline, description, logo_url, phone_public, website, city, state,
  service_zips, years_in_business, typical_jobs, onboarded_at, requests_paused, overage_opt_in
) on public.providers to authenticated;

grant insert, delete on public.provider_categories to authenticated;

grant insert (client_id, statement_version, ip, user_agent) on public.fairness_acknowledgements to authenticated;

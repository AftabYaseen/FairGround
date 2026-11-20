# Progress

## Phase 1: Foundation and database (done)

### What was built
- **Design system**: "Job Site" palette as CSS variables in `src/app/globals.css`, mapped into Tailwind v4 (`bg-charcoal`, `text-steel`, `bg-safety`, ...). Bricolage Grotesque (headings) and Figtree (body) through `next/font/google` as `--font-heading` / `--font-body`. A visible 2px yellow focus ring with a charcoal offset on everything. A `.safety-stripe` hazard-tape utility, used under the hero and on the highlighted pricing card.
- **UI kit** in `src/components/ui`: `Button` / `LinkButton`, `Input`, `Textarea`, `Select`, `Field`, `Checkbox`, `Card`, `Badge` (tinted tones), `Alert`, `Container`, `PageHeader`, `EmptyState`, `Stat`, `SafetyStripe`, plus the client components `SubmitButton` (pending state) and `LocalTime` (shows times in the viewer's time zone).
- **Layout**: a sticky charcoal header (with a mobile menu that needs no JavaScript), a footer with the OPAL credit, a skip link, and global `loading`, `error` and `not-found` states.
- **Home page** built from `docs/landing-page-outline.md`. Pricing, included requests and founding-lock months are read from `app_settings`. A null beta deadline shows "Limited founding spots available".
- **Supabase helpers** in `src/lib/supabase/`: `client.ts` (browser), `server.ts` (RSC and actions), `proxy.ts` (session refresh and role guards, used by `src/proxy.ts`, since Next 16 renamed middleware to proxy), and `admin.ts` (server-only, uses `SUPABASE_SECRET_KEY`).
- **Database** (`supabase/migrations/001_core_schema.sql`, `002_api_grants.sql`):
  - Every enum, table and index from the brief, including the partial unique index `requests (client_id) where status = 'active'` and a trigram index on `requests.fingerprint`.
  - RLS is enabled on every table, with policies in the same migration.
  - Privileged logic lives in a `private` schema that the Data API does not expose: `is_admin()`, `current_provider_id()`, `record_violation()` (the escalation ladder), `hit_rate_limit()`, the slug generator, and the `auth.users` to `profiles` trigger. That trigger only allows `provider` or `client` as a role; any other value becomes `client`.
  - Protection triggers: users can only change their own `full_name`. Role, status, verification, violation count and device fingerprint are system fields. The admin role can only be granted with direct SQL. Providers cannot change their slug, plan, billing, cap or listing. Pause rules are enforced in the trigger.
  - A trigger flags accounts that share a device fingerprint with a suspended account.
  - The `app_settings` single row and the 19 seeded categories are in place.
- **Types** generated into `src/types/database.ts`.

### How to test
- Run `npm run dev`, then open `/`. The home page renders the new design. Pricing comes from `app_settings`: change `beta_monthly_cents` in the table and reload to see it update.
- Database protections were verified with a rolled-back SQL session acting as `authenticated`:
  - metadata `role: admin` produced a `client` profile
  - updating `role` or `phone_verified_at` was refused
  - a direct insert into `requests` was refused
  - a client inserting a `providers` row was refused by RLS

### Notes and decisions
- **No default grants.** This Supabase project gives the API roles no table privileges by default, so `002_api_grants.sql` grants everything explicitly. Writes use column-level grants: for example, `authenticated` can only update `profiles.full_name`.
- Security advisors: clean. Performance advisors: only "unused index" notices, which are expected on an empty database.
- The `.env.example` file is committed. `.gitignore` now has `!.env.example`, while `.env*` and `.mcp.json` stay ignored.
- `CRON_SECRET` was added to `.env.example` for the Phase 5 email cron route.

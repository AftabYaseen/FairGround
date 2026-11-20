# Progress

## Phase 3: Provider profiles, link and directory (done)

### What was built
- **Onboarding wizard** (`/dashboard/onboarding`) in four steps: business details, services (up to 8 categories plus typical jobs), service area (city, state, ZIP list), and logo. If the server rejects a field, the wizard jumps back to that step. Finishing publishes the profile and lands on `/dashboard/link?welcome=1`. Every other dashboard page sends non-onboarded providers here, and sends unverified phones to `/verify-phone`.
- **Profile editing** (`/dashboard/profile`) uses the same form and the same Server Action (`saveProviderProfile`), with zod validation. Website and ZIP values are normalised, and categories are replaced as a set.
- **Logos**: Supabase Storage bucket `logos` (`003_storage_logos.sql`). Public read, PNG/JPG/WebP only, 2 MB limit. Writes are allowed only into `logos/<your user id>/`, and only by providers. Replacing a logo deletes the old file.
- **Slugs** are generated in the database from the business name, with numeric suffixes for duplicates (`acme-plumbing-heat`, then `acme-plumbing-heat-2`). Providers cannot change them, so shared links never break.
- **`/p/[slug]`**: the public profile. It shows logo, tagline, location, years in business, typical response time, services, typical jobs, service area and contact links, plus a request panel. The panel changes depending on who is viewing:
  - paused provider
  - client who already has an active request
  - visitor link-locked to a different provider
  - the provider viewing their own page
  - other providers and admins
- **Contractor link lock**: visiting `/p/[slug]` directly (the shared link) sets an `fg_link` cookie. Directory links use `?from=browse` and do not set it. While the cookie is set, the header and footer hide browse links, `/providers` redirects back to that provider, and other providers' pages show "Your request stays with that provider".
- **`/dashboard/link`**: copy link, preview, a server-generated QR code (PNG download, using the `qrcode` package), and copyable share text.
- **`/providers` directory**: filter by category and ZIP, 12 per page. It shows the notice "You may submit one active request to one provider at a time. Please review profiles carefully." Paused providers stay listed with "Not accepting requests right now" and sort after available ones.
- **Dashboard shell**: a side nav (Overview, Requests, Profile, Request link, Settings). Pages not built yet (Requests, Settings) arrive in Phase 5.

### Database changes
- `003_storage_logos.sql`: logos bucket and storage policies.
- `004_provider_slug_default.sql`: placeholder slug default, so inserts don't send a slug. The trigger always generates it.
- `005_provider_defaults_invoker.sql`: **bug fix**. The provider insert trigger ran as SECURITY DEFINER, so it never saw that an end user was inserting, and the 12-month founding price lock was not set. It now runs as the caller. Existing rows were backfilled. Column grants had already stopped providers from setting their own plan or cap.

### How to test
1. Sign up as a provider, verify your phone, and complete the wizard.
2. Open the link on `/dashboard/link` in a private window. You see only that provider. `/providers` redirects back to them.
3. In a fresh private window, open `/providers`, filter by category and ZIP, and open a provider from the list. "Back to the directory" is shown.
4. Pause the provider (Phase 5 settings, or SQL for now). The directory and profile show "Not accepting requests right now".

Automated checks against the live project (temporary data, deleted afterwards):
- Providers cannot set cap or plan on insert, change their slug, edit another provider, or add categories to another provider.
- Pause rules work: a manual pause can be resumed. An admin pause is locked (`PAUSE_LOCKED`). A cap pause is locked (`CAP_REACHED`) until the provider opts in to overage, which lifts it.
- Storage: own folder allowed. Another user's folder and client uploads are refused. Wrong MIME types are refused. Public URL returns 200. Anon cannot list files.
- Anon gets the directory query and is refused `billing_status`.
- Page checks: unknown slug returns 404. A link-locked visitor on `/providers` gets 307 to their provider. Onboarding redirects work.

### Notes
- The root `loading.tsx` was moved into the signed-in segments (dashboard, admin, my-request, request, account). That way public pages return real 404 and 307 status codes instead of streamed ones.
- Signed-in clients can read the non-public columns of listed providers, such as `billing_status`, because RLS is row-level. Anonymous visitors can't. If this matters, a later change can move billing fields to a separate owner-only table.

## Phase 2: Accounts and verification (done)

### What was built
- **Sign up** (`/signup`). The user chooses "I provide services" or "I need a service" (`?role=provider|client` preselects one), then enters name, email, mobile phone and password, and accepts the terms and fairness policy. The role, name, phone (normalised to E.164) and FingerprintJS visitor id go into the sign-up metadata. The database trigger creates the profile and can never assign `admin`.
- **Anti-circumvention at sign-up**:
  - Rate limits: 5 per hour per IP, 3 per day per device fingerprint (`rate_limits` table, `hit_rate_limit()`).
  - One account per phone: checked before sign-up, and enforced in the database by a unique index on verified phones.
  - FingerprintJS runs with `monitoring: false`, so no third-party call is made.
- **Email verification**: Supabase Auth sends the confirmation link. `/auth/callback` handles both the PKCE `code` flow and the `token_hash` flow. The response does not reveal whether an email already exists.
- **Log in / log out**: login is rate limited to 20 per 15 minutes per IP. An unconfirmed email gets a "send the link again" option.
- **Password reset**: `/forgot-password` sends the email, and `/auth/callback` then routes to `/reset-password`.
- **Phone verification** (`/verify-phone`): Twilio Verify through its REST API (`src/lib/twilio.ts`).
  - Rate limits: 5 SMS per hour per user and per number, 10 per IP, and 10 code checks per 15 minutes.
  - Verification is written with the server-only admin client, because users cannot set `phone_verified_at` themselves.
  - Re-using a number that another account has verified is refused and logged as a `multi_account` abuse flag.
  - Dev bypass: when `ALLOW_UNVERIFIED_PHONE=true` and Twilio keys are missing, no SMS is sent and any 6 digits verify. The page shows a "Development mode" notice.
- **Role-based redirects**: after login or confirmation, unverified phones go to `/verify-phone`. Then providers go to `/dashboard`, clients to `/my-request` and admins to `/admin`. `src/proxy.ts` guards `/dashboard/*` (provider), `/my-request` and `/request/*` (client), `/admin/*` (admin), and `/account` and `/verify-phone` (signed in).
- **`/account`**: edit your name, see email and phone verification status, change phone, change password, log out. Warning, lock and suspension banners appear here.

### How to test
1. Run `npm run dev`, open `/signup`, choose a role and create an account.
2. Open the email link. You land on `/verify-phone`. With the dev flag on, enter any 6 digits.
3. Providers land on `/dashboard` (a placeholder until Phase 3/5). Clients land on `/my-request` (a placeholder until Phase 4).
4. Signed out, try `/dashboard` or `/admin`: you are redirected to `/login?next=...`. Signed in as a client, `/dashboard` redirects to `/my-request`.

Automated checks run against the live project (temporary users, deleted afterwards):
- admin metadata produced `client`
- users could not set `phone_verified_at` or `role`
- even `service_role` cannot grant admin
- a second account verifying the same phone failed with `23505`
- the rate limiter allowed 3 of 4 hits
- anon cannot call `hit_rate_limit`
- every guarded route redirected correctly for anon, provider and client

### Setup needed in the Supabase dashboard (not possible through MCP)
- **Auth, URL Configuration**: set Site URL to the Vercel URL. Add `http://localhost:3000/**` and `https://fair-ground-two.vercel.app/**` to Redirect URLs, or confirmation and reset links will be rejected.
- **Auth, SMTP**: Supabase's built-in email only delivers to members of your Supabase team and is heavily rate limited. Before real users sign up, set custom SMTP (Resend provides SMTP credentials).
- Optional: point the "Confirm signup" template at `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=signup`. Confirmation then works even when the link is opened on a different device from sign-up. The PKCE default only fully signs the user in on the same browser. On another device it confirms the email and asks them to log in.

### Notes
- `ALLOW_UNVERIFIED_PHONE=true` was added to `.env.local` for local development. **Do not set it in production.** It only takes effect while Twilio keys are missing.
- Changing a verified phone number clears verification until the new number is confirmed.
- Signed-in users who open `/login` or `/signup` are redirected client-side (a streamed redirect), because the root `loading.tsx` starts streaming first.

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

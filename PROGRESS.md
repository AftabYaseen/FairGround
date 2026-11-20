# Progress

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

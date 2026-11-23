# FairGround: Build Brief for Claude Code

You are building **FairGround**, a service request platform for contractors and service providers. Work through the phases below in order. This file is the single source of truth. The client's original documents are in `docs/` for reference.

---

## 1. What FairGround is

FairGround is **not a lead auction**. Traditional lead platforms (Angi, HomeAdvisor, Thumbtack) send the same job to many contractors and make them compete. FairGround guarantees:

- **One client, one active request, one provider, at a time.** No shared leads, no bidding.
- **Providers control volume.** 15 requests per month included, a cap they control, a one-click pause, and a choice to pause or pay for extra requests when they hit the cap.
- **Collaboration over competition.** If a provider can't do the whole job, they partner with another provider. The client does not shop it around.
- **Flat, predictable pricing.** No surprise charges, ever. FairGround never charges for a request without the provider's consent.

Owner: OPAL Quality Systems Management (client: Deirdre Mercedes). Built by Devnix Solution.

### Users and roles
- **provider**: a contractor or service business. Has a profile, a unique request link, an inbox of requests, a monthly cap and a subscription.
- **client**: a person or business requesting a service. Can have only ONE active request on the whole platform.
- **admin**: OPAL staff. Sees everything, handles abuse, changes settings, restores access.

Primary audience: home service contractors, commercial service providers, trades and facilities professionals. Also open to consultants and professional services.

---

## 2. Tech stack (fixed, do not change)

- **Next.js** (App Router) + **TypeScript** + **Tailwind CSS**, `src/` directory
- **Supabase**: Postgres, Auth, Storage, pg_cron, pg_trgm. Use `@supabase/ssr` and `@supabase/supabase-js`
- **Vercel** hosting (live preview: https://fair-ground-two.vercel.app)
- **Resend** for transactional email
- **Twilio Verify** for phone verification (SMS codes)
- **@fingerprintjs/fingerprintjs** (open source) for device fingerprinting
- **lucide-react** for icons
- Payments: **NOT DECIDED YET** (Authorize.net or Stripe). See Phase 6.

### Environment variables
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=   # sb_publishable_..., safe for browser
SUPABASE_SECRET_KEY=                    # sb_secret_..., SERVER ONLY, never import in client components
NEXT_PUBLIC_SITE_URL=                   # http://localhost:3000 locally, Vercel URL in production
RESEND_API_KEY=                         # optional until Phase 5
EMAIL_FROM=                             # e.g. FairGround <no-reply@...>
TWILIO_ACCOUNT_SID=                     # optional until Phase 2 phone step
TWILIO_AUTH_TOKEN=
TWILIO_VERIFY_SERVICE_SID=
ALLOW_UNVERIFIED_PHONE=true             # DEV ONLY: skips SMS when Twilio keys are missing
```
Create `.env.example` with these names and no values. Never commit real values. `.env.local` and `.mcp.json` must stay in `.gitignore`.

If a third-party key is missing, the feature must **fail gracefully**: log to the server console and continue, never crash the page.

---

## 3. How you work on the database

You are connected to the FairGround Supabase project through the **Supabase MCP server** (see `.mcp.json`).

- Make every schema change with the MCP `apply_migration` tool, using a clear snake_case name (e.g. `001_core_schema`).
- **Also save the same SQL** to `supabase/migrations/NNN_name.sql` so the schema is in git.
- After each migration, regenerate types with the MCP type generator and save them to `src/types/database.ts`.
- Run the MCP security and performance advisors after each phase and fix every warning they raise about RLS or exposed functions.
- **Every table has RLS enabled.** No exceptions. Write policies in the same migration that creates the table.
- Business rules that protect fairness (the one-active-request lock, cap counting, duplicate checks) must be enforced **in the database** (constraints, triggers, or `security definer` functions), not only in the UI. Assume people will try to bypass the UI.
- Never drop or rewrite data destructively without being asked. This project will hold real customer data.

---

## 4. Design system

FairGround has its **own identity** (not OPAL branding). Footer carries a small credit: "A FairGround resource from OPAL Quality Systems Management".

Feel: **built for the trades**. Solid, honest, practical, like a well-kept job site. Not a generic AI SaaS look: no purple gradients, no glassmorphism, no floating blobs, no emoji.

### Colours ("Job Site" palette)
Define these as CSS variables in `globals.css` and map them into Tailwind's theme.

| Token | Hex | Use |
|---|---|---|
| `--charcoal` | `#1E2124` | Primary text, dark sections, header/footer backgrounds |
| `--charcoal-2` | `#2C3035` | Hover on dark surfaces, dark cards |
| `--plaster` | `#F3F0E9` | Main page background |
| `--plaster-2` | `#E8E3D8` | Alternate section background, subtle fills |
| `--white` | `#FFFFFF` | Cards, inputs, modals |
| `--line` | `#D6D0C2` | Borders and dividers on light surfaces |
| `--muted` | `#5E646B` | Secondary text on light surfaces |
| `--safety` | `#F2B705` | Primary buttons, key highlights, focus rings |
| `--safety-hover` | `#D9A404` | Primary button hover |
| `--steel` | `#3C5A73` | Links, secondary buttons, info badges, charts |
| `--steel-dark` | `#2E4759` | Link hover, steel on light backgrounds where more contrast is needed |
| `--success` | `#2F7D4F` | Completed, verified, hired |
| `--danger` | `#B3261E` | Errors, violations, destructive actions |

Contrast rules (must pass WCAG AA):
- **Never put yellow text on plaster or white.** Yellow is a **fill**. Text on yellow is always `--charcoal`.
- On charcoal backgrounds, text is plaster or white; yellow can be used for accents and text there.
- Links are `--steel` on light backgrounds, underlined on hover.
- Status badges: light tinted background + dark text of the same hue.

### Typography
- Headings: **Bricolage Grotesque** (weights 500, 700). Tight letter spacing (`-0.02em`) on large sizes.
- Body and UI: **Figtree** (weights 400, 500, 600).
- Load both with `next/font/google` and expose them as CSS variables (`--font-heading`, `--font-body`).
- Scale: hero 56 to 72px desktop / 40px mobile; h2 36 to 44px; h3 22 to 24px; body 16 to 18px; small 14px. Line height 1.6 for body.
- Numbers in stats and pricing use tabular figures.

### Visual details
- Corners: 6px on buttons and inputs, 10px on cards. Not pill-shaped.
- Borders over shadows. Cards have a 1px `--line` border; at most a very soft shadow on hover.
- A recurring motif you may use sparingly: a thin **safety-stripe** band (diagonal charcoal/yellow) as a section divider or badge edge, like hazard tape. Use it in at most 2 or 3 places.
- Primary button: yellow fill, charcoal text, 600 weight. Secondary: charcoal outline or steel fill with white text.
- Focus states visible on everything (2px yellow ring with charcoal offset).
- Fully responsive. Mobile first. Test at 375px, 768px, 1280px.

### Copy rules
- **Never use em dashes (the long dash character) in any UI text, emails, or content.** Use commas, colons, or full stops instead.
- Plain, direct language. Short sentences. Speak to busy tradespeople.
- Do not hard-code beta dates or prices in components. Read them from the `app_settings` table (see schema) so the admin can change them.

---

## 5. Core business rules (non-negotiable)

1. **One active request per client, platform-wide.** Enforced by a partial unique index: `unique (client_id) where status = 'active'`.
2. A request is **active** until one of: provider declines it, provider completes or closes it, client closes it, it auto-expires, or an admin closes it.
3. **Auto-expiry**: active requests older than `app_settings.request_expiry_days` (default **10**, client to confirm) are set to `expired` by a pg_cron job that runs hourly.
4. **Fairness acknowledgement**: before a client's first request they must tick a checkbox agreeing to the fairness statement. Store it in `fairness_acknowledgements` with version, timestamp, IP and user agent. A request cannot be created without one (enforce in the submit function).
   Statement text: "FairGround is built to treat service providers fairly. You may submit one active request to one provider at a time. If a provider cannot complete a job, you may submit a new request after closing the current one."
5. **Contractor link lock**: a client arriving through a provider's link (`/p/[slug]`) sees only that provider. No browse links, no "see other providers". The request records `entry_path = 'link'`.
6. **Browse mode**: a client arriving without a link can browse the directory, filtered by category and ZIP, but submits to one provider only. The request records `entry_path = 'browse'`. Show a clear notice: "You may submit one active request to one provider at a time. Please review profiles carefully."
7. **Duplicate job check (fingerprint)**: when a client submits, compare against that client's requests from the last 72 hours. If the same category + same ZIP + description similarity >= 0.6 (pg_trgm `similarity()`), block it and log an abuse flag. Store a normalised fingerprint on each request.
8. **Verified requests only**: a request must include the client's name, email, phone and service details. The client's email must be verified (Supabase Auth) and phone verified (Twilio Verify, or skipped when `ALLOW_UNVERIFIED_PHONE=true` in dev). **Phone verification is for clients only** (confirmed by Deirdre, 2026-11-23): providers give a business phone number at sign-up but are never sent an SMS code and are never redirected to `/verify-phone`. One account per phone number applies to clients only; providers may share a business number across accounts (for example, one office line).
9. **Provider availability**: a request can only be sent to a provider who is active, not paused, and either under their monthly included count or opted in to overage.
10. **Monthly cap**: 15 included requests per calendar month (store as a per-provider value, default from settings). When the 15th request arrives:
    - if `overage_opt_in = false` (default): the provider is automatically paused from receiving new requests until the next month, and is notified.
    - if `overage_opt_in = true`: further requests are accepted and marked `is_overage = true` (billed later at the plan's overage price).
    Cap counting must be safe under concurrency: lock the provider row (`select ... for update`) inside the submit function.
11. **Pause**: providers can pause and resume with one click, any time, with no penalty. Paused providers stay listed in the directory but show "Not accepting requests right now".
12. **No refunds for requests** (shown in policy and FAQ). Admin can mark a request as invalid (spam or fake), which removes it from the provider's billable count. This is the safety valve.
13. **Abuse escalation** per client: 1st violation = warning shown in UI; 2nd = 7-day lockout from submitting; 3rd = suspension. Admin can see, override, and restore.
14. **Anti-circumvention**: rate limit request submissions and sign-ups by IP, phone, and device fingerprint (store in a `rate_limits` table). One account per phone number and per email. Flag accounts sharing a device fingerprint with a suspended account.

---

## 6. Database schema (Phase 1 target)

Adjust details if needed, but keep the intent. All tables: `id uuid primary key default gen_random_uuid()` unless stated, `created_at timestamptz default now()`, `updated_at` with a trigger where rows change.

**Enums**
- `user_role`: `admin`, `provider`, `client`
- `account_status`: `active`, `warned`, `locked`, `suspended`
- `request_status`: `active`, `declined`, `completed`, `closed_by_provider`, `closed_by_client`, `expired`, `closed_by_admin`
- `request_outcome`: `hired`, `not_hired`, `no_response`
- `entry_path`: `link`, `browse`
- `plan_type`: `beta`, `standard`

**Tables**
- `profiles`: `id` (= `auth.users.id`), `role`, `full_name`, `email`, `phone`, `phone_verified_at`, `status`, `locked_until`, `violation_count`, `device_fingerprint`. Created by a trigger on `auth.users` insert; role comes from sign-up metadata and may only be `provider` or `client` (never `admin` from sign-up).
- `service_categories`: `name`, `slug`, `sort_order`, `is_active`. Seed: General Contracting, Plumbing, Electrical, HVAC, Roofing, Painting, Flooring, Landscaping, Cleaning, Handyman, Pest Control, Moving, Pool and Spa, Appliance Repair, Facilities Maintenance, Commercial Cleaning, Security Services, Consulting, Other.
- `providers`: `profile_id` (unique), `business_name`, `slug` (unique, used in `/p/[slug]`), `tagline`, `description`, `logo_url`, `phone_public`, `website`, `city`, `state`, `service_zips text[]`, `years_in_business`, `typical_jobs text`, `is_listed`, `requests_paused`, `paused_reason` (`manual` | `cap_reached` | `billing` | `admin`), `monthly_cap` (default 15), `overage_opt_in` (default false), `plan` (`plan_type`), `plan_price_locked_until date`, `billing_status`, `avg_response_hours numeric`.
- `provider_categories`: `provider_id`, `category_id` (composite primary key).
- `fairness_acknowledgements`: `client_id`, `statement_version`, `accepted_at`, `ip`, `user_agent`.
- `requests`: `client_id`, `provider_id`, `category_id`, `title`, `description`, `zip`, `city`, `preferred_timing`, `contact_name`, `contact_email`, `contact_phone`, `entry_path`, `status`, `outcome`, `outcome_note`, `is_overage`, `is_invalid` (admin), `billing_month date`, `fingerprint text`, `device_fingerprint`, `ip`, `expires_at`, `responded_at`, `closed_at`, `closed_by uuid`.
  - Partial unique index: `(client_id) where status = 'active'`.
  - Trigram index on `fingerprint`.
- `request_events`: audit trail: `request_id`, `actor_id`, `event` (`created`, `viewed`, `responded`, `declined`, `completed`, `closed`, `expired`, `admin_action`), `note`, `meta jsonb`.
- `abuse_flags`: `client_id`, `type` (`duplicate_job`, `rate_limit`, `shared_device`, `multi_account`, `manual`), `details jsonb`, `status` (`open`, `resolved`, `dismissed`), `resolved_by`, `resolved_at`.
- `rate_limits`: `key text` (e.g. `ip:1.2.3.4:submit`), `window_start`, `count`. Unique on (`key`, `window_start`).
- `app_settings`: single row. `request_expiry_days` (10), `included_requests` (15), `beta_open bool`, `beta_signup_deadline date null`, `ga_launch_date date null`, `beta_monthly_cents` (3900), `beta_setup_cents` (0), `beta_overage_cents` (800), `std_monthly_cents` (5900), `std_setup_cents` (7900), `std_overage_cents` (1000), `beta_capacity` (250), `founding_lock_months` (12), `fairness_statement_version` (1).
- `notifications_log`: `to_email`, `template`, `related_id`, `status`, `error`. (Phase 5)

**Functions (security definer, `search_path` pinned)**
- `submit_request(...)`: the ONLY way to create a request. In one transaction it checks: caller is a `client`, status allows submitting, email and phone verified, acknowledgement exists, no active request, rate limits, duplicate fingerprint, provider available (lock provider row, count this month's non-invalid requests, apply cap and overage rules), then inserts the request and a `created` event. Returns the request id or a clear error code (`ALREADY_ACTIVE`, `DUPLICATE_JOB`, `PROVIDER_PAUSED`, `PROVIDER_AT_CAP`, `NOT_VERIFIED`, `NO_ACK`, `RATE_LIMITED`, `ACCOUNT_LOCKED`). The UI maps each code to a friendly message.
- `close_request(request_id, new_status, outcome, note)`: enforces who may set which status.
- `expire_requests()`: called by pg_cron hourly.
- `record_violation(client_id, type, details)`: inserts the flag and applies the escalation ladder.
- `is_admin()` helper for RLS.

**RLS summary**
- Clients: read and update only their own profile; read only their own requests and acknowledgements; never insert into `requests` directly (only via `submit_request`).
- Providers: read and update only their own provider row; read only requests where `provider_id` is theirs; update only status and outcome fields through `close_request`.
- Public (anon): read listed providers, their categories, and service categories only. No contact details of clients ever.
- Admin: full access via `is_admin()`.

---

## 7. Routes

**Public**
- `/` landing page (rebuild with the new design; copy in `docs/landing-page-outline.md`)
- `/providers` directory (filter by category and ZIP)
- `/p/[slug]` provider profile + request entry point (link-locked mode)
- `/beta` founding member info + sign-up entry
- `/fairness-policy`, `/terms`, `/privacy`, `/faq`, `/contact`
- `/login`, `/signup` (choose: "I provide services" or "I need a service"), `/forgot-password`, `/reset-password`, `/auth/callback`, `/verify-phone`

**Client**
- `/request/new?provider=slug` (fairness acknowledgement on first use, then the form)
- `/my-request` (current request status, close it, history of past requests)
- `/account`

**Provider**
- `/dashboard` (this month: requests used of cap, paused or not, new requests)
- `/dashboard/requests` and `/dashboard/requests/[id]` (view, respond, decline, complete or close with outcome)
- `/dashboard/profile` (edit public profile, logo upload, categories, service ZIPs)
- `/dashboard/link` (copy request link, QR code, share text)
- `/dashboard/settings` (pause/resume, monthly cap behaviour, overage opt-in with clear pricing)
- `/dashboard/billing` (Phase 6)

**Admin** (`/admin`, role-guarded in middleware AND by RLS)
- `/admin` overview and beta metrics
- `/admin/requests` (filter, view lineage and fingerprint, close, mark invalid)
- `/admin/clients` (status, violations, lock/unlock/suspend/restore)
- `/admin/providers` (list, unlist, plan, pause)
- `/admin/flags` (abuse queue)
- `/admin/settings` (edit `app_settings`)

Middleware: refresh the Supabase session, protect `/dashboard/*` (provider), `/my-request` and `/request/*` (client), `/admin/*` (admin). RLS is still the real guard.

---

## 8. Build phases

Work through the phases in order **without stopping between Phases 1 and 5**. After finishing each phase:
1. Run `npm run build` and `npm run lint` and fix all errors.
2. Run the Supabase advisors and fix RLS and security warnings.
3. Commit with a clear message (e.g. `Phase 2: auth and verification`) and push.
4. Update `PROGRESS.md`: what was built, how to test it, anything skipped and why, open questions.

**Stop after Phase 5** and wait for instructions before Phase 6, because the payment provider is not decided.

### Phase 1: Foundation and database
- Design tokens, fonts, base layout, header/footer, button/input/card/badge components.
- All enums, tables, indexes, triggers, RLS, helper functions, the `app_settings` row, category seed.
- Supabase client helpers: browser, server, middleware, and a server-only admin client using `SUPABASE_SECRET_KEY`.
- Generated types.
**Done when:** build passes, advisors are clean, the home route renders with the new design system.

### Phase 2: Accounts and verification
- Sign up as provider or client, email verification, login, logout, password reset.
- Phone verification page using Twilio Verify (dev bypass flag).
- Device fingerprint captured at sign-up and stored on the profile.
- Rate limit sign-ups by IP.
- Role-based redirects after login.
**Done when:** both roles can sign up, verify, log in and land on the right page.

### Phase 3: Provider profiles, link and directory
- Provider onboarding wizard after first login: business details, categories, service ZIPs, logo upload (Supabase Storage bucket `logos`, public read, owner write).
- Unique slug generation, `/p/[slug]` public profile page.
- `/dashboard/link`: copy link, QR code (use the `qrcode` package), share text.
- `/providers` directory with category and ZIP filters, showing paused state.
**Done when:** a provider can finish onboarding and their public page and directory listing work.

### Phase 4: Request flow (the heart of FairGround)
- `submit_request` function with every check in section 5.
- Fairness acknowledgement step.
- Link-locked mode vs browse mode UI.
- Request form with validation (zod), friendly error messages for each error code.
- `/my-request` for clients: status, close request.
- Auto-expiry pg_cron job.
- Duplicate fingerprint check and abuse escalation.
**Done when:** a second active request is impossible (try it via the UI AND via a direct Supabase call), duplicates are blocked, link mode hides other providers, expiry works.

### Phase 5: Provider inbox, cap and notifications
- Provider dashboard with "X of 15 used this month", cap bar, paused state.
- Request detail: mark responded, decline, complete, close with required outcome (Hired / Not hired / No response).
- Auto-pause at cap; overage opt-in toggle with clear pricing from `app_settings`.
- Pause / resume.
- Emails via Resend (log to `notifications_log`): provider new request, client confirmation, request closed or expired, cap reached, and a "Did you hire them?" follow-up to the client 5 days after a request is closed or completed (pg_cron or a Vercel cron route).
- Admin area: all pages listed in section 7, including beta metrics: requests per provider per week and month, % of providers hitting the cap, % opting into overage, average response time, hire rate from outcomes.
**Done when:** the full loop works end to end: provider signs up, client requests, provider closes with outcome, admin sees it in metrics.

**STOP HERE and report.**

### Phase 6: Billing (wait for go-ahead)
Payment provider to be confirmed (Authorize.net or Stripe). Scope: subscription sign-up at beta or standard price, setup fee, monthly billing, overage charges per request at month end, founding-member price lock for 12 months with 60 days' notice, failed-payment handling (pause the provider), billing page with invoices.

### Phase 7: Landing page and launch polish
- Rebuild `/` with the new design using `docs/landing-page-outline.md`. All CTAs must go to real pages (`/signup`, `/beta`, `/fairness-policy`). No `#` placeholder links.
- Beta and launch dates read from `app_settings`; if a date is null, show "Limited founding spots available" instead of a date.
- Write the fairness policy, terms and privacy pages (mark legal pages "Draft, pending legal review").
- SEO metadata, Open Graph image, favicon, sitemap, robots.txt.
- Accessibility pass and Lighthouse check (aim for 90+ on all scores).

---

## 9. Quality rules

- TypeScript strict. No `any` unless there's a comment explaining why.
- Server Components by default; `"use client"` only where interaction needs it.
- Mutations through Server Actions or Route Handlers that re-check the user's role server-side.
- Validate all input with zod on the server.
- Never expose client contact details to anyone except the provider the request was sent to, and admins.
- Never import `SUPABASE_SECRET_KEY` into code that can reach the browser.
- Loading, empty and error states on every page.
- Dates shown in the user's local time zone; stored in UTC.
- Keep components small; shared UI lives in `src/components/ui`.

---

## 10. Open questions (use the defaults; do not block on these)

| Question | Default to build with |
|---|---|
| Payment provider | Not built until Phase 6 |
| Request expiry period | 10 days (in `app_settings`) |
| Beta sign-up deadline and launch date | null (show "Limited founding spots available") |
| Charges for fake or spam requests | Admin can mark invalid, which removes it from the billable count |
| Partner/referral feature between providers | Not in MVP; guidance text only |
| Fingerprint Pro (paid) | Not used; open source FingerprintJS only |

---

## 11. First admin account

After Phase 2, the developer signs up normally, then promotes the account via the MCP SQL tool:
```sql
update profiles set role = 'admin' where email = 'DEVELOPER_EMAIL_HERE';
```
Never add a UI or API path that lets anyone set their own role to admin.

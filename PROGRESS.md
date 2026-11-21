# Progress

**Status: Phases 1 to 5 are complete. Phase 6 (billing, Authorize.net) is built and tested up to the payment processor. A live sandbox test is waiting on sandbox keys.**

## Phase 6: Billing with Authorize.net (built, live sandbox test pending)

### How payments work
- **Card entry: Accept.js.** The card form loads Accept.js from Authorize.net (sandbox: `jstest.authorize.net`, production: `js.authorize.net`). It turns the card into a single-use nonce that lasts 15 minutes.
  - The card inputs have no `name` attributes, so they can never be submitted to our server.
  - The Server Action receives only the nonce and the billing address.
  - Authorize.net stores the card in a Customer Profile (CIM). We store the profile ids (server-only columns) plus brand, last 4 digits and expiry.
- **Monthly plan: ARB.** One subscription per provider, created from the customer profile, monthly, ongoing (`totalOccurrences 9999`). The start date is "today" in Mountain Time, so Authorize.net runs the first charge at about 2:00 a.m. Pacific. The price is the founding or standard monthly price from `app_settings`.
- **One-off charges: charge the customer profile.**
  - Setup fee: charged once, when the subscription starts. A decline stops the sign-up before any subscription is created.
  - Extra requests: billed at month end for the previous month (cron, days 1 to 7). Each request is billed at the price **snapshotted when it arrived** (`requests.overage_price_cents`, set by a trigger), so later price edits never apply retroactively. A unique index allows only one overage invoice per provider per month, so re-runs can never double-charge.
- **Invoices** (`invoices`, numbered `FG-001001` onwards) cover setup fees, every ARB payment and month-end extras. Providers see them on `/dashboard/billing`, with a printable invoice or receipt page.
- **Consent**: the exact authorisation text (amounts, included requests, extras only if opted in, the price lock, no refunds) must be ticked. It is stored with a timestamp and IP. The server rebuilds the text itself rather than trusting the browser.

### Failed payments
- **Detection, two ways:**
  1. Signed webhooks (`/api/webhooks/authnet`). The `X-ANET-Signature` HMAC-SHA512 is checked in constant time. Each event is logged once by `notificationId`, a 200 is returned straight away, and the work runs afterwards with `after()`.
  2. A daily reconciliation (`/api/cron/billing`) that asks ARB for each subscription's status and transaction list, so a missed webhook can't leave a non-paying provider active.
- **On failure**: `billing_status = past_due`. New requests are paused with reason `billing`, which the provider cannot lift (`PAUSE_LOCKED`). They get an email with a link to update their card. An admin pause is never overwritten.
- **Recovery**: updating the card attaches it to the subscription (which corrects a suspended one), retries everything owed, and lifts the pause once all is paid. A terminated subscription is restarted on the new card.
- **Cancel**: cancels the ARB subscription. The provider keeps receiving requests until the end of the period they paid for, then the daily job pauses them.

### Founding price lock
Sixty days before `plan_price_locked_until`, the provider gets an email notice. The change date is the later of the lock end and 60 days from the notice. On that date the ARB amount moves to the standard price and the plan becomes `standard`. The billing page shows the scheduled change.

### Requiring billing (switch, off by default)
`app_settings.billing_required`, on `/admin/settings`:
- Turning it on pauses every provider without an active subscription (reason `billing`), and new providers start paused until they subscribe.
- Turning it off releases only providers who never set up billing, never those with failed payments.

Until you turn it on, nothing changes for existing providers.

### Database
- `008_billing.sql`:
  - tables `billing_accounts`, `invoices`, `billing_events`
  - `invoice_kind` and `invoice_status` enums
  - `requests.overage_price_cents` with its snapshot trigger
  - `app_settings.billing_required` with its pause and release trigger
  - RLS: providers read their own summary and invoices; admins read all; `billing_events` is admin only; Authorize.net profile ids are never readable by end users; only the server writes
- `009_billing_reconcile.sql`: `last_reconciled_at`, so the daily job checks the oldest accounts first, up to 40 per run.

### Pages and routes
- `/dashboard/billing`: plan, status, card on file, paid through, amount due, price-change notice, start or restart, update card, cancel, invoices. Sandbox mode shows a "Test mode" banner.
- `/dashboard/billing/invoices/[id]`: printable invoice or receipt.
- `/admin/billing`: active and past-due counts, collected this month, unpaid invoices, every account, recent invoices, webhook log.
- `/admin/requests/[id]`: warns if an extra request was already billed before an admin marks it invalid (marking it invalid does not refund it).
- `/api/webhooks/authnet` and `/api/cron/billing`. The billing cron runs daily at 13:00 UTC; see `vercel.json`.

### What has been tested (live Supabase project, test data deleted afterwards)
| Check | Result |
|---|---|
| Extra request price snapshot | `is_overage: true`, `overage_price_cents: 800` (founding price) |
| Provider reads own billing summary | brand, last 4, status visible |
| Provider reads Authorize.net profile ids | `permission denied` |
| Client reads invoices; provider writes an invoice | 0 rows; `permission denied` |
| Second overage invoice for the same month | `23505` (unique index) |
| Provider lifts a billing pause or sets `billing_status` | `PAUSE_LOCKED`; `permission denied` |
| `billing_required` on / new provider / off | unbilled provider paused (`billing`), new provider starts paused, released when turned off. Past-due provider stays paused |
| Webhook: no signature / wrong / tampered body | 401 / 401 / 401 |
| Webhook: valid signature (`sha512=` uppercase, and bare lowercase) | 200, logged and processed after the response |
| Webhook: same notification twice | 200 `duplicate: true`, logged once |
| Billing cron without keys / without secret | `skipped`; 401 |
| Billing page without keys | "Billing is not available yet", invoices and past-due banner still shown |
| `npm run build` and `npm run lint` | clean |

### Not yet tested: needs sandbox keys
The live calls to Authorize.net have not run yet:
- create customer profile from a nonce
- setup fee charge
- ARB create, update and cancel
- month-end charge
- transaction details for webhooks
- reconciliation

See "Sandbox setup" below.

### Sandbox setup
1. Create a free sandbox account at developer.authorize.net. In the sandbox Merchant Interface, go to Account, Settings, Security Settings:
   - **API Credentials & Keys**: copy the API Login ID, create a Transaction Key, and create a Signature Key.
   - **Manage Public Client Key**: create the Public Client Key.
2. Put them in `.env.local` (and later Vercel), using the names in `.env.example`, with `NEXT_PUBLIC_AUTHNET_ENV=sandbox`.
3. Webhooks (Account, Webhooks): point to `https://fair-ground-two.vercel.app/api/webhooks/authnet` with the events `net.authorize.payment.authcapture.created` and `net.authorize.customer.subscription.*` (suspended, terminated, cancelled, failed, expired). Webhooks can't reach `localhost`, but the daily reconciliation covers local testing.
4. Test cards: 4111 1111 1111 1111 (Visa) with any future expiry. In the sandbox, an amount of $70.02 triggers a decline for testing failures.

### Open questions
- **Refunds for extra requests marked invalid after they were billed**: the admin page warns, but refunds and credits are done by hand in the Authorize.net Merchant Interface for now.
- **PCI scope**: Accept.js with our own card fields is SAQ A-EP. Authorize.net's hosted form (AcceptUI or Accept Hosted) would reduce this to SAQ A. Switching later is a small change to the card form only.
- **Plan changes mid-month** (admin switches a provider's plan) take effect on the subscription from the next price-lock or admin action. They are not prorated.

## Before going live: setup checklist
These are dashboard or configuration steps that cannot be done from code or MCP:
1. **Vercel environment variables**: copy every name in `.env.example`. Set `NEXT_PUBLIC_SITE_URL` to the Vercel URL and pick a long random `CRON_SECRET`. **Do not set `ALLOW_UNVERIFIED_PHONE` in production.**
2. **Supabase Auth, URL Configuration**: set Site URL to the Vercel URL. Add `http://localhost:3000/**` and `https://fair-ground-two.vercel.app/**` to Redirect URLs.
3. **Supabase Auth, SMTP**: set up custom SMTP (Resend offers SMTP). The built-in sender only reaches your own team's addresses.
4. **Supabase Auth, password security**: turn on leaked password protection. This is the only remaining advisor warning.
5. **Resend**: verify your sending domain, then set `RESEND_API_KEY` and `EMAIL_FROM`. Until then emails are logged as `skipped` in `notifications_log` and nothing breaks.
6. **Twilio Verify**: create a Verify service and set the three `TWILIO_*` keys.
7. **First admin**: sign up normally, then run `update profiles set role = 'admin' where email = '...';` in the SQL editor.

## Phase 5: Provider inbox, cap and notifications (done)

### What was built
- **Provider dashboard** (`/dashboard`):
  - "X of 15 used this month" cap bar (included and extra counted separately)
  - paused banner with the reason
  - new, open and typical-response stats
  - open requests marked New, Opened or Responded
- **Inbox** (`/dashboard/requests`): Open / Closed / All tabs, entry path, outcome, extra and not-billed badges.
- **Request detail** (`/dashboard/requests/[id]`):
  - The client's verified contact details, the job, and an activity timeline.
  - Opening the page records "viewed". This runs from the browser on mount, so link prefetching never counts as a view.
  - "I have contacted the client" marks the request responded and feeds the average response time.
  - Mark completed / Close: outcome required (Hired / Not hired / No response), optional private note. Decline is also available.
  - A collaboration hint suggests partnering with another provider.
- **Settings** (`/dashboard/settings`):
  - One-click pause and resume. An admin or billing pause can't be lifted by the provider.
  - Overage opt-in. Turning it on needs a checkbox agreeing to the per-request price, which is read from `app_settings` for the provider's plan.
  - Opting in lifts a cap pause straight away.
  - Plan, monthly price and price-lock date.
- **Auto-pause at cap**: enforced inside `submit_request` (Phase 4). The provider gets a "cap reached" email.
- **Emails via Resend** (`src/lib/notifications.ts`). Every send is logged to `notifications_log` as `sent`, `failed` or `skipped`, and a failure never blocks the user.
  - New request to the provider (client contact details included) and a confirmation to the client.
  - Request closed or declined: sent to whichever side did not do it.
  - Request expired: sent to both.
  - Cap reached: sent to the provider.
  - "Did you hire them?" to the client 5 days after a request closes. Their one-click answer is stored as `client_outcome`.
- **Cron**: `vercel.json` runs `/api/cron/notifications` daily at 14:00 UTC, protected by `Authorization: Bearer $CRON_SECRET`. It sends the expiry emails and the 5-day follow-ups. Expiry itself still runs hourly in pg_cron.
- **Admin area** (`/admin/*`). Guarded by the proxy and the layout, and every admin function checks `is_admin()` again inside the database:
  - **Overview**: beta metrics. Requests per provider per week and per month, % of providers hitting the cap, % opted into overage, average response time, hire rate (from client outcome, falling back to provider outcome), link vs directory share, monthly table, busiest providers, open-flag alert.
  - **Requests**: filter by status, entry path, invalid only, or search title or client email. The detail page shows lineage: entry path, provider, client status and violations, IP, device fingerprint (compared with the sign-up device), user agent, job fingerprint, the full event log with actors, and the client's other requests. Actions: close, and mark invalid or valid. Marking invalid frees the allowance and lifts a cap pause if the provider is under the cap again.
  - **Clients**: search and status filter. Restore (resets violations), warn, lock 7 days, suspend. Every change is logged as a resolved `manual` flag.
  - **Providers**: plan and included requests, list or unlist, admin pause or lift, this month's usage.
  - **Abuse flags**: Open / Resolved / Dismissed queue with readable details (matched request and similarity), resolve, dismiss, reopen, restore client.
  - **Settings**: edit `app_settings`, with prices entered in dollars and stored as cents, dates, limits and the fairness statement. "Publish as a new version" makes every client agree again.
- **Public pages** so no link is dead: `/beta`, `/faq`, `/fairness-policy`, `/terms`, `/privacy`, `/contact`. They use simple versions of the copy from `docs/`, with prices from `app_settings`, and legal pages are marked "Draft, pending legal review". Phase 7 polishes them.

### Database
- `007_inbox_admin.sql`: `provider_mark_request`, `admin_set_request_invalid`, `admin_set_client_status`, `admin_resolve_flag`, `admin_update_provider`, `admin_metrics`, and an admin-only RLS update policy with a column grant on `app_settings`.

### "Done when" evidence (live project; all test data deleted afterwards)
- **Full loop**: provider created and onboarded, client submitted (`OK`), provider viewed, responded and completed with "hired", client confirmed "hired". Events were `created, viewed, responded, completed, closed`. Admin metrics went from 6 to 7 requests, hire rate 100% from 1 outcome, average response time set.
- **Permissions**:
  - A non-admin calling `admin_metrics` or `admin_set_request_invalid` gets `NOT_ALLOWED`.
  - Admins can't suspend another admin, and can't change roles through the API (`permission denied`).
  - Providers can't edit settings (0 rows) and can't lift an admin pause (`PAUSE_LOCKED`).
- **Admin tools**: restoring a locked client gave active, 0 violations, lock cleared. Flag resolve, provider pause and unlist, and settings update all worked.
- **Pages**: every provider and admin page returns 200 for its role and redirects for others. The cron route returns 401 without the secret. With the secret it processed 1 expired request, and both emails were logged `skipped` (no Resend key yet).
- **Checks**: `npm run build` and `npm run lint` clean. No em dashes in `src/`. Every internal link on public pages returns 200.

### Open questions
- **Support contact**: no email address was provided. `/contact` currently says to reply to any FairGround email.
- **Did-you-hire follow-up timing**: it goes out at the next daily cron run 5 or more days after closing. If hourly accuracy is wanted, the job can move to pg_cron with `pg_net`, or to a paid Vercel cron.
- **Turning overage off while over the cap** does not pause immediately. The next request attempt returns `PROVIDER_AT_CAP` and pauses then.
- **Changing "included requests" in settings** only applies to new providers. Existing providers are changed one by one on `/admin/providers`.

## Phase 4: Request flow (done)

### What was built
- **`submit_request()`** (`006_request_flow.sql`) is the only way to create a request: clients have no insert or update grant on `requests`. It runs in one transaction, in this order:
  1. The caller is a client. Their profile row is locked so their submissions run one at a time.
  2. Account status: suspended, or locked until a date, returns `ACCOUNT_LOCKED`. An expired lock drops back to "warned".
  3. Email confirmed and phone verified, or `NOT_VERIFIED`.
  4. A fairness acknowledgement exists for the current statement version, or `NO_ACK`.
  5. No active request anywhere, or `ALREADY_ACTIVE`. The partial unique index is the final guard under concurrency.
  6. Rate limits: 5 per day per user, and 10 per day per IP and per device. Otherwise `RATE_LIMITED`, plus a `rate_limit` flag.
  7. Duplicate check: same category, same ZIP, and `similarity() >= 0.6` on the normalised title and description fingerprint within 72 hours. Otherwise `DUPLICATE_JOB`, which records a violation and applies the escalation ladder.
  8. Provider available: the provider row is locked, then this month's non-invalid requests are counted. At the cap without overage, the provider is auto-paused (`cap_reached`) and the code is `PROVIDER_AT_CAP`. With overage opt-in the request is marked `is_overage`. Otherwise `PROVIDER_PAUSED`.
  9. Insert the request and a `created` event. If this request uses up the allowance, pause the provider and report `provider_cap_reached` so the app can email them.
- **`close_request()`** decides who may set which status:
  - client: `closed_by_client`, with an optional "did you hire them"
  - provider: `declined`, `completed` or `closed_by_provider`, where completing or closing requires an outcome (`OUTCOME_REQUIRED`)
  - admin: `closed_by_admin`
  It also records the event and updates the provider's average response time.
- **`client_report_outcome()`** stores the client's "Did you hire them?" answer on closed requests.
- **pg_cron** (UTC):
  - `expire_requests()` every hour: expires requests older than `app_settings.request_expiry_days`
  - `reset_cap_pauses()` at 00:05 on the 1st of each month
  - `cleanup_rate_limits()` daily
- **`/request/new?provider=slug`**:
  - Client-only. An unverified phone is sent to `/verify-phone` first.
  - Shows clear blockers for: active request, locked or suspended account, paused provider, and link-locked to another provider.
  - On first use, the fairness acknowledgement step appears (statement text and version come from `app_settings`; IP and user agent are stored).
  - The form is validated with zod: service (the provider's categories), title, description, ZIP, city and timing. Name is editable. The verified email and phone are shown read-only.
  - Browse mode shows the one-provider notice. The entry path (`link` or `browse`) is decided on the server from the link-lock cookie, never from the URL.
  - Every error code maps to a friendly title and message (`src/lib/request-codes.ts`). Duplicate violations also say which step of the ladder was applied.
- **`/my-request`**:
  - The active request with provider, dates, expiry and an activity timeline.
  - Close it, with confirmation and an optional outcome. Closing also lifts the provider link lock.
  - History with status badges and one-click "Did you hire them?" answers.
  - Warning, lock and suspension banners.
  - A link-locked client with no request can only continue with their provider. "Find a different provider" appears after a request to that provider has been resolved.
- **Emails** (`src/lib/email.ts`, `src/lib/notifications.ts`) are wired in and fully used in Phase 5.

### "Done when" evidence (run against the live project)
| Check | Result |
|---|---|
| Second request while one is active, through the RPC | `ALREADY_ACTIVE` |
| Second request by direct `insert into requests` | `permission denied for table requests` |
| Direct `update requests set status` | `permission denied` |
| Two different jobs submitted in parallel | `["ALREADY_ACTIVE","OK"]` |
| Same job re-sent after the client closed it | 1st: `DUPLICATE_JOB` and warned. 2nd: `DUPLICATE_JOB` and locked for 7 days. Then any job: `ACCOUNT_LOCKED` |
| Same job re-sent after the provider declined it | `OK` (allowed) |
| No acknowledgement / provider account / anon | `NO_ACK` / `NOT_CLIENT` / `permission denied` |
| Provider completes without an outcome; provider closes someone else's request | `OUTCOME_REQUIRED` / `NOT_FOUND` |
| Request that fills the cap | `OK`, `provider_cap_reached: true`, provider paused `cap_reached` |
| Request to a capped provider; after overage opt-in | `PROVIDER_AT_CAP`; then `OK` with `is_overage: true` |
| Backdated request plus `expire_requests()` | Expired, with an `expired` event. 3 cron jobs active |
| Link-locked client opening another provider's form | Blocked, "Your request stays with the provider whose link you used" |

### Decisions to confirm with the client
- **Which earlier requests count as a duplicate.** The brief says a declined job may go elsewhere ("If a provider cannot complete a job, you may submit a new request after closing the current one"). So a similar job within 72 hours is blocked only when the earlier request is still active, was closed by the client, or was completed. It is allowed when the provider declined or closed it, or it expired.
- **Declined and closed requests still count toward the provider's monthly allowance.** Only admin "invalid" removes one.
- **Rate limits** are 5 submissions per user and 10 per IP or device per 24 hours. IP and device are passed in from the server. Someone calling the RPC directly could fake them, but the per-user limit and every other rule still apply.

### Test data
Test providers "Test Pipes One/Two" and `fgt4-*@example.com` clients exist for Phase 5 testing. They are **unlisted**, so they don't appear in the public directory, and will be removed at the end.

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

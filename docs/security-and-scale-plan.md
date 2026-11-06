# Security and scale plan

Status: proposal. Nothing in this file has been applied. Items marked **verify** depend on the live Supabase project, which the repo cannot show.

Sources are web articles and Supabase's own docs, not Reddit threads (the searches did not surface any). The repo findings come from reading `supabase/migrations`, `vercel.json`, `api/transcribe.js`, and `supabase/functions/create-staff-account`.

## How to read the numbers

Pasig has about 850,000 residents, but that is not concurrent load. The real risk is **spikes** (fiestas, announcements, QR scans at events) and **abuse** (bots, scripted requests, someone trying to become an admin). Plan for both, in that order.

## Priority order

| # | Item | Why | Effort |
|---|------|-----|--------|
| 1 | Guard role columns on `profiles` | Possible self-promotion to admin | Small |
| 2 | Security headers in `vercel.json` | None set today | Small |
| 3 | Harden `api/transcribe.js` | Open endpoint spending your Groq key | Medium |
| 4 | Storage bucket limits | Public buckets, no size or type limit | Small |
| 5 | Auth abuse controls (dashboard) | Brute force, reset spam, email limits | Small |
| 6 | Indexes and pagination | Slow queries as data grows | Medium |
| 7 | CDN caching for public reads | Spike protection | Medium |
| 8 | Monitoring, backups, incident plan | Know when it breaks | Medium |
| 9 | Send Feedback endpoint and bucket | Guests can write, so it needs its own checks | Small |

## 1. Guard role columns on `profiles` (critical, verify)

**Finding.** `profiles_update_own` is `FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id)`. It checks only that the row is yours. No trigger, column grant, or revoke in the migrations stops a signed-in user from changing their own `staff_role`, `role`, `active_status`, or `system_permission`. The `activity_log_profiles_staff` trigger only logs changes after they happen.

**Verify first** (as a normal, non-staff test account, in the browser console of the deployed site):

```js
await supabase.from("profiles").update({ staff_role: "admin" }).eq("id", (await supabase.auth.getUser()).data.user.id)
```

If it succeeds, treat it as an incident: check `activity_log` for unexpected `role_changed` rows and review every staff account.

**Proposed fix.** A `BEFORE UPDATE` trigger on `profiles` that raises an error when a non-admin changes `role`, `staff_role`, `active_status`, or `system_permission`. Use `public.is_admin()`, which already exists. Alternative: revoke column-level UPDATE and grant it only on the columns a person may edit (name, picture, preferences). Prefer the trigger, since the admin screens also write these columns.

- [ ] Verify against the live database
- [ ] Write the guard as a new migration (`0007_…`)
- [ ] Re-run the console test and confirm it now fails
- [ ] Check `activity_log` for past `role_changed` rows

## 2. Security headers (`vercel.json`)

Currently only `/sw.js` has a header. Add for all routes:

- `Content-Security-Policy`: start in `Content-Security-Policy-Report-Only`. Must allow the Supabase URL, the map tile host, maplibre workers (`worker-src blob:`), and Google sign-in if used. Test the map and sign-in before enforcing.
- `Strict-Transport-Security`: `max-age=63072000; includeSubDomains`
- `X-Content-Type-Options`: `nosniff`
- `Referrer-Policy`: `strict-origin-when-cross-origin`
- `Permissions-Policy`: deny what the app does not use. Keep `geolocation` (directions) and `microphone` (voice search) for `self`.
- Clickjacking: `frame-ancestors 'none'` in the CSP (and `X-Frame-Options: DENY` for older browsers).

- [ ] Add headers in report-only mode first
- [ ] Watch for violations, then enforce

## 3. Harden `api/transcribe.js`

**Findings.**
- No authentication.
- The origin check runs only `if (origin)`, so a script that omits the header passes.
- The per-IP limit is in memory. Serverless instances do not share memory (the file says so), so the limit does not hold under load.
- Each request spends your Groq quota.

**Proposed.**
- Require a Supabase access token and verify it server-side. Reject guests, or give guests a much smaller allowance.
- Use a shared limiter (Upstash Redis, Vercel KV, or a Supabase table) keyed by user id and IP.
- Keep the existing size cap. Add a duration cap.
- Add a daily spend ceiling and alert on it, and set a usage cap in the Groq console.

- [ ] Decide: sign-in required, or small guest allowance
- [ ] Add a shared rate limiter
- [ ] Set provider-side spend limits

## 4. Storage buckets

`content-photos` and `avatars` are public with no size or type limit (the migration comment says so).

- [ ] Set `file_size_limit` (for example 5 MB) and `allowed_mime_types` (`image/jpeg`, `image/png`, `image/webp`) on both
- [ ] Confirm write policies are scoped to the owner or to staff (they are `storage.objects` policies today; re-read them after any change)
- [ ] Resize or thumbnail on upload so public pages do not pull full-size photos

## 5. Auth abuse controls (Supabase dashboard, verify)

- [ ] CAPTCHA on signup, login, and password reset
- [ ] Leaked-password protection and a minimum password length
- [ ] Custom SMTP. The built-in mailer has a very low hourly cap, so verification and reset emails fail under real volume
- [ ] Email and OTP rate limits reviewed
- [ ] Require MFA for admin and staff accounts
- [ ] Redirect URL allowlist contains only your real domains
- [ ] JWT and session expiry reviewed
- [ ] SSL enforcement on, network restrictions considered
- [ ] MFA on the Supabase owner account, and a second owner on the org
- [ ] Restrict CORS on `create-staff-account` from `*` to your domain
- [ ] `grep -r service_role src` returns nothing (the key must never reach the browser)

## 6. Database performance

**Finding.** The baseline has about 43 foreign-key references and 11 `CREATE INDEX` statements, so some foreign-key and RLS columns are probably unindexed. This is an estimate from counting statements, not a measured result.

- [ ] Run the Performance Advisor and add the missing indexes
- [ ] Index every column your RLS policies reference
- [ ] Run `explain analyze` on the slowest public queries (Home showcase, trails catalog, Discover results)
- [ ] Add pagination (`range`/`limit`) to unbounded reads such as `fetchPublishedTrails`, and set a sensible max rows in the project's API settings
- [ ] Move heavy admin reports (heatmap, visits, fiestas) to materialized views or a read replica
- [ ] Choose a compute size for peak traffic, not average

## 7. Caching and spike protection

The in-app cache (`lib/swr-cache.ts`) helps one browser only. For many users:

- [ ] Serve rarely changing public data (categories, published trails, announcements) through a CDN-cached endpoint or a short edge cache
- [ ] Put a CDN in front of storage and use thumbnails (egress is the bill that surprises media-heavy apps)
- [ ] Load-test before known spikes (fiesta weeks, big announcements) with a tool like k6
- [ ] Confirm the service worker precache stays within reasonable size as pages grow

## 8. Operations

- [ ] Error monitoring (for example Sentry) and alerts on failed-login spikes
- [ ] Test backups and point-in-time recovery, and write down how to restore
- [ ] Keep and review `activity_log`; consider alerts on `role_changed` and `staff_created`
- [ ] GitHub secret scanning and Dependabot, plus `npm audit` in CI
- [ ] Review why `onnxruntime-node` is a dependency of a browser app (the Vercel build lists it among packages with install scripts)
- [ ] Short incident plan: who to call, how to rotate keys, how to disable an account
- [ ] Data Privacy Act (RA 10173) obligations: confirm with the LGU's data protection officer

## 9. Send Feedback endpoint and bucket

Guests can submit, so every write goes through `api/feedback.js` and nothing is written directly with the public key. The limiter is a Supabase table shared across instances, not the in-memory one in `api/transcribe.js`.

- [ ] `anon` and `authenticated` cannot insert, update or delete `feedback` rows (RLS), and a guest cannot read or list them
- [ ] The private `feedback` bucket has no public read or write, and only the endpoint (service role) writes to it
- [ ] The endpoint rejects bodies over about 3 MB (Vercel's limit is 4.5 MB)
- [ ] Image accepts JPG, PNG and WebP by real file type, is re-encoded to WebP, and EXIF is stripped
- [ ] CAPTCHA, honeypot and message length limits are enforced server side
- [ ] The rate limit holds across instances and is keyed by IP, and by user id when signed in
- [ ] Errors return a code and a plain message only, never internal details
- [ ] A stored message shows as plain text in the inbox, links included
- [ ] CAPTCHA secret and service role key are set in the Vercel dashboard, and `.env.example` lists names only
- [ ] Attachments are deleted some time after an item is Resolved
- [ ] Collection and retention confirmed with the LGU data protection officer (RA 10173)

## Already in good shape

- RLS is enabled on all 35 tables in the migrations.
- Security-definer functions set `search_path`.
- `create-staff-account` verifies an active admin before using the service role.
- `activity_log` records staff actions.
- `.env` is gitignored, and only the public anon key is used in the client.

## Sources

- Supabase production checklist: https://supabase.com/docs/guides/deployment/going-into-prod
- Supabase production security checklist: https://supabase.com/docs/guides/security/production-checklist
- Common Supabase RLS and key mistakes: https://dev.to/jordan_sterchele/why-your-supabase-data-is-exposed-and-you-dont-know-it-25fh
- Supabase misconfigurations including missing rate limiting: https://dev.to/victor_yrazusta/10-common-supabase-security-misconfigurations-and-how-to-fix-them-do8
- Scaling a Next.js and Supabase app to 100K users: https://www.iloveblogs.blog/guides/scaling-nextjs-supabase-0-to-100k-users-playbook
- Is Supabase production ready (pooling, auth email limits, egress): https://unicoconnect.com/blogs/is-supabase-production-ready

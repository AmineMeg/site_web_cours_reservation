# Spanish lessons – website, teacher panel & student portal

Next.js (App Router) + Tailwind CSS + Supabase (DB, Auth, pg_cron).
Vercel Hobby is for personal, non-commercial use; use an eligible paid plan or another
compatible host for the teacher's commercial website.

| Area | URL | Who |
|------|-----|-----|
| Public website + contact form | `/` | Everyone |
| Login | `/login` | Teacher & students |
| Account activation / password recovery | `/auth/*` | Invitation or recovery link recipient |
| Two-step verification and account security | `/security` / `/security/settings` | Teacher & students |
| Teacher panel | `/admin` (New contacts · My students · Schedule · Messages) | Teacher only |
| Homepage editor | `/admin/website` | Teacher only, MFA required |
| Student review approval | `/admin/reviews` | Teacher only, MFA required |
| Blog editor | `/admin/blog` | Teacher only, MFA required |
| Public articles | `/blog` | Everyone; published articles only |
| Student portal | `/dashboard` (Book · Profile · Contact teacher) | Students only |
| Submit / withdraw a testimonial | `/dashboard/review` | Students only; submit after five past lessons |

## Architecture

```
supabase/schema.sql            ← The whole database: tables, triggers, RPC functions, RLS, pg_cron
src/
├─ middleware.ts               ← Refreshes the Supabase session cookie on every request
├─ app/
│  ├─ page.tsx                 ← Landing page (Hero, About, Testimonials, Contact form)
│  ├─ login/page.tsx
│  ├─ actions/contact.ts       ← Contact form: save to `contacts` + email the teacher
│  ├─ actions/auth.ts          ← signIn / signOut
│  ├─ admin/                   ← Teacher panel (layout checks role = teacher)
│  │  ├─ actions.ts            ← All teacher server actions
│  │  ├─ contacts/             ← Tab 1: New contacts (1-click "Create student account")
│  │  ├─ students/ + [id]/     ← Tab 2: My students, credits +/-, edit profile
│  │  ├─ schedule/             ← Tab 3: Lessons calendar, Weekly hours, Days off
│  │  └─ messages/             ← Messages sent by students
│  ├─ dashboard/               ← Student portal (layout checks role = student)
│  │  ├─ actions.ts            ← bookLesson, updateMyProfile, changePassword, sendMessage
│  │  ├─ page.tsx              ← Booking calendar
│  │  ├─ profile/  contact/
│  └─ api/cron/cleanup-contacts/route.ts  ← Backup cron (Vercel) for the 30-day cleanup
├─ components/
│  ├─ ui/        ← Big buttons, Modal, Notice, SubmitButton
│  ├─ landing/   admin/   dashboard/
└─ lib/
   ├─ i18n/en.ts         ← ALL texts (UI + emails). Translate here.
   ├─ supabase/          ← server client (user session) / admin client (service role, server only)
   ├─ auth.ts            ← getCurrentProfile, requireTeacher, requireStudent, getSettings
   ├─ slots.ts dates.ts  ← Slot generation & timezone helpers
   ├─ email.ts           ← sendEmail(): Resend → webhook → explicit delivery failure
   └─ notifications.ts   ← Email templates (new contact, credentials, cancellation, message)
```

**Security model** – business rules live in Postgres so they cannot be bypassed from the browser:

- Row Level Security: anonymous visitors can only *insert* contacts; students only read/edit their own row;
  the teacher can manage everything.
- Booking, cancelling and credit changes only go through `security definer` functions
  (`book_lesson`, `cancel_lesson`, `adjust_credits`) which check credits, slot availability, double-booking
  (advisory lock + unique index) and refunds atomically.
- A trigger prevents students from changing their own credits, role or email.
- The service-role key is only used server-side for trusted account-management,
  recovery, rate-limit and security operations after the appropriate checks.

## Setup (≈ 15 minutes)

1. **Supabase**: create a free project at <https://supabase.com>.
2. **Database**: *SQL Editor* → paste the content of [`supabase/schema.sql`](supabase/schema.sql) → *Run*.
   (If pg_cron is not enabled, enable it in *Database → Extensions* and run the script again; it is safe to re-run.)
3. **Auth settings**: *Authentication → Sign In / Providers* → turn **off** "Allow new users to sign up"
   (only the teacher creates student accounts).
4. **Teacher account**: *Authentication → Users → Add user* (email + password, "Auto confirm"), then in the SQL editor:
   ```sql
   update public.profiles set role = 'teacher' where email = 'teacher@example.com';
   ```
5. **Local env**: copy `.env.example` to `.env.local` and fill in the values (*Project Settings → API*).
6. Run:
   ```bash
   npm install
   npm run dev      # http://localhost:3000
   ```

Settings such as the timezone (default `America/Sao_Paulo`, Belo Horizonte), lesson length (60 min), booking window (28 days)
and minimum notice (12 h) are in the `app_settings` table.

## Deploy on Vercel

1. Push the repo to GitHub and import it in Vercel.
2. Add all variables from `.env.example` (with `NEXT_PUBLIC_SITE_URL` = your production URL,
   a random `CRON_SECRET` and a separate stable random `SECURITY_SECRET`).
3. Deploy. `vercel.json` registers a daily cron calling `/api/cron/cleanup-contacts`
   (backup of the pg_cron job that deletes unconverted contacts older than 30 days).

## Emails

`src/lib/email.ts` is the single place that sends emails:

- `RESEND_API_KEY` set → sent with [Resend](https://resend.com) (free tier, 3 000 emails/month).
- else `EMAIL_WEBHOOK_URL` set → JSON `{to, subject, text, html, replyTo}` is POSTed (Zapier, Make, n8n…).
- else → delivery fails explicitly. Passwords, activation links and email contents are not printed in logs.

Resend's `onboarding@resend.dev` sender only delivers test emails to the Resend account
owner. To send to students, verify a domain and set `EMAIL_FROM` to an address on it.

All application emails include Brazilian Portuguese subjects, a mobile-friendly
HTML layout and a plain-text alternative. Invitations and password resets include
secure action buttons; booking/contact messages link to the appropriate account
area. User-provided names and messages are escaped, never interpreted as HTML.
Booking and cancellation emails highlight the lesson time and credit/refund status
in structured cards. Table-based buttons and an Outlook width fallback keep the
layout usable in email clients without external images or stylesheets.
The shared design is in `src/lib/email-template.ts`; labels are in
`src/lib/i18n/email.ts`. No SQL migration is needed for email styling.

In Vercel, update the display name of your existing `EMAIL_FROM` to
`Professora Teixeira <your-verified-address@your-domain>` while keeping your verified
sending address. Environment variables already saved in Vercel are not changed by
`.env.example`. A webhook integration must map the new `html` field to its email
provider's HTML body; older integrations can continue to use `text`.
Ensure `NEXT_PUBLIC_SITE_URL` is the HTTPS production origin for account buttons.
Custom Supabase Auth templates (for emails sent directly by Supabase rather than
this application's Resend/webhook sender) are managed separately in Supabase.

## Account security rollout (existing production projects)

### Current policy: teacher MFA, student passwords

Students sign in with email and password only. The teacher still requires TOTP MFA.
Password policies, rate limits, ownership rules and finite sessions remain enabled
for everyone.

Run [`supabase/student-password-login.sql`](supabase/student-password-login.sql)
**last**, after the base schema, security, website and blog migrations, before
deploying this version. It removes existing **student** MFA factors and recovery
codes and ends their old sessions; teacher factors are not removed. Students must
sign in again. If you later re-run `schema.sql` or `security.sql`, re-run this
role-policy migration last, because the older scripts enforce MFA for all accounts.

Invitation links accept Supabase SHA-224 (56 hex characters) and SHA-256 token
hashes. An already consumed or expired link cannot be revived by this fix: send a
fresh account access link from the student profile. Do not share token links in logs
or screenshots.

The following original rollout notes describe the base MFA layer; student accounts
are exempted by the role-policy migration above.

Do not deploy only the frontend: the database migration and Supabase settings are part
of the protection. Back up the database and test on a staging project first.

1. Run [`supabase/security.sql`](supabase/security.sql) in the production SQL Editor.
   For a new project, run [`supabase/schema.sql`](supabase/schema.sql) first, then the
   security migration if it is not already included.
2. Add a **server-only** `SECURITY_SECRET` in Vercel and locally. Generate one with:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
   Keep it stable, private and separate from `CRON_SECRET`. Do not put the real value
   in `.env.example` or Git. Changing it invalidates signed account-link proofs and
   any security data keyed by that secret.
3. In Supabase Authentication settings:
   - Disable public signups.
   - Enable authenticator-app (TOTP) enrollment and verification.
   - Set the minimum password length to **15**, including the provider-side setting:
     application form checks alone do not protect direct Auth API requests.
   - Set the email OTP/link expiry to **600 seconds**.
   - Review Auth rate limits. Application limits supplement, not replace, these
     limits because Supabase's public Auth API remains independently accessible.
   - Set the Site URL and redirect allowlist to your exact production origin
     (and your staging/local origins when needed), not wildcard external sites.
   - Configure security notification emails/custom SMTP if you use Supabase's
     own emails. Leaked-password protection is optional and requires an eligible
     Supabase paid plan; it is not implemented by the frontend.
4. Configure Resend (or the email webhook). The application generates invitation and
   recovery tokens through Supabase Auth and sends them using its own email provider;
   this path **does not require Supabase SMTP**. Supabase dashboard emails and built-in
   Auth emails still need their own delivery configuration.
5. Redeploy. Each existing account must configure an authenticator before accessing
   lessons or the admin panel. There is no permanent "skip MFA" option.
6. Test the checklist below before inviting students.

### Account flows

- **Create student:** the teacher sends a one-use activation link; no password is
  generated, emailed or known to the teacher. The student chooses a password and
  signs in without an authenticator. A mail-delivery failure is shown explicitly, and the
  teacher can resend an account access link from the student profile.
- **Forgot password:** `/auth/forgot-password` always gives the same account-existence
  message. Existing MFA must still be verified before changing the password.
- **Email links:** opening the link displays a confirmation button; only submitting
  it consumes the token, so ordinary email security scanners do not consume it on GET.
  Password setup additionally requires a short-lived signed HttpOnly proof bound to
  that user and Supabase session.
- **Password changes:** minimum 15 characters, confirmation, recent MFA and current
  password confirmation for regular changes; existing application sessions are
  revoked after a successful change.
- **Teacher edits:** changing a student's email or activation state asks for the
  teacher's password and revokes the student's existing application sessions.

### Optional CAPTCHA

Create a Cloudflare Turnstile widget for the actual site hostname. Set
`NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY`, then rebuild. Configure
both keys or neither. Tokens are checked server-side for the intended action and
hostname; provider failures do not silently pass verification.

### Sessions and recovery

Application/database defaults are 60 minutes of inactivity, 12 hours absolute
session lifetime and a 10-minute fresh-authenticator window for sensitive changes.
They are in `public.security_settings`; these are not Supabase's paid native timeout
settings. Leave the Supabase JWT lifetime at no more than one hour.

On Vercel, its trusted client-IP header is used automatically. On another host,
set `TRUSTED_CLIENT_IP_HEADER` only to a header that your proxy always overwrites
and cannot be supplied by a visitor. Without a trusted header, email/user limits
still apply but IP limits cannot be safely enforced.

Students do not need authenticators or recovery codes; they can request a password
reset link if they forget their password. If the teacher loses both their
authenticator and recovery codes, the
site owner must remove the factor and revoke sessions using the Supabase admin
tools; there is no public MFA bypass.

### Production acceptance checklist

- Teacher accounts cannot access private data before MFA. Students access only their
  own data with a valid password session; no student MFA enrollment is required.
- Wrong, expired and replayed activation/recovery links fail.
- A teacher password-recovery email does not bypass an already-enrolled authenticator.
- Save teacher recovery codes outside the browser; test one, then check that reusing it fails.
- After teacher MFA recovery, verify that old sessions cannot access data and that configuring a
  new authenticator is mandatory.
- "Sign out all devices" invalidates existing application sessions, not only refresh
  tokens. Test using two browsers.
- Repeated login/reset/MFA attempts are limited, including across server instances.
- Booking still debits one credit, cancellation refunds once, and concurrent booking
  remains protected after the new RLS policies.
- Failed email delivery is visible without exposing passwords or links in logs.

## Brazilian Portuguese and Belo Horizonte

The entire interface and automatic emails use Brazilian Portuguese (`pt-BR`).
[`src/lib/i18n/pt.ts`](src/lib/i18n/pt.ts) implements the typed core dictionary;
account, security, website and blog texts remain separate under `src/lib/i18n`.
The English dictionary is retained as a key/type reference. `NEXT_PUBLIC_LOCALE`
is no longer used; a deployment environment cannot silently switch parts back to English.

For an existing project, run
[`supabase/portuguese-belo-horizonte.sql`](supabase/portuguese-belo-horizonte.sql)
after the website and student-login migrations, before deploying this version.
It updates both the timezone default and the existing settings row and **replaces
all homepage text with the Portuguese version**, as requested. Back up
`website_content` first. Its revision increases so already-open editors cannot
overwrite it. Do not rerun it after customizing the translated homepage.
The teacher name is Professora Teixeira; adjust it in the homepage editor.

For a homepage already saved with the old María name, run
[`supabase/professora-teixeira.sql`](supabase/professora-teixeira.sql) instead of
rerunning the full Portuguese migration. It replaces the old name in saved homepage
strings while preserving other text and increasing the revision only when changed.
Update `NEXT_PUBLIC_TEACHER_NAME=Professora Teixeira` in Vercel as well;
existing environment values override the code default. Keep the verified address
in `EMAIL_FROM`, changing only its display name to `Professora Teixeira`.
This branding change does not rename Auth accounts or rewrite blog articles.

Belo Horizonte uses `America/Sao_Paulo` (currently Brasília time, UTC−3).
Weekly hours and date/time blocks keep their local clock values and are interpreted
in this timezone. Existing booked lessons keep their original UTC instants: only
their displayed local time changes. Review existing appointments and availability
after migration; the script does not silently reschedule classes.
Calendars, blog publication dates, account activity and email lesson times use the
Portuguese locale and the configured timezone. Existing blog articles, messages,
names, private notes and learning objectives are **not** automatically translated.

## Homepage and blog administration

For an existing project, run these additional migrations **before deploying** the
content-management version:

1. [`supabase/website.sql`](supabase/website.sql), after the base schema and security migration.
2. [`supabase/blog.sql`](supabase/blog.sql), after the base schema and security migration.

Each migration explicitly protects its new tables with the existing MFA gate.
Do not assume the earlier security migration automatically protects future tables.

### Editing the homepage

Open **Meu site** in the teacher sidebar. The real page preview stays visible.
Click any outlined text (or select it with Tab and Enter/Space) to open its field
in the editing panel. Changes appear immediately in the preview; the yellow
highlight identifies the selected text. The grouped list also gives access to
every field, including button labels, the contact placeholder and the footer.
Press **Salvar e atualizar meu site** to publish.

To enable homepage photo uploads, run [`supabase/homepage-images.sql`](supabase/homepage-images.sql)
in the Supabase SQL Editor **after `website.sql` and before deploying this version**.
It creates the public `homepage-images` storage bucket and updates the save function.
Existing customized texts and photos are preserved; the migration does not rewrite
saved content or revisions. Older rows load with empty photo fields in the new editor,
and the next save stores the photos with the normal revision increase. Rerunning is safe. If `website.sql`
is rerun later, reapply `homepage-images.sql` to restore the photo-aware save function.

Click the opening illustration or teacher portrait, then **Escolher uma foto**.
Choose a PNG, JPEG or WebP file up to 4 MiB from the device. After uploading,
the photo appears in the live preview; **Salvar e atualizar meu site** publishes
photos and text together. **Usar o visual original** restores the placeholder.
The **Fotos** group also reaches both visuals on small screens.
Photos use a square opening image and a 4:5 portrait, cropped to fill their frames.
The opening photo is visible on mobile when set; the default decorative illustration
remains hidden there on the public page, but visible in the editor.
Uploaded files are public immediately, even before saving. Replacing or discarding
a photo does not delete previously uploaded files, so published pages and other
editor windows cannot lose their images. Upload only images intended for public use.
Unused files continue to count towards Supabase storage usage.

- Saved text is public immediately; there is no need to redeploy.
- Portuguese defaults are used until the first save (existing stored text requires the localization migration).
- The preview uses the real homepage components; its contact form is disabled.
- In the preview, the brand and call-to-action buttons select their editable text
  instead of navigating away. Public-site links and forms keep their normal behavior.
- The preview and editing panel scroll separately and stack on smaller screens.
- **Desfazer alteração deste item** restores the selected text or photo to its last saved
  value. **Descartar todas as alterações** restores all saved texts after confirmation.
- Unsaved changes are marked clearly and trigger a warning when leaving the page.
- Two editors cannot silently overwrite each other: if another window saved first,
  reload before saving.
- Text is rendered as plain text, never as executable HTML.
- Editing the visible teacher/site name does not change login email addresses,
  notification recipients or the teacher's account; those remain separate settings.

### Real student testimonials

Run [`supabase/student-reviews.sql`](supabase/student-reviews.sql) in Supabase
**after the base schema, security and student-password-login migrations, before
deploying this version**. It is safe to rerun and preserves homepage texts, photos
and submitted reviews.

- Students qualify after **five lessons whose end time has passed and whose
  status is booked**. Gifted lessons count too; future, ongoing and cancelled
  lessons do not count. Existing students qualify too.
- Eligible students who have not submitted see an invitation in their dashboard
  and can open **Meu depoimento**. Submission is optional and requires explicit
  publication consent, a chosen public name (first name recommended) and
  20–2,000 characters of text. Each student submits once.
- The teacher opens **Depoimentos** to approve or decline. Only approved reviews
  from active students appear publicly. The teacher cannot rewrite the student's
  words or public name. A timestamp check protects concurrent moderation/withdrawal.
- Students can withdraw their review at any time. It disappears publicly and
  cannot be republished by the teacher. The withdrawn record remains visible
  privately and does not generate another invitation.
- The public endpoint exposes only review ID, chosen name and quote: never email,
  phone, objectives or student account ID.
- Fictional quotes and decorative five-star ratings are no longer displayed.
  Legacy testimonial fields remain stored for compatibility, but are excluded
  from editing and rendering. Without approved reviews, the public section and
  its navigation link are hidden. The editor shows an empty state or the same
  approved reviews as the public page; only the section title remains editable.

`vercel.json` schedules `/api/cron/review-invitations` daily at **12:00 UTC
(09:00 Belo Horizonte)**. Configure `CRON_SECRET`, the Supabase service-role key
and the existing Resend/webhook email settings in Vercel. An external scheduler
can call the endpoint with `Authorization: Bearer <CRON_SECRET>` if the deployment
plan does not support scheduled jobs.

Each run claims up to ten unsent invitations, sends in paced batches of two,
and uses a Portuguese HTML email with a normal login-protected link to
`/dashboard/review`. The link does not grant account access.
The requested private page is preserved through password login using the existing
allowlisted local-path helper; authentication and role checks still apply.
Email arrives on the next scheduled run (or later if there is a backlog); the dashboard invitation
is available immediately after the fifth lesson ends.
Submitted, declined and withdrawn reviews suppress further invitations.
Successful sends are recorded; failures retry on a later run, at least 20 hours
apart, and produce logs and a non-success HTTP status. Overlapping runs cannot
claim the same live lease. An unconfigured provider fails before claiming.

Provider requests carry a stable `Idempotency-Key`. Custom webhooks must honor
that header; Resend deduplicates within its provider retention window. Delivery
cannot be guaranteed exactly once if a process crashes after sending but before
recording success. Automated tests do not send real invitations.

### Blog

Open **Blog** in the teacher sidebar to create and edit articles. Drafts stay private;
only published articles appear at `/blog`. Review the article before publishing.
Images use Supabase Storage; configure the bucket and policies by running the blog
migration rather than manually opening storage uploads to the public.

### Teacher-created lessons

Run [`supabase/teacher-booking.sql`](supabase/teacher-booking.sql) **last**, after the
base, security and student-login scripts, before deploying this feature. Reapply
it last if you rerun the older security/base scripts: it replaces cancellation
logic so a free lesson never creates a refunded credit. Existing lessons retain
their original one-credit cost.

In **Minha agenda** or an active student's profile, select **Adicionar aula**.
Choose a student, local date/time and either **Usar 1 crédito do aluno** or
**Oferecer esta aula**. The normal mode uses the same availability and notice
rules as student booking. **Usar um horário excepcional** explicitly bypasses
weekly hours, blocked dates, minimum notice and booking window, but never permits
past starts, a lesson crossing local midnight or overlap with another booked lesson.
Duration is the configured lesson length; times use the teacher's timezone.

Teacher-created lessons appear in both agendas and use the existing confirmation
emails. A delivery failure is shown as “booked, email not sent”; do not book again.
Database locking serializes teacher and student bookings, credit use is atomic,
and retries of the same request do not consume another credit or send another email.
Gifted lessons are labelled **Aula oferecida**. Cancelling one changes no credits;
cancelling a charged lesson refunds exactly the credit used, only once.

The visual editor supports headings, bold/italic text, lists and uploaded images.
Its formatting toolbar stays visible while scrolling through the article.
Articles can be saved as drafts, previewed privately, published, unpublished or
deleted with confirmation. Their address stays fixed after creation; concurrent
edits report a conflict rather than silently overwriting a newer version.

**Image privacy:** uploaded blog images are public by URL, even when attached to a
draft. Do not upload private student photos or confidential material. Article text
stays private until publication. Removing an image from an article does not delete
the storage file, because other articles may use it.

### Content tests

Run the homepage/blog tests with Node's test runner:

```powershell
node --test tests\website.test.cjs tests\blog.test.cjs tests\blog-sql.test.cjs
```

Database tests need PGlite. Point `PGLITE_PATH` at a `node_modules` folder containing
`@electric-sql/pglite`, and `BLOG_PGLITE_PATH` at the module itself. Without these
dependencies, database tests explicitly report **SKIP**; a passing JavaScript-only
test run is not proof that the SQL migrations were tested.

## Scripts

`npm run dev` · `npm run build` · `npm run start` · `npm run typecheck`

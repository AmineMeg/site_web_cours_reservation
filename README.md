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

- Row Level Security: anonymous visitors submit contacts through a rate-limited server action; students only read/edit their own row;
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
   Then run the feature migrations in order: `student-password-login.sql`,
   `website.sql`, `blog.sql`, `homepage-images.sql`, `student-reviews.sql`,
   `teacher-booking.sql`, `trial-and-credit-rules.sql`, `eliane-teixeira.sql`,
   `public-trial-booking.sql`, `admin-removal.sql`, and **`admin-mfa-settings.sql` last**.
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

Students sign in with email and password only. Administrators require TOTP MFA by default,
with a per-account setting described below.
Password policies, rate limits, ownership rules and finite sessions remain enabled
for everyone.

Run [`supabase/student-password-login.sql`](supabase/student-password-login.sql)
**last**, after the base schema, security, website and blog migrations, before
deploying this version. It removes existing **student** MFA factors and recovery
codes and ends their old sessions; teacher factors are not removed. Students must
sign in again. If you later re-run `schema.sql` or `security.sql`, re-run this
role-policy migration after the older scripts, followed by `admin-mfa-settings.sql`,
because the older scripts enforce MFA for all accounts.

### Per-administrator MFA setting and an additional administrator

Run [`supabase/admin-mfa-settings.sql`](supabase/admin-mfa-settings.sql) after the
student-login and feature migrations. Default behavior is unchanged: every admin
requires MFA unless that specific account has opted out. Missing settings fail
closed to mandatory MFA. This migration neither removes authenticator factors nor
changes student accounts, session limits, passwords or administrator roles.

**Segurança da conta** shows administrators an enable/disable control for their
**own** account only; students never see or use it. Changes require the current
password, rate-limited server verification and a recent TOTP check if MFA is enabled.
Enabling immediately requires configuring/verifying an authenticator, including
on existing AAL1 sessions. Other administrators are unaffected. Changes are logged
atomically and a security email is attempted. The setting table cannot be written
by API callers; only the server-only guarded action or trusted SQL administration
can change it. Reapply this migration after rerunning older security scripts.

To provision the requested additional administrator:

1. Supabase **Authentication → Users → Add user**: create the requested email and
   a unique password of at least **15 characters** directly there, with email auto-confirm enabled. Never put the password
   in a committed SQL script, environment example or command history.
2. Apply `admin-mfa-settings.sql`.
3. Run [`supabase/add-miguel-admin.sql`](supabase/add-miguel-admin.sql). It promotes
   only the specified existing Auth account and initially disables MFA only for it.
   It fails if the Auth account/profile is missing. Rerunning does not disable MFA
   after it has been reactivated. Eliane's role and MFA settings are unchanged.
4. Deploy the matching application code. Sign in and use **Segurança da conta**
   to re-enable MFA when ready. Use a unique strong password; a password shared
   through chat should be changed before real-world use.

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
The current teacher name is Eliane Teixeira; adjust it in the homepage editor.

For a homepage already saved with the old María name, run
[`supabase/professora-teixeira.sql`](supabase/professora-teixeira.sql) instead of
rerunning the full Portuguese migration. It replaces the old name in saved homepage
strings while preserving other text and increasing the revision only when changed.
Update `NEXT_PUBLIC_TEACHER_NAME=Eliane Teixeira` in Vercel as well;
existing environment values override the code default. Keep the verified address
in `EMAIL_FROM`, changing only its display name to `Eliane Teixeira`.
The former `professora-teixeira.sql` rename is a historical migration; run
`eliane-teixeira.sql` afterward for the current identity.
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

#### Optional dedicated demo database fixtures

For an isolated demonstration deployment only, run
[`supabase/demo-reviews.sql`](supabase/demo-reviews.sql) **after `student-reviews.sql`**
on the dedicated demo database. It adds three fictional Portuguese testimonials
to a separate private `demo_student_reviews` table and includes them in the
existing public endpoint. The homepage and editor preview display them normally,
without an on-screen demo label. No fake student accounts, consent records,
lessons or email requests are created. Rerunning does not duplicate fixtures or
overwrite real reviews.

Never apply this optional script to the database used by real students.
To remove the fixtures, run
[`supabase/remove-demo-reviews.sql`](supabase/remove-demo-reviews.sql): it restores
the real-review-only endpoint and removes only the demo table. Reapplying
`student-reviews.sql` also restores the real-review-only endpoint (but keeps the
unused demo table). No application deployment is needed after seeding an
already-configured demo site because its public homepage reads the database.

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

Run [`supabase/teacher-booking.sql`](supabase/teacher-booking.sql), after the
base, security and student-login scripts, before deploying this feature. Reapply
it if you rerun the older security/base scripts, followed by the trial/credit migration below: it replaces cancellation
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

### Removing contacts and student messages

Run [`supabase/admin-removal.sql`](supabase/admin-removal.sql) after the trial
migration before deploying removal controls. Administrators can permanently remove
contacts with no trial history. Contacts with any trial history (including cancelled
trials) are instead hidden from **Novos contatos** and its sidebar count. No lesson
is cancelled and no link/history is removed. **Contatos ocultos → Mostrar novamente**
restores the contact for later account decisions. The teacher calendar still shows
its trial. Removal is serialized with bookings so a simultaneous booking cannot be
orphaned. Converted contacts are not removed by this control.

Every student message has an **Excluir mensagem** button with confirmation. This
permanently removes only that message, not the student account, lessons or an email
already sent. Database RLS restricts deletion to administrators; students cannot
delete their own or others' messages. Missing rows and database errors are reported.

### Database cleanup and comprehensive test fixtures

These scripts are **manual SQL Editor operations**, not application migrations.
They do not run on deployment. Take a backup and check the selected Supabase project
first. Their confirmation flags default to `false`: an unmodified script raises an
error and rolls back, leaving data unchanged.

- [`supabase/empty-contacts-and-messages.sql`](supabase/empty-contacts-and-messages.sql):
  set `confirmed := true` to delete **all contacts**, their trial links and
  trial bookings (including cancelled/converted histories), and **all student messages**.
  Auth users, profiles, regular lessons, credit batches, reviews, articles, settings
  and administrators remain unchanged. This is deliberately more destructive than
  the admin's hide-contact button. It cannot be undone without a backup.
- [`supabase/seed-test-data.sql`](supabase/seed-test-data.sql):
  **dedicated demo database only**, after the normal migration chain including
  [`supabase/admin-removal.sql`](supabase/admin-removal.sql).
  Set `confirmed_demo := true`. It creates the fixtures below in one transaction,
  preserving administrators, working hours, blocked dates and settings. Configure
  enough weekly availability first: future slots obey actual notice, windows,
  blocks and overlaps; insufficient availability rolls back the entire seed.
- [`supabase/remove-test-data.sql`](supabase/remove-test-data.sql):
  set `confirmed_demo := true` to remove only recorded fixtures. It refuses to delete
  repurposed accounts or accounts/contacts with new untracked dependent data.
  Review those rows manually before retrying. Existing administrators and unrelated
  records are preserved. Fixture audit entries remain in the security audit log.

The seed creates:

| Data | Scenarios |
| --- | --- |
| 20 contacts | 01–04 valid unbooked links; 05 expired link; 06–10 future 30-minute trials; 11–12 completed trials ready for approval; 13 declined; 14 hidden with past trial; 15–17 cancelled trials; 18 older than 30 days without a trial; 19 converted; 20 hidden with past trial |
| 10 students | 9 active, 1 inactive; Brazil, New York, France and Japan; objectives and teacher notes |
| 57 regular lessons | 39 completed, 8 future (7 prepaid + 1 gift), 10 cancelled |
| 14 trials | 5 future, 6 past, 3 cancelled |
| Credits | Normal available balances, two batches expiring in 3 days, and expired credits excluded from the available balance |
| 7 reviews | 4 approved and 3 pending, each backed by 5 completed lessons |
| 12 messages | Several messages from the same student and different received dates |
| 3 Portuguese articles | 2 published + 1 draft; each has at least 500 words, 4 sections, Spanish examples and exercises: travel, conversation, false friends/pronunciation |

Names, messages, reviews and articles are presented naturally without visible test
labels on the dedicated demo site. Names are fictional, not actual student identities;
reviews are synthetic and must never be used as real testimonials on production.
Ownership remains recorded privately in `demo_test_fixtures` and Auth metadata.
Emails use the reserved
`example.invalid` domain, phones are empty, and the script sends no notifications.
The ten Auth rows exist only to satisfy profile foreign keys: **no passwords or
login identities**, unconfirmed emails and bans through 2099. Do not use these
accounts for student-login testing or real students. SQL insertion into Auth is
limited to this disposable demo database; real accounts must use Supabase Auth APIs.
Future UI actions can still attempt notifications to these invalid addresses and
will report delivery errors; this dataset does not test real email delivery.
Review-invitation cron has no eligible, unreviewed fixture student to notify at
initial seeding. Contact 18 is intentionally eligible for automatic deletion.

Dates are relative to execution time. The seed uses a private, API-inaccessible
`demo_test_fixtures` registry to track ownership. Rerunning it leaves existing edits
and dates untouched and prints a notice; to refresh dates or replenish removed rows,
run the fixture-removal script and then seed again. Running the all-contacts purge
does not remove this registry or the seeded students; use fixture removal before
reseeding. If a selected historical slot conflicts with existing lessons, the seed
aborts instead of overwriting them.

To replace **only the three seeded article texts**, use the updated
[`supabase/seed-test-data.sql`](supabase/seed-test-data.sql) with both
`confirmed_demo := true` and `refresh_articles := true`, and execute the entire script.
This explicitly overwrites their titles, excerpts and documents, including manual
content edits; back up any edits first. It preserves their IDs, slugs/URLs,
publication statuses and publication dates, all unrelated articles and every
non-blog fixture. Missing or untracked demo articles cause an error and rollback.
Keep `refresh_articles := false` for normal reruns that must preserve content edits.
The third article remains a draft unless you explicitly publish it in the admin.

To update existing fixtures to realistic fictional names and remove legacy visible
labels, additionally set `refresh_demo_presentation := true` in
[`supabase/seed-test-data.sql`](supabase/seed-test-data.sql). For both the new article
content and the natural presentation, enable all three flags (`confirmed_demo`,
`refresh_articles`, `refresh_demo_presentation`) and run the entire script.
This explicitly replaces fixture names and review text, strips legacy message
prefixes and normalizes generated notes/cancellation messages; back up manual edits
first. Only recorded fixtures are changed. Credits, lesson dates, trial links,
review statuses, account bans and non-fixture rows are preserved. Normal reruns
with both refresh flags `false` still preserve all edits.

For demo trial management links, contacts 01–10 have token `i` expressed as 64-digit
lowercase hexadecimal (01 = 63 zeros + `1`, 10 = 63 zeros + `a`). Open
`/trial/<token>` on the demo deployment; contact 05's token is intentionally expired.
These predictable tokens are **strictly demo-only**. Production trial tokens remain
random. Raw tokens are not stored, only their SHA-256 hashes.

If the earlier optional three-testimonial demo was installed, run
[`supabase/remove-demo-reviews.sql`](supabase/remove-demo-reviews.sql) before this
seed to get exactly four public approved reviews without the three extra demo cards.
No real consent is claimed: these are synthetic moderation fixtures.

### Free trials, expiring credits and worldwide lessons

Before deploying this version:

Apply the database migration and deploy the application in a coordinated maintenance
window. The previous contact form used anonymous inserts and immediate account
creation; do not use that older form or create accounts between migration and deployment.

1. Run [`supabase/trial-and-credit-rules.sql`](supabase/trial-and-credit-rules.sql)
   after the base schema, security, student-password-login, teacher-booking
   and student-reviews migrations. If an older script is rerun, reapply this script
   followed by `public-trial-booking.sql`.
2. Run [`supabase/eliane-teixeira.sql`](supabase/eliane-teixeira.sql) after the
   website migration to rename the former default identity to **Eliane Teixeira**.
   It preserves photos, custom text not containing the former name and actual reviews.
3. Run [`supabase/public-trial-booking.sql`](supabase/public-trial-booking.sql) **last**.
   It adds atomic calendar-first onboarding and a rolling 30-day trial horizon.
   Rerunning is safe and preserves existing bookings, contacts, credits and custom
   homepage text. It changes only the former default contact subtitle and submit label.
   Reapply its current version when updating to country-only forms: the legacy city
   RPC parameter becomes optional (empty), with historical city values preserved.
4. Set `NEXT_PUBLIC_TEACHER_NAME=Eliane Teixeira` and update only the display name
   of `EMAIL_FROM`, retaining the verified sending address. Ensure
   `NEXT_PUBLIC_SITE_URL=https://professora-teixeira.site`, email credentials and
   `SECURITY_SECRET` are configured, then deploy.

**Contact to student:** the public contact section first shows available **30-minute**
trials over the next **30 days**, regrouped into the visitor's browser-local days
and hours (including daylight saving). Only free timestamps are sent to the browser,
never contact/student details. This trial horizon is independent of the regular
lesson booking window; teacher working hours, blocks, notice and overlaps still apply.
Clicking a time opens the contact form with a visible summary and an option to go back.
Selecting does not hold the slot: availability is checked again on submission.

The contact form requires only country (default **Brasil**, editable), not city.
Its IANA timezone is detected automatically from the browser and submitted
in a hidden field, without asking the visitor to choose it. Detection errors are
shown explicitly and invalid timezones are rejected by the server.
It creates no Supabase Auth user. Submission atomically saves the contact, creates
a seven-day management link and books the selected trial. If the slot is taken, all
database changes roll back and the visitor must choose another time. Both parties
receive a timezone-specific booking confirmation; the contact's email and on-screen
confirmation include the bearer link `/trial/<token>`, valid for exactly seven days.
Eliane also receives the contact details. Email failure never undoes a saved reservation
and is reported on-screen along with the reserved time and management link.
Only SHA-256 hashes of random 256-bit tokens are stored; trial RPCs are server-only,
the page is not indexed and uses a no-referrer policy. The link grants access only
to that contact's trial, never to the student portal or other contacts. Contact
submissions are rate-limited by normalized email and trusted client IP.
Trial booking/cancellation changes are also limited to ten attempts per link per hour.

The contact can reserve **one active, free, 30-minute online trial**, using the
teacher's working hours, blocks and notice within the 30-day trial window. The seven-day limit
applies to using the link, not to the date of the trial. Trials and regular lessons
share the same transaction lock and overlap checks, including exceptional teacher
bookings. No credits are consumed. Both parties receive timezone-specific emails.
An expired link cannot be used to book or cancel, even if already bookmarked;
Eliane can send a replacement link from the contact card, invalidating the old one.
Email failures are reported explicitly; a failed email never undoes a saved booking.

The contact remains in **Novos contatos**, labelled with their trial time. Starting
at the trial's **start time** (not its end), Eliane may create the student account
or choose **Não criar conta**. Approval is checked again against database time before
creating an Auth user and when marking the contact converted. Refusal disables trial
access. New accounts receive the existing activation email and start with zero credits.
Contacts with trial history are retained for teacher decisions; the 30-day cleanup
only removes unconverted contacts without trial history or a currently valid link.
Existing contacts need a trial link/booking before they can be converted.

**Credit validity:** each positive credit adjustment creates a separate batch.
Default validity is **12 calendar months from the addition**. Eliane can change it
in **Minha agenda → Horários da semana** (1–120 months); only subsequent additions
are affected. A lesson must **finish on or before** its batch's expiry. Booking
uses the earliest-expiring eligible batch, atomically, and unavailable/expired
credits are excluded from the balance and selectable lesson times.
Both teacher and student profiles show exact expiry dates/times. Existing available
credits receive twelve months from the first migration execution, not from unknown
historical purchase dates. Existing charged bookings get a refundable legacy batch;
rerunning the migration neither refills batches nor resets their expiry.

**Cancellation:** students and trial contacts can cancel at least **24 hours before**
the start (exactly 24 hours is permitted); below that threshold the database refuses.
Cancelled trials may be rebooked with the same link only before its expiry. Eliane
can always cancel, with a message. Charged lessons return their original credit
to its original batch **without extending its expiry**; an expired refunded credit
does not reappear in the available balance. Gifts and trials never generate credits.
Rules are shown on the public page, trial page, booking page and credit controls.
Trial invitation, confirmation and cancellation emails omit the 24-hour cancellation
notice; the rule remains visible and enforced on the trial booking page.

**Timezones:** weekly hours, blocks and Eliane's calendar retain the teacher's zone
(`America/Sao_Paulo` by default). Student calendars regroup slots by the student's
local date, even across midnight. Students can edit their country; saving their
profile refreshes the timezone from their browser. Eliane can correct a student's
timezone manually in the admin panel; her browser never overwrites it.
Date-specific UTC offsets in confirmations handle daylight
saving time; ambiguous/nonexistent transition-crossing slots are not offered.
Existing profiles default to the former teacher zone until their location is updated.
City is no longer collected or displayed in forms, contact cards or notifications.
The legacy database columns remain for compatibility; existing city data is not deleted
or overwritten when editing a student.

Targeted validation:
```powershell
node --test tests\trial-credit-rules.test.cjs tests\trial-workflow.test.cjs tests\public-trial-booking.test.cjs
npm run typecheck
```
Set `PGLITE_PATH` as described below to actually execute database tests.

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

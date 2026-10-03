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
| Blog editor | `/admin/blog` | Teacher only, MFA required |
| Public articles | `/blog` | Everyone; published articles only |
| Student portal | `/dashboard` (Book · Profile · Contact teacher) | Students only |

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
   ├─ email.ts           ← sendEmail(): Resend → webhook → console log (placeholder)
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

Settings such as the timezone (default `Europe/Lisbon`), lesson length (60 min), booking window (28 days)
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
- else `EMAIL_WEBHOOK_URL` set → JSON `{to, subject, text, replyTo}` is POSTed (Zapier, Make, n8n…).
- else → delivery fails explicitly. Passwords, activation links and email contents are not printed in logs.

Resend's `onboarding@resend.dev` sender only delivers test emails to the Resend account
owner. To send to students, verify a domain and set `EMAIL_FROM` to an address on it.

## Account security rollout (existing production projects)

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
  configures an authenticator. A mail-delivery failure is shown explicitly, and the
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

If a student loses both their authenticator and recovery codes, the teacher can
reset their authenticator from the student profile **after independently confirming
their identity**. The student must enroll again. If the teacher loses both, the
site owner must remove the factor and revoke sessions using the Supabase admin
tools; there is no public MFA bypass.

### Production acceptance checklist

- New and existing teacher/student accounts cannot access private data before MFA.
- Wrong, expired and replayed activation/recovery links fail.
- A password-recovery email does not bypass an already-enrolled authenticator.
- Save recovery codes outside the browser; test one, then check that reusing it fails.
- After recovery, verify that old sessions cannot access data and that configuring a
  new authenticator is mandatory.
- "Sign out all devices" invalidates existing application sessions, not only refresh
  tokens. Test using two browsers.
- Repeated login/reset/MFA attempts are limited, including across server instances.
- Booking still debits one credit, cancellation refunds once, and concurrent booking
  remains protected after the new RLS policies.
- Failed email delivery is visible without exposing passwords or links in logs.

## Translating to Portuguese

1. Copy `src/lib/i18n/en.ts` to `pt.ts`, translate the values and set `locale: "pt-PT"` (or `"pt-BR"`).
   The `Dictionary` type ensures nothing is missing. Dates, weekday names and `<html lang>` follow `locale` automatically.
2. Register it in `src/lib/i18n/index.ts` and set `NEXT_PUBLIC_LOCALE=pt`.
3. Translate the additional account and security dictionaries under `src/lib/i18n`
   when introducing Portuguese.

## Homepage and blog administration

For an existing project, run these additional migrations **before deploying** the
content-management version:

1. [`supabase/website.sql`](supabase/website.sql), after the base schema and security migration.
2. [`supabase/blog.sql`](supabase/blog.sql), after the base schema and security migration.

Each migration explicitly protects its new tables with the existing MFA gate.
Do not assume the earlier security migration automatically protects future tables.

### Editing the homepage

Open **My website** in the teacher sidebar. Choose Welcome section, About me,
Student testimonials or Contact section. Edit the clearly labelled text fields,
use **Preview my changes** and press **Save and update my website**.

- Saved text is public immediately; there is no need to redeploy.
- The original English content is used until the first save.
- The preview uses the real homepage components; its contact form is disabled.
- Two editors cannot silently overwrite each other: if another window saved first,
  reload before saving.
- Text is rendered as plain text, never as executable HTML.
- Editing the visible teacher/site name does not change login email addresses,
  notification recipients or the teacher's account; those remain separate settings.

### Blog

Open **Blog** in the teacher sidebar to create and edit articles. Drafts stay private;
only published articles appear at `/blog`. Review the article before publishing.
Images use Supabase Storage; configure the bucket and policies by running the blog
migration rather than manually opening storage uploads to the public.

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

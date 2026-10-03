# Spanish lessons – website, teacher panel & student portal

Next.js (App Router) + Tailwind CSS + Supabase (DB, Auth, pg_cron) — deployable on Vercel's free tier.

| Area | URL | Who |
|------|-----|-----|
| Public website + contact form | `/` | Everyone |
| Login | `/login` | Teacher & students |
| Teacher panel | `/admin` (New contacts · My students · Schedule · Messages) | Teacher only |
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
- The service-role key is only used server-side to create student login accounts.

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
2. Add all variables from `.env.example` (with `NEXT_PUBLIC_SITE_URL` = your Vercel URL and a random `CRON_SECRET`).
3. Deploy. `vercel.json` registers a daily cron calling `/api/cron/cleanup-contacts`
   (backup of the pg_cron job that deletes unconverted contacts older than 30 days).

## Emails

`src/lib/email.ts` is the single place that sends emails:

- `RESEND_API_KEY` set → sent with [Resend](https://resend.com) (free tier, 3 000 emails/month).
- else `EMAIL_WEBHOOK_URL` set → JSON `{to, subject, text, html}` is POSTed (Zapier, Make, n8n…).
- else → printed in the server logs (development placeholder).

## Translating to Portuguese

1. Copy `src/lib/i18n/en.ts` to `pt.ts`, translate the values and set `locale: "pt-PT"` (or `"pt-BR"`).
   The `Dictionary` type ensures nothing is missing. Dates, weekday names and `<html lang>` follow `locale` automatically.
2. Register it in `src/lib/i18n/index.ts` and set `NEXT_PUBLIC_LOCALE=pt`.

## Scripts

`npm run dev` · `npm run build` · `npm run start` · `npm run typecheck`

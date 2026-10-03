import "server-only";
import { sendEmail } from "@/lib/email";
import { siteConfig } from "@/lib/config";
import { t } from "@/lib/i18n";
import { emailText as e } from "@/lib/i18n/email";
import { teacherBookingText as tb } from "@/lib/i18n/teacher-booking";
import { reviewText as r } from "@/lib/i18n/reviews";
import { lessonRules as rules } from "@/lib/i18n/lesson-rules";

function spaceAction(path: string, label: string) {
  return { label, url: new URL(path, siteConfig.siteUrl).href };
}

/** All automatic emails of the app, in one place. */

export function notifyTeacherNewContact(c: { name: string; email: string; phone: string; message: string; country?: string; city?: string; timezone?: string; trialWhen?: string }) {
  return sendEmail({
    to: siteConfig.teacherEmail,
    subject: t.emails.newContact.subject(c.name),
    text: t.emails.newContact.body(c) + (c.trialWhen ? `\n\n${rules.trialBooked}\n${c.trialWhen}` : "") +
      (c.timezone ? `\n\n${c.city}, ${c.country}\n${rules.timezone}: ${c.timezone}` : ""),
    replyTo: c.email,
    presentation: { title: e.newContact, preview: e.contactPreview, action: spaceAction("/admin/contacts", e.teacherSpace) },
  });
}

export function sendStudentInvitation(p: { name: string; email: string; url: string }) {
  return sendEmail({
    to: p.email,
    subject: t.emails.credentials.subject,
    text: t.emails.credentials.body(p),
    replyTo: siteConfig.teacherEmail,
    presentation: { title: e.invitation, preview: e.invitationPreview, action: { label: e.activate, url: p.url } },
  });
}

export function sendPasswordReset(p: { name: string; email: string; url: string }) {
  return sendEmail({
    to: p.email,
    subject: t.emails.passwordReset.subject,
    text: t.emails.passwordReset.body(p),
    replyTo: siteConfig.teacherEmail,
    presentation: { title: e.passwordReset, preview: e.resetPreview, action: { label: e.reset, url: p.url } },
  });
}

export function sendCancellationNotice(p: { name: string; email: string; when: string; message: string; refundedCredits?: number; byStudent?: boolean }) {
  const note = p.refundedCredits === 0 ? tb.giftCancellationBody : rules.refund;
  return sendEmail({
    to: p.email,
    subject: p.refundedCredits === 0 ? tb.giftCancellationSubject(p.when) : t.emails.cancellation.subject(p.when),
    text: p.byStudent ? `${e.hello(p.name)}\n\n${rules.studentCancelled}\n${p.when}\n\n${note}`
      : t.emails.cancellation.body(p) + (p.refundedCredits === 0 ? "" : `\n\n${rules.refund}`),
    replyTo: siteConfig.teacherEmail,
    presentation: {
      title: e.cancellation, preview: p.refundedCredits === 0 ? tb.giftCancellationBody : e.cancellationPreview,
      paragraphs: [e.hello(p.name), p.byStudent ? rules.studentCancelled : e.cancellationIntro],
      details: [{ label: e.lessonTime, value: p.when }, ...(p.byStudent ? [] : [{ label: e.teacherMessage, value: p.message }])],
      note,
      action: spaceAction("/dashboard", e.studentSpace),
    },
  });
}

export async function sendBookingEmails(p: { name: string; email: string; when: string; teacherWhen?: string; creditsUsed?: number }) {
  const giftNote = p.creditsUsed === 0 ? `\n\n${tb.giftBookingNote}` : "";
  const results = await Promise.all([
    sendEmail({
      to: p.email,
      subject: t.emails.bookingConfirmation.subject(p.when),
      text: t.emails.bookingConfirmation.body(p) + giftNote + `\n\n${rules.cancellation}`,
      replyTo: siteConfig.teacherEmail,
      presentation: {
        title: e.booking, preview: e.bookingPreview,
        paragraphs: [e.hello(p.name), e.bookingIntro],
        details: [
          { label: e.lessonTime, value: p.when },
          { label: e.credit, value: p.creditsUsed === 0 ? e.gifted : e.creditUsed },
        ],
        note: rules.cancellation,
        action: spaceAction("/dashboard", e.studentSpace),
      },
    }),
    sendEmail({
      to: siteConfig.teacherEmail,
      subject: t.emails.teacherNewBooking.subject(p.name, p.teacherWhen ?? p.when),
      text: t.emails.teacherNewBooking.body({ ...p, when: p.teacherWhen ?? p.when }) + giftNote,
      replyTo: p.email,
      presentation: {
        title: e.teacherBooking, preview: e.bookingPreview,
        paragraphs: [e.teacherBookingIntro],
        details: [
          { label: e.student, value: p.name || p.email },
          { label: e.lessonTime, value: p.teacherWhen ?? p.when },
          { label: e.credit, value: p.creditsUsed === 0 ? e.gifted : e.creditUsed },
        ],
        action: spaceAction("/admin/schedule", e.teacherSpace),
      },
    }),
  ]);
  return { ok: results.every((result) => result.ok) };
}

export function sendTrialInvitation(p: { name: string; email: string; token: string }) {
  const action = spaceAction(`/trial/${p.token}`, rules.inviteAction);
  return sendEmail({
    to: p.email, subject: rules.inviteSubject, replyTo: siteConfig.teacherEmail,
    text: `${e.hello(p.name)}\n\n${rules.trialInfo}\n\n${action.url}`,
    presentation: {
      title: rules.trialTitle, preview: rules.trialInfo, paragraphs: [e.hello(p.name), rules.trialInfo],
      action,
    },
  });
}

export async function sendTrialBookingEmails(p: {
  name: string; email: string; when: string; teacherWhen: string; cancelled?: boolean; message?: string; token?: string;
}) {
  const title = p.cancelled ? rules.cancelled : rules.trialBooked;
  const action = p.token ? spaceAction(`/trial/${p.token}`, rules.manageTrial) : undefined;
  const results = await Promise.all([
    sendEmail({
      to: p.email, subject: `${title} · ${p.when}`, replyTo: siteConfig.teacherEmail,
      text: `${e.hello(p.name)}\n\n${title}\n${rules.trialLabel}\n${p.when}\n${p.message ?? ""}` +
        (action ? `\n\n${rules.linkDuration}\n${action.url}` : ""),
      presentation: { title, preview: p.when, paragraphs: [e.hello(p.name), rules.trialLabel],
        details: [{ label: e.lessonTime, value: p.when }, ...(p.message ? [{ label: e.teacherMessage, value: p.message }] : [])],
        ...(action ? { action, note: rules.linkDuration } : {}) },
    }),
    sendEmail({
      to: siteConfig.teacherEmail, subject: `${title} · ${p.name} · ${p.teacherWhen}`, replyTo: p.email,
      text: `${title}\n${rules.trialLabel}\n${p.name}\n${p.teacherWhen}\n${p.message ?? ""}`,
      presentation: { title, preview: p.teacherWhen,
        details: [{ label: e.student, value: p.name }, { label: e.lessonTime, value: p.teacherWhen }],
        action: spaceAction("/admin/contacts", e.teacherSpace) },
    }),
  ]);
  return { ok: results.every((result) => result.ok) };
}

export function sendStudentMessageToTeacher(p: { name: string; email: string; message: string }) {
  return sendEmail({
    to: siteConfig.teacherEmail,
    subject: t.emails.studentMessage.subject(p.name),
    text: t.emails.studentMessage.body(p),
    replyTo: p.email,
    presentation: { title: e.studentMessage, preview: e.messagePreview, action: spaceAction("/admin/messages", e.teacherSpace) },
  });
}

export function sendReviewInvitation(p: { id: string; name: string; email: string }) {
  const action = spaceAction("/dashboard/review", r.write);
  return sendEmail({
    to: p.email, subject: r.emailSubject,
    text: `${e.hello(p.name)}\n\n${r.emailIntro}\n\n${r.emailNote}\n\n${action.url}`,
    replyTo: siteConfig.teacherEmail, idempotencyKey: `review-invitation-${p.id}`,
    presentation: {
      title: r.invitationTitle, preview: r.emailIntro,
      paragraphs: [e.hello(p.name), r.emailIntro], note: r.emailNote, action,
    },
  });
}

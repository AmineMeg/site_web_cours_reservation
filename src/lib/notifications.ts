import "server-only";
import { sendEmail } from "@/lib/email";
import { siteConfig } from "@/lib/config";
import { t } from "@/lib/i18n";
import { emailText as e } from "@/lib/i18n/email";
import { teacherBookingText as tb } from "@/lib/i18n/teacher-booking";
import { reviewText as r } from "@/lib/i18n/reviews";

function spaceAction(path: string, label: string) {
  return { label, url: new URL(path, siteConfig.siteUrl).href };
}

/** All automatic emails of the app, in one place. */

export function notifyTeacherNewContact(c: { name: string; email: string; phone: string; message: string }) {
  return sendEmail({
    to: siteConfig.teacherEmail,
    subject: t.emails.newContact.subject(c.name),
    text: t.emails.newContact.body(c),
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

export function sendCancellationNotice(p: { name: string; email: string; when: string; message: string; refundedCredits?: number }) {
  return sendEmail({
    to: p.email,
    subject: p.refundedCredits === 0 ? tb.giftCancellationSubject(p.when) : t.emails.cancellation.subject(p.when),
    text: t.emails.cancellation.body(p),
    replyTo: siteConfig.teacherEmail,
    presentation: {
      title: e.cancellation, preview: p.refundedCredits === 0 ? tb.giftCancellationBody : e.cancellationPreview,
      paragraphs: [e.hello(p.name), e.cancellationIntro],
      details: [{ label: e.lessonTime, value: p.when }, { label: e.teacherMessage, value: p.message }],
      note: p.refundedCredits === 0 ? tb.giftCancellationBody : e.refundNote,
      action: spaceAction("/dashboard", e.studentSpace),
    },
  });
}

export async function sendBookingEmails(p: { name: string; email: string; when: string; creditsUsed?: number }) {
  const giftNote = p.creditsUsed === 0 ? `\n\n${tb.giftBookingNote}` : "";
  const results = await Promise.all([
    sendEmail({
      to: p.email,
      subject: t.emails.bookingConfirmation.subject(p.when),
      text: t.emails.bookingConfirmation.body(p) + giftNote,
      replyTo: siteConfig.teacherEmail,
      presentation: {
        title: e.booking, preview: e.bookingPreview,
        paragraphs: [e.hello(p.name), e.bookingIntro],
        details: [
          { label: e.lessonTime, value: p.when },
          { label: e.credit, value: p.creditsUsed === 0 ? e.gifted : e.creditUsed },
        ],
        action: spaceAction("/dashboard", e.studentSpace),
      },
    }),
    sendEmail({
      to: siteConfig.teacherEmail,
      subject: t.emails.teacherNewBooking.subject(p.name, p.when),
      text: t.emails.teacherNewBooking.body(p) + giftNote,
      replyTo: p.email,
      presentation: {
        title: e.teacherBooking, preview: e.bookingPreview,
        paragraphs: [e.teacherBookingIntro],
        details: [
          { label: e.student, value: p.name || p.email },
          { label: e.lessonTime, value: p.when },
          { label: e.credit, value: p.creditsUsed === 0 ? e.gifted : e.creditUsed },
        ],
        action: spaceAction("/admin/schedule", e.teacherSpace),
      },
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

import "server-only";
import { sendEmail } from "@/lib/email";
import { siteConfig } from "@/lib/config";
import { t } from "@/lib/i18n";

/** All automatic emails of the app, in one place. */

export function notifyTeacherNewContact(c: { name: string; email: string; phone: string; message: string }) {
  return sendEmail({
    to: siteConfig.teacherEmail,
    subject: t.emails.newContact.subject(c.name),
    text: t.emails.newContact.body(c),
    replyTo: c.email,
  });
}

export function sendStudentCredentials(p: { name: string; email: string; password: string }) {
  return sendEmail({
    to: p.email,
    subject: t.emails.credentials.subject,
    text: t.emails.credentials.body({ ...p, url: siteConfig.siteUrl }),
  });
}

export function sendNewPassword(p: { name: string; email: string; password: string }) {
  return sendEmail({
    to: p.email,
    subject: t.emails.passwordReset.subject,
    text: t.emails.passwordReset.body({ ...p, url: siteConfig.siteUrl }),
  });
}

export function sendCancellationNotice(p: { name: string; email: string; when: string; message: string }) {
  return sendEmail({
    to: p.email,
    subject: t.emails.cancellation.subject(p.when),
    text: t.emails.cancellation.body(p),
    replyTo: siteConfig.teacherEmail,
  });
}

export async function sendBookingEmails(p: { name: string; email: string; when: string }) {
  await Promise.all([
    sendEmail({
      to: p.email,
      subject: t.emails.bookingConfirmation.subject(p.when),
      text: t.emails.bookingConfirmation.body(p),
      replyTo: siteConfig.teacherEmail,
    }),
    sendEmail({
      to: siteConfig.teacherEmail,
      subject: t.emails.teacherNewBooking.subject(p.name, p.when),
      text: t.emails.teacherNewBooking.body(p),
    }),
  ]);
}

export function sendStudentMessageToTeacher(p: { name: string; email: string; message: string }) {
  return sendEmail({
    to: siteConfig.teacherEmail,
    subject: t.emails.studentMessage.subject(p.name),
    text: t.emails.studentMessage.body(p),
    replyTo: p.email,
  });
}

/** Texts of the account security area (/security). Keep keys when translating. */
export const securityText = {
  title: "Account security",
  continue: "Continue",
  back: "Back",
  signOut: "Sign out",
  error: "We could not complete this request. Please try again.",
  tooManyAttempts: "Too many attempts. Please wait a few minutes before trying again.",
  invalidCode: "This code is not correct. Check the code in your app and try again.",

  codeLabel: "6-digit code from your authenticator app",
  verifyButton: "Verify",
  verifying: "Checking…",

  setupTitle: "Protect your account",
  setupIntro:
    "For your safety, every account uses a second step at sign-in: a 6-digit code from a free authenticator app (for example Google Authenticator, Microsoft Authenticator or 1Password).",
  replaceTitle: "Use a new authenticator app",
  replaceIntro:
    "Set up your new phone or app. Your previous authenticator will stop working as soon as the new one is confirmed.",
  setupStart: "Start the setup",
  setupStarting: "Preparing…",
  scanQr: "1. Open your authenticator app and scan this QR code.",
  manualKey: "Cannot scan? Enter this key in the app instead:",
  enterCode: "2. Type the 6-digit code the app shows.",
  confirmSetup: "Confirm",
  setupExpired: "This setup has expired. Please start again.",
  alreadyEnrolled: "An authenticator app is already active on this account.",

  codesTitle: "Save your recovery codes",
  codesIntro:
    "If you lose your phone, one of these codes (with your password) lets you set up a new authenticator. Each code works once. They are shown only now: print them, download them or write them down and keep them somewhere safe.",
  codesCopy: "Copy",
  codesCopied: "Copied",
  codesDownload: "Download",
  codesFileName: "recovery-codes.txt",
  codesSaved: "I have saved my recovery codes",
  codesStoreFailed:
    "Your authenticator app is active, but the recovery codes could not be saved. Open “Account security” to create new codes.",

  verifyTitle: "Enter your security code",
  verifyIntro: "Open your authenticator app and type the 6-digit code for this site.",
  lostDevice: "Lost your phone? Use a recovery code",

  reauthTitle: "Confirm it’s you",
  reauthIntro: "For this sensitive change, please enter a fresh 6-digit code from your authenticator app.",

  recoverTitle: "Use a recovery code",
  recoverIntro:
    "Enter your password and one of your recovery codes. For safety we will sign you out everywhere, remove your old authenticator and ask you to set up a new one.",
  passwordLabel: "Password",
  recoveryCodeLabel: "Recovery code",
  recoverButton: "Reset my authenticator",
  recovering: "Checking…",
  recoverFailed: "The password or recovery code is not correct.",
  recoverNoCodes:
    "No recovery code left? Ask your teacher (or the site owner) to reset your authenticator after confirming your identity.",
  backToCode: "Back to the 6-digit code",

  settingsTitle: "Account security",
  settingsIntro: "Your sign-in is protected by your password and an authenticator app.",
  factorTitle: "Authenticator app",
  factorOn: "On — a 6-digit code is required at every sign-in.",
  replaceFactor: "Use a new phone or app",
  codesSectionTitle: "Recovery codes",
  codesRemaining: (n: number) => (n === 1 ? "1 unused recovery code left." : `${n} unused recovery codes left.`),
  codesLow: "You are running out of recovery codes. Create new ones.",
  regenerateCodes: "Create new recovery codes",
  regenerateIntro: "Creating new codes cancels all your previous codes.",
  regenerating: "Creating…",
  sessionTitle: "Sessions",
  sessionLimits: "For your safety you are signed out automatically after a period without activity, and in any case some hours after signing in.",

  sessionEndsAt: (when: string) => `This session ends at the latest on ${when}.`,
  signOutOthers: "Sign out my other devices",
  signingOut: "Signing out…",
  signedOutOthers: "All your other devices have been signed out.",
  signOutAll: "Sign out everywhere (including here)",
  activityTitle: "Recent security activity",
  noActivity: "No recent activity.",
  backToApp: "Back to my space",
  studentMfaReset: "The student's authenticator was removed and all their sessions ended. At their next sign-in they will set up a new one.",
  resetStudentMfa: "Reset this student's authenticator",

  events: {
    "mfa.enrolled": "Authenticator app set up",
    "mfa.factor_replaced": "Authenticator app replaced",
    "mfa.recovery_codes_generated": "New recovery codes created",
    "mfa.recovery_code_used": "Recovery code used",
    "mfa.recovery_code_rejected": "Wrong recovery code",
    "mfa.reset_by_recovery": "Authenticator reset with a recovery code",
    "mfa.reset_by_teacher": "Authenticator reset by the teacher",
    "mfa.verify_failed": "Wrong security code",
    "mfa.verified": "Signed in with security code",
    "reauth.succeeded": "Identity confirmed",
    "login.password_ok": "Password accepted",
    "session.revoked_all": "Signed out everywhere",
    "session.revoked_others": "Other devices signed out",
    "session.expired": "Session expired",
    "profile.sensitive_update": "Account details changed",
    "credits.changed": "Lesson credits changed",
    "password.changed": "Password changed",
    "password.reset_completed": "Password reset with an email link",
    "password.reset_requested": "Password reset email requested",
    "invite.sent": "Invitation sent",
    "invite.accepted": "Invitation accepted",
    "admin.student_updated": "Account updated by the teacher",
  } as Record<string, string>,

  alertSubject: "Security alert for your account",
  alertBody: (what: string) =>
    `Hello,\n\nThis is an automatic message: ${what}\n\nIf this was not you, contact your teacher immediately.\n`,
  alerts: {
    mfa_enrolled: "an authenticator app was set up on your account.",
    mfa_replaced: "the authenticator app of your account was replaced.",
    recovery_used: "a recovery code was used to reset the authenticator of your account. All sessions were signed out.",
    codes_regenerated: "new recovery codes were created for your account. The previous codes no longer work.",
    signed_out_everywhere: "your account was signed out on all devices.",
  },
};

export type SessionEndReason =
  | "idle_timeout"
  | "absolute_timeout"
  | "revoked"
  | "signed_out"
  | "account_inactive"
  | "account_missing"
  | "signed_out_everywhere"
  | "mfa_reset";

const sessionEndedMessages: Record<SessionEndReason, string> = {
  idle_timeout: "You were signed out after a period without activity. Please sign in again.",
  absolute_timeout: "For your safety, sessions last a limited time. Please sign in again.",
  revoked: "Your session was ended (for example after a password or security change). Please sign in again.",
  signed_out: "You are signed out.",
  account_inactive: "This account is paused. Please contact your teacher.",
  account_missing: "This account is not ready yet. Please contact your teacher.",
  signed_out_everywhere: "You have been signed out on all your devices.",
  mfa_reset: "Your authenticator was reset. Sign in with your password to set up a new one.",
};

/** Message for /login?reason=… (unknown reasons → null). */
export function sessionEndedMessage(reason: unknown): string | null {
  return typeof reason === "string" && Object.hasOwn(sessionEndedMessages, reason)
    ? sessionEndedMessages[reason as SessionEndReason]
    : null;
}
"use client";

import { useState, useTransition } from "react";
import { confirmTotpEnrollment, startTotpEnrollment, type EnrollmentStart } from "@/app/security/actions";
import { buttonClass } from "@/components/ui/button";
import { Notice } from "@/components/ui/Notice";
import { RecoveryCodesDisplay } from "./RecoveryCodesDisplay";
import { securityText as s } from "@/lib/i18n/security";

export function MfaSetupWizard({ replace, doneHref }: { replace: boolean; doneHref: string }) {
  const [pending, startTransition] = useTransition();
  const [enrollment, setEnrollment] = useState<EnrollmentStart | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState("");
  const [code, setCode] = useState("");

  function start() {
    setMessage("");
    startTransition(async () => {
      const result = await startTotpEnrollment(replace);
      if (result.ok) setEnrollment(result);
      else setMessage(result.message);
    });
  }

  function confirm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!enrollment?.factorId) return;
    setMessage("");
    startTransition(async () => {
      const result = await confirmTotpEnrollment(enrollment.factorId!, code, replace);
      if (!result.ok) {
        setMessage(result.message);
        if (result.message === s.setupExpired) setEnrollment(null);
        return;
      }
      setCode("");
      setDone(true);
      if (result.codes) setCodes(result.codes);
      else setMessage(result.message);
    });
  }

  if (done) {
    return codes ? (
      <RecoveryCodesDisplay codes={codes} doneHref={doneHref} />
    ) : (
      <div className="space-y-4">
        {message && <Notice ok={false}>{message}</Notice>}
        <a href={doneHref} className={buttonClass("primary", "lg", "w-full")}>{s.continue}</a>
      </div>
    );
  }

  if (!enrollment) {
    return (
      <div className="space-y-4">
        {message && <Notice ok={false}>{message}</Notice>}
        <button type="button" onClick={start} disabled={pending} className={buttonClass("primary", "xl", "w-full")}>
          {pending ? s.setupStarting : s.setupStart}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={confirm} className="space-y-5">
      <p className="text-lg font-semibold">{s.scanQr}</p>
      {enrollment.qrCode && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={enrollment.qrCode} alt="" width={208} height={208} className="mx-auto h-52 w-52 rounded-xl bg-white p-2" />
      )}
      <div>
        <p className="text-stone-600">{s.manualKey}</p>
        <p className="mt-1 select-all break-all rounded-xl bg-stone-100 p-3 font-mono text-lg">{enrollment.secret}</p>
      </div>
      <div>
        <label htmlFor="totp-setup-code" className="label">{s.enterCode}</label>
        <input
          id="totp-setup-code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]{6,7}"
          maxLength={7}
          required
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="input text-center font-mono text-2xl tracking-widest"
        />
      </div>
      {message && <Notice ok={false}>{message}</Notice>}
      <button type="submit" disabled={pending} className={buttonClass("primary", "xl", "w-full")}>
        {pending ? s.verifying : s.confirmSetup}
      </button>
    </form>
  );
}
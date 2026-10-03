"use client";

import { useState, useTransition } from "react";
import { cancelLesson, cancelTrialByTeacher } from "@/app/admin/actions";
import { Modal } from "@/components/ui/Modal";
import { Notice } from "@/components/ui/Notice";
import { buttonClass } from "@/components/ui/button";
import { t } from "@/lib/i18n";
import { teacherBookingText as tb } from "@/lib/i18n/teacher-booking";
import type { ActionResult, StudentCard } from "@/lib/types";
import { lessonRules as r } from "@/lib/i18n/lesson-rules";

export interface LessonItem {
  id: string;
  timeLabel: string;
  whenLabel: string;
  student: StudentCard | null;
  creditsUsed: number;
  kind?: "trial";
}

export function LessonModal({ lesson, onClose }: { lesson: LessonItem | null; onClose: () => void }) {
  const m = t.admin.lessonModal;
  const [step, setStep] = useState<"view" | "confirm">("view");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  const close = () => {
    setStep("view");
    setMessage("");
    setResult(null);
    onClose();
  };

  const confirmCancel = () =>
    startTransition(async () => {
      setResult(await (lesson!.kind === "trial" ? cancelTrialByTeacher(lesson!.id, message) : cancelLesson(lesson!.id, message)));
    });

  const student = lesson?.student;

  return (
    <Modal open={!!lesson} onClose={close} title={lesson ? `${m.title} · ${lesson.whenLabel}` : ""}>
      {lesson && result?.ok ? (
        <div className="space-y-4">
          <Notice ok>{result.message}</Notice>
          <button type="button" onClick={close} className={buttonClass("primary", "xl", "w-full")}>
            {t.common.close}
          </button>
        </div>
      ) : lesson && step === "view" ? (
        <div className="space-y-5">
          <section className="rounded-2xl bg-stone-50 p-5">
            <p className="text-sm font-semibold uppercase tracking-wide text-stone-500">{m.student}</p>
            <p className="text-2xl font-bold">{student?.full_name || student?.email || "—"}</p>
            {student?.phone && (
              <a href={`tel:${student.phone}`} className="mt-3 flex min-h-14 items-center gap-3 rounded-xl bg-white px-4 text-xl font-semibold text-brand-700 ring-1 ring-stone-200">
                📞 {student.phone}
              </a>
            )}
            {student?.email && (
              <a href={`mailto:${student.email}`} className="mt-2 flex min-h-14 items-center gap-3 break-all rounded-xl bg-white px-4 text-lg font-medium text-brand-700 ring-1 ring-stone-200">
                📧 {student.email}
              </a>
            )}
            <p className="mt-4 text-sm font-semibold uppercase tracking-wide text-stone-500">{m.objectives}</p>
            <p className="whitespace-pre-line text-lg">{student?.objectives || m.noObjectives}</p>
            {student?.timezone && <p className="mt-3 text-stone-600">{r.timezone}: {student.timezone}</p>}
            {student && lesson.kind !== "trial" && <p className="mt-3 text-stone-600">{t.common.credits(student.credits)}</p>}
            <p className="mt-2 font-semibold">{lesson.kind === "trial" ? r.trialLabel : lesson.creditsUsed === 0 ? tb.giftLabel : tb.creditLabel}</p>
          </section>
          <button type="button" onClick={() => setStep("confirm")} className={buttonClass("danger", "xl", "w-full")}>
            ❌ {m.cancelClass}
          </button>
        </div>
      ) : lesson ? (
        <div className="space-y-4">
          <h3 className="text-xl font-bold text-red-700">{m.cancelTitle}</h3>
          <p className="text-lg text-stone-700">{lesson.creditsUsed === 0 ? tb.cancelGiftHelp : m.cancelHelp}</p>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            maxLength={2000}
            placeholder={m.cancelPlaceholder}
            className="input"
            aria-label={lesson.creditsUsed === 0 ? tb.cancelGiftHelp : m.cancelHelp}
            autoFocus
          />
          {result && !result.ok && <Notice ok={false}>{result.message}</Notice>}
          <button
            type="button"
            onClick={confirmCancel}
            disabled={pending || !message.trim()}
            className={buttonClass("danger", "xl", "w-full")}
          >
            {pending ? m.cancelling : m.confirmCancel}
          </button>
          <button type="button" onClick={() => setStep("view")} disabled={pending} className={buttonClass("secondary", "lg", "w-full")}>
            {m.keep}
          </button>
        </div>
      ) : null}
    </Modal>
  );
}

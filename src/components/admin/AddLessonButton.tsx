"use client";

import { useRef, useState, useTransition } from "react";
import { addTeacherLesson } from "@/app/admin/actions";
import { Modal } from "@/components/ui/Modal";
import { Notice } from "@/components/ui/Notice";
import { buttonClass } from "@/components/ui/button";
import { teacherBookingText as b } from "@/lib/i18n/teacher-booking";
import { t } from "@/lib/i18n";
import type { ActionResult } from "@/lib/types";

export interface BookingStudent {
  id: string;
  full_name: string;
  email: string;
  credits: number;
}

export function AddLessonButton({ students, today, timezone, lessonMinutes, initialStudentId }: {
  students: BookingStudent[];
  today: string;
  timezone: string;
  lessonMinutes: number;
  initialStudentId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [studentId, setStudentId] = useState(initialStudentId ?? "");
  const [day, setDay] = useState(today);
  const [time, setTime] = useState("09:00");
  const [useCredit, setUseCredit] = useState(true);
  const [exceptional, setExceptional] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const request = useRef<{ signature: string; id: string } | null>(null);
  const student = students.find((item) => item.id === studentId);
  function close() {
    if (pending) return;
    setOpen(false);
    setResult(null);
    request.current = null;
  }
  return <>
    <button type="button" className={buttonClass("primary", "lg")} onClick={() => setOpen(true)}>
      ＋ {b.add}
    </button>
    <Modal open={open} onClose={close} title={b.title}>
      {result?.ok ? <div className="space-y-5">
        <Notice ok>{result.message}</Notice>
        <button type="button" onClick={close} className={buttonClass("primary", "xl", "w-full")}>{t.common.close}</button>
      </div> : students.length === 0 ? <Notice ok={false}>{b.noStudents}</Notice> :
        <form className="space-y-5" onSubmit={(event) => {
          event.preventDefault();
          if (pending) return;
          const signature = JSON.stringify({ studentId, day, time, useCredit, exceptional });
          if (request.current?.signature !== signature) request.current = { signature, id: crypto.randomUUID() };
          const requestId = request.current.id;
          setResult(null);
          startTransition(async () => {
            try {
              setResult(await addTeacherLesson({ studentId, day, time, useCredit, exceptional, requestId }));
            } catch {
              console.error("[admin] Teacher booking request interrupted");
              setResult({ ok: false, message: b.error });
            }
          });
        }}>
          <p className="text-lg text-stone-600">{b.intro}</p>
          <p className="text-stone-600">{t.common.timezoneNote(timezone)} {b.duration(lessonMinutes)}</p>
          <fieldset disabled={pending} className="space-y-4">
            <div>
              <label htmlFor="lesson-student" className="label">{b.student}</label>
              <select id="lesson-student" required value={studentId} onChange={(event) => setStudentId(event.target.value)} className="input">
                <option value="">{b.chooseStudent}</option>
                {students.map((item) => <option key={item.id} value={item.id}>{item.full_name || item.email}</option>)}
              </select>
              {student && <p className="mt-2 text-stone-600">{b.balance(student.credits)}</p>}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label htmlFor="lesson-day" className="label">{b.day}</label>
                <input id="lesson-day" type="date" required min={today} value={day} onChange={(event) => setDay(event.target.value)} className="input" /></div>
              <div><label htmlFor="lesson-time" className="label">{b.time}</label>
                <input id="lesson-time" type="time" required step={60} value={time} onChange={(event) => setTime(event.target.value)} className="input" /></div>
            </div>
            <fieldset className="space-y-3">
              <legend className="sr-only">{b.useCredit}</legend>
              <label className="flex min-h-14 items-center gap-3 rounded-xl border p-4 text-lg">
                <input type="radio" name="lesson-credit" checked={useCredit} onChange={() => setUseCredit(true)} className="h-5 w-5" />{b.useCredit}
              </label>
              <label className="flex min-h-14 items-center gap-3 rounded-xl border p-4 text-lg">
                <input type="radio" name="lesson-credit" checked={!useCredit} onChange={() => setUseCredit(false)} className="h-5 w-5" />{b.gift}
              </label>
            </fieldset>
            {useCredit && student && student.credits < 1 && <Notice ok={false}>{b.noCredits}</Notice>}
            <label className="flex min-h-14 items-center gap-3 text-lg font-semibold">
              <input type="checkbox" checked={exceptional} onChange={(event) => setExceptional(event.target.checked)} className="h-5 w-5" />{b.exceptional}
            </label>
            <p className={exceptional ? "rounded-xl bg-amber-50 p-3 text-amber-900" : "text-stone-600"}>
              {exceptional ? b.exceptionalHelp : b.availableHelp}
            </p>
          </fieldset>
          {result && <Notice ok={false}>{result.message}</Notice>}
          <button type="submit" disabled={pending || !student || (useCredit && student.credits < 1)} className={buttonClass("primary", "xl", "w-full")}>
            {pending ? b.confirming : b.confirm}
          </button>
        </form>}
    </Modal>
  </>;
}

"use client";

import Link from "next/link";
import { useState } from "react";
import { CreditControl } from "@/components/admin/CreditControl";
import { buttonClass } from "@/components/ui/button";
import { t } from "@/lib/i18n";
import type { Profile } from "@/lib/types";

type Row = Pick<Profile, "id" | "full_name" | "email" | "phone" | "credits" | "is_active">;

export function StudentList({ students, validityMonths }: { students: Row[]; validityMonths: number }) {
  const s = t.admin.students;
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const filtered = q
    ? students.filter((st) => `${st.full_name} ${st.email} ${st.phone}`.toLowerCase().includes(q))
    : students;
  const active = filtered.filter((st) => st.is_active);
  const paused = filtered.filter((st) => !st.is_active);

  return (
    <div className="space-y-6">
      {students.length > 5 && (
        <div>
          <label htmlFor="search" className="label">
            🔍 {s.search}
          </label>
          <input id="search" value={query} onChange={(e) => setQuery(e.target.value)} className="input max-w-md" />
        </div>
      )}
      <ul className="space-y-4">
        {active.map((st) => (
          <StudentRow key={st.id} student={st} validityMonths={validityMonths} />
        ))}
      </ul>
      {paused.length > 0 && (
        <details className="rounded-2xl border border-stone-200 bg-white p-4">
          <summary className="cursor-pointer text-lg font-semibold">
            {s.inactiveTitle} ({paused.length})
          </summary>
          <ul className="mt-4 space-y-4">
            {paused.map((st) => (
              <StudentRow key={st.id} student={st} validityMonths={validityMonths} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function StudentRow({ student, validityMonths }: { student: Row; validityMonths: number }) {
  return (
    <li className="card flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <Link href={`/admin/students/${student.id}`} className="text-2xl font-bold text-stone-900 hover:text-brand-700 hover:underline">
          {student.full_name || student.email}
        </Link>
        {!student.is_active && (
          <span className="ml-2 rounded-full bg-stone-200 px-3 py-1 text-sm font-semibold">{t.admin.students.paused}</span>
        )}
        <p className="break-all text-stone-600">📧 {student.email}</p>
        {student.phone && <p className="text-stone-600">📞 {student.phone}</p>}
        <Link href={`/admin/students/${student.id}`} className={buttonClass("secondary", "md", "mt-2")}>
          {t.admin.students.openProfile} →
        </Link>
      </div>
      <CreditControl studentId={student.id} initialCredits={student.credits} validityMonths={validityMonths} />
    </li>
  );
}

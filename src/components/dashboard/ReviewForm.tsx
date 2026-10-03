"use client";
import { useActionState } from "react";
import { submitReview, withdrawReview } from "@/app/dashboard/review/actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Notice } from "@/components/ui/Notice";
import { reviewText as r } from "@/lib/i18n/reviews";
import type { StudentReview } from "@/lib/reviews";

export function ReviewForm({ name }: { name: string }) {
  const [state, action] = useActionState(submitReview, null);
  if (state?.ok) return <Notice ok>{state.message}</Notice>;
  return <form action={action} className="card space-y-5">
    <div>
      <label htmlFor="review-name" className="label">{r.name}</label>
      <p className="mb-2 text-stone-600">{r.nameHelp}</p>
      <input id="review-name" name="name" className="input" defaultValue={name.split(" ")[0]} required maxLength={80} />
    </div>
    <div>
      <label htmlFor="review-quote" className="label">{r.quote}</label>
      <textarea id="review-quote" name="quote" className="input" rows={6} required minLength={20} maxLength={2000} />
    </div>
    <label className="flex gap-3 rounded-xl bg-stone-50 p-4 text-lg">
      <input type="checkbox" name="consent" required className="mt-1 h-6 w-6 shrink-0" />{r.consent}
    </label>
    {state && <Notice ok={state.ok}>{state.message}</Notice>}
    <SubmitButton pendingText={r.sending}>{r.submit}</SubmitButton>
  </form>;
}

export function SubmittedReview({ review }: { review: StudentReview }) {
  const [state, action] = useActionState(withdrawReview, null);
  return <div className="card space-y-4">
    <p className="text-lg font-semibold">{r[review.status === "withdrawn" ? "withdrawn" : review.status]}</p>
    <blockquote className="whitespace-pre-wrap [overflow-wrap:anywhere] text-lg">{review.quote}</blockquote>
    <p className="[overflow-wrap:anywhere] font-bold">{review.display_name}</p>
    {review.status !== "withdrawn" && !state?.ok && <form action={action}>
      <SubmitButton variant="secondary" pendingText={r.sending}>{r.withdraw}</SubmitButton>
    </form>}
    {state && <Notice ok={state.ok}>{state.message}</Notice>}
  </div>;
}

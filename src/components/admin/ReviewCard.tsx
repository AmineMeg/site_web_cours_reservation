"use client";
import { useActionState } from "react";
import { moderateReview } from "@/app/admin/reviews/actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Notice } from "@/components/ui/Notice";
import { reviewText as r } from "@/lib/i18n/reviews";
import type { StudentReview } from "@/lib/reviews";

export function ReviewCard({ review }: { review: StudentReview }) {
  const [state, action] = useActionState(moderateReview, null);
  return <article className="card space-y-4">
    <p className="[overflow-wrap:anywhere] text-xl font-bold">{review.display_name}</p>
    <blockquote className="whitespace-pre-wrap [overflow-wrap:anywhere] text-lg">{review.quote}</blockquote>
    <p className="font-semibold">{r.status[review.status]}</p>
    {review.status !== "withdrawn" && <div className="flex flex-wrap gap-3">
      {review.status !== "approved" && <form action={action}>
        <input type="hidden" name="id" value={review.id} /><input type="hidden" name="updated" value={review.updated_at} />
        <input type="hidden" name="status" value="approved" />
        <SubmitButton pendingText={r.sending}>{r.approve}</SubmitButton>
      </form>}
      {review.status !== "rejected" && <form action={action}>
        <input type="hidden" name="id" value={review.id} /><input type="hidden" name="updated" value={review.updated_at} />
        <input type="hidden" name="status" value="rejected" />
        <SubmitButton variant="secondary" pendingText={r.sending}>{review.status === "approved" ? r.hide : r.reject}</SubmitButton>
      </form>}
    </div>}
    {state && <Notice ok={state.ok}>{state.message}</Notice>}
  </article>;
}

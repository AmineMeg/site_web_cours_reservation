import { requireStudent } from "@/lib/auth";
import { getReviewState, type StudentReview } from "@/lib/reviews";
import { reviewText as r } from "@/lib/i18n/reviews";
import { ReviewForm, SubmittedReview } from "@/components/dashboard/ReviewForm";

export default async function ReviewPage() {
  const { supabase, profile } = await requireStudent();
  const state = await getReviewState(supabase);
  const { data, error } = await supabase.from("student_reviews").select("*").eq("student_id", profile.id).maybeSingle();
  if (error) {
    console.error("[reviews] Own review load failed", error.code);
    throw new Error(r.error);
  }
  return <div className="space-y-5">
    <h1 className="text-3xl font-bold">{r.title}</h1>
    <p className="text-lg text-stone-600">{r.intro}</p>
    {data ? <SubmittedReview review={data as StudentReview} /> :
      state.eligible ? <ReviewForm name={profile.full_name} /> : <p className="card text-lg">{r.ineligible}</p>}
  </div>;
}

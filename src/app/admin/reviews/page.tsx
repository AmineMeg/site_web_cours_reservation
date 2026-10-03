import { requireTeacher } from "@/lib/auth";
import { ReviewCard } from "@/components/admin/ReviewCard";
import type { StudentReview } from "@/lib/reviews";
import { reviewText as r } from "@/lib/i18n/reviews";

export default async function ReviewsPage() {
  const { supabase } = await requireTeacher();
  const { data, error } = await supabase.from("student_reviews").select("*").order("created_at", { ascending: false });
  if (error) {
    console.error("[reviews] Moderation list load failed", error.code);
    throw new Error(r.error);
  }
  const reviews = (data ?? []) as StudentReview[];
  return <div className="space-y-6">
    <h1 className="text-3xl font-bold">{r.adminTitle}</h1>
    <p className="text-lg text-stone-600">{r.adminIntro}</p>
    {reviews.length ? reviews.map((review) => <ReviewCard key={review.id} review={review} />) : <p className="card text-lg">{r.empty}</p>}
  </div>;
}

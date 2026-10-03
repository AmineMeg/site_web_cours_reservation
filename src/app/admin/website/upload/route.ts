import { uploadPublicImage } from "@/lib/image-upload";
import { websiteText as w } from "@/lib/i18n/website";

export const runtime = "nodejs";
export async function POST(request: Request) {
  return uploadPublicImage(request, "homepage-images", {
    origin: w.photoOrigin, choose: w.choosePhoto, size: w.photoSize,
    type: w.photoType, storage: w.photoStorageError, failed: w.photoError,
  });
}

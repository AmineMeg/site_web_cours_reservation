import { uploadPublicImage } from "@/lib/image-upload";
import { blogText as t } from "@/lib/i18n/blog";

export const runtime = "nodejs";
export async function POST(request: Request) {
  return uploadPublicImage(request, "blog-images", {
    origin: t.uploadOrigin, choose: t.chooseFile, size: t.errors.imageSize,
    type: t.errors.imageType, storage: t.storageFailed, failed: t.chooseImage,
  });
}

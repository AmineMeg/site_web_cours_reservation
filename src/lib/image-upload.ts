import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireTeacher } from "@/lib/auth";
import { imageType, MAX_IMAGE_BYTES } from "@/lib/blog/validation";
import { blogText } from "@/lib/i18n/blog";

type UploadMessages = {
  origin: string; choose: string; size: string; type: string; storage: string; failed: string;
};

export async function uploadPublicImage(request: Request, bucket: "blog-images" | "homepage-images", messages: UploadMessages) {
  const { supabase } = await requireTeacher();
  try {
    const origin = new URL(request.headers.get("origin") ?? "");
    if (origin.host !== request.headers.get("host") || !["http:", "https:"].includes(origin.protocol)) {
      return NextResponse.json({ error: messages.origin }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: messages.origin }, { status: 403 });
  }
  const limit = MAX_IMAGE_BYTES + 64 * 1024;
  if (Number(request.headers.get("content-length")) > limit) return NextResponse.json({ error: messages.size }, { status: 413 });
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.startsWith("multipart/form-data;") || !request.body) return NextResponse.json({ error: messages.choose }, { status: 400 });
  try {
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) {
        await reader.cancel();
        return NextResponse.json({ error: messages.size }, { status: 413 });
      }
      chunks.push(value);
    }
    const form = await new Response(Buffer.concat(chunks), { headers: { "content-type": contentType } }).formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: messages.choose }, { status: 400 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    const extension = imageType(bytes, file.type);
    const filename = `${randomUUID()}.${extension}`;
    const { error } = await supabase.storage.from(bucket).upload(filename, bytes, { contentType: file.type, upsert: false, cacheControl: "31536000" });
    if (error) {
      console.error("[images] Storage upload failed", bucket, error.name);
      return NextResponse.json({ error: messages.storage }, { status: 400 });
    }
    return NextResponse.json({ url: supabase.storage.from(bucket).getPublicUrl(filename).data.publicUrl });
  } catch (error) {
    const known = error instanceof Error ? error.message : "";
    if (known === blogText.errors.imageSize) return NextResponse.json({ error: messages.size }, { status: 413 });
    if ([blogText.errors.imageType, blogText.errors.imageData].includes(known)) {
      return NextResponse.json({ error: messages.type }, { status: 400 });
    }
    console.error("[images] Upload request failed", bucket);
    return NextResponse.json({ error: messages.failed }, { status: 400 });
  }
}

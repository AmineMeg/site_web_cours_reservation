import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireTeacher } from "@/lib/auth";
import { imageType, MAX_IMAGE_BYTES } from "@/lib/blog/validation";
import { blogText as t } from "@/lib/i18n/blog";

export const runtime = "nodejs";
export async function POST(request: Request) {
  const { supabase } = await requireTeacher();
  try {
    const origin = new URL(request.headers.get("origin") ?? "");
    if (origin.host !== request.headers.get("host") || !["http:", "https:"].includes(origin.protocol)) {
      return NextResponse.json({ error: t.uploadOrigin }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: t.uploadOrigin }, { status: 403 });
  }
  const limit = MAX_IMAGE_BYTES + 64 * 1024;
  if (Number(request.headers.get("content-length")) > limit) return NextResponse.json({ error: t.errors.imageSize }, { status: 413 });
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.startsWith("multipart/form-data;") || !request.body) return NextResponse.json({ error: t.chooseFile }, { status: 400 });
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
        return NextResponse.json({ error: t.errors.imageSize }, { status: 413 });
      }
      chunks.push(value);
    }
    const body = Buffer.concat(chunks);
    const form = await new Response(body, { headers: { "content-type": contentType } }).formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error(t.chooseFile);
    if (file.size > MAX_IMAGE_BYTES) throw new Error(t.errors.imageSize);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const extension = imageType(bytes, file.type);
    const filename = `${randomUUID()}.${extension}`;
    const { error } = await supabase.storage.from("blog-images").upload(filename, bytes, { contentType: file.type, upsert: false, cacheControl: "31536000" });
    if (error) return NextResponse.json({ error: t.storageFailed }, { status: 400 });
    return NextResponse.json({ url: supabase.storage.from("blog-images").getPublicUrl(filename).data.publicUrl });
  } catch (error) {
    const message = error instanceof Error && [t.chooseFile, t.errors.imageSize, t.errors.imageType].includes(error.message)
      ? error.message : t.chooseImage;
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

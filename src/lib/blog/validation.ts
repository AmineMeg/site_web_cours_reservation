import { blogText } from "../i18n/blog";

const e = blogText.errors;
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const MAX_DOCUMENT_BYTES = 200_000;
export type BlogNode = {
  type: string;
  text?: string;
  attrs?: Record<string, string | number | null>;
  marks?: { type: "bold" | "italic" }[];
  content?: BlogNode[];
};
export type BlogPost = {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  document: BlogNode;
  cover_image: string | null;
  status: "draft" | "published";
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export function validImageUrl(value: unknown, origin: string): value is string {
  if (typeof value !== "string" || value.length > 500) return false;
  try {
    const url = new URL(value);
    return url.origin === new URL(origin).origin &&
      ["https:", "http:"].includes(url.protocol) &&
      !url.username && !url.password && !url.search && !url.hash &&
      /^\/storage\/v1\/object\/public\/blog-images\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(png|jpg|webp)$/.test(url.pathname) &&
      value === `${url.origin}${url.pathname}`;
  } catch {
    return false;
  }
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function keys(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw new Error(e.unsupportedProperty);
}

export function validateDocument(value: unknown, origin: string): BlogNode {
  let serialized: string | undefined;
  try { serialized = JSON.stringify(value); } catch { throw new Error(e.invalidDocument); }
  if (!serialized || new TextEncoder().encode(serialized).length > MAX_DOCUMENT_BYTES) {
    throw new Error(e.tooLarge);
  }
  let count = 0;
  function visit(node: unknown, depth: number, parent: string | null): BlogNode {
    if (++count > 2000 || depth > 12 || !object(node)) throw new Error(e.complex);
    keys(node, ["type", "text", "attrs", "marks", "content"]);
    const type = node.type;
    if (typeof type !== "string") throw new Error(e.unsupportedNode);
    const allowed = parent === null ? ["doc"] :
      parent === "doc" ? ["paragraph", "heading", "bulletList", "orderedList", "image"] :
      parent === "bulletList" || parent === "orderedList" ? ["listItem"] :
      parent === "listItem" ? ["paragraph", "heading", "bulletList", "orderedList", "image"] :
      parent === "paragraph" || parent === "heading" ? ["text", "hardBreak"] : [];
    if (!allowed.includes(type)) throw new Error(e.unsupportedNode);
    const result: BlogNode = { type };
    if (type === "text") {
      if (typeof node.text !== "string" || !node.text.length || node.text.length > 100_000) throw new Error(e.invalidText);
      result.text = node.text;
      if (node.marks !== undefined) {
        if (!Array.isArray(node.marks) || node.marks.length > 2) throw new Error(e.invalidFormatting);
        const seen = new Set();
        result.marks = node.marks.map((mark) => {
          if (!object(mark)) throw new Error(e.invalidFormatting);
          keys(mark, ["type"]);
          if ((mark.type !== "bold" && mark.type !== "italic") || seen.has(mark.type)) throw new Error(e.invalidFormatting);
          seen.add(mark.type);
          return { type: mark.type };
        });
      }
    } else if (node.text !== undefined || node.marks !== undefined) throw new Error(e.unsupportedProperty);
    if (type === "heading") {
      // Imported/editor documents can omit default attributes; persist an explicit H2.
      const attrs = node.attrs === undefined || node.attrs === null ? {} : node.attrs;
      if (!object(attrs)) throw new Error(e.invalidHeading);
      keys(attrs, ["level"]);
      const level = attrs.level ?? 2;
      if (level !== 2 && level !== 3) throw new Error(e.invalidHeading);
      result.attrs = { level };
    } else if (type === "orderedList" && node.attrs !== undefined) {
      if (!object(node.attrs)) throw new Error(e.invalidList);
      keys(node.attrs, ["start", "type"]);
      if (node.attrs.type !== undefined && node.attrs.type !== null) throw new Error(e.invalidListType);
      const start = node.attrs.start ?? 1;
      if (!Number.isInteger(start) || Number(start) < 1 || Number(start) > 1000) throw new Error(e.invalidList);
      result.attrs = { start: Number(start) };
    } else if (type === "image") {
      if (!object(node.attrs)) throw new Error(e.uploadedImage);
      keys(node.attrs, ["src", "alt", "title", "width", "height"]);
      if (!validImageUrl(node.attrs.src, origin)) throw new Error(e.uploadedImage);
      for (const key of ["alt", "title"]) {
        if (node.attrs[key] != null && (typeof node.attrs[key] !== "string" || String(node.attrs[key]).length > 300)) throw new Error(e.invalidImageDescription);
      }
      if (node.attrs.width != null || node.attrs.height != null) throw new Error(e.unsupportedAttributes);
      result.attrs = { src: node.attrs.src, alt: (node.attrs.alt as string) ?? "", title: (node.attrs.title as string) ?? null };
    } else if (node.attrs !== undefined) throw new Error(e.unsupportedAttributes);
    if (["text", "hardBreak", "image"].includes(type)) {
      if (node.content !== undefined) throw new Error(e.invalidStructure);
    } else {
      if (node.content !== undefined && !Array.isArray(node.content)) throw new Error(e.invalidStructure);
      result.content = ((node.content as unknown[]) ?? []).map((child) => visit(child, depth + 1, type));
      if (["bulletList", "orderedList", "listItem"].includes(type) && !result.content.length) throw new Error(e.emptyList);
      if (type === "listItem" && result.content[0]?.type !== "paragraph") throw new Error(e.invalidStructure);
    }
    return result;
  }
  return visit(value, 0, null);
}

export function slugify(title: string) {
  return title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100).replace(/-$/g, "");
}
export function validatePost(input: Record<string, unknown>, origin: string) {
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const slug = typeof input.slug === "string" ? input.slug.trim() : "";
  const excerpt = typeof input.excerpt === "string" ? input.excerpt.trim() : "";
  if (!title || title.length > 150) throw new Error(e.title);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 100) throw new Error(e.slug);
  if (excerpt.length > 400) throw new Error(e.excerpt);
  if (input.status !== "draft" && input.status !== "published") throw new Error(e.status);
  if (input.cover_image !== null && input.cover_image !== "" && !validImageUrl(input.cover_image, origin)) throw new Error(e.uploadedImage);
  return { title, slug, excerpt, status: input.status, cover_image: input.cover_image || null, document: validateDocument(input.document, origin) };
}

export function imageType(bytes: Uint8Array, mime: string) {
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) throw new Error(e.imageSize);
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v);
  const jpeg = bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 && bytes[bytes.length - 2] === 255 && bytes[bytes.length - 1] === 217;
  const webp = bytes.length >= 16 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (mime === "image/png" && png) return "png";
  if (mime === "image/jpeg" && jpeg) return "jpg";
  if (mime === "image/webp" && webp) return "webp";
  throw new Error(e.imageType);
}

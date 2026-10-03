"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { saveBlogPost, deleteBlogPost } from "@/app/admin/blog/actions";
import { BlogDocument } from "./Document";
import { MAX_IMAGE_BYTES, slugify, validateDocument, validImageUrl, type BlogPost, type BlogNode } from "@/lib/blog/validation";
import { blogText as t } from "@/lib/i18n/blog";

const field = "mt-2 w-full rounded-xl border border-stone-300 bg-white p-4 text-lg focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200";
const button = "min-h-12 rounded-xl border border-stone-300 bg-white px-5 py-3 text-lg font-bold hover:bg-stone-100 disabled:cursor-wait disabled:opacity-50";
const empty: BlogNode = { type: "doc", content: [{ type: "paragraph" }] };

export function BlogEditor({ post, imageOrigin }: { post?: BlogPost; imageOrigin: string }) {
  const router = useRouter();
  const [id, setId] = useState(post?.id);
  const [updatedAt, setUpdatedAt] = useState(post?.updated_at);
  const [title, setTitle] = useState(post?.title ?? "");
  const [slug, setSlug] = useState(post?.slug ?? "");
  const [slugEdited, setSlugEdited] = useState(!!post);
  const [excerpt, setExcerpt] = useState(post?.excerpt ?? "");
  const [cover, setCover] = useState(post?.cover_image ?? null);
  const [status, setStatus] = useState(post?.status ?? "draft");
  const [document, setDocument] = useState<BlogNode>(post?.document ?? empty);
  const [preview, setPreview] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const uploadTarget = useRef<"cover" | "body">("body");
  const uploadInput = useRef<HTMLInputElement>(null);
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] }, link: false, underline: false, strike: false,
        code: false, codeBlock: false, blockquote: false, horizontalRule: false,
        trailingNode: false,
      }),
      Image.configure({ allowBase64: false }),
    ],
    content: post?.document ?? empty,
    editorProps: {
      attributes: {
        class: "min-h-[360px] p-6 text-xl leading-8 focus:outline-none [&_h2]:mt-6 [&_h2]:text-3xl [&_h2]:font-bold [&_h3]:mt-5 [&_h3]:text-2xl [&_h3]:font-bold [&_p]:my-3 [&_ul]:list-disc [&_ul]:pl-8 [&_ol]:list-decimal [&_ol]:pl-8 [&_img]:my-5 [&_img]:max-w-full [&_img]:rounded-xl",
        role: "textbox", "aria-label": "Article content", "aria-multiline": "true",
      },
      handlePaste: (_view, event) => {
        // Paste text, never third-party HTML/images or unsafe embedded content.
        const text = event.clipboardData?.getData("text/plain");
        if (text !== undefined) {
          event.preventDefault();
          editor?.commands.insertContent(text.split(/\r?\n/).map((line) => ({ type: "paragraph", content: line ? [{ type: "text", text: line }] : [] })));
          return true;
        }
        return false;
      },
      handleDrop: (_view, event) => { event.preventDefault(); return true; },
    },
    onUpdate: ({ editor: current }) => {
      setDocument(current.getJSON() as BlogNode);
      setDirty(true);
    },
  });
  const active = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current?.isActive("bold"), italic: current?.isActive("italic"),
      heading2: current?.isActive("heading", { level: 2 }), heading3: current?.isActive("heading", { level: 3 }),
      bullet: current?.isActive("bulletList"), ordered: current?.isActive("orderedList"), image: current?.isActive("image"),
    }),
  });
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => { editor?.setEditable(!pending && !uploading); }, [editor, pending, uploading]);
  const busy = pending || uploading;
  function fail(text: string) { setMessage(text); setIsError(true); }
  function save(nextStatus: "draft" | "published") {
    setMessage("");
    startTransition(async () => {
      try {
        const normalizedDocument = validateDocument(editor?.getJSON() ?? document, imageOrigin);
        const result = await saveBlogPost({ id, updatedAt, title, slug, excerpt, document: normalizedDocument, cover_image: cover, status: nextStatus });
        if (result.error) { fail(result.error); return; }
        setId(result.id); setUpdatedAt(result.updatedAt); setStatus(nextStatus); setDirty(false);
        setIsError(false); setMessage(nextStatus === "published" ? "Article published. Your readers can see it now." : "Draft saved. It is not visible to readers.");
        if (!id) router.replace(`/admin/blog/${result.id}`);
        router.refresh();
      } catch (error) { fail(error instanceof Error ? error.message : "Unable to save. Please try again."); }
    });
  }
  async function upload(file?: File) {
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) { fail("Choose a PNG, JPEG or WebP image up to 4 MiB."); return; }
    setUploading(true); setMessage("");
    try {
      const form = new FormData(); form.set("file", file);
      const response = await fetch("/admin/blog/upload", { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok || !validImageUrl(result.url, imageOrigin)) throw new Error(result.error ?? "Image upload failed.");
      if (uploadTarget.current === "cover") { setCover(result.url); setDirty(true); }
      else {
        const alt = window.prompt("Describe this image for readers using a screen reader (optional):", "")?.slice(0, 300) ?? "";
        editor?.chain().focus().setImage({ src: result.url, alt }).run();
      }
      setMessage("Image uploaded."); setIsError(false);
    } catch (error) { fail(error instanceof Error ? error.message : "Image upload failed."); }
    finally { setUploading(false); if (uploadInput.current) uploadInput.current.value = ""; }
  }
  function pickImage(target: "cover" | "body") { uploadTarget.current = target; uploadInput.current?.click(); }
  function remove() {
    if (!id || !updatedAt || !window.confirm(t.deleteConfirm)) return;
    startTransition(async () => {
      try {
        const result = await deleteBlogPost(id, updatedAt);
        if (result.error) { fail(result.error); return; }
        setDirty(false); router.push("/admin/blog"); router.refresh();
      } catch { fail("Unable to delete. Please try again."); }
    });
  }
  function showPreview() {
    try { setDocument(validateDocument(editor?.getJSON() ?? document, imageOrigin)); setPreview(true); }
    catch (error) { fail(error instanceof Error ? error.message : "Invalid article."); }
  }
  function tool(label: string, selected: boolean | undefined, command: () => void) {
    return <button key={label} type="button" disabled={!editor || busy} aria-pressed={!!selected} onClick={command} className={`${button} ${selected ? "!border-brand-500 !bg-brand-50 text-brand-700" : ""}`}>{label}</button>;
  }
  return <div>
    <Link href="/admin/blog" onClick={(event) => { if (dirty && !window.confirm("Leave without saving your changes?")) event.preventDefault(); }} className="text-lg font-bold text-brand-700">← Your blog</Link>
    <div className="my-7 flex flex-wrap items-center justify-between gap-4"><h1 className="text-3xl font-extrabold">{id ? "Edit your article" : "Write an article"}</h1><span className="rounded-full bg-stone-100 px-4 py-2 font-bold">{status === "published" ? t.published : t.draft}{dirty ? " · Unsaved changes" : ""}</span></div>
    <div aria-live="polite">{message && <p role={isError ? "alert" : "status"} className={`mb-6 rounded-xl p-5 text-lg ${isError ? "bg-red-50 text-red-800" : "bg-green-50 text-green-800"}`}>{message}</p>}</div>
    <input ref={uploadInput} aria-label="Upload blog image" type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(event) => void upload(event.target.files?.[0])} />
    {preview ? <section className="rounded-2xl border bg-white p-6 sm:p-10">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4"><h2 className="font-bold text-stone-500">Private preview · not saved</h2><button className={button} onClick={() => setPreview(false)}>{t.edit}</button></div>
      <h1 className="text-4xl font-extrabold">{title || "Your article title"}</h1><p className="my-6 text-xl text-stone-600">{excerpt}</p>{cover && <img src={cover} alt="" className="mb-8 max-h-96 w-full rounded-xl object-cover" />}<BlogDocument document={document} />
    </section> : <fieldset disabled={busy} className="space-y-7">
      <label className="block text-xl font-bold">Article title<input className={field} maxLength={150} value={title} onChange={(event) => { setTitle(event.target.value); if (!slugEdited && !id) setSlug(slugify(event.target.value)); setDirty(true); }} placeholder="Your helpful Spanish tip…" /></label>
      <label className="block text-xl font-bold">URL name<input className={field} maxLength={100} value={slug} disabled={!!id || busy} onChange={(event) => { setSlug(event.target.value); setSlugEdited(true); setDirty(true); }} placeholder="my-spanish-tip" /><span className="mt-2 block text-base font-normal text-stone-500">{t.slugHelp} /blog/{slug || "your-url-name"}</span></label>
      <label className="block text-xl font-bold">Short summary<textarea className={field} rows={3} maxLength={400} value={excerpt} onChange={(event) => { setExcerpt(event.target.value); setDirty(true); }} placeholder="A sentence or two to invite readers in." /></label>
      <section><h2 className="mb-3 text-xl font-bold">Cover image (optional)</h2>{cover && <img src={cover} alt="Cover preview" className="mb-4 max-h-64 rounded-xl" />}<div className="flex flex-wrap gap-3"><button type="button" className={button} onClick={() => pickImage("cover")}>{cover ? "Change cover image" : "Add cover image"}</button>{cover && <button type="button" className={button} onClick={() => { setCover(null); setDirty(true); }}>Remove cover</button>}</div></section>
      <section><h2 className="mb-3 text-xl font-bold">Article content</h2><div className="overflow-hidden rounded-2xl border border-stone-300 bg-white">
        <div role="group" aria-label="Text formatting" className="flex flex-wrap gap-2 border-b bg-stone-50 p-3">
          {tool("Paragraph", !active?.heading2 && !active?.heading3, () => { editor?.chain().focus().setParagraph().run(); })}
          {tool("Heading", active?.heading2, () => { editor?.chain().focus().toggleHeading({ level: 2 }).run(); })}
          {tool("Subheading", active?.heading3, () => { editor?.chain().focus().toggleHeading({ level: 3 }).run(); })}
          {tool("Bold", active?.bold, () => { editor?.chain().focus().toggleBold().run(); })}
          {tool("Italic", active?.italic, () => { editor?.chain().focus().toggleItalic().run(); })}
          {tool("Bullet list", active?.bullet, () => { editor?.chain().focus().toggleBulletList().run(); })}
          {tool("Numbered list", active?.ordered, () => { editor?.chain().focus().toggleOrderedList().run(); })}
          <button type="button" disabled={!editor} className={button} onClick={() => pickImage("body")}>Add image</button>
          <button type="button" disabled={!active?.image} className={button} onClick={() => editor?.chain().focus().deleteSelection().run()}>Remove selected image</button>
          <button type="button" disabled={!editor?.can().undo()} className={button} onClick={() => editor?.chain().focus().undo().run()}>Undo</button>
          <button type="button" disabled={!editor?.can().redo()} className={button} onClick={() => editor?.chain().focus().redo().run()}>Redo</button>
        </div><EditorContent editor={editor} />
      </div><p className="mt-3 text-stone-500">{t.imageHelp} Pasted content is inserted as plain text.</p></section>
    </fieldset>}
    <div className="sticky bottom-0 mt-8 flex flex-wrap gap-3 rounded-2xl border border-stone-200 bg-white/95 p-4 shadow-lg">
      <button disabled={busy} className={button} onClick={() => preview ? setPreview(false) : showPreview()}>{preview ? t.edit : t.preview}</button>
      <button disabled={busy} className={button} onClick={() => save("draft")}>{status === "published" ? t.unpublish : t.saveDraft}</button>
      <button disabled={busy} className={`${button} !border-brand-700 !bg-brand-700 !text-white`} onClick={() => save("published")}>{pending ? "Saving…" : uploading ? "Uploading…" : status === "published" ? "Save published article" : t.publish}</button>
      {status === "published" && !dirty && <a href={`/blog/${slug}`} target="_blank" rel="noopener noreferrer" className={button}>View live ↗</a>}
      {id && <button disabled={busy} className={`${button} ml-auto text-red-700`} onClick={remove}>{t.delete}</button>}
    </div>
  </div>;
}

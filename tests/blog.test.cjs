const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const filename = path.resolve(__dirname, "../src/lib/blog/validation.ts");
const compiled = new Module(filename, module);
compiled.filename = filename;
compiled.paths = Module._nodeModulePaths(path.dirname(filename));
compiled._compile(ts.transpileModule(readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const { validateDocument, validatePost, validImageUrl, imageType, slugify, MAX_IMAGE_BYTES } = compiled.exports;
const origin = "https://example.supabase.co";
const image = `${origin}/storage/v1/object/public/blog-images/12345678-1234-4123-8123-123456789abc.png`;
const text = { type: "text", text: "<script>alert(1)</script>", marks: [{ type: "bold" }] };
const paragraph = { type: "paragraph", content: [text] };
const doc = { type: "doc", content: [paragraph] };

test("blog document accepts structured text, headings, lists and own bucket images", () => {
  const document = { type: "doc", content: [
    paragraph, { type: "heading", attrs: { level: 2 }, content: [text] },
    { type: "bulletList", content: [{ type: "listItem", content: [paragraph] }] },
    { type: "orderedList", attrs: { start: 2, type: null }, content: [{ type: "listItem", content: [paragraph] }] },
    { type: "image", attrs: { src: image, alt: "Learning", title: null, width: null, height: null } },
  ] };
  const result = validateDocument(document, origin);
  assert.equal(result.content[0].content[0].text, text.text);
  assert.deepEqual(result.content[3].attrs, { start: 2 });
  assert.equal(result.content[4].attrs.src, image);
});

test("blog rejects HTML, links, unsupported nodes, attributes, marks and tree shape", () => {
  for (const document of [
    "<b>HTML</b>", null, { type: "doc", content: [{ type: "script" }] },
    { type: "doc", content: [{ ...paragraph, attrs: { onclick: "alert(1)" } }] },
    { type: "doc", content: [{ ...paragraph, content: [{ ...text, marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }] }] },
    { type: "doc", content: [{ type: "text", text: "wrong parent" }] },
    { type: "doc", content: [{ type: "heading", attrs: { level: 1 } }] },
    { type: "doc", content: [{ type: "bulletList", content: [] }] },
    { type: "doc", content: [{ type: "orderedList", attrs: { start: -1 }, content: [{ type: "listItem", content: [paragraph] }] }] },
    { type: "doc", content: [{ type: "image", attrs: { src: "https://evil.test/image.png" } }] },
    { type: "doc", content: [{ ...paragraph, content: [{ ...text, marks: [{ type: "bold" }, { type: "bold" }] }] }] },
  ]) assert.throws(() => validateDocument(document, origin));
});

test("imported headings normalize omitted defaults before storage, without accepting unsafe attributes", () => {
  for (const heading of [
    { type: "heading", content: [text] },
    { type: "heading", attrs: null, content: [text] },
    { type: "heading", attrs: {}, content: [text] },
  ]) {
    const normalized = validateDocument({ type: "doc", content: [heading] }, origin);
    assert.deepEqual(normalized.content[0].attrs, { level: 2 });
    assert.deepEqual(validateDocument(normalized, origin), normalized);
  }
  for (const attrs of [false, "2", { level: "2" }, { level: 1 }, { onclick: "alert(1)" }]) {
    assert.throws(() => validateDocument({ type: "doc", content: [{ type: "heading", attrs, content: [text] }] }, origin));
  }
});

test("real Tiptap heading JSON stays compatible with blog validation", () => {
  const { getSchema } = require("@tiptap/core");
  const StarterKit = require("@tiptap/starter-kit").default;
  const schema = getSchema([StarterKit.configure({ heading: { levels: [2, 3] } })]);
  for (const level of [2, 3]) {
    const json = schema.node("doc", null, [schema.node("heading", { level }, [schema.text("Pasted text")])]).toJSON();
    assert.equal(validateDocument(json, origin).content[0].attrs.level, level);
  }
});

test("blog validates image origin, path, protocol and exact URL", () => {
  assert.equal(validImageUrl(image, origin), true);
  for (const url of [
    image.replace("example.supabase.co", "example.supabase.co.evil.test"), image + "?x=1", image + "#fragment",
    image.replace("https://", "javascript:"), image.replace(".png", ".svg"),
    image.replace("blog-images", "private"), image.replace("/12345678", "/nested/12345678"),
    image.replace("https://", "https://user:password@"), image.replace("https://", "http://"),
    image.replace("/12345678", "/%31%32%33%34%35%36%37%38"),
  ]) assert.equal(validImageUrl(url, origin), false, url);
});

test("blog limits document bytes, recursion and node count", () => {
  assert.throws(() => validateDocument({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "é".repeat(100_000) }] }] }, origin));
  assert.throws(() => validateDocument({ type: "doc", content: Array.from({ length: 2001 }, () => ({ type: "paragraph" })) }, origin));
  let list = { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph" }] }] };
  for (let i = 0; i < 8; i++) list = { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph" }, list] }] };
  assert.throws(() => validateDocument({ type: "doc", content: [list] }, origin));
  const circular = { type: "doc" }; circular.content = [circular];
  assert.throws(() => validateDocument(circular, origin));
});

test("blog image sniffing rejects fake MIME, SVG and oversize uploads", () => {
  assert.equal(MAX_IMAGE_BYTES, 4 * 1024 * 1024);
  assert.ok(MAX_IMAGE_BYTES + 64 * 1024 < 4_500_000);
  const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1]);
  const jpeg = Uint8Array.from([255, 216, 255, 0, 255, 217]);
  const webp = new TextEncoder().encode("RIFF1234WEBPVP8 ");
  assert.equal(imageType(png, "image/png"), "png");
  assert.equal(imageType(jpeg, "image/jpeg"), "jpg");
  assert.equal(imageType(webp, "image/webp"), "webp");
  assert.throws(() => imageType(png, "image/jpeg"));
  assert.throws(() => imageType(new TextEncoder().encode("<svg/>"), "image/png"));
  assert.throws(() => imageType(new Uint8Array(MAX_IMAGE_BYTES + 1), "image/png"));
  assert.throws(() => imageType(new Uint8Array(), "image/png"));
});

test("blog validates metadata, slugs and publication statuses", () => {
  assert.equal(slugify("¡Español: día uno!"), "espanol-dia-uno");
  const input = { title: " Example ", slug: "example", excerpt: "", document: doc, status: "draft", cover_image: null };
  assert.equal(validatePost(input, origin).title, "Example");
  for (const invalid of [
    { title: "" }, { title: "a".repeat(151) }, { slug: "../draft" }, { slug: "Uppercase" },
    { slug: "a".repeat(101) }, { excerpt: "a".repeat(401) }, { status: "hidden" }, { cover_image: "javascript:alert(1)" },
  ]) assert.throws(() => validatePost({ ...input, ...invalid }, origin));
});

test("blog uses non-session public client and no raw HTML rendering", () => {
  const publicSource = readFileSync(path.resolve(__dirname, "../src/lib/blog/public.ts"), "utf8");
  assert.match(publicSource, /persistSession: false/);
  assert.match(publicSource, /\.eq\("status", "published"\)/);
  assert.doesNotMatch(publicSource, /next\/headers|supabase\/server|service.role/i);
  const renderer = readFileSync(path.resolve(__dirname, "../src/components/blog/Document.tsx"), "utf8");
  assert.doesNotMatch(renderer, /dangerouslySetInnerHTML/);
});

function actionModule(requireTeacher) {
  const actionFile = path.resolve(__dirname, "../src/app/admin/blog/actions.ts");
  const loaded = new Module(actionFile, module);
  loaded.filename = actionFile;
  loaded.paths = Module._nodeModulePaths(path.dirname(actionFile));
  const baseRequire = loaded.require.bind(loaded);
  loaded.require = (name) => {
    if (name === "@/lib/auth") return { requireTeacher };
    if (name === "@/lib/supabase/env") return { supabaseUrl: () => origin };
    if (name === "@/lib/blog/validation") return compiled.exports;
    if (name === "next/cache") return { revalidatePath() {} };
    return baseRequire(name);
  };
  loaded._compile(ts.transpileModule(readFileSync(actionFile, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, actionFile);
  return loaded.exports;
}

test("blog mutations require teacher MFA before validation or database access", async () => {
  let attempts = 0;
  const actions = actionModule(async () => { attempts++; throw new Error("MFA required"); });
  await assert.rejects(actions.saveBlogPost({}), /MFA required/);
  await assert.rejects(actions.deleteBlogPost("invalid", ""), /MFA required/);
  assert.equal(attempts, 2);
});

test("blog action handles URL conflicts and stale writes with friendly errors", async () => {
  const filters = [];
  const query = {
    select() { return this; }, insert() { return this; },
    update() { return this; }, eq(key, value) { filters.push([key, value]); return this; },
    async maybeSingle() { return { error: { code: "23505" }, data: null }; },
  };
  const actions = actionModule(async () => ({ supabase: { from: () => query } }));
  const input = { title: "Article", slug: "article", excerpt: "", document: doc, status: "draft", cover_image: null };
  assert.match((await actions.saveBlogPost(input)).error, /already used/);
  let reads = 0;
  query.maybeSingle = async () => ++reads === 1 ? { data: { slug: "article" } } : { data: null };
  const updatedAt = "2026-10-03T12:00:00Z";
  const result = await actions.saveBlogPost({ ...input, id: "12345678-1234-4123-8123-123456789abc", updatedAt });
  assert.match(result.error, /Reload/);
  assert.ok(filters.some(([key, value]) => key === "updated_at" && value === updatedAt));
  query.maybeSingle = async () => ({ data: { slug: "original" } });
  assert.match((await actions.saveBlogPost({ ...input, id: "12345678-1234-4123-8123-123456789abc", updatedAt })).error, /cannot change/);
});

test("blog renderer escapes text rather than interpreting HTML", () => {
  const rendererFile = path.resolve(__dirname, "../src/components/blog/Document.tsx");
  const loaded = new Module(rendererFile, module);
  loaded.filename = rendererFile;
  loaded.paths = Module._nodeModulePaths(path.dirname(rendererFile));
  loaded._compile(ts.transpileModule(readFileSync(rendererFile, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, rendererFile);
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const html = renderToStaticMarkup(React.createElement(loaded.exports.BlogDocument, { document: doc }));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("<strong>"));
});

function uploadModule(requireTeacher) {
  const routeFile = path.resolve(__dirname, "../src/app/admin/blog/upload/route.ts");
  const loaded = new Module(routeFile, module);
  loaded.filename = routeFile;
  loaded.paths = Module._nodeModulePaths(path.dirname(routeFile));
  const baseRequire = loaded.require.bind(loaded);
  loaded.require = (name) => {
    if (name === "@/lib/auth") return { requireTeacher };
    if (name === "@/lib/blog/validation") return compiled.exports;
    return baseRequire(name);
  };
  loaded._compile(ts.transpileModule(readFileSync(routeFile, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, routeFile);
  return loaded.exports;
}

test("blog upload verifies authentication, same-origin, bytes and random object names", async () => {
  const unauthorized = uploadModule(async () => { throw new Error("MFA required"); });
  await assert.rejects(unauthorized.POST(new Request("http://localhost/admin/blog/upload", { method: "POST" })), /MFA required/);
  const uploads = [];
  const storage = {
    async upload(name, bytes, options) { uploads.push({ name, bytes, options }); return {}; },
    getPublicUrl(name) { return { data: { publicUrl: `${origin}/storage/v1/object/public/blog-images/${name}` } }; },
  };
  const { POST } = uploadModule(async () => ({ supabase: { storage: { from(bucket) { assert.equal(bucket, "blog-images"); return storage; } } } }));
  assert.equal((await POST(new Request("http://localhost/admin/blog/upload", { method: "POST", headers: { host: "localhost", origin: "https://evil.test" } }))).status, 403);
  const { File } = require("node:buffer");
  const headers = { host: "localhost", origin: "http://localhost" };
  const requestFor = (bytes, mime, name) => {
    const form = new FormData();
    form.set("file", new File([bytes], name, { type: mime }));
    return new Request("http://localhost/admin/blog/upload", { method: "POST", headers, body: form });
  };
  const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1]);
  const response = await POST(requestFor(png, "image/png", "../../user-controlled.png"));
  assert.equal(response.status, 200);
  assert.equal(validImageUrl((await response.json()).url, origin), true);
  assert.match(uploads[0].name, /^[a-f0-9-]{36}\.png$/);
  assert.equal(uploads[0].options.upsert, false);
  assert.equal((await POST(requestFor(new TextEncoder().encode("<svg/>"), "image/png", "fake.png"))).status, 400);
  assert.equal((await POST(new Request("http://localhost/admin/blog/upload", { method: "POST", headers: { ...headers, "content-length": String(MAX_IMAGE_BYTES + 100_000) }, body: "oversized" }))).status, 413);
  assert.equal(uploads.length, 1);
});

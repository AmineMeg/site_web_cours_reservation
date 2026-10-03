const { test } = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { createLoader } = require("./load-typescript.cjs");
const load = createLoader({
  "@/app/actions/contact": { submitContact: async () => { throw new Error("Preview must not send a contact"); } },
  "@/app/admin/website/actions": { saveHomepage: async () => ({ ok: true, revision: 2 }) },
  "next/link": { default: ({ children, ...props }) => React.createElement("a", props, children) },
  "next/image": { default: ({ unoptimized, ...props }) => React.createElement("img", props) },
});
const { Homepage } = load("src/components/landing/Homepage.tsx");
const { HomepageEditingContext } = load("src/components/landing/HomepageText.tsx");
const { homepageDefaults, homepageSections } = load("src/lib/website-content.ts");
const { WebsiteEditor } = load("src/components/admin/WebsiteEditor.tsx");

function renderPreview(content, selected = "heroTitle") {
  return renderToStaticMarkup(React.createElement(HomepageEditingContext.Provider,
    { value: { selected, select: () => {} } }, React.createElement(Homepage, { content, preview: true })));
}

test("visual preview maps every homepage field exactly once and exposes keyboard-editable text", () => {
  const html = renderPreview(homepageDefaults);
  const fields = [...html.matchAll(/data-homepage-field="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(fields.sort(), Object.keys(homepageDefaults).sort());
  assert.equal((html.match(/role="button"/g) || []).length, fields.length);
  assert.equal((html.match(/tabindex="0"/g) || []).length, fields.length);
  assert.equal((html.match(/aria-pressed="true"/g) || []).length, 1);
  assert.doesNotMatch(html, /<a\b|<form\b|<input\b|<textarea\b|<button\b/);
});

test("preview reflects changed text safely, including contact placeholder and button labels", () => {
  const changed = { ...homepageDefaults, heroTitle: "<script>bad()</script>", contactPlaceholder: "Minha mensagem nova", contactSubmit: "Enviar agora" };
  const html = renderPreview(changed, "contactPlaceholder");
  assert.match(html, /&lt;script&gt;bad\(\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /data-homepage-field="contactPlaceholder"[^>]+aria-pressed="true"/);
  assert.match(html, /Minha mensagem nova/);
  assert.match(html, /Enviar agora/);
});

test("public homepage preserves working navigation/form and has no editor markers", () => {
  const html = renderToStaticMarkup(React.createElement(Homepage, { content: homepageDefaults }));
  assert.doesNotMatch(html, /data-homepage-field|aria-pressed|Editar:/);
  assert.match(html, /href="#contact"/);
  assert.match(html, /href="\/login"/);
  assert.match(html, /<form\b/);
  assert.match(html, /type="submit"/);
  assert.match(html, /name="email"/);
});

test("editor starts with a live preview and grouped access to every field", () => {
  const html = renderToStaticMarkup(React.createElement(WebsiteEditor, { initial: homepageDefaults, revision: 1 }));
  assert.match(html, /<iframe[^>]+title="Minha página · prévia ao vivo"/);
  const values = [...html.matchAll(/<option value="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(values.sort(), Object.values(homepageSections).flat().sort());
  assert.match(html, /Todas as alterações estão salvas/);
  assert.match(html, /Salvar e atualizar meu site/);
  assert.doesNotMatch(html, /Ver minhas alterações|Voltar à edição/);
});

test("both photos render in public and editable previews, with original visuals available without photos", () => {
  const content = { ...homepageDefaults,
    heroImage: "https://project.supabase.co/storage/v1/object/public/homepage-images/12345678-1234-4123-8123-123456789abc.jpg",
    teacherImage: "https://project.supabase.co/storage/v1/object/public/homepage-images/12345678-1234-4123-8123-123456789abc.png" };
  for (const html of [renderPreview(content, "teacherImage"), renderToStaticMarkup(React.createElement(Homepage, { content }))]) {
    assert.match(html, /<img[^>]+alt="Fale espanhol com confiança desde a primeira aula"/);
    assert.match(html, /<img[^>]+alt="Professora Teixeira"/);
    assert.ok(html.includes(content.heroImage));
    assert.ok(html.includes(content.teacherImage));
    assert.doesNotMatch(html, /👩‍🏫|¿Hablamos\?/);
  }
  assert.match(renderPreview(homepageDefaults), /👩‍🏫/);
  assert.match(renderPreview(homepageDefaults), /¿Hablamos\?/);
});

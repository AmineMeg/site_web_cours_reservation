const { test } = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { createLoader } = require("./load-typescript.cjs");

test("hero fallback uses an SVG Spanish flag rather than platform-dependent emoji", () => {
  const load = createLoader({
    "@/components/landing/HomepageText": { HomepageText: ({ children }) => children },
    "@/components/landing/HomepageImage": { HomepageImage: ({ src, alt, children }) =>
      src ? React.createElement("img", { src, alt }) : children },
  });
  const { Hero } = load("src/components/landing/Hero.tsx");
  const html = renderToStaticMarkup(React.createElement(Hero));
  assert.match(html, /<svg[^>]+viewBox="0 0 30 20"/u);
  assert.match(html, /fill="#AA151B"/u);
  assert.match(html, /fill="#F1BF00"/u);
  assert.match(html, /focusable="false"/u);
  assert.doesNotMatch(html, /🇪🇸/u);
  assert.match(html, /¿Hablamos\?/u);
  const custom = renderToStaticMarkup(React.createElement(Hero, { content: {
    heroImage: "https://example.invalid/teacher.png", heroTitle: "Minha professora",
  } }));
  assert.match(custom, /<img[^>]+alt="Minha professora"/u);
  assert.doesNotMatch(custom, /<svg/u);
});

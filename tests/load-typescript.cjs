const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");
const cache = new Map();

function load(relative) {
  const filename = path.resolve(root, relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const compiled = new Module(filename, module);
  compiled.filename = filename;
  compiled.paths = Module._nodeModulePaths(path.dirname(filename));
  cache.set(filename, compiled);
  const baseRequire = compiled.require.bind(compiled);
  compiled.require = (name) => {
    if (name.startsWith("@/") || name.startsWith(".")) {
      const target = name.startsWith("@/")
        ? path.join(root, "src", name.slice(2)) : path.resolve(path.dirname(filename), name);
      for (const candidate of [target + ".ts", target + ".tsx", path.join(target, "index.ts")]) {
        if (fs.existsSync(candidate)) return load(candidate);
      }
    }
    return baseRequire(name);
  };
  compiled._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, filename);
  return compiled.exports;
}

module.exports = { load };

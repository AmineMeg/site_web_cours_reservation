"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { saveHomepage } from "@/app/admin/website/actions";
import { Homepage } from "@/components/landing/Homepage";
import { HomepageEditingContext } from "@/components/landing/HomepageText";
import { Notice } from "@/components/ui/Notice";
import { buttonClass } from "@/components/ui/button";
import { homepageSections, homepageFieldLimit, parseHomepageContent, type HomepageContent, type HomepageKey, type HomepageSection } from "@/lib/website-content";
import { websiteText as w } from "@/lib/i18n/website";
import type { ActionResult } from "@/lib/types";

export function WebsiteEditor({ initial, revision }: { initial: HomepageContent; revision: number }) {
  const [content, setContent] = useState(initial);
  const [savedContent, setSavedContent] = useState(initial);
  const [version, setVersion] = useState(revision);
  const [selected, setSelected] = useState<HomepageKey>("heroTitle");
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startSave] = useTransition();
  const preview = useRef<HTMLIFrameElement>(null);
  const [previewRoot, setPreviewRoot] = useState<HTMLElement | null>(null);
  const input = useRef<HTMLTextAreaElement | null>(null);
  const editorPanel = useRef<HTMLElement | null>(null);
  const focusEditor = useRef(false);
  const changed = JSON.stringify(content) !== JSON.stringify(savedContent);
  const section = (Object.keys(homepageSections) as HomepageSection[])
    .find((key) => homepageSections[key].includes(selected))!;
  const limit = homepageFieldLimit(selected);
  const fieldChanged = content[selected] !== savedContent[selected];
  useEffect(() => {
    if (focusEditor.current) {
      input.current?.focus({ preventScroll: true });
      focusEditor.current = false;
    }
    showField(selected);
  }, [selected, previewRoot]);
  useEffect(() => {
    if (!changed) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [changed]);
  function showField(key: HomepageKey) {
    const doc = preview.current?.contentDocument;
    const element = doc?.querySelector<HTMLElement>(`[data-homepage-field="${key}"]`);
    if (doc?.scrollingElement && element) {
      doc.scrollingElement.scrollTo({ top: doc.scrollingElement.scrollTop + element.getBoundingClientRect().top - 16, behavior: "instant" });
    }
  }
  function selectField(key: HomepageKey, fromPage = false) {
    focusEditor.current = fromPage;
    setSelected(key);
    if (fromPage) input.current?.focus({ preventScroll: true });
    editorPanel.current?.scrollTo({ top: 0, behavior: "instant" });
    requestAnimationFrame(() => showField(key));
  }
  function update(value: string) {
    setContent((current) => ({ ...current, [selected]: value }));
    setResult(null);
  }
  return <div className="space-y-5">
    <h1 className="text-3xl font-bold">{w.title}</h1>
    <p className="text-lg text-stone-600">{w.intro}</p>
    <div className="z-40 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm xl:sticky xl:top-0">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={pending || (!changed && version > 0)} className={buttonClass("primary", "lg")}
          onClick={() => startSave(async () => {
            const submitted = parseHomepageContent(content);
            if (!submitted) { setResult({ ok: false, message: w.invalid }); return; }
            try {
              const saved = await saveHomepage(submitted, version);
              setResult(saved);
              if (saved.ok && saved.revision !== undefined) {
                setVersion(saved.revision);
                setSavedContent(submitted);
                setContent(submitted);
              }
            } catch {
              console.error("[website] Homepage save request failed");
              setResult({ ok: false, message: w.error });
            }
          })}>{pending ? w.saving : w.save}</button>
        <a href="/" target="_blank" rel="noopener noreferrer" className={buttonClass("secondary", "md")}>{w.view}</a>
        <button type="button" disabled={pending || !changed} className="min-h-12 px-3 font-semibold text-stone-600 underline"
          onClick={() => {
            if (window.confirm(w.discardConfirm)) { setContent({ ...savedContent }); setResult(null); }
          }}>{w.discard}</button>
      </div>
      <p role="status" className={`mt-3 font-semibold ${changed ? "text-amber-800" : "text-brand-700"}`}>{changed ? w.unsaved : w.upToDate}</p>
      {result && <div className="mt-3"><Notice ok={result.ok}>{result.message}</Notice></div>}
    </div>
    <div className="grid grid-rows-[minmax(0,3fr)_minmax(0,2fr)] gap-4 h-[calc(100dvh-16rem)] min-h-[28rem] xl:h-[70vh] xl:grid-cols-[minmax(0,1fr)_20rem] xl:grid-rows-1">
      <section aria-label={w.livePreview} className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border-2 border-stone-200 bg-white">
        <div className="border-b bg-stone-50 p-3">
          <h2 className="font-bold">{w.livePreview}</h2>
          <p className="mt-1 text-sm text-stone-600">{w.clickHint}</p>
        </div>
        <iframe ref={preview} title={w.livePreview} className="min-h-0 w-full flex-1 border-0"
          srcDoc={'<!doctype html><html lang="pt-BR"><head></head><body style="margin:0"></body></html>'}
          onLoad={() => {
            const doc = preview.current?.contentDocument;
            if (!doc) return;
            // Keep the real page styles while giving the preview its own responsive viewport.
            document.querySelectorAll('link[rel="stylesheet"], style').forEach((style) => {
              doc.head.appendChild(style.cloneNode(true));
            });
            setPreviewRoot(doc.body);
          }}>
        </iframe>
        {previewRoot && createPortal(
          <HomepageEditingContext.Provider value={{ selected, select: (key) => selectField(key, true) }}>
            <Homepage content={content} preview />
          </HomepageEditingContext.Provider>, previewRoot)}
      </section>
      <aside ref={editorPanel} className="min-h-0 overflow-auto overscroll-contain rounded-2xl border-2 border-brand-200 bg-white p-5" aria-label={w.editing}>
        <p className="mb-2 hidden text-sm font-bold uppercase tracking-wide text-brand-700 xl:block">{w.editing}</p>
        <fieldset disabled={pending} className="space-y-4">
          <div>
            <p className="mb-1 hidden text-sm text-stone-500 xl:block">{w.sections[section]}</p>
            <label htmlFor="homepage-text" className="label">{w.labels[selected]}</label>
            <textarea ref={input} id="homepage-text" className="input" rows={limit > 200 ? 7 : 3} maxLength={limit}
              value={content[selected]} onChange={(event) => update(event.target.value)} />
            <p className="mt-2 text-sm text-stone-500">{w.characters(content[selected].length, limit)}</p>
          </div>
          <div>
            <label htmlFor="homepage-field" className="label">{w.chooseField}</label>
            <select id="homepage-field" className="input" value={selected} onChange={(event) => selectField(event.target.value as HomepageKey)}>
              {(Object.keys(homepageSections) as HomepageSection[]).map((key) => <optgroup key={key} label={w.sections[key]}>
                {homepageSections[key].map((field) => <option key={field} value={field}>{w.labels[field]}</option>)}
              </optgroup>)}
            </select>
          </div>
          <button type="button" onClick={() => showField(selected)} className={buttonClass("secondary", "md", "w-full")}>{w.showText}</button>
          <button type="button" disabled={!fieldChanged} onClick={() => update(savedContent[selected])}
            className="min-h-12 text-left font-semibold text-stone-600 underline disabled:opacity-40">{w.restoreField}</button>
          {fieldChanged && <div className="rounded-xl bg-stone-50 p-3">
            <p className="text-sm font-bold text-stone-500">{w.savedValue}</p>
            <p className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap text-sm text-stone-600">{savedContent[selected]}</p>
          </div>}
        </fieldset>
      </aside>
    </div>
    <p className="text-sm text-stone-500">{w.previewNote}</p>
  </div>;
}

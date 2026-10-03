"use client";

import { useEffect, useState, useTransition } from "react";
import { saveHomepage } from "@/app/admin/website/actions";
import { Homepage } from "@/components/landing/Homepage";
import { Notice } from "@/components/ui/Notice";
import { buttonClass } from "@/components/ui/button";
import { homepageSections, homepageFieldLimit, type HomepageContent, type HomepageSection } from "@/lib/website-content";
import { websiteText as w } from "@/lib/i18n/website";
import type { ActionResult } from "@/lib/types";

export function WebsiteEditor({ initial, revision }: { initial: HomepageContent; revision: number }) {
  const [content, setContent] = useState(initial);
  const [savedContent, setSavedContent] = useState(initial);
  const [version, setVersion] = useState(revision);
  const [section, setSection] = useState<HomepageSection>("hero");
  const [preview, setPreview] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startSave] = useTransition();
  const changed = JSON.stringify(content) !== JSON.stringify(savedContent);
  useEffect(() => {
    if (!changed) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [changed]);
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">{w.title}</h1>
      <p className="text-lg text-stone-600">{w.intro}</p>
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={() => setPreview(!preview)} className={buttonClass("secondary", "lg")}>{preview ? w.edit : w.preview}</button>
        <a href="/" target="_blank" rel="noopener noreferrer" className={buttonClass("secondary", "lg")}>{w.view}</a>
        <button type="button" disabled={pending || (!changed && version > 0)} className={buttonClass("primary", "lg")}
          onClick={() => startSave(async () => {
            const saved = await saveHomepage(content, version);
            setResult(saved);
            if (saved.ok && saved.revision !== undefined) {
              setVersion(saved.revision);
              setSavedContent(content);
            }
          })}>
          {pending ? w.saving : w.save}
        </button>
      </div>
      {result && <Notice ok={result.ok}>{result.message}</Notice>}
      {preview ? (
        <div className="space-y-4">
          <Notice ok>{w.previewNote}</Notice>
          <div className="overflow-hidden rounded-2xl border border-stone-200"><Homepage content={content} preview /></div>
        </div>
      ) : (
        <>
          <nav aria-label={w.title} className="flex flex-wrap gap-3">
            {(Object.keys(homepageSections) as HomepageSection[]).map((key) => (
              <button key={key} type="button" aria-pressed={key === section}
                className={buttonClass(key === section ? "primary" : "secondary", "lg")}
                onClick={() => setSection(key)}>{w.sections[key]}</button>
            ))}
          </nav>
          <fieldset disabled={pending} className="card space-y-5">
            <h2 className="text-2xl font-bold">{w.sections[section]}</h2>
            {homepageSections[section].map((key) => (
              <div key={key}>
                <label htmlFor={key} className="label">{w.labels[key]}</label>
                {homepageFieldLimit(key) > 200 ? (
                  <textarea id={key} value={content[key]} rows={4} maxLength={homepageFieldLimit(key)} className="input"
                    onChange={(event) => { setContent({ ...content, [key]: event.target.value }); setResult(null); }} />
                ) : (
                  <input id={key} value={content[key]} maxLength={homepageFieldLimit(key)} className="input"
                    onChange={(event) => { setContent({ ...content, [key]: event.target.value }); setResult(null); }} />
                )}
              </div>
            ))}
          </fieldset>
        </>
      )}
    </div>
  );
}

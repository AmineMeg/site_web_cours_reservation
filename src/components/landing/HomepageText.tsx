"use client";

import { createContext, useContext } from "react";
import type { HomepageKey } from "@/lib/website-content";
import { websiteText as w } from "@/lib/i18n/website";

export const HomepageEditingContext = createContext<{
  selected: HomepageKey;
  select: (key: HomepageKey) => void;
} | null>(null);

export function HomepageText({ field, children }: { field: HomepageKey; children: React.ReactNode }) {
  const editor = useContext(HomepageEditingContext);
  if (!editor) return <>{children}</>;
  return <span
    role="button"
    tabIndex={0}
    data-homepage-field={field}
    aria-label={w.editField(w.labels[field])}
    aria-pressed={editor.selected === field}
    className={`cursor-pointer rounded [overflow-wrap:anywhere] outline-offset-4 transition-colors hover:bg-amber-100 hover:text-stone-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600 ${
      editor.selected === field ? "bg-amber-100 text-stone-900 ring-2 ring-amber-500" : "outline outline-1 outline-dashed outline-stone-300"
    }`}
    onClick={(event) => { event.preventDefault(); event.stopPropagation(); editor.select(field); }}
    onKeyDown={(event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        event.stopPropagation();
        editor.select(field);
      }
    }}
  >{children}</span>;
}

import { en, type Dictionary } from "./en";

// To add Portuguese: create ./pt.ts exporting `pt: Dictionary`, add it here,
// and set NEXT_PUBLIC_LOCALE=pt.
const dictionaries: Record<string, Dictionary> = { en };

export const t: Dictionary = dictionaries[process.env.NEXT_PUBLIC_LOCALE ?? "en"] ?? en;

export type { Dictionary };

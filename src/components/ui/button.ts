type Variant = "primary" | "secondary" | "danger" | "success" | "ghost";
type Size = "md" | "lg" | "xl";

const base =
  "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50";

const variants: Record<Variant, string> = {
  primary: "bg-brand-700 text-white hover:bg-brand-800",
  secondary: "border-2 border-stone-300 bg-white text-stone-900 hover:bg-stone-100",
  danger: "bg-red-600 text-white hover:bg-red-700",
  success: "bg-emerald-600 text-white hover:bg-emerald-700",
  ghost: "text-stone-700 hover:bg-stone-100",
};

const sizes: Record<Size, string> = {
  md: "min-h-11 px-4 py-2 text-base",
  lg: "min-h-14 px-6 py-3 text-lg",
  xl: "min-h-16 px-8 py-4 text-xl",
};

export function buttonClass(variant: Variant = "primary", size: Size = "lg", extra = "") {
  return `${base} ${variants[variant]} ${sizes[size]} ${extra}`.trim();
}

export type { Variant as ButtonVariant, Size as ButtonSize };

import { SiteHeader } from "@/components/landing/SiteHeader";

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return <><SiteHeader /><main className="mx-auto max-w-5xl px-4 py-12 sm:px-8">{children}</main></>;
}

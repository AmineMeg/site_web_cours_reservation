import Image from "next/image";
import type { HomepageImageKey } from "@/lib/website-content";
import { HomepageText } from "./HomepageText";

export function HomepageImage({ field, src, alt, children }: {
  field: HomepageImageKey;
  src?: string;
  alt: string;
  children: React.ReactNode;
}) {
  return <HomepageText field={field} className="block h-full w-full">
    {src ? <Image src={src} alt={alt} width={600} height={field === "teacherImage" ? 750 : 600}
      unoptimized className="h-full w-full rounded-[inherit] object-cover" /> : children}
  </HomepageText>;
}

import type { ReactNode } from "react";
import type { BlogNode } from "@/lib/blog/validation";

export function BlogDocument({ document }: { document: BlogNode }) {
  function render(node: BlogNode, key: number): ReactNode {
    const children = node.content?.map(render);
    switch (node.type) {
      case "doc": return <div key={key}>{children}</div>;
      case "paragraph": return <p key={key} className="my-5 min-h-6 leading-8">{children}</p>;
      case "heading": return node.attrs?.level === 3
        ? <h3 key={key} className="mb-4 mt-8 text-2xl font-bold">{children}</h3>
        : <h2 key={key} className="mb-4 mt-10 text-3xl font-bold">{children}</h2>;
      case "bulletList": return <ul key={key} className="my-5 list-disc space-y-2 pl-8">{children}</ul>;
      case "orderedList": return <ol key={key} start={Number(node.attrs?.start ?? 1)} className="my-5 list-decimal space-y-2 pl-8">{children}</ol>;
      case "listItem": return <li key={key}>{children}</li>;
      case "hardBreak": return <br key={key} />;
      case "image": return <img key={key} src={String(node.attrs?.src)} alt={String(node.attrs?.alt ?? "")} className="my-8 h-auto max-w-full rounded-2xl" loading="lazy" />;
      case "text": {
        let text: ReactNode = node.text;
        for (const mark of node.marks ?? []) {
          if (mark.type === "bold") text = <strong>{text}</strong>;
          if (mark.type === "italic") text = <em>{text}</em>;
        }
        return <span key={key}>{text}</span>;
      }
      default: return null;
    }
  }
  return <div className="text-lg text-stone-800">{render(document, 0)}</div>;
}

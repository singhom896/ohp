"use client";

import sanitizeHtml from "sanitize-html";
import { useMemo } from "react";

/**
 * Shows HTML written in the CKEditor (e.g. Event Description) on preview
 * pages. Scripts, event handlers and unknown tags are stripped first.
 * Plain text from older records keeps its line breaks.
 */
export default function SafeHtml({ html, className }: { html: string; className?: string }) {
  const clean = useMemo(() => {
    const isHtml = /<\/?[a-z][\s\S]*>/i.test(html);
    const source = isHtml ? html : html.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>");
    return sanitizeHtml(source, {
      allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img", "h1", "h2", "u", "s", "figure", "figcaption"]),
      allowedAttributes: {
        ...sanitizeHtml.defaults.allowedAttributes,
        img: ["src", "alt", "width", "height"],
        a: ["href", "target", "rel"],
        "*": ["style"],
      },
      allowedStyles: { "*": { "text-align": [/^(left|right|center|justify)$/], "margin-left": [/^\d+(px|em|%)$/] } },
    });
  }, [html]);

  return <div className={`ck-content safe-html${className ? ` ${className}` : ""}`} dangerouslySetInnerHTML={{ __html: clean }} />;
}

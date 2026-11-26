// Renders CMS HTML (written in CKEditor 5 in the admin console) on the public
// site. Runs on the server: the HTML is sanitised so only the formatting CKEditor
// produces survives - no <script>, event handlers, javascript: links or styles
// beyond colours / sizes / alignment.
import sanitizeHtml from "sanitize-html";

const YOUTUBE = /^(?:https?:)?\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/;

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "h1", "h2", "h3", "h4", "h5", "h6", "p", "br", "hr", "blockquote", "pre", "code",
    "strong", "b", "em", "i", "u", "s", "sub", "sup", "mark", "span", "a",
    "ul", "ol", "li", "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "colgroup", "col",
    "figure", "figcaption", "img", "iframe", "div", "input", "label",
  ],
  allowedAttributes: {
    a: ["href", "target", "rel", "title"],
    img: ["src", "alt", "width", "height", "loading"],
    iframe: ["src", "width", "height", "title", "allow", "allowfullscreen", "loading"],
    td: ["colspan", "rowspan"],
    th: ["colspan", "rowspan", "scope"],
    ol: ["start", "reversed"],
    input: ["type", "checked", "disabled"], // CKEditor to-do lists
    "*": ["class", "style"],
  },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedSchemesByTag: { img: ["http", "https", "data"] },
  allowedIframeHostnames: ["www.youtube-nocookie.com"],
  allowedStyles: {
    "*": {
      color: [/^#[0-9a-f]{3,8}$/i, /^rgba?\([\d\s.,%]+\)$/i, /^hsla?\([\d\s.,%deg]+\)$/i, /^[a-z]+$/i],
      "background-color": [/^#[0-9a-f]{3,8}$/i, /^rgba?\([\d\s.,%]+\)$/i, /^hsla?\([\d\s.,%deg]+\)$/i, /^[a-z]+$/i],
      "font-size": [/^\d+(?:\.\d+)?(?:px|em|rem|%|pt)$/, /^(?:tiny|small|big|huge)$/],
      "font-family": [/^[\w\s,'"-]+$/],
      "text-align": [/^(?:left|right|center|justify)$/],
      "margin-left": [/^\d+(?:\.\d+)?(?:px|em|rem)$/],
      width: [/^\d+(?:\.\d+)?(?:px|%)$/],
      height: [/^\d+(?:\.\d+)?(?:px|%)$/],
    },
  },
  transformTags: {
    // External links open safely in a new tab.
    a: (tagName, attribs) => {
      const external = /^https?:\/\//i.test(attribs.href ?? "");
      return {
        tagName,
        attribs: external ? { ...attribs, target: "_blank", rel: "noopener noreferrer" } : attribs,
      };
    },
    // CKEditor "Media embed" stores <oembed url="...">: show YouTube as a privacy-friendly player.
    oembed: (_tagName, attribs): sanitizeHtml.Tag => {
      const id = YOUTUBE.exec(attribs.url ?? "")?.[1];
      return id
        ? {
            tagName: "iframe",
            attribs: {
              src: `https://www.youtube-nocookie.com/embed/${id}`,
              title: "Embedded video",
              allow: "accelerometer; encrypted-media; picture-in-picture",
              allowfullscreen: "true",
              loading: "lazy",
            },
          }
        : { tagName: "span", attribs: {} as sanitizeHtml.Attributes };
    },
    img: (tagName, attribs) => ({ tagName, attribs: { ...attribs, loading: "lazy" } }),
  },
};

export default function CmsHtml({ html }: { html: string }) {
  // CKEditor leaves empty "<p>&nbsp;</p>" spacer paragraphs; collapse them.
  const clean = sanitizeHtml(html, OPTIONS).replace(/<p>(?:&nbsp;|\s)*<\/p>/g, "");
  return <div className="cms-content" dangerouslySetInnerHTML={{ __html: clean }} />;
}

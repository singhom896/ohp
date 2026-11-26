"use client";

// CKEditor 5 v48.5.0 - the same self-hosted build, plugins and toolbar as the
// Laravel panel (backend/views/backend/content/addEdit.blade.php). The UMD build
// is served from public/vendor/ckeditor5-48.5.0 (copied from
// backend/public/assets/vendor/v1/ckeditor5-48.5.0) and loaded once, on demand,
// only on pages that show a rich-text field (via RichTextEditor, ssr: false).
//
// Licence: CKEditor 5 is used under its GPL licence (licenseKey: "GPL"), as the
// Laravel panel already does. See public/vendor/ckeditor5-48.5.0/LICENSE.md.
import { useEffect, useRef, useState } from "react";

const BASE = "/vendor/ckeditor5-48.5.0";

/* Minimal typing for the parts of the CKEditor UMD global used here. */
type CkEditorInstance = {
  getData(): string;
  setData(html: string): void;
  destroy(): Promise<unknown>;
  model: { document: { on(event: "change:data", cb: () => void): void } };
};
type CkGlobal = Record<string, unknown> & {
  ClassicEditor: { create(el: HTMLElement, config: Record<string, unknown>): Promise<CkEditorInstance> };
};
declare global {
  interface Window {
    CKEDITOR?: CkGlobal;
  }
}

let loader: Promise<CkGlobal> | null = null;

/** Adds the stylesheet + UMD script once per page load. */
function loadCkeditor(): Promise<CkGlobal> {
  if (window.CKEDITOR) return Promise.resolve(window.CKEDITOR);
  if (loader) return loader;
  loader = new Promise<CkGlobal>((resolve, reject) => {
    if (!document.querySelector(`link[data-ckeditor]`)) {
      const css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = `${BASE}/ckeditor5.css`;
      css.dataset.ckeditor = "1";
      document.head.appendChild(css);
    }
    const script = document.createElement("script");
    script.src = `${BASE}/ckeditor5.umd.js`;
    script.async = true;
    script.onload = () => (window.CKEDITOR ? resolve(window.CKEDITOR) : reject(new Error("CKEditor global missing")));
    script.onerror = () => {
      loader = null;
      reject(new Error("Unable to load CKEditor"));
    };
    document.head.appendChild(script);
  });
  return loader;
}

const PLUGINS = [
  "Essentials", "Paragraph", "Heading", "Bold", "Italic", "Underline", "Strikethrough", "Subscript", "Superscript", "Code",
  "RemoveFormat", "Link", "AutoLink", "List", "ListProperties", "TodoList", "Indent", "IndentBlock", "Alignment", "BlockQuote",
  "Font", "Highlight", "HorizontalLine", "SpecialCharacters", "SpecialCharactersEssentials", "Table", "TableToolbar",
  "MediaEmbed", "SourceEditing", "FindAndReplace", "CodeBlock", "PasteFromOffice", "Image", "ImageToolbar", "ImageCaption",
  "ImageStyle", "ImageResize",
];

function buildConfig(ck: CkGlobal): Record<string, unknown> {
  return {
    licenseKey: "GPL",
    plugins: PLUGINS.map((name) => ck[name]).filter(Boolean),
    toolbar: {
      items: [
        "sourceEditing", "|", "undo", "redo", "|", "heading", "|",
        "fontFamily", "fontSize", "fontColor", "fontBackgroundColor", "|",
        "bold", "italic", "underline", "strikethrough", "|", "subscript", "superscript", "code", "|",
        "removeFormat", "|", "link", "|", "bulletedList", "numberedList", "todoList", "|",
        "outdent", "indent", "|", "alignment", "|", "blockQuote", "|", "codeBlock", "|",
        "horizontalLine", "|", "specialCharacters", "|", "insertTable", "|", "mediaEmbed", "|", "findAndReplace",
      ],
      shouldNotGroupWhenFull: false,
    },
    heading: {
      options: [
        { model: "paragraph", title: "Paragraph", class: "ck-heading_paragraph" },
        { model: "heading2", view: "h2", title: "Heading 2", class: "ck-heading_heading2" },
        { model: "heading3", view: "h3", title: "Heading 3", class: "ck-heading_heading3" },
        { model: "heading4", view: "h4", title: "Heading 4", class: "ck-heading_heading4" },
        { model: "heading5", view: "h5", title: "Heading 5", class: "ck-heading_heading5" },
      ],
    },
    link: { addTargetToExternalLinks: true, defaultProtocol: "https://" },
    list: { properties: { styles: true, startIndex: true, reversed: true } },
    table: { contentToolbar: ["tableColumn", "tableRow", "mergeTableCells"] },
    image: { toolbar: ["imageTextAlternative", "toggleImageCaption", "|", "imageStyle:inline", "imageStyle:block", "imageStyle:side"] },
  };
}

type Props = { value: string; onChange: (html: string) => void; id?: string; invalid?: boolean };

export default function CkEditorInner({ value, onChange, id, invalid }: Props) {
  const holder = useRef<HTMLDivElement>(null);
  const editorRef = useRef<CkEditorInstance | null>(null);
  const lastEmitted = useRef(value);
  const onChangeRef = useRef(onChange);
  const initial = useRef(value);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Create the editor once; destroy it on unmount.
  useEffect(() => {
    let cancelled = false;
    let instance: CkEditorInstance | null = null;

    loadCkeditor()
      .then((ck) => {
        if (cancelled || !holder.current) return null;
        return ck.ClassicEditor.create(holder.current, buildConfig(ck));
      })
      .then((editor) => {
        if (!editor) return;
        if (cancelled) {
          editor.destroy();
          return;
        }
        instance = editor;
        editorRef.current = editor;
        editor.setData(initial.current ?? "");
        editor.model.document.on("change:data", () => {
          const html = editor.getData();
          lastEmitted.current = html;
          onChangeRef.current(html);
        });
      })
      .catch(() => !cancelled && setFailed(true));

    return () => {
      cancelled = true;
      editorRef.current = null;
      instance?.destroy();
    };
  }, []);

  // Value changed from outside (form Reset): push it into the editor.
  useEffect(() => {
    const editor = editorRef.current;
    if (editor && value !== lastEmitted.current) {
      lastEmitted.current = value;
      editor.setData(value ?? "");
    }
  }, [value]);

  if (failed) {
    // Fallback so content can still be edited as HTML.
    return (
      <>
        <div className="alert alert-warning py-2 mb-2">The editor could not load. You can still edit the HTML below.</div>
        <textarea id={id} className={`form-control${invalid ? " is-invalid" : ""}`} rows={16} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
      </>
    );
  }

  return (
    <div className={`ck-wrap${invalid ? " is-invalid" : ""}`} id={id}>
      <div ref={holder} />
    </div>
  );
}

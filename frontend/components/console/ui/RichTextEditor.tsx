"use client";

// Rich-text (HTML) field for console forms. CKEditor 5 is large and needs the
// browser, so it is loaded on demand: only pages that show this field download
// it, and nothing of it runs during server rendering.
import dynamic from "next/dynamic";

const CkEditorInner = dynamic(() => import("./CkEditorInner"), {
  ssr: false,
  loading: () => (
    <div className="ck-loading">
      <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />
      Loading editor…
    </div>
  ),
});

type Props = {
  name: string;
  label: string;
  value: string;
  onChange: (html: string) => void;
  required?: boolean;
  error?: string;
  help?: React.ReactNode;
};

export default function RichTextEditor({ name, label, value, onChange, required, error, help }: Props) {
  return (
    <>
      <label htmlFor={name} className="form-label fw-bold mb-2">
        {label}{" "}
        {required && (
          <sup className="text-danger" aria-hidden="true">
            *
          </sup>
        )}
      </label>
      <CkEditorInner id={name} value={value} onChange={onChange} invalid={!!error} />
      {help && <small className="text-muted d-block">{help}</small>}
      {error && <small className="text-danger d-block">{error}</small>}
    </>
  );
}

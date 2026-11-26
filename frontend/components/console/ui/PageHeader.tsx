import Link from "next/link";

/**
 * Centered page title with the theme underline used on every panel page, and
 * an optional "Back" button on the right (createEdit pages).
 */
export default function PageHeader({ title, backHref }: { title: string; backHref?: string }) {
  return (
    <div className="row mb-3 align-items-center">
      <div className="col-12 position-relative text-center">
        <div className="d-inline-block">
          <h1 className="mb-1 fw-bold">{title}</h1>
          <div className="d-flex justify-content-center">
            <div className="oh-title-line" />
          </div>
        </div>
        {backHref && (
          <Link
            href={backHref}
            className="btn btn-outline-secondary rounded-2 position-absolute top-50 end-0 translate-middle-y"
          >
            <i className="bi bi-caret-left-fill" /> Back
          </Link>
        )}
      </div>
    </div>
  );
}

export function Loader({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="console-loader">
      <span className="spinner-border" aria-hidden="true" /> {label}
    </div>
  );
}

export function ErrorBox({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return (
    <div className="alert alert-danger" role="alert">
      {message}
    </div>
  );
}

export function SuccessBox({ message, onClose }: { message: string | null | undefined; onClose?: () => void }) {
  if (!message) return null;
  return (
    <div className="alert alert-success alert-dismissible fade show" role="status">
      {message}
      {onClose && <button type="button" className="btn-close" aria-label="Close" onClick={onClose} />}
    </div>
  );
}

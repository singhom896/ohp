"use client";

// React versions of the Blade components in backend/resources/views/components:
// <x-text-input>, <x-select-input>, <x-textarea>, plus a file input with the
// same look. Markup and classes are kept identical so style.css applies.

type Base = {
  name: string;
  label: string;
  required?: boolean;
  error?: string;
  help?: React.ReactNode;
};

function Label({ name, label, required }: Pick<Base, "name" | "label" | "required">) {
  return (
    <label htmlFor={name} className="form-label fw-bold mb-2">
      {label}{" "}
      {required && (
        <sup className="text-danger" aria-hidden="true">
          *
        </sup>
      )}
    </label>
  );
}

function Feedback({ error, help }: Pick<Base, "error" | "help">) {
  return (
    <>
      {help && <small className="text-muted d-block">{help}</small>}
      {error && <small className="text-danger d-block">{error}</small>}
    </>
  );
}

type TextInputProps = Base &
  Omit<React.InputHTMLAttributes<HTMLInputElement>, "name" | "value" | "onChange"> & {
    icon?: string;
    value: string | number | null | undefined;
    onChange: (value: string) => void;
  };

export function TextInput({ name, label, required, error, help, icon, value, onChange, type = "text", className, ...rest }: TextInputProps) {
  return (
    <>
      <Label name={name} label={label} required={required} />
      <div className="input-group rounded-1">
        {icon && (
          <span className="input-group-text text-blue bg-white" id={`${name}-icon`}>
            <i className={`bi ${icon}`} />
          </span>
        )}
        <input
          type={type}
          name={name}
          id={name}
          className={`form-control${error ? " is-invalid" : ""}${className ? ` ${className}` : ""}`}
          aria-label={label}
          aria-invalid={!!error || undefined}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          {...rest}
        />
      </div>
      <Feedback error={error} help={help} />
    </>
  );
}

export type Option = { value: string | number; label: string };

/** Accepts [{value,label}], {value: label} maps (Laravel pluck()) or [{id,name}] rows. */
export function toOptions(src: unknown, labelKey = "name", valueKey = "id"): Option[] {
  if (!src) return [];
  if (Array.isArray(src)) {
    return src.map((r) =>
      r && typeof r === "object"
        ? "value" in r && "label" in r
          ? (r as Option)
          : { value: (r as Record<string, string | number>)[valueKey], label: String((r as Record<string, unknown>)[labelKey] ?? "") }
        : { value: r as string, label: String(r) }
    );
  }
  if (typeof src === "object") return Object.entries(src as Record<string, string>).map(([value, label]) => ({ value, label }));
  return [];
}

type SelectProps = Base & {
  icon?: string;
  value: string | number | null | undefined;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  disabled?: boolean;
};

export function SelectInput({ name, label, required, error, help, icon, value, onChange, options, placeholder, disabled }: SelectProps) {
  return (
    <>
      <Label name={name} label={label} required={required} />
      <div className="input-group rounded-1">
        {icon && (
          <span className="input-group-text text-blue bg-white">
            <i className={`bi ${icon}`} />
          </span>
        )}
        <select
          className={`form-select${error ? " is-invalid" : ""}`}
          id={name}
          name={name}
          aria-label={label}
          value={value == null ? "" : String(value)}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          required={required}
        >
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((o) => (
            <option key={String(o.value)} value={String(o.value)}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <Feedback error={error} help={help} />
    </>
  );
}

type TextAreaProps = Base & {
  value: string | null | undefined;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
  maxLength?: number;
};

export function TextArea({ name, label, required, error, help, value, onChange, rows = 4, placeholder, maxLength }: TextAreaProps) {
  return (
    <>
      <Label name={name} label={label} required={required} />
      <textarea
        name={name}
        id={name}
        className={`form-control${error ? " is-invalid" : ""}`}
        rows={rows}
        placeholder={placeholder}
        aria-label={label}
        value={value ?? ""}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
        required={required}
      />
      <Feedback error={error} help={help} />
    </>
  );
}

type FileInputProps = Base & {
  icon?: string;
  accept?: string;
  multiple?: boolean;
  onChange: (files: File[]) => void;
  /** Link to the file already stored (edit forms). */
  currentUrl?: string | null;
  currentLabel?: string;
};

export function FileInput({ name, label, required, error, help, icon = "bi-upload", accept, multiple, onChange, currentUrl, currentLabel = "View current file" }: FileInputProps) {
  return (
    <>
      <Label name={name} label={label} required={required} />
      <div className="input-group rounded-1 file-upload-group">
        <span className="input-group-text text-blue bg-white">
          <i className={`bi ${icon}`} />
        </span>
        <input
          type="file"
          name={name}
          id={name}
          className={`form-control${error ? " is-invalid" : ""}`}
          accept={accept}
          multiple={multiple}
          aria-label={label}
          onChange={(e) => onChange(Array.from(e.target.files ?? []))}
        />
      </div>
      {currentUrl && (
        <a href={currentUrl} target="_blank" rel="noopener noreferrer" className="small d-inline-block mt-1">
          <i className="bi bi-box-arrow-up-right me-1" />
          {currentLabel}
        </a>
      )}
      <Feedback error={error} help={help} />
    </>
  );
}

/** Form-level error list, like `@if ($errors->any())` on createEdit pages. */
export function ErrorList({ errors, message }: { errors: Record<string, string[]>; message?: string | null }) {
  const all = Object.values(errors).flat();
  if (!all.length && !message) return null;
  return (
    <div className="alert alert-danger" role="alert">
      {all.length ? (
        <ul className="mb-0">
          {all.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      ) : (
        message
      )}
    </div>
  );
}

export function FormButtons({ editing, busy, onReset }: { editing: boolean; busy: boolean; onReset?: () => void }) {
  return (
    <div className="col-lg-12 my-4">
      <div className="d-flex justify-content-end align-items-center gap-3">
        <button type="submit" className="cms-btn rounded-2" disabled={busy}>
          {busy && <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />}
          {editing ? "Update" : "Submit"}
        </button>
        <button type="reset" className="border-btn rounded-2" onClick={onReset} disabled={busy}>
          Reset
        </button>
      </div>
    </div>
  );
}

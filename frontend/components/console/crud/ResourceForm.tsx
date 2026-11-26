"use client";

// Generic create/edit page, modelled on the panel's createEdit.blade.php files:
// title + Back button, error list, `form.form-box` with x-*-input fields in a
// Bootstrap grid, Submit/Update + Reset. Server-side validation (422) errors
// are shown under each field, like @error().
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { http, toFormData } from "@/lib/api/http";
import { ApiError } from "@/lib/api/client";
import PageHeader, { ErrorBox, Loader } from "../ui/PageHeader";
import { ErrorList, FileInput, FormButtons, SelectInput, TextArea, TextInput, type Option } from "../ui/fields";
import { setFlash } from "../ui/flash";
import RichTextEditor from "../ui/RichTextEditor";
import { fetchCached, useApiData } from "./useApi";
import { INDIA_COUNTRY_ID } from "./common";
import type { FieldDef, FormConfig, FormContext, Values } from "./types";

type Props = { config: FormConfig; id: number | null };

export default function ResourceForm({ config, id }: Props) {
  const router = useRouter();
  const editing = id !== null;
  const item = useApiData<{ item: Values }>(editing ? `${config.endpoint}/${id}` : null);

  const usesCountry = config.fields.some((f) => f.name === "country_id");
  const [lockedCountryId, setLockedCountryId] = useState<number | null>(null);
  useEffect(() => {
    if (!usesCountry) return;
    fetchCached<{ locked_country_id: number | null }>("/lookups/countries")
      .then((d) => setLockedCountryId(d.locked_country_id ?? null))
      .catch(() => undefined);
  }, [usesCountry]);

  const initial = useMemo<Values>(() => {
    const loaded = item.data?.item ? (config.fromItem ? config.fromItem(item.data.item) : item.data.item) : {};
    return { ...config.defaults, ...loaded };
  }, [item.data, config]);

  // Form values start from `initial` and are re-seeded whenever it changes
  // (item loaded, Reset). Adjusted during render instead of in an effect.
  const [seed, setSeed] = useState(initial);
  const [values, setValues] = useState<Values>(initial);
  if (seed !== initial) {
    setSeed(initial);
    setValues(initial);
  }
  // India-only portal: country_id is never chosen, it is always India.
  const effective = usesCountry ? { ...values, country_id: lockedCountryId ?? INDIA_COUNTRY_ID } : values;

  const [files, setFiles] = useState<Record<string, File[]>>({});
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const ctx: FormContext = { lockedCountryId, editing };
  const options = useDependentOptions(config.fields, effective);

  const set = (field: FieldDef, value: unknown) => {
    setValues((v) => {
      const next = { ...v, [field.name]: value };
      for (const r of field.resets ?? []) next[r] = "";
      return next;
    });
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setMessage(null);
    try {
      const payload = config.toPayload ? config.toPayload(effective) : effective;
      let body: unknown = payload;
      if (config.multipart) {
        const fd = toFormData(payload);
        for (const [name, list] of Object.entries(files)) {
          const f = config.fields.find((x) => x.name === name);
          list.forEach((file) => fd.append(f?.multiple ? `${name}[]` : name, file));
        }
        body = fd;
      }
      const res = await http.post(editing ? `${config.endpoint}/${id}` : config.endpoint, body);
      setFlash(res.message);
      router.push(config.listHref);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.errors);
        setMessage(err.message);
      } else {
        setMessage("Something went wrong. Please try again.");
      }
      document.getElementById("maincontent")?.parentElement?.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setBusy(false);
    }
  }

  const title = config.title ? config.title(editing) : `${editing ? "Edit" : "Create"} ${config.entity}`;

  if (editing && item.loading && !item.data) return <Loader />;
  if (editing && item.error) {
    return (
      <div className="container-fluid">
        <PageHeader title={title} backHref={config.listHref} />
        <ErrorBox message={item.error} />
      </div>
    );
  }

  return (
    <div className="container-fluid">
      <PageHeader title={title} backHref={config.listHref} />
      <ErrorList errors={errors} message={message} />

      <div className="row justify-content-between py-2">
        <div className="col-xl-12 col-12 mb-md-0 mb-3">
          <form onSubmit={submit} className="form-box" noValidate>
            <div className="row">
              {config.fields.map((f) => {
                if (f.hidden || (f.showIf && !f.showIf(effective))) return null;
                const required = typeof f.required === "function" ? f.required(effective) : !!f.required;
                const err = errors[f.name]?.[0] ?? errors[`${f.name}.0`]?.[0];
                const disabled = (f.name === "country_id" && !!lockedCountryId) || !!f.disabledIf?.(effective, ctx);
                const opts: Option[] = f.optionsFrom ? options[f.name] ?? [] : f.options ?? [];
                const common = { name: f.name, label: f.label, required, error: err, help: f.help };

                return (
                  <div key={f.name} className={`${f.col ?? "col-lg-3"} mb-3`}>
                    {f.type === "select" ? (
                      <SelectInput
                        {...common}
                        icon={f.icon}
                        value={effective[f.name] as string}
                        options={opts}
                        placeholder={f.emptyOption ?? (f.placeholder || `Select ${f.label}`)}
                        disabled={disabled}
                        onChange={(v) => set(f, v)}
                      />
                    ) : f.type === "richtext" ? (
                      <RichTextEditor
                        {...common}
                        value={(effective[f.name] as string) ?? ""}
                        onChange={(v) => set(f, v)}
                      />
                    ) : f.type === "textarea" ? (
                      <TextArea
                        {...common}
                        value={effective[f.name] as string}
                        rows={f.rows}
                        maxLength={f.maxLength}
                        placeholder={f.placeholder ?? `Enter ${f.label.toLowerCase()}`}
                        onChange={(v) => set(f, v)}
                      />
                    ) : f.type === "file" ? (
                      <FileInput
                        {...common}
                        required={required && !(f.currentUrlKey && item.data?.item?.[f.currentUrlKey])}
                        icon={f.icon}
                        accept={f.accept}
                        multiple={f.multiple}
                        currentUrl={f.currentUrlKey ? (item.data?.item?.[f.currentUrlKey] as string | null) : null}
                        onChange={(list) => setFiles((x) => ({ ...x, [f.name]: list }))}
                      />
                    ) : (
                      <TextInput
                        {...common}
                        type={f.type}
                        icon={f.icon}
                        value={effective[f.name] as string}
                        placeholder={f.placeholder ?? f.label}
                        maxLength={f.maxLength}
                        disabled={disabled}
                        autoComplete="off"
                        onChange={(v) => set(f, v)}
                      />
                    )}
                  </div>
                );
              })}

              <FormButtons
                editing={editing}
                busy={busy}
                onReset={() => {
                  setValues(initial);
                  setFiles({});
                  setErrors({});
                  setMessage(null);
                }}
              />
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

/** Load options for fields with `optionsFrom`, re-fetching when their URL changes. */
function useDependentOptions(fields: FieldDef[], values: Values): Record<string, Option[]> {
  const urls = fields
    .filter((f) => f.optionsFrom)
    .map((f) => [f.name, f.optionsFrom!.url(values)] as const);
  const key = JSON.stringify(urls);
  const [loaded, setLoaded] = useState<Record<string, { url: string | null; options: Option[] }>>({});

  useEffect(() => {
    let live = true;
    for (const [name, url] of JSON.parse(key) as [string, string | null][]) {
      const field = fields.find((f) => f.name === name)!;
      if (!url) {
        // Deferred: no synchronous state update inside the effect.
        Promise.resolve().then(() => live && setLoaded((l) => ({ ...l, [name]: { url: null, options: [] } })));
        continue;
      }
      fetchCached<unknown>(url)
        .then((d) => live && setLoaded((l) => ({ ...l, [name]: { url, options: field.optionsFrom!.pick(d) } })))
        .catch(() => live && setLoaded((l) => ({ ...l, [name]: { url, options: [] } })));
    }
    return () => {
      live = false;
    };
    // `fields` is static config; `key` captures every URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return Object.fromEntries(Object.entries(loaded).map(([k, v]) => [k, v.options]));
}

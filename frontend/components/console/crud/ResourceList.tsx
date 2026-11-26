"use client";

// Generic list page, modelled on e.g. backend/views/backend/art-forms/list.blade.php:
// title, optional country filter, Create button (@permission('create')),
// DataTable, Is Active switch (@permission('edit')) and edit / delete actions.
import Link from "next/link";
import { useEffect, useState } from "react";
import { http } from "@/lib/api/http";
import { useConsole } from "@/context/ConsoleContext";
import DataTable, { type Column } from "../ui/DataTable";
import PageHeader, { ErrorBox, Loader, SuccessBox } from "../ui/PageHeader";
import StatusSwitch from "../ui/StatusSwitch";
import { confirmDelete, failure, success } from "../ui/alerts";
import { useFlash } from "../ui/flash";
import { fetchCached, useApiData } from "./useApi";
import type { ListConfig } from "./types";

type Row = { id: number; status?: number } & Record<string, unknown>;
type ListData = { items: Row[]; country_locked?: boolean; selected_country?: number | null };

export default function ResourceList<T extends Row>(cfg: ListConfig<T>) {
  const { can } = useConsole();
  const [flash, clearFlash] = useFlash();
  const [country, setCountry] = useState("");
  const [applied, setApplied] = useState("");

  const params = new URLSearchParams(cfg.query ?? "");
  if (cfg.countryFilter && applied) params.set("country_id", applied);
  const qs = params.toString();
  const url = qs ? `${cfg.endpoint}?${qs}` : cfg.endpoint;
  const { data, setData, error, loading, reload } = useApiData<ListData>(url);
  const rows = (cfg.pick ? cfg.pick(data) : data?.items ?? []) as T[];

  const canCreate = can(cfg.module, "create");
  const canEdit = can(cfg.module, "edit");
  const canDelete = can(cfg.module, "delete");

  const patchRow = (id: number, patch: Partial<Row>) =>
    setData((d) => (d ? { ...d, items: d.items.map((r) => (r.id === id ? { ...r, ...patch } : r)) } : d));

  const columns: Column<T>[] = [...cfg.columns];
  if (cfg.status !== false) {
    columns.push({
      key: "status",
      header: cfg.statusLabel ?? "Is Active",
      sortable: false,
      value: (r) => (r.status ? "Active" : "Inactive"),
      render: (r) => (
        <StatusSwitch
          checked={!!r.status}
          canEdit={canEdit}
          endpoint={`${cfg.endpoint}/${r.id}/status`}
          entity={cfg.entity}
          onChanged={(s) => patchRow(r.id, { status: s })}
        />
      ),
    });
  }

  const showActions = (canEdit && cfg.editHref) || (canDelete && cfg.deletable) || cfg.actions;
  if (showActions) {
    columns.push({
      key: "__actions",
      header: "Action",
      sortable: false,
      className: "text-nowrap",
      value: () => "",
      render: (r) => {
        const editHref = canEdit && cfg.editHref ? cfg.editHref(r) : null;
        return (
          <div className="d-flex gap-1 justify-content-center">
            {cfg.actions?.(r, reload)}
            {editHref && (
              <Link href={editHref} className="btn btn-sm btn-outline-primary" title="Edit" aria-label={`Edit ${cfg.entity}`}>
                <i className="bi bi-pencil-square" />
              </Link>
            )}
            {canDelete && cfg.deletable && (
              <button
                type="button"
                className="btn btn-sm btn-outline-danger"
                title="Delete"
                aria-label={`Delete ${cfg.entity}`}
                onClick={async () => {
                  if (!(await confirmDelete(`this ${cfg.entity}`))) return;
                  try {
                    const res = await http.delete(`${cfg.endpoint}/${r.id}`);
                    setData((d) => (d ? { ...d, items: d.items.filter((x) => x.id !== r.id) } : d));
                    await success(res.message, "Deleted!");
                  } catch (e) {
                    await failure(e);
                  }
                }}
              >
                <i className="bi bi-trash" />
              </button>
            )}
          </div>
        );
      },
    });
  }

  return (
    <div className="container-fluid">
      <PageHeader title={cfg.title} backHref={cfg.backHref} />
      <SuccessBox message={flash} onClose={clearFlash} />
      <ErrorBox message={error} />

      {cfg.countryFilter && data && !data.country_locked && (
        <CountryFilter
          value={country}
          onChange={setCountry}
          onSearch={() => setApplied(country)}
          onReset={() => {
            setCountry("");
            setApplied("");
          }}
        />
      )}

      <div className="d-flex justify-content-end gap-2">
        {cfg.toolbar}
        {canCreate && cfg.createHref && (
          <Link href={cfg.createHref} className="theme-btn rounded-2">
            <i className="bi bi-plus-lg me-1" /> Create
          </Link>
        )}
      </div>

      <div className="row py-2">
        <div className="col-12">
          {loading && !data ? (
            <Loader />
          ) : (
            <DataTable columns={columns} rows={rows} rowKey={cfg.rowKey ?? ((r) => r.id)} emptyText={cfg.emptyText} />
          )}
        </div>
      </div>
    </div>
  );
}

/** The grey "Country / Search / Reset" box above master-data lists. */
export function CountryFilter({ value, onChange, onSearch, onReset }: { value: string; onChange: (v: string) => void; onSearch: () => void; onReset: () => void }) {
  const [countries, setCountries] = useState<{ id: number; name: string }[] | null>(null);
  useEffect(() => {
    let live = true;
    fetchCached<{ countries: { id: number; name: string }[] }>("/lookups/countries")
      .then((d) => live && setCountries(d.countries))
      .catch(() => live && setCountries([]));
    return () => {
      live = false;
    };
  }, []);

  return (
    <div className="row mb-4">
      <div className="col-12">
        <div className="bg-light border rounded-3 shadow-sm p-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSearch();
            }}
          >
            <div className="row align-items-end justify-content-center">
              <div className="col-lg-3 col-md-6 col-12 mb-3 mb-lg-0">
                <label htmlFor="country_filter" className="form-label fw-bold mb-2">
                  Country
                </label>
                <select className="form-select rounded-1" id="country_filter" value={value} onChange={(e) => onChange(e.target.value)}>
                  <option value="">All Countries</option>
                  {(countries ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-lg-3 col-md-6 col-12 mb-3 mb-lg-0">
                <div className="d-flex align-items-center gap-2">
                  <button type="submit" className="theme-btn rounded-2 py-2 px-4">
                    Search
                  </button>
                  <button type="button" className="border-btn rounded-2 py-2 px-4" onClick={onReset}>
                    Reset
                  </button>
                </div>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

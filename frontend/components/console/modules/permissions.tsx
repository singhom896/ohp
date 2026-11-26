"use client";

// Role Permissions matrix - backend/views/backend/permission/list.blade.php.
// Each switch PATCHes /api/permissions immediately; header checkboxes apply a
// permission to every module of the role.
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { http } from "@/lib/api/http";
import { useConsole } from "@/context/ConsoleContext";
import { useApiData } from "../crud/useApi";
import PageHeader, { ErrorBox, Loader } from "../ui/PageHeader";
import { confirmAction, failure } from "../ui/alerts";

const FLAGS = ["can_view", "can_create", "can_edit", "can_delete"] as const;
type Flag = (typeof FLAGS)[number];
type PermRow = { module_id: number; module_name: string; parent_id: number | null; parent_name: string | null } & Record<Flag, number>;
type Data = { roles: { id: number; role_id: number; name: string }[]; selected_role: number | null; items: PermRow[] };

/** /admin/permissions?role_id=5 - wrap in <Suspense>. */
export function PermissionsPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const roleParam = sp.get("role_id") ?? "";
  const [choice, setChoice] = useState(roleParam);
  const { data, setData, error, loading, reload } = useApiData<Data>(`/permissions${roleParam ? `?role_id=${roleParam}` : ""}`);
  const { can, reload: reloadMenu } = useConsole();
  const canEdit = can("/permissions", "edit");
  const [busy, setBusy] = useState(false);

  const roleName = data?.roles.find((r) => String(r.role_id) === roleParam)?.name ?? "—";

  async function save(body: Record<string, unknown>, apply: (rows: PermRow[]) => PermRow[]) {
    setBusy(true);
    const before = data;
    setData((d) => (d ? { ...d, items: apply(d.items) } : d)); // optimistic
    try {
      await http.patch("/permissions", { role_id: Number(roleParam), ...body });
      reloadMenu(); // your own sidebar may have changed
    } catch (e) {
      setData(before);
      await failure(e);
    } finally {
      setBusy(false);
    }
  }

  const toggle = (row: PermRow, flag: Flag | "all", on: boolean) =>
    save({ module_id: row.module_id, permission: flag, status: on ? 1 : 0 }, (rows) =>
      rows.map((r) => (r.module_id !== row.module_id ? r : { ...r, ...Object.fromEntries((flag === "all" ? FLAGS : [flag]).map((f) => [f, on ? 1 : 0])) }))
    );

  const toggleColumn = async (flag: Flag, on: boolean) => {
    const label = flag.replace("can_", "");
    if (!(await confirmAction("Apply to all modules?", `${on ? "Grant" : "Remove"} "${label}" permission on every module for ${roleName}?`, "Yes, apply"))) return;
    await save({ all_modules: true, permission: flag, status: on ? 1 : 0 }, (rows) => rows.map((r) => ({ ...r, [flag]: on ? 1 : 0 })));
    reload();
  };

  return (
    <div className="container-fluid">
      <PageHeader title="Role Permissions" />
      <ErrorBox message={error} />

      <div className="row mb-4">
        <div className="col-12">
          <div className="bg-light border rounded-3 shadow-sm p-3">
            <form
              className="row align-items-end justify-content-center"
              onSubmit={(e) => {
                e.preventDefault();
                router.push(choice ? `/admin/permissions?role_id=${choice}` : "/admin/permissions");
              }}
            >
              <div className="col-lg-3 col-md-6 col-12 mb-3 mb-lg-0">
                <label htmlFor="role_id" className="form-label fw-bold mb-2">Select Role</label>
                <select className="form-select rounded-1" id="role_id" value={choice} onChange={(e) => setChoice(e.target.value)}>
                  <option value="">Select Role</option>
                  {(data?.roles ?? []).map((r) => (
                    <option key={r.role_id} value={r.role_id}>{r.name}</option>
                  ))}
                </select>
              </div>
              <div className="col-lg-3 col-md-6 col-12 mb-3 mb-lg-0">
                <div className="d-flex align-items-center gap-2">
                  <button type="submit" className="theme-btn rounded-2 py-2 px-4">Search</button>
                  <button type="button" className="border-btn rounded-2 py-2 px-4" onClick={() => { setChoice(""); router.push("/admin/permissions"); }}>
                    Reset
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>

      {loading && !data ? (
        <Loader />
      ) : roleParam && data ? (
        <>
          <div className="row py-2 align-items-center">
            <div className="col-12 text-end">
              <span className="text-muted"><i className="bi bi-shield-check me-1" />{data.items.length} Modules</span>
            </div>
          </div>
          <div className="card border-0 shadow-sm rounded-2">
            <div className="card-body p-0">
              <div className="table-responsive">
                <table className="table table-bordered table-data text-center align-middle mb-0">
                  <thead>
                    <tr>
                      <th scope="col">S.No</th>
                      <th scope="col">Module</th>
                      <th scope="col">Role</th>
                      {FLAGS.map((f) => {
                        const all = data.items.length > 0 && data.items.every((r) => r[f] === 1);
                        return (
                          <th scope="col" key={f} className="text-capitalize">
                            {f.replace("can_", "")}
                            {canEdit && (
                              <input
                                type="checkbox"
                                className="form-check-input ms-1"
                                aria-label={`${f.replace("can_", "")} on all modules`}
                                checked={all}
                                disabled={busy}
                                onChange={() => toggleColumn(f, !all)}
                              />
                            )}
                          </th>
                        );
                      })}
                      <th scope="col">All</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((row, i) => {
                      const all = FLAGS.every((f) => row[f] === 1);
                      return (
                        <tr key={row.module_id}>
                          <th scope="row">{i + 1}</th>
                          <td className="text-start">
                            {row.parent_name && <small className="text-muted">{row.parent_name} › </small>}
                            {row.module_name}
                          </td>
                          <td>{roleName}</td>
                          {[...FLAGS, "all" as const].map((f) => {
                            const on = f === "all" ? all : row[f] === 1;
                            return (
                              <td key={f}>
                                <div className="form-check form-switch d-flex justify-content-center">
                                  <input
                                    className="form-check-input"
                                    type="checkbox"
                                    role="switch"
                                    aria-label={`${row.module_name} ${f}`}
                                    checked={on}
                                    disabled={!canEdit || busy}
                                    onChange={() => toggle(row, f, !on)}
                                  />
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="card border-0 shadow-sm rounded-2">
          <div className="card-body text-center py-5">
            <i className="bi bi-shield-lock fs-2 text-secondary" />
            <p className="mb-1 mt-2 fw-semibold">Select a Role</p>
            <p className="text-muted mb-0">Please select a role to manage permissions.</p>
          </div>
        </div>
      )}
    </div>
  );
}

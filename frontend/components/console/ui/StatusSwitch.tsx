"use client";

// The "Is Active" toggle on every list page: SweetAlert confirm, PATCH the
// status endpoint, then show the server's message. Users without `edit`
// permission see an Active / Inactive badge instead (@permission('edit')).
import { useState } from "react";
import { http } from "@/lib/api/http";
import { confirmAction, failure, success } from "./alerts";

type Props = {
  checked: boolean;
  canEdit: boolean;
  /** PATCH url, e.g. `/banners/5/status` */
  endpoint: string;
  /** Used in the confirm text: "Do you want to deactivate this Banner?" */
  entity: string;
  onChanged: (status: number) => void;
  activeLabel?: string;
  inactiveLabel?: string;
};

export default function StatusSwitch({ checked, canEdit, endpoint, entity, onChanged, activeLabel = "Active", inactiveLabel = "Inactive" }: Props) {
  const [busy, setBusy] = useState(false);

  if (!canEdit) {
    return <span className={`badge ${checked ? "bg-success" : "bg-secondary"}`}>{checked ? activeLabel : inactiveLabel}</span>;
  }

  return (
    <div className="form-check form-switch d-flex justify-content-center">
      <input
        className="form-check-input status-change"
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={busy}
        aria-label={`${entity} status`}
        onChange={async () => {
          const ok = await confirmAction(
            "Change status?",
            checked ? `Do you want to deactivate this ${entity}?` : `Do you want to activate this ${entity}?`
          );
          if (!ok) return;
          setBusy(true);
          try {
            const next = checked ? 0 : 1;
            const res = await http.patch<{ status?: number }>(endpoint, { status: next });
            onChanged(res.data?.status ?? next);
            await success(res.message);
          } catch (e) {
            await failure(e);
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}

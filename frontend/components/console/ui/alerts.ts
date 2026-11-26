// SweetAlert2 dialogs used by the panel (same texts/icons as the Blade pages).
// Imported lazily so the library never runs during server rendering.
import { ApiError } from "@/lib/api/client";

async function swal() {
  return (await import("sweetalert2")).default;
}

export async function confirmAction(title: string, text: string, confirmButtonText = "Yes, update"): Promise<boolean> {
  const Swal = await swal();
  const r = await Swal.fire({ title, text, icon: "question", showCancelButton: true, confirmButtonText, cancelButtonText: "Cancel" });
  return r.isConfirmed;
}

export async function confirmDelete(what = "this record"): Promise<boolean> {
  const Swal = await swal();
  const r = await Swal.fire({
    title: "Are you sure?",
    text: `Do you want to delete ${what}? This cannot be undone.`,
    icon: "warning",
    showCancelButton: true,
    confirmButtonColor: "#d40101",
    confirmButtonText: "Yes, delete",
    cancelButtonText: "Cancel",
  });
  return r.isConfirmed;
}

export async function success(message: string, title = "Updated!") {
  const Swal = await swal();
  await Swal.fire(title, message, "success");
}

export async function failure(e: unknown, title = "Error!") {
  const Swal = await swal();
  const message = e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Something went wrong!";
  await Swal.fire(title, message, "error");
}

/** Text prompt (e.g. rejection remarks). Returns null when cancelled. */
export async function promptText(title: string, label: string, required: boolean): Promise<string | null> {
  const Swal = await swal();
  const r = await Swal.fire({
    title,
    input: "textarea",
    inputLabel: label,
    inputAttributes: { maxlength: "5000" },
    showCancelButton: true,
    confirmButtonText: "Submit",
    inputValidator: (v) => (required && !v.trim() ? "This field is required." : undefined),
  });
  return r.isConfirmed ? String(r.value ?? "") : null;
}

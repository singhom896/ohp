import type { Option } from "../ui/fields";
import type { Column } from "../ui/DataTable";

export type Values = Record<string, unknown>;

export type FieldDef = {
  name: string;
  label: string;
  /** "richtext" = CKEditor 5 (HTML), see ui/RichTextEditor.tsx */
  type: "text" | "number" | "email" | "url" | "date" | "time" | "datetime-local" | "select" | "textarea" | "richtext" | "file";
  icon?: string;
  required?: boolean | ((v: Values) => boolean);
  /** Bootstrap grid class, default "col-lg-3". */
  col?: string;
  placeholder?: string;
  help?: React.ReactNode;
  maxLength?: number;
  rows?: number;
  accept?: string;
  multiple?: boolean;
  /** Static options. */
  options?: Option[];
  /**
   * Options from the API. `url` gets the current form values (dependent
   * dropdowns, e.g. regions of the chosen country); return null to clear.
   * `pick` reads the list from the response data.
   */
  optionsFrom?: { url: (v: Values) => string | null; pick: (data: unknown) => Option[] };
  /** Prepended option, e.g. "Select Country" (value ""). */
  emptyOption?: string;
  /** Hide the field unless this returns true. */
  showIf?: (v: Values) => boolean;
  /** Field becomes read-only (and keeps its value) when this returns true. */
  disabledIf?: (v: Values, ctx: FormContext) => boolean;
  /** Key in the loaded item holding the current file URL (file fields). */
  currentUrlKey?: string;
  /** Clear these fields when this one changes (e.g. region when country changes). */
  resets?: string[];
  /** Sent with the form but never shown (e.g. country_id, always India). */
  hidden?: boolean;
};

export type FormContext = {
  /** Country id a Nodal Agency user is locked to, else null. */
  lockedCountryId: number | null;
  editing: boolean;
};

export type FormConfig = {
  /** API collection endpoint, e.g. "/banners" or "/masters/regions". */
  endpoint: string;
  /** Singular label for titles: "Create Banner" / "Edit Banner". */
  entity: string;
  /** Console list page, e.g. "/admin/banners". */
  listHref: string;
  fields: FieldDef[];
  defaults: Values;
  /** Send multipart/form-data (forms with file inputs). */
  multipart?: boolean;
  /** Map the API's `item` to form values (defaults to the item itself). */
  fromItem?: (item: Values) => Values;
  /** Adjust values right before submit. */
  toPayload?: (v: Values) => Values;
  /** Optional title override. */
  title?: (editing: boolean) => string;
};

export type ListConfig<T> = {
  endpoint: string;
  /** Extra query string for the list request only, e.g. "parent_id=5". */
  query?: string;
  /** Show a Back button (child lists). */
  backHref?: string;
  /** Laravel module page_url used for permissions, e.g. "/banners". */
  module: string;
  title: string;
  /** Used in status / delete confirmations. */
  entity: string;
  columns: Column<T>[];
  /** Read the rows from the response data (default data.items). */
  pick?: (data: unknown) => T[];
  rowKey?: (row: T) => string | number;
  /** Console create page (omit to hide the Create button). */
  createHref?: string;
  editHref?: (row: T) => string | null;
  /** Show the status switch column. Default true. */
  status?: boolean;
  statusLabel?: string;
  /** Show a delete button (needs `delete` permission). */
  deletable?: boolean;
  /** Country filter box (country-scoped masters). */
  countryFilter?: boolean;
  /** Extra buttons in the Action column. */
  actions?: (row: T, reload: () => void) => React.ReactNode;
  /** Extra buttons next to "Create". */
  toolbar?: React.ReactNode;
  /** Extra buttons on the left of the toolbar row (Create stays on the right). */
  toolbarStart?: React.ReactNode;
  emptyText?: string;
};

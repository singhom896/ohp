// Field snippets shared by many module configs.
import type { Option } from "../ui/fields";
import { toOptions } from "../ui/fields";
import type { FieldDef } from "./types";

/** statusoptions() in app/Helpers/helpers.php */
export const STATUS_OPTIONS: Option[] = [
  { value: "0", label: "Save and Unpublish" },
  { value: "1", label: "Save and Publish" },
];

/** genderOptions() */
export const GENDER_OPTIONS: Option[] = [
  { value: "1", label: "Male" },
  { value: "2", label: "Female" },
  { value: "3", label: "Others" },
];

export const statusField = (name = "status", label = "Select Status"): FieldDef => ({
  name,
  label,
  type: "select",
  icon: "bi-check2-circle",
  required: true,
  options: STATUS_OPTIONS,
  emptyOption: "Select Status",
});

/** Opportunity Hub is an India-only portal: countries.id of India. */
export const INDIA_COUNTRY_ID = 104;

/**
 * country_id for the API. Never shown: ResourceForm always sends India
 * (the tables are still country-scoped from the original international build).
 */
export const countryField = (resets: string[] = []): FieldDef => ({
  name: "country_id",
  label: "Country",
  type: "select",
  hidden: true,
  resets,
});

/** States / UTs of India (art_regions). */
export const regionField = (required = false, label = "State / UT"): FieldDef => ({
  name: "region_id",
  label,
  type: "select",
  icon: "bi-geo-alt",
  required,
  emptyOption: "Select State / UT",
  optionsFrom: {
    url: (v) => (v.country_id ? `/lookups/countries/${v.country_id}/regions` : null),
    pick: (d) => toOptions((d as { regions: unknown }).regions),
  },
});

export const dash = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));

export function formatDate(v: unknown, withTime = false): string {
  if (!v) return "—";
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return String(v);
  const opts: Intl.DateTimeFormatOptions = withTime
    ? { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }
    : { day: "2-digit", month: "2-digit", year: "numeric" };
  return d.toLocaleString("en-GB", opts).replace(/\//g, "-");
}

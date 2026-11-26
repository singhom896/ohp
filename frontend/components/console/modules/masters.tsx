"use client";

// Data Management: country-scoped masters (API: /masters/<slug>) + Countries.
// Columns, labels and rules follow backend/views/backend/<module>/*.blade.php.
import { makeCrud } from "../crud/makeCrud";
import { countryField, dash, statusField } from "../crud/common";
import { toOptions } from "../ui/fields";
import type { FormConfig, ListConfig } from "../crud/types";

type MasterRow = { id: number; status: number; name: string; country_name?: string; description?: string } & Record<string, unknown>;

function master(slug: string, title: string, entity: string, columns: ListConfig<MasterRow>["columns"], form: Omit<FormConfig, "endpoint" | "listHref" | "entity">) {
  const endpoint = `/masters/${slug}`;
  const listHref = `/admin/${slug}`;
  return makeCrud<MasterRow>(
    {
      endpoint,
      module: `/${slug}`,
      title,
      entity,
      // India-only portal: no country filter / column (country_id is always India).
      createHref: `${listHref}/create`,
      editHref: (r) => `${listHref}/edit?id=${r.id}`,
      columns,
    },
    { endpoint, listHref, entity, ...form }
  );
}

const description = { key: "description", header: "Description", render: (r: MasterRow) => dash(r.description) };

// ---- Art Forms (two levels: main category / subcategory) -----------------
export const { List: ArtFormsList, Create: ArtFormsCreate, Edit: ArtFormsEdit } = master(
  "art-forms",
  "Art Forms Management",
  "Art Form",
  [
    { key: "name", header: "Art Form Name" },
    { key: "type", header: "Type", value: (r) => (Number(r.parent_id) === 0 ? "Main Category" : "Subcategory") , render: (r) => (Number(r.parent_id) === 0 ? "Main Category" : "Subcategory") },
    { key: "parent_name", header: "Parent Category", render: (r) => (Number(r.parent_id) === 0 ? "—" : dash(r.parent_name)) },
    description,
  ],
  {
    defaults: { country_id: "", parent_id: "", name: "", status: "1", description: "" },
    fromItem: (i) => ({ ...i, parent_id: Number(i.parent_id) > 0 ? String(i.parent_id) : "", status: String(i.status) }),
    fields: [
      countryField(["parent_id"]),
      {
        name: "parent_id",
        label: "Category Type / Parent Category",
        type: "select",
        required: true,
        emptyOption: "Main Art Form (No Parent)",
        help: "Select Main Art Form to create a category, or select an existing main category to create a subcategory.",
        optionsFrom: {
          url: (v) => (v.country_id ? `/lookups/countries/${v.country_id}/art-form-parents` : null),
          pick: (d) => toOptions((d as { art_forms: unknown }).art_forms),
        },
      },
      { name: "name", label: "Art Form Name", type: "text", icon: "bi-palette", required: true, maxLength: 150 },
      statusField(),
      { name: "description", label: "Description", type: "textarea", col: "col-lg-12" },
    ],
    // "" (Main Art Form) -> 0
    toPayload: (v) => ({ ...v, parent_id: v.parent_id === "" ? 0 : v.parent_id }),
  }
);

// ---- Artist Awards -----------------------------------------------------
export const { List: ArtistAwardsList, Create: ArtistAwardsCreate, Edit: ArtistAwardsEdit } = master("artist-awards", "Artist Awards Management", "Award", [{ key: "name", header: "Award Name" }, description], {
  defaults: { country_id: "", name: "", description: "", status: "1" },
  fromItem: (i) => ({ ...i, status: String(i.status) }),
  fields: [
    countryField(),
    { name: "name", label: "Award Name", type: "text", icon: "bi-award", required: true, maxLength: 255 },
    statusField(),
    { name: "description", label: "Description", type: "textarea", col: "col-lg-12", maxLength: 500 },
  ],
});

// ---- Artist Group types -------------------------------------------------
export const { List: ArtistGroupsList, Create: ArtistGroupsCreate, Edit: ArtistGroupsEdit } = master("artist-groups", "Artist Group Type Management", "Artist Group type", [{ key: "name", header: "Group Type" }, description], {
  defaults: { country_id: "", name: "", description: "", status: "1" },
  fromItem: (i) => ({ ...i, status: String(i.status) }),
  fields: [
    countryField(),
    { name: "name", label: "Group Type Name", type: "text", icon: "bi-people-fill", required: true, maxLength: 150 },
    statusField(),
    { name: "description", label: "Description", type: "textarea", col: "col-lg-12", maxLength: 255 },
  ],
});

// ---- Artist Institution types ------------------------------------------
export const { List: ArtistInstitutionList, Create: ArtistInstitutionCreate, Edit: ArtistInstitutionEdit } = master(
  "artist-institution",
  "Artist Institution Type Management",
  "Institution type",
  [{ key: "name", header: "Institution Type" }, description],
  {
    defaults: { country_id: "", name: "", description: "", status: "1" },
    fromItem: (i) => ({ ...i, status: String(i.status) }),
    fields: [
      countryField(),
      { name: "name", label: "Institution Type Name", type: "text", icon: "bi-building", required: true, maxLength: 150 },
      statusField(),
      { name: "description", label: "Description", type: "textarea", col: "col-lg-12", maxLength: 255 },
    ],
  }
);

// ---- Artist Languages ---------------------------------------------------
export const { List: ArtistLanguagesList, Create: ArtistLanguagesCreate, Edit: ArtistLanguagesEdit } = master(
  "artist-languages",
  "Artist Languages Management",
  "Language",
  [
    { key: "name", header: "Language" },
    { key: "iso_code", header: "ISO Code" },
  ],
  {
    defaults: { country_id: "", name: "", iso_code: "", status: "1" },
    fromItem: (i) => ({ ...i, status: String(i.status) }),
    fields: [
      countryField(),
      { name: "name", label: "Language Name", type: "text", icon: "bi-translate", required: true, maxLength: 100 },
      { name: "iso_code", label: "ISO Code", type: "text", icon: "bi-code", required: true, maxLength: 10 },
      statusField(),
    ],
  }
);

// ---- Regions ------------------------------------------------------------
export const { List: RegionsList, Create: RegionsCreate, Edit: RegionsEdit } = master(
  "regions",
  "State / UT Management",
  "State / UT",
  [
    { key: "name", header: "State / UT" },
    { key: "short_name", header: "Short Name", render: (r) => dash(r.short_name) },
    { key: "region_code", header: "Code", render: (r) => dash(r.region_code) },
    { key: "region_type", header: "Type", render: (r) => dash(r.region_type) },
  ],
  {
    defaults: { country_id: "", name: "", short_name: "", region_code: "", region_type: "", status: "1" },
    fromItem: (i) => ({ ...i, status: String(i.status), region_code: i.region_code ?? "" }),
    toPayload: (v) => ({ ...v, region_code: v.region_code === "" ? null : v.region_code }),
    fields: [
      countryField(),
      { name: "name", label: "State / UT Name", type: "text", icon: "bi-geo-alt", required: true, maxLength: 150 },
      { name: "short_name", label: "Short Name", type: "text", icon: "bi-type", maxLength: 150 },
      { name: "region_code", label: "State Code", type: "number", icon: "bi-hash" },
      { name: "region_type", label: "Type", type: "text", icon: "bi-diagram-3", maxLength: 50, placeholder: "State / Union Territory" },
      statusField(),
    ],
  }
);

// ---- Countries (list + status only) -------------------------------------
type CountryRow = { id: number; status: number; name: string; alpha_2?: string; alpha_3?: string; phone_code?: string; region?: string; flag_url?: string | null } & Record<string, unknown>;

export const { List: CountriesList, Create: CountriesCreate, Edit: CountriesEdit } = makeCrud<CountryRow>({
  endpoint: "/countries",
  module: "/countries",
  title: "Countries Management",
  entity: "Country",
  columns: [
    {
      key: "name",
      header: "Country",
      render: (r) => (
        <span className="d-inline-flex align-items-center gap-2">
          {r.flag_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={r.flag_url} alt="" width={24} height={16} style={{ objectFit: "cover" }} />
          )}
          {r.name}
        </span>
      ),
    },
    { key: "alpha_2", header: "Alpha-2", render: (r) => dash(r.alpha_2) },
    { key: "alpha_3", header: "Alpha-3", render: (r) => dash(r.alpha_3) },
    { key: "phone_code", header: "Phone Code", render: (r) => dash(r.phone_code) },
    { key: "region", header: "Region", render: (r) => dash(r.region) },
  ],
});

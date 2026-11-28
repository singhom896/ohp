"use client";

// User Management + Administration modules.
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useConsole } from "@/context/ConsoleContext";
import { makeCrud } from "../crud/makeCrud";
import ResourceList from "../crud/ResourceList";
import { countryField, dash, formatDate, GENDER_OPTIONS, regionField, statusField } from "../crud/common";
import { toOptions } from "../ui/fields";
import type { ListConfig } from "../crud/types";

type Row = { id: number; status: number } & Record<string, unknown>;

// ---- Users (console staff accounts) -------------------------------------
export const { List: UsersList, Create: UsersCreate, Edit: UsersEdit } = makeCrud<Row>(
  {
    endpoint: "/users",
    module: "/users",
    title: "User Management",
    entity: "User",
    createHref: "/admin/users/create",
    editHref: (r) => `/admin/users/edit?id=${r.id}`,
    columns: [
      { key: "regno", header: "Reg. No.", render: (r) => dash(r.regno) },
      { key: "full_name", header: "Name" },
      {
        key: "email",
        header: "Email / Mobile",
        render: (r) => (
          <>
            <span className="d-block">{dash(r.email)}</span>
            <small className="text-muted">{dash(r.mobile)}</small>
          </>
        ),
      },
      { key: "role_name", header: "Role", render: (r) => dash(r.role_name) },
      { key: "last_login_at", header: "Last Login", render: (r) => formatDate(r.last_login_at, true) },
    ],
  },
  {
    endpoint: "/users",
    listHref: "/admin/users",
    entity: "User",
    defaults: {
      firstname: "", lastname: "", email: "", mobile: "", gender: "", role: "", country_id: "", region_id: "",
      city: "", designation: "", address: "", pincode: "", status: "1",
    },
    fromItem: (i) =>
      Object.fromEntries(Object.entries(i).map(([k, v]) => [k, v === null || v === undefined ? "" : String(v)])),
    fields: [
      { name: "firstname", label: "First Name", type: "text", icon: "bi-person", required: true, maxLength: 100 },
      { name: "lastname", label: "Last Name", type: "text", icon: "bi-person", required: true, maxLength: 100 },
      { name: "email", label: "Email", type: "email", icon: "bi-envelope", required: true, maxLength: 255 },
      { name: "mobile", label: "Mobile Number", type: "text", icon: "bi-telephone", required: true, maxLength: 10 },
      { name: "gender", label: "Gender", type: "select", icon: "bi-gender-ambiguous", required: true, options: GENDER_OPTIONS, emptyOption: "Select Gender" },
      {
        name: "role",
        label: "Role",
        type: "select",
        icon: "bi-person-gear",
        required: true,
        emptyOption: "Select Role",
        optionsFrom: { url: () => "/users/options", pick: (d) => toOptions((d as { roles: unknown }).roles) },
      },
      countryField(["region_id"]),
      regionField(),
      { name: "city", label: "City / Town", type: "text", icon: "bi-buildings", required: true, maxLength: 255 },
      { name: "designation", label: "Designation", type: "text", icon: "bi-briefcase", maxLength: 255 },
      { name: "pincode", label: "Pincode", type: "text", icon: "bi-mailbox", maxLength: 55 },
      statusField(),
      { name: "address", label: "Address", type: "textarea", col: "col-lg-12", maxLength: 255, rows: 2 },
    ],
  }
);

// ---- Roles --------------------------------------------------------------
export const { List: RolesList, Create: RolesCreate, Edit: RolesEdit } = makeCrud<Row>(
  {
    endpoint: "/roles",
    module: "/role",
    title: "Role Management",
    entity: "Role",
    createHref: "/admin/role/create",
    editHref: (r) => `/admin/role/edit?id=${r.id}`,
    columns: [
      { key: "role_id", header: "Role ID" },
      { key: "name", header: "Role Name" },
      { key: "users_count", header: "Users" },
      {
        key: "permissions_count",
        header: "Permissions",
        render: (r) => (
          <Link href={`/admin/permissions?role_id=${r.role_id}`} className="view">
            {String(r.permissions_count)} <i className="bi bi-box-arrow-up-right ms-1" />
          </Link>
        ),
      },
    ],
  },
  {
    endpoint: "/roles",
    listHref: "/admin/role",
    entity: "Role",
    defaults: { roleid: "", role: "", status: "1" },
    fields: [
      { name: "roleid", label: "Role ID", type: "number", icon: "bi-hash", required: true },
      { name: "role", label: "Role Name", type: "text", icon: "bi-person-gear", required: true },
      statusField(),
    ],
  }
);

// ---- Modules (sidebar entries) ------------------------------------------
const moduleForm = {
  endpoint: "/modules",
  listHref: "/admin/modules",
  entity: "Module",
  defaults: { moduleid: "", parent: "", name: "", url: "", position: "", icon: "", status: "1" },
  fields: [
    { name: "moduleid", label: "Module ID", type: "number" as const, icon: "bi-hash", required: true },
    {
      name: "parent",
      label: "Parent Module",
      type: "select" as const,
      icon: "bi-diagram-3",
      emptyOption: "No Parent (Top Level)",
      optionsFrom: {
        url: (v: Record<string, unknown>) => `/modules/options${v.id ? `?exclude_id=${v.id}` : ""}`,
        pick: (d: unknown) => toOptions((d as { parents: unknown }).parents),
      },
    },
    { name: "name", label: "Module Name", type: "text" as const, icon: "bi-type", required: true },
    { name: "url", label: "Page URL", type: "text" as const, icon: "bi-link-45deg", required: true, placeholder: "/module-url or #" },
    { name: "position", label: "Position", type: "number" as const, icon: "bi-sort-numeric-down", required: true },
    { name: "icon", label: "Icon (Bootstrap Icons)", type: "text" as const, icon: "bi-emoji-smile", required: true, placeholder: "bi bi-speedometer2", help: <a href="https://icons.getbootstrap.com/" target="_blank" rel="noopener noreferrer">Browse icons</a> },
    statusField(),
  ],
};

const modulesList = (parentId: string | null): ListConfig<Row> => ({
  endpoint: "/modules",
  query: parentId ? `parent_id=${parentId}` : undefined,
  backHref: parentId ? "/admin/modules" : undefined,
  module: "/modules",
  title: parentId ? "Child Modules" : "Module Management",
  entity: "Module",
  createHref: "/admin/modules/create",
  editHref: (r) => `/admin/modules/edit?id=${r.id}`,
  deletable: true,
  columns: [
    { key: "module_id", header: "Module ID" },
    { key: "name", header: "Module Name", render: (r) => <><i className={`bi ${String(r.icon).replace(/^bi\s+/, "")} me-2`} />{String(r.name)}</> },
    { key: "url", header: "Page URL" },
    { key: "position", header: "Position" },
    {
      key: "children_count",
      header: "Child Modules",
      render: (r) =>
        Number(r.children_count) > 0 ? (
          <Link href={`/admin/modules?parent_id=${r.module_id}`} className="view">
            {String(r.children_count)} <i className="bi bi-arrow-right-short" />
          </Link>
        ) : (
          "—"
        ),
    },
  ],
});

const modulesCrud = makeCrud<Row>(modulesList(null), moduleForm);
export const ModulesCreate = modulesCrud.Create;
export const ModulesEdit = modulesCrud.Edit;

/** /admin/modules and /admin/modules?parent_id=2 (children). Wrap in <Suspense>. */
export function ModulesList() {
  const parent = useSearchParams().get("parent_id");
  return <ResourceList<Row> key={parent ?? "root"} {...modulesList(parent)} />;
}

// ---- Menus (public website navigation) ----------------------------------
const PAGE_TYPES = [
  { value: "1", label: "Custom" },
  { value: "2", label: "Content" },
  { value: "3", label: "Document" },
];
const MENU_TYPES = [
  { value: "1", label: "Main Menu" },
  { value: "2", label: "Footer Menu" },
  { value: "3", label: "Main Menu & Footer Menu" },
];

const menusList = (parentId: string | null): ListConfig<Row> => ({
  endpoint: "/menus",
  query: parentId ? `parent_id=${parentId}` : undefined,
  backHref: parentId ? "/admin/menus" : undefined,
  module: "/menus",
  title: parentId ? "Child Menus" : "Menu Management",
  entity: "Menu",
  createHref: "/admin/menus/create",
  editHref: (r) => `/admin/menus/edit?id=${r.id}`,
  deletable: true,
  columns: [
    { key: "title", header: "Title" },
    { key: "url", header: "URL" },
    { key: "page_type_label", header: "Page Type" },
    { key: "menu_type_label", header: "Menu Type" },
    { key: "order_index", header: "Main Order", render: (r) => (String(r.menu_type_label).includes("Main") ? String(r.order_index) : "—") },
    { key: "footer_order", header: "Footer Order", render: (r) => (String(r.menu_type_label).includes("Footer") ? dash(r.footer_order) : "—") },
    {
      key: "children_count",
      header: "Child Menus",
      render: (r) =>
        Number(r.children_count) > 0 ? (
          <Link href={`/admin/menus?parent_id=${r.id}`} className="view">
            {String(r.children_count)} <i className="bi bi-arrow-right-short" />
          </Link>
        ) : (
          "—"
        ),
    },
  ],
});

const menusCrud = makeCrud<Row>(menusList(null), {
  endpoint: "/menus",
  listHref: "/admin/menus",
  entity: "Menu Item",
  defaults: { title: "", url: "", parent: "", target: "_self", page_type: "", menu_type: "", ordering: "", status: "1" },
  fields: [
    { name: "title", label: "Title", type: "text", icon: "bi-type", required: true },
    { name: "url", label: "URL", type: "text", icon: "bi-link-45deg", required: true },
    {
      name: "parent",
      label: "Parent Menu",
      type: "select",
      icon: "bi-diagram-3",
      emptyOption: "No Parent (Top Level)",
      optionsFrom: {
        url: (v) => `/menus/options${v.id ? `?exclude_id=${v.id}` : ""}`,
        pick: (d) => toOptions((d as { parents: unknown }).parents, "title"),
      },
    },
    {
      name: "target",
      label: "Target",
      type: "select",
      icon: "bi-box-arrow-up-right",
      required: true,
      options: [
        { value: "_self", label: "_self" },
        { value: "_blank", label: "_blank" },
      ],
    },
    { name: "page_type", label: "Page Type", type: "select", icon: "bi-file-earmark", required: true, options: PAGE_TYPES, emptyOption: "Select Page Type" },
    { name: "menu_type", label: "Menu Type", type: "select", icon: "bi-menu-button-wide", required: true, options: MENU_TYPES, emptyOption: "Select Menu Type" },
    { name: "ordering", label: "Order (Main Menu)", type: "number", icon: "bi-sort-numeric-down", required: true, help: "Footer Menu order: use Manage Menu Ordering." },
    statusField(),
  ],
});
export const MenusCreate = menusCrud.Create;
export const MenusEdit = menusCrud.Edit;

export function MenusList() {
  const parent = useSearchParams().get("parent_id");
  const { can } = useConsole();
  return (
    <ResourceList<Row>
      key={parent ?? "root"}
      {...menusList(parent)}
      // Drag-and-drop ordering of the public Main Menu / Footer Menu (/admin/menus/ordering).
      toolbarStart={
        !parent && can("/menus", "edit") ? (
          <Link href="/admin/menus/ordering" className="border-btn rounded-2 d-inline-flex align-items-center">
            <i className="bi bi-arrow-down-up me-2" aria-hidden="true" /> Manage Menu Ordering
          </Link>
        ) : undefined
      }
    />
  );
}

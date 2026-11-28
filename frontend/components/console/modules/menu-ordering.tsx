"use client";

// Administration -> Menus -> Manage Menu Ordering (/admin/menus/ordering).
// Drag and drop the public website menus (before login): Main Menu and Footer
// Menu are ordered separately (menu_items.order_index / footer_order).
//   GET  /menus/tree?menu=main|footer
//   POST /menus/reorder { menu, items: [{ id, children: [id] }] }
// Top-level menus are reordered among themselves and child menus inside their
// parent (move a menu to another parent from its Edit form). Up / down buttons
// do the same without a mouse (keyboard, touch screens).
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { http } from "@/lib/api/http";
import { useConsole } from "@/context/ConsoleContext";
import { useApiData } from "../crud/useApi";
import PageHeader, { ErrorBox, Loader } from "../ui/PageHeader";
import { confirmAction, failure, success } from "../ui/alerts";

type MenuKey = "main" | "footer";
type Node = { id: number; title: string; url: string; active: boolean; page_type_label: string; children: Node[] };
type TreeData = { menu: MenuKey; items: Node[]; hidden: number };

const MENUS: { key: MenuKey; label: string; icon: string; help: string }[] = [
  { key: "main", label: "Main Menu", icon: "bi-menu-button-wide", help: "The navigation bar at the top of the website." },
  { key: "footer", label: "Footer Menu", icon: "bi-layout-text-window-reverse", help: "The links in the website footer." },
];

/** Move one entry inside an array (returns a new array). */
function move<T>(list: T[], from: number, to: number): T[] {
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

const shape = (items: Node[]) => JSON.stringify(items.map((i) => [i.id, i.children.map((c) => c.id)]));

/** Which list is being dragged: the top level (parent null) or a parent's children. */
type Drag = { parent: number | null; index: number } | null;

type RowProps = {
  node: Node;
  parent: number | null;
  index: number;
  count: number;
  canEdit: boolean;
  dragging: boolean;
  dnd: React.HTMLAttributes<HTMLDivElement>;
  onMove: (to: number) => void;
};

/** One menu row (top level or child). A stable component, so a row being dragged is never remounted. */
function MenuRow({ node, parent, index, count, canEdit, dragging, dnd, onMove }: RowProps) {
  return (
    <div className={`mo-row${parent ? " is-child" : ""}${dragging ? " is-dragging" : ""}${node.active ? "" : " is-inactive"}`} {...dnd}>
      {canEdit && <span className="mo-handle" title="Drag to reorder" aria-hidden="true"><i className="bi bi-grip-vertical" /></span>}
      <span className="mo-pos">{index + 1}</span>
      <div className="mo-main">
        <div className="mo-title">
          {node.title}
          {!node.active && <span className="badge bg-secondary ms-2">Inactive</span>}
          {!parent && node.children.length > 0 && (
            <span className="badge bg-light text-dark border ms-2">{node.children.length} sub-menu{node.children.length > 1 ? "s" : ""}</span>
          )}
        </div>
        <div className="mo-url">{node.url || "—"} · {node.page_type_label}</div>
      </div>
      {canEdit && (
        <div className="mo-move">
          <button type="button" className="btn btn-sm btn-light border" disabled={index === 0} onClick={() => onMove(index - 1)} aria-label={`Move ${node.title} up`} title="Move up">
            <i className="bi bi-arrow-up" />
          </button>
          <button type="button" className="btn btn-sm btn-light border" disabled={index === count - 1} onClick={() => onMove(index + 1)} aria-label={`Move ${node.title} down`} title="Move down">
            <i className="bi bi-arrow-down" />
          </button>
        </div>
      )}
    </div>
  );
}

export function MenuOrdering() {
  const { can } = useConsole();
  const canEdit = can("/menus", "edit");
  const [menu, setMenu] = useState<MenuKey>("main");
  const { data, error, loading, reload } = useApiData<TreeData>(`/menus/tree?menu=${menu}`);

  const [items, setItems] = useState<Node[] | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const drag = useRef<Drag>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);

  // Take a fresh copy whenever the server data changes (tab switch, save, reset).
  const serverKey = data ? `${data.menu}:${shape(data.items)}` : null;
  if (data && serverKey !== loadedFor && data.menu === menu) {
    setLoadedFor(serverKey);
    setItems(data.items);
  }

  const current = items ?? [];
  const dirty = !!data && data.menu === menu && shape(current) !== shape(data.items);

  // Warn before leaving the page with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const switchMenu = async (key: MenuKey) => {
    if (key === menu) return;
    if (dirty && !(await confirmAction("Discard changes?", "The new order of this menu is not saved yet.", "Discard"))) return;
    setItems(null);
    setLoadedFor(null);
    setMenu(key);
  };

  /** Reorder the top level, or the children of `parent`. */
  const reorder = (parent: number | null, from: number, to: number) => {
    if (from === to || to < 0) return;
    setItems((list) => {
      const l = list ?? [];
      if (parent === null) return to < l.length ? move(l, from, to) : l;
      return l.map((n) => (n.id === parent && to < n.children.length ? { ...n, children: move(n.children, from, to) } : n));
    });
  };

  const dragProps = (parent: number | null, index: number, key: string) =>
    canEdit
      ? {
          draggable: true,
          onDragStart: (e: React.DragEvent) => {
            e.stopPropagation();
            drag.current = { parent, index };
            setDragKey(key);
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", key);
          },
          onDragOver: (e: React.DragEvent) => {
            const d = drag.current;
            if (!d || d.parent !== parent) return; // only within the same list
            e.preventDefault();
            e.stopPropagation();
            if (d.index !== index) {
              reorder(parent, d.index, index);
              drag.current = { parent, index };
            }
          },
          onDrop: (e: React.DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
          },
          onDragEnd: () => {
            drag.current = null;
            setDragKey(null);
          },
        }
      : {};

  const save = async () => {
    setSaving(true);
    try {
      const res = await http.post("/menus/reorder", {
        menu,
        items: current.map((n) => ({ id: n.id, children: n.children.map((c) => c.id) })),
      });
      await success(res.message, "Saved!");
      reload();
    } catch (e) {
      await failure(e);
      reload();
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    if (data) setItems(data.items);
  };

  const info = MENUS.find((m) => m.key === menu)!;
  const rowProps = (node: Node, parent: number | null, index: number, count: number) => {
    const key = `${parent ?? "top"}-${node.id}`;
    return {
      node, parent, index, count, canEdit,
      dragging: dragKey === key,
      dnd: dragProps(parent, index, key),
      onMove: (to: number) => reorder(parent, index, to),
    };
  };

  return (
    <div className="container-fluid menu-ordering">
      <PageHeader title="Manage Menu Ordering" backHref="/admin/menus" />

      <div className="mo-tabs" role="tablist" aria-label="Menu">
        {MENUS.map((m) => (
          <button key={m.key} type="button" role="tab" aria-selected={menu === m.key} className={`mo-tab${menu === m.key ? " active" : ""}`} onClick={() => switchMenu(m.key)}>
            <i className={`bi ${m.icon} me-2`} aria-hidden="true" />
            {m.label}
          </button>
        ))}
      </div>

      <div className="mo-help">
        <i className="bi bi-info-circle me-2" aria-hidden="true" />
        <span>
          <b>{info.label}:</b> {info.help} Drag the <i className="bi bi-grip-vertical" aria-hidden="true" /> handle (or use the arrows) to change the order, then
          click <b>Save Order</b>. Sub-menus move within their parent; to move a menu under another parent, use <Link href="/admin/menus">Edit</Link>.
          {menu === "footer" ? " The Footer Menu order is separate from the Main Menu." : " Inactive menus are not shown on the website."}
        </span>
      </div>

      <ErrorBox message={error} />
      {loading && !items ? (
        <Loader />
      ) : (
        <div className="row g-4">
          <div className="col-xl-8">
            <div className="mo-list">
              {current.length === 0 && <div className="text-muted p-4 text-center">No menus in the {info.label}.</div>}
              {current.map((node, i) => (
                <div key={node.id} className="mo-group">
                  <MenuRow {...rowProps(node, null, i, current.length)} />
                  {node.children.length > 0 && (
                    <div className="mo-children">
                      {node.children.map((c, ci) => (
                        <MenuRow key={c.id} {...rowProps(c, node.id, ci, node.children.length)} />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {data && data.hidden > 0 && (
              <div className="small text-muted mt-2">
                {data.hidden} sub-menu(s) are not listed because their parent is not in the {info.label}.
              </div>
            )}

            {canEdit && (
              <div className="mo-actions">
                <span className={`mo-state${dirty ? " dirty" : ""}`}>
                  <i className={`bi ${dirty ? "bi-exclamation-circle" : "bi-check-circle"} me-1`} aria-hidden="true" />
                  {dirty ? "Unsaved changes" : "Order is saved"}
                </span>
                <button type="button" className="border-btn rounded-2" onClick={reset} disabled={!dirty || saving}>
                  <i className="bi bi-arrow-counterclockwise me-1" /> Reset
                </button>
                <button type="button" className="theme-btn rounded-2" onClick={save} disabled={!dirty || saving}>
                  {saving ? <><span className="spinner-border spinner-border-sm me-1" aria-hidden="true" />Saving…</> : <><i className="bi bi-check2 me-1" /> Save Order</>}
                </button>
              </div>
            )}
          </div>

          {/* How the menu will look on the website (active menus only). */}
          <div className="col-xl-4">
            <div className="mo-preview">
              <div className="mo-preview-title"><i className="bi bi-eye me-2" aria-hidden="true" />Website preview</div>
              {menu === "main" ? (
                <ul className="mo-preview-main">
                  {current.filter((n) => n.active).map((n) => (
                    <li key={n.id}>
                      <span>{n.title}{n.children.some((c) => c.active) && <i className="bi bi-chevron-down ms-1" aria-hidden="true" />}</span>
                      {n.children.some((c) => c.active) && (
                        <ul>{n.children.filter((c) => c.active).map((c) => <li key={c.id}>{c.title}</li>)}</ul>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <ul className="mo-preview-footer">
                  {current.filter((n) => n.active).map((n) => (
                    <li key={n.id}>
                      <i className="bi bi-dot" aria-hidden="true" />{n.title}
                      {n.children.some((c) => c.active) && (
                        <ul>{n.children.filter((c) => c.active).map((c) => <li key={c.id}>{c.title}</li>)}</ul>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

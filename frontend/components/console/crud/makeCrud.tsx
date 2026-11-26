"use client";

// Builds the three page components of a standard module from its configs:
//   List   -> /admin/<module>
//   Create -> /admin/<module>/create
//   Edit   -> /admin/<module>/edit?id=5   (query param, not a [id] segment:
//             with cacheComponents a dynamic segment would suspend the shared
//             layout's usePathname; pages wrap Edit in <Suspense>)
// Export each component separately - server pages cannot "dot into" a client module.
import { useSearchParams } from "next/navigation";
import ResourceList from "./ResourceList";
import ResourceForm from "./ResourceForm";
import type { FormConfig, ListConfig } from "./types";

type Row = { id: number; status?: number } & Record<string, unknown>;

export function makeCrud<T extends Row>(list: ListConfig<T>, form?: FormConfig) {
  function List() {
    return <ResourceList<T> {...list} />;
  }
  function Create() {
    return <ResourceForm config={form!} id={null} />;
  }
  function Edit() {
    const raw = Number(useSearchParams().get("id"));
    return <ResourceForm key={raw} config={form!} id={Number.isInteger(raw) && raw > 0 ? raw : null} />;
  }
  return { List, Create, Edit };
}

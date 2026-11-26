"use client";

// CMS Management modules. Field names match the Laravel forms / API rules.
/* eslint-disable @next/next/no-img-element -- images come from the Laravel host */
import { makeCrud } from "../crud/makeCrud";
import { dash, formatDate, statusField } from "../crud/common";
import { toOptions } from "../ui/fields";

type Row = { id: number; status: number } & Record<string, unknown>;

const thumb = (url: unknown, alt = "") =>
  url ? (
    <a href={String(url)} target="_blank" rel="noopener noreferrer">
      <img src={String(url)} alt={alt} className="thumb-preview" />
    </a>
  ) : (
    "—"
  );

const sortorderField = { name: "sortorder", label: "Sort Order", type: "number" as const, icon: "bi-sort-numeric-down", required: true };

// ---- Banners ------------------------------------------------------------
export const { List: BannersList, Create: BannersCreate, Edit: BannersEdit } = makeCrud<Row>(
  {
    endpoint: "/banners",
    module: "/banners",
    title: "Banner Management",
    entity: "Banner",
    createHref: "/admin/banners/create",
    editHref: (r) => `/admin/banners/edit?id=${r.id}`,
    deletable: true,
    columns: [
      { key: "image_url", header: "Banner", sortable: false, render: (r) => thumb(r.image_url, String(r.title)) },
      { key: "title", header: "Title" },
      { key: "ordering", header: "Priority Ordering" },
      { key: "size_mb", header: "Size (MB)", render: (r) => dash(r.size_mb) },
      { key: "created_by", header: "Created By", render: (r) => dash(r.created_by) },
    ],
  },
  {
    endpoint: "/banners",
    listHref: "/admin/banners",
    entity: "Banner",
    multipart: true,
    defaults: { title: "", ordering: "", status: "1" },
    fromItem: (i) => ({ title: i.title, ordering: i.ordering, status: String(i.status) }),
    fields: [
      { name: "title", label: "Banner Title", type: "text", icon: "bi-card-heading", required: true },
      { name: "ordering", label: "Priority Ordering", type: "number", icon: "bi-sort-numeric-down", required: true },
      statusField(),
      { name: "file", label: "Banner Image", type: "file", icon: "bi-image", accept: ".jpg,.jpeg,.png", required: true, currentUrlKey: "image_url", help: "JPG, JPEG or PNG, max 5MB." },
    ],
  }
);

// ---- Ministers ----------------------------------------------------------
export const { List: MinistersList, Create: MinistersCreate, Edit: MinistersEdit } = makeCrud<Row>(
  {
    endpoint: "/ministers",
    module: "/ministers",
    title: "Ministers Management",
    entity: "Minister",
    createHref: "/admin/ministers/create",
    editHref: (r) => `/admin/ministers/edit?id=${r.id}`,
    deletable: true,
    columns: [
      { key: "image_url", header: "Photo", sortable: false, render: (r) => thumb(r.image_url, String(r.title)) },
      { key: "title", header: "Name" },
      { key: "designation", header: "Designation", render: (r) => dash(r.designation) },
      { key: "ordering", header: "Priority Ordering" },
    ],
  },
  {
    endpoint: "/ministers",
    listHref: "/admin/ministers",
    entity: "Minister",
    multipart: true,
    defaults: { title: "", designation: "", ordering: "", status: "1" },
    fromItem: (i) => ({ title: i.title, designation: i.designation ?? "", ordering: i.ordering, status: String(i.status) }),
    fields: [
      { name: "title", label: "Minister Name", type: "text", icon: "bi-person", required: true },
      { name: "designation", label: "Designation", type: "text", icon: "bi-briefcase" },
      { name: "ordering", label: "Priority Ordering", type: "number", icon: "bi-sort-numeric-down", required: true },
      statusField(),
      { name: "file", label: "Photo", type: "file", icon: "bi-image", accept: ".jpg,.jpeg,.png", required: true, currentUrlKey: "image_url", help: "JPG, JPEG or PNG, max 5MB." },
    ],
  }
);

// ---- Content (pages attached to "Content" type menus) -------------------
export const { List: ContentList, Create: ContentCreate, Edit: ContentEdit } = makeCrud<Row>(
  {
    endpoint: "/content",
    module: "/content",
    title: "Content Management",
    entity: "Content",
    createHref: "/admin/content/create",
    editHref: (r) => `/admin/content/edit?id=${r.id}`,
    // Open the page on the public website (/content/<slug>).
    actions: (r) =>
      r.slug && r.status ? (
        <a href={`/content/${String(r.slug)}`} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-outline-info" title="View on website" aria-label="View on website">
          <i className="bi bi-box-arrow-up-right" />
        </a>
      ) : null,
    columns: [
      { key: "title", header: "Title" },
      { key: "menu_title", header: "Menu", render: (r) => dash(r.menu_title) },
      { key: "slug", header: "Slug", render: (r) => dash(r.slug) },
      { key: "updated_at", header: "Last Updated", render: (r) => formatDate(r.updated_at, true) },
    ],
  },
  {
    endpoint: "/content",
    listHref: "/admin/content",
    entity: "Content",
    defaults: { title: "", menu: "", cktext: "", status: "1" },
    fromItem: (i) => ({ ...i, menu: String(i.menu ?? ""), status: String(i.status) }),
    fields: [
      { name: "title", label: "Title", type: "text", icon: "bi-type", required: true, maxLength: 255, col: "col-lg-5" },
      {
        name: "menu",
        label: "Menu",
        type: "select",
        icon: "bi-list",
        required: true,
        col: "col-lg-4",
        emptyOption: "Select Menu",
        optionsFrom: {
          // Menus without content, plus this item's own menu when editing.
          url: (v) => `/content/menus${v.id ? `?content_id=${v.id}` : ""}`,
          pick: (d) => toOptions((d as { menus: unknown }).menus, "title"),
        },
      },
      { ...statusField(), col: "col-lg-3" },
      {
        name: "cktext",
        label: "Content",
        type: "richtext",
        required: true,
        col: "col-lg-12",
        help: "Shown on the public website at /content/<menu slug>. Use “Source” to edit the HTML directly.",
      },
    ],
  }
);

// ---- Documents (PDF upload or external URL) -----------------------------
export const { List: DocumentsList, Create: DocumentsCreate, Edit: DocumentsEdit } = makeCrud<Row>(
  {
    endpoint: "/documents",
    module: "/documents",
    title: "Document Management",
    entity: "Document",
    createHref: "/admin/documents/create",
    editHref: (r) => `/admin/documents/edit?id=${r.id}`,
    deletable: true,
    columns: [
      { key: "title", header: "Title" },
      { key: "menu_title", header: "Menu", render: (r) => dash(r.menu_title) },
      { key: "document_type_label", header: "Type" },
      {
        key: "file",
        header: "Document",
        sortable: false,
        render: (r) => {
          const href = (r.file_url || r.document_url) as string | null;
          return href ? (
            <a href={href} target="_blank" rel="noopener noreferrer" className="view">
              <i className="bi bi-file-earmark-pdf me-1" />
              View{r.size_mb ? ` (${r.size_mb} MB)` : ""}
            </a>
          ) : (
            "—"
          );
        },
      },
      { key: "publish_start_date", header: "Publish From", render: (r) => formatDate(r.publish_start_date, true) },
      { key: "publish_end_date", header: "Publish To", render: (r) => formatDate(r.publish_end_date, true) },
    ],
  },
  {
    endpoint: "/documents",
    listHref: "/admin/documents",
    entity: "Document",
    multipart: true,
    defaults: { title: "", description: "", menu: "", document_type: "1", document_url: "", publish_start_date: "", publish_end_date: "", status: "1" },
    fromItem: (i) => ({ ...i, menu: String(i.menu ?? ""), document_type: String(i.document_type), document_url: i.document_url ?? "", description: i.description ?? "", status: String(i.status) }),
    fields: [
      { name: "title", label: "Document Title", type: "text", icon: "bi-type", required: true },
      {
        name: "menu",
        label: "Menu",
        type: "select",
        icon: "bi-list",
        required: true,
        emptyOption: "Select Menu",
        optionsFrom: { url: () => "/documents/options", pick: (d) => toOptions((d as { menus: unknown }).menus, "title") },
      },
      {
        name: "document_type",
        label: "Document Type",
        type: "select",
        icon: "bi-file-earmark",
        required: true,
        options: [
          { value: "1", label: "PDF Upload" },
          { value: "2", label: "External URL" },
        ],
      },
      statusField(),
      { name: "file", label: "PDF Document", type: "file", icon: "bi-file-earmark-pdf", accept: ".pdf", required: true, currentUrlKey: "file_url", showIf: (v) => v.document_type === "1", help: "PDF only, max 10MB." },
      { name: "document_url", label: "Document URL", type: "url", icon: "bi-link-45deg", required: true, showIf: (v) => v.document_type === "2", maxLength: 555 },
      { name: "publish_start_date", label: "Publish Start Date", type: "datetime-local", icon: "bi-calendar-event", required: true },
      { name: "publish_end_date", label: "Publish End Date", type: "datetime-local", icon: "bi-calendar-x", required: true },
      { name: "description", label: "Description", type: "textarea", col: "col-lg-12" },
    ],
  }
);

// ---- Testimonials -------------------------------------------------------
export const { List: TestimonialsList, Create: TestimonialsCreate, Edit: TestimonialsEdit } = makeCrud<Row>(
  {
    endpoint: "/testimonials",
    module: "/testimonial",
    title: "Testimonial Management",
    entity: "Testimonial",
    createHref: "/admin/testimonial/create",
    editHref: (r) => `/admin/testimonial/edit?id=${r.id}`,
    deletable: true,
    columns: [
      { key: "photo_url", header: "Photo", sortable: false, render: (r) => thumb(r.photo_url, String(r.name)) },
      { key: "name", header: "Name" },
      { key: "age", header: "Age", render: (r) => dash(r.age) },
      { key: "address", header: "Address", render: (r) => dash(r.address) },
      { key: "testimonial", header: "Testimonial", render: (r) => <span className="d-inline-block text-truncate" style={{ maxWidth: 320 }}>{String(r.testimonial)}</span> },
      { key: "sortorder", header: "Sort Order" },
    ],
  },
  {
    endpoint: "/testimonials",
    listHref: "/admin/testimonial",
    entity: "Testimonial",
    multipart: true,
    defaults: { name: "", age: "", address: "", testimonial: "", sortorder: "0", status: "1" },
    fromItem: (i) => ({ ...i, age: i.age ?? "", address: i.address ?? "", status: String(i.status) }),
    fields: [
      { name: "name", label: "Name", type: "text", icon: "bi-person", required: true, maxLength: 150 },
      { name: "age", label: "Age", type: "number", icon: "bi-123" },
      { name: "address", label: "Address", type: "text", icon: "bi-geo-alt", maxLength: 250 },
      sortorderField,
      statusField(),
      { name: "photo", label: "Photo", type: "file", icon: "bi-image", accept: ".jpg,.jpeg,.png", required: true, currentUrlKey: "photo_url", help: "JPG/PNG, max 2MB, max 400x400 px.", col: "col-lg-6" },
      { name: "testimonial", label: "Testimonial", type: "textarea", required: true, maxLength: 1000, col: "col-lg-12" },
    ],
  }
);

// ---- Gallery ------------------------------------------------------------
export const { List: GalleryList, Create: GalleryCreate, Edit: GalleryEdit } = makeCrud<Row>(
  {
    endpoint: "/gallery",
    module: "/gallery",
    title: "Gallery Management",
    entity: "Gallery",
    createHref: "/admin/gallery/create",
    editHref: (r) => `/admin/gallery/edit?id=${r.id}`,
    deletable: true,
    columns: [
      { key: "image_url", header: "Image", sortable: false, render: (r) => thumb(r.image_url, String(r.title)) },
      { key: "title", header: "Title" },
      { key: "location", header: "Location", render: (r) => dash(r.location) },
      { key: "type", header: "Type", render: (r) => dash(r.type) },
      { key: "date", header: "Date", render: (r) => formatDate(r.date) },
      { key: "sortorder", header: "Sort Order" },
    ],
  },
  {
    endpoint: "/gallery",
    listHref: "/admin/gallery",
    entity: "Gallery",
    multipart: true,
    defaults: { title: "", location: "", type: "", date: "", sortorder: "0", status: "1" },
    fromItem: (i) => ({
      ...i,
      location: i.location ?? "",
      type: i.type ?? "",
      date: i.date ?? "",
      status: String(i.status),
    }),
    fields: [
      { name: "title", label: "Title", type: "text", icon: "bi-type", required: true, maxLength: 255 },
      { name: "location", label: "Location", type: "text", icon: "bi-geo-alt", maxLength: 150, help: "Shown under the title on the website, e.g. Hotel Grand Palace, Jaipur." },
      { name: "type", label: "Type", type: "text", icon: "bi-tag", maxLength: 50 },
      { name: "date", label: "Date", type: "date", icon: "bi-calendar" },
      sortorderField,
      statusField(),
      { name: "image", label: "Image", type: "file", icon: "bi-image", accept: ".jpg,.jpeg,.png", required: true, currentUrlKey: "image_url", help: "JPG/PNG, max 2MB." },
    ],
  }
);

// ---- Videos (YouTube URL or MP4 upload) ----------------------------------
export const { List: VideosList, Create: VideosCreate, Edit: VideosEdit } = makeCrud<Row>(
  {
    endpoint: "/videos",
    module: "/video",
    title: "Video Management",
    entity: "Video",
    createHref: "/admin/video/create",
    editHref: (r) => `/admin/video/edit?id=${r.id}`,
    deletable: true,
    columns: [
      {
        key: "preview",
        header: "Video",
        sortable: false,
        render: (r) =>
          r.youtube_id ? (
            <a href={String(r.video_url)} target="_blank" rel="noopener noreferrer">
              <img src={`https://img.youtube.com/vi/${r.youtube_id}/default.jpg`} alt="" className="thumb-preview" />
            </a>
          ) : r.file_url ? (
            <a href={String(r.file_url)} target="_blank" rel="noopener noreferrer" className="view">
              <i className="bi bi-play-btn me-1" />
              MP4
            </a>
          ) : (
            "—"
          ),
      },
      { key: "title", header: "Title" },
      { key: "video_type", header: "Type", value: (r) => (Number(r.video_type) === 1 ? "YouTube" : "MP4"), render: (r) => (Number(r.video_type) === 1 ? "YouTube" : "MP4 Upload") },
      { key: "date", header: "Date", render: (r) => formatDate(r.date) },
      { key: "sortorder", header: "Sort Order" },
    ],
  },
  {
    endpoint: "/videos",
    listHref: "/admin/video",
    entity: "Video",
    multipart: true,
    defaults: { title: "", video_type: "1", video_url: "", date: "", sortorder: "0", status: "1" },
    fromItem: (i) => ({ ...i, video_type: String(i.video_type), video_url: i.video_url ?? "", date: i.date ?? "", status: String(i.status) }),
    fields: [
      { name: "title", label: "Title", type: "text", icon: "bi-type", required: true, maxLength: 255 },
      {
        name: "video_type",
        label: "Video Type",
        type: "select",
        icon: "bi-camera-video",
        required: true,
        options: [
          { value: "1", label: "YouTube URL" },
          { value: "2", label: "MP4 Upload" },
        ],
      },
      { name: "video_url", label: "YouTube URL", type: "url", icon: "bi-youtube", required: true, showIf: (v) => v.video_type === "1", maxLength: 500 },
      { name: "video", label: "MP4 Video", type: "file", icon: "bi-film", accept: ".mp4", required: true, currentUrlKey: "file_url", showIf: (v) => v.video_type === "2", help: "MP4 only, max 10MB." },
      { name: "date", label: "Date", type: "date", icon: "bi-calendar" },
      sortorderField,
      statusField(),
    ],
  }
);

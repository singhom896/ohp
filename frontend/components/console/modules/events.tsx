"use client";

// Event Management: list, create/edit (backend/views/backend/event/addEdit),
// preview + media (event/preview.blade.php).
/* eslint-disable @next/next/no-img-element -- media is served by the Laravel host */
import Link from "next/link";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { http, toFormData } from "@/lib/api/http";
import { useConsole } from "@/context/ConsoleContext";
import { makeCrud } from "../crud/makeCrud";
import { countryField, dash, formatDate, regionField } from "../crud/common";
import { useApiData } from "../crud/useApi";
import PageHeader, { ErrorBox, Loader } from "../ui/PageHeader";
import StatusSwitch from "../ui/StatusSwitch";
import SafeHtml from "../ui/SafeHtml";
import { confirmDelete, failure, success } from "../ui/alerts";
import { ErrorList, FileInput, SelectInput, TextInput } from "../ui/fields";
import { ApiError } from "@/lib/api/client";

type Row = { id: number; status: number } & Record<string, unknown>;

export const { List: EventsList, Create: EventsCreate, Edit: EventsEdit } = makeCrud<Row>(
  {
    endpoint: "/events",
    module: "/event",
    title: "Event Management",
    entity: "Event",
    createHref: "/admin/event/create",
    // Ended events can no longer be edited (same rule as the Blade panel).
    editHref: (r) => (r.has_ended ? null : `/admin/event/edit?id=${r.id}`),
    deletable: true,
    actions: (r) => (
      <Link href={`/admin/event/preview?id=${r.id}`} className="btn btn-sm btn-outline-info" title="Preview" aria-label="Preview event">
        <i className="bi bi-eye" />
      </Link>
    ),
    columns: [
      { key: "title", header: "Event Title" },
      { key: "venue", header: "Venue / City", render: (r) => <>{dash(r.venue)}<br /><small className="text-muted">{dash(r.city)}</small></> },
      {
        key: "event_date",
        header: "Schedule",
        render: (r) => (
          <>
            {formatDate(r.event_date)} {dash(r.event_time)}
            <br />
            <small className="text-muted">to {formatDate(r.event_end_date)} {dash(r.event_end_time)}</small>
            {Boolean(r.has_ended) && <span className="badge bg-secondary ms-1">Ended</span>}
          </>
        ),
      },
      { key: "organised_by", header: "Organised By" },
    ],
  },
  {
    endpoint: "/events",
    listHref: "/admin/event",
    entity: "Event",
    defaults: {
      country_id: "", region_id: "", title: "", venue: "", city: "", event_date: "", event_time: "", event_end_date: "", event_end_time: "",
      organised_by: "", mobile: "", other_mobile: "", email: "", pincode: "", address: "", event_description: "", status: "1",
    },
    fromItem: (i) =>
      Object.fromEntries(Object.entries(i).map(([k, v]) => [k, v === null || v === undefined ? "" : String(v)])),
    fields: [
      { name: "title", label: "Event Title", type: "text", icon: "bi-calendar-event", required: true, maxLength: 255, col: "col-lg-6" },
      { name: "organised_by", label: "Organised By", type: "text", icon: "bi-people", required: true, maxLength: 150, col: "col-lg-6" },
      countryField(["region_id"]),
      regionField(),
      { name: "city", label: "City / Town", type: "text", icon: "bi-buildings", required: true, maxLength: 255 },
      { name: "venue", label: "Venue", type: "text", icon: "bi-geo", required: true, maxLength: 255 },
      { name: "event_date", label: "Start Date", type: "date", icon: "bi-calendar", required: true },
      { name: "event_time", label: "Start Time", type: "time", icon: "bi-clock", required: true },
      { name: "event_end_date", label: "End Date", type: "date", icon: "bi-calendar-check", required: true },
      { name: "event_end_time", label: "End Time", type: "time", icon: "bi-clock-history", required: true },
      { name: "mobile", label: "Contact Mobile", type: "text", icon: "bi-telephone", maxLength: 20 },
      { name: "other_mobile", label: "Other Mobile", type: "text", icon: "bi-telephone-plus", maxLength: 20 },
      { name: "email", label: "Contact Email", type: "email", icon: "bi-envelope", maxLength: 150 },
      { name: "pincode", label: "Pincode", type: "text", icon: "bi-mailbox", maxLength: 55 },
      { name: "address", label: "Address", type: "textarea", col: "col-lg-12", rows: 2, maxLength: 255 },
      { name: "event_description", label: "Event Description", type: "richtext", required: true, col: "col-lg-12" },
    ],
    toPayload: (v) => ({ ...v, region_id: v.region_id || null }),
  }
);

// ---- Preview + media ----------------------------------------------------
type Media = { id: number; media_type: "photo" | "video" | "youtube"; caption: string; status: number; url: string | null; youtube_id: string | null };
type EventDetail = { item: Record<string, unknown>; media: Media[]; media_limits: Record<string, number> };

/** /admin/event/preview?id=5 - wrap in <Suspense> (reads search params). */
export function EventPreview() {
  const id = Number(useSearchParams().get("id")) || 0;
  const { can } = useConsole();
  const { data, setData, error, loading, reload } = useApiData<EventDetail>(id ? `/events/${id}` : null);
  const canEdit = can("/event", "edit");
  const canDelete = can("/event", "delete");

  if (loading && !data) return <Loader />;
  if (!data) {
    return (
      <div className="container-fluid">
        <PageHeader title="Event Preview" backHref="/admin/event" />
        <ErrorBox message={error ?? "Event not found."} />
      </div>
    );
  }

  const e = data.item;
  const rows: [string, React.ReactNode][] = [
    ["Event Title", dash(e.title)],
    ["Organised By", dash(e.organised_by)],
    ["State / UT", dash(e.region_name)],
    ["City / Town", dash(e.city)],
    ["Venue", dash(e.venue)],
    ["Start", `${formatDate(e.event_date)} ${dash(e.event_time)}`],
    ["End", `${formatDate(e.event_end_date)} ${dash(e.event_end_time)}`],
    ["Contact", [e.mobile, e.other_mobile, e.email].filter(Boolean).join(" / ") || "—"],
    ["Address", [e.address, e.pincode].filter(Boolean).join(", ") || "—"],
    ["Status", e.status ? <span className="badge bg-success">Active</span> : <span className="badge bg-secondary">Inactive</span>],
  ];

  return (
    <div className="container-fluid">
      <PageHeader title="Event Preview" backHref="/admin/event" />

      <div className="table-responsive mb-4">
        <table className="table table-bordered preview-data">
          <tbody>
            {rows.map(([k, v]) => (
              <tr key={k}>
                <th className="bg-light" style={{ width: "28%" }}>{k}</th>
                <td>{v}</td>
              </tr>
            ))}
            <tr>
              <th className="bg-light">Description</th>
              <td>{e.event_description ? <SafeHtml html={String(e.event_description)} /> : "—"}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 className="fw-bold mb-3">Event Media</h2>
      {canEdit && <MediaUpload eventId={id} limits={data.media_limits} onUploaded={reload} />}

      {data.media.length === 0 ? (
        <p className="text-muted">No media uploaded yet.</p>
      ) : (
        <div className="row g-3">
          {data.media.map((m) => (
            <div key={m.id} className="col-xl-3 col-lg-4 col-md-6">
              <div className="card h-100 shadow-sm">
                {m.media_type === "photo" && m.url && <img src={m.url} alt={m.caption} className="card-img-top" style={{ height: 170, objectFit: "cover" }} />}
                {m.media_type === "video" && m.url && <video src={m.url} controls className="card-img-top" style={{ height: 170, background: "#000" }} />}
                {m.media_type === "youtube" && m.youtube_id && (
                  <a href={m.url ?? "#"} target="_blank" rel="noopener noreferrer">
                    <img src={`https://img.youtube.com/vi/${m.youtube_id}/hqdefault.jpg`} alt={m.caption} className="card-img-top" style={{ height: 170, objectFit: "cover" }} />
                  </a>
                )}
                <div className="card-body py-2">
                  <span className="badge bg-light text-dark border me-1 text-uppercase">{m.media_type}</span>
                  <small>{m.caption}</small>
                </div>
                <div className="card-footer bg-white d-flex justify-content-between align-items-center">
                  <StatusSwitch
                    checked={!!m.status}
                    canEdit={canEdit}
                    endpoint={`/events/media/${m.id}/status`}
                    entity="media"
                    onChanged={(s) => setData((d) => (d ? { ...d, media: d.media.map((x) => (x.id === m.id ? { ...x, status: s } : x)) } : d))}
                  />
                  {canDelete && (
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-danger"
                      aria-label="Delete media"
                      onClick={async () => {
                        if (!(await confirmDelete("this media"))) return;
                        try {
                          const res = await http.delete(`/events/media/${m.id}`);
                          setData((d) => (d ? { ...d, media: d.media.filter((x) => x.id !== m.id) } : d));
                          await success(res.message, "Deleted!");
                        } catch (err) {
                          await failure(err);
                        }
                      }}
                    >
                      <i className="bi bi-trash" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MediaUpload({ eventId, limits, onUploaded }: { eventId: number; limits: Record<string, number>; onUploaded: () => void }) {
  const [type, setType] = useState<"photo" | "video" | "youtube">("photo");
  const [caption, setCaption] = useState("");
  const [youtube, setYoutube] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);

  return (
    <form
      key={formKey}
      className="form-box bg-light border rounded-3 p-3 mb-4"
      onSubmit={async (ev) => {
        ev.preventDefault();
        setBusy(true);
        setErrors({});
        setMessage(null);
        try {
          const fd = toFormData({ media_type: type, caption, youtube_url: type === "youtube" ? youtube : undefined });
          files.forEach((f) => fd.append(type === "photo" ? "photos[]" : "videos[]", f));
          const res = await http.post(`/events/${eventId}/media`, fd);
          await success(res.message, "Uploaded!");
          setCaption("");
          setYoutube("");
          setFiles([]);
          setFormKey((k) => k + 1);
          onUploaded();
        } catch (err) {
          if (err instanceof ApiError) {
            setErrors(err.errors);
            setMessage(err.message);
          } else setMessage("Upload failed.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <ErrorList errors={errors} message={message} />
      <div className="row align-items-end">
        <div className="col-lg-3 mb-3">
          <SelectInput
            name="media_type"
            label="Media Type"
            icon="bi-collection-play"
            required
            value={type}
            onChange={(v) => {
              setType(v as typeof type);
              setFiles([]);
            }}
            options={[
              { value: "photo", label: `Photos (max ${limits.photo ?? 50})` },
              { value: "video", label: `MP4 Videos (max ${limits.video ?? 6})` },
              { value: "youtube", label: `YouTube (max ${limits.youtube ?? 6})` },
            ]}
          />
        </div>
        <div className="col-lg-4 mb-3">
          <TextInput name="caption" label="Caption" icon="bi-chat-text" required value={caption} onChange={setCaption} maxLength={250} />
        </div>
        <div className="col-lg-3 mb-3">
          {type === "youtube" ? (
            <TextInput name="youtube_url" label="YouTube URL" icon="bi-youtube" type="url" required value={youtube} onChange={setYoutube} />
          ) : (
            <FileInput
              name={type === "photo" ? "photos" : "videos"}
              label={type === "photo" ? "Photos (JPG/PNG, 2MB each)" : "Videos (MP4, 10MB each)"}
              accept={type === "photo" ? ".jpg,.jpeg,.png" : ".mp4"}
              multiple
              required
              onChange={setFiles}
            />
          )}
        </div>
        <div className="col-lg-2 mb-3">
          <button type="submit" className="cms-btn rounded-2 w-100" disabled={busy}>
            {busy && <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />}
            Upload
          </button>
        </div>
      </div>
    </form>
  );
}

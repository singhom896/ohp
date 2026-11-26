"use client";

// Photo & Video Gallery tabs (Photos: Albums / Event Photos, Videos: Videos /
// Event Videos) with a lightbox. Data: backend /public/media (CMS Management ->
// Gallery, Video, and Event Management -> media).
/* eslint-disable @next/next/no-img-element -- media is served by the Laravel host */
import { useEffect, useState } from "react";
import type { MediaData, Photo, Video } from "@/lib/api/pages";

type Open = { kind: "photo"; list: Photo[]; index: number } | { kind: "video"; video: Video } | null;

/** `compact`: no Albums / Event sub-tabs (one event's media). */
export default function MediaGallery({ data, compact = false }: { data: MediaData; compact?: boolean }) {
  const [tab, setTab] = useState<"photos" | "videos">("photos");
  const [photoTab, setPhotoTab] = useState<"albums" | "events">(data.albums.length || !data.event_photos.length ? "albums" : "events");
  const [videoTab, setVideoTab] = useState<"videos" | "events">(data.videos.length || !data.event_videos.length ? "videos" : "events");
  const [open, setOpen] = useState<Open>(null);

  // Keyboard: Esc closes, arrows move between photos.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
      if (open.kind === "photo" && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
        const step = e.key === "ArrowRight" ? 1 : -1;
        setOpen({ ...open, index: (open.index + step + open.list.length) % open.list.length });
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  const photos = photoTab === "albums" ? data.albums : data.event_photos;
  const videos = videoTab === "videos" ? data.videos : data.event_videos;

  return (
    <>
      <div className="op-tabs" role="tablist" aria-label="Media type">
        <button type="button" role="tab" aria-selected={tab === "photos"} className={tab === "photos" ? "on" : ""} onClick={() => setTab("photos")}>
          <i className="bi bi-images" aria-hidden="true" /> Photos
        </button>
        <button type="button" role="tab" aria-selected={tab === "videos"} className={tab === "videos" ? "on" : ""} onClick={() => setTab("videos")}>
          <i className="bi bi-play-btn" aria-hidden="true" /> Videos
        </button>
      </div>

      {tab === "photos" ? (
        <>
          {!compact && <div className="op-subtabs">
            <button type="button" className={photoTab === "albums" ? "on" : ""} onClick={() => setPhotoTab("albums")}>Albums ({data.albums.length})</button>
            <button type="button" className={photoTab === "events" ? "on" : ""} onClick={() => setPhotoTab("events")}>Event Photos ({data.event_photos.length})</button>
          </div>}
          {photos.length ? (
            <div className="op-media-grid">
              {photos.map((p, i) => (
                <button key={`${photoTab}-${p.id}`} type="button" className="op-media" onClick={() => setOpen({ kind: "photo", list: photos, index: i })}>
                  <span className="op-media-img"><img src={p.image} alt="" loading="lazy" decoding="async" /></span>
                  <span className="op-media-cap">
                    <b>{p.title}</b>
                    {p.subtitle && p.subtitle !== p.title && <small>{p.subtitle}</small>}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="op-empty">No photos yet.</p>
          )}
        </>
      ) : (
        <>
          {!compact && <div className="op-subtabs">
            <button type="button" className={videoTab === "videos" ? "on" : ""} onClick={() => setVideoTab("videos")}>Videos ({data.videos.length})</button>
            <button type="button" className={videoTab === "events" ? "on" : ""} onClick={() => setVideoTab("events")}>Event Videos ({data.event_videos.length})</button>
          </div>}
          {videos.length ? (
            <div className="op-media-grid">
              {videos.map((v) => (
                <button key={`${videoTab}-${v.id}`} type="button" className="op-media" onClick={() => setOpen({ kind: "video", video: v })}>
                  <span className="op-media-img video">
                    {v.thumbnail ? <img src={v.thumbnail} alt="" loading="lazy" decoding="async" /> : <video src={v.file ?? undefined} preload="metadata" muted />}
                    <span className="op-play" aria-hidden="true"><i className="bi bi-play-fill" /></span>
                  </span>
                  <span className="op-media-cap">
                    <b>{v.title}</b>
                    {v.subtitle && v.subtitle !== v.title && <small>{v.subtitle}</small>}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="op-empty">No videos yet.</p>
          )}
        </>
      )}

      {open && (
        <div className="op-lightbox" role="dialog" aria-modal="true" aria-label="Media viewer" onClick={() => setOpen(null)}>
          <button type="button" className="op-lb-close" aria-label="Close" onClick={() => setOpen(null)}><i className="bi bi-x-lg" /></button>
          <div className="op-lb-body" onClick={(e) => e.stopPropagation()}>
            {open.kind === "photo" ? (
              <>
                <img src={open.list[open.index].image} alt={open.list[open.index].title ?? ""} />
                <p>{open.list[open.index].title}</p>
                {open.list.length > 1 && (
                  <>
                    <button type="button" className="op-lb-nav prev" aria-label="Previous photo" onClick={() => setOpen({ ...open, index: (open.index - 1 + open.list.length) % open.list.length })}><i className="bi bi-chevron-left" /></button>
                    <button type="button" className="op-lb-nav next" aria-label="Next photo" onClick={() => setOpen({ ...open, index: (open.index + 1) % open.list.length })}><i className="bi bi-chevron-right" /></button>
                  </>
                )}
              </>
            ) : open.video.youtube_id ? (
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${open.video.youtube_id}?autoplay=1&rel=0`}
                title={open.video.title ?? "Video"}
                allow="autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
              />
            ) : (
              <video src={open.video.file ?? undefined} controls autoPlay />
            )}
          </div>
        </div>
      )}
    </>
  );
}

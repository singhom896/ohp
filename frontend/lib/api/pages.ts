// SERVER-ONLY: data for the website pages linked from the header menu
// (backend PublicPagesController). Cached for a few minutes per set of
// filters; saving content in the admin console clears the "cms" tag.
import { cacheLife, cacheTag } from "next/cache";
import { backendFetch } from "./backend";
import { CMS_TAG } from "./public";

export type PageMeta = { current_page: number; last_page: number; per_page: number; total: number; from: number | null; to: number | null };
export type Option = { id: number; name: string };

async function get<T>(path: string, query: Record<string, string | undefined> = {}): Promise<T | null> {
  "use cache";
  cacheLife("minutes");
  cacheTag(CMS_TAG);

  const qs = new URLSearchParams(Object.entries(query).filter((e): e is [string, string] => !!e[1])).toString();
  const res = await backendFetch<T>(path, qs ? { search: `?${qs}` } : undefined);
  return res.body.success ? res.body.data : null;
}

// ---- Art forms (/art-forms)
export type ArtFormGroup = { id: number; name: string; description: string | null; forms: string[] };
export const getArtForms = async () => (await get<{ items: ArtFormGroup[] }>("/public/art-forms"))?.items ?? [];

// ---- Bulletin (/bulletin)
export type DocumentItem = {
  id: number; title: string; description: string | null; kind: "file" | "link";
  url: string | null; extension: string | null; size: string | null; date: string;
};
export const getDocuments = (q: { search?: string; sort?: string; per_page?: string; page?: string }) =>
  get<{ items: DocumentItem[]; meta: PageMeta }>("/public/documents", q);

// ---- Gallery (/gallery)
export type Photo = { id: number; title: string | null; subtitle: string | null; date: string | null; image: string; event_id?: number };
export type Video = { id: number; title: string | null; subtitle: string | null; date: string | null; youtube_id: string | null; file: string | null; thumbnail: string | null };
export type MediaData = { albums: Photo[]; videos: Video[]; event_photos: Photo[]; event_videos: Video[] };
export const getMedia = () => get<MediaData>("/public/media");

// ---- Events (/events, /events/view?id=)
export type EventCard = {
  id: number; title: string; venue: string | null; place: string | null; organised_by: string | null;
  start_date: string; start_time: string | null; end_date: string | null; end_time: string | null;
  excerpt: string; image: string | null; upcoming: boolean;
};
export type EventsData = { items: EventCard[]; meta: PageMeta; counts: { upcoming: number; past: number }; states: Option[] };
export const getEvents = (q: { type?: string; title?: string; state_id?: string; city?: string; date?: string; page?: string }) =>
  get<EventsData>("/public/events", q);
export type EventDetail = { item: EventCard & { description: string; address: string | null; pincode: string | null }; photos: Photo[]; videos: Video[] };
export const getEvent = (id: number) => get<EventDetail>(`/public/events/${id}`);

// ---- Artists (/artist-list, /artist-list/view?id=)
export type ArtistCard = {
  id: number; name: string; real_name: string | null; type: "individual" | "group" | "organisation";
  type_label: string; photo: string | null; art_forms: string[]; location: string | null;
};
export type ArtistsData = {
  items: ArtistCard[]; meta: PageMeta; total: number; art_forms: Option[]; states: Option[];
  types: { value: string; label: string }[];
};
export const getArtists = (q: { search?: string; type?: string; art_form?: string; state_id?: string; page?: string }) =>
  get<ArtistsData>("/public/artists", q);
export type ArtistDetail = {
  item: ArtistCard & {
    about: string | null; facts: { label: string; value: string }[]; languages: string[]; links: string[];
    awards: { name: string; year: number | null; description: string | null }[];
  };
};
export const getArtist = (id: number) => get<ArtistDetail>(`/public/artists/${id}`);

// ---- Opportunities (/opportunities, /opportunities/view?id=)
// Not cached: partners publish and close opportunities throughout the day.
export type OpportunityCard = {
  id: number; reference: string; title: string; category: string | null; organisation: string; organisation_type: string | null;
  verified: boolean; art_form: string; artist_type: string; event_date: string; event_end_date: string | null;
  event_time: string | null; end_time: string | null; venue: string; place: string; respond_by: string | null; budget: string | null;
};
export type OpportunitiesData = { items: OpportunityCard[]; meta: PageMeta; art_forms: Option[]; states: Option[] };
export type OpportunityDetail = {
  item: OpportunityCard & { description: string; artist_requirements: string | null; performers_needed: number | null; language: string | null; audience_size: string | null; duration: string | null };
};
async function getLive<T>(path: string, query: Record<string, string | undefined> = {}): Promise<T | null> {
  const qs = new URLSearchParams(Object.entries(query).filter((e): e is [string, string] => !!e[1])).toString();
  const res = await backendFetch<T>(path, qs ? { search: `?${qs}` } : undefined);
  return res.body.success ? res.body.data : null;
}
export const getOpportunities = (q: { search?: string; art_form?: string; state_id?: string; page?: string }) =>
  getLive<OpportunitiesData>("/public/opportunities", q);
export const getOpportunity = (id: number) => getLive<OpportunityDetail>(`/public/opportunities/${id}`);
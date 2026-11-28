// Server-rendered sections of the home page. Categories, stats
// and ZCCs are live data (GET /public/home); the gallery is the CMS.
import Image from "next/image";
import Link from "next/link";
import { getGallery, getHomeData, type GalleryPhoto } from "@/lib/api/public";
import { getOpportunities } from "@/lib/api/pages";
import { opportunities, steps, galleryItems, artistTestimonials, organizerTestimonials } from "@/lib/data/home";
import { CountUp, TestimonialTabs } from "./HomeClient";

// ---------------------------------------------------------------- categories

/** Icon + colour per main art form (Data Management -> Art Forms); matched by name. */
function artFormLook(name: string, i: number): { icon: string; tone: string } {
  const n = name.toLowerCase();
  const icon =
    n.includes("dance") && n.includes("folk") ? "bi-flower1"
    : n.includes("dance") ? "bi-person-arms-up"
    : n.includes("music") ? "bi-music-note-beamed"
    : n.includes("theatre") || n.includes("drama") ? "bi-mask"
    : n.includes("craft") ? "bi-scissors"
    : n.includes("literature") || n.includes("poetry") ? "bi-book"
    : n.includes("visual") || n.includes("art") ? "bi-palette"
    : n.includes("magic") ? "bi-stars"
    : "bi-gem";
  const tones = ["tone-music", "tone-dance", "tone-theatre", "tone-folk", "tone-magic", "tone-other"];
  return { icon, tone: tones[i % tones.length] };
}

function CategoryFrame({ children }: { children: React.ReactNode }) {
  return (
    <section className="categories" id="categories" data-reveal>
      <div className="container">
        <div className="cat-head">
          <span className="eyebrow">Explore by art form</span>
          <Link href="/artist-list" className="link-arrow">Browse all artists <i className="bi bi-arrow-right" aria-hidden="true" /></Link>
        </div>
        <div className="cat-grid">{children}</div>
      </div>
    </section>
  );
}

export function CategoryGridPlaceholder() {
  return (
    <CategoryFrame>
      {Array.from({ length: 7 }, (_, i) => <div key={i} className="cat-card is-loading" aria-hidden="true" />)}
    </CategoryFrame>
  );
}

/** Main art forms with their number of verified artists; each opens the filtered Artist List. */
export async function CategoryGrid() {
  const cats = (await getHomeData())?.categories ?? [];
  if (!cats.length) return null;
  return (
    <CategoryFrame>
      {cats.map((c, i) => {
        const look = artFormLook(c.name, i);
        return (
          <Link key={c.id} href={`/artist-list?art_form=${c.id}`} className="cat-card">
            <div className={`cat-icon ${look.tone}`}><i className={`bi ${look.icon}`} aria-hidden="true" /></div>
            <h3>{c.name}</h3>
            <p>{c.artists > 0 ? `${c.artists.toLocaleString("en-IN")} verified ${c.artists === 1 ? "artist" : "artists"}` : "Explore artists"}</p>
            <i className="bi bi-arrow-right cat-go" aria-hidden="true" />
          </Link>
        );
      })}
    </CategoryFrame>
  );
}

// ---------------------------------------------------------------- stats

/** Live platform figures (no invented numbers). */
export async function StatsStrip() {
  const s = (await getHomeData())?.stats;
  if (!s) return null;
  const tiles = [
    { icon: "bi-people", value: s.artists, label: "Registered Artists" },
    { icon: "bi-patch-check", value: s.verified, label: "Verified Artists" },
    { icon: "bi-megaphone", value: s.opportunities, label: "Opportunities Posted" },
    { icon: "bi-geo-alt", value: s.states, label: "States & UTs Reached" },
  ];
  return (
    <section className="stats" aria-label="Opportunity Hub in numbers">
      <div className="container stats-grid">
        {tiles.map((t) => (
          <div key={t.label} className="stat">
            <i className={`bi ${t.icon} stat-icon`} aria-hidden="true" />
            <strong><CountUp value={t.value} /></strong>
            <span>{t.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- opportunities

function OpportunityHead() {
  return (
    <div className="section-head">
      <span className="eyebrow">Discover & connect</span>
      <h2>Latest Opportunities</h2>
      <p>Live performance opportunities posted by Engagement Partners. <Link href="/opportunities">See all opportunities</Link>.</p>
    </div>
  );
}

export function OpportunityGridPlaceholder() {
  return (
    <section className="section" id="opportunities">
      <div className="container"><OpportunityHead /></div>
    </section>
  );
}

/** Fills the row when fewer than 3 opportunities are open. */
function PostOpportunityCard() {
  return (
    <div className="opp-card opp-cta">
      <div className="opp-cta-icon"><i className="bi bi-megaphone" aria-hidden="true" /></div>
      <h3>Have a performance opportunity?</h3>
      <p>Hotels, event organisers, institutions and government departments can post requirements and reach verified artists across India.</p>
      <div className="opp-cta-actions">
        <Link href="/register?as=partner" className="btn btn-marigold">Post an Opportunity</Link>
        <Link href="/opportunities" className="link-arrow">View all <i className="bi bi-arrow-right" aria-hidden="true" /></Link>
      </div>
    </div>
  );
}

/** Live public opportunities (the artwork is decorative, one per card position). */
export async function OpportunityGrid() {
  const live = ((await getOpportunities({}))?.items ?? []).slice(0, 3);
  return (
    <section className="section" id="opportunities" data-reveal>
      <div className="container">
        <OpportunityHead />
        <div className="opportunity-grid">
          {live.map((opp, i) => {
            const look = opportunities[i % opportunities.length];
            return (
              <Link key={opp.id} href={`/opportunities/view?id=${opp.id}`} className="opp-card">
                <div className="opp-media">
                  <Image src={look.image} alt="" className="opp-thumb" sizes="(max-width: 760px) 100vw, (max-width: 1050px) 50vw, 400px" />
                  <span className="opp-date">
                    <b>{new Date(`${opp.event_date}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit" })}</b>
                    {new Date(`${opp.event_date}T00:00:00`).toLocaleDateString("en-IN", { month: "short" })}
                  </span>
                </div>
                <div className="opp-body">
                  <span className={`tag${look.tagClass ? ` ${look.tagClass}` : ""}`}>{opp.category ?? opp.art_form}</span>
                  <h3>{opp.title}</h3>
                  <p><i className="bi bi-geo-alt" aria-hidden="true" /> {[opp.organisation, opp.venue, opp.place].filter(Boolean).join(", ")}</p>
                  <div className="meta">
                    <span><i className="bi bi-calendar3" aria-hidden="true" /> {new Date(`${opp.event_date}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span>
                    {opp.event_time && <span><i className="bi bi-clock" aria-hidden="true" /> {opp.event_time}</span>}
                    <span className="opp-more">View details <i className="bi bi-arrow-right" aria-hidden="true" /></span>
                  </div>
                </div>
              </Link>
            );
          })}
          {live.length < 3 && <PostOpportunityCard />}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- how it works

const STEP_ICONS = ["bi-person-plus", "bi-search", "bi-chat-dots", "bi-mic"];

export function HowItWorks() {
  return (
    <section className="section how" id="how" data-reveal>
      <div className="container how-grid">
        <div>
          <span className="eyebrow">Simple & transparent</span>
          <h2>How It Works</h2>
          <p className="how-intro">
            A simple journey for both artists and organizers — from profile creation to performance.
          </p>
          <ol className="steps">
            {steps.map((step, i) => (
              <li key={step.title} className="step">
                <div className="step-icon">
                  <i className={`bi ${STEP_ICONS[i]}`} aria-hidden="true" />
                  <span className="step-num">{i + 1}</span>
                </div>
                <div className="step-text">
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="how-actions">
            <Link href="/register?as=artist" className="btn btn-wine">Join as an Artist</Link>
            <Link href="/register?as=partner" className="btn btn-outline-wine">Post an Opportunity</Link>
          </div>
        </div>

        <div className="process-art" aria-hidden="true">
          <svg className="orbit" viewBox="0 0 400 400">
            <circle cx="200" cy="200" r="150" className="orbit-ring" />
            <circle cx="200" cy="200" r="150" className="orbit-dash" />
            <circle cx="200" cy="200" r="102" className="orbit-inner" />
          </svg>
          <div className="orbit-center">
            <span className="oc-top">Talent</span>
            <i className="bi bi-arrow-down-up" />
            <span className="oc-bottom">Opportunity</span>
          </div>
          {steps.map((step, i) => (
            <div key={step.title} className={`node n${i + 1}`}>
              <span className="node-icon"><i className={`bi ${STEP_ICONS[i]}`} /></span>
              <span className="node-label"><small>Step {i + 1}</small>{step.title}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- gallery

/** Section frame shared by the live gallery and its placeholder. */
function GallerySection({ children }: { children: React.ReactNode }) {
  return (
    <section className="section gallery" id="gallery" data-reveal>
      <div className="container">
        <div className="section-head">
          <span className="eyebrow">From recent performances</span>
          <h2>Moments from the Stage</h2>
          <p>A glimpse of events, festivals and celebrations delivered through the platform.</p>
        </div>
        <div className="gallery-grid">{children}</div>
      </div>
    </section>
  );
}

/** Design placeholder: shown while photos load, or when the Gallery has none. */
export function GalleryPlaceholder() {
  return (
    <GallerySection>
      {galleryItems.map((item) => (
        <div key={item.title} className={`gallery-card ${item.variant}`}>
          <span>
            {item.title}
            <small>{item.place}</small>
          </span>
        </div>
      ))}
    </GallerySection>
  );
}

/**
 * Photos managed in the admin console: CMS Management -> Gallery (title,
 * type, date, sort order, active). Saving there refreshes this section.
 */
export async function GalleryGrid() {
  const photos = await getGallery(7);
  if (!photos.length) return <GalleryPlaceholder />;

  // Second line: the location (with a pin), else type / date.
  const meta = (p: GalleryPhoto) =>
    p.location ||
    [p.type, p.date ? new Date(p.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : null]
      .filter(Boolean)
      .join(" · ");

  return (
    <GallerySection>
      {photos.map((p, i) => {
        // Same rhythm as the design: the 1st and 5th photos span two rows, but
        // only when enough photos follow to fill those rows (no empty gaps).
        const className = `gallery-card has-photo${i % 4 === 0 && photos.length - i >= 3 ? " tall" : ""}`;
        return (
          <figure key={p.id} className={className} aria-label={p.title}>
            {/* eslint-disable-next-line @next/next/no-img-element -- served by the Laravel host */}
            <img src={p.image} alt="" loading="lazy" decoding="async" />
            <figcaption>
              {p.title}
              {meta(p) && (
                <small>
                  {p.location && <i className="gallery-pin" aria-hidden="true" />}
                  {meta(p)}
                </small>
              )}
            </figcaption>
          </figure>
        );
      })}
    </GallerySection>
  );
}

// ---------------------------------------------------------------- testimonials

/** One section, two tabs (was two near-identical sections). */
export function Testimonials() {
  return (
    <section className="testimonials testimonial-section" id="testimonials" data-reveal>
      <div className="container">
        <div className="section-head section-label-center">
          <span className="eyebrow">Voices from the community</span>
          <h2>What Our Community Says</h2>
        </div>
        <TestimonialTabs
          groups={[
            {
              key: "artists", label: "Artists", icon: "bi-person-workspace", items: artistTestimonials,
              intro: "Real experiences from artists using Opportunity Hub to discover and grow their opportunities.",
            },
            {
              key: "partners", label: "Engagement Partners", icon: "bi-building", items: organizerTestimonials,
              intro: "How hotels, institutions and programme coordinators use the platform to find verified talent.",
            },
          ]}
        />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- ZCCs

/** The 7 Zonal Cultural Centres and their member States / UTs. */
export async function ZccSection() {
  const zccs = (await getHomeData())?.zccs ?? [];
  if (!zccs.length) return null;
  return (
    <section className="section zcc-section" id="zcc" data-reveal>
      <div className="container">
        <div className="section-head">
          <span className="eyebrow">Ministry of Culture network</span>
          <h2>Zonal Cultural Centres</h2>
          <p>
            Seven Zonal Cultural Centres review artist registrations and promote the folk, tribal and classical arts of their member
            States / UTs. <Link href="/content/about-zcc">Learn more about ZCCs</Link>.
          </p>
        </div>
        <div className="zcc-grid">
          {zccs.map((z, i) => (
            <article key={z.code} className={`zcc-card zcc-tone-${i % 7}`}>
              <div className="zcc-top">
                <span className="zcc-code">{z.code}</span>
                <span className="zcc-hq"><i className="bi bi-geo-alt-fill" aria-hidden="true" /> {z.headquarters}</span>
              </div>
              <h3>{z.name}</h3>
              <div className="zcc-count">{z.states.length} member States / UTs</div>
              <ul className="zcc-states">
                {z.states.map((s) => <li key={s}>{s}</li>)}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- CTA

export function CtaBand() {
  return (
    <section className="cta" id="cta">
      <div className="container cta-grid">
        <div className="cta-side">
          <div className="cta-icon"><i className="bi bi-person-workspace" aria-hidden="true" /></div>
          <div>
            <h3>Are you an Artist?</h3>
            <p>Individual artists, groups and organisations / institutes: create your profile and get discovered.</p>
          </div>
          <Link className="btn btn-outline-light" href="/register?as=artist">
            Register Now
          </Link>
        </div>
        <div className="cta-divider" />
        <div className="cta-side">
          <div className="cta-icon"><i className="bi bi-building" aria-hidden="true" /></div>
          <div>
            <h3>Are you an Engagement Partner?</h3>
            <p>Hotels, event organisers, corporates and institutions: post opportunities and find the right artists.</p>
          </div>
          <Link className="btn btn-marigold" href="/register?as=partner">
            Post Opportunity
          </Link>
        </div>
      </div>
    </section>
  );
}

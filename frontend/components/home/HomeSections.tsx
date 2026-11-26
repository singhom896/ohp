// Server-rendered sections of the home page. The gallery is live CMS data.
import Image from "next/image";
import Link from "next/link";
import { getGallery, type GalleryPhoto } from "@/lib/api/public";
import { getOpportunities } from "@/lib/api/pages";
import {
  categories,
  stats,
  opportunities,
  steps,
  galleryItems,
  type Testimonial,
} from "@/lib/data/home";

export function CategoryGrid() {
  return (
    <section className="categories" id="categories">
      <div className="container">
        <div className="cat-grid">
          {categories.map((cat) => (
            <div key={cat.title} className="cat-card">
              <div className={`cat-icon ${cat.tone}`}><i className={`bi ${cat.icon}`} aria-hidden="true" /></div>
              <h3>{cat.title}</h3>
              <p>{cat.count}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function StatsStrip() {
  return (
    <section className="stats">
      <div className="container stats-grid">
        {stats.map((stat) => (
          <div key={stat.label} className="stat">
            <strong>{stat.value}</strong>
            <span>{stat.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

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

/** Live public opportunities (the artwork is decorative, one per card position). */
export async function OpportunityGrid() {
  const live = ((await getOpportunities({}))?.items ?? []).slice(0, 3);
  return (
    <section className="section" id="opportunities">
      <div className="container">
        <OpportunityHead />
        {!live.length && (
          <p className="text-center">No open opportunities right now. <Link href="/register?as=partner">Engagement Partners can post one</Link>.</p>
        )}
        <div className="opportunity-grid">
          {live.map((opp, i) => (
            <Link key={opp.id} href={`/opportunities/view?id=${opp.id}`} className="opp-card">
              <Image
                src={opportunities[i % opportunities.length].image}
                alt=""
                className="opp-thumb"
                sizes="(max-width: 760px) 100vw, (max-width: 1050px) 50vw, 400px"
              />
              <div className="opp-body">
                <span className={`tag${opportunities[i % opportunities.length].tagClass ? ` ${opportunities[i % opportunities.length].tagClass}` : ""}`}>{opp.category ?? opp.art_form}</span>
                <h3>{opp.title}</h3>
                <p>{[opp.organisation, opp.venue, opp.place].filter(Boolean).join(", ")}</p>
                <div className="meta">
                  <span>{new Date(`${opp.event_date}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span>
                  <span>{opp.event_time ?? ""}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

export function HowItWorks() {
  return (
    <section className="section how" id="how">
      <div className="container how-grid">
        <div>
          <span className="eyebrow">Simple & transparent</span>
          <h2>How It Works</h2>
          <p className="how-intro">
            A simple journey for both artists and organizers — from profile creation to performance.
          </p>
          <div className="steps">
            {steps.map((step, i) => (
              <div key={step.title} className="step">
                <div className="step-num">{i + 1}</div>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="process-art">
          <div className="node n1">REGISTER</div>
          <div className="node n2">DISCOVER</div>
          <div className="node n3">CONNECT</div>
          <div className="node n4">PERFORM</div>
          <div className="circle">
            Talent
            <br />↕<br />
            Opportunity
          </div>
        </div>
      </div>
    </section>
  );
}

/** Section frame shared by the live gallery and its placeholder. */
function GallerySection({ children }: { children: React.ReactNode }) {
  return (
    <section className="section gallery" id="gallery">
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

export function TestimonialSection({
  eyebrow,
  title,
  intro,
  items,
}: {
  eyebrow?: string;
  title: string;
  intro: string;
  items: Testimonial[];
}) {
  return (
    <section className="testimonials testimonial-section">
      <div className="container">
        <div className="section-head section-label-center">
          {eyebrow && <span className="eyebrow">{eyebrow}</span>}
          <h2>{title}</h2>
          <p>{intro}</p>
        </div>
        <div className="testimonial-grid">
          {items.map((t) => (
            <article key={t.name} className="testimonial-card">
              <div className="quote">“</div>
              <p className="testimonial-text">{t.quote}</p>
              <div className="person">
                <div className={`avatar ${t.tone}`}>{t.initials}</div>
                <div>
                  <strong>{t.name}</strong>
                  <span>{t.role}</span>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

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

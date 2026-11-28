"use client";

// Small interactive pieces of the home page (the sections themselves are
// server components in HomeSections.tsx).
import { useEffect, useRef, useState } from "react";
import type { Testimonial } from "@/lib/data/home";

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Number that counts up from 0 the first time it scrolls into view. The server renders the final value. */
export function CountUp({ value, suffix = "" }: { value: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(value);

  useEffect(() => {
    const el = ref.current;
    if (!el || value <= 0 || reducedMotion()) return;
    let frame = 0;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        const start = performance.now();
        const duration = 1200;
        const tick = (now: number) => {
          const p = Math.min(1, (now - start) / duration);
          setShown(Math.round(value * (1 - Math.pow(1 - p, 3)))); // ease-out
          if (p < 1) frame = requestAnimationFrame(tick);
        };
        setShown(0);
        frame = requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [value]);

  return (
    <span ref={ref}>
      {shown.toLocaleString("en-IN")}
      {suffix}
    </span>
  );
}

/** One testimonial section with "Artists" / "Engagement Partners" tabs. */
export function TestimonialTabs({ groups }: { groups: { key: string; label: string; icon: string; intro: string; items: Testimonial[] }[] }) {
  const [active, setActive] = useState(groups[0]?.key);
  const group = groups.find((g) => g.key === active) ?? groups[0];

  return (
    <>
      <div className="t-tabs" role="tablist" aria-label="Testimonials">
        {groups.map((g) => (
          <button
            key={g.key}
            type="button"
            role="tab"
            id={`t-tab-${g.key}`}
            aria-selected={g.key === group.key}
            aria-controls={`t-panel-${g.key}`}
            className={`t-tab${g.key === group.key ? " active" : ""}`}
            onClick={() => setActive(g.key)}
          >
            <i className={`bi ${g.icon}`} aria-hidden="true" /> {g.label}
          </button>
        ))}
      </div>
      <p className="t-intro">{group.intro}</p>
      <div className="testimonial-grid" role="tabpanel" id={`t-panel-${group.key}`} aria-labelledby={`t-tab-${group.key}`} key={group.key}>
        {group.items.map((t) => (
          <article key={t.name} className="testimonial-card t-fade">
            <div className="t-card-top">
              <div className="quote" aria-hidden="true">“</div>
              <div className="t-stars" aria-label="Rated 5 out of 5">
                {[1, 2, 3, 4, 5].map((n) => <i key={n} className="bi bi-star-fill" aria-hidden="true" />)}
              </div>
            </div>
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
    </>
  );
}

/**
 * Fades sections in as they scroll into view. Only elements with
 * [data-reveal] are affected, and only once this script runs (html.reveal-ready),
 * so the content is fully visible without JavaScript or with reduced motion.
 */
export function ScrollReveal() {
  useEffect(() => {
    if (reducedMotion() || !("IntersectionObserver" in window)) return;
    const root = document.documentElement;
    const seen = new WeakSet<Element>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("is-visible");
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );
    const track = () => {
      for (const el of Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"))) {
        if (seen.has(el)) continue;
        seen.add(el);
        // Already on screen: show at once (no flash for the first view).
        if (el.getBoundingClientRect().top < window.innerHeight) el.classList.add("is-visible");
        else io.observe(el);
      }
    };
    track();
    // Sections streamed in later (Suspense) are picked up too.
    const mo = new MutationObserver(track);
    mo.observe(document.body, { childList: true, subtree: true });
    root.classList.add("reveal-ready");
    return () => {
      io.disconnect();
      mo.disconnect();
      root.classList.remove("reveal-ready");
    };
  }, []);
  return null;
}

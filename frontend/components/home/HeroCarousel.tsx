"use client";

import { useState } from "react";

/** `title` (from Banner Management) is shown on the left of the slide; built-in banners have their text in the image. */
export type HeroSlide = { key: string | number; image: string; alt: string; title?: string };

/**
 * Home page banner slider. Slides come from CMS Management -> Banners
 * (see HomeBanners.tsx); arrows and dots show only when there are 2+ slides.
 */
export default function HeroCarousel({ slides }: { slides: HeroSlide[] }) {
  const [current, setCurrent] = useState(0);
  const go = (index: number) => setCurrent((index + slides.length) % slides.length);
  const many = slides.length > 1;

  return (
    <section className="hero-carousel-section p-0">
      <div className="hero-carousel" aria-roledescription="carousel" aria-label="Highlights">
        {slides.map((slide, i) => (
          <div
            key={slide.key}
            className={`hero-slide${i === current ? " active" : ""}${slide.title ? " has-caption" : ""}`}
            aria-hidden={i !== current}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- banners are served by the Laravel host */}
            <img
              src={slide.image}
              alt={slide.title ? "" : slide.alt}
              loading={i === 0 ? "eager" : "lazy"}
              fetchPriority={i === 0 ? "high" : "auto"}
              decoding="async"
            />
            {slide.title && (
              <div className="hero-caption">
                <span className="hero-caption-kicker">Opportunity Hub · For Indian Artists</span>
                {i === 0 ? <h1>{slide.title}</h1> : <h2>{slide.title}</h2>}
              </div>
            )}
          </div>
        ))}

        {many && (
          <>
            <button className="carousel-control carousel-prev" type="button" aria-label="Previous banner" onClick={() => go(current - 1)}>
              <i className="bi bi-chevron-left" aria-hidden="true" />
            </button>
            <button className="carousel-control carousel-next" type="button" aria-label="Next banner" onClick={() => go(current + 1)}>
              <i className="bi bi-chevron-right" aria-hidden="true" />
            </button>

            <div className="carousel-indicators">
              {slides.map((slide, i) => (
                <button
                  key={slide.key}
                  className={`carousel-dot${i === current ? " active" : ""}`}
                  type="button"
                  aria-label={`Banner ${i + 1}`}
                  aria-current={i === current}
                  onClick={() => go(i)}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

"use client";

// UX4G "Accessibility options" panel (NeGD / MeitY, MIT licence).
// Markup from the UX4G widget; behaviour comes from the downloaded script
// public/vendor/ux4g-accessibility/weights-v1.js (loaded in app/(site)/layout.tsx),
// which wires most buttons by id and exposes the global functions called below.
// The panel opens from the gov-strip button #uw-widget-custom-trigger (GovTools.tsx).
//
// The script changes this markup at runtime (steps, ticks, classes). React
// never re-renders it (no props / state), so those changes are kept.

type Ux4gFn =
  | "openMain" | "closeMain" | "highlightLinks" | "increaseAndReset" | "toggleFontFeature"
  | "toggleImages" | "toggleCursorFeature" | "resetAll";

/** Call a global function defined by weights-v1.js (no-op until the script has loaded). */
export function ux4g(name: Ux4gFn) {
  const fn = (window as unknown as Record<string, unknown>)[name];
  if (typeof fn === "function") (fn as () => void)();
}

const READER = "Enable the UserWay screen reader";

function Tick({ id, extraStyle }: { id: string; extraStyle?: React.CSSProperties }) {
  return <span className="tick-active uwaw-features__item__enabled reset-tick" id={id} style={{ display: "none", ...extraStyle }} />;
}

function Feature({
  itemId, btnId, icon, name, tickId, stepsId, onClick,
}: {
  itemId: string; btnId: string; icon: string; name: string; tickId: string; stepsId?: string; onClick?: Ux4gFn;
}) {
  return (
    <div className="uwaw-features__item reset-feature" id={itemId}>
      <button
        type="button"
        id={btnId}
        className="uwaw-features__item__i"
        data-uw-reader-content={READER}
        aria-label={READER}
        aria-pressed="false"
        onClick={onClick ? () => ux4g(onClick) : undefined}
      >
        <span className="uwaw-features__item__icon">
          <span className={`ux4g-icon ${icon}`} />
        </span>
        <span className="uwaw-features__item__name">{name}</span>
        {/* Steps span tags are added here by the script */}
        {stepsId && <div className="uwaw-features__item__steps reset-steps" id={stepsId} />}
        <Tick id={tickId} />
      </button>
    </div>
  );
}

export default function AccessibilityPanel() {
  return (
    <div className="uwaw uw-light-theme gradient-head uwaw-initial paid_widget" id="uw-main" suppressHydrationWarning>
      {/* Colours come from the site theme (frontend.css, "UX4G panel in the Opportunity Hub theme"). */}
      <div className="relative second-panel">
        <h3>Accessibility options</h3>
        <div className="uwaw-close" role="button" tabIndex={0} aria-label="Close accessibility options"
          onClick={() => ux4g("closeMain")}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ux4g("closeMain"); } }} />
      </div>

      <div className="uwaw-body">
        <div className="h-scroll">
          <div className="uwaw-features">
            <Feature itemId="featureItem_sp" btnId="speak" icon="icon-speaker" name="Screen Reader" tickId="tickIcon_sp" />
            <Feature itemId="featureItem" btnId="btn-s9" icon="icon-bigger-text" name="Bigger Text" tickId="tickIcon" stepsId="featureSteps" />
            <Feature itemId="featureItem-st" btnId="btn-small-text" icon="icon-small-text" name="Small Text" tickId="tickIcon-st" stepsId="featureSteps-st" />
            <Feature itemId="featureItem-lh" btnId="btn-s12" icon="icon-line-hight" name="Line Height" tickId="tickIcon-lh" stepsId="featureSteps-lh" />
            <Feature itemId="featureItem-ht" btnId="btn-s10" icon="icon-highlight-links" name="Highlight Links" tickId="tickIcon-ht" onClick="highlightLinks" />
            <Feature itemId="featureItem-ts" btnId="btn-s13" icon="icon-text-spacing" name="Text Spacing" tickId="tickIcon-ts" stepsId="featureSteps-ts" onClick="increaseAndReset" />
            <Feature itemId="featureItem-df" btnId="btn-df" icon="icon-dyslexia-font" name="Dyslexia Friendly" tickId="tickIcon-df" onClick="toggleFontFeature" />
            <Feature itemId="featureItem-hi" btnId="btn-s11" icon="icon-hide-images" name="Hide Images" tickId="tickIcon-hi" onClick="toggleImages" />
            <Feature itemId="featureItem-Cursor" btnId="btn-cursor" icon="icon-cursor" name="Cursor" tickId="tickIcon-cursor" onClick="toggleCursorFeature" />

            <div className="uwaw-features__item reset-feature" id="featureItem-ht-dark">
              <button type="button" id="dark-btn" className="uwaw-features__item__i" data-uw-reader-content={READER} aria-label={READER} aria-pressed="false">
                <span className="uwaw-features__item__name">
                  <span className="light_dark_icon">
                    <input type="checkbox" className="light_mode uwaw-featugres__item__i" id="checkbox" />
                    <label htmlFor="checkbox" className="checkbox-label">
                      <i className="fas fa-moon-stars"><span className="ux4g-icon icon-moon" /></i>
                      <i className="fas fa-sun"><span className="ux4g-icon icon-sun" /></i>
                      <span className="ball" />
                    </label>
                  </span>
                  <span className="uwaw-features__item__name">Light-Dark</span>
                </span>
                <Tick id="tickIcon-ht-dark" extraStyle={{ pointerEvents: "none" }} />
              </button>
            </div>

            {/* Invert Colors Widget */}
            <Feature itemId="featureItem-ic" btnId="btn-invert" icon="icon-invert" name="Invert Colors" tickId="tickIcon-ic" />
          </div>
        </div>
      </div>

      <div className="reset-panel">
        <div className="copyrights-accessibility">
          <button type="button" className="btn-reset-all" id="reset-all" onClick={() => ux4g("resetAll")}>
            <span className="reset-icon" />
            <span className="reset-btn-text">Reset All Settings</span>
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

// Right side of the government strip: Skip to Main Content, Select Language,
// Accessibility Options. Language = BHASHINI plugin; Accessibility = UX4G panel.
import { ux4g } from "./AccessibilityPanel";

/** Jump to the page's <main id="main-content"> and move keyboard focus there. */
function skipToMain(e: React.MouseEvent<HTMLAnchorElement>) {
  const main = document.getElementById("main-content");
  if (!main) return; // no main on this page: let the browser follow the link
  e.preventDefault();
  if (!main.hasAttribute("tabindex")) main.setAttribute("tabindex", "-1");
  main.focus({ preventScroll: true });
  main.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
}

export default function GovTools() {
  return (
    <div className="gov-tools">
      <a className="gov-tool" href="#main-content" onClick={skipToMain} title="Skip to Main Content" aria-label="Skip to Main Content">
        <i className="bi bi-text-indent-left" aria-hidden="true" />
      </a>
      <span className="gov-sep" aria-hidden="true" />
      {/* Select Language: the BHASHINI translation plugin (script in app/(site)/layout.tsx)
          fills every .bhashini-plugin-container with its language picker. Leave it empty. */}
      <div className="bhashini-plugin-container" title="Select Language" suppressHydrationWarning />

      <span className="gov-sep" aria-hidden="true" />
      {/* Opens the UX4G accessibility panel (AccessibilityPanel.tsx). The id / class
          are the ones the UX4G script and CSS expect for their custom trigger. */}
      <button type="button" id="uw-widget-custom-trigger" className="uw-widget-custom-trigger gov-tool"
        title="Accessibility Options" aria-label="Accessibility Options" aria-controls="uw-main"
        onClick={() => ux4g("openMain")}>
        <i className="bi bi-universal-access" aria-hidden="true" />
      </button>
    </div>
  );
}

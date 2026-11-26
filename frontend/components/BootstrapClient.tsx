"use client";

import { useEffect } from "react";

/**
 * Loads Bootstrap 5's JavaScript in the browser only.
 *
 * Bootstrap's JS touches `document`/`window` as soon as it is imported, so it
 * must never run during server rendering. Importing it inside useEffect keeps
 * it out of SSR and avoids hydration errors. Once loaded, Bootstrap's data
 * attributes (data-bs-toggle="collapse" | "modal" | "dropdown" | "tooltip"...)
 * work anywhere in the app.
 */
export default function BootstrapClient() {
  useEffect(() => {
    import("bootstrap");
  }, []);

  return null;
}

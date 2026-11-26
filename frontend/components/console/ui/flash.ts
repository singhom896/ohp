"use client";

// One-shot success message carried across a client navigation, like Laravel's
// redirect()->with('success', ...): a form sets it, the list page shows it once.
import { useEffect, useState } from "react";

const KEY = "ohp:flash";

export function setFlash(message: string) {
  try {
    sessionStorage.setItem(KEY, message);
  } catch {
    /* storage unavailable: the message is simply not shown */
  }
}

export function useFlash(): [string | null, () => void] {
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    let m: string | null = null;
    try {
      m = sessionStorage.getItem(KEY);
      sessionStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    // Deferred so the state update is not synchronous inside the effect.
    if (m) {
      const t = window.setTimeout(() => setMessage(m), 0);
      return () => window.clearTimeout(t);
    }
  }, []);
  return [message, () => setMessage(null)];
}

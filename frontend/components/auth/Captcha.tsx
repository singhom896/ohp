"use client";

// Captcha for the login / register forms. Laravel (mews/captcha, API mode)
// returns an image + a single-use key via GET /api/captcha; the form sends
// { captcha, captcha_key } back. A key works once, so the image must be
// refreshed after every failed submit (call `refresh()`).
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api/client";

type CaptchaData = { key: string; img: string; expires_in: number };

export function useCaptcha() {
  const [data, setData] = useState<CaptchaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState<string | false>(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await api.get<CaptchaData>("/captcha");
      setData(res.data);
    } catch (e) {
      setData(null);
      // 429 = too many captchas from this visitor in a minute.
      setFailed(e instanceof ApiError && e.status === 429 ? "Too many tries. Wait a minute, then press ↻" : "Could not load. Press ↻ to retry");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(refresh, 0);
    return () => window.clearTimeout(t);
  }, [refresh]);

  // Keys expire on the server; fetch a fresh one shortly before that.
  useEffect(() => {
    if (!data) return;
    const t = window.setTimeout(refresh, Math.max(30, data.expires_in - 15) * 1000);
    return () => window.clearTimeout(t);
  }, [data, refresh]);

  return { key: data?.key ?? "", img: data?.img ?? null, loading, failed, refresh };
}

type Props = {
  captcha: ReturnType<typeof useCaptcha>;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  id?: string;
};

export default function CaptchaField({ captcha, value, onChange, error, id = "captcha" }: Props) {
  return (
    <div className="field">
      <label htmlFor={id}>
        Security Code <span className="req">*</span>
      </label>
      {/* One line: answer box, image, refresh button. */}
      <div className="captcha-row">
        <input
          id={id}
          name="captcha"
          type="text"
          className="captcha-input"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          maxLength={20}
          placeholder="Enter the code"
          title="Type the characters shown in the image (not case-sensitive)"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        <div className="captcha-img" aria-live="polite">
          {captcha.img ? (
            // eslint-disable-next-line @next/next/no-img-element -- data URI from the API
            <img src={captcha.img} alt="CAPTCHA image: type the characters shown" width={260} height={72} />
          ) : (
            <span className="small text-muted captcha-msg">{captcha.failed || "Loading…"}</span>
          )}
        </div>
        <button
          type="button"
          className="captcha-refresh"
          onClick={() => {
            onChange("");
            captcha.refresh();
          }}
          disabled={captcha.loading}
          aria-label="Load a new CAPTCHA image"
          title="Refresh CAPTCHA"
        >
          ↻
        </button>
      </div>
      {error && (
        <div id={`${id}-error`} className="text-danger small mt-1">
          {error}
        </div>
      )}
    </div>
  );
}

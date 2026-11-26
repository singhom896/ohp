"use client";

// Profile gate for artist accounts. While the profile is incomplete (and no
// update is waiting for review), every artist page except My Profile and
// Change Password redirects to My Profile and shows the "Complete your profile"
// popup. The lock lifts as soon as the profile is saved / submitted: the profile
// form calls verify(), which refreshes profile_completed / profile_pending.
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { PROFILE_PATH, isAllowedWhileLocked, isProfileLocked } from "@/lib/auth/profileGate";
import { Loader } from "./ui/PageHeader";

export default function ProfileGate({ children }: { children: React.ReactNode }) {
  const { user, status } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [popup, setPopup] = useState(false);

  const locked = isProfileLocked(user);
  const blocked = locked && !isAllowedWhileLocked(pathname);
  // Artist pages wait for /auth/me, so a locked page never flashes or loads its data.
  const waiting = status === "loading" && (pathname === "/artist" || pathname.startsWith("/artist/"));

  useEffect(() => {
    if (!blocked) return;
    router.replace(PROFILE_PATH);
    const t = window.setTimeout(() => setPopup(true), 0);
    return () => window.clearTimeout(t);
  }, [blocked, router, pathname]);

  return (
    <>
      {waiting || blocked ? <Loader /> : children}
      {popup && locked && <CompleteProfileDialog name={user?.name} onClose={() => setPopup(false)} />}
    </>
  );
}

function CompleteProfileDialog({ name, onClose }: { name?: string; onClose: () => void }) {
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    button.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div className="modal d-block" role="dialog" aria-modal="true" aria-labelledby="pg-title" aria-describedby="pg-text" tabIndex={-1}>
        <div className="modal-dialog modal-dialog-centered">
          <div className="modal-content">
            <div className="modal-header">
              <h2 className="modal-title h5" id="pg-title">
                <i className="bi bi-person-exclamation me-2 text-warning" aria-hidden="true" />
                Complete your profile
              </h2>
              <button type="button" className="btn-close" aria-label="Close" onClick={onClose} />
            </div>
            <div className="modal-body" id="pg-text">
              <p className="mb-2">Hello{name ? ` ${name}` : ""}, your artist profile is not complete yet.</p>
              <p className="mb-0">
                Please fill in all required details (marked <span className="text-danger">*</span>) and
                save or submit your profile. Other sections of your account will open after that.
              </p>
            </div>
            <div className="modal-footer">
              <button ref={button} type="button" className="cms-btn rounded-2 py-2 px-3" onClick={onClose}>
                <i className="bi bi-pencil-square me-1" aria-hidden="true" /> Update Profile
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="modal-backdrop show" />
    </>
  );
}

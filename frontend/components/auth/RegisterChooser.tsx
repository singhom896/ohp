"use client";

// Register: first choose the path, then the form for it.
//   Card 1  Register as Artist / Group   -> Individual Artist / Artist Group / Organisation / Institute
//   Card 2  Register as Engagement Partner -> hotels, organisers, corporates, cultural institutions, govt. departments
// The choice is kept in the URL (?as=artist | ?as=partner) so links such as
// "Post an Opportunity" can open the partner form directly.
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import RegisterForm, { type RegisterPath } from "./RegisterForm";

const PATHS: { id: RegisterPath; icon: string; title: string; desc: string; points: string[] }[] = [
  {
    id: "artist",
    icon: "🎭",
    title: "Register as Artist / Group",
    desc: "Register as an Individual Artist, Artist Group or Organisation / Institute to create an artistic profile, showcase your portfolio and discover opportunities.",
    points: ["Individual Artist", "Artist Group (Leader Details)", "Organisation / Institute"],
  },
  {
    id: "partner",
    icon: "🤝",
    title: "Register as Engagement Partner",
    desc: "Register as a Hotel, Event Organizer, Corporate, Cultural Institution or Government Department to discover artists and manage performance opportunities.",
    points: ["Hotels & Wedding / Event / Festival Organisers", "Corporates & Cultural Institutions", "Government Departments"],
  },
];

export default function RegisterChooser() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const as = params.get("as");
  const path: RegisterPath | null = as === "artist" || as === "partner" ? as : null;
  const go = (p: RegisterPath | null) => router.replace(p ? `${pathname}?as=${p}` : pathname, { scroll: false });

  if (path) {
    // key: a fresh form (and captcha) when switching path.
    return <RegisterForm key={path} path={path} onChangePath={() => go(path === "artist" ? "partner" : "artist")} />;
  }

  return (
    <div className="intro reg-choose">
      <div className="kicker">OPEN REGISTRATION</div>
      <h1>Create your Opportunity Hub account</h1>
      <div className="subtitle">Choose how you want to use Opportunity Hub. Registration is free.</div>
      <div className="reg-path-grid">
        {PATHS.map((p) => (
          <button key={p.id} type="button" className={`reg-path reg-path-${p.id}`} onClick={() => go(p.id)}>
            <span className="reg-path-icon" aria-hidden="true">{p.icon}</span>
            <span className="reg-path-title">{p.title}</span>
            <span className="reg-path-desc">{p.desc}</span>
            <span className="reg-path-points">
              {p.points.map((x) => (
                <span key={x}>✓ {x}</span>
              ))}
            </span>
            <span className="reg-path-cta">Continue →</span>
          </button>
        ))}
      </div>
    </div>
  );
}

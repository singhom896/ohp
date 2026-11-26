"use client";

// Console dashboard (Opportunity Hub design). Every figure comes from
// GET /api/console/dashboard (Laravel ConsoleController::dashboard): artist
// registrations, approvals, events and recent activity, scoped to the Nodal
// Agency's country where applicable. Artist accounts get the welcome banner
// and their modules only.
import Link from "next/link";
import { useConsole } from "@/context/ConsoleContext";
import { useApiData } from "../crud/useApi";
import { ErrorBox, Loader } from "../ui/PageHeader";

type TrendRow = { month: string; individual: number; group: number; institution: number; total: number };
type Activity = { at: string; kind: "approved" | "rejected" | "registered" | "event"; title: string; name: string; meta: string | null };
type UpcomingEvent = { id: number; title: string; organised_by: string | null; location: string | null; event_date: string; status: string };
export type DashboardData = {
  agency_name: string;
  role_name: string | null;
  is_nodal_agency: boolean;
  country: { id: number; name: string } | null;
  modules: { id: number; name: string; url: string; icon: string }[];
  stats: null | {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    approval_rate: number | null;
    total_change: number | null;
    events: number;
    upcoming_events: number;
    events_change: number | null;
  };
  by_type?: { individual: number; group: number; institution: number };
  trend?: TrendRow[];
  recent_activity?: Activity[];
  upcoming_events?: UpcomingEvent[] | null;
  /** Artist / Group / Organisation accounts. */
  artist_summary?: {
    regno: string | null; type: string | null; verified_status: number; profile_completed: boolean;
    open_opportunities: number; pending_requests: number; confirmed: number; completed: number; saved: number;
    unread_notifications: number; members: number | null;
    upcoming: { id: number; title: string; event_date: string; venue: string }[];
  };
};

// Same palette as the design mock-up (styles/console/theme.css --oh-*).
const COLORS = { individual: "#01347c", group: "#02a8b0", institution: "#fe8902", total: "#9838eb" };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmt = (n: number) => n.toLocaleString("en-IN");
const monthLabel = (ym: string) => `${MONTHS.at(Number(ym.slice(5, 7)) - 1)} ${ym.slice(0, 4)}`;

export default function Dashboard() {
  const { data, error, loading } = useApiData<DashboardData>("/console/dashboard");

  if (loading && !data) return <Loader />;
  if (!data) return <ErrorBox message={error ?? "Unable to load the dashboard."} />;

  return <DashboardView data={data} />;
}

export function DashboardView({ data }: { data: DashboardData }) {
  return (
    <div className="oh-dash">
      <Welcome data={data} />
      {data.stats ? <AdminDashboard data={data} /> : (
        <>
          {data.artist_summary && <ArtistSummary s={data.artist_summary} />}
          <ModulesGrid modules={data.modules} />
        </>
      )}
    </div>
  );
}

const ACCOUNT_STATUS = ["Under Review", "Registered & Verified", "Not Approved"];

/** Artist / Group / Organisation: registration, opportunities and performances at a glance. */
function ArtistSummary({ s }: { s: NonNullable<DashboardData["artist_summary"]> }) {
  const { href, can } = useConsole();
  const tile = (icon: string, tone: string, label: string, value: number, url: string) => {
    const body = (
      <>
        <i className={`bi ${icon} oh-kpi-icon`} aria-hidden="true" />
        <div>
          <div className="oh-kpi-label">{label}</div>
          <div className="oh-kpi-value">{fmt(value)}</div>
        </div>
        <i className={`bi ${icon} oh-kpi-ghost`} aria-hidden="true" />
      </>
    );
    return can(url) ? <Link key={label} href={href(url)} className={`oh-kpi ${tone}`}>{body}</Link> : <div key={label} className={`oh-kpi ${tone}`}>{body}</div>;
  };
  return (
    <>
      <section className="oh-card oh-panel" aria-label="Registration">
        <div className="d-flex flex-wrap align-items-center gap-3">
          <span><b>{s.type}</b> · Registration ID <b>{s.regno ?? "—"}</b></span>
          <span className={`badge ${s.verified_status === 1 ? "bg-success" : s.verified_status === 2 ? "bg-danger" : "bg-warning text-dark"}`}>{ACCOUNT_STATUS[s.verified_status] ?? "Under Review"}</span>
          {!s.profile_completed && can("/application") && <Link href={href("/application")} className="ms-auto">Complete your profile →</Link>}
          {can("/registration-card") && <Link href={href("/registration-card")} className={s.profile_completed ? "ms-auto" : ""}>Digital Registration Card →</Link>}
        </div>
      </section>
      <section className="oh-kpis" aria-label="Opportunities and performances">
        {tile("bi-search", "kpi-peach", "Open Opportunities", s.open_opportunities, "/opportunities")}
        {tile("bi-envelope-open", "kpi-mint", "Booking Requests", s.pending_requests, "/booking-requests")}
        {tile("bi-calendar2-check", "kpi-sky", "Confirmed Performances", s.confirmed, "/performances")}
        {tile("bi-flag", "kpi-lilac", "Completed", s.completed, "/engagement-history")}
      </section>
      {s.upcoming.length > 0 && (
        <section className="oh-card oh-panel" aria-labelledby="up-perf">
          <div className="oh-panel-head"><h2 id="up-perf"><i className="bi bi-calendar3" aria-hidden="true" /> Upcoming Performances</h2></div>
          <ul className="oh-activity">
            {s.upcoming.map((u) => (
              <li key={u.id}>
                <span className="oh-act-icon act-event" aria-hidden="true"><i className="bi bi-music-note-beamed" /></span>
                <div><div className="oh-act-title"><Link href={`${href("/opportunities")}/view?id=${u.id}`}><b>{u.title}</b></Link></div><div className="oh-act-meta">{u.venue}</div></div>
                <time className="oh-act-time" dateTime={u.event_date}>{u.event_date.split("-").reverse().join("-")}</time>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function Welcome({ data }: { data: DashboardData }) {
  const subtitle = data.is_nodal_agency
    ? "ZCC Nodal Officer · artist scrutiny, accreditation, events and engagement reports."
    : data.stats
      ? "Manage artists, engagement partners, events and content on the Opportunity Hub Portal."
      : "Manage your profile, opportunities, booking requests and performances on the Opportunity Hub Portal.";
  return (
    <section className="oh-card oh-welcome" aria-label="Welcome">
      {/* The artwork is the section's CSS background (theme.css .oh-welcome::after). */}
      <div className="oh-welcome-text">
        <h1>Welcome Back, {data.agency_name}</h1>
        <p>{subtitle}</p>
      </div>
    </section>
  );
}

function AdminDashboard({ data }: { data: DashboardData }) {
  const { href, can } = useConsole();
  const s = data.stats!;
  const artistsHref = can("/artist", "view") ? href("/artist") : null;
  const eventsHref = can("/event", "view") ? href("/event") : null;
  const pendingPct = s.total ? Math.round((s.pending / s.total) * 1000) / 10 : 0;

  return (
    <>
      <section className="oh-kpis" aria-label="Key figures">
        <Kpi tone="kpi-peach" icon="bi-people" label="Total Registrations" value={s.total} href={artistsHref}
          foot={<Change value={s.total_change} />} />
        <Kpi tone="kpi-mint" icon="bi-clipboard-check" label="Pending Approvals" value={s.pending}
          href={artistsHref ? `${artistsHref}?registration_status=0` : null}
          foot={<><span className="oh-pill flat"><i className="bi bi-clock" /> {pendingPct}%</span> of all registrations</>} />
        <Kpi tone="kpi-sky" icon="bi-calendar-event" label="Total Events" value={s.events} href={eventsHref}
          foot={<><span className="oh-pill"><i className="bi bi-calendar-check" /> {fmt(s.upcoming_events)}</span> upcoming events</>} />
        <Kpi tone="kpi-lilac" icon="bi-patch-check" label="Approved Artists" value={s.approved}
          href={artistsHref ? `${artistsHref}?registration_status=1` : null}
          foot={s.approval_rate === null ? <>No registrations yet</> : <><span className="oh-pill"><i className="bi bi-check2" /> {s.approval_rate}%</span> approval rate</>} />
      </section>

      <div className="oh-row-2">
        <section className="oh-card oh-panel" aria-labelledby="trend-title">
          <div className="oh-panel-head">
            <h2 id="trend-title"><i className="bi bi-bar-chart-fill" aria-hidden="true" /> Registrations Trend</h2>
            <span className="oh-chip-select">Last 6 Months <i className="bi bi-chevron-down" aria-hidden="true" /></span>
          </div>
          <TrendChart rows={data.trend ?? []} />
          <div className="oh-legend">
            <span><i className="oh-swatch" style={{ background: COLORS.individual }} /> Individual Artist</span>
            <span><i className="oh-swatch" style={{ background: COLORS.group }} /> Artist Group</span>
            <span><i className="oh-swatch" style={{ background: COLORS.institution }} /> Organisation</span>
            <span><i className="oh-swatch line" style={{ background: COLORS.total }} /> Total Registrations</span>
          </div>
        </section>

        <section className="oh-card oh-panel" aria-labelledby="category-title">
          <div className="oh-panel-head">
            <h2 id="category-title"><i className="bi bi-bar-chart-line-fill" aria-hidden="true" /> Registrations by Category</h2>
          </div>
          <CategoryDonut byType={data.by_type ?? { individual: 0, group: 0, institution: 0 }} />
        </section>
      </div>

      <div className="oh-row-2 oh-wide-left">
        <section className="oh-card oh-panel" aria-labelledby="activity-title">
          <div className="oh-panel-head">
            <h2 id="activity-title"><i className="bi bi-clock-history" aria-hidden="true" /> Recent Activity</h2>
            {artistsHref && <Link href={artistsHref} className="oh-viewall">View All <i className="bi bi-arrow-right" /></Link>}
          </div>
          <RecentActivity items={data.recent_activity ?? []} />
        </section>

        {data.upcoming_events && (
          <section className="oh-card oh-panel" aria-labelledby="upcoming-title">
            <div className="oh-panel-head">
              <h2 id="upcoming-title"><i className="bi bi-calendar3" aria-hidden="true" /> Upcoming Events</h2>
              {eventsHref && <Link href={eventsHref} className="oh-viewall">View All <i className="bi bi-arrow-right" /></Link>}
            </div>
            <UpcomingTable rows={data.upcoming_events} previewBase={eventsHref} />
          </section>
        )}
      </div>
    </>
  );
}

function Kpi({ tone, icon, label, value, foot, href }: { tone: string; icon: string; label: string; value: number; foot: React.ReactNode; href: string | null }) {
  const body = (
    <>
      <i className={`bi ${icon} oh-kpi-icon`} aria-hidden="true" />
      <div>
        <div className="oh-kpi-label">{label}</div>
        <div className="oh-kpi-value">{fmt(value)}</div>
        <div className="oh-kpi-foot">{foot}</div>
      </div>
      <i className={`bi ${icon} oh-kpi-ghost`} aria-hidden="true" />
    </>
  );
  return href ? <Link href={href} className={`oh-kpi ${tone}`}>{body}</Link> : <div className={`oh-kpi ${tone}`}>{body}</div>;
}

/** "+12.4% vs. previous month"; null = no entries last month to compare with. */
function Change({ value }: { value: number | null }) {
  if (value === null) return <span>No data for previous month</span>;
  const cls = value > 0 ? "" : value < 0 ? " down" : " flat";
  return (
    <>
      <span className={`oh-pill${cls}`}>
        <i className={`bi ${value > 0 ? "bi-arrow-up" : value < 0 ? "bi-arrow-down" : "bi-dash"}`} />
        {value > 0 ? "+" : ""}
        {value}%
      </span>
      vs. previous month
    </>
  );
}

// ---- Charts (plain SVG) ---------------------------------------------------

function niceMax(v: number): number {
  if (v <= 5) return 5;
  const pow = 10 ** Math.floor(Math.log10(v));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s * 5 >= v) ?? 10 * pow;
  return step * 5;
}

/**
 * As in the design: per month one bar of Individual (navy) stacked on Artist
 * Group (teal), with Organisation (orange) beside it; the line is that month's
 * total of all three.
 */
function TrendChart({ rows }: { rows: TrendRow[] }) {
  if (!rows.length) return <p className="oh-empty">No registrations yet.</p>;
  const W = 640, H = 190, L = 46, R = 10, T = 22, B = 22;
  const totals = rows.map((r) => r.total);
  const max = niceMax(Math.max(...totals));
  const plotW = W - L - R, plotH = H - T - B;
  const band = plotW / rows.length;
  const y = (v: number) => T + plotH - (v / max) * plotH;
  const h = (v: number) => Math.max(0, (v / max) * plotH);
  const bw = Math.min(34, band * 0.36);
  const ow = bw * 0.82;
  const ticks = [0, 1, 2, 3, 4, 5].map((i) => (max / 5) * i);
  const cx = (i: number) => L + band * i + band / 2;
  const base = y(0);

  return (
    <div className="oh-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="New registrations per month by category, with the monthly total">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="#ebe6df" />
            <text x={L - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#14213d">{fmt(Math.round(t))}</text>
          </g>
        ))}
        {rows.map((r, i) => {
          const x0 = cx(i) - (bw + ow) / 2;
          return (
            <g key={r.month}>
              <rect x={x0} y={base - h(r.group)} width={bw} height={h(r.group)} fill={COLORS.group}>
                <title>{`${monthLabel(r.month)} · Artist Group: ${fmt(r.group)}`}</title>
              </rect>
              <rect x={x0} y={base - h(r.group) - h(r.individual)} width={bw} height={h(r.individual)} fill={COLORS.individual}>
                <title>{`${monthLabel(r.month)} · Individual Artist: ${fmt(r.individual)}`}</title>
              </rect>
              <rect x={x0 + bw} y={base - h(r.institution)} width={ow} height={h(r.institution)} fill={COLORS.institution}>
                <title>{`${monthLabel(r.month)} · Organisation: ${fmt(r.institution)}`}</title>
              </rect>
            </g>
          );
        })}
        <polyline
          points={totals.map((v, i) => `${cx(i)},${y(v)}`).join(" ")}
          fill="none"
          stroke={COLORS.total}
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        {totals.map((v, i) => (
          <g key={rows[i].month}>
            <circle cx={cx(i)} cy={y(v)} r="4.5" fill="#fff" stroke={COLORS.total} strokeWidth="2.5" />
            <text x={cx(i)} y={y(v) - 10} textAnchor="middle" fontSize="12" fontWeight="600" fill="#14213d">{fmt(v)}</text>
          </g>
        ))}
        {rows.map((r, i) => (
          <text key={r.month} x={cx(i)} y={H - 8} textAnchor="middle" fontSize="11.5" fontWeight="500" fill="#14213d">{monthLabel(r.month)}</text>
        ))}
      </svg>
    </div>
  );
}

function CategoryDonut({ byType }: { byType: { individual: number; group: number; institution: number } }) {
  const parts = [
    { key: "individual", label: "Individual Artist", value: byType.individual, color: COLORS.individual },
    { key: "group", label: "Artist Group", value: byType.group, color: COLORS.group },
    { key: "institution", label: "Organisation", value: byType.institution, color: COLORS.institution },
  ];
  const total = parts.reduce((s, p) => s + p.value, 0);
  const pct = (v: number) => (total ? Math.round((v / total) * 1000) / 10 : 0);
  const r = 80, sw = 44, C = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="oh-donut-wrap">
      <svg viewBox="0 0 220 220" role="img" aria-label={`Registrations by category, ${fmt(total)} in total`}>
        <circle cx="110" cy="110" r={r} fill="none" stroke="#f1ece5" strokeWidth={sw} />
        {total > 0 &&
          parts.map((p) => {
            const len = (p.value / total) * C;
            const start = offset;
            offset += len;
            const mid = ((start + len / 2) / C) * 2 * Math.PI - Math.PI / 2;
            return (
              <g key={p.key}>
                <circle
                  cx="110" cy="110" r={r} fill="none" stroke={p.color} strokeWidth={sw}
                  strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-start}
                  transform="rotate(-90 110 110)"
                />
                {pct(p.value) >= 6 && (
                  <text x={110 + Math.cos(mid) * r} y={110 + Math.sin(mid) * r + 4} textAnchor="middle" fontSize="11.5" fontWeight="700" fill="#fff">
                    {pct(p.value)}%
                  </text>
                )}
              </g>
            );
          })}
        <text x="110" y="110" textAnchor="middle" fontSize="24" fontWeight="700" fill="#14213d">{fmt(total)}</text>
        <text x="110" y="131" textAnchor="middle" fontSize="15" fill="#14213d">Total</text>
      </svg>
      <div className="oh-donut-legend">
        {parts.map((p) => (
          <div key={p.key}>
            <i className="oh-swatch" style={{ background: p.color, width: 16, height: 16 }} />
            <span>{p.label}</span>
            <b>{fmt(p.value)} ({pct(p.value)}%)</b>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- Lists ----------------------------------------------------------------

const ACT_ICON: Record<Activity["kind"], string> = {
  approved: "bi-check-lg",
  rejected: "bi-x-lg",
  registered: "bi-person-plus",
  event: "bi-calendar-event",
};

function when(iso: string): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }).toUpperCase();
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return time;
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday, ${time}`;
  return `${String(d.getDate()).padStart(2, "0")} ${MONTHS.at(d.getMonth())}, ${time}`;
}

function RecentActivity({ items }: { items: Activity[] }) {
  if (!items.length) return <p className="oh-empty">No recent activity.</p>;
  return (
    <ul className="oh-activity">
      {items.map((a, i) => (
        <li key={`${a.at}-${i}`}>
          <span className={`oh-act-icon act-${a.kind}`} aria-hidden="true"><i className={`bi ${ACT_ICON[a.kind]}`} /></span>
          <div>
            <div className="oh-act-title"><b>{a.title}</b> – {a.name}</div>
            {a.meta && <div className="oh-act-meta">{a.meta}</div>}
          </div>
          <time className="oh-act-time" dateTime={a.at}>{when(a.at)}</time>
        </li>
      ))}
    </ul>
  );
}

function UpcomingTable({ rows, previewBase }: { rows: UpcomingEvent[]; previewBase: string | null }) {
  if (!rows.length) return <p className="oh-empty">No upcoming events.</p>;
  const date = (s: string) => `${s.slice(8, 10)} ${MONTHS.at(Number(s.slice(5, 7)) - 1)} ${s.slice(0, 4)}`;
  return (
    <div className="table-responsive">
      <table className="oh-table">
        <thead>
          <tr><th>Event ID</th><th>Title</th><th>Organised By</th><th>Location</th><th>Event Date</th><th>Status</th></tr>
        </thead>
        <tbody>
          {rows.map((e) => {
            const code = `EVT-${String(e.id).padStart(5, "0")}`;
            return (
              <tr key={e.id}>
                <td>{previewBase ? <Link href={`${previewBase}/preview?id=${e.id}`}>{code}</Link> : code}</td>
                <td className="oh-wrap">{e.title}</td>
                <td className="oh-wrap">{e.organised_by ?? "—"}</td>
                <td>{e.location ?? "—"}</td>
                <td>{date(e.event_date)}</td>
                <td><span className={`oh-status${e.status === "Published" ? "" : " off"}`}>{e.status}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Artist accounts: their modules as cards (same as the Blade "Your modules"). */
function ModulesGrid({ modules }: { modules: DashboardData["modules"] }) {
  const { href } = useConsole();
  return (
    <section className="oh-card oh-panel" aria-labelledby="modules-title">
      <div className="oh-panel-head">
        <h2 id="modules-title"><i className="bi bi-grid" aria-hidden="true" /> Your modules</h2>
        <span className="oh-act-meta">{modules.length} available</span>
      </div>
      {modules.length ? (
        <div className="dashboard-module-grid">
          {modules.map((m) => (
            <Link key={m.id} className="dashboard-module-link" href={href(m.url)}>
              <span className="dashboard-module-icon"><i className={`bi ${m.icon}`} aria-hidden="true" /></span>
              <span className="dashboard-module-name">{m.name}</span>
              <i className="bi bi-arrow-up-right dashboard-module-arrow" aria-hidden="true" />
            </Link>
          ))}
        </div>
      ) : (
        <p className="oh-empty">No modules are currently available for your account.</p>
      )}
    </section>
  );
}

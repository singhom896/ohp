import type { Metadata } from "next";

export const metadata: Metadata = { title: "Ministry Dashboard" };

const kpis = [
  { icon: "♙", label: "Registered Artists", value: "25,684", meta: "▲ 8.4% this year" },
  { icon: "⌂", label: "NGOs / Organisations", value: "3,412", meta: "▲ 5.7% this year" },
  { icon: "◈", label: "Registered Groups", value: "2,186", meta: "▲ 6.2% this year" },
  { icon: "✓", label: "Performances Booked", value: "8,742", meta: "▲ 12.8% this year" },
];

// Bar heights / widths are data, so they stay as computed style values.
const trend = [
  { month: "Jan", pct: 38, label: "1.8K" },
  { month: "Feb", pct: 52, label: "2.4K" },
  { month: "Mar", pct: 47, label: "2.2K" },
  { month: "Apr", pct: 63, label: "3.0K" },
  { month: "May", pct: 70, label: "3.3K" },
  { month: "Jun", pct: 78, label: "3.7K" },
  { month: "Jul", pct: 91, label: "4.3K" },
  { month: "Aug", pct: 100, label: "4.7K" },
];

const applicationStatus = [
  { name: "Approved / Accredited", pct: 72 },
  { name: "Under ZCC / Akademi Review", pct: 15 },
  { name: "Pending Applicant Action", pct: 8 },
  { name: "Rejected / Not Fit", pct: 5 },
];

const artForms = [
  { value: "8,246", label: "Music" },
  { value: "6,132", label: "Dance" },
  { value: "3,824", label: "Theatre" },
  { value: "4,761", label: "Folk / Traditional" },
  { value: "1,502", label: "Visual Art" },
  { value: "1,219", label: "Other Art Forms" },
];

const activity = [
  { value: "8,742", label: "Total booked" },
  { value: "1,284", label: "This month" },
  { value: "78%", label: "Confirmed" },
  { value: "12%", label: "Rescheduled" },
];

type BookingStatus = "approved" | "pending" | "review";

const recentBookings: { id: string; org: string; artist: string; date: string; city: string; status: BookingStatus; statusLabel: string }[] = [
  { id: "OH-2026-01842", org: "Hotel Grand Palace", artist: "Rajasthan Folk Ensemble", date: "28 Aug 2026", city: "Jaipur", status: "approved", statusLabel: "Confirmed" },
  { id: "OH-2026-01841", org: "Ministry Cultural Programme", artist: "Aarav Sharma", date: "31 Aug 2026", city: "New Delhi", status: "pending", statusLabel: "Artist response" },
  { id: "OH-2026-01840", org: "Heritage Events Pvt. Ltd.", artist: "Nritya Kala Group", date: "03 Sep 2026", city: "Lucknow", status: "review", statusLabel: "Time proposed" },
  { id: "OH-2026-01839", org: "State Cultural Department", artist: "Desert Beats Collective", date: "06 Sep 2026", city: "Jodhpur", status: "approved", statusLabel: "Confirmed" },
];

function PanelHead({ title, linkLabel }: { title: string; linkLabel: string }) {
  return (
    <div className="panel-head-row">
      <h2>{title}</h2>
      <a href="#">{linkLabel}</a>
    </div>
  );
}

export default function MinistryDashboardPage() {
  return (
    <>
      <div className="admin-titlebar">
        <div>
          <div className="eyebrow">Ministry of Culture · National Overview</div>
          <h1>Ministry Dashboard</h1>
          <p>National snapshot of registered artists, organisations, groups and performance activity.</p>
        </div>
        <div className="admin-actions">
          <a className="moc-btn" href="#">Export MIS</a>
          <a className="moc-btn primary" href="#">Find Artist</a>
        </div>
      </div>

      <div className="kpi-grid">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="kpi">
            <div className="kpi-icon">{kpi.icon}</div>
            <div className="kpi-label">{kpi.label}</div>
            <div className="kpi-value">{kpi.value}</div>
            <div className="kpi-meta">{kpi.meta}</div>
          </div>
        ))}
      </div>

      <div className="panel-grid">
        <div className="admin-panel">
          <PanelHead title="Registration & Booking Trend" linkLabel="View report →" />
          <div className="chart-wrap">
            {trend.map((bar) => (
              <div key={bar.month} className="chart-bar" style={{ height: `${bar.pct}%` }}>
                <span>{bar.label}</span>
              </div>
            ))}
          </div>
          <div className="chart-labels">
            {trend.map((bar) => (
              <span key={bar.month}>{bar.month}</span>
            ))}
          </div>
        </div>
        <div className="admin-panel">
          <PanelHead title="Application Status" linkLabel="Details" />
          <div className="status-list">
            {applicationStatus.map((row) => (
              <div key={row.name} className="status-row">
                <div>
                  <span className="status-name">{row.name}</span>
                  <div className="status-bar">
                    <span style={{ width: `${row.pct}%` }} />
                  </div>
                </div>
                <b>{row.pct}%</b>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="panel-grid">
        <div className="admin-panel">
          <PanelHead title="Art Form Distribution" linkLabel="Drill down →" />
          <div className="mini-stats">
            {artForms.map((s) => (
              <div key={s.label} className="mini-stat">
                <b>{s.value}</b>
                <small>{s.label}</small>
              </div>
            ))}
          </div>
        </div>
        <div className="admin-panel">
          <PanelHead title="Performance Activity" linkLabel="Full MIS →" />
          <div className="mini-stats">
            {activity.map((s) => (
              <div key={s.label} className="mini-stat">
                <b>{s.value}</b>
                <small>{s.label}</small>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="admin-panel">
        <PanelHead title="Recent Performance Bookings" linkLabel="View all →" />
        <table className="recent-table">
          <thead>
            <tr>
              <th>Booking</th>
              <th>Organisation</th>
              <th>Artist / Group</th>
              <th>Date</th>
              <th>City</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {recentBookings.map((b) => (
              <tr key={b.id}>
                <td>
                  <b>{b.id}</b>
                </td>
                <td>{b.org}</td>
                <td>{b.artist}</td>
                <td>{b.date}</td>
                <td>{b.city}</td>
                <td>
                  <span className={`status-pill ${b.status}`}>{b.statusLabel}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

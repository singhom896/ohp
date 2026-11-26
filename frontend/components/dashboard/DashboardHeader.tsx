import UserMenu from "@/components/auth/UserMenu";

export default function DashboardHeader() {
  return (
    <header className="gov-strip">
      <div className="gov-inner">
        <div className="gov-brand">
          <span className="gov-emblem">×</span>
          <span>
            <strong>Government of India | Ministry of Culture</strong>
            <br />
            <span className="gov-hi">भारत सरकार | संस्कृति मंत्रालय</span>
          </span>
        </div>
        <div className="gov-tools">
          <a href="#main-content">Skip to main content</a>
          <button type="button">A−</button>
          <button type="button">A</button>
          <button type="button">A+</button>
          <a href="#">Screen Reader</a>
          <a href="#">English | हिंदी</a>
          <UserMenu />
        </div>
      </div>
    </header>
  );
}

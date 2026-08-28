import { formatCount, TOTAL_PIXELS } from '../lib/pricing';

export default function Header({ claimedCount, onInfoClick }) {
  const pct = Math.min(100, (claimedCount / TOTAL_PIXELS) * 100);
  return (
    <div id="header">
      <div className="brand">
        <div className="logo-mark">
          <span></span>
          <span></span>
          <span></span>
          <span></span>
        </div>
        <div className="brand-name">PIXELFAME</div>
      </div>
      <div className="header-right">
        <div className="ticker">
          <span className="dot"></span>
          <span className="mono">
            <b>{formatCount(claimedCount)}</b> / {formatCount(TOTAL_PIXELS)} claimed
          </span>
          <div className="ticker-bar">
            <div className="ticker-bar-fill" style={{ width: pct + '%' }} />
          </div>
        </div>
        <button className="info-btn" onClick={onInfoClick}>
          ⓘ HOW THIS WORKS
        </button>
      </div>
    </div>
  );
}

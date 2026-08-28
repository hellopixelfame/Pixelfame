import { useEffect, useState } from 'react';

const DURATION = 1800;
const CELL_COUNT = 40;
const COLORS = ['#ff2e88', '#c6ff3d', '#4de1ff'];
// Deterministic scramble (17 and 40 are coprime, so this visits every index
// exactly once) — a purely decorative fill order, so it doesn't need real
// randomness, and avoids calling Math.random() during render.
const SHUFFLE_ORDER = Array.from({ length: CELL_COUNT }, (_, i) => (i * 17) % CELL_COUNT);

export default function LoadingScreen({ hidden, onDone }) {
  const [pct, setPct] = useState(0);
  const order = SHUFFLE_ORDER;

  useEffect(() => {
    const start = Date.now();
    const timer = setInterval(() => {
      const elapsed = Date.now() - start;
      const p = Math.min(100, Math.round((elapsed / DURATION) * 100));
      setPct(p);
      if (elapsed >= DURATION) {
        clearInterval(timer);
        onDone();
      }
    }, 60);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filled = Math.floor((pct / 100) * order.length);

  return (
    <div id="screen-loading" className={hidden ? 'hide' : ''}>
      <div className="load-wordmark">PIXELFAME</div>
      <div className="loader-grid">
        {order.map((slot, i) => (
          <div
            key={slot}
            className="loader-cell"
            style={{ background: i < filled ? COLORS[i % COLORS.length] : undefined }}
          />
        ))}
      </div>
      <div className="load-sub mono">assembling 20,00,000 squares of pure fame...</div>
      <div className="loader-pct mono">{pct}%</div>
    </div>
  );
}

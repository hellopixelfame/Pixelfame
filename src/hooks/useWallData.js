import { useEffect, useRef, useState } from 'react';
import { GRID_W, GRID_H } from '../lib/pricing';
import { fetchClaimsInBox, fetchClaimedCount, subscribeToWallUpdates, subscribeToStats } from '../lib/wall';

const BOX_DEBOUNCE_MS = 150;

/**
 * Owns claim data for the wall: viewport-scoped fetches for the interactive
 * layer, an all-claims sample for the overview canvas' dots, the live
 * claimed-count ticker, and realtime insertion of newly-paid squares.
 */
export function useWallData(grid) {
  const [claims, setClaims] = useState([]);
  const [claimedCount, setClaimedCount] = useState(0);
  const boxTimerRef = useRef(null);
  const overviewClaimsRef = useRef([]);

  // overview dots + live count, once + realtime
  useEffect(() => {
    let cancelled = false;
    fetchClaimsInBox(0, 0, GRID_W - 1, GRID_H - 1)
      .then((rows) => {
        if (cancelled) return;
        overviewClaimsRef.current = rows;
        grid.setOverviewClaims(rows);
      })
      .catch((err) => console.error('failed to load wall overview', err));
    fetchClaimedCount()
      .then((n) => {
        if (!cancelled) setClaimedCount(n);
      })
      .catch((err) => console.error('failed to load claimed count', err));
    const unsubStats = subscribeToStats(setClaimedCount);
    const unsubClaims = subscribeToWallUpdates((claim) => {
      overviewClaimsRef.current = [...overviewClaimsRef.current, claim];
      grid.setOverviewClaims(overviewClaimsRef.current);
      setClaims((prev) => (prev.some((c) => c.id === claim.id) ? prev : [...prev, claim]));
    });
    return () => {
      cancelled = true;
      unsubStats();
      unsubClaims();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // viewport-scoped fetch, debounced
  useEffect(() => {
    if (grid.mode !== 'interactive') return undefined;
    clearTimeout(boxTimerRef.current);
    boxTimerRef.current = setTimeout(() => {
      const { vx1, vy1, vx2, vy2 } = grid.getVisibleBox();
      // Fetch (and thus start loading images for) a margin beyond what's
      // actually visible, so panning reveals cells whose images are already
      // warm in the browser cache instead of popping in late.
      const padX = Math.ceil((vx2 - vx1) * 0.5);
      const padY = Math.ceil((vy2 - vy1) * 0.5);
      const bx1 = Math.max(0, vx1 - padX);
      const by1 = Math.max(0, vy1 - padY);
      const bx2 = Math.min(GRID_W - 1, vx2 + padX);
      const by2 = Math.min(GRID_H - 1, vy2 + padY);
      fetchClaimsInBox(bx1, by1, bx2, by2)
        .then(setClaims)
        .catch((err) => console.error('failed to load claims in view', err));
    }, BOX_DEBOUNCE_MS);
    return () => clearTimeout(boxTimerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grid.mode, grid.pan, grid.cellSize]);

  return { claims, claimedCount };
}

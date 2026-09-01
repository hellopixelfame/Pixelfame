import { GRID_W, GRID_H } from './pricing';

export const MAX_BLOCK = 10;

function blockFits(x0, y0, size, claims) {
  if (x0 < 0 || y0 < 0 || x0 + size > GRID_W || y0 + size > GRID_H) return false;
  const x1 = x0 + size;
  const y1 = y0 + size;
  for (const c of claims) {
    const cx1 = c.x + c.size;
    const cy1 = c.y + c.size;
    if (x0 < cx1 && x1 > c.x && y0 < cy1 && y1 > c.y) return false;
  }
  return true;
}

/**
 * Largest valid square, anchored per drag direction, that fits inside the
 * grid and doesn't overlap any claimed block, capped at MAX_BLOCK. The
 * anchor cell itself is assumed free (a drag can only start on a free
 * cell), so size 1 always fits and the shrink loop always terminates.
 */
export function computeSquareFromDrag(anchorX, anchorY, targetX, targetY, claims) {
  const dx = targetX - anchorX;
  const dy = targetY - anchorY;
  const dirX = dx >= 0 ? 1 : -1;
  const dirY = dy >= 0 ? 1 : -1;
  let size = Math.min(Math.max(Math.abs(dx), Math.abs(dy)) + 1, MAX_BLOCK);
  let x0, y0;
  while (size > 1) {
    x0 = dirX >= 0 ? anchorX : anchorX - (size - 1);
    y0 = dirY >= 0 ? anchorY : anchorY - (size - 1);
    if (blockFits(x0, y0, size, claims)) break;
    size--;
  }
  x0 = dirX >= 0 ? anchorX : anchorX - (size - 1);
  y0 = dirY >= 0 ? anchorY : anchorY - (size - 1);
  x0 = Math.max(0, Math.min(GRID_W - size, x0));
  y0 = Math.max(0, Math.min(GRID_H - size, y0));
  return { x: x0, y: y0, size };
}

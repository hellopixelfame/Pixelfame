export const GRID_W = 2000;
export const GRID_H = 1000;
export const TOTAL_PIXELS = GRID_W * GRID_H;

export const SIZE_OPTIONS = [1, 2, 3, 4];
export const MAX_CUSTOM_SIZE = 10;

export function priceFor(size) {
  return size * size;
}

export function formatInr(rupees) {
  return '₹' + rupees.toLocaleString('en-IN');
}

export function formatCount(n) {
  return n.toLocaleString('en-IN');
}

export function clampAnchor(x, y, size) {
  const cx = Math.max(0, Math.min(GRID_W - size, x));
  const cy = Math.max(0, Math.min(GRID_H - size, y));
  return { x: cx, y: cy };
}

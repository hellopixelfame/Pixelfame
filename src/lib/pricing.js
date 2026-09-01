export const GRID_W = 2000;
export const GRID_H = 1000;
export const TOTAL_PIXELS = GRID_W * GRID_H;

export function priceFor(size) {
  return size * size;
}

export function formatInr(rupees) {
  return '₹' + rupees.toLocaleString('en-IN');
}

export function formatCount(n) {
  return n.toLocaleString('en-IN');
}

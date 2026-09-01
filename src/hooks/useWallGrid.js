import { useCallback, useEffect, useRef, useState } from 'react';
import { GRID_W, GRID_H } from '../lib/pricing';

export const INTERACTIVE_MIN = 8;
export const MAX_CELL = 90;
export const START_CELL = 30;
export const ZOOM_STEP = 8;
const OVERVIEW_GRID_STEP = 16;

function clampPanValue(px, py, cellSize, vw, vh) {
  const gw = GRID_W * cellSize;
  const gh = GRID_H * cellSize;
  const minX = Math.min(0, vw - gw);
  const minY = Math.min(0, vh - gh);
  return { x: Math.max(minX, Math.min(0, px)), y: Math.max(minY, Math.min(0, py)) };
}

/**
 * Headless pan/zoom/select engine for the pixel wall. A single pointer
 * (mouse or one finger) drawn from a free cell grows a drag-to-select
 * square instead of panning — panning is wheel/trackpad on desktop and a
 * two-finger drag (which also pinch-zooms) on touch, so single-finger drag
 * is free for selection on mobile too. Pressing on an already-claimed cell
 * is tap-only (opens it), never a pan or a selection.
 */
export function useWallGrid({ isCellFree, onSelectUpdate, onClaimedTap, onOverviewTapDenied, isInputBlocked }) {
  const viewportRef = useRef(null);
  const overviewCanvasRef = useRef(null);
  const contentRef = useRef(null);
  const overviewClaimsRef = useRef([]);
  const dragRef = useRef(null);

  const [mode, setMode] = useState('overview');
  const [cellSize, setCellSize] = useState(START_CELL);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [overviewFit, setOverviewFit] = useState(null);

  const isBlocked = useCallback(() => (isInputBlocked ? isInputBlocked() : false), [isInputBlocked]);

  const drawOverview = useCallback(() => {
    const canvas = overviewCanvasRef.current;
    const viewport = viewportRef.current;
    if (!canvas || !viewport) return;
    const dpr = window.devicePixelRatio || 1;
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    if (vw === 0 || vh === 0) return;
    const scaleX = vw / GRID_W;
    const scaleY = vh / GRID_H;
    canvas.style.width = vw + 'px';
    canvas.style.height = vh + 'px';
    canvas.width = Math.round(vw * dpr);
    canvas.height = Math.round(vh * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, vw, vh);
    ctx.fillStyle = '#101018';
    ctx.fillRect(0, 0, vw, vh);
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let gx = 0; gx <= vw; gx += OVERVIEW_GRID_STEP) {
      ctx.beginPath();
      ctx.moveTo(Math.round(gx) + 0.5, 0);
      ctx.lineTo(Math.round(gx) + 0.5, vh);
      ctx.stroke();
    }
    for (let gy = 0; gy <= vh; gy += OVERVIEW_GRID_STEP) {
      ctx.beginPath();
      ctx.moveTo(0, Math.round(gy) + 0.5);
      ctx.lineTo(vw, Math.round(gy) + 0.5);
      ctx.stroke();
    }
    ctx.fillStyle = '#c6ff3d';
    overviewClaimsRef.current.forEach(({ x, y }) => {
      const px = x * scaleX;
      const py = y * scaleY;
      ctx.fillRect(px - 1, py - 1, 3, 3);
    });
    setOverviewFit({ scaleX, scaleY, vw, vh });
  }, []);

  const setOverviewClaims = useCallback(
    (list) => {
      overviewClaimsRef.current = list;
      if (mode === 'overview') drawOverview();
    },
    [mode, drawOverview]
  );

  const enterOverview = useCallback(() => {
    setMode('overview');
    requestAnimationFrame(drawOverview);
  }, [drawOverview]);

  const enterInteractive = useCallback((centerX, centerY, size = START_CELL) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    const rawX = vw / 2 - centerX * size;
    const rawY = vh / 2 - centerY * size;
    setCellSize(size);
    setPan(clampPanValue(rawX, rawY, size, vw, vh));
    setMode('interactive');
  }, []);

  const getVisibleBox = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return { vx1: 0, vy1: 0, vx2: 0, vy2: 0 };
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    const vx1 = Math.max(0, Math.floor(-pan.x / cellSize));
    const vy1 = Math.max(0, Math.floor(-pan.y / cellSize));
    const vx2 = Math.min(GRID_W - 1, Math.ceil((-pan.x + vw) / cellSize));
    const vy2 = Math.min(GRID_H - 1, Math.ceil((-pan.y + vh) / cellSize));
    return { vx1, vy1, vx2, vy2 };
  }, [pan, cellSize]);

  const gridCoordsFromClient = useCallback(
    (clientX, clientY) => {
      const viewport = viewportRef.current;
      if (!viewport) return null;
      const rect = viewport.getBoundingClientRect();
      const gx = Math.floor((clientX - rect.left - pan.x) / cellSize);
      const gy = Math.floor((clientY - rect.top - pan.y) / cellSize);
      if (gx < 0 || gx >= GRID_W || gy < 0 || gy >= GRID_H) return null;
      return { gx, gy };
    },
    [pan, cellSize]
  );

  // Same as gridCoordsFromClient, but clamped to the grid instead of
  // returning null — used while a drag is in flight so dragging past the
  // canvas edge still yields a valid (clamped) selection target.
  const gridCoordsClamped = useCallback(
    (clientX, clientY) => {
      const viewport = viewportRef.current;
      if (!viewport) return { gx: 0, gy: 0 };
      const rect = viewport.getBoundingClientRect();
      const gx = Math.floor((clientX - rect.left - pan.x) / cellSize);
      const gy = Math.floor((clientY - rect.top - pan.y) / cellSize);
      return { gx: Math.max(0, Math.min(GRID_W - 1, gx)), gy: Math.max(0, Math.min(GRID_H - 1, gy)) };
    },
    [pan, cellSize]
  );

  const zoomBy = useCallback(
    (delta, clientX, clientY) => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      if (mode === 'overview') {
        if (delta <= 0) {
          onOverviewTapDenied?.();
          return;
        }
        const fit = overviewFit;
        const rect = viewport.getBoundingClientRect();
        const lx = clientX != null ? clientX - rect.left : viewport.clientWidth / 2;
        const ly = clientY != null ? clientY - rect.top : viewport.clientHeight / 2;
        const gx = fit ? Math.max(0, Math.min(GRID_W - 1, Math.floor(lx / fit.scaleX))) : GRID_W / 2;
        const gy = fit ? Math.max(0, Math.min(GRID_H - 1, Math.floor(ly / fit.scaleY))) : GRID_H / 2;
        enterInteractive(gx, gy, START_CELL);
        return;
      }
      const rect = viewport.getBoundingClientRect();
      const cx = clientX != null ? clientX - rect.left : viewport.clientWidth / 2;
      const cy = clientY != null ? clientY - rect.top : viewport.clientHeight / 2;
      const wgx = (-pan.x + cx) / cellSize;
      const wgy = (-pan.y + cy) / cellSize;
      const newSize = Math.min(MAX_CELL, cellSize + delta);
      if (newSize < INTERACTIVE_MIN) {
        enterOverview();
        return;
      }
      if (newSize === cellSize) return;
      const rawX = cx - wgx * newSize;
      const rawY = cy - wgy * newSize;
      setCellSize(newSize);
      setPan(clampPanValue(rawX, rawY, newSize, viewport.clientWidth, viewport.clientHeight));
    },
    [mode, overviewFit, pan, cellSize, enterInteractive, enterOverview, onOverviewTapDenied]
  );

  const handleOverviewClick = useCallback(
    (e) => {
      if (isBlocked()) return;
      const canvas = overviewCanvasRef.current;
      const fit = overviewFit;
      if (!canvas || !fit) return;
      const rect = canvas.getBoundingClientRect();
      const lx = e.clientX - rect.left;
      const ly = e.clientY - rect.top;
      const gx = Math.max(0, Math.min(GRID_W - 1, Math.floor(lx / fit.scaleX)));
      const gy = Math.max(0, Math.min(GRID_H - 1, Math.floor(ly / fit.scaleY)));
      enterInteractive(gx, gy, START_CELL);
    },
    [overviewFit, enterInteractive, isBlocked]
  );

  // ---- pointer-driven select-drag (mouse / touch / pen, single pointer) ----
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || mode !== 'interactive') return undefined;

    function onPointerDown(e) {
      if (isBlocked() || !e.isPrimary) return;
      // The confirm bar and zoom controls are DOM children of #viewport (so
      // they can sit positioned over the canvas) — without this check,
      // clicking them would bubble up here too and register as a canvas
      // gesture underneath the button.
      if (e.target.closest('button, input, select, textarea, a')) return;
      const coords = gridCoordsFromClient(e.clientX, e.clientY);
      if (!coords) return;
      const free = isCellFree ? isCellFree(coords.gx, coords.gy) : true;
      dragRef.current = {
        pointerId: e.pointerId,
        anchorGx: coords.gx,
        anchorGy: coords.gy,
        moved: false,
        selecting: free,
      };
      viewport.setPointerCapture(e.pointerId);
      if (free) onSelectUpdate?.(coords.gx, coords.gy, coords.gx, coords.gy);
    }
    function onPointerMove(e) {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      const coords = gridCoordsClamped(e.clientX, e.clientY);
      if (coords.gx !== drag.anchorGx || coords.gy !== drag.anchorGy) drag.moved = true;
      if (drag.selecting) onSelectUpdate?.(drag.anchorGx, drag.anchorGy, coords.gx, coords.gy);
    }
    function onPointerUp(e) {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      dragRef.current = null;
      const coords = gridCoordsClamped(e.clientX, e.clientY);
      if (drag.selecting) {
        onSelectUpdate?.(drag.anchorGx, drag.anchorGy, coords.gx, coords.gy);
      } else if (!drag.moved && !isBlocked()) {
        onClaimedTap?.(drag.anchorGx, drag.anchorGy);
      }
    }
    function onPointerCancel() {
      dragRef.current = null;
    }

    viewport.addEventListener('pointerdown', onPointerDown);
    viewport.addEventListener('pointermove', onPointerMove);
    viewport.addEventListener('pointerup', onPointerUp);
    viewport.addEventListener('pointercancel', onPointerCancel);
    return () => {
      viewport.removeEventListener('pointerdown', onPointerDown);
      viewport.removeEventListener('pointermove', onPointerMove);
      viewport.removeEventListener('pointerup', onPointerUp);
      viewport.removeEventListener('pointercancel', onPointerCancel);
    };
  }, [mode, gridCoordsFromClient, gridCoordsClamped, isCellFree, onSelectUpdate, onClaimedTap, isBlocked]);

  // ---- two-finger pinch zoom ----
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || mode !== 'interactive') return undefined;
    let pinch = null;

    function dist(t0, t1) {
      const dx = t1.clientX - t0.clientX;
      const dy = t1.clientY - t0.clientY;
      return Math.sqrt(dx * dx + dy * dy);
    }

    function onTouchStart(e) {
      if (e.touches.length !== 2 || isBlocked()) return;
      dragRef.current = null;
      const rect = viewport.getBoundingClientRect();
      const mid = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top,
      };
      pinch = {
        startDist: dist(e.touches[0], e.touches[1]),
        startCell: cellSize,
        mid,
        gxAtMid: (-pan.x + mid.x) / cellSize,
        gyAtMid: (-pan.y + mid.y) / cellSize,
      };
    }
    function onTouchMove(e) {
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      const ratio = dist(e.touches[0], e.touches[1]) / pinch.startDist;
      let newSize = Math.min(MAX_CELL, Math.max(INTERACTIVE_MIN, Math.round(pinch.startCell * ratio)));
      const vw = viewport.clientWidth;
      const vh = viewport.clientHeight;
      // Re-anchor around the CURRENT midpoint (not the one at touchstart) so
      // moving both fingers together pans the view, while the grid point
      // under the midpoint at touchstart stays pinned as fingers spread —
      // the combined two-finger pan+pinch gesture that stands in for the
      // single-finger drag now spent on selection.
      const rect = viewport.getBoundingClientRect();
      const curMid = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top,
      };
      const rawX = curMid.x - pinch.gxAtMid * newSize;
      const rawY = curMid.y - pinch.gyAtMid * newSize;
      setCellSize(newSize);
      setPan(clampPanValue(rawX, rawY, newSize, vw, vh));
    }
    function onTouchEnd(e) {
      if (e.touches.length < 2) pinch = null;
    }

    viewport.addEventListener('touchstart', onTouchStart, { passive: true });
    viewport.addEventListener('touchmove', onTouchMove, { passive: false });
    viewport.addEventListener('touchend', onTouchEnd, { passive: true });
    viewport.addEventListener('touchcancel', onTouchEnd, { passive: true });
    return () => {
      viewport.removeEventListener('touchstart', onTouchStart);
      viewport.removeEventListener('touchmove', onTouchMove);
      viewport.removeEventListener('touchend', onTouchEnd);
      viewport.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [mode, pan, cellSize, isBlocked]);

  // ---- wheel: plain scroll pans, ctrl/cmd+scroll zooms ----
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;
    function onWheel(e) {
      if (isBlocked()) return;
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        zoomBy(e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP, e.clientX, e.clientY);
        return;
      }
      if (mode !== 'interactive') return;
      const vw = viewport.clientWidth;
      const vh = viewport.clientHeight;
      setPan((p) => clampPanValue(p.x - e.deltaX, p.y - e.deltaY, cellSize, vw, vh));
    }
    viewport.addEventListener('wheel', onWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', onWheel);
  }, [mode, cellSize, zoomBy, isBlocked]);

  // ---- keyboard +/- ----
  useEffect(() => {
    function onKeyDown(e) {
      if (isBlocked()) return;
      if (e.key === '+' || e.key === '=') zoomBy(ZOOM_STEP);
      if (e.key === '-' || e.key === '_') zoomBy(-ZOOM_STEP);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [zoomBy, isBlocked]);

  // ---- resize ----
  useEffect(() => {
    function onResize() {
      const viewport = viewportRef.current;
      if (!viewport) return;
      if (mode === 'overview') {
        drawOverview();
      } else {
        setPan((p) => clampPanValue(p.x, p.y, cellSize, viewport.clientWidth, viewport.clientHeight));
      }
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [mode, cellSize, drawOverview]);

  useEffect(() => {
    if (mode === 'overview') requestAnimationFrame(drawOverview);
  }, [mode, drawOverview]);

  return {
    viewportRef,
    overviewCanvasRef,
    contentRef,
    mode,
    cellSize,
    pan,
    overviewFit,
    enterOverview,
    enterInteractive,
    zoomBy,
    getVisibleBox,
    gridCoordsFromClient,
    handleOverviewClick,
    setOverviewClaims,
  };
}

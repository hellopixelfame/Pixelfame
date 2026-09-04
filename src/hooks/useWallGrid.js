import { useCallback, useEffect, useRef, useState } from "react";
import { GRID_W, GRID_H } from "../lib/pricing";

export const INTERACTIVE_MIN = 8;
export const MAX_CELL = 90;
export const START_CELL = 30;
export const ZOOM_STEP = 8;
const OVERVIEW_GRID_STEP = 16;
const MINIMAP_MAX = 180;
const LONG_PRESS_MS = 320;
const PAN_CANCEL_PX = 10;

function clampPanValue(px, py, cellSize, vw, vh) {
  const gw = GRID_W * cellSize;
  const gh = GRID_H * cellSize;
  const minX = Math.min(0, vw - gw);
  const minY = Math.min(0, vh - gh);
  return {
    x: Math.max(minX, Math.min(0, px)),
    y: Math.max(minY, Math.min(0, py))
  };
}

/**
 * Headless pan/zoom/select engine for the pixel wall.
 *
 * Mouse/pen: a drag from a free cell immediately grows a drag-to-select
 * square (precise pointer, no ambiguity) — panning is the wheel/trackpad,
 * unaffected by this.
 *
 * Touch: a single-finger drag defaults to panning, matching every map/
 * canvas app — there's no wheel to fall back on, so drag can't be claimed
 * for selection by default. Holding still on a free cell for a beat first
 * (long-press) switches that same finger into growing a selection instead;
 * a plain quick tap still gives 1×1 immediately, no hold required. Two
 * fingers still pan-and-pinch-zoom together.
 */
export function useWallGrid({
  isCellFree,
  onSelectUpdate,
  onClaimedTap,
  onOverviewTapDenied,
  isInputBlocked
}) {
  const viewportRef = useRef(null);
  const overviewCanvasRef = useRef(null);
  const minimapCanvasRef = useRef(null);
  const contentRef = useRef(null);
  const overviewClaimsRef = useRef([]);
  const dragRef = useRef(null);
  const pinchRef = useRef(null);

  const [mode, setMode] = useState("overview");
  const [cellSize, setCellSize] = useState(START_CELL);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [overviewFit, setOverviewFit] = useState(null);

  const isBlocked = useCallback(
    () => (isInputBlocked ? isInputBlocked() : false),
    [isInputBlocked]
  );

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
    canvas.style.width = vw + "px";
    canvas.style.height = vh + "px";
    canvas.width = Math.round(vw * dpr);
    canvas.height = Math.round(vh * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, vw, vh);
    ctx.fillStyle = "#101018";
    ctx.fillRect(0, 0, vw, vh);
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
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
    ctx.fillStyle = "#c6ff3d";
    overviewClaimsRef.current.forEach(({ x, y }) => {
      const px = x * scaleX;
      const py = y * scaleY;
      ctx.fillRect(px - 1, py - 1, 3, 3);
    });
    setOverviewFit({ scaleX, scaleY, vw, vh });
  }, []);

  // Small always-on thumbnail of the whole wall shown while panning around
  // in interactive mode, with a red box marking the current viewport — like
  // the seat-map minimap on ticketing sites.
  const drawMinimap = useCallback(() => {
    const canvas = minimapCanvasRef.current;
    const viewport = viewportRef.current;
    if (!canvas || !viewport) return;
    const dpr = window.devicePixelRatio || 1;
    const gridAspect = GRID_W / GRID_H;
    let mw = MINIMAP_MAX;
    let mh = MINIMAP_MAX / gridAspect;
    if (mh > MINIMAP_MAX) {
      mh = MINIMAP_MAX;
      mw = MINIMAP_MAX * gridAspect;
    }
    canvas.style.width = mw + "px";
    canvas.style.height = mh + "px";
    canvas.width = Math.round(mw * dpr);
    canvas.height = Math.round(mh * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, mw, mh);
    ctx.fillStyle = "#101018";
    ctx.fillRect(0, 0, mw, mh);
    const scaleX = mw / GRID_W;
    const scaleY = mh / GRID_H;
    ctx.fillStyle = "#c6ff3d";
    overviewClaimsRef.current.forEach(({ x, y }) => {
      ctx.fillRect(x * scaleX - 0.5, y * scaleY - 0.5, 2, 2);
    });
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    const vx1 = Math.max(0, -pan.x / cellSize);
    const vy1 = Math.max(0, -pan.y / cellSize);
    const vx2 = Math.min(GRID_W, (-pan.x + vw) / cellSize);
    const vy2 = Math.min(GRID_H, (-pan.y + vh) / cellSize);
    ctx.strokeStyle = "#ff3b3b";
    ctx.lineWidth = 3;
    ctx.strokeRect(
      Math.round(vx1 * scaleX) + 0.5,
      Math.round(vy1 * scaleY) + 0.5,
      Math.max(4, (vx2 - vx1) * scaleX),
      Math.max(4, (vy2 - vy1) * scaleY)
    );
  }, [pan, cellSize]);

  const handleMinimapClick = useCallback(
    (e) => {
      if (isBlocked()) return;
      const canvas = minimapCanvasRef.current;
      const viewport = viewportRef.current;
      if (!canvas || !viewport) return;
      const rect = canvas.getBoundingClientRect();
      const gx = ((e.clientX - rect.left) / rect.width) * GRID_W;
      const gy = ((e.clientY - rect.top) / rect.height) * GRID_H;
      const vw = viewport.clientWidth;
      const vh = viewport.clientHeight;
      const rawX = vw / 2 - gx * cellSize;
      const rawY = vh / 2 - gy * cellSize;
      setPan(clampPanValue(rawX, rawY, cellSize, vw, vh));
    },
    [cellSize, isBlocked]
  );

  const setOverviewClaims = useCallback(
    (list) => {
      overviewClaimsRef.current = list;
      if (mode === "overview") drawOverview();
      if (mode === "interactive") drawMinimap();
    },
    [mode, drawOverview, drawMinimap]
  );

  const enterOverview = useCallback(() => {
    setMode("overview");
    requestAnimationFrame(drawOverview);
  }, [drawOverview]);

  const enterInteractive = useCallback(
    (centerX, centerY, size = START_CELL) => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      const vw = viewport.clientWidth;
      const vh = viewport.clientHeight;
      const rawX = vw / 2 - centerX * size;
      const rawY = vh / 2 - centerY * size;
      setCellSize(size);
      setPan(clampPanValue(rawX, rawY, size, vw, vh));
      setMode("interactive");
    },
    []
  );

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
      return {
        gx: Math.max(0, Math.min(GRID_W - 1, gx)),
        gy: Math.max(0, Math.min(GRID_H - 1, gy))
      };
    },
    [pan, cellSize]
  );

  const zoomBy = useCallback(
    (delta, clientX, clientY) => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      if (mode === "overview") {
        if (delta <= 0) {
          onOverviewTapDenied?.();
          return;
        }
        const fit = overviewFit;
        const rect = viewport.getBoundingClientRect();
        const lx =
          clientX != null ? clientX - rect.left : viewport.clientWidth / 2;
        const ly =
          clientY != null ? clientY - rect.top : viewport.clientHeight / 2;
        const gx = fit
          ? Math.max(0, Math.min(GRID_W - 1, Math.floor(lx / fit.scaleX)))
          : GRID_W / 2;
        const gy = fit
          ? Math.max(0, Math.min(GRID_H - 1, Math.floor(ly / fit.scaleY)))
          : GRID_H / 2;
        enterInteractive(gx, gy, START_CELL);
        return;
      }
      const rect = viewport.getBoundingClientRect();
      const cx =
        clientX != null ? clientX - rect.left : viewport.clientWidth / 2;
      const cy =
        clientY != null ? clientY - rect.top : viewport.clientHeight / 2;
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
      setPan(
        clampPanValue(
          rawX,
          rawY,
          newSize,
          viewport.clientWidth,
          viewport.clientHeight
        )
      );
    },
    [
      mode,
      overviewFit,
      pan,
      cellSize,
      enterInteractive,
      enterOverview,
      onOverviewTapDenied
    ]
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

  // ---- pointer-driven pan / select-drag (mouse / touch / pen, single pointer) ----
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || mode !== "interactive") return undefined;

    function beginSelecting(drag, gx, gy) {
      drag.phase = "selecting";
      onSelectUpdate?.(drag.anchorGx, drag.anchorGy, gx, gy);
    }

    function onPointerDown(e) {
      if (isBlocked() || !e.isPrimary) return;
      // The confirm bar and zoom controls are DOM children of #viewport (so
      // they can sit positioned over the canvas) — without this check,
      // clicking them would bubble up here too and register as a canvas
      // gesture underneath the button.
      if (e.target.closest("button, input, select, textarea, a, #minimap-canvas"))
        return;
      // Ctrl/Cmd turns a mouse/pen drag into a pan, same gesture as the
      // grab-hand tool in map/design apps — lets desktop users pan without
      // reaching for the scrollwheel, even over a claimed cell.
      const ctrlPan = (e.ctrlKey || e.metaKey) && e.pointerType !== "touch";
      const coords = gridCoordsFromClient(e.clientX, e.clientY);
      if (!ctrlPan && !coords) return;
      const free = coords && isCellFree ? isCellFree(coords.gx, coords.gy) : true;

      const drag = {
        pointerId: e.pointerId,
        anchorGx: coords ? coords.gx : 0,
        anchorGy: coords ? coords.gy : 0,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startPanX: pan.x,
        startPanY: pan.y,
        moved: false,
        cellFree: free,
        phase: "pending",
        longPressTimer: null
      };
      dragRef.current = drag;
      viewport.setPointerCapture(e.pointerId);

      if (ctrlPan) {
        drag.phase = "panning";
        viewport.classList.add("pan-active");
      } else if (e.pointerType === "touch") {
        // Ambiguous between "pan" and "grow a selection" — default to pan
        // (see the hook doc comment above), only switching to selecting if
        // this finger holds still on a free cell past the long-press delay.
        if (free) {
          drag.longPressTimer = setTimeout(() => {
            if (dragRef.current === drag && drag.phase === "pending") {
              beginSelecting(drag, drag.anchorGx, drag.anchorGy);
            }
          }, LONG_PRESS_MS);
        }
      } else if (free) {
        beginSelecting(drag, coords.gx, coords.gy);
      } else {
        drag.phase = "tapOnly"; // mouse/pen on a claimed cell — wheel covers panning, no need to allow it here
      }
    }

    function onPointerMove(e) {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      const dx = e.clientX - drag.startClientX;
      const dy = e.clientY - drag.startClientY;
      if (!drag.moved && (Math.abs(dx) > 3 || Math.abs(dy) > 3))
        drag.moved = true;

      if (drag.phase === "pending") {
        if (Math.abs(dx) <= PAN_CANCEL_PX && Math.abs(dy) <= PAN_CANCEL_PX)
          return;
        clearTimeout(drag.longPressTimer);
        drag.phase = "panning";
      }

      if (drag.phase === "panning") {
        setPan(
          clampPanValue(
            drag.startPanX + dx,
            drag.startPanY + dy,
            cellSize,
            viewport.clientWidth,
            viewport.clientHeight
          )
        );
        return;
      }

      if (drag.phase === "selecting") {
        const coords = gridCoordsClamped(e.clientX, e.clientY);
        onSelectUpdate?.(drag.anchorGx, drag.anchorGy, coords.gx, coords.gy);
      }
    }

    function onPointerUp(e) {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      clearTimeout(drag.longPressTimer);
      dragRef.current = null;
      viewport.classList.remove("pan-active");

      if (drag.phase === "selecting") {
        const coords = gridCoordsClamped(e.clientX, e.clientY);
        onSelectUpdate?.(drag.anchorGx, drag.anchorGy, coords.gx, coords.gy);
        return;
      }
      if (drag.phase === "panning" || isBlocked()) return;
      if (drag.phase === "tapOnly") {
        if (!drag.moved) onClaimedTap?.(drag.anchorGx, drag.anchorGy);
        return;
      }
      // touch, still 'pending': a quick tap, released before the long-press
      // fired — resolve it as a tap (1×1 select, or open a claimed cell).
      if (drag.cellFree) {
        onSelectUpdate?.(
          drag.anchorGx,
          drag.anchorGy,
          drag.anchorGx,
          drag.anchorGy
        );
      } else {
        onClaimedTap?.(drag.anchorGx, drag.anchorGy);
      }
    }

    function onPointerCancel() {
      const drag = dragRef.current;
      if (drag) clearTimeout(drag.longPressTimer);
      dragRef.current = null;
      viewport.classList.remove("pan-active");
    }

    viewport.addEventListener("pointerdown", onPointerDown);
    viewport.addEventListener("pointermove", onPointerMove);
    viewport.addEventListener("pointerup", onPointerUp);
    viewport.addEventListener("pointercancel", onPointerCancel);
    return () => {
      viewport.removeEventListener("pointerdown", onPointerDown);
      viewport.removeEventListener("pointermove", onPointerMove);
      viewport.removeEventListener("pointerup", onPointerUp);
      viewport.removeEventListener("pointercancel", onPointerCancel);
    };
  }, [
    mode,
    pan,
    cellSize,
    gridCoordsFromClient,
    gridCoordsClamped,
    isCellFree,
    onSelectUpdate,
    onClaimedTap,
    isBlocked
  ]);

  // ---- ctrl/cmd held: swap in the grab cursor as a hint that click-drag
  // now pans (see ctrlPan above), before the user even starts dragging ----
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || mode !== "interactive") return undefined;
    function onKeyDown(e) {
      if (e.key === "Control" || e.key === "Meta")
        viewport.classList.add("pan-ready");
    }
    function onKeyUp(e) {
      if (e.key === "Control" || e.key === "Meta")
        viewport.classList.remove("pan-ready");
    }
    function onBlur() {
      viewport.classList.remove("pan-ready");
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      viewport.classList.remove("pan-ready");
    };
  }, [mode]);

  // ---- two-finger pinch zoom ----
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || mode !== "interactive") return undefined;

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
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top
      };
      pinchRef.current = {
        startDist: dist(e.touches[0], e.touches[1]),
        startCell: cellSize,
        mid,
        gxAtMid: (-pan.x + mid.x) / cellSize,
        gyAtMid: (-pan.y + mid.y) / cellSize
      };
    }
    function onTouchMove(e) {
      // Read from a ref (not a local closure var) because setCellSize/setPan
      // below re-render the component, which tears down and re-creates this
      // effect (it depends on pan/cellSize) mid-gesture — a plain local
      // variable would reset to null on the very next touchmove, freezing
      // the pinch after one tick. The ref survives that teardown.
      const pinch = pinchRef.current;
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      const ratio = dist(e.touches[0], e.touches[1]) / pinch.startDist;
      let newSize = Math.min(
        MAX_CELL,
        Math.max(INTERACTIVE_MIN, Math.round(pinch.startCell * ratio))
      );
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
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top
      };
      const rawX = curMid.x - pinch.gxAtMid * newSize;
      const rawY = curMid.y - pinch.gyAtMid * newSize;
      setCellSize(newSize);
      setPan(clampPanValue(rawX, rawY, newSize, vw, vh));
    }
    function onTouchEnd(e) {
      if (e.touches.length < 2) pinchRef.current = null;
    }

    viewport.addEventListener("touchstart", onTouchStart, { passive: true });
    viewport.addEventListener("touchmove", onTouchMove, { passive: false });
    viewport.addEventListener("touchend", onTouchEnd, { passive: true });
    viewport.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      viewport.removeEventListener("touchstart", onTouchStart);
      viewport.removeEventListener("touchmove", onTouchMove);
      viewport.removeEventListener("touchend", onTouchEnd);
      viewport.removeEventListener("touchcancel", onTouchEnd);
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
      if (mode !== "interactive") return;
      const vw = viewport.clientWidth;
      const vh = viewport.clientHeight;
      setPan((p) =>
        clampPanValue(p.x - e.deltaX, p.y - e.deltaY, cellSize, vw, vh)
      );
    }
    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
  }, [mode, cellSize, zoomBy, isBlocked]);

  // ---- keyboard +/- ----
  useEffect(() => {
    function onKeyDown(e) {
      if (isBlocked()) return;
      if (e.key === "+" || e.key === "=") zoomBy(ZOOM_STEP);
      if (e.key === "-" || e.key === "_") zoomBy(-ZOOM_STEP);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [zoomBy, isBlocked]);

  // ---- resize ----
  useEffect(() => {
    function onResize() {
      const viewport = viewportRef.current;
      if (!viewport) return;
      if (mode === "overview") {
        drawOverview();
      } else {
        setPan((p) =>
          clampPanValue(
            p.x,
            p.y,
            cellSize,
            viewport.clientWidth,
            viewport.clientHeight
          )
        );
        drawMinimap();
      }
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [mode, cellSize, drawOverview, drawMinimap]);

  useEffect(() => {
    if (mode === "overview") requestAnimationFrame(drawOverview);
    if (mode === "interactive") requestAnimationFrame(drawMinimap);
  }, [mode, drawOverview, drawMinimap]);

  return {
    viewportRef,
    overviewCanvasRef,
    minimapCanvasRef,
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
    handleMinimapClick,
    setOverviewClaims
  };
}

import { GRID_W, GRID_H, priceFor, formatInr } from '../lib/pricing';
import { ZOOM_STEP } from '../hooks/useWallGrid';

const GRID_LINES_BG =
  'linear-gradient(to right, var(--line) 1px, transparent 1px), linear-gradient(to bottom, var(--line) 1px, transparent 1px)';

const IS_TOUCH = typeof window !== 'undefined' && (navigator.maxTouchPoints > 0 || 'ontouchstart' in window);

export default function WallCanvas({
  grid,
  claims,
  preview,
  onConfirmPreview,
  onCancelPreview,
  youAreHere,
  onClaimedClick,
  showToast,
}) {
  const {
    mode,
    cellSize,
    pan,
    viewportRef,
    overviewCanvasRef,
    minimapCanvasRef,
    contentRef,
    handleOverviewClick,
    handleMinimapClick,
    zoomBy,
    enterOverview,
  } = grid;

  const hint =
    mode === 'overview'
      ? 'tap the wall to zoom in'
      : preview
        ? 'confirm below, or tap elsewhere to move it'
        : IS_TOUCH
          ? 'tap for 1 pixel · hold + drag for a bigger square'
          : 'tap for 1 pixel · drag for a bigger square';

  return (
    <div id="viewport" ref={viewportRef}>
      <canvas
        id="overview-canvas"
        ref={overviewCanvasRef}
        style={{ display: mode === 'overview' ? 'block' : 'none' }}
        onClick={handleOverviewClick}
      />

      <canvas
        id="minimap-canvas"
        ref={minimapCanvasRef}
        style={{ display: mode === 'interactive' ? 'block' : 'none' }}
        onClick={handleMinimapClick}
        title="tap to jump around the wall"
      />

      <div
        id="canvas"
        ref={contentRef}
        style={{
          display: mode === 'interactive' ? 'block' : 'none',
          width: GRID_W * cellSize,
          height: GRID_H * cellSize,
          transform: `translate(${pan.x}px, ${pan.y}px)`,
          backgroundImage: GRID_LINES_BG,
          backgroundSize: `${cellSize}px ${cellSize}px`,
        }}
      >
        {claims.map((c) => (
          <div
            key={c.id}
            className="cell claimed"
            style={{
              left: c.x * cellSize,
              top: c.y * cellSize,
              width: c.size * cellSize,
              height: c.size * cellSize,
              backgroundImage: `url(${c.img})`,
            }}
            onClick={() => onClaimedClick(c)}
          />
        ))}

        {preview && (
          <div
            className="cell previewed"
            style={{
              left: preview.x * cellSize,
              top: preview.y * cellSize,
              width: preview.size * cellSize,
              height: preview.size * cellSize,
            }}
          />
        )}

        {youAreHere && (
          <div
            className="yah-callout"
            style={{ left: youAreHere.x * cellSize + (youAreHere.size * cellSize) / 2, top: youAreHere.y * cellSize }}
          >
            <div className="yah-inner">
              <div className="yah-label">YOU ARE HERE!</div>
              <div className="yah-arrow" />
            </div>
          </div>
        )}
      </div>

      <div id="hint-pill" className="mono">
        {hint}
      </div>

      {preview && (
        <div id="confirm-bar">
          <span className="cb-price mono">
            {preview.size}×{preview.size} · {formatInr(priceFor(preview.size))}
          </span>
          <button type="button" className="cb-cancel" onClick={onCancelPreview}>
            ✕
          </button>
          <button type="button" className="cb-confirm" onClick={onConfirmPreview}>
            place here →
          </button>
        </div>
      )}

      <div id="shortcuts">
        {IS_TOUCH ? (
          <>
            <div>
              <b>drag</b> to pan &nbsp;·&nbsp; <b>pinch</b> to zoom
            </div>
            <div>
              <b>tap</b> for 1 pixel &nbsp;·&nbsp; <b>hold + drag</b> for a bigger square &nbsp;·&nbsp; <b>⤢</b> for the full wall
            </div>
          </>
        ) : (
          <>
            <div>
              <b>scroll</b> to pan &nbsp;·&nbsp; <b>⌃/⌘ + drag</b> to pan &nbsp;·&nbsp; <b>⌃/ctrl + scroll</b> to zoom
            </div>
            <div>
              <b>tap</b> for 1 pixel &nbsp;·&nbsp; <b>drag</b> for a bigger square &nbsp;·&nbsp; <b>⤢</b> for the full wall
            </div>
          </>
        )}
      </div>

      <div id="zoom-ctrl">
        <button
          id="zoom-fit"
          type="button"
          title="see the full wall"
          onClick={() => (mode === 'overview' ? showToast("you're already looking at the whole wall") : enterOverview())}
        >
          ⤢
        </button>
        <button type="button" onClick={() => zoomBy(-ZOOM_STEP)}>
          −
        </button>
        <button type="button" onClick={() => zoomBy(ZOOM_STEP)}>
          +
        </button>
      </div>
    </div>
  );
}

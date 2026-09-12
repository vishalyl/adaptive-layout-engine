// A miniature, true-aspect outline of a surface's shape, drawn inside a
// fixed 26x18 box. Purely decorative chrome — it reads the same numbers
// the picker already displays and computes nothing the engine cares about.

export interface SurfaceThumbProps {
  readonly widthPx: number;
  readonly heightPx: number;
}

const BOX_W = 26;
const BOX_H = 18;

export function SurfaceThumb({ widthPx, heightPx }: SurfaceThumbProps) {
  // Fit the true aspect inside the box, then centre it. A 1920x250
  // lower-third becomes a wide slot; a 200x900 skyscraper becomes a
  // sliver — the shape difference is the whole point.
  const scale = Math.min(BOX_W / widthPx, BOX_H / heightPx);
  const w = Math.max(2, widthPx * scale);
  const h = Math.max(2, heightPx * scale);
  return (
    <svg className="surface-thumb" viewBox={`0 0 ${BOX_W} ${BOX_H}`} width={BOX_W} height={BOX_H} aria-hidden="true">
      <rect
        x={(BOX_W - w) / 2}
        y={(BOX_H - h) / 2}
        width={w}
        height={h}
        rx={Math.min(1.5, Math.min(w, h) / 3)}
        fill="currentColor"
        fillOpacity="0.14"
        stroke="currentColor"
        strokeOpacity="0.55"
        strokeWidth="1"
      />
    </svg>
  );
}

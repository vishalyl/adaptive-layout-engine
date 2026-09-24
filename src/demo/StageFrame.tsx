// The scale-to-fit preview shell. The ad is rendered at its TRUE
// pixel dimensions in a child element, then that whole element is scaled
// down with a CSS `transform` applied from OUTSIDE — the resolver never
// sees the scaled-down numbers, only the real ones, so the constraint
// arithmetic (tap targets, text floors, safe areas) is computed exactly as
// it would be on a real device at real size. Scaling only ever happens to
// the pixels on screen, after every layout decision has already been made.

import { useEffect, useRef, useState, type ReactNode } from 'react';

export interface StageFrameProps {
  readonly widthPx: number;
  readonly heightPx: number;
  readonly maxWidth?: number;
  readonly maxHeight?: number;
  readonly zoom?: number;  // visual zoom multiplier (default 1 — see the `zoom = 1` default below)
  readonly children: ReactNode;
  // Reports the live scale-to-fit factor upward so the dimension bar can
  // show it — purely a readout, never fed back into the scale math itself.
  readonly onScaleChange?: (scale: number) => void;
}

export function StageFrame({ widthPx, heightPx, maxWidth = 640, maxHeight = 420, zoom = 1, children, onScaleChange }: StageFrameProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  // The `maxWidth` prop default is only a fallback for the very first paint,
  // before a real measurement exists — see the root-cause note above. The
  // container's actual available width shrinks as the browser window
  // narrows (`.demo-layout`'s `1fr` column), and that available width is
  // what the scale-to-fit math must use, not a constant. Height is
  // deliberately NOT measured the same way: `.demo-stage-viewport`'s height
  // is itself derived from its scaled child (the panel has no fixed
  // height), so observing it would feed the scaled output back in as the
  // next input — a shrinking feedback loop, not a real constraint. Width is
  // safe to measure because it comes from the CSS grid track, independent
  // of this component's own content.
  const [measuredWidth, setMeasuredWidth] = useState<number | null>(null);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) setMeasuredWidth(width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const effectiveMaxWidth = measuredWidth ?? maxWidth;
  const scale = Math.min(effectiveMaxWidth / widthPx, maxHeight / heightPx, 1);

  useEffect(() => {
    onScaleChange?.(scale);
  }, [scale, onScaleChange]);

  return (
    <div className="stage-lightbox">
      <div className="stage-viewport" ref={viewportRef}>
        {/* This wrapper reserves the actual on-screen footprint — `transform`
            scales pixels visually but does not change layout box size, so
            without a same-sized wrapper the flex/grid around it would
            reserve space for the UNscaled surface. `minWidth: 0` stops its
            oversized (pre-scale) child from forcing this flex item — and
            therefore its ancestors — wider than the space actually
            available (flex items default to `min-width: auto`, i.e.
            content-based, not 0). */}
        <div
          className="stage-frame"
          style={{ width: widthPx * scale, height: heightPx * scale, minWidth: 0, minHeight: 0 }}
        >
          {/* The ad is laid out at its TRUE size (widthPx × heightPx) and
              only this transform shrinks it onto the screen — so the browser
              wraps text at exactly the pixel sizes the resolver measured. */}
          <div
            className="stage-surface"
            style={{
              width: widthPx,
              height: heightPx,
              transformOrigin: 'top left',
              transform: `scale(${scale * zoom})`,
            }}
          >
            {children}
            {/* Corner ruler ticks — pure chrome, drawn at the same scale as
                the rest of the surface so they stay crisp. */}
            <span className="stage-tick stage-tick-tl" aria-hidden="true" />
            <span className="stage-tick stage-tick-tr" aria-hidden="true" />
            <span className="stage-tick stage-tick-bl" aria-hidden="true" />
            <span className="stage-tick stage-tick-br" aria-hidden="true" />
          </div>
        </div>
      </div>
    </div>
  );
}

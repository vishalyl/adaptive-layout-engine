// The scale-to-fit preview shell (§14.3). The ad is rendered at its TRUE
// pixel dimensions in a child element, then that whole element is scaled
// down with a CSS `transform` applied from OUTSIDE — the resolver never
// sees the scaled-down numbers, only the real ones, so the constraint
// arithmetic (tap targets, text floors, safe areas) is computed exactly as
// it would be on a real device at real size. Scaling only ever happens to
// the pixels on screen, after every layout decision has already been made.

import type { ReactNode } from 'react';

export interface StageFrameProps {
  readonly widthPx: number;
  readonly heightPx: number;
  readonly maxWidth?: number;
  readonly maxHeight?: number;
  readonly children: ReactNode;
}

export function StageFrame({ widthPx, heightPx, maxWidth = 640, maxHeight = 420, children }: StageFrameProps) {
  const scale = Math.min(maxWidth / widthPx, maxHeight / heightPx, 1);

  return (
    <div className="demo-stage-viewport">
      {/* This wrapper reserves the actual on-screen footprint — `transform`
          scales pixels visually but does not change layout box size, so
          without a same-sized wrapper the flex/grid around it would
          reserve space for the UNscaled surface. */}
      <div style={{ width: widthPx * scale, height: heightPx * scale }}>
        <div
          className="demo-stage-backdrop"
          style={{ width: widthPx, height: heightPx, transform: `scale(${scale})`, transformOrigin: 'top left' }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

// The thin React wrapper around render-canvas.ts's plain imperative draw
// function — owns the <canvas> element and its ref, and re-draws whenever
// the spec/layout/measurer change. render-canvas.ts itself stays framework
// free; this is the only place that knows React exists.
// Click-to-inspect support: maps canvas click coordinates to element rects
// and highlights the selected element with a semi-transparent overlay.

import { useCallback, useEffect, useRef } from 'react';
import type { AdElement, AdSpec } from '../engine/spec';
import type { ResolvedLayout } from '../engine/resolver';
import type { TextMeasurer } from '../engine/measure';
import { renderToCanvas, type AdPalette } from '../render/render-canvas';

export interface RenderCanvasProps<Ids extends string> {
  readonly spec: AdSpec<readonly AdElement<Ids>[]>;
  readonly layout: ResolvedLayout<Ids>;
  readonly measurer: TextMeasurer;
  readonly palette?: AdPalette;
  // Click-to-inspect: which element is currently selected and the callback
  // to report clicks back up.
  readonly selectedElementId?: string | null;
  readonly onSelectElement?: (id: string) => void;
}

export function RenderCanvas<Ids extends string>({
  spec, layout, measurer, palette,
  selectedElementId, onSelectElement,
}: RenderCanvasProps<Ids>) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const specRef = useRef(spec);
  const layoutRef = useRef(layout);

  // Keep refs current so the click handler can always read the latest spec/layout
  // eslint-disable-next-line react-hooks/exhaustive-deps
  specRef.current = spec;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  layoutRef.current = layout;

  // ── Click-to-inspect ──────────────────────────────────────────────────
  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onSelectElement) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = (layout.surface.full.w) / rect.width;   // canvas px / CSS px
    const scaleY = (layout.surface.full.h) / rect.height;
    const cx = (e.clientX - rect.left) * scaleX;
    const cy = (e.clientY - rect.top) * scaleY;

    // Check placed elements in priority order (lower priority = drop
    // first, so they should be hit-tested first to allow clicking
    // higher-priority elements underneath).
    const placed = spec.elements
      .filter((el) => {
        const entry = layout.elements[el.id as Ids];
        return entry && entry.placed;
      })
      .sort((a, b) => a.priority - b.priority);

    for (const el of placed) {
      const entry = layout.elements[el.id as Ids];
      if (!entry || !entry.placed) continue;
      const r = entry.rect;
      if (cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h) {
        onSelectElement(el.id);
        return;
      }
    }

    // Click on empty area — deselect
    onSelectElement('');
  }, [onSelectElement, spec, layout]);

  // ── Draw ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    renderToCanvas(canvas, spec, layout, { measurer, palette }).catch((err: unknown) => {
      if (!cancelled) {
        // eslint-disable-next-line no-console
        console.error('Canvas render failed:', err);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [spec, layout, measurer, palette]);

  // ── Selected element highlight overlay ────────────────────────────────
  useEffect(() => {
    if (!selectedElementId) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Use requestAnimationFrame to draw the overlay after the base render
    // completes, so it appears on top of the drawn content.
    let frame = requestAnimationFrame(() => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const entry = layout.elements[selectedElementId as Ids];
      if (!entry || !entry.placed) return;
      const r = entry.rect;
      ctx.save();
      ctx.strokeStyle = '#F2B705';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(r.x, r.y, r.w, r.h);
      ctx.restore();
    });
    return () => { cancelAnimationFrame(frame); };
  }, [selectedElementId, layout]);

  return (
    <canvas
      ref={canvasRef}
      width={layout.surface.full.w}
      height={layout.surface.full.h}
      style={{
        display: 'block',
        cursor: onSelectElement ? 'pointer' : undefined,
      }}
      onClick={handleClick}
    />
  );
}

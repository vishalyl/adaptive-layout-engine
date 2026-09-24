// The thin React wrapper around render-canvas.ts's plain imperative draw
// function — owns the <canvas> element and its ref, and re-draws whenever
// the spec/layout/measurer/selection change. render-canvas.ts itself stays
// framework free; this is the only place that knows React exists.
//
// Sizing: the canvas BACKING STORE is the surface's true pixel size
// (render-canvas.ts sets width/height to layout.surface.full), and CSS
// stretches the element to fill the already-scaled stage frame. So the
// canvas draws in exactly the resolver's coordinate space and the browser
// does the scale-to-fit — no preview scale factor leaks into the drawing.
//
// Click-to-inspect maps CSS click coordinates back into that layout space.

import { useCallback, useEffect, useRef } from 'react';
import type { AdElement, AdSpec } from '../spec';
import type { ResolvedLayout } from '../resolver';
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

  // ── Click-to-inspect ──────────────────────────────────────────────────
  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onSelectElement) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cx = ((e.clientX - rect.left) * layout.surface.full.w) / rect.width;
    const cy = ((e.clientY - rect.top) * layout.surface.full.h) / rect.height;

    // Elements never overlap (the resolver guarantees it), so at most one
    // rect contains the point — order doesn't matter.
    for (const el of spec.elements) {
      const entry = layout.elements[el.id as Ids];
      if (!entry?.placed) continue;
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
  // One effect for content AND selection highlight: the highlight is drawn
  // at the end of the same pass, so a redraw can never wipe it. A newer
  // draw aborts the older one before it touches the canvas.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const controller = new AbortController();
    renderToCanvas(canvas, spec, layout, {
      measurer,
      palette,
      selectedElementId,
      signal: controller.signal,
    }).catch((err: unknown) => {
      if (!controller.signal.aborted) {
        // eslint-disable-next-line no-console
        console.error('Canvas render failed:', err);
      }
    });
    return () => controller.abort();
  }, [spec, layout, measurer, palette, selectedElementId]);

  return (
    <canvas
      ref={canvasRef}
      width={layout.surface.full.w}
      height={layout.surface.full.h}
      style={{
        display: 'block',
        width: '100%',
        height: '100%',
        cursor: onSelectElement ? 'pointer' : undefined,
      }}
      onClick={handleClick}
    />
  );
}

// The thin React wrapper around render-canvas.ts's plain imperative draw
// function — owns the <canvas> element and its ref, and re-draws whenever
// the spec/layout/measurer change. render-canvas.ts itself stays framework
// free; this is the only place that knows React exists.

import { useEffect, useRef } from 'react';
import type { AdElement, AdSpec } from '../engine/spec';
import type { ResolvedLayout } from '../engine/resolver';
import type { TextMeasurer } from '../engine/measure';
import { renderToCanvas } from '../render/render-canvas';

export interface RenderCanvasProps<Ids extends string> {
  readonly spec: AdSpec<readonly AdElement<Ids>[]>;
  readonly layout: ResolvedLayout<Ids>;
  readonly measurer: TextMeasurer;
}

export function RenderCanvas<Ids extends string>({ spec, layout, measurer }: RenderCanvasProps<Ids>) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    renderToCanvas(canvas, spec, layout, { measurer }).catch((err: unknown) => {
      if (!cancelled) {
        // eslint-disable-next-line no-console
        console.error('Canvas render failed:', err);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [spec, layout, measurer]);

  return (
    <canvas
      ref={canvasRef}
      width={layout.surface.full.w}
      height={layout.surface.full.h}
      style={{ display: 'block' }}
    />
  );
}

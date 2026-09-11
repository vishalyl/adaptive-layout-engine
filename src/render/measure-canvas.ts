// A real, browser-backed `TextMeasurer` (§15.2) — a genuine 2D canvas
// context's `measureText`, in place of the engine's pure-heuristic
// `estimateMeasurer`. resolve() only ever sees this through the
// `TextMeasurer` interface it already accepts as a parameter, so swapping
// measurers never touches the resolver.
//
// This deliberately does NOT live under src/engine/. The engine is
// framework-free and DOM-free by design — §0.2 of BUILD_SPEC.md, mechanically
// enforced by tests/purity.spec.ts, which fails the build if `document`,
// `window`, or `HTMLElement` appears anywhere under src/engine/. A canvas
// context is a genuine browser capability, not a pure function of its
// arguments, so it belongs on the rendering side of that boundary instead —
// paired with render-canvas.ts, which needs the exact same kind of context
// for its own drawing.

import type { TextMeasurer } from '../engine/measure';

type Context2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

// Cap the cache so a session that measures a lot of distinct text/font/width
// combinations (dragging the custom-surface sliders, say) cannot grow this
// without bound — §15.4. Map preserves insertion order, so the first key is
// always the oldest; evicting it is a plain FIFO policy, not an LRU one,
// which is all a cache this size needs.
const MAX_CACHE_ENTRIES = 2000;

function createContext(): Context2D | null {
  // OffscreenCanvas works without ever touching `document` — preferred
  // where available. The `document.createElement('canvas')` fallback is
  // still a real DOM API, which is exactly why this file, not measure.ts,
  // is where it lives.
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(8, 8).getContext('2d');
  }
  if (typeof document !== 'undefined') {
    return document.createElement('canvas').getContext('2d');
  }
  return null;
}

type MeasureResult = ReturnType<TextMeasurer['measure']>;

function greedyWrap(ctx: Context2D, text: string, maxWidthPx: number): MeasureResult {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const spaceWidth = ctx.measureText(' ').width;

  // Same structure as the engine's estimateMeasurer (measure.ts) — plain
  // locals instead of reading the last array entry back out, which is what
  // noUncheckedIndexedAccess pushes toward anyway.
  const lineWidths: number[] = [];
  let currentWidth = 0;
  let wordsOnLine = 0;

  for (const word of words) {
    const wordWidth = ctx.measureText(word).width;
    const addedWidth = wordsOnLine > 0 ? spaceWidth + wordWidth : wordWidth;
    if (wordsOnLine > 0 && currentWidth + addedWidth > maxWidthPx) {
      lineWidths.push(currentWidth);
      currentWidth = wordWidth;
      wordsOnLine = 1;
    } else {
      currentWidth += addedWidth;
      wordsOnLine += 1;
    }
  }
  lineWidths.push(currentWidth);

  return { width: Math.max(...lineWidths), lines: lineWidths.length, lineWidths };
}

// A factory, not a single shared singleton like `estimateMeasurer` — each
// instance owns its own canvas context and its own cache, so a caller that
// wants an isolated measurer (a test, say, or a second canvas) can make one
// without sharing state with another.
export function createCanvasMeasurer(): TextMeasurer {
  const ctx = createContext();
  const cache = new Map<string, MeasureResult>();

  return {
    measure(text, fontPx, weight, family, maxWidthPx) {
      const key = `${text}|${fontPx}|${weight}|${family}|${maxWidthPx}`;
      const cached = cache.get(key);
      if (cached) return cached;

      if (!ctx) {
        // No canvas available in this environment (shouldn't happen in a
        // real browser, which is the only place this module is ever
        // imported) — degrade to a plain single-line estimate rather than
        // throw, so a caller isn't punished for an environment it can't
        // control.
        const width = text.length * fontPx * 0.55;
        return { width, lines: 1, lineWidths: [width] };
      }

      ctx.font = `${weight} ${fontPx}px ${family}`;
      const result = greedyWrap(ctx, text, maxWidthPx);

      cache.set(key, result);
      if (cache.size > MAX_CACHE_ENTRIES) {
        const oldestKey = cache.keys().next().value;
        if (oldestKey !== undefined) cache.delete(oldestKey);
      }
      return result;
    },
  };
}

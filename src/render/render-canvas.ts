// ResolvedLayout -> 2D canvas. The second renderer proving §13's claim: a
// new backend can be added without touching the resolution algorithm at
// all. This file imports nothing from render-dom.tsx and nothing from
// src/demo/ — every pixel it draws comes from the same `spec` (content) and
// `layout` (geometry) render-dom.tsx consumes, read completely
// independently. When the two backends draw the same ResolvedLayout and
// look the same, that is the architecture's module-boundary claim proven,
// not just asserted.
//
// Unlike render-dom.tsx (a React component — DOM rendering is naturally
// declarative), this is a plain imperative function: canvas drawing has no
// retained scene graph to hand to a framework. The thin React wrapper that
// owns the <canvas> element and its ref lives in src/demo/RenderCanvas.tsx.

import type { AdElement, AdSpec } from '../engine/spec';
import type { PlacedElement, ResolvedLayout } from '../engine/resolver';
import type { TextMeasurer } from '../engine/measure';
import { textPaddingFor } from '../engine/textChrome';

// Duplicated from render-dom.tsx rather than shared — see that file's own
// note on the same tokens. Two independent copies is the point: it is what
// makes "neither backend depends on the other" a fact about the code, not
// just a claim about it.
const KEEL_MARINE = '#0E2A38';
const KEEL_SEAGLASS = '#86B8A9';
const KEEL_SAND = '#EDE3D0';
const KEEL_SIGNAL = '#F2B705';
const FONT_FAMILY = 'Archivo, sans-serif';
const LINE_HEIGHT = 1.25;

// Same shape as render-dom.tsx's `AdPalette` — deliberately duplicated
// rather than imported, for the same reason the color tokens themselves
// are duplicated above.
export interface AdPalette {
  readonly background: string;
  readonly text: string;
  readonly textMuted: string;
  readonly badgeBg: string;
  readonly badgeText: string;
  readonly ctaBg: string;
  readonly ctaText: string;
}

const DEFAULT_PALETTE: AdPalette = {
  background: KEEL_MARINE,
  text: KEEL_SAND,
  textMuted: 'rgba(237, 227, 208, 0.7)',
  badgeBg: KEEL_SEAGLASS,
  badgeText: KEEL_MARINE,
  ctaBg: KEEL_SIGNAL,
  ctaText: KEEL_MARINE,
};

type Context2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

const imageCache = new Map<string, HTMLImageElement>();

function loadImage(src: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(src);
  if (cached) return Promise.resolve(cached);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      imageCache.set(src, img);
      resolve(img);
    };
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

// Wraps against the resolved font size using the SAME measurer the
// resolver used to decide how many lines this element gets — so the canvas
// backend's wrapping agrees with the layout it was handed rather than
// re-deciding it. `typography.lines` is the authoritative line count; this
// only needs to know where to break each one.
function wrapForDraw(ctx: Context2D, measurer: TextMeasurer, text: string, fontPx: number, weight: number, maxWidthPx: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const attempt = current ? `${current} ${word}` : word;
    const width = measurer.measure(attempt, fontPx, weight, FONT_FAMILY, Number.POSITIVE_INFINITY).width;
    if (current && width > maxWidthPx) {
      lines.push(current);
      current = word;
      if (lines.length >= maxLines) break;
    } else {
      current = attempt;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  void ctx;
  return lines.slice(0, maxLines);
}

function drawText(ctx: Context2D, measurer: TextMeasurer, element: AdElement, entry: PlacedElement, palette: AdPalette): void {
  if (element.type !== 'text') return;
  const fontPx = entry.typography?.fontPx ?? element.idealFontPx;
  const maxLines = entry.typography?.lines ?? element.maxLines;
  const isBadge = element.role === 'incentive';

  if (isBadge) {
    ctx.fillStyle = palette.badgeBg;
    ctx.fillRect(entry.rect.x, entry.rect.y, entry.rect.w, entry.rect.h);
  }

  ctx.font = `${element.weight} ${fontPx}px ${FONT_FAMILY}`;
  ctx.fillStyle = isBadge ? palette.badgeText : element.role === 'legal' ? palette.textMuted : palette.text;
  ctx.textBaseline = 'top';
  ctx.textAlign = isBadge ? 'center' : 'left';

  // The resolver's rect already has room for TextNode's CSS padding baked in
  // (see textChrome.ts) — draw inset by that same padding so both backends
  // place glyphs identically instead of the canvas backend using the full,
  // unpadded box.
  const pad = textPaddingFor(element.role);
  const maxWidthPx = Math.max(0, entry.rect.w - 2 * pad.x);
  const lines = wrapForDraw(ctx, measurer, element.content, fontPx, element.weight, maxWidthPx, maxLines);
  const x = isBadge ? entry.rect.x + entry.rect.w / 2 : entry.rect.x + pad.x;
  lines.forEach((line, i) => {
    ctx.fillText(line, x, entry.rect.y + pad.y + i * fontPx * LINE_HEIGHT);
  });

  ctx.textAlign = 'left';
}

function drawButton(ctx: Context2D, element: AdElement, entry: PlacedElement, palette: AdPalette): void {
  if (element.type !== 'button') return;
  ctx.fillStyle = palette.ctaBg;
  ctx.fillRect(entry.rect.x, entry.rect.y, entry.rect.w, entry.rect.h);

  const fontPx = entry.typography?.fontPx ?? element.idealFontPx;
  ctx.font = `700 ${fontPx}px ${FONT_FAMILY}`;
  ctx.fillStyle = palette.ctaText;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(element.label, entry.rect.x + entry.rect.w / 2, entry.rect.y + entry.rect.h / 2);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
}

// Same placeholder module-grid convention as render-dom.tsx's ScanNode —
// see that file for why there is no real QR-generation library here. The
// card border/background matches ScanNode's treatment so a QR reads as a
// deliberate "scan me" target on both backends, not just the DOM one.
function drawScan(ctx: Context2D, element: AdElement, entry: PlacedElement): void {
  if (element.type !== 'scan') return;

  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.fillRect(entry.rect.x, entry.rect.y, entry.rect.w, entry.rect.h);
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1;
  ctx.strokeRect(entry.rect.x + 0.5, entry.rect.y + 0.5, entry.rect.w - 1, entry.rect.h - 1);

  const cardPad = 6;
  const patternBudget = Math.max(10, Math.min(entry.rect.w, entry.rect.h) - 2 * cardPad);
  const qrX = entry.rect.x + (entry.rect.w - patternBudget) / 2;
  const qrY = entry.rect.y + (entry.rect.h - patternBudget) / 2;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(qrX, qrY, patternBudget, patternBudget);

  const pad = Math.round(patternBudget * 0.08);
  const inner = patternBudget - pad * 2;
  const cell = inner / 7;
  ctx.fillStyle = KEEL_MARINE;
  for (let i = 0; i < 49; i++) {
    if (i % 3 === 0 || i % 5 === 0) {
      const row = Math.floor(i / 7);
      const col = i % 7;
      ctx.fillRect(qrX + pad + col * cell, qrY + pad + row * cell, cell, cell);
    }
  }
}

async function drawImage(ctx: Context2D, element: AdElement, entry: PlacedElement): Promise<void> {
  if (element.type !== 'image') return;
  const img = await loadImage(element.src);
  // `fit: 'contain'` centres the image within its box at its own aspect
  // ratio rather than stretching to fill it — the only element type here
  // whose intrinsic aspect the resolver already locked in (§8.4), so
  // stretching would visibly distort what the resolver deliberately kept
  // proportional.
  const naturalAspect = img.naturalWidth / img.naturalHeight || element.intrinsicAspect;
  const boxAspect = entry.rect.w / entry.rect.h;
  let drawW: number = entry.rect.w;
  let drawH: number = entry.rect.h;
  if (element.fit === 'contain') {
    if (naturalAspect > boxAspect) {
      drawH = entry.rect.w / naturalAspect;
    } else {
      drawW = entry.rect.h * naturalAspect;
    }
  }
  const dx = entry.rect.x + (entry.rect.w - drawW) / 2;
  const dy = entry.rect.y + (entry.rect.h - drawH) / 2;
  ctx.drawImage(img as CanvasImageSource, dx, dy, drawW, drawH);
}

export interface RenderCanvasOptions {
  readonly measurer: TextMeasurer;
  // Defaults to the original KEEL tokens so any existing caller that omits
  // this keeps looking exactly as it did before.
  readonly palette?: AdPalette | undefined;
}

// The one exported entry point. Async because loading the hero/logo SVGs
// as <img> elements is inherently async — canvas has no equivalent of the
// DOM backend's declarative <img src>, so a draw pass has to wait for
// every image it needs before it can call itself finished.
export async function renderToCanvas<Ids extends string>(
  canvas: HTMLCanvasElement,
  spec: AdSpec<readonly AdElement<Ids>[]>,
  layout: ResolvedLayout<Ids>,
  options: RenderCanvasOptions,
): Promise<void> {
  canvas.width = layout.surface.full.w;
  canvas.height = layout.surface.full.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const palette = options.palette ?? DEFAULT_PALETTE;

  ctx.fillStyle = palette.background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (const element of spec.elements) {
    const entry = layout.elements[element.id];
    if (!entry?.placed) continue;
    switch (element.type) {
      case 'text':
        drawText(ctx, options.measurer, element, entry, palette);
        break;
      case 'button':
        drawButton(ctx, element, entry, palette);
        break;
      case 'scan':
        drawScan(ctx, element, entry);
        break;
      case 'image':
        // Sequential, not Promise.all: at most two images (hero, logo) in
        // this creative, and sequential draw order matching spec.elements
        // order is what keeps z-order predictable without a separate
        // compositing pass.
        await drawImage(ctx, element, entry);
        break;
    }
  }
}

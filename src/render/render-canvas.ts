// ResolvedLayout -> 2D canvas. The second renderer proving the architecture's claim: a
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

import type { AdElement, AdSpec } from '../spec';
import type { PlacedElement, ResolvedLayout } from '../resolver';
import type { TextMeasurer } from '../engine/measure';
import { textPaddingFor } from '../engine/textChrome';

// Duplicated from render-dom.tsx rather than shared — see that file's own
// note on the same tokens. Two independent copies is the point.
const KEEL_MARINE = '#0E2A38';
const KEEL_SEAGLASS = '#86B8A9';
const KEEL_SAND = '#EDE3D0';
const KEEL_SIGNAL = '#F2B705';
const FONT_FAMILY = 'Archivo, sans-serif';
const LINE_HEIGHT = 1.25;

function darken(hex: string, pct: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, ((n >> 16) & 0xff) - Math.round((pct / 100) * 255));
  const g = Math.max(0, ((n >> 8) & 0xff) - Math.round((pct / 100) * 255));
  const b = Math.max(0, (n & 0xff) - Math.round((pct / 100) * 255));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

// Same shape as render-dom.tsx's `AdPalette` — deliberately duplicated.
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

// Wraps text for canvas drawing — uses the SAME measurer the
// resolver used, so canvas wrapping agrees with layout.
function wrapForDraw(measurer: TextMeasurer, text: string, fontPx: number, weight: number, maxWidthPx: number, maxLines: number): { lines: string[]; overflowed: boolean } {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const lines: string[] = [];
  let current = '';
  let overflowed = false;
  for (const word of words) {
    const attempt = current ? `${current} ${word}` : word;
    const width = measurer.measure(attempt, fontPx, weight, FONT_FAMILY, Number.POSITIVE_INFINITY).width;
    if (current && width > maxWidthPx) {
      lines.push(current);
      current = word;
      if (lines.length >= maxLines) {
        overflowed = true;
        current = '';
        break;
      }
    } else {
      current = attempt;
    }
  }
  if (current) lines.push(current);
  if (lines.length > maxLines) overflowed = true;
  return { lines: lines.slice(0, maxLines), overflowed };
}

// Trims `line` until `line + '…'` fits `maxWidthPx` — the canvas equivalent
// of the DOM renderer's `text-overflow: ellipsis`.
function withEllipsis(ctx: Context2D, line: string, maxWidthPx: number): string {
  let text = line;
  while (text.length > 0 && ctx.measureText(`${text}…`).width > maxWidthPx) text = text.slice(0, -1);
  return `${text.trimEnd()}…`;
}

// Roundrect helper — not available on all canvas contexts.
function rr(ctx: Context2D, x: number, y: number, w: number, h: number, r: number): void {
  if (ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  } else {
    // Fallback: draw a rect (no rounding)
    ctx.beginPath();
    ctx.rect(x, y, w, h);
  }
}

function drawText(ctx: Context2D, measurer: TextMeasurer, element: AdElement, entry: PlacedElement, palette: AdPalette): void {
  if (element.type !== 'text') return;
  const fontPx = entry.typography?.fontPx ?? element.idealFontPx;
  const maxLines = entry.typography?.lines ?? element.maxLines;
  const isBadge = element.role === 'incentive';

  if (isBadge) {
    // Pill badge filling its own rect — same shape as the DOM backend's
    // `borderRadius: 999` chip.
    ctx.fillStyle = palette.badgeBg;
    rr(ctx, entry.rect.x, entry.rect.y, entry.rect.w, entry.rect.h, entry.rect.h / 2);
    ctx.fill();
  }

  ctx.font = `${element.weight} ${fontPx}px ${FONT_FAMILY}`;
  ctx.fillStyle = isBadge ? palette.badgeText : element.role === 'legal' ? palette.textMuted : palette.text;
  ctx.textBaseline = 'top';
  const align = isBadge ? 'center' : (entry.typography?.align ?? 'start');
  ctx.textAlign = align === 'center' ? 'center' : align === 'end' ? 'right' : 'left';

  // Match render-dom's padding: 6px vertical, 10px horizontal (4px/2px for legal)
  const pad = textPaddingFor(element.role);
  const maxWidthPx = Math.max(0, entry.rect.w - 2 * pad.x);
  const { lines, overflowed } = wrapForDraw(measurer, element.content, fontPx, element.weight, maxWidthPx, maxLines);
  const truncated = entry.typography?.truncated === true || overflowed;
  const x =
    align === 'center'
      ? entry.rect.x + entry.rect.w / 2
      : align === 'end'
        ? entry.rect.x + entry.rect.w - pad.x
        : entry.rect.x + pad.x;
  // Clip to the element's own rect: wherever the measurer and the real
  // glyphs disagree, nothing bleeds into a neighbour.
  ctx.save();
  ctx.beginPath();
  ctx.rect(entry.rect.x, entry.rect.y, entry.rect.w, entry.rect.h);
  ctx.clip();
  lines.forEach((line, i) => {
    const isLast = i === lines.length - 1;
    const text = isLast && truncated ? withEllipsis(ctx, line, maxWidthPx) : line;
    ctx.fillText(text, x, entry.rect.y + pad.y + i * fontPx * LINE_HEIGHT);
  });
  ctx.restore();

  ctx.textAlign = 'left';
}

function drawButton(ctx: Context2D, element: AdElement, entry: PlacedElement, palette: AdPalette): void {
  if (element.type !== 'button') return;

  const fontPx = entry.typography?.fontPx ?? element.idealFontPx;

  // Shadow (1 layer): slight blur, offset down, darkened CTA color
  ctx.save();
  ctx.shadowColor = darken(palette.ctaBg, 25) + '66';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = palette.ctaBg;
  rr(ctx, entry.rect.x, entry.rect.y, entry.rect.w, entry.rect.h, Math.min(entry.rect.h / 2, 999));
  ctx.fill();
  ctx.restore();

  // Gradient overlay on top of shadow
  const grad = ctx.createLinearGradient(entry.rect.x, entry.rect.y, entry.rect.x, entry.rect.y + entry.rect.h);
  grad.addColorStop(0, palette.ctaBg);
  grad.addColorStop(1, darken(palette.ctaBg, 15));
  ctx.fillStyle = grad;
  rr(ctx, entry.rect.x, entry.rect.y, entry.rect.w, entry.rect.h, Math.min(entry.rect.h / 2, 999));
  ctx.fill();

  // Subtle top highlight (pressable feel)
  ctx.fillStyle = 'white';
  ctx.globalAlpha = 0.12;
  rr(ctx, entry.rect.x + 1, entry.rect.y + 1, entry.rect.w - 2, Math.max(1, entry.rect.h / 3 - 1), 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Label: centred, bold
  ctx.font = `700 ${fontPx}px ${FONT_FAMILY}`;
  ctx.fillStyle = palette.ctaText;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(element.label, entry.rect.x + entry.rect.w / 2, entry.rect.y + entry.rect.h / 2);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
}

// QR code placeholder — matches render-dom.tsx's ScanNode with finder patterns,
// data area, outer padding, rounded border, and caption.
// The canvas is drawn at the surface's TRUE pixel size and scaled down only
// by CSS, so every measurement here is in layout px — no preview scale
// factor (unlike the DOM backend, which sizes inner cells in literal CSS px).
const SCAN_OUTER_PAD = 6;
const SCAN_CAPTION_H = 11;
const SCAN_CAPTION_GAP = 3;
const SCAN_MIN_PATTERN_PX = 24;

function drawScan(ctx: Context2D, element: AdElement, entry: PlacedElement): void {
  if (element.type !== 'scan') return;


  const captionReserve = SCAN_CAPTION_H + SCAN_CAPTION_GAP;
  const rawBudget = Math.min(entry.rect.w, entry.rect.h) - 2 * SCAN_OUTER_PAD;
  const showCaption = rawBudget - captionReserve >= SCAN_MIN_PATTERN_PX;
  const patternBudget = Math.max(SCAN_MIN_PATTERN_PX, rawBudget - (showCaption ? captionReserve : 0));

  const cellPx = Math.max(2, Math.floor(patternBudget / 25));
  const gridSize = Math.floor(patternBudget / cellPx);
  const finderSize = Math.min(7, Math.max(5, Math.floor(gridSize / 5)));

  // Card background and border
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  rr(ctx, entry.rect.x, entry.rect.y, entry.rect.w, entry.rect.h, 10);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1;
  rr(ctx, entry.rect.x + 0.5, entry.rect.y + 0.5, entry.rect.w - 1, entry.rect.h - 1, 10);
  ctx.stroke();

  // Card inner area for QR pattern (with padding)
  const cardX = entry.rect.x + SCAN_OUTER_PAD;
  const cardY = entry.rect.y + SCAN_OUTER_PAD;
  const cardW = entry.rect.w - 2 * SCAN_OUTER_PAD;
  const cardH = entry.rect.h - 2 * SCAN_OUTER_PAD - (showCaption ? captionReserve : 0);

  // QR grid (white base)
  const qxC = cardX + (cardW - gridSize * cellPx) / 2;
  const qyC = cardY + (cardH - gridSize * cellPx) / 2;
  ctx.fillStyle = '#ffffff';
  rr(ctx, qxC, qyC, gridSize * cellPx, gridSize * cellPx, 4);
  ctx.fill();

  // Deterministic seeded random pattern
  const seed = element.payload.length * 7 + element.id.length;
  // An integer hash per cell (not a linear formula, which produces long runs
  // of identical cells and reads as a blank white box).
  const seededRandom = (i: number) => {
    let h = Math.imul(i + 1, 2654435761) ^ Math.imul(seed + 7, 40503);
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
  };

  for (let gy = 0; gy < gridSize; gy++) {
    for (let gx = 0; gx < gridSize; gx++) {
      const isTopLeft = gx < finderSize && gy < finderSize;
      const isTopRight = gx >= gridSize - finderSize && gy < finderSize;
      const isBottomLeft = gx < finderSize && gy >= gridSize - finderSize;

      if (isTopLeft || isTopRight || isBottomLeft) {
        const fx = isTopRight ? gx - (gridSize - finderSize) : gx;
        const fy = isTopRight || isBottomLeft ? gy - (isBottomLeft ? gridSize - finderSize : 0) : gy;
        const isBorder = fx === 0 || fy === 0 || fx === finderSize - 1 || fy === finderSize - 1;
        const isInner = fx >= 2 && fy >= 2 && fx <= finderSize - 3 && fy <= finderSize - 3;
        if (isBorder || isInner) {
          ctx.fillStyle = KEEL_MARINE;
          ctx.fillRect(qxC + gx * cellPx, qyC + gy * cellPx, cellPx, cellPx);
        }
      } else if (seededRandom(gy * gridSize + gx) > 0.5) {
        ctx.fillStyle = KEEL_MARINE;
        ctx.fillRect(qxC + gx * cellPx, qyC + gy * cellPx, cellPx, cellPx);
      }
    }
  }

  // Caption below QR
  if (showCaption) {
    const capY = qyC + gridSize * cellPx + SCAN_CAPTION_GAP;
    ctx.font = '8px monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const maxW = gridSize * cellPx;
    // Truncate caption if too wide
    let capText = element.payload;
    if (ctx.measureText(capText).width > maxW) {
      while (ctx.measureText(capText + '…').width > maxW && capText.length > 0) {
        capText = capText.slice(0, -1);
      }
      capText += '…';
    }
    ctx.fillText(capText, qxC, capY);
  }
}

function drawImage(ctx: Context2D, element: AdElement, entry: PlacedElement, palette: AdPalette, img: HTMLImageElement): void {
  if (element.type !== 'image') return;
  const { x, y, w, h } = entry.rect;
  const radius = 8;

  // Everything this element paints stays inside its own rect.
  ctx.save();
  rr(ctx, x, y, w, h, radius);
  ctx.clip();

  const plate = entry.contrast?.plate ?? null;
  if (plate) {
    // Contrast plate (resolver.ts `attachContrast`): solid fill, mark inset
    // 12% — same treatment as the DOM backend.
    ctx.fillStyle = plate;
    ctx.fillRect(x, y, w, h);
  } else if (Math.min(w, h) > 40) {
    // Soft glow behind hero/logo art — keeps dark assets visible.
    const glow = ctx.createRadialGradient(x + w / 2, y + h / 2, 0, x + w / 2, y + h / 2, Math.max(w, h) / 2);
    glow.addColorStop(0, `${palette.text}22`);
    glow.addColorStop(0.7, `${palette.text}00`);
    ctx.fillStyle = glow;
    ctx.fillRect(x, y, w, h);
  }

  const inset = plate ? Math.min(w, h) * 0.12 : 0;
  const boxX = x + inset;
  const boxY = y + inset;
  const boxW = w - 2 * inset;
  const boxH = h - 2 * inset;

  // `fit: 'contain'` — centre the image within its box at its own aspect ratio
  const naturalAspect = img.naturalWidth / img.naturalHeight || element.intrinsicAspect;
  const boxAspect = boxW / boxH;
  let drawW = boxW;
  let drawH = boxH;
  if (element.fit === 'contain') {
    if (naturalAspect > boxAspect) drawH = boxW / naturalAspect;
    else drawW = boxH * naturalAspect;
  }
  ctx.drawImage(img as CanvasImageSource, boxX + (boxW - drawW) / 2, boxY + (boxH - drawH) / 2, drawW, drawH);
  ctx.restore();
}

// Draw the full ad background with gradient depth (matching render-dom.tsx)
function drawBackground(ctx: Context2D, w: number, h: number, palette: AdPalette): void {
  if (palette.background === '#ffffff') {
    // Light background: radial gradient from warm white to white
    const grad = ctx.createRadialGradient(w / 2, 0, 0, w / 2, 0, w * 0.6);
    grad.addColorStop(0, '#f8f6f3');
    grad.addColorStop(0.6, '#ffffff');
    ctx.fillStyle = grad;
  } else {
    // Dark background: linear gradient "lit from above"
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, darken(palette.background, 8));
    grad.addColorStop(0.4, palette.background);
    ctx.fillStyle = grad;
  }
  ctx.fillRect(0, 0, w, h);
}

// exactOptionalPropertyTypes: `palette`/`selectedElementId` accept an
// explicit `undefined` because the React wrapper forwards optional props.
interface RenderCanvasOptions {
  readonly measurer: TextMeasurer;
  readonly palette: AdPalette | undefined;
  readonly selectedElementId?: string | null | undefined;
  // Aborted when a newer draw supersedes this one — see below.
  readonly signal?: AbortSignal | undefined;
}

// The one exported entry point. Async only because hero/logo SVGs have to
// be loaded as <img> first. ALL images are loaded before a single pixel is
// drawn, and the draw itself is fully synchronous: two overlapping calls
// (a fast surface switch) can therefore never interleave their strokes on
// the same canvas — the superseded one sees its signal aborted and bails
// out before touching the canvas.
export async function renderToCanvas<Ids extends string>(
  canvas: HTMLCanvasElement,
  spec: AdSpec<readonly AdElement<Ids>[]>,
  layout: ResolvedLayout<Ids>,
  options: RenderCanvasOptions,
): Promise<void> {
  const images = new Map<string, HTMLImageElement>();
  await Promise.all(
    spec.elements.map(async (element) => {
      if (element.type !== 'image' || !layout.elements[element.id]?.placed) return;
      images.set(element.id, await loadImage(element.src));
    }),
  );
  if (options.signal?.aborted) return;

  // The canvas backing store is the surface's TRUE pixel size; CSS scales
  // it down to the preview (RenderCanvas.tsx). Layout px == canvas px.
  canvas.width = layout.surface.full.w;
  canvas.height = layout.surface.full.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const palette = options.palette ?? DEFAULT_PALETTE;
  drawBackground(ctx, canvas.width, canvas.height, palette);

  // Surface backdrop regions (what the contrast constraint reacted to).
  for (const backdrop of layout.surface.backdrops) {
    ctx.fillStyle = backdrop.color;
    ctx.fillRect(backdrop.rect.x, backdrop.rect.y, backdrop.rect.w, backdrop.rect.h);
  }

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
      case 'image': {
        const img = images.get(element.id);
        if (img) drawImage(ctx, element, entry, palette, img);
        break;
      }
    }
  }

  // Selection highlight, drawn in the same pass so a redraw can't erase it.
  const selected = options.selectedElementId ? layout.elements[options.selectedElementId as Ids] : undefined;
  if (selected?.placed) {
    const { x, y, w, h } = selected.rect;
    ctx.save();
    ctx.strokeStyle = '#F2B705';
    ctx.lineWidth = Math.max(2, canvas.width / 400);
    ctx.setLineDash([8, 6]);
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    ctx.restore();
  }
}

// Contrast as a first-class layout constraint. Colour enters the engine in
// exactly two places — an ad's own `background` and an image element's
// `markColor` (spec.ts), plus a surface's optional `backdrop` regions
// (surface.ts) — and this file is the only one that turns those into
// numbers. Pure arithmetic: WCAG 2.x relative luminance and contrast ratio,
// no DOM, no canvas pixel sampling.
//
// Why it matters for *placement* rather than just styling: a surface can
// have regions whose background is not the ad's own (a lit header strip, a
// bright bezel, a light panel the ad is composited over). A brand mark that
// is perfectly legible on the ad background can vanish when a template
// happens to put it over one of those regions. The resolver uses
// `evaluateContrast` to (a) pick the first preferred zone where the mark
// clears the surface's contrast floor, and (b) when no zone does, emit a
// contrast plate for the renderer to paint behind the mark — see resolver.ts.

import { rectContains, rectIntersects, type Rect } from './types';

// A `#rgb` / `#rrggbb` string. The template-literal type rejects obvious
// non-hex values ('red', 'rgba(...)') at compile time; `isHexColor` is the
// runtime half for values that arrive as untyped JSON.
export type HexColor = `#${string}`;

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function isHexColor(value: unknown): value is HexColor {
  return typeof value === 'string' && HEX_RE.test(value);
}

export class InvalidColorError extends Error {
  constructor(where: string, value: unknown) {
    super(`${where} must be a #rgb or #rrggbb hex colour, got ${JSON.stringify(value)}.`);
    this.name = 'InvalidColorError';
  }
}

export function assertHexColor(value: unknown, where: string): asserts value is HexColor {
  if (!isHexColor(value)) throw new InvalidColorError(where, value);
}

// WCAG 2.x success criterion 1.4.11 (non-text contrast): graphical objects
// needed to identify something — a logo is exactly that — need 3:1 against
// adjacent colour. Surfaces may raise this (surface.ts `minContrastRatio`).
export const DEFAULT_MIN_CONTRAST_RATIO = 3;

function channels(hex: HexColor): [number, number, number] {
  const body = hex.slice(1);
  const full = body.length === 3 ? body.split('').map((c) => c + c).join('') : body;
  const n = parseInt(full, 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function linearise(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: HexColor): number {
  const [r, g, b] = channels(hex);
  return 0.2126 * linearise(r) + 0.7152 * linearise(g) + 0.0722 * linearise(b);
}

export function contrastRatio(a: HexColor, b: HexColor): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// The plate colour is chosen for the mark, not for the backdrop: once a
// plate is painted, the mark only ever sits against the plate. Pure white
// or near-black, whichever separates from the mark more.
const PLATE_LIGHT: HexColor = '#FFFFFF';
const PLATE_DARK: HexColor = '#111111';

export function plateFor(mark: HexColor): HexColor {
  return contrastRatio(mark, PLATE_LIGHT) >= contrastRatio(mark, PLATE_DARK) ? PLATE_LIGHT : PLATE_DARK;
}

export interface BackdropPatch {
  readonly rect: Rect;
  readonly color: HexColor;
}

// Every colour that could be behind `rect`: the colour of each backdrop
// patch it intersects, plus the ad's base background unless one single
// patch covers the rect completely. Conservative on purpose — a rect
// covered by two adjacent patches still counts the base as "possibly
// behind it" — because under-reporting a clash is worse than a spurious
// plate. Later patches paint over earlier ones, so a rect fully inside the
// LAST covering patch sees only that patch's colour.
export function backdropColorsUnder(
  rect: Rect,
  patches: readonly BackdropPatch[],
  base: HexColor | null,
): HexColor[] {
  const colors: HexColor[] = [];
  let fullyCoveredBy: HexColor | null = null;
  for (const patch of patches) {
    if (rectContains(patch.rect, rect, 0)) fullyCoveredBy = patch.color;
    else if (rectIntersects(patch.rect, rect, 0)) colors.push(patch.color);
  }
  if (fullyCoveredBy) return [fullyCoveredBy, ...colors];
  if (base) colors.push(base);
  return colors;
}

export interface ContrastOutcome {
  readonly markColor: HexColor;
  // The worst-case colour behind the element's rect (lowest contrast).
  readonly backdrop: HexColor;
  // Mark vs that backdrop, before any plate.
  readonly ratio: number;
  readonly required: number;
  // Non-null means the renderer MUST paint this colour behind the mark,
  // inside the element's own rect (so a plate can never create an overlap).
  readonly plate: HexColor | null;
}

// Worst-case contrast of `mark` against whatever could be behind `rect`.
// Returns null when nothing is known about the backdrop (no base colour
// and no patch under the rect) — "unknown" is not the same as "fails".
export function evaluateContrast(
  mark: HexColor,
  rect: Rect,
  patches: readonly BackdropPatch[],
  base: HexColor | null,
  required: number,
): Omit<ContrastOutcome, 'plate'> | null {
  const colors = backdropColorsUnder(rect, patches, base);
  let worst: { backdrop: HexColor; ratio: number } | null = null;
  for (const color of colors) {
    const ratio = contrastRatio(mark, color);
    if (!worst || ratio < worst.ratio) worst = { backdrop: color, ratio };
  }
  if (!worst) return null;
  return { markColor: mark, backdrop: worst.backdrop, ratio: worst.ratio, required };
}

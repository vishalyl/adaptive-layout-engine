// Geometry primitives for the layout engine.
//
// Everything in this file is pure and side-effect free: no DOM, no randomness,
// no surface names. It is the vocabulary every later phase of the resolver is
// written in, so it is worth getting the small things (branding, epsilon
// handling) right here rather than repeating ad-hoc checks downstream.

// A "branded" number is a plain `number` at runtime, but TypeScript treats it
// as a distinct type at compile time. We use this so a function that expects
// a pixel value cannot accidentally be called with, say, a font-weight or a
// priority level — the compiler will refuse to pass a bare `number` where a
// `Px` is expected. The brand field itself never exists at runtime; `unique
// symbol` is only used as a compile-time tag, so this costs nothing.
declare const PxBrand: unique symbol;
export type Px = number & { readonly [PxBrand]: true };

// The only way to create a `Px` from a plain number. Centralising this in one
// function (rather than scattering `as Px` casts everywhere) means there is
// exactly one place that asserts "this number is meant to be read as pixels."
export const px = (n: number): Px => n as Px;

export interface Rect {
  readonly x: Px;
  readonly y: Px;
  readonly w: Px;
  readonly h: Px;
}

export interface Size {
  readonly w: Px;
  readonly h: Px;
}

export interface Insets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

// Rects are compared with a small tolerance rather than exact equality
// because layout numbers pass through floating-point arithmetic (fractional
// zone weights, aspect-ratio division) before being rounded to whole pixels
// only once, at the very end (Phase 6). Two rects that are "the same" up to
// a fraction of a pixel should not be reported as overlapping or as
// out-of-bounds — that would be noise, not a real defect.
export const EPSILON = 0.5;

export function rectArea(r: Rect): number {
  return r.w * r.h;
}

// Axis-aligned bounding-box intersection test. Two rects are considered to
// intersect only if they overlap by more than `epsilon` on *both* axes —
// rects that merely touch at a shared edge (zero-width overlap) are not a
// violation, so we deflate the comparison by epsilon rather than doing a
// naive `<`/`>` check.
export function rectIntersects(a: Rect, b: Rect, epsilon: number = EPSILON): boolean {
  const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return overlapX > epsilon && overlapY > epsilon;
}

// True when `inner` fits entirely inside `outer`, allowing up to `epsilon`
// px of slack on each edge (the same conservative tolerance used everywhere
// else, so a 1-px rounding difference from Phase 6 does not falsely fail a
// bounds check).
export function rectContains(outer: Rect, inner: Rect, epsilon: number = EPSILON): boolean {
  return (
    inner.x >= outer.x - epsilon &&
    inner.y >= outer.y - epsilon &&
    inner.x + inner.w <= outer.x + outer.w + epsilon &&
    inner.y + inner.h <= outer.y + outer.h + epsilon
  );
}

// Shrinks a rect by the given insets (e.g. a device safe area). Insets that
// would consume more than the rect's own width or height are clamped to
// zero-size rather than going negative, so callers get a degenerate
// (zero-area) rect instead of one with a negative `w`/`h` that would corrupt
// every downstream calculation.
export function insetRect(rect: Rect, insets: Insets): Rect {
  const w = Math.max(0, rect.w - insets.left - insets.right);
  const h = Math.max(0, rect.h - insets.top - insets.bottom);
  return {
    x: px(rect.x + insets.left),
    y: px(rect.y + insets.top),
    w: px(w),
    h: px(h),
  };
}

// Splits a rect into adjacent sub-rects along one axis, sized proportionally
// to `fractions`. Used by templates (§9) to partition a surface's usable
// rect into named zones — e.g. a 20/58/22 split for a lead/body/tail band.
//
// Fractions are normalised (divided by their own sum) rather than required
// to sum to exactly 1, so a template can express relative weights like
// `[0.38, 0.62]` or `[1, 2, 1]` without doing that arithmetic itself.
export function splitRect(rect: Rect, axis: 'x' | 'y', fractions: readonly number[]): Rect[] {
  if (fractions.length === 0) return [];
  const total = fractions.reduce((sum, f) => sum + f, 0);
  const extent = axis === 'x' ? rect.w : rect.h;

  let offset = 0;
  return fractions.map((fraction) => {
    const size = total > 0 ? (fraction / total) * extent : 0;
    const piece: Rect =
      axis === 'x'
        ? { x: px(rect.x + offset), y: rect.y, w: px(size), h: rect.h }
        : { x: rect.x, y: px(rect.y + offset), w: rect.w, h: px(size) };
    offset += size;
    return piece;
  });
}

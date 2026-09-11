// Phase 1 of the resolver: pure arithmetic on the surface's *usable* rect
// (never on its name — see §0.2 of BUILD_SPEC.md). Two orthogonal axes:
// aspect ratio decides how elements should be *arranged*, and the shorter
// side's absolute size decides how much *ambition* a template starts with
// (how many elements it even attempts to place at full size). A 4000×4000
// surface and a 900×900 surface are both "square" (same arrangement) but
// land in different scale classes (different ambition).
//
// The boundary values live in one exported object so they are inspectable
// and testable, and so "why did this land in that bucket" is a single
// lookup rather than a hunt through conditionals.

import { type Rect } from './types';

export const CLASSIFICATION_THRESHOLDS = {
  aspect: {
    ultraWideMin: 3.5, // aspect >= this -> 'ultra-wide'
    wideMin: 1.35, // aspect >= this -> 'wide'
    squareMin: 0.8, // aspect >= this -> 'square'
    tallMin: 0.5, // aspect >= this -> 'tall'; below this -> 'ultra-tall'
  },
  scale: {
    microMax: 140, // shorter side < this -> 'micro'
    smallMax: 400, // shorter side < this -> 'small'
    mediumMax: 900, // shorter side < this -> 'medium'; otherwise 'large'
  },
} as const;

export type AspectClass = 'ultra-wide' | 'wide' | 'square' | 'tall' | 'ultra-tall';
export type ScaleClass = 'micro' | 'small' | 'medium' | 'large';

export interface Classification {
  readonly aspect: number;
  readonly aspectClass: AspectClass;
  readonly minSidePx: number;
  readonly scaleClass: ScaleClass;
}

export function classifyAspect(aspect: number): AspectClass {
  const t = CLASSIFICATION_THRESHOLDS.aspect;
  if (aspect >= t.ultraWideMin) return 'ultra-wide';
  if (aspect >= t.wideMin) return 'wide';
  if (aspect >= t.squareMin) return 'square';
  if (aspect >= t.tallMin) return 'tall';
  return 'ultra-tall';
}

export function classifyScale(minSidePx: number): ScaleClass {
  const t = CLASSIFICATION_THRESHOLDS.scale;
  if (minSidePx < t.microMax) return 'micro';
  if (minSidePx < t.smallMax) return 'small';
  if (minSidePx < t.mediumMax) return 'medium';
  return 'large';
}

// The only function downstream phases call. It takes the *usable* rect
// (already safe-area-adjusted by Phase 0) and never looks at anything else
// about the surface — no name, no interaction mode, nothing. Two surfaces
// that happen to classify identically get identical downstream treatment,
// which is exactly the generalisation property BUILD_SPEC.md §8.3 is
// testing for.
export function classify(usable: Rect): Classification {
  const aspect = usable.w / usable.h;
  const minSidePx = Math.min(usable.w, usable.h);
  return {
    aspect,
    aspectClass: classifyAspect(aspect),
    minSidePx,
    scaleClass: classifyScale(minSidePx),
  };
}

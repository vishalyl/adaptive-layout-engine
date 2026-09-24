// Phase 1: pure arithmetic on the surface's *usable* rect (never on its
// name). The aspect ratio decides how the ad is COMPOSED — which template
// tree arranges the slots. It deliberately does not decide WHAT is shown:
// there is no size bucket that excludes elements up front. What survives on
// a given surface is decided by space and priority alone, in the allocation
// loop (resolver.ts).
//
// The boundaries live in one exported object so "why did this land in that
// bucket" is a single lookup rather than a hunt through conditionals.

import { type Rect } from './types';

export const CLASSIFICATION_THRESHOLDS = {
  aspect: {
    ultraWideMin: 3.5, // aspect >= this -> 'ultra-wide'
    wideMin: 1.35, // aspect >= this -> 'wide'
    squareMin: 0.8, // aspect >= this -> 'square'
    tallMin: 0.5, // aspect >= this -> 'tall'; below this -> 'ultra-tall'
  },
} as const;

export type AspectClass = 'ultra-wide' | 'wide' | 'square' | 'tall' | 'ultra-tall';

export interface Classification {
  readonly aspect: number;
  readonly aspectClass: AspectClass;
  readonly minSidePx: number;
}

export function classifyAspect(aspect: number): AspectClass {
  const t = CLASSIFICATION_THRESHOLDS.aspect;
  if (aspect >= t.ultraWideMin) return 'ultra-wide';
  if (aspect >= t.wideMin) return 'wide';
  if (aspect >= t.squareMin) return 'square';
  if (aspect >= t.tallMin) return 'tall';
  return 'ultra-tall';
}

export function classify(usable: Rect): Classification {
  const aspect = usable.w / usable.h;
  return {
    aspect,
    aspectClass: classifyAspect(aspect),
    minSidePx: Math.min(usable.w, usable.h),
  };
}

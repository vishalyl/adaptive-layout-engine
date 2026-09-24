// Surface profiles: the physical/display constraints of wherever an ad is
// about to be shown. Nothing in this file knows the *name* or category of a
// surface: no display-context identity may
// appear anywhere under src/engine/, including in comments, since that is
// exactly what tests/purity.spec.ts greps for. Named profiles live in
// src/surfaces.ts, which is the only place allowed to attach an
// identity to a `SurfaceProfile` value.
//
// The interesting design move here is encoding *dependent* constraints as
// discriminated unions instead of optional fields. A naive `SurfaceProfile`
// might have `touchOnly?: boolean` and `minTapTargetPx?: number` as two
// independent optional fields — which lets you construct the nonsensical
// state `touchOnly: true, minTapTargetPx: undefined`. Making `Interaction`
// a union keyed on `mode` means a surface that cannot be touched has no
// `minTapTargetPx` field *at all*; code that reads it must first narrow on
// `mode`, so the compiler forces the CTA-sizing logic to consider whether
// the surface can even be touched. Same idea for `Viewing`: a surface
// viewed up close has no `minTextPx`, because nothing needs a legibility
// floor at close range — only the two more distant viewing bands do.

import { isHexColor, type HexColor } from './contrast';

export type Interaction =
  | { readonly mode: 'touch'; readonly minTapTargetPx: number }
  | { readonly mode: 'pointer'; readonly minTapTargetPx: number }
  | { readonly mode: 'passive' }; // nothing can be tapped on this surface at all

export type Viewing =
  | { readonly distance: 'near' } // viewed up close — no legibility floor needed
  | { readonly distance: 'mid'; readonly minTextPx: number }
  | { readonly distance: 'far'; readonly minTextPx: number };

export interface SafeArea {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

// A region of the surface whose background is NOT the ad's own — e.g. a lit
// strip or a bright panel the ad is composited over. Pixel coordinates in
// the surface's full (pre-safe-area) space. Later regions paint over
// earlier ones.
export interface BackdropRegion {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly color: HexColor;
}

export interface SurfaceProfile {
  readonly widthPx: number;
  readonly heightPx: number;
  readonly safeArea: SafeArea;
  readonly interaction: Interaction;
  readonly viewing: Viewing;
  readonly densityScale?: number; // optional global type-scale nudge
  readonly backdrop?: readonly BackdropRegion[];
  // Minimum contrast a brand mark must have against whatever is behind it.
  // Defaults to 3 (WCAG 1.4.11, non-text contrast).
  readonly minContrastRatio?: number;
}

export class InvalidSurfaceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidSurfaceError';
  }
}

function isPositiveFinite(n: number): boolean {
  return Number.isFinite(n) && n > 0;
}

// Runtime validation for what the type system cannot express: numeric
// relationships between fields. A `SurfaceProfile` with a negative width or
// a safe area wider than the surface itself is not a smaller-but-valid
// surface, it is malformed data, so it fails loudly here rather than
// producing a negative usable rect three phases later in the resolver.
export function defineSurface(profile: SurfaceProfile): SurfaceProfile {
  if (!isPositiveFinite(profile.widthPx)) {
    throw new InvalidSurfaceError(
      `SurfaceProfile.widthPx must be a positive finite number, got ${profile.widthPx}.`,
    );
  }
  if (!isPositiveFinite(profile.heightPx)) {
    throw new InvalidSurfaceError(
      `SurfaceProfile.heightPx must be a positive finite number, got ${profile.heightPx}.`,
    );
  }

  const { top, right, bottom, left } = profile.safeArea;
  for (const [edge, value] of Object.entries({ top, right, bottom, left })) {
    if (!Number.isFinite(value) || value < 0) {
      throw new InvalidSurfaceError(
        `SurfaceProfile.safeArea.${edge} must be a non-negative finite number, got ${value}.`,
      );
    }
  }
  if (left + right > profile.widthPx) {
    throw new InvalidSurfaceError(
      `SurfaceProfile.safeArea left (${left}) + right (${right}) exceeds widthPx (${profile.widthPx}).`,
    );
  }
  if (top + bottom > profile.heightPx) {
    throw new InvalidSurfaceError(
      `SurfaceProfile.safeArea top (${top}) + bottom (${bottom}) exceeds heightPx (${profile.heightPx}).`,
    );
  }

  (profile.backdrop ?? []).forEach((region, i) => {
    const where = `SurfaceProfile.backdrop[${i}]`;
    for (const [field, value] of Object.entries({ x: region.x, y: region.y, w: region.w, h: region.h })) {
      if (!Number.isFinite(value) || value < 0) {
        throw new InvalidSurfaceError(`${where}.${field} must be a non-negative finite number, got ${value}.`);
      }
    }
    if (region.x + region.w > profile.widthPx || region.y + region.h > profile.heightPx) {
      throw new InvalidSurfaceError(`${where} extends outside the ${profile.widthPx}×${profile.heightPx} surface.`);
    }
    if (!isHexColor(region.color)) {
      throw new InvalidSurfaceError(`${where}.color must be a #rgb or #rrggbb hex colour, got ${JSON.stringify(region.color)}.`);
    }
  });

  if (profile.minContrastRatio !== undefined) {
    const r = profile.minContrastRatio;
    if (!Number.isFinite(r) || r < 1 || r > 21) {
      throw new InvalidSurfaceError(`SurfaceProfile.minContrastRatio must be between 1 and 21, got ${r}.`);
    }
  }

  return profile;
}

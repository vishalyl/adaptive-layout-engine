// Phase 9 — the invariant checker. This runs on EVERY resolve, not
// just in tests: the guarantee has to live in a layer below the logic that
// might regress it, the same instinct as a database-level constraint
// backing application logic rather than trusting every caller to get it
// right.
//
// A note on the signature: the natural design would have `validateLayout`
// take just `(layout)`. But a `ResolvedLayout` deliberately does NOT carry
// each element's original `type` or type-specific fields (that is precisely what keeps `LayoutEntry` a clean, guess-free contract
// for a renderer). But three of the seven checks below (tap target, text
// floor, scan integrity) need to know whether an element is a button, text,
// or scan, and a scan element's own module floor. Rather than smuggle that
// back onto the resolved output, this validator additionally takes the
// `AdSpec` it was resolved against, purely to cross-reference by id. It
// remains a pure function of its two arguments.

import type { AdElement, AdSpec } from '../spec';
import type { LayoutEntry, NormalisedSurface, PlacedElement, ResolvedLayout } from '../resolver';
import type { Violation } from './diagnostics';
import { EPSILON, rectContains, rectIntersects } from './types';
import { contrastRatio, evaluateContrast } from './contrast';

// Only the two fields validateLayout actually reads. Typed as a `Pick` of
// the real `ResolvedLayout` (rather than a hand-rolled shape) so any full
// ResolvedLayout is accepted without a cast, but resolve() can call this
// before the rest of the layout object (diagnostics, status) exists yet.
type ValidatableLayout = Pick<ResolvedLayout, 'elements' | 'surface'>;

export class LayoutInvariantError extends Error {
  readonly violations: readonly Violation[];

  constructor(violations: readonly Violation[]) {
    super(
      `Layout resolved with ${violations.length} invariant violation(s):\n` +
        violations.map((v) => `  [${v.kind}] ${v.message}`).join('\n'),
    );
    this.name = 'LayoutInvariantError';
    this.violations = violations;
  }
}

function placedEntries(elements: Readonly<Record<string, LayoutEntry>>): PlacedElement[] {
  return Object.values(elements).filter((entry): entry is PlacedElement => entry.placed);
}

// Check 1 — pairwise overlap. O(n²) over the ≤8 elements this creative
// ever places is free; if the element count grew into the hundreds a
// sweep-line would be the move, but that tradeoff was considered and
// rejected here as premature for this input size, not defaulted into.
function checkOverlap(placed: readonly PlacedElement[]): Violation[] {
  const violations: Violation[] = [];
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i]!;
      const b = placed[j]!;
      if (rectIntersects(a.rect, b.rect, EPSILON)) {
        violations.push({
          kind: 'overlap',
          severity: 'error',
          message: `"${a.id}" and "${b.id}" overlap.`,
          elementIds: [a.id, b.id],
        });
      }
    }
  }
  return violations;
}

// Check 2 — bounds containment, against `full` (not `usable`). An element
// may legitimately sit inside the safe-area margin; the only hard
// requirement is that it is on screen at all. Safe-area respect is the
// separate, softer check below.
function checkBounds(placed: readonly PlacedElement[], surface: NormalisedSurface): Violation[] {
  const violations: Violation[] = [];
  for (const entry of placed) {
    if (!rectContains(surface.full, entry.rect, EPSILON)) {
      violations.push({
        kind: 'out-of-bounds',
        severity: 'error',
        message: `"${entry.id}" at ${JSON.stringify(entry.rect)} extends outside the surface (${surface.full.w}×${surface.full.h}).`,
        elementIds: [entry.id],
      });
    }
  }
  return violations;
}

// Check 3 — safe-area respect. Warning-level: resting in the margin is
// worth flagging in diagnostics, not a hard failure.
function checkSafeArea(placed: readonly PlacedElement[], surface: NormalisedSurface): Violation[] {
  const violations: Violation[] = [];
  for (const entry of placed) {
    if (!rectContains(surface.usable, entry.rect, EPSILON)) {
      violations.push({
        kind: 'safe-area',
        severity: 'warning',
        message: `"${entry.id}" extends into the safe-area margin.`,
        elementIds: [entry.id],
      });
    }
  }
  return violations;
}

// Check 4 — tap target. Every button and scan element on a surface with a
// tap floor must clear it on both axes.
function checkTapTarget(
  placed: readonly PlacedElement[],
  specById: ReadonlyMap<string, AdElement>,
  surface: NormalisedSurface,
): Violation[] {
  const violations: Violation[] = [];
  if (surface.minTapTargetPx === null) return violations;
  for (const entry of placed) {
    const spec = specById.get(entry.id);
    if (!spec || (spec.type !== 'button' && spec.type !== 'scan')) continue;
    const floor = surface.minTapTargetPx;
    if (entry.rect.w < floor - EPSILON || entry.rect.h < floor - EPSILON) {
      violations.push({
        kind: 'tap-target',
        severity: 'error',
        message: `"${entry.id}" is ${entry.rect.w}×${entry.rect.h}, below the ${floor}px tap-target floor.`,
        elementIds: [entry.id],
      });
    }
  }
  return violations;
}

// Check 5 — text floor. Every placed text element's resolved font size
// must meet the surface's minimum legible size.
function checkTextFloor(placed: readonly PlacedElement[], surface: NormalisedSurface): Violation[] {
  const violations: Violation[] = [];
  for (const entry of placed) {
    if (!entry.typography) continue;
    if (entry.typography.fontPx < surface.minTextPx - EPSILON) {
      violations.push({
        kind: 'text-floor',
        severity: 'error',
        message: `"${entry.id}" is rendering at ${entry.typography.fontPx}px, below the ${surface.minTextPx}px text floor.`,
        elementIds: [entry.id],
      });
    }
  }
  return violations;
}

// Check 6 — scan integrity. A placed scan element must meet its own
// modules × minModulePx floor. A QR may start bigger and shrink under
// pressure, but only to that floor (scanDemand in resolver.ts); this is the
// check that confirms the floor actually held.
function checkScanIntegrity(placed: readonly PlacedElement[], specById: ReadonlyMap<string, AdElement>): Violation[] {
  const violations: Violation[] = [];
  for (const entry of placed) {
    const spec = specById.get(entry.id);
    if (!spec || spec.type !== 'scan') continue;
    const floor = spec.modules * spec.minModulePx;
    if (entry.rect.w < floor - EPSILON || entry.rect.h < floor - EPSILON) {
      violations.push({
        kind: 'scan-integrity',
        severity: 'error',
        message: `"${entry.id}" is ${entry.rect.w}×${entry.rect.h}, below its own ${floor}px module floor.`,
        elementIds: [entry.id],
      });
    }
  }
  return violations;
}

// Check 7 — contrast. Every placed element that declared a mark colour must
// clear the surface's contrast floor against what is actually behind its
// final rect — or, if the resolver plated it, against that plate. Recomputed
// here from the spec and surface rather than trusting the resolver's own
// `contrast` field, the same independence every other check keeps.
function checkContrast(
  placed: readonly PlacedElement[],
  specById: ReadonlyMap<string, AdElement>,
  spec: AdSpec,
  surface: NormalisedSurface,
): Violation[] {
  const violations: Violation[] = [];
  for (const entry of placed) {
    const el = specById.get(entry.id);
    if (!el || el.type !== 'image' || el.markColor === undefined) continue;
    const required = surface.minContrastRatio;
    const plate = entry.contrast?.plate ?? null;
    const ratio = plate
      ? contrastRatio(el.markColor, plate)
      : evaluateContrast(el.markColor, entry.rect, surface.backdrops, spec.background ?? null, required)?.ratio;
    if (ratio !== undefined && ratio < required - 1e-6) {
      violations.push({
        kind: 'contrast',
        severity: 'error',
        message: `"${entry.id}" has ${ratio.toFixed(2)}:1 contrast, below the ${required}:1 floor.`,
        elementIds: [entry.id],
      });
    }
  }
  return violations;
}

export function validateLayout(spec: AdSpec, layout: ValidatableLayout): Violation[] {
  const placed = placedEntries(layout.elements);
  const specById = new Map(spec.elements.map((el) => [el.id, el]));

  return [
    ...checkOverlap(placed),
    ...checkBounds(placed, layout.surface),
    ...checkSafeArea(placed, layout.surface),
    ...checkTapTarget(placed, specById, layout.surface),
    ...checkTextFloor(placed, layout.surface),
    ...checkScanIntegrity(placed, specById),
    ...checkContrast(placed, specById, spec, layout.surface),
  ];
}

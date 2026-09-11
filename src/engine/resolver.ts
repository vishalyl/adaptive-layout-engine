// The resolver: orchestrates all seven phases. This file is the single most
// important one in the engine — see BUILD_SPEC.md §8.
//
//   Phase 0  Normalise      surface -> usable rect + constraint floors
//   Phase 1  Classify       derived geometry -> aspect class + scale class
//   Phase 2  Select         classes -> composition template
//   Phase 3  Demand         per element -> { ideal, min, floors, floorReasons }
//   Phase 4  Partition      template + usable rect -> zones
//   Phase 5  Allocate       priority-ordered greedy fill, with degradation loop
//   Phase 6  Position       zone-relative boxes -> absolute rects
//   Phase 7  Validate       invariants; throws in dev, flags in prod (validate.ts)
//
// `resolve()` takes a `TextMeasurer` as a parameter (default: the DOM-free
// estimator) rather than importing one, which is what keeps it a pure
// function of its arguments — no DOM, no globals besides a timing call.

import type { AdElement, AdSpec, ButtonElement, ImageElement, Role, TextElement } from './spec';
import type { ElementIdOf } from './spec';
import type { Interaction, SurfaceProfile, Viewing } from './surface';
import { classify, type AspectClass, type Classification, type ScaleClass } from './classify';
import { getTemplate, selectTemplate, type Template, type TemplateId, type Zone } from './templates';
import { type DropReason, type Rung, nextRung, selectVictim } from './degradation';
import { DiagnosticsBuilder, type Diagnostics, type Violation } from './diagnostics';
import { estimateMeasurer, type TextMeasurer } from './measure';
import { LayoutInvariantError, validateLayout } from './validate';
import { EPSILON, insetRect, px, type Rect, type Size } from './types';

// ---------------------------------------------------------------------------
// Output types (§5.5) — what the renderer consumes.
// ---------------------------------------------------------------------------

export interface PlacedElement {
  readonly placed: true;
  readonly id: string;
  readonly role: Role;
  readonly rect: Rect;
  readonly zone: string;
  readonly typography?: { readonly fontPx: number; readonly lines: number; readonly truncated: boolean };
  readonly appliedRungs: readonly Rung[];
}

export interface DroppedElement {
  readonly placed: false;
  readonly id: string;
  readonly role: Role;
  readonly reason: DropReason;
}

export type LayoutEntry = PlacedElement | DroppedElement;

export interface ResolvedZone {
  readonly id: string;
  readonly rect: Rect;
}

// Phase 0's output. This is the ONLY place in the engine that reads
// `Interaction.mode` or `Viewing.distance` — every later phase works from
// these flat numbers instead, which is what BUILD_SPEC.md §8.1 calls out as
// a deliberate boundary.
export interface NormalisedSurface {
  readonly full: Rect;
  readonly usable: Rect;
  readonly minTapTargetPx: number | null;
  readonly minTextPx: number;
  readonly canReceiveTouch: boolean;
  readonly densityScale: number;
}

export interface ResolvedLayout<Ids extends string = string> {
  readonly surface: NormalisedSurface;
  readonly templateId: TemplateId;
  readonly aspectClass: AspectClass;
  readonly scaleClass: ScaleClass;
  readonly elements: Readonly<Record<Ids, LayoutEntry>>;
  readonly zones: readonly ResolvedZone[];
  readonly diagnostics: Diagnostics;
  readonly status: 'ok' | 'degraded' | 'constrained';
}

export class ImpossibleSurfaceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImpossibleSurfaceError';
  }
}

export class AllocationLoopExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AllocationLoopExceededError';
  }
}

// ---------------------------------------------------------------------------
// Tunable constants. Named here (not sprinkled through the phases) so they
// are all inspectable in one place.
// ---------------------------------------------------------------------------

const MIN_LEGIBLE_TEXT_PX = 12; // §8.1: resolved text floor is max(surface floor, 12)
const LINE_HEIGHT = 1.25;
const SHRINK_STEP_FRACTION = 0.15; // §10.1: each SHRINK_STEP closes 15% of the ideal-floor gap
const TAP_HEIGHT_FONT_MULTIPLIER = 2.2; // §8.4: button height floor = max(tapFloor, fontPx * 2.2)
const FONT_FAMILY = 'Archivo, sans-serif'; // passed to the measurer only — the engine never reads a font file
const MAX_ITERATIONS = 64; // §8.6: bounds the allocation loop so a bug fails loudly instead of hanging

// Order matters here: `Math.max(min, Math.min(n, max))` — not the more
// common `Math.min(Math.max(n, min), max)` — because every caller in this
// file uses `min` for a genuine hard floor and `max` for a soft ceiling.
// When a ceiling is computed independently of its floor (e.g. an element's
// own 2x-ideal cap on a surface whose text floor is more than double that
// element's ideal size), `min` can end up greater than `max`. Clamping
// max-then-min in that case silently returns the too-small ceiling instead
// of the floor — exactly the bug the fuzz suite (§16.3) caught on its
// second randomly generated surface. Clamping min-then-max instead means a
// degenerate range always resolves to the floor, which is the correct
// answer whenever the two are in conflict: the hard constraint wins.
function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(n, max));
}

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

// ---------------------------------------------------------------------------
// Phase 0 — Normalise
// ---------------------------------------------------------------------------

function resolveInteractionFloor(interaction: Interaction): number | null {
  return interaction.mode === 'passive' ? null : interaction.minTapTargetPx;
}

function resolveTextFloor(viewing: Viewing): number {
  const surfaceFloor = viewing.distance === 'near' ? 0 : viewing.minTextPx;
  return Math.max(surfaceFloor, MIN_LEGIBLE_TEXT_PX);
}

function normaliseSurface(profile: SurfaceProfile): NormalisedSurface {
  const full: Rect = { x: px(0), y: px(0), w: px(profile.widthPx), h: px(profile.heightPx) };
  const usable = insetRect(full, profile.safeArea);

  if (usable.w <= 0 || usable.h <= 0) {
    throw new ImpossibleSurfaceError(
      `Surface usable area is empty (${usable.w}×${usable.h} after safe area) — width/height ` +
        `${profile.widthPx}×${profile.heightPx} cannot accommodate this safe area.`,
    );
  }

  return {
    full,
    usable,
    minTapTargetPx: resolveInteractionFloor(profile.interaction),
    minTextPx: resolveTextFloor(profile.viewing),
    canReceiveTouch: profile.interaction.mode === 'touch',
    densityScale: profile.densityScale ?? 1,
  };
}

// ---------------------------------------------------------------------------
// Phase 3 — Demand
// ---------------------------------------------------------------------------

// A superset of the `Demand` shape described in BUILD_SPEC.md §8.4: it adds
// `idealScale`/`floorScale`, the single numeric "knob" (a font size for
// text/button, a short-side length for image, a fixed value for scan) that
// Phase 5's SHRINK_STEP rung turns. Keeping that knob on Demand means the
// allocation loop never needs to know *which* number it is turning, only
// that turning it moves the element between `idealScale` and `floorScale`.
interface Demand {
  readonly id: string;
  readonly ideal: Size;
  readonly min: Size;
  readonly hardFloor: Size;
  readonly floorReason: string | null;
  readonly aspectLocked: number | null;
  readonly idealScale: number;
  readonly floorScale: number;
}

function buttonSizeAtScale(
  element: ButtonElement,
  fontPx: number,
  surface: NormalisedSurface,
  measurer: TextMeasurer,
): Size {
  const tapFloor = surface.minTapTargetPx ?? 0;
  const label = measurer.measure(element.label, fontPx, 700, FONT_FAMILY, Number.POSITIVE_INFINITY);
  const height = Math.max(tapFloor, fontPx * TAP_HEIGHT_FONT_MULTIPLIER);
  const naturalWidth = label.width + 2 * element.paddingRatio * fontPx;
  // A button on a touch surface must clear the tap floor on BOTH axes — a
  // 200x44 button is fine, a 30x44 one is not. On a passive surface there is
  // no tap floor at all: a CTA there is a legibility problem, not a
  // touchability one, which is why this only widens when `canReceiveTouch`.
  const width = surface.canReceiveTouch ? Math.max(naturalWidth, tapFloor) : naturalWidth;
  return { w: px(width), h: px(height) };
}

function imageSizeAtScale(element: ImageElement, shortSide: number): Size {
  // intrinsicAspect <= 1 means the image is taller than (or as tall as) it
  // is wide, so its short side is its width; otherwise the short side is
  // its height. Either way the other dimension follows from the aspect.
  if (element.intrinsicAspect <= 1) {
    return { w: px(shortSide), h: px(shortSide / element.intrinsicAspect) };
  }
  return { w: px(shortSide * element.intrinsicAspect), h: px(shortSide) };
}

function computeTextDemand(element: TextElement, surface: NormalisedSurface, measurer: TextMeasurer): Demand {
  const floorFontPx = Math.max(element.minFontPx, surface.minTextPx);
  const flooredBySurface = floorFontPx > element.minFontPx;
  // The ideal itself is clamped to the floor: a surface's minimum legible
  // size is a hard, non-negotiable floor (§8.4), so if an element's own
  // "comfortable" size is smaller than that floor, its ideal is bumped up
  // to the smallest legally-renderable size rather than starting illegally
  // small. The 2x ceiling just prevents densityScale from inflating text
  // without bound. (`clamp`'s floor-wins-on-conflict semantics, documented
  // at its definition, are what keep this correct even when that ceiling
  // is smaller than the floor — e.g. legal text's own 12px ideal capped at
  // 24px, on a surface whose text floor is 30px.)
  const idealFontPx = clamp(element.idealFontPx * surface.densityScale, floorFontPx, element.idealFontPx * 2);

  const idealMeasure = measurer.measure(element.content, idealFontPx, element.weight, FONT_FAMILY, Number.POSITIVE_INFINITY);
  const floorMeasure = measurer.measure(element.content, floorFontPx, element.weight, FONT_FAMILY, Number.POSITIVE_INFINITY);

  return {
    id: element.id,
    ideal: { w: px(idealMeasure.width), h: px(idealFontPx * LINE_HEIGHT) },
    min: { w: px(floorMeasure.width), h: px(floorFontPx * LINE_HEIGHT) },
    hardFloor: { w: px(floorMeasure.width), h: px(floorFontPx * LINE_HEIGHT) },
    floorReason: flooredBySurface
      ? `floored at ${Math.round(floorFontPx)}px by the surface's minimum legible text size`
      : null,
    aspectLocked: null,
    idealScale: idealFontPx,
    floorScale: floorFontPx,
  };
}

function computeButtonDemand(element: ButtonElement, surface: NormalisedSurface, measurer: TextMeasurer): Demand {
  const ideal = buttonSizeAtScale(element, element.idealFontPx, surface, measurer);
  const min = buttonSizeAtScale(element, element.minFontPx, surface, measurer);
  const tapFloor = surface.minTapTargetPx ?? 0;
  const flooredByTap = tapFloor > element.minFontPx * TAP_HEIGHT_FONT_MULTIPLIER;
  return {
    id: element.id,
    ideal,
    min,
    hardFloor: min,
    floorReason: flooredByTap
      ? `height floored at ${Math.round(tapFloor)}px by the surface's minimum tap target`
      : null,
    aspectLocked: null,
    idealScale: element.idealFontPx,
    floorScale: element.minFontPx,
  };
}

// Starting ambition, as a fraction of the usable rect's shorter side, before
// any zone-fit clamping happens. `hero` is the thing being sold and starts
// ambitious; `branding` is a mark, not the message, and starts modest. Any
// other image role falls back to a middling fraction. This only sets where
// an image *starts* — the cross-axis clamp below is what guarantees it
// never actually renders larger than the zone it landed in.
const IMAGE_IDEAL_FRACTION: Partial<Record<Role, number>> = {
  hero: 0.45,
  branding: 0.14,
};

function computeImageDemand(element: ImageElement, surface: NormalisedSurface): Demand {
  const referenceSide = Math.min(surface.usable.w, surface.usable.h);
  const fraction = IMAGE_IDEAL_FRACTION[element.role] ?? 0.3;
  const idealShort = clamp(referenceSide * fraction, element.minShortSidePx, referenceSide);
  return {
    id: element.id,
    ideal: imageSizeAtScale(element, idealShort),
    min: imageSizeAtScale(element, element.minShortSidePx),
    hardFloor: imageSizeAtScale(element, element.minShortSidePx),
    floorReason: null,
    aspectLocked: element.intrinsicAspect,
    idealScale: idealShort,
    floorScale: element.minShortSidePx,
  };
}

function computeScanDemand(element: AdElement & { type: 'scan' }): Demand {
  // A QR below its module floor doesn't scan, so there is no "ideal minus
  // floor" range to shrink through at all — ideal and floor are the same
  // fixed square. See the `isScan` short-circuit in degradation.ts.
  const side = element.modules * element.minModulePx;
  const size: Size = { w: px(side), h: px(side) };
  return {
    id: element.id,
    ideal: size,
    min: size,
    hardFloor: size,
    floorReason: `fixed at ${side}px — a scan target below its module floor stops scanning`,
    aspectLocked: 1,
    idealScale: side,
    floorScale: side,
  };
}

function computeDemand(element: AdElement, surface: NormalisedSurface, measurer: TextMeasurer): Demand {
  switch (element.type) {
    case 'text':
      return computeTextDemand(element, surface, measurer);
    case 'button':
      return computeButtonDemand(element, surface, measurer);
    case 'image':
      return computeImageDemand(element, surface);
    case 'scan':
      return computeScanDemand(element);
  }
}

// ---------------------------------------------------------------------------
// Phases 5 & 6 — Allocate (degrade until it fits) and Position (lay out)
// ---------------------------------------------------------------------------

interface AllocState {
  readonly element: AdElement;
  readonly demand: Demand;
  scale: number; // the current value of the "knob" described on Demand
  maxLines: number; // text only
  ellipsisApplied: boolean;
  zoneIndex: number; // index into template.rolePreference[role]
  dropped: boolean;
  dropReason: DropReason | null;
  readonly appliedRungs: Rung[];
}

function currentZoneId(state: AllocState, template: Template): string | null {
  const zoneList = template.rolePreference[state.element.role];
  return zoneList[state.zoneIndex] ?? null;
}

// The cross axis is "handled by clamping" (§8.6) — it never participates in
// overflow detection or the degradation ladder, it just silently constrains
// whatever measureOccupant computed so nothing can ever render larger than
// the zone it is standing in. For an aspect-locked element (image/scan),
// clamping one dimension has to scale the other down with it, or the shape
// distorts; for text/button, only the cross dimension itself is capped —
// their main-axis dimension is what overflow is actually measured against,
// and is left for the ladder to handle.
function clampCrossAxis(size: Size, zone: Zone, aspectLocked: boolean): Size {
  const crossCapacity = zone.flow === 'stack-y' ? zone.rect.w : zone.rect.h;
  const crossExtent = zone.flow === 'stack-y' ? size.w : size.h;
  if (crossExtent <= crossCapacity) return size;

  if (aspectLocked) {
    const factor = crossCapacity / crossExtent;
    return zone.flow === 'stack-y'
      ? { w: px(crossCapacity), h: px(size.h * factor) }
      : { w: px(size.w * factor), h: px(crossCapacity) };
  }

  return zone.flow === 'stack-y' ? { w: px(crossCapacity), h: size.h } : { w: size.w, h: px(crossCapacity) };
}

function measureOccupant(
  state: AllocState,
  zone: Zone,
  surface: NormalisedSurface,
  measurer: TextMeasurer,
): { size: Size; lines: number } {
  const element = state.element;
  if (element.type === 'text') {
    // Cross-axis clamping: a text occupant in a vertically-stacking zone is
    // wrapped against the zone's actual width; in a horizontally-stacking
    // zone (e.g. a short badge sitting beside a logo) it is measured at its
    // natural, unconstrained width instead — re-wrapping against a width
    // that itself depends on how many siblings share the row would be
    // circular, and every horizontally-stacking zone in this creative only
    // ever holds short, single-line labels, so the simplification costs
    // nothing in practice. Documented here rather than left implicit.
    const maxWidth = zone.flow === 'stack-y' ? zone.rect.w : Number.POSITIVE_INFINITY;
    const result = measurer.measure(element.content, state.scale, element.weight, FONT_FAMILY, maxWidth);
    const lines = Math.max(1, Math.min(result.lines, state.maxLines));
    const width = Math.min(result.width, maxWidth);
    const size = clampCrossAxis({ w: px(width), h: px(lines * state.scale * LINE_HEIGHT) }, zone, false);
    return { size, lines };
  }
  if (element.type === 'button') {
    const size = clampCrossAxis(buttonSizeAtScale(element, state.scale, surface, measurer), zone, false);
    return { size, lines: 1 };
  }
  if (element.type === 'image') {
    const size = clampCrossAxis(imageSizeAtScale(element, state.scale), zone, true);
    return { size, lines: 0 };
  }
  // scan: fixed size, deliberately NEVER passed through clampCrossAxis. A
  // QR below its module floor doesn't scan (§8.4) — unlike an image, it has
  // no acceptable smaller rendering, so if it doesn't fit its zone that is
  // real overflow (checked explicitly in detectOverflow below), not
  // something to paper over with a silent resize.
  return { size: state.demand.ideal, lines: 0 };
}

function buildDegradableState(state: AllocState, template: Template) {
  const zoneList = template.rolePreference[state.element.role];
  return {
    degradability: state.element.degradability,
    isText: state.element.type === 'text',
    isScan: state.element.type === 'scan',
    atFloor: state.scale <= state.demand.floorScale,
    linesAboveOne: state.element.type === 'text' && state.maxLines > 1,
    ellipsisApplied: state.ellipsisApplied,
    zonesRemaining: state.zoneIndex + 1 < zoneList.length,
  };
}

function applyRung(state: AllocState, rung: Rung): void {
  switch (rung) {
    case 'SHRINK_STEP': {
      const step = (state.demand.idealScale - state.demand.floorScale) * SHRINK_STEP_FRACTION;
      state.scale = Math.max(state.demand.floorScale, state.scale - step);
      break;
    }
    case 'TRUNCATE_LINE':
      state.maxLines = Math.max(1, state.maxLines - 1);
      break;
    case 'ELLIPSIS':
      state.ellipsisApplied = true;
      break;
    case 'REFLOW':
      state.zoneIndex += 1;
      break;
    case 'DROP':
      state.dropped = true;
      state.dropReason = 'exhausted-ladder';
      break;
  }
  state.appliedRungs.push(rung);
}

function describeRungApplication(state: AllocState, rung: Rung, zoneId: string): string {
  const label = `${state.element.role} "${state.element.id}"`;
  switch (rung) {
    case 'SHRINK_STEP':
      return `${label} shrunk (rung ${state.appliedRungs.length + 1}): zone "${zoneId}" overflowed; ${label} is the lowest-priority occupant with rungs remaining.`;
    case 'TRUNCATE_LINE':
      return `${label} truncated to ${Math.max(1, state.maxLines - 1)} line(s): zone "${zoneId}" still overflowed at its floor size.`;
    case 'ELLIPSIS':
      return `${label} allowed an ellipsis on its final line: zone "${zoneId}" still overflowed.`;
    case 'REFLOW':
      return `${label} reflowed to its next preferred zone: "${zoneId}" could not fit it even at floor size.`;
    case 'DROP':
      return `${label} dropped: no zone in its preference list could fit it, even at floor size.`;
  }
}

interface OverflowCandidate {
  readonly state: AllocState;
  readonly zoneId: string;
}

function detectOverflow(
  attempted: readonly AllocState[],
  zones: readonly Zone[],
  template: Template,
  surface: NormalisedSurface,
  measurer: TextMeasurer,
): { anyOverflow: boolean; candidates: OverflowCandidate[] } {
  let anyOverflow = false;
  const candidates: OverflowCandidate[] = [];

  for (const zone of zones) {
    const occupants = attempted.filter((s) => !s.dropped && currentZoneId(s, template) === zone.id);
    if (occupants.length === 0) continue;

    const measured = occupants.map((s) => measureOccupant(s, zone, surface, measurer));
    const mainSizes = measured.map((m) => (zone.flow === 'stack-y' ? m.size.h : m.size.w));
    const totalMain = mainSizes.reduce((sum, v) => sum + v, 0) + zone.gapPx * Math.max(0, occupants.length - 1);
    const capacityMain = zone.flow === 'stack-y' ? zone.rect.h : zone.rect.w;
    const capacityCross = zone.flow === 'stack-y' ? zone.rect.w : zone.rect.h;

    const mainOverflow = totalMain - capacityMain > EPSILON;
    // Every other element type tolerates clampCrossAxis silently resizing
    // it to fit; scan deliberately does not (measureOccupant never clamps
    // it), so its cross-axis fit has to be checked explicitly here — this
    // is the only place a QR's "doesn't fit" becomes a real overflow rather
    // than a silent shrink below its module floor.
    const scanCrossOverflow = occupants.some((occupant, i) => {
      if (occupant.element.type !== 'scan') return false;
      const crossExtent = zone.flow === 'stack-y' ? measured[i]!.size.w : measured[i]!.size.h;
      return crossExtent - capacityCross > EPSILON;
    });

    if (mainOverflow || scanCrossOverflow) {
      anyOverflow = true;
      for (const occupant of occupants) {
        if (nextRung(buildDegradableState(occupant, template)) !== null) {
          candidates.push({ state: occupant, zoneId: zone.id });
        }
      }
    }
  }

  return { anyOverflow, candidates };
}

function allocate(
  attempted: readonly AllocState[],
  zones: readonly Zone[],
  template: Template,
  surface: NormalisedSurface,
  measurer: TextMeasurer,
  diagnostics: DiagnosticsBuilder,
): { iterations: number; constrained: boolean } {
  let iteration = 0;

  while (iteration < MAX_ITERATIONS) {
    const { anyOverflow, candidates } = detectOverflow(attempted, zones, template, surface, measurer);

    if (!anyOverflow) {
      return { iterations: iteration, constrained: false };
    }

    if (candidates.length === 0) {
      // Every occupant of every overflowing zone is out of rungs: fixed and
      // shrinkable elements have hit their floor with nowhere left to
      // reflow to, and nothing droppable remains to give up. §10.5.
      return { iterations: iteration, constrained: true };
    }

    const victimSummary = selectVictim(
      candidates.map((c) => ({
        id: c.state.element.id,
        role: c.state.element.role,
        priority: c.state.element.priority,
        rungsApplied: c.state.appliedRungs.length,
      })),
    );
    // candidates is non-empty (checked above), so selectVictim cannot return null.
    const victimId = victimSummary!.id;
    const victimEntry = candidates.find((c) => c.state.element.id === victimId)!;
    const rung = nextRung(buildDegradableState(victimEntry.state, template));
    // The candidate was only added if nextRung was non-null at scan time;
    // nothing between then and now changes its own state, so this holds.
    const note = describeRungApplication(victimEntry.state, rung!, victimEntry.zoneId);
    applyRung(victimEntry.state, rung!);

    if (rung === 'DROP') {
      diagnostics.recordDrop(victimEntry.state.element.id, 'exhausted-ladder', iteration);
    }
    diagnostics.recordRung(victimEntry.state.element.id, rung!, iteration, note);

    iteration += 1;
  }

  // A bounded loop turns a potential infinite-loop bug into a loud, early
  // failure instead of a frozen tab (§8.6). In development this should
  // never legitimately happen for ≤8 elements, so it throws; in production
  // it degrades to the same honest 'constrained' status §10.5 already
  // covers, rather than hanging the page.
  if (import.meta.env.DEV) {
    throw new AllocationLoopExceededError(
      `Allocation did not converge within ${MAX_ITERATIONS} iterations — this indicates a bug in the ` +
        `degradation ladder, not a legitimately difficult layout.`,
    );
  }
  return { iterations: iteration, constrained: true };
}

// §10.5 — the 'constrained' fallback. Every rung the ladder offers has
// already been exhausted by the time this runs (allocate() only returns
// `constrained: true` once no candidate has any rung left), yet a zone can
// still be too small for what survived in it. Clipping is never acceptable,
// so as a last, explicitly-flagged resort this scales every surviving
// occupant of that specific zone down by one uniform factor — proportional,
// not per-element — just enough that they tile the zone without overlapping.
// It is a documented compromise on an impossible surface, not a hidden one:
// resolve() marks the whole layout 'constrained' whenever this engages.
function fitToZoneByForce(
  measured: readonly { size: Size; lines: number }[],
  mainSizes: readonly number[],
  gapPx: number,
  capacityMain: number,
): { size: Size; lines: number }[] {
  const occupantCount = mainSizes.length;
  const gapsTotal = gapPx * Math.max(0, occupantCount - 1);
  const occupantBudget = Math.max(0, capacityMain - gapsTotal);
  const occupantTotal = mainSizes.reduce((sum, v) => sum + v, 0);
  if (occupantTotal <= 0) return [...measured];
  const factor = clamp(occupantBudget / occupantTotal, 0, 1);
  return measured.map((m) => ({
    size: { w: px(m.size.w * factor), h: px(m.size.h * factor) },
    lines: m.lines,
  }));
}

function position(
  states: readonly AllocState[],
  excludedElements: readonly AdElement[],
  zones: readonly Zone[],
  template: Template,
  surface: NormalisedSurface,
  measurer: TextMeasurer,
  constrained: boolean,
): { elements: Record<string, LayoutEntry>; resolvedZones: ResolvedZone[] } {
  const result: Record<string, LayoutEntry> = {};

  for (const element of excludedElements) {
    result[element.id] = { placed: false, id: element.id, role: element.role, reason: 'not-in-ambition' };
  }
  for (const state of states) {
    if (state.dropped) {
      result[state.element.id] = {
        placed: false,
        id: state.element.id,
        role: state.element.role,
        reason: state.dropReason ?? 'exhausted-ladder',
      };
    }
  }

  for (const zone of zones) {
    const occupants = states.filter((s) => !s.dropped && currentZoneId(s, template) === zone.id);
    if (occupants.length === 0) continue;

    let measured = occupants.map((s) => measureOccupant(s, zone, surface, measurer));
    let mainSizes = measured.map((m) => (zone.flow === 'stack-y' ? m.size.h : m.size.w));
    const capacityMain = zone.flow === 'stack-y' ? zone.rect.h : zone.rect.w;
    const capacityCross = zone.flow === 'stack-y' ? zone.rect.w : zone.rect.h;
    const totalMainBeforeFit =
      mainSizes.reduce((sum, v) => sum + v, 0) + zone.gapPx * Math.max(0, occupants.length - 1);

    if (constrained && totalMainBeforeFit - capacityMain > EPSILON) {
      measured = fitToZoneByForce(measured, mainSizes, zone.gapPx, capacityMain);
      mainSizes = measured.map((m) => (zone.flow === 'stack-y' ? m.size.h : m.size.w));
    }

    // Zones tile the usable rect exactly in float precision (splitRect,
    // §5.1), so zone N's far edge and zone N+1's near edge are the exact
    // same number before rounding. Flooring each zone's own far edge here,
    // once, gives every occupant in every zone the same shared, consistent
    // boundary to clamp against below — which is what guarantees two
    // occupants in neighbouring zones can only ever touch, never overlap,
    // regardless of how an individual occupant's own ceil-rounded size
    // happened to fall relative to its zone's capacity.
    const zoneFarX = Math.floor(zone.rect.x + zone.rect.w);
    const zoneFarY = Math.floor(zone.rect.y + zone.rect.h);

    const crossSizes = measured.map((m) => (zone.flow === 'stack-y' ? m.size.w : m.size.h));
    const totalMain = mainSizes.reduce((sum, v) => sum + v, 0) + zone.gapPx * Math.max(0, occupants.length - 1);
    const leftoverMain = Math.max(0, capacityMain - totalMain);
    // The same `align` value governs leftover space on both axes: cross-axis
    // alignment is what §8.7 describes, and we additionally use it to place
    // an undersized occupant block within its zone's main-axis span (e.g. a
    // lone CTA centred rather than pinned to the zone's leading edge). One
    // alignment concept applied twice reads more simply than two separate
    // controls would, for a difference that only shows up when content
    // doesn't fill its zone.
    let cursor = zone.align === 'center' ? leftoverMain / 2 : zone.align === 'end' ? leftoverMain : 0;

    occupants.forEach((state, i) => {
      const size = measured[i]!.size;
      const lines = measured[i]!.lines;
      const mainSize = mainSizes[i]!;
      const crossSize = crossSizes[i]!;
      const leftoverCross = Math.max(0, capacityCross - crossSize);
      const crossOffset = zone.align === 'center' ? leftoverCross / 2 : zone.align === 'end' ? leftoverCross : 0;

      const rawRect: Rect =
        zone.flow === 'stack-y'
          ? { x: px(zone.rect.x + crossOffset), y: px(zone.rect.y + cursor), w: size.w, h: size.h }
          : { x: px(zone.rect.x + cursor), y: px(zone.rect.y + crossOffset), w: size.w, h: size.h };

      // Round once, here, at the very end — floor position and ceil size so
      // rounding only ever shrinks the gap between elements, never creates
      // a new overlap (§8.7).
      const roundedX = Math.floor(rawRect.x);
      const roundedY = Math.floor(rawRect.y);

      // ...except that ceiling alone isn't enough on its own: an occupant
      // whose unrounded size lands a fraction of a pixel under its zone's
      // capacity still gets ceiled a full pixel past that zone's own
      // (identically floored) far edge, landing exactly on top of whatever
      // the next zone placed at that same boundary. Clamping the ceiled
      // size back down to the zone's floored far edge is what actually
      // closes that gap — this is the fix for the fuzz suite's "hero"/
      // "headline" and "headline"/"cta" 1px overlaps, both of which were
      // this exact boundary-rounding drift, not a sizing bug.
      const rect: Rect = {
        x: px(roundedX),
        y: px(roundedY),
        w: px(Math.max(0, Math.min(Math.ceil(rawRect.w), zoneFarX - roundedX))),
        h: px(Math.max(0, Math.min(Math.ceil(rawRect.h), zoneFarY - roundedY))),
      };

      const placed: PlacedElement = {
        placed: true,
        id: state.element.id,
        role: state.element.role,
        rect,
        zone: zone.id,
        appliedRungs: state.appliedRungs,
        ...(state.element.type === 'text'
          ? {
              typography: {
                fontPx: state.scale,
                lines,
                truncated: state.ellipsisApplied || lines < state.element.maxLines,
              },
            }
          : {}),
      };
      result[state.element.id] = placed;

      cursor += mainSize + zone.gapPx;
    });
  }

  const resolvedZones: ResolvedZone[] = zones.map((z) => ({ id: z.id, rect: z.rect }));
  return { elements: result, resolvedZones };
}

// ---------------------------------------------------------------------------
// resolve() — the public entry point
// ---------------------------------------------------------------------------

export interface ResolveOptions {
  readonly measurer?: TextMeasurer;
}

// Phase 4's zones tile the usable rect exactly, edge to edge, in float
// precision — but each zone is a separate object, so rounding two
// neighbouring zones' boundaries independently (floor this one's far edge,
// floor the next one's near edge) can lose up to a pixel of the TRUE
// available room on each side, even though both roundings start from what
// is mathematically the same float. That combined loss is exactly what
// produced two different 1px false positives during fuzzing: an occupant
// clamped against its own zone's independently-floored far edge, clamped
// below a hard floor it had genuinely already met in the unrounded layout.
//
// The fix is to round the zone boundaries ONCE, as a set, immediately
// after partitioning — before any demand, allocation, or positioning math
// touches them — using a running integer cursor along the template's main
// axis: each zone's rounded far edge becomes the next zone's rounded near
// edge, by construction, so two zones can never disagree about where their
// shared boundary sits. Every template's `partition` produces zones that
// are all sequential along a single axis (§9), which is what makes this
// one straightforward pass correct for all five of them; the cross axis
// has no neighbours to reconcile with, so it only needs its own two edges
// floored once.
function snapZonesToPixelGrid(zones: readonly Zone[], mainAxis: 'x' | 'y', usable: Rect): Zone[] {
  const crossStart = Math.floor(mainAxis === 'x' ? usable.y : usable.x);
  const crossFar = Math.floor(mainAxis === 'x' ? usable.y + usable.h : usable.x + usable.w);
  const crossSize = Math.max(0, crossFar - crossStart);

  let mainCursor = Math.floor(mainAxis === 'x' ? usable.x : usable.y);

  return zones.map((zone) => {
    const rawFar = mainAxis === 'x' ? zone.rect.x + zone.rect.w : zone.rect.y + zone.rect.h;
    const roundedFar = Math.round(rawFar);
    const mainSize = Math.max(0, roundedFar - mainCursor);
    const rect: Rect =
      mainAxis === 'x'
        ? { x: px(mainCursor), y: px(crossStart), w: px(mainSize), h: px(crossSize) }
        : { x: px(crossStart), y: px(mainCursor), w: px(crossSize), h: px(mainSize) };
    mainCursor = roundedFar;
    return { ...zone, rect };
  });
}

function describeClassification(c: Classification): string {
  return (
    `aspect ${c.aspect.toFixed(2)} -> '${c.aspectClass}'; ` +
    `shorter side ${Math.round(c.minSidePx)}px -> '${c.scaleClass}'`
  );
}

export function resolve<S extends AdSpec>(
  spec: S,
  surfaceProfile: SurfaceProfile,
  options: ResolveOptions = {},
): ResolvedLayout<ElementIdOf<S>> {
  const start = nowMs();
  const measurer = options.measurer ?? estimateMeasurer;
  const diagnostics = new DiagnosticsBuilder();

  // Phase 0
  const surface = normaliseSurface(surfaceProfile);
  diagnostics.note(
    'normalise',
    `usable area ${Math.round(surface.usable.w)}×${Math.round(surface.usable.h)}px after safe area`,
  );

  // Phase 1
  const classification = classify(surface.usable);
  diagnostics.note('classify', describeClassification(classification));

  // Phase 2
  const templateId = selectTemplate(classification.aspectClass, classification.scaleClass);
  const template = getTemplate(templateId);
  diagnostics.note('select', `template '${templateId}' selected for aspect class '${classification.aspectClass}'`);

  // Phase 4 (zones depend only on the template + usable rect, not on demand)
  const rawZones = template.partition(surface.usable, {
    aspectClass: classification.aspectClass,
    scaleClass: classification.scaleClass,
  });
  const zones = snapZonesToPixelGrid(rawZones, template.mainAxis, surface.usable);
  diagnostics.note('partition', `${zones.length} zone(s): ${zones.map((z) => z.id).join(', ')}`);

  // Phase 3 — compute demand only for elements this template is even
  // ambitious about at this scale class. A role absent from every ambition
  // list is excluded outright: it was never attempted, not dropped.
  const ambitiousRoles = new Set<Role>(template.ambition[classification.scaleClass]);
  const states: AllocState[] = [];
  const excluded: AdElement[] = [];

  for (const element of spec.elements) {
    if (!ambitiousRoles.has(element.role)) {
      excluded.push(element);
      diagnostics.note(
        'demand',
        `"${element.id}" excluded: role '${element.role}' is not in ambition for template ` +
          `'${templateId}' at scale '${classification.scaleClass}'`,
      );
      continue;
    }
    const demand = computeDemand(element, surface, measurer);
    if (demand.floorReason) {
      diagnostics.note('demand', `"${element.id}": ${demand.floorReason}`);
    }
    states.push({
      element,
      demand,
      scale: demand.idealScale,
      maxLines: element.type === 'text' ? element.maxLines : 0,
      ellipsisApplied: false,
      zoneIndex: 0,
      dropped: false,
      dropReason: null,
      appliedRungs: [],
    });
  }

  // Phase 5
  const { iterations, constrained } = allocate(states, zones, template, surface, measurer, diagnostics);

  // Phase 6
  const { elements, resolvedZones } = position(states, excluded, zones, template, surface, measurer, constrained);

  const anyDegraded = states.some((s) => s.appliedRungs.length > 0);
  let status: ResolvedLayout['status'] = constrained ? 'constrained' : anyDegraded ? 'degraded' : 'ok';

  // Phase 7 — the standalone invariant checker (validate.ts). This runs on
  // every resolve, not just in tests: it is a second, independent pass over
  // the FINAL geometry, catching anything the allocation loop's own
  // bookkeeping might have missed rather than trusting that bookkeeping to
  // have been correct.
  const violations = validateLayout(spec, { elements, surface });
  const errorViolations = violations.filter((v) => v.severity === 'error');

  // A tap-target, text, or scan-integrity floor can end up violated by a
  // genuinely impossible surface through more than one path: the §10.5
  // forced-fit fallback (fitToZoneByForce, above) after the main-axis
  // ladder is exhausted, OR — as the fuzz suite (§16.3) found — a surface
  // whose usable rect is simply narrower on the CROSS axis than a fixed
  // element's own tap floor, which `allocate()`'s own overflow bookkeeping
  // never sees (clampCrossAxis resizes silently; it doesn't register as a
  // ladder-triggering overflow). Rather than special-case every path that
  // can produce this, any floor violation is treated as the same
  // documented, acceptable compromise of an impossible surface. Overlap
  // and out-of-bounds are a different matter: §10.5 is explicit that
  // clipping is "never acceptable," so those two kinds always count as
  // unexpected regardless of how the surface got here.
  const isDocumentedFloorCompromise = (v: Violation) => v.kind !== 'overlap' && v.kind !== 'out-of-bounds';
  const unexpectedViolations = errorViolations.filter((v) => !isDocumentedFloorCompromise(v));

  if (errorViolations.length > 0) {
    status = 'constrained';
  }
  if (unexpectedViolations.length > 0 && import.meta.env.DEV) {
    throw new LayoutInvariantError(unexpectedViolations);
  }

  const resolveMs = nowMs() - start;
  const diag = diagnostics.build(
    {
      aspect: classification.aspect,
      aspectClass: classification.aspectClass,
      scaleClass: classification.scaleClass,
      templateId,
    },
    iterations,
    resolveMs,
    violations,
  );

  return {
    surface,
    templateId,
    aspectClass: classification.aspectClass,
    scaleClass: classification.scaleClass,
    elements: elements as Readonly<Record<ElementIdOf<S>, LayoutEntry>>,
    zones: resolvedZones,
    diagnostics: diag,
    status,
  };
}

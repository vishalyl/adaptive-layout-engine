// The resolver. One pure function: resolve(spec, surface) -> layout.
//
//   0  Normalise   surface -> usable rect, content rect, gaps, hard floors
//   1  Classify    usable rect's aspect -> aspect class
//   2  Select      aspect class -> template tree (templates.ts)
//   3  Demand      per element: protected (starting) size and hard floor
//   4  Place       contrast-aware starting slot for brand marks
//   5  Degrade     loop: solve the box model (box-model.ts); while anything
//                  overflows, take ONE step on ONE element — see below
//   6  Reclaim     undo any step the final layout no longer needs
//   7  Grow        if nothing was degraded, scale type up for big surfaces
//   8  Position    boxes -> rounded element rects, typography, plates
//   9  Validate    independent invariant check (validate.ts)
//
// THE RULE (phase 5). Every element starts at its protected size in its
// first preferred slot. While the layout overflows:
//
//   * Resolve width before height. A text block's height depends on its
//     width, never the reverse, so horizontal overflow is fixed first.
//   * For that axis, walk priority bands from worst (5) to best (1). In a
//     band, for each element, find its GENTLEST ladder step (degradation.ts)
//     that measurably reduces the overflow; steps that wouldn't help are
//     skipped, never taken. The first band where anyone has such a step
//     supplies the victim (ties: gentlest step, then fewer steps taken,
//     then role).
//   * Apply that one step and re-solve.
//
// So no element is ever degraded while a worse-priority element could
// still have helped, no step is ever taken that doesn't reduce the
// overflow, and every size change in the output is a logged step. If no
// element anywhere has a helpful step left, the layout is 'constrained'
// and the remaining overflow is squeezed proportionally — never clipped.

import type { AdElement, AdSpec, ButtonElement, ImageElement, Role, TextElement } from './spec';
import type { ElementIdOf } from './spec';
import type { Interaction, SurfaceProfile, Viewing } from './engine/surface';
import { classify, type AspectClass } from './engine/classify';
import { getTemplate, selectTemplate, type Template, type TemplateId } from './engine/templates';
import {
  availableRungs,
  ROLE_SUFFER_RANK,
  selectVictim,
  type DegradableState,
  type DropReason,
  type Rung,
} from './engine/degradation';
import { DiagnosticsBuilder, type Diagnostics, type Violation } from './engine/diagnostics';
import { estimateMeasurer, type TextMeasurer } from './engine/measure';
import { TEXT_WIDTH_SAFETY_MARGIN_PX, textPaddingFor } from './engine/textChrome';
import { LayoutInvariantError, validateLayout } from './engine/validate';
import { insetRect, px, type Rect, type Size } from './engine/types';
import { OVERFLOW_EPSILON, solveBoxes, type Align, type FRect, type LeafModel, type Solution } from './engine/box-model';
import {
  DEFAULT_MIN_CONTRAST_RATIO,
  evaluateContrast,
  plateFor,
  type BackdropPatch,
  type ContrastOutcome,
  type HexColor,
} from './engine/contrast';

// ---------------------------------------------------------------------------
// Output types — what a renderer consumes.
// ---------------------------------------------------------------------------

export interface Typography {
  readonly fontPx: number;
  readonly lines: number;
  // True when content was actually cut; the renderer must show an ellipsis.
  readonly truncated: boolean;
  // Horizontal alignment of the text inside its rect.
  readonly align: Align;
}

export interface PlacedElement {
  readonly placed: true;
  readonly id: string;
  readonly role: Role;
  readonly rect: Rect;
  // The template slot it ended up in.
  readonly zone: string;
  // Present for text and button elements.
  readonly typography?: Typography;
  readonly appliedRungs: readonly Rung[];
  // Present only for elements that declared a `markColor`. When
  // `contrast.plate` is non-null the renderer must paint it behind the mark.
  readonly contrast?: ContrastOutcome;
}

export interface DroppedElement {
  readonly placed: false;
  readonly id: string;
  readonly role: Role;
  readonly reason: DropReason;
  readonly appliedRungs: readonly Rung[];
}

export type LayoutEntry = PlacedElement | DroppedElement;

export interface ResolvedZone {
  readonly id: string;
  readonly rect: Rect;
}

// Phase 0's output — the ONLY place in the engine that reads
// `Interaction.mode` or `Viewing.distance`.
export interface NormalisedSurface {
  readonly full: Rect;
  readonly usable: Rect;
  // `usable` minus an inner margin; everything is laid out inside it.
  readonly content: Rect;
  readonly gap: { readonly x: number; readonly y: number };
  readonly minTapTargetPx: number | null;
  readonly minTextPx: number;
  readonly canReceiveTouch: boolean;
  readonly densityScale: number;
  readonly backdrops: readonly BackdropPatch[];
  readonly minContrastRatio: number;
  readonly emphasis: DistanceEmphasis;
}

// How much bigger the glance elements start at this viewing distance — see
// DISTANCE_EMPHASIS below.
export interface DistanceEmphasis {
  readonly badge: number;
  readonly brandArea: number;
  readonly scanShare: number;
}

export interface ResolvedLayout<Ids extends string = string> {
  readonly surface: NormalisedSurface;
  readonly templateId: TemplateId;
  readonly aspectClass: AspectClass;
  readonly elements: Readonly<Record<Ids, LayoutEntry>>;
  readonly zones: readonly ResolvedZone[];
  // Multiplier applied to every text/button size by phase 7 (1 = none).
  readonly typeScale: number;
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
// Tunable constants, all in one place.
// ---------------------------------------------------------------------------

const MIN_LEGIBLE_TEXT_PX = 12; // resolved text floor is max(surface floor, 12)
// Per-role readability floors: text never shrinks below min(this, its own
// ideal) even where the surface would allow it.
const COMFORTABLE_FONT_PX: Readonly<Record<Role, number>> = {
  primary: 18,
  secondary: 14,
  incentive: 14,
  legal: 12,
  action: 15,
  hero: 0,
  branding: 0,
  scan: 0,
};
const LINE_HEIGHT = 1.25;
const SHRINK_STEP_FRACTION = 0.1; // one SHRINK_STEP = 10% of the ideal→floor range
const TAP_HEIGHT_FONT_MULTIPLIER = 2.2; // button height = max(tap floor, font × 2.2)
// Protected image sizes, as a share of the content area. An image starts
// here; shrinking below it is a degradation step, and a hero also GROWS
// into any space left once everything fits.
const IMAGE_PROTECTED_AREA: Partial<Record<Role, number>> = { hero: 0.08, branding: 0.006 };
const IMAGE_PROTECTED_AREA_DEFAULT = 0.03;
// The badge, the brand lockup and the QR are "glance" elements: read in a
// moment, often from further away than the copy. Up close they stay as
// authored; at a distance each starts bigger. Phase 0 turns the viewing
// distance into these numbers, so nothing downstream reads the distance.
//   badge      the badge font starts at this multiple of its authored size
//              and of the surface's text floor, whichever is larger — so it
//              reads above the body copy rather than level with it
//   brandArea  multiplier on the logo's protected share of the content area
//   scanShare  the QR's starting side as a share of √(content area); 0 keeps
//              it at its module floor
const DISTANCE_EMPHASIS: Readonly<Record<Viewing['distance'], DistanceEmphasis>> = {
  near: { badge: 1, brandArea: 1, scanShare: 0 },
  mid: { badge: 1.3, brandArea: 2.2, scanShare: 0.18 },
  far: { badge: 1.3, brandArea: 4, scanShare: 0.23 },
};
// A lockup shares its header row with the badge, so its height is capped by
// the WIDTH it has to share: on a narrow column it stays compact instead of
// growing with the column's height and crowding the badge off the row.
const BRAND_MAX_SHORT_SIDE_SHARE_OF_WIDTH = 0.06;
// A QR never starts taller than this share of the content's short side, so
// on a thin band it can't swallow the row.
const SCAN_MAX_SHARE_OF_SHORT_SIDE = 0.65;
// Type is authored for a ~480px short side. On bigger surfaces it may grow
// uniformly (preserving hierarchy) up to this factor — but only when
// nothing had to be degraded, and only as far as it still fits.
const TYPE_REFERENCE_SIDE_PX = 480;
const TYPE_GROWTH_MAX = 1.8;
const FONT_FAMILY = 'Archivo, sans-serif'; // passed to the measurer only
const MAX_ITERATIONS = 500; // every ladder is finite; this only guards against bugs
const IMPROVEMENT_EPSILON = 1e-3; // a step "helps" if it reduces overflow by more than this

function clamp(n: number, min: number, max: number): number {
  // Floor wins when min > max: the hard constraint beats the soft ceiling.
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
  // Spacing scales with the surface: 2% of each axis, within sane bounds.
  const gap = { x: clamp(usable.w * 0.02, 6, 40), y: clamp(usable.h * 0.02, 4, 32) };
  const minSide = Math.min(usable.w, usable.h);
  const pad = { x: Math.min(gap.x, minSide * 0.04), y: Math.min(gap.y, minSide * 0.04) };
  const content = insetRect(usable, { top: pad.y, bottom: pad.y, left: pad.x, right: pad.x });

  return {
    full,
    usable,
    content,
    gap,
    minTapTargetPx: resolveInteractionFloor(profile.interaction),
    minTextPx: resolveTextFloor(profile.viewing),
    canReceiveTouch: profile.interaction.mode === 'touch',
    densityScale: profile.densityScale ?? 1,
    backdrops: (profile.backdrop ?? []).map((region) => ({
      rect: { x: px(region.x), y: px(region.y), w: px(region.w), h: px(region.h) },
      color: region.color,
    })),
    minContrastRatio: profile.minContrastRatio ?? DEFAULT_MIN_CONTRAST_RATIO,
    emphasis: DISTANCE_EMPHASIS[profile.viewing.distance],
  };
}

// ---------------------------------------------------------------------------
// Phase 3 — Demand: where each element starts, and the floor it can't cross
// ---------------------------------------------------------------------------

interface Demand {
  // The protected size: text/button font px, image short side px, scan side.
  readonly idealScale: number;
  readonly floorScale: number;
  readonly floorReason: string | null;
  // Text/button only: the size as authored, before any floor raised it.
  // Type growth (phase 7) multiplies THIS, so fine print that a surface
  // floor already lifted doesn't grow again and flatten the hierarchy.
  readonly authoredScale: number;
}

function textDemand(el: TextElement, surface: NormalisedSurface): Demand {
  const surfaceFloor = Math.max(el.minFontPx, surface.minTextPx);
  const comfortable = COMFORTABLE_FONT_PX[el.role];
  const floor = comfortable > 0 ? Math.max(surfaceFloor, Math.min(comfortable, el.idealFontPx)) : surfaceFloor;
  // Only the badge is emphasised with distance; its FLOOR is untouched, so
  // under pressure it can still shrink back to plain legibility.
  const emphasis = el.role === 'incentive' ? surface.emphasis.badge : 1;
  const authored = el.idealFontPx * surface.densityScale * emphasis;
  const ideal = clamp(Math.max(authored, surface.minTextPx * emphasis), floor, el.idealFontPx * 2 * emphasis);
  const reason =
    surfaceFloor > el.minFontPx
      ? `floored at ${Math.round(surfaceFloor)}px by the surface's minimum legible text size`
      : floor > surfaceFloor
        ? `comfortably floored at ${Math.round(floor)}px for role "${el.role}"`
        : null;
  return { idealScale: ideal, floorScale: floor, floorReason: reason, authoredScale: authored };
}

function buttonDemand(el: ButtonElement, surface: NormalisedSurface): Demand {
  // A CTA label is text: the surface's legibility floor applies to it too.
  const floor = Math.max(el.minFontPx, surface.minTextPx);
  const ideal = clamp(el.idealFontPx * surface.densityScale, floor, el.idealFontPx * 2);
  const tap = surface.minTapTargetPx;
  const reasons = [
    floor > el.minFontPx ? `label floored at ${Math.round(floor)}px by the surface's minimum text size` : null,
    tap !== null && tap > floor * TAP_HEIGHT_FONT_MULTIPLIER ? `height floored at ${Math.round(tap)}px by the tap target` : null,
  ].filter((r): r is string => r !== null);
  return {
    idealScale: ideal,
    floorScale: floor,
    floorReason: reasons.length > 0 ? reasons.join('; ') : null,
    authoredScale: el.idealFontPx * surface.densityScale,
  };
}

function imageSizeAtScale(el: ImageElement, shortSide: number): Size {
  return el.intrinsicAspect <= 1
    ? { w: px(shortSide), h: px(shortSide / el.intrinsicAspect) }
    : { w: px(shortSide * el.intrinsicAspect), h: px(shortSide) };
}

function imageDemand(el: ImageElement, surface: NormalisedSurface): Demand {
  const { w: cw, h: ch } = surface.content;
  const isBrand = el.role === 'branding';
  const share = (IMAGE_PROTECTED_AREA[el.role] ?? IMAGE_PROTECTED_AREA_DEFAULT) * (isBrand ? surface.emphasis.brandArea : 1);
  const area = cw * ch * share;
  const a = el.intrinsicAspect;
  let short = a <= 1 ? Math.sqrt(area * a) : Math.sqrt(area / a);
  // Never start larger than the content rect itself.
  const size = imageSizeAtScale(el, short);
  short *= Math.min(1, cw / size.w, ch / size.h);
  if (isBrand) short = Math.min(short, cw * BRAND_MAX_SHORT_SIDE_SHARE_OF_WIDTH);
  const ideal = Math.max(short, el.minShortSidePx);
  return { idealScale: ideal, floorScale: el.minShortSidePx, floorReason: null, authoredScale: ideal };
}

// A QR's floor is its module floor; below it, it stops scanning. Viewed from
// a distance it starts bigger (DISTANCE_EMPHASIS), and may shrink back
// toward the floor under pressure like any image — in whole-pixel modules.
function scanDemand(el: AdElement & { type: 'scan' }, surface: NormalisedSurface): Demand {
  const floor = el.modules * el.minModulePx;
  const { w, h } = surface.content;
  const target = Math.min(surface.emphasis.scanShare * Math.sqrt(w * h), SCAN_MAX_SHARE_OF_SHORT_SIDE * Math.min(w, h));
  const ideal = Math.max(floor, snapToModules(el, target));
  return {
    idealScale: ideal,
    floorScale: floor,
    floorReason: `floored at ${floor}px — a scan target below its module floor stops scanning`,
    authoredScale: ideal,
  };
}

// Round a QR side down to a whole number of pixels per module: a code whose
// modules differ in size by a pixel scans worse than a slightly smaller one.
function snapToModules(el: AdElement & { type: 'scan' }, side: number): number {
  return Math.floor(side / el.modules) * el.modules;
}

function computeDemand(el: AdElement, surface: NormalisedSurface): Demand {
  switch (el.type) {
    case 'text':
      return textDemand(el, surface);
    case 'button':
      return buttonDemand(el, surface);
    case 'image':
      return imageDemand(el, surface);
    case 'scan':
      return scanDemand(el, surface);
  }
}

// ---------------------------------------------------------------------------
// Allocation state and leaf models
// ---------------------------------------------------------------------------

interface AllocState {
  readonly element: AdElement;
  readonly demand: Demand;
  scale: number; // font px (text/button), short side (image), side (scan)
  maxLines: number; // text only: the current line budget
  allowCut: boolean; // text only: content may be cut with an ellipsis
  zoneIndex: number; // index into template.rolePreference[role]
  dropped: boolean;
  appliedRungs: Rung[];
}

function cloneState(s: AllocState): AllocState {
  return { ...s, appliedRungs: [...s.appliedRungs] };
}

interface Ctx {
  readonly template: Template;
  readonly surface: NormalisedSurface;
  readonly measurer: TextMeasurer;
  readonly textCache: Map<string, TextModel>;
}

function slotOf(s: AllocState, template: Template): string | undefined {
  return template.rolePreference[s.element.role][s.zoneIndex];
}

interface TextLayout {
  readonly w: number;
  readonly h: number;
  readonly lines: number;
  readonly truncated: boolean;
}

interface TextModel {
  readonly minW: number;
  readonly maxW: number;
  at(width: number): TextLayout;
}

// Text sizing at a given font, line budget and cut permission. Widths are
// measured by the injected measurer, not estimated from character counts.
function textModel(el: TextElement, font: number, maxLines: number, allowCut: boolean, ctx: Ctx): TextModel {
  const key = `${el.id}|${font}|${maxLines}|${allowCut}`;
  const cached = ctx.textCache.get(key);
  if (cached) return cached;

  const pad = textPaddingFor(el.role);
  const chromeX = 2 * pad.x + TEXT_WIDTH_SAFETY_MARGIN_PX + Math.max(0, el.tracking ?? 0) * el.content.length;
  const chromeY = 2 * pad.y;
  const measure = (maxWidth: number) => ctx.measurer.measure(el.content, font, el.weight, FONT_FAMILY, maxWidth);
  const natural = measure(Number.POSITIVE_INFINITY).width;
  const longestWord = Math.max(
    0,
    ...el.content
      .split(/\s+/)
      .filter((w) => w.length > 0)
      .map((w) => ctx.measurer.measure(w, font, el.weight, FONT_FAMILY, Number.POSITIVE_INFINITY).width),
  );

  // The narrowest width at which the text fits its line budget uncut.
  let minInner = longestWord;
  if (!allowCut && measure(longestWord).lines > maxLines) {
    let lo = longestWord;
    let hi = natural;
    for (let i = 0; i < 18 && hi - lo > 0.25; i++) {
      const mid = (lo + hi) / 2;
      if (measure(mid).lines <= maxLines) hi = mid;
      else lo = mid;
    }
    minInner = hi;
  }

  const atCache = new Map<number, TextLayout>();
  const model: TextModel = {
    minW: minInner + chromeX,
    maxW: Math.max(minInner, natural) + chromeX,
    at(width) {
      const hit = atCache.get(width);
      if (hit) return hit;
      const inner = Math.max(0, width - chromeX);
      // A hair of tolerance so a box sized to exactly the natural width
      // doesn't wrap on floating-point noise.
      const m = measure(inner + 0.01);
      const lines = Math.max(1, Math.min(m.lines, maxLines));
      const layout: TextLayout = {
        w: Math.min(m.width, inner) + chromeX,
        h: lines * font * LINE_HEIGHT + chromeY,
        lines,
        truncated: m.lines > maxLines || m.width > inner + 0.5,
      };
      atCache.set(width, layout);
      return layout;
    },
  };
  ctx.textCache.set(key, model);
  return model;
}

function buttonSize(el: ButtonElement, font: number, ctx: Ctx): Size {
  const tapFloor = ctx.surface.minTapTargetPx ?? 0;
  const label = ctx.measurer.measure(el.label, font, 700, FONT_FAMILY, Number.POSITIVE_INFINITY);
  const height = Math.max(tapFloor, font * TAP_HEIGHT_FONT_MULTIPLIER);
  const natural = label.width + 2 * el.paddingRatio * font + TEXT_WIDTH_SAFETY_MARGIN_PX;
  // Tap floor on BOTH axes, but only where something can be tapped.
  return { w: px(ctx.surface.minTapTargetPx !== null ? Math.max(natural, tapFloor) : natural), h: px(height) };
}

function leafFor(s: AllocState, ctx: Ctx): LeafModel {
  const el = s.element;
  switch (el.type) {
    case 'text': {
      const m = textModel(el, s.scale, s.maxLines, s.allowCut, ctx);
      return { key: el.id, minW: m.minW, maxW: m.maxW, size: (w) => m.at(w) };
    }
    case 'button': {
      const size = buttonSize(el, s.scale, ctx);
      return { key: el.id, minW: size.w, maxW: size.w, size: () => size };
    }
    case 'image': {
      const size = imageSizeAtScale(el, s.scale);
      const base = { key: el.id, minW: size.w, maxW: size.w, size: () => size };
      // Only the hero grows into leftover space; a logo filling a slot
      // would read as a mistake, not as emphasis.
      return el.role === 'hero'
        ? { ...base, maxHeightAt: (w: number) => Math.max(size.h, w / el.intrinsicAspect) }
        : base;
    }
    case 'scan': {
      const size = { w: px(s.scale), h: px(s.scale) };
      return { key: el.id, minW: s.scale, maxW: s.scale, size: () => size };
    }
  }
}

function solve(states: readonly AllocState[], ctx: Ctx): Solution {
  const bySlot = new Map<string, LeafModel[]>();
  for (const s of states) {
    if (s.dropped) continue;
    const slotId = slotOf(s, ctx.template);
    if (!slotId) continue;
    const list = bySlot.get(slotId) ?? [];
    list.push(leafFor(s, ctx));
    bySlot.set(slotId, list);
  }
  return solveBoxes(ctx.template.root, bySlot, ctx.surface.content, ctx.surface.gap);
}

// ---------------------------------------------------------------------------
// Phase 5 — Degrade
// ---------------------------------------------------------------------------

function degradable(s: AllocState, template: Template): DegradableState {
  const isText = s.element.type === 'text';
  return {
    degradability: s.element.degradability,
    isText,
    atFloor: s.scale <= s.demand.floorScale + 1e-9,
    canCut: isText && !s.allowCut,
    linesAboveOne: isText && s.maxLines > 1,
    zonesRemaining: s.zoneIndex + 1 < template.rolePreference[s.element.role].length,
  };
}

function applyRung(s: AllocState, rung: Rung, targetZone?: number): void {
  switch (rung) {
    case 'SHRINK_STEP': {
      const step = (s.demand.idealScale - s.demand.floorScale) * SHRINK_STEP_FRACTION;
      const next = s.scale - step;
      // Snap the last partial step onto the floor.
      s.scale = next - s.demand.floorScale < step * 0.5 ? s.demand.floorScale : next;
      // A QR steps down whole modules at a time; its floor is a whole number
      // of modules, so this never takes it below the floor.
      if (s.element.type === 'scan') s.scale = Math.max(s.demand.floorScale, snapToModules(s.element, s.scale));
      break;
    }
    case 'ELLIPSIS':
      s.allowCut = true;
      break;
    case 'TRUNCATE_LINE':
      s.maxLines = Math.max(1, s.maxLines - 1);
      s.allowCut = true;
      break;
    case 'REFLOW':
      s.zoneIndex = targetZone ?? s.zoneIndex + 1;
      break;
    case 'DROP':
      s.dropped = true;
      break;
  }
  s.appliedRungs.push(rung);
}

interface Proposal {
  readonly state: AllocState;
  // The rung that made the difference, preceded by any cut it depends on.
  readonly rungs: readonly Rung[];
  // Every state this step changes (the victim, plus slot-mates on a joint
  // step) mapped to what it becomes.
  readonly trials: ReadonlyMap<AllocState, AllocState>;
  // Slot-mates degraded together with the victim (joint step), if any.
  readonly partners: readonly AllocState[];
  readonly after: Solution;
}

function withReplaced(states: readonly AllocState[], original: AllocState, replacement: AllocState): AllocState[] {
  return states.map((s) => (s === original ? replacement : s));
}

// Does `after` reduce the overflow being resolved? For height, a step must
// normally not create horizontal overflow (width is resolved first). Only
// if NO element has such a step does the loop fall back to `relaxed`: a
// height step that creates some horizontal overflow is accepted when it
// reduces the TOTAL — e.g. a price moving up beside the CTA saves a whole
// row but needs the CTA a little narrower, which the next (width)
// iteration then takes care of, in priority order as always.
function helps(axis: 'x' | 'y', before: Solution, after: Solution, relaxed: boolean): boolean {
  if (axis === 'x') return after.excessX < before.excessX - IMPROVEMENT_EPSILON;
  if (after.excessY >= before.excessY - IMPROVEMENT_EPSILON) return false;
  if (!relaxed) return after.excessX <= before.excessX + IMPROVEMENT_EPSILON;
  return after.excessX + after.excessY < before.excessX + before.excessY - IMPROVEMENT_EPSILON;
}

// The element's gentlest step that actually helps, or null. Steps that
// would not reduce the overflow are skipped — never taken.
//
// Two refinements keep single steps from getting stuck:
//
// * A cut (ELLIPSIS / TRUNCATE_LINE) can be useless on its own yet be
//   exactly what makes a MOVE possible — a price that won't fit beside the
//   CTA uncut fits there once it may end in "…". Cuts that didn't help alone
//   are carried into the REFLOW trial; if that bundle helps it is one step.
//
// * A row is as tall as its tallest member, so shrinking or dropping ONE of
//   two equally tall slot-mates saves nothing. When a step doesn't help
//   alone, it is tried JOINTLY on the element and every slot-mate of equal
//   or worse priority that can take the same step. That never touches
//   anything more important than the victim.
function propose(
  s: AllocState,
  axis: 'x' | 'y',
  relaxed: boolean,
  current: Solution,
  states: readonly AllocState[],
  ctx: Ctx,
): Proposal | null {
  const prefs = ctx.template.rolePreference[s.element.role];
  const slotId = slotOf(s, ctx.template);
  const slotMates = states.filter(
    (o) => o !== s && !o.dropped && slotOf(o, ctx.template) === slotId && o.element.priority >= s.element.priority,
  );

  const evaluate = (trials: Map<AllocState, AllocState>, rungs: Rung[], partners: AllocState[]): Proposal | null => {
    const after = solve(
      states.map((x) => trials.get(x) ?? x),
      ctx,
    );
    return helps(axis, current, after, relaxed) ? { state: s, rungs, trials, partners, after } : null;
  };
  const single = (from: AllocState, carried: Rung[], rung: Rung, target?: number): Proposal | null => {
    const trial = cloneState(from);
    applyRung(trial, rung, target);
    return evaluate(new Map([[s, trial]]), [...carried, rung], []);
  };
  const joint = (rung: Rung): Proposal | null => {
    const partners = slotMates.filter((o) => availableRungs(degradable(o, ctx.template)).includes(rung));
    if (partners.length === 0) return null;
    const trials = new Map<AllocState, AllocState>();
    for (const o of [s, ...partners]) {
      const trial = cloneState(o);
      applyRung(trial, rung);
      trials.set(o, trial);
    }
    return evaluate(trials, [rung], partners);
  };

  let base = cloneState(s);
  let carried: Rung[] = [];
  for (const rung of availableRungs(degradable(s, ctx.template))) {
    switch (rung) {
      case 'SHRINK_STEP':
      case 'DROP': {
        const p = single(s, [], rung) ?? joint(rung);
        if (p) return p;
        break;
      }
      case 'ELLIPSIS':
      case 'TRUNCATE_LINE': {
        const p = single(base, carried, rung) ?? joint(rung);
        if (p) return p;
        const next = cloneState(base);
        applyRung(next, rung);
        base = next;
        carried = [...carried, rung];
        break;
      }
      case 'REFLOW':
        for (let target = s.zoneIndex + 1; target < prefs.length; target++) {
          const p = single(s, [], rung, target) ?? (carried.length > 0 ? single(base, carried, rung, target) : null);
          if (p) return p;
        }
        break;
    }
  }
  return null;
}

function describeStep(s: AllocState, p: Proposal, axis: 'x' | 'y', before: number, after: number, ctx: Ctx): string {
  const label = `${s.element.role} "${s.element.id}" (priority ${s.element.priority})`;
  const dim = axis === 'x' ? 'horizontal' : 'vertical';
  const delta = `${dim} overflow ${before.toFixed(1)}px → ${after.toFixed(1)}px`;
  const trial = p.trials.get(s)!;
  const what = p.rungs.map((rung) => {
    switch (rung) {
      case 'SHRINK_STEP':
        return 'shrunk one step';
      case 'ELLIPSIS':
        return `allowed to end in "…" at ${trial.maxLines} line(s)`;
      case 'TRUNCATE_LINE':
        return `cut to ${trial.maxLines} line(s)`;
      case 'REFLOW':
        return `moved to slot "${ctx.template.rolePreference[s.element.role][trial.zoneIndex]}"`;
      case 'DROP':
        return 'dropped';
    }
  });
  const together =
    p.partners.length > 0
      ? ` together with ${p.partners.map((o) => `"${o.element.id}"`).join(', ')} (same slot; neither step helps alone)`
      : '';
  return `${label} ${what.join(' and ')}${together}: ${delta}.`;
}

function degrade(
  states: AllocState[],
  ctx: Ctx,
  diagnostics: DiagnosticsBuilder,
  history: Map<string, AllocState[]>,
): { iterations: number; constrained: boolean } {
  let iteration = 0;
  while (iteration < MAX_ITERATIONS) {
    const current = solve(states, ctx);
    const overX = current.excessX > OVERFLOW_EPSILON;
    const overY = current.excessY > OVERFLOW_EPSILON;
    if (!overX && !overY) return { iterations: iteration, constrained: false };

    const live = states.filter((s) => !s.dropped);
    const bands = [...new Set(live.map((s) => s.element.priority))].sort((a, b) => b - a);
    const search = (axis: 'x' | 'y', relaxed: boolean) => {
      const blocked: string[] = [];
      for (const band of bands) {
        const inBand = live.filter((s) => s.element.priority === band);
        const found = inBand
          .map((s) => propose(s, axis, relaxed, current, states, ctx))
          .filter((p): p is Proposal => p !== null);
        if (found.length > 0) return { axis, proposals: found, blocked, relaxed };
        blocked.push(...inBand.map((s) => s.element.id));
      }
      return { axis, proposals: [] as Proposal[], blocked, relaxed };
    };
    // Width first. If nothing can reduce the horizontal overflow (a surface
    // narrower than something that can't shrink further), don't give up:
    // carry on resolving height, so everything that CAN be fixed is — the
    // layout is then 'constrained' only by what genuinely can't.
    let found = overX ? search('x', false) : null;
    if ((!found || found.proposals.length === 0) && overY) {
      found = search('y', false);
      if (found.proposals.length === 0) found = search('y', true);
    }
    if (!found || found.proposals.length === 0) return { iterations: iteration, constrained: true };
    const { axis, proposals, blocked, relaxed } = found;

    const victimSummary = selectVictim(
      proposals.map((p) => ({
        id: p.state.element.id,
        role: p.state.element.role,
        priority: p.state.element.priority,
        rung: p.rungs[p.rungs.length - 1]!,
        rungsApplied: p.state.appliedRungs.length,
      })),
    )!;
    const chosen = proposals.find((p) => p.state.element.id === victimSummary.id)!;
    const s = chosen.state;
    const rung = chosen.rungs[chosen.rungs.length - 1]!;
    const before = axis === 'x' ? current.excessX : current.excessY;
    const after = axis === 'x' ? chosen.after.excessX : chosen.after.excessY;
    const createdX = chosen.after.excessX - current.excessX;
    const note =
      describeStep(s, chosen, axis, before, after, ctx) +
      (relaxed && createdX > IMPROVEMENT_EPSILON
        ? ` No step fit without widening something, so this one was taken: it adds ${createdX.toFixed(1)}px of horizontal overflow, fixed next.`
        : '');

    for (const [original, trial] of chosen.trials) {
      const snapshots = history.get(original.element.id) ?? [];
      snapshots.push(cloneState(original));
      history.set(original.element.id, snapshots);
      Object.assign(original, cloneState(trial));
      if (rung === 'DROP') diagnostics.recordDrop(original.element.id, 'insufficient-space', iteration);
    }
    diagnostics.recordRung({
      id: s.element.id,
      priority: s.element.priority,
      rung,
      bundled: chosen.rungs.slice(0, -1),
      partners: chosen.partners.map((o) => o.element.id),
      atIteration: iteration,
      axis,
      overflowBefore: before,
      overflowAfter: after,
      candidates: proposals.map((p) => ({
        id: p.state.element.id,
        priority: p.state.element.priority,
        rung: p.rungs[p.rungs.length - 1]!,
      })),
      blocked,
      relaxed,
      note,
    });
    iteration += 1;
  }
  if (import.meta.env.DEV) {
    throw new AllocationLoopExceededError(
      `Allocation did not converge within ${MAX_ITERATIONS} iterations — every ladder is finite, so this is a bug.`,
    );
  }
  return { iterations: iteration, constrained: true };
}

// ---------------------------------------------------------------------------
// Phase 6 — Reclaim: undo steps the final layout no longer needs
// ---------------------------------------------------------------------------

// Greedy steps can over-shoot: an element degraded early may turn out not
// to need it once a later step freed space. After the loop converges, try
// to undo each element's most recent step — best priority first, so freed
// space goes to what matters most — keeping any undo that still fits.
function reclaim(
  states: AllocState[],
  ctx: Ctx,
  diagnostics: DiagnosticsBuilder,
  history: Map<string, AllocState[]>,
): void {
  const order = () =>
    [...states].sort(
      (a, b) =>
        a.element.priority - b.element.priority ||
        ROLE_SUFFER_RANK[b.element.role] - ROLE_SUFFER_RANK[a.element.role],
    );
  let changed = true;
  let guard = 0;
  while (changed && guard++ < MAX_ITERATIONS) {
    changed = false;
    for (const s of order()) {
      const snapshots = history.get(s.element.id);
      const previous = snapshots?.[snapshots.length - 1];
      if (!previous) continue;
      const sol = solve(withReplaced(states, s, previous), ctx);
      if (sol.excessX > OVERFLOW_EPSILON || sol.excessY > OVERFLOW_EPSILON) continue;
      const undone = s.appliedRungs[s.appliedRungs.length - 1]!;
      const undoneCount = s.appliedRungs.length - previous.appliedRungs.length;
      Object.assign(s, cloneState(previous));
      snapshots!.pop();
      if (undone === 'DROP') diagnostics.undoDrop(s.element.id);
      diagnostics.recordRestore({
        id: s.element.id,
        rung: undone,
        note:
          `${s.element.role} "${s.element.id}": ${undoneCount > 1 ? `${undone} (with the cut it carried)` : undone} ` +
          `undone — the final layout fits without it.`,
      });
      changed = true;
      break; // restart from the best priority
    }
  }
}

// ---------------------------------------------------------------------------
// Phase 7 — Grow type on big surfaces (only when nothing was degraded)
// ---------------------------------------------------------------------------

function growType(states: AllocState[], ctx: Ctx): number {
  const minSide = Math.min(ctx.surface.content.w, ctx.surface.content.h);
  const gMax = clamp(minSide / TYPE_REFERENCE_SIDE_PX, 1, TYPE_GROWTH_MAX);
  if (gMax <= 1.001) return 1;
  const grown = (s: AllocState, g: number) => Math.max(s.demand.idealScale, s.demand.authoredScale * g);
  const scaled = (g: number) =>
    states.map((s) => (s.element.type === 'text' || s.element.type === 'button' ? { ...s, scale: grown(s, g) } : s));
  const fits = (g: number) => {
    const sol = solve(scaled(g), ctx);
    return sol.excessX <= OVERFLOW_EPSILON && sol.excessY <= OVERFLOW_EPSILON;
  };
  let g = 1;
  if (fits(gMax)) g = gMax;
  else {
    let lo = 1;
    let hi = gMax;
    for (let i = 0; i < 10; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) lo = mid;
      else hi = mid;
    }
    g = lo;
  }
  g = Math.floor(g * 100) / 100;
  for (const s of states) {
    if (s.element.type === 'text' || s.element.type === 'button') s.scale = grown(s, g);
  }
  return g;
}

// ---------------------------------------------------------------------------
// Phase 4 / post-8 — Contrast
// ---------------------------------------------------------------------------

function markColorOf(element: AdElement): HexColor | null {
  return element.type === 'image' && element.markColor !== undefined ? element.markColor : null;
}

function toRect(r: FRect): Rect {
  return { x: px(r.x), y: px(r.y), w: px(r.w), h: px(r.h) };
}

// Start each brand mark in the first preferred slot whose backdrop clears
// the surface's contrast floor. Placement, not degradation: no step is
// spent, and the degradation loop may still move it later for space.
function chooseContrastSlots(states: AllocState[], spec: AdSpec, ctx: Ctx, diagnostics: DiagnosticsBuilder): void {
  const base = spec.background ?? null;
  const { backdrops, minContrastRatio } = ctx.surface;
  for (const s of states) {
    const mark = markColorOf(s.element);
    if (!mark) continue;
    const prefs = ctx.template.rolePreference[s.element.role];
    let chosen: number | null = null;
    let firstRatio: number | null = null;
    for (let i = 0; i < prefs.length; i++) {
      s.zoneIndex = i;
      const leaf = solve(states, ctx).leaves.get(s.element.id);
      if (!leaf) continue;
      const outcome = evaluateContrast(mark, toRect(leaf.box), backdrops, base, minContrastRatio);
      if (!outcome) {
        chosen = 0;
        break;
      }
      if (firstRatio === null) firstRatio = outcome.ratio;
      if (outcome.ratio >= minContrastRatio) {
        chosen = i;
        break;
      }
    }
    const label = `"${s.element.id}"`;
    if (chosen === null) {
      s.zoneIndex = 0;
      diagnostics.note(
        'contrast',
        `${label}: no preferred slot clears ${minContrastRatio}:1 against its backdrop — it keeps ` +
          `slot "${prefs[0]}" and will be plated.`,
      );
    } else {
      s.zoneIndex = chosen;
      if (chosen > 0) {
        diagnostics.note(
          'contrast',
          `${label} placed in slot "${prefs[chosen]}" instead of "${prefs[0]}": ` +
            `${firstRatio?.toFixed(2)}:1 there is below the ${minContrastRatio}:1 floor.`,
        );
      }
    }
  }
}

// After positioning, any mark still below the floor gets a plate: a solid
// fill inside its own rect, so fixing contrast can never cost an overlap.
function attachContrast(
  elements: Record<string, LayoutEntry>,
  spec: AdSpec,
  surface: NormalisedSurface,
  diagnostics: DiagnosticsBuilder,
): void {
  const base = spec.background ?? null;
  for (const element of spec.elements) {
    const mark = markColorOf(element);
    const entry = elements[element.id];
    if (!mark || !entry?.placed) continue;
    const outcome = evaluateContrast(mark, entry.rect, surface.backdrops, base, surface.minContrastRatio);
    if (!outcome) continue;
    const plate = outcome.ratio < surface.minContrastRatio ? plateFor(mark) : null;
    if (plate) {
      diagnostics.note(
        'contrast',
        `"${element.id}" plated with ${plate}: ${outcome.ratio.toFixed(2)}:1 against ${outcome.backdrop} ` +
          `is below the ${surface.minContrastRatio}:1 floor.`,
      );
    }
    elements[element.id] = { ...entry, contrast: { ...outcome, plate } };
  }
}

// ---------------------------------------------------------------------------
// Phase 8 — Position
// ---------------------------------------------------------------------------

// Round EDGES, not sizes: two boxes whose float edges don't overlap can
// never overlap after rounding, and a box inside its parent stays inside.
function roundRect(x: number, y: number, w: number, h: number): Rect {
  const x0 = Math.round(x);
  const y0 = Math.round(y);
  return {
    x: px(x0),
    y: px(y0),
    w: px(Math.max(0, Math.round(x + w) - x0)),
    h: px(Math.max(0, Math.round(y + h) - y0)),
  };
}

function alignOffset(align: Align, free: number): number {
  return align === 'start' ? 0 : align === 'end' ? free : free / 2;
}

function position(
  states: readonly AllocState[],
  sol: Solution,
  ctx: Ctx,
  diagnostics: DiagnosticsBuilder,
): { elements: Record<string, LayoutEntry>; squeezed: boolean } {
  const elements: Record<string, LayoutEntry> = {};
  let squeezed = false;

  for (const s of states) {
    const el = s.element;
    const leaf = s.dropped ? undefined : sol.leaves.get(el.id);
    if (!leaf) {
      elements[el.id] = {
        placed: false,
        id: el.id,
        role: el.role,
        reason: 'insufficient-space',
        appliedRungs: [...s.appliedRungs],
      };
      continue;
    }

    const box = leaf.box;
    let w: number;
    let h: number;
    let typography: Typography | undefined;
    switch (el.type) {
      case 'text': {
        const t = textModel(el, s.scale, s.maxLines, s.allowCut, ctx).at(box.w);
        w = t.w;
        h = t.h;
        typography = { fontPx: s.scale, lines: t.lines, truncated: t.truncated, align: leaf.align };
        break;
      }
      case 'button': {
        const size = buttonSize(el, s.scale, ctx);
        w = size.w;
        h = size.h;
        typography = { fontPx: s.scale, lines: 1, truncated: false, align: 'center' };
        break;
      }
      case 'image': {
        const size = imageSizeAtScale(el, s.scale);
        // The hero grows (aspect-locked) into whatever box it was given.
        const k = el.role === 'hero' ? Math.max(1, Math.min(box.w / size.w, box.h / size.h)) : 1;
        w = size.w * k;
        h = size.h * k;
        break;
      }
      case 'scan':
        w = h = s.scale;
        break;
    }

    // Constrained surfaces only: content bigger than its box is scaled down
    // uniformly to fit — fonts included — so nothing is ever clipped. The
    // validator then reports the floor it broke.
    // Sub-pixel excess is float noise, not overflow: clamp it silently.
    if (w > box.w + OVERFLOW_EPSILON || h > box.h + OVERFLOW_EPSILON) {
      const fit = Math.min(box.w / w, box.h / h);
      squeezed = true;
      w *= fit;
      h *= fit;
      if (typography) typography = { ...typography, fontPx: typography.fontPx * fit };
      diagnostics.note('squeeze', `"${el.id}" scaled to ${(fit * 100).toFixed(0)}% to fit a box the surface can't enlarge.`);
    } else {
      w = Math.min(w, box.w);
      h = Math.min(h, box.h);
    }

    // Along the slot's axis the box is this leaf's own share: centre in it.
    // Across the slot, honour the slot's alignment.
    const x = box.x + (leaf.slotAxis === 'y' ? alignOffset(leaf.align, box.w - w) : (box.w - w) / 2);
    const y = box.y + (leaf.slotAxis === 'x' ? alignOffset(leaf.align, box.h - h) : (box.h - h) / 2);

    elements[el.id] = {
      placed: true,
      id: el.id,
      role: el.role,
      rect: roundRect(x, y, w, h),
      zone: leaf.slotId,
      appliedRungs: [...s.appliedRungs],
      ...(typography ? { typography } : {}),
    };
  }
  return { elements, squeezed };
}

// ---------------------------------------------------------------------------
// resolve() — the public entry point
// ---------------------------------------------------------------------------

export interface ResolveOptions {
  readonly measurer?: TextMeasurer;
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
    `usable ${Math.round(surface.usable.w)}×${Math.round(surface.usable.h)}px, content ` +
      `${Math.round(surface.content.w)}×${Math.round(surface.content.h)}px, gaps ` +
      `${surface.gap.x.toFixed(1)}/${surface.gap.y.toFixed(1)}px`,
  );

  // Phases 1–2
  const classification = classify(surface.usable);
  const templateId = selectTemplate(classification.aspectClass);
  const template = getTemplate(templateId);
  diagnostics.note('classify', `aspect ${classification.aspect.toFixed(2)} -> '${classification.aspectClass}'`);
  diagnostics.note('select', `template '${templateId}'`);

  const ctx: Ctx = { template, surface, measurer, textCache: new Map() };

  // Phase 3 — every element is attempted; nothing is excluded up front.
  const states: AllocState[] = spec.elements.map((element) => {
    const demand = computeDemand(element, surface);
    if (demand.floorReason) diagnostics.note('demand', `"${element.id}": ${demand.floorReason}`);
    return {
      element,
      demand,
      scale: demand.idealScale,
      maxLines: element.type === 'text' ? element.maxLines : 1,
      allowCut: false,
      zoneIndex: 0,
      dropped: false,
      appliedRungs: [],
    };
  });

  // Phase 4
  chooseContrastSlots(states, spec, ctx, diagnostics);

  // Phase 5
  const history = new Map<string, AllocState[]>();
  const { iterations, constrained } = degrade(states, ctx, diagnostics, history);

  // Phase 6
  if (!constrained) reclaim(states, ctx, diagnostics, history);

  // Phase 7
  const anyDegraded = states.some((s) => s.appliedRungs.length > 0);
  const typeScale = !constrained && !anyDegraded ? growType(states, ctx) : 1;
  if (typeScale > 1) {
    diagnostics.note(
      'grow',
      `nothing needed degrading — type scaled ×${typeScale.toFixed(2)} for a ` +
        `${Math.round(Math.min(surface.content.w, surface.content.h))}px short side`,
    );
  }

  // Phase 8
  const final = solve(states, ctx);
  for (const o of final.overflows) {
    diagnostics.note(
      'overflow',
      `"${o.nodeId}" still overflows ${o.axis === 'x' ? 'horizontally' : 'vertically'} by ${o.px.toFixed(1)}px`,
    );
  }
  const { elements, squeezed } = position(states, final, ctx, diagnostics);
  attachContrast(elements, spec, surface, diagnostics);
  const zones: ResolvedZone[] = final.slots.map((z) => ({
    id: z.id,
    rect: roundRect(z.rect.x, z.rect.y, z.rect.w, z.rect.h),
  }));

  // Phase 9 — an independent second pass over the FINAL geometry.
  const violations = validateLayout(spec, { elements, surface });
  const errorViolations = violations.filter((v) => v.severity === 'error');
  // Overlap and out-of-bounds are never acceptable. A floor (text, tap,
  // scan, contrast) can only be broken by the documented squeeze on a
  // surface where no step was left to take.
  const isStructural = (v: Violation) => v.kind === 'overlap' || v.kind === 'out-of-bounds';
  const unexpected = errorViolations.filter(isStructural);
  if (unexpected.length > 0 && import.meta.env.DEV) throw new LayoutInvariantError(unexpected);

  const status: ResolvedLayout['status'] =
    constrained || squeezed || errorViolations.length > 0 ? 'constrained' : anyDegraded ? 'degraded' : 'ok';

  const diag = diagnostics.build(
    { aspect: classification.aspect, aspectClass: classification.aspectClass, templateId },
    iterations,
    nowMs() - start,
    violations,
  );

  return {
    surface,
    templateId,
    aspectClass: classification.aspectClass,
    elements: elements as Readonly<Record<ElementIdOf<S>, LayoutEntry>>,
    zones,
    typeScale,
    diagnostics: diag,
    status,
  };
}

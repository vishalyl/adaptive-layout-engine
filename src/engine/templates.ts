// Phase 2 (select) and Phase 4 (partition) of the resolver.
//
// A template is a PURE PARTITION FUNCTION, not a set of hand-placed
// coordinates: `partition(usable, ctx)` takes whatever rect Phase 0 handed
// it and returns named zones sized as fractions of it. Nothing here reads a
// surface's name or dimensions as a special case — an unseen 5000×5000
// surface classifies into 'square'/'large' and gets exactly the same
// `grid-square` template and the same fractional split as any other square
// surface, just computed against different numbers.
//
// `selectTemplate` below IS a lookup table, and on first read that can look
// like the "hardcoded per-surface branches" BUILD_SPEC.md §0.2 warns
// against. The distinction: the key into this table is `AspectClass`, a
// value *derived from geometry* in classify.ts — never a surface identity.
// An unseen surface routes itself through classification with zero engine
// code changes; a hardcoded branch would need a new `if` for every new
// device. Same map, different reason for being fine.

import type { Role } from './spec';
import type { AspectClass, ScaleClass } from './classify';
import { type Rect, splitRect } from './types';

export type TemplateId =
  | 'band-horizontal'
  | 'split-horizontal'
  | 'grid-square'
  | 'stack-vertical'
  | 'column-narrow';

export interface Zone {
  readonly id: string;
  readonly rect: Rect;
  // The axis occupants stack along inside this zone. Overflow (Phase 5) is
  // always measured along this axis; the other axis is handled by simple
  // clamping. See §8.6 — this is the subtlest part of the algorithm.
  readonly flow: 'stack-y' | 'stack-x';
  // Perpendicular to `flow`, fixed per zone. This is what makes sibling zones'
  // content share a visual line/column — it must never vary with how full the
  // zone happens to be.
  readonly crossAlign: 'start' | 'center' | 'end';
  // Along `flow` — how leftover space is distributed when occupants don't fill
  // the zone. 'auto' centers the occupant block when it fills less than
  // FILL_THRESHOLD (resolver.ts) of the zone's main-axis capacity and packs
  // from the start otherwise, so a zone's packing adapts to its actual content
  // instead of needing a hand-picked constant re-tuned every time the usual
  // occupant count for that zone changes. A fixed value opts a zone out of
  // that and always packs the same way.
  readonly mainAlign: 'start' | 'center' | 'end' | 'auto';
  readonly gapPx: number;
  readonly maxOccupants: number;
}

export interface PartitionContext {
  readonly aspectClass: AspectClass;
  readonly scaleClass: ScaleClass;
}

export interface Template {
  readonly id: TemplateId;
  readonly mainAxis: 'x' | 'y';
  readonly partition: (usable: Rect, ctx: PartitionContext) => readonly Zone[];
  // Ordered preference: which zones each role will try, best first. Roles
  // this template never attempts (see `ambition`) still need an entry here
  // because Record<Role, ...> must be total — the entry is simply never
  // consulted for a role that ambition excludes.
  readonly rolePreference: Readonly<Record<Role, readonly string[]>>;
  // Roles this template will attempt at all, at each scale class. A role
  // absent from every ambition list is excluded outright (not attempted,
  // not dropped — it was never placed in the first place, and diagnostics
  // records why).
  readonly ambition: Readonly<Record<ScaleClass, readonly Role[]>>;
}

const GAP = 16;
const TIGHT_GAP = 10;

// ---------------------------------------------------------------------------
// band-horizontal — ultra-wide (aspect >= 3.5)
// ---------------------------------------------------------------------------
// | lead (logo+hero) | body (headline, price, badge) | tail (CTA) |
// An ultra-wide band has no room for fine print, so `legal` and `scan`
// are never in this template's ambition at any scale — that is a design
// decision, not an omission, and it is worth defending as one.
//
// FRACTIONS [0.12, 0.68, 0.20] — increased headroom for body (headline+CTA
// sharing one zone) and slightly wider tail for CTA breathing room.

const bandHorizontal: Template = {
  id: 'band-horizontal',
  mainAxis: 'x',
  partition: (usable) => {
    const [lead, body, tail] = splitRect(usable, 'x', [0.12, 0.68, 0.20]);
    return [
      { id: 'lead', rect: lead!, flow: 'stack-y', crossAlign: 'center', mainAlign: 'auto', gapPx: TIGHT_GAP, maxOccupants: 2 },
      // `body` was `align: 'start'` (top-pack) while `lead`/`tail` centered —
      // once price/badge drop and only the headline is left, it hugged the
      // top of the zone while the logo and CTA beside it sat centered, so the
      // three never shared a horizontal line. `crossAlign: 'center'` plus
      // adaptive `mainAlign` fixes that: a lone headline centers to match its
      // neighbours, a fuller body still reads top-to-bottom.
      { id: 'body', rect: body!, flow: 'stack-y', crossAlign: 'center', mainAlign: 'auto', gapPx: TIGHT_GAP, maxOccupants: 4 },
      { id: 'tail', rect: tail!, flow: 'stack-y', crossAlign: 'center', mainAlign: 'auto', gapPx: GAP, maxOccupants: 1 },
    ];
  },
  rolePreference: {
    hero: ['lead'],
    branding: ['lead'],
    primary: ['body'],
    secondary: ['body'],
    incentive: ['body'],
    action: ['tail', 'body'], // legal → CTA fallback: legal tries body first,
    legal: ['body'],            // falls through to tail (CTA zone) if body is full
    scan: ['lead'],
  },
  ambition: {
    micro: ['primary', 'action'],
    small: ['hero', 'primary', 'action'],
    medium: ['hero', 'primary', 'secondary', 'action', 'branding'],
    large: ['hero', 'primary', 'secondary', 'action', 'branding', 'incentive'],
  },
};

// ---------------------------------------------------------------------------
// split-horizontal — wide (1.35 <= aspect < 3.5)
// ---------------------------------------------------------------------------
// | media (hero over logo) | content (headline, price, badge, CTA, legal) |
// FRACTION [0.38, 0.62] — wider media zone so the hero image isn't
// compressed on wide surfaces.

const splitHorizontal: Template = {
  id: 'split-horizontal',
  mainAxis: 'x',
  partition: (usable) => {
    const [media, content] = splitRect(usable, 'x', [0.38, 0.62]);
    return [
      { id: 'media', rect: media!, flow: 'stack-y', crossAlign: 'center', mainAlign: 'auto', gapPx: GAP, maxOccupants: 2 },
      // `content` was `align: 'start'` — headline+CTA top-packed while `media`
      // centered its hero+logo, leaving a large dead gap under the CTA and
      // two columns that read as unrelated blocks. Adaptive `mainAlign`
      // centers the pair to match `media` when the column is under-filled.
      { id: 'content', rect: content!, flow: 'stack-y', crossAlign: 'center', mainAlign: 'auto', gapPx: GAP, maxOccupants: 5 },
    ];
  },
  rolePreference: {
    hero: ['media'],
    branding: ['media'],
    primary: ['content'],
    secondary: ['content'],
    incentive: ['content'],
    action: ['content'],
    legal: ['content'],
    scan: ['content'],
  },
  ambition: {
    micro: ['primary', 'action'],
    small: ['hero', 'primary', 'action'],
    medium: ['hero', 'primary', 'secondary', 'action', 'branding'],
    large: ['hero', 'primary', 'secondary', 'action', 'branding', 'incentive', 'legal'],
  },
};

// ---------------------------------------------------------------------------
// grid-square — square (0.8 <= aspect < 1.35)
// ---------------------------------------------------------------------------
// top (logo | badge) / media (hero) / heading (headline+subtitle) / detail
//   (features+qr) / cta / legal
// FRACTIONS [0.06, 0.34, 0.22, 0.12, 0.18, 0.08]
//   • headline: 0.15 → 0.22 — headline gets prominent space for visual hierarchy
//   • hero: 0.28 → 0.34 — hero image gets more presence on large surfaces
//   • detail: 0.16 → 0.12 — features + QR in 130px wide zone
//   • cta: 0.28 → 0.18 — single button, less wasteful
//   • legal: 0.07 → 0.08 — same

const gridSquare: Template = {
  id: 'grid-square',
  mainAxis: 'y',
  partition: (usable) => {
    const [top, media, heading, detail, cta, legal] = splitRect(usable, 'y', [
      0.06, 0.34, 0.22, 0.12, 0.18, 0.08,
    ]);
    return [
      { id: 'top', rect: top!, flow: 'stack-x', crossAlign: 'center', mainAlign: 'center', gapPx: TIGHT_GAP, maxOccupants: 2 },
      { id: 'media', rect: media!, flow: 'stack-y', crossAlign: 'center', mainAlign: 'center', gapPx: GAP, maxOccupants: 1 },
      { id: 'heading', rect: heading!, flow: 'stack-y', crossAlign: 'center', mainAlign: 'center', gapPx: GAP, maxOccupants: 1 },
      { id: 'detail', rect: detail!, flow: 'stack-x', crossAlign: 'center', mainAlign: 'center', gapPx: GAP, maxOccupants: 3 },
      { id: 'cta', rect: cta!, flow: 'stack-y', crossAlign: 'center', mainAlign: 'center', gapPx: GAP, maxOccupants: 1 },
      { id: 'legal', rect: legal!, flow: 'stack-y', crossAlign: 'center', mainAlign: 'center', gapPx: TIGHT_GAP, maxOccupants: 1 },
    ];
  },
  rolePreference: {
    branding: ['top'],
    incentive: ['top'],
    hero: ['media'],
    primary: ['heading'],
    secondary: ['detail'],
    scan: ['detail'],
    action: ['cta'],
    legal: ['legal'],
  },
  ambition: {
    micro: ['primary', 'action'],
    small: ['hero', 'primary', 'action'],
    medium: ['hero', 'primary', 'secondary', 'action', 'branding'],
    large: ['hero', 'primary', 'secondary', 'action', 'branding', 'incentive', 'scan', 'legal'],
  },
};

// ---------------------------------------------------------------------------
// stack-vertical — tall (0.5 <= aspect < 0.8)
// ---------------------------------------------------------------------------
// brand (logo, badge) / hero / heading / detail (price) / cta / legal
// FRACTIONS [0.06, 0.46, 0.14, 0.12, 0.12, 0.10]
//   • brand: 0.06 → 0.06 (unchanged; logo has room)
//   • hero: 0.42 → 0.46 (+10%; slightly more breathing room)
//   • heading: 0.12 → 0.14 (+16.7%; 60px at 402px height, fits 2-line headline)
//   • detail: 0.10 → 0.12 (+20%; 48px, sufficient for price + QR)
//   • cta: 0.16 → 0.12 (was 0.14, lowered but 48px > 44px tap floor)
//   • legal: 0.08 → 0.10 (+25%; legal zone gets room, falls through to cta)

const stackVertical: Template = {
  id: 'stack-vertical',
  mainAxis: 'y',
  partition: (usable) => {
    const [brand, hero, heading, detail, cta, legal] = splitRect(usable, 'y', [
      0.06, 0.46, 0.14, 0.12, 0.12, 0.10,
    ]);
    return [
      { id: 'brand', rect: brand!, flow: 'stack-x', crossAlign: 'center', mainAlign: 'auto', gapPx: TIGHT_GAP, maxOccupants: 2 },
      { id: 'hero', rect: hero!, flow: 'stack-y', crossAlign: 'center', mainAlign: 'auto', gapPx: GAP, maxOccupants: 1 },
      { id: 'heading', rect: heading!, flow: 'stack-y', crossAlign: 'center', mainAlign: 'auto', gapPx: GAP, maxOccupants: 1 },
      { id: 'detail', rect: detail!, flow: 'stack-y', crossAlign: 'center', mainAlign: 'auto', gapPx: GAP, maxOccupants: 2 },
      // Was `align: 'end'` — meant to pin a lone CTA toward the zone's
      // bottom (main-axis), but the same value doubled as the cross-axis
      // offset and shoved the button to the zone's right edge instead of
      // sharing the hero/headline's center line. `crossAlign: 'center'`
      // fixes that directly; `mainAlign: 'auto'` replaces the intended
      // bottom-pin (the zone is already positioned low in the stack by its
      // rect, so this loses nothing).
      { id: 'cta', rect: cta!, flow: 'stack-y', crossAlign: 'center', mainAlign: 'auto', gapPx: GAP, maxOccupants: 1 },
      { id: 'legal', rect: legal!, flow: 'stack-y', crossAlign: 'center', mainAlign: 'auto', gapPx: TIGHT_GAP, maxOccupants: 1 },
    ];
  },
  rolePreference: {
    branding: ['brand'],
    incentive: ['brand'],
    hero: ['hero'],
    primary: ['heading'],
    secondary: ['detail'],
    scan: ['detail'],
    action: ['cta'],
    legal: ['legal', 'cta'], // legal tries legal zone first, falls through to cta zone
  },
  ambition: {
    micro: ['primary', 'action'],
    small: ['hero', 'primary', 'action'],
    medium: ['hero', 'primary', 'secondary', 'action', 'branding'],
    large: ['hero', 'primary', 'secondary', 'action', 'branding', 'incentive', 'legal'],
  },
};

// ---------------------------------------------------------------------------
// column-narrow — ultra-tall (aspect < 0.5)
// ---------------------------------------------------------------------------
// brand / hero / heading (headline+subtitle) / detail (features) / scan (QR) /
//   cta / legal
// FRACTIONS [0.04, 0.30, 0.10, 0.08, 0.20, 0.20, 0.08]
//   • brand: 0.06 → 0.04 — logo zone gets less, makes room for hero
//   • hero: 0.22 → 0.30 — more breathing room for the hero image on tall surface
//   • heading: 0.14 → 0.10 — compact headline zone (headline is large font)
//   • detail: 0.08 → 0.08 — stays
//   • scan: 0.28 → 0.20 — QR needs less, was overly generous
//   • cta: 0.16 → 0.20 — more breathing room for call to action
//   • legal: 0.06 → 0.08 — more room (legal falls through to cta zone)
// This is the print-to-digital panel case: the scannable target is the
// *point* of the surface, so its zone gets a deliberately larger share and
// — unlike every other template — `scan` enters ambition already at
// 'medium' scale instead of only at 'large'. The spec is immutable; this is
// how a template expresses that emphasis without mutating it.

const columnNarrow: Template = {
  id: 'column-narrow',
  mainAxis: 'y',
  partition: (usable) => {
    const [brand, hero, heading, detail, scan, cta, legal] = splitRect(usable, 'y', [
      0.04, 0.30, 0.10, 0.08, 0.20, 0.20, 0.08,
    ]);
    return [
      { id: 'brand', rect: brand!, flow: 'stack-x', crossAlign: 'center', mainAlign: 'center', gapPx: TIGHT_GAP, maxOccupants: 1 },
      { id: 'hero', rect: hero!, flow: 'stack-y', crossAlign: 'center', mainAlign: 'center', gapPx: TIGHT_GAP, maxOccupants: 1 },
      { id: 'heading', rect: heading!, flow: 'stack-y', crossAlign: 'center', mainAlign: 'center', gapPx: TIGHT_GAP, maxOccupants: 1 },
      { id: 'detail', rect: detail!, flow: 'stack-y', crossAlign: 'center', mainAlign: 'center', gapPx: TIGHT_GAP, maxOccupants: 2 },
      { id: 'scan', rect: scan!, flow: 'stack-y', crossAlign: 'center', mainAlign: 'center', gapPx: TIGHT_GAP, maxOccupants: 1 },
      { id: 'cta', rect: cta!, flow: 'stack-y', crossAlign: 'center', mainAlign: 'center', gapPx: TIGHT_GAP, maxOccupants: 1 },
      { id: 'legal', rect: legal!, flow: 'stack-y', crossAlign: 'center', mainAlign: 'center', gapPx: TIGHT_GAP, maxOccupants: 1 },
    ];
  },
  rolePreference: {
    branding: ['brand'],
    hero: ['hero'],
    primary: ['heading'],
    secondary: ['detail'],
    incentive: ['detail'],
    scan: ['scan'],
    action: ['cta'],
    legal: ['legal', 'cta'], // legal tries legal zone first, then cta zone
  },
  ambition: {
    micro: ['primary', 'action'],
    small: ['hero', 'primary', 'action'],
    medium: ['hero', 'primary', 'action', 'scan'],
    large: ['hero', 'primary', 'secondary', 'action', 'branding', 'scan', 'legal'],
  },
};

export const TEMPLATES: Readonly<Record<TemplateId, Template>> = {
  'band-horizontal': bandHorizontal,
  'split-horizontal': splitHorizontal,
  'grid-square': gridSquare,
  'stack-vertical': stackVertical,
  'column-narrow': columnNarrow,
};

// Phase 2. A pure map from the derived AspectClass to a TemplateId — see the
// file header for why this lookup is not the hardcoding BUILD_SPEC.md §0.2
// warns against. `scaleClass` is accepted (not just aspectClass) so the
// signature has room for a future catalogue where scale also affects
// template choice; today's five templates are one-per-aspect-class and
// scale only affects `ambition` within the chosen template.
const TEMPLATE_BY_ASPECT: Readonly<Record<AspectClass, TemplateId>> = {
  'ultra-wide': 'band-horizontal',
  wide: 'split-horizontal',
  square: 'grid-square',
  tall: 'stack-vertical',
  'ultra-tall': 'column-narrow',
};

export function selectTemplate(aspectClass: AspectClass, _scaleClass: ScaleClass): TemplateId {
  return TEMPLATE_BY_ASPECT[aspectClass];
}

export function getTemplate(id: TemplateId): Template {
  return TEMPLATES[id];
}

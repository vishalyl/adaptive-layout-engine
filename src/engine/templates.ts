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
  readonly align: 'start' | 'center' | 'end';
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

const bandHorizontal: Template = {
  id: 'band-horizontal',
  mainAxis: 'x',
  partition: (usable) => {
    const [lead, body, tail] = splitRect(usable, 'x', [0.2, 0.58, 0.22]);
    return [
      { id: 'lead', rect: lead!, flow: 'stack-y', align: 'center', gapPx: TIGHT_GAP, maxOccupants: 2 },
      { id: 'body', rect: body!, flow: 'stack-y', align: 'start', gapPx: TIGHT_GAP, maxOccupants: 3 },
      { id: 'tail', rect: tail!, flow: 'stack-y', align: 'center', gapPx: GAP, maxOccupants: 1 },
    ];
  },
  rolePreference: {
    hero: ['lead'],
    branding: ['lead'],
    primary: ['body'],
    secondary: ['body'],
    incentive: ['body'],
    action: ['tail'],
    legal: ['body'],
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

const splitHorizontal: Template = {
  id: 'split-horizontal',
  mainAxis: 'x',
  partition: (usable) => {
    const [media, content] = splitRect(usable, 'x', [0.38, 0.62]);
    return [
      { id: 'media', rect: media!, flow: 'stack-y', align: 'center', gapPx: GAP, maxOccupants: 2 },
      { id: 'content', rect: content!, flow: 'stack-y', align: 'start', gapPx: GAP, maxOccupants: 5 },
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
// top (logo | badge) / media (hero) / heading / detail (price | qr) / cta / legal
// `legal` gets its own slim band rather than sharing `detail` with price and
// qr — three occupants crammed into one stack-x row at 'large' scale (the
// only tier that attempts all three) produced a visibly crowded result.

const gridSquare: Template = {
  id: 'grid-square',
  mainAxis: 'y',
  partition: (usable) => {
    const [top, media, heading, detail, cta, legal] = splitRect(usable, 'y', [
      0.12, 0.36, 0.13, 0.14, 0.17, 0.08,
    ]);
    return [
      { id: 'top', rect: top!, flow: 'stack-x', align: 'center', gapPx: TIGHT_GAP, maxOccupants: 2 },
      { id: 'media', rect: media!, flow: 'stack-y', align: 'center', gapPx: GAP, maxOccupants: 1 },
      { id: 'heading', rect: heading!, flow: 'stack-y', align: 'center', gapPx: GAP, maxOccupants: 1 },
      { id: 'detail', rect: detail!, flow: 'stack-x', align: 'center', gapPx: GAP, maxOccupants: 2 },
      { id: 'cta', rect: cta!, flow: 'stack-y', align: 'center', gapPx: GAP, maxOccupants: 1 },
      { id: 'legal', rect: legal!, flow: 'stack-y', align: 'center', gapPx: TIGHT_GAP, maxOccupants: 1 },
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
// The CTA zone sits in the lower half of the stack by construction (it is
// the fifth of six bands), which lands it near the thumb-reachable zone on
// a handheld surface without the engine ever knowing what "handheld" means.

const stackVertical: Template = {
  id: 'stack-vertical',
  mainAxis: 'y',
  partition: (usable) => {
    const [brand, hero, heading, detail, cta, legal] = splitRect(usable, 'y', [
      0.08, 0.42, 0.14, 0.12, 0.14, 0.1,
    ]);
    return [
      { id: 'brand', rect: brand!, flow: 'stack-x', align: 'center', gapPx: TIGHT_GAP, maxOccupants: 2 },
      { id: 'hero', rect: hero!, flow: 'stack-y', align: 'center', gapPx: GAP, maxOccupants: 1 },
      { id: 'heading', rect: heading!, flow: 'stack-y', align: 'center', gapPx: GAP, maxOccupants: 1 },
      { id: 'detail', rect: detail!, flow: 'stack-y', align: 'center', gapPx: GAP, maxOccupants: 1 },
      { id: 'cta', rect: cta!, flow: 'stack-y', align: 'end', gapPx: GAP, maxOccupants: 1 },
      { id: 'legal', rect: legal!, flow: 'stack-y', align: 'center', gapPx: TIGHT_GAP, maxOccupants: 1 },
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
    legal: ['legal'],
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
// brand / hero / heading / detail (price) / scan (QR) / cta / legal
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
      0.06, 0.34, 0.1, 0.08, 0.2, 0.12, 0.1,
    ]);
    return [
      { id: 'brand', rect: brand!, flow: 'stack-x', align: 'center', gapPx: TIGHT_GAP, maxOccupants: 1 },
      { id: 'hero', rect: hero!, flow: 'stack-y', align: 'center', gapPx: TIGHT_GAP, maxOccupants: 1 },
      { id: 'heading', rect: heading!, flow: 'stack-y', align: 'center', gapPx: TIGHT_GAP, maxOccupants: 1 },
      { id: 'detail', rect: detail!, flow: 'stack-y', align: 'center', gapPx: TIGHT_GAP, maxOccupants: 1 },
      { id: 'scan', rect: scan!, flow: 'stack-y', align: 'center', gapPx: TIGHT_GAP, maxOccupants: 1 },
      { id: 'cta', rect: cta!, flow: 'stack-y', align: 'center', gapPx: TIGHT_GAP, maxOccupants: 1 },
      { id: 'legal', rect: legal!, flow: 'stack-y', align: 'center', gapPx: TIGHT_GAP, maxOccupants: 1 },
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
    legal: ['legal'],
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

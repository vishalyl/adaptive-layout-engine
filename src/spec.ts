// The ad element model: a spec is a flat list of elements, each a
// discriminated union member on `type` so it only carries the fields it can
// actually use (a button has no `maxLines`, a text element has no `fit`).
//
// This file is deliberately framework-free and surface-free: nothing here
// knows what device the ad will eventually render on — that boundary holds
// for surface.ts too, and is checked mechanically by tests/purity.spec.ts.

import { assertHexColor, type HexColor } from './engine/contrast';

export type Role =
  | 'hero' // the product image — the thing being sold
  | 'primary' // headline
  | 'secondary' // supporting text, e.g. price
  | 'action' // the CTA
  | 'branding' // logo
  | 'incentive' // promotional badge
  | 'legal' // disclaimer / fine print
  | 'scan'; // QR or similar machine-readable target

export type Priority = 1 | 2 | 3 | 4 | 5;

// Which rungs of the degradation ladder (degradation.ts) this element is allowed to
// reach. Required elements (headline, CTA) may shrink but must never be
// dropped — losing them would make the ad meaningless rather than merely
// smaller.
export type Degradability = 'fixed' | 'shrinkable' | 'droppable';

interface ElementBase<Id extends string> {
  readonly id: Id;
  readonly role: Role;
  readonly priority: Priority;
  readonly degradability: Degradability;
}

export interface TextElement<Id extends string = string> extends ElementBase<Id> {
  readonly type: 'text';
  readonly content: string;
  readonly idealFontPx: number; // what it wants at comfortable scale
  readonly minFontPx: number; // its own floor, before surface floors apply
  readonly maxLines: number; // ideal; may be reduced by the TRUNCATE_LINE rung
  readonly weight: 400 | 500 | 600 | 700 | 800;
  readonly tracking?: number;
}

export interface ImageElement<Id extends string = string> extends ElementBase<Id> {
  readonly type: 'image';
  readonly src: string; // an inline SVG data URI in our creative
  readonly intrinsicAspect: number; // w / h
  readonly fit: 'contain' | 'cover';
  readonly minShortSidePx: number; // below this it reads as an artefact
  // The mark's dominant colour. Declaring it opts the element into the
  // contrast constraint (contrast.ts): the resolver will prefer a zone whose
  // backdrop clears the surface's contrast floor, and plate the mark when
  // none does. Omit it for photographic art where one colour means nothing.
  readonly markColor?: HexColor;
}

export interface ButtonElement<Id extends string = string> extends ElementBase<Id> {
  readonly type: 'button';
  readonly label: string;
  readonly idealFontPx: number;
  readonly minFontPx: number;
  readonly paddingRatio: number; // horizontal padding as a multiple of font size
}

export interface ScanElement<Id extends string = string> extends ElementBase<Id> {
  readonly type: 'scan';
  readonly payload: string;
  readonly minModulePx: number; // hard floor: below this it stops scanning
  readonly modules: number; // grid size, e.g. 21 for QR v1
}

export type AdElement<Id extends string = string> =
  | TextElement<Id>
  | ImageElement<Id>
  | ButtonElement<Id>
  | ScanElement<Id>;

export interface AdSpec<E extends readonly AdElement[] = readonly AdElement[]> {
  readonly name: string;
  readonly elements: E;
  // The ad's own base background. It is content, like the copy — the engine
  // only reads it to know what sits behind an element that no surface
  // backdrop region covers (contrast.ts).
  readonly background?: HexColor;
}

export class DuplicateElementIdError extends Error {
  constructor(id: string) {
    super(`Duplicate element id "${id}": every element in an ad must have a unique id.`);
    this.name = 'DuplicateElementIdError';
  }
}

export class RequiredRoleCountError extends Error {
  constructor(role: Role, count: number) {
    super(
      `An ad must contain exactly one element with role "${role}"; found ${count}. ` +
        `An ad without a CTA (role "action") or a headline (role "primary") is not an ad.`,
    );
    this.name = 'RequiredRoleCountError';
  }
}

function assertUniqueIds(elements: readonly AdElement[]): void {
  const seen = new Set<string>();
  for (const el of elements) {
    if (seen.has(el.id)) throw new DuplicateElementIdError(el.id);
    seen.add(el.id);
  }
}

function assertExactlyOne(elements: readonly AdElement[], role: Role): void {
  const count = elements.filter((el) => el.role === role).length;
  if (count !== 1) throw new RequiredRoleCountError(role, count);
}

// `const E extends ...` is a "const type parameter" (TS 5.0+). Without it,
// TypeScript would widen each element's `id: 'headline'` up to `id: string`
// when inferring `E` from a plain object literal, and `ElementIdOf` below
// would collapse to `string` instead of the union of real ids. The `const`
// modifier tells the compiler "infer this generic as if every literal in it
// had `as const` applied," so callers get precise id types for free.
//
// What the type system cannot check — duplicate ids, a missing CTA, more
// than one headline — is checked here at runtime, with a named error naming
// the exact problem. That split (compile-time for what's structural,
// runtime for what's a property of the *values*) is deliberate; see
// ARCHITECTURE.md.
export function defineAd<const E extends readonly AdElement[]>(spec: {
  name: string;
  elements: E;
  background?: HexColor;
}): AdSpec<E> {
  assertUniqueIds(spec.elements);
  assertExactlyOne(spec.elements, 'action');
  assertExactlyOne(spec.elements, 'primary');
  // The HexColor type already rejects 'red' at compile time; this catches
  // specs that arrive as untyped JSON.
  if (spec.background !== undefined) assertHexColor(spec.background, 'AdSpec.background');
  for (const el of spec.elements) {
    if (el.type === 'image' && el.markColor !== undefined) {
      assertHexColor(el.markColor, `Element "${el.id}".markColor`);
    }
  }
  return spec;
}

// Extracts the union of literal element ids from an `AdSpec`, so
// `ElementIdOf<typeof keelAd>` is `'headline' | 'hero' | 'cta' | ...` rather
// than `string`. This is what lets a resolved layout's `elements` map be
// typed as `Record<ElementIdOf<S>, LayoutEntry>`, so `layout.elements.headline`
// typechecks and `layout.elements.typo` is a compile error.
export type ElementIdOf<S> = S extends AdSpec<infer E> ? E[number]['id'] : never;

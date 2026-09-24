// Phase 2 (select) — the composition library.
//
// A template is a TREE of rows and columns (box-model.ts), not a set of
// coordinates or fractions. It says how the ad is ARRANGED for a family of
// shapes — "hero beside a column of copy", "one tall stack", "a single
// band" — and nothing about sizes: every size comes from the content
// actually placed in it and from the surface's real dimensions. A slot with
// nothing in it takes no space at all.
//
// Templates are keyed by AspectClass, a value derived from geometry
// (classify.ts), never by a surface's identity: an unseen surface routes
// itself through classification with zero engine changes.
//
// `rolePreference` lists, per role, the slots an element may occupy, best
// first. The first is where it starts; later ones are REFLOW targets the
// degradation loop may move it to — only if the move actually reduces the
// overflow — and alternatives the contrast pass may choose (contrast.ts).

import type { Role } from '../spec';
import type { AspectClass } from './classify';
import type { Align, Axis, GroupSpec, Justify, NodeSpec, SlotSpec } from './box-model';

export type TemplateId =
  | 'band-horizontal'
  | 'split-horizontal'
  | 'grid-square'
  | 'stack-vertical'
  | 'column-narrow';

export interface Template {
  readonly id: TemplateId;
  readonly root: NodeSpec;
  readonly rolePreference: Readonly<Record<Role, readonly string[]>>;
}

interface NodeOptions {
  readonly justify?: Justify;
  readonly align?: Align;
  readonly grow?: number;
  readonly gapScale?: number;
}

// A slot: elements side by side ('x') or stacked ('y'), centred by default.
function slot(id: string, axis: Axis, opts: NodeOptions = {}): SlotSpec {
  return { kind: 'slot', id, axis, justify: 'center', align: 'center', grow: 0, gapScale: 0.75, ...opts };
}

// A row ('x') or column ('y') of other nodes. Leftover space is spread
// evenly around its children unless a child `grow`s into it.
function group(id: string, axis: Axis, children: readonly NodeSpec[], opts: NodeOptions = {}): GroupSpec {
  return { kind: 'group', id, axis, children, justify: 'space-evenly', align: 'center', grow: 0, gapScale: 1, ...opts };
}

// ---------------------------------------------------------------------------
// band-horizontal — ultra-wide (aspect >= 3.5): a band or ticker.
//   [logo] [hero] [ headline / price·badge / legal ] [QR] [CTA]
// Everything reads left to right on one line of sight; the copy column is
// the only thing that wraps.
// ---------------------------------------------------------------------------
const bandHorizontal: Template = {
  id: 'band-horizontal',
  root: group('root', 'x', [
    slot('brand', 'y'),
    slot('media', 'y'),
    group(
      'copy',
      'y',
      [
        slot('heading', 'y', { align: 'start' }),
        slot('detail', 'x', { align: 'start', justify: 'start' }),
        slot('legal', 'y', { align: 'start' }),
      ],
      { justify: 'center' },
    ),
    slot('scan', 'y'),
    slot('action', 'y'),
  ]),
  rolePreference: {
    branding: ['brand'],
    hero: ['media'],
    primary: ['heading'],
    secondary: ['detail'],
    incentive: ['detail'],
    legal: ['legal'],
    scan: ['scan'],
    action: ['action'],
  },
};

// ---------------------------------------------------------------------------
// split-horizontal — wide (1.35 <= aspect < 3.5): anything wider than tall.
//   [ hero ] [ logo·badge / headline / price / CTA·QR / legal ]
// The hero takes a column and any width the copy doesn't need.
// ---------------------------------------------------------------------------
const splitHorizontal: Template = {
  id: 'split-horizontal',
  root: group('root', 'x', [
    slot('media', 'y', { grow: 1 }),
    group(
      'copy',
      'y',
      [
        slot('top', 'x', { justify: 'start' }),
        slot('heading', 'y', { align: 'start' }),
        slot('detail', 'y', { align: 'start' }),
        slot('action', 'x', { justify: 'start' }),
        slot('legal', 'y', { align: 'start' }),
      ],
      { justify: 'center' },
    ),
  ]),
  rolePreference: {
    hero: ['media'],
    branding: ['top', 'legal'],
    incentive: ['top', 'detail'],
    primary: ['heading'],
    // A price can move up beside the CTA to save a row.
    secondary: ['detail', 'action'],
    action: ['action'],
    scan: ['action', 'detail'],
    legal: ['legal'],
  },
};

// ---------------------------------------------------------------------------
// grid-square — square (0.8 <= aspect < 1.35).
//   logo·badge
//   [ hero ] [ headline / price / QR ]
//   CTA
//   legal
// Hero and copy share a row — a square has room across as well as down.
// ---------------------------------------------------------------------------
const gridSquare: Template = {
  id: 'grid-square',
  root: group('root', 'y', [
    slot('top', 'x'),
    group(
      'main',
      'x',
      [
        slot('media', 'y', { grow: 1 }),
        group(
          'copy',
          'y',
          [
            slot('heading', 'y', { align: 'start' }),
            slot('detail', 'y', { align: 'start' }),
            slot('scan', 'y', { align: 'start' }),
          ],
          { justify: 'center' },
        ),
      ],
      { grow: 1 },
    ),
    slot('action', 'x'),
    slot('legal', 'y'),
  ]),
  rolePreference: {
    branding: ['top', 'legal'],
    incentive: ['top', 'detail'],
    hero: ['media'],
    primary: ['heading'],
    secondary: ['detail', 'action'],
    scan: ['scan', 'action'],
    action: ['action'],
    legal: ['legal'],
  },
};

// ---------------------------------------------------------------------------
// stack-vertical — tall (0.5 <= aspect < 0.8).
//   logo·badge / hero / headline / price / CTA·QR / legal
// One column; the CTA lands low (thumb reach) by construction.
// ---------------------------------------------------------------------------
const stackVertical: Template = {
  id: 'stack-vertical',
  root: group('root', 'y', [
    slot('brand', 'x'),
    slot('hero', 'y', { grow: 1 }),
    slot('heading', 'y'),
    slot('detail', 'y'),
    slot('action', 'x'),
    slot('legal', 'y'),
  ]),
  rolePreference: {
    branding: ['brand', 'legal'],
    incentive: ['brand', 'detail'],
    hero: ['hero'],
    primary: ['heading'],
    secondary: ['detail', 'action'],
    action: ['action'],
    scan: ['action', 'detail'],
    legal: ['legal'],
  },
};

// ---------------------------------------------------------------------------
// column-narrow — ultra-tall (aspect < 0.5): a narrow
// column. The scannable target gets its own slot: on these surfaces
// it is usually the point.
//   logo·badge / hero / headline / price / QR / CTA / legal
// ---------------------------------------------------------------------------
const columnNarrow: Template = {
  id: 'column-narrow',
  root: group('root', 'y', [
    slot('brand', 'x'),
    slot('hero', 'y', { grow: 1 }),
    slot('heading', 'y'),
    slot('detail', 'y'),
    slot('scan', 'y'),
    slot('action', 'x'),
    slot('legal', 'y'),
  ]),
  rolePreference: {
    branding: ['brand', 'legal'],
    incentive: ['brand', 'detail'],
    hero: ['hero'],
    primary: ['heading'],
    secondary: ['detail', 'action'],
    scan: ['scan', 'action'],
    action: ['action'],
    legal: ['legal'],
  },
};

export const TEMPLATES: Readonly<Record<TemplateId, Template>> = {
  'band-horizontal': bandHorizontal,
  'split-horizontal': splitHorizontal,
  'grid-square': gridSquare,
  'stack-vertical': stackVertical,
  'column-narrow': columnNarrow,
};

const TEMPLATE_BY_ASPECT: Readonly<Record<AspectClass, TemplateId>> = {
  'ultra-wide': 'band-horizontal',
  wide: 'split-horizontal',
  square: 'grid-square',
  tall: 'stack-vertical',
  'ultra-tall': 'column-narrow',
};

export function selectTemplate(aspectClass: AspectClass): TemplateId {
  return TEMPLATE_BY_ASPECT[aspectClass];
}

export function getTemplate(id: TemplateId): Template {
  return TEMPLATES[id];
}

// Every slot id in a template, in tree order — used by tests and tooling.
export function slotIds(node: NodeSpec): string[] {
  return node.kind === 'slot' ? [node.id] : node.children.flatMap(slotIds);
}

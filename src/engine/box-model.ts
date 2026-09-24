// A small flex-like box model, built for this engine rather than borrowed
// from CSS. A template is a tree of GROUPS (rows/columns of other nodes)
// and SLOTS (rows/columns of element leaves). Given the leaves currently in
// each slot and a rectangle, `solveBoxes` sizes and positions every node and
// reports how much it OVERFLOWS — the single number the degradation loop in
// resolver.ts drives to zero.
//
// Two passes, in the same order CSS uses and for the same reason: a text
// leaf's height depends on its width (it wraps), never the other way round.
//
//   1. Width, top-down. Every node knows the narrowest it can be (minW) and
//      the widest it has any use for (maxW). A row hands each child its maxW
//      if everything fits; otherwise it shrinks children from maxW toward
//      minW in proportion to how much each can give (text can re-wrap,
//      rigid boxes can't); below Σ minW the row OVERFLOWS horizontally.
//      Leftover width goes to children with `grow`, then to spacing.
//   2. Height, bottom-up then top-down. With widths fixed, every leaf has a
//      definite height. A column stacks its children; leftover height is
//      water-filled into `grow` children up to what they can use (a hero
//      image can only get taller while it still fits its width), and the
//      rest becomes spacing (`justify`). Below Σ heights the column
//      OVERFLOWS vertically.
//
// Empty slots and groups collapse: they take no space and no gap. That is
// what lets space an absent element would have used go to the others,
// instead of sitting in a fixed-fraction zone nobody occupies.
//
// Overflow is measured, never hidden: when a container cannot fit its
// children, it still returns proportionally compressed boxes (so callers can
// draw something), but the deficit is reported in `excessX`/`excessY`.
// A child squeezed only because its parent overflowed is not counted a
// second time.

export type Axis = 'x' | 'y';
export type Justify = 'start' | 'center' | 'end' | 'space-evenly';
export type Align = 'start' | 'center' | 'end';

interface NodeBase {
  readonly id: string;
  // The axis this node lays its children (or leaves) out along.
  readonly axis: Axis;
  // How leftover space along `axis` is distributed.
  readonly justify: Justify;
  // How leaves sit across `axis` inside a slot (groups stretch children).
  readonly align: Align;
  // Share of the PARENT's leftover space along the parent's axis.
  readonly grow: number;
  // Multiplier on the surface's base gap between this node's children.
  readonly gapScale: number;
}

export interface SlotSpec extends NodeBase {
  readonly kind: 'slot';
}

export interface GroupSpec extends NodeBase {
  readonly kind: 'group';
  readonly children: readonly NodeSpec[];
}

export type NodeSpec = SlotSpec | GroupSpec;

// What the box model needs to know about one element. Everything else about
// the element (fonts, images, colours) stays in the resolver.
export interface LeafModel {
  readonly key: string;
  // Narrowest box width it can take without overflowing its own content.
  readonly minW: number;
  // Widest box width it has any use for.
  readonly maxW: number;
  // Its content size when laid out in a box `width` wide.
  size(width: number): { readonly w: number; readonly h: number };
  // Growable leaves only (a hero image): the tallest it can usefully become
  // in a box `width` wide.
  readonly maxHeightAt?: (width: number) => number;
}

export interface FRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface Overflow {
  readonly nodeId: string;
  readonly axis: Axis;
  readonly px: number;
}

export interface SolvedLeaf {
  readonly key: string;
  readonly slotId: string;
  // The box the slot allotted this leaf. Its content is placed inside it.
  readonly box: FRect;
  readonly slotAxis: Axis;
  readonly align: Align;
}

export interface Solution {
  readonly excessX: number;
  readonly excessY: number;
  readonly overflows: readonly Overflow[];
  readonly slots: readonly { readonly id: string; readonly rect: FRect }[];
  readonly leaves: ReadonlyMap<string, SolvedLeaf>;
}

// Overflow smaller than this is floating-point noise. Deliberately tiny:
// a box even a fraction of a pixel narrower than a text block's minimum
// width makes it wrap one more line, so the solver must treat any real
// deficit as overflow. (Sub-pixel tolerance for the FINAL geometry lives in
// validate.ts, not here.)
export const OVERFLOW_EPSILON = 0.01;

interface Work {
  readonly spec: NodeSpec;
  readonly children: Work[];
  readonly leaves: readonly LeafModel[];
  minW: number;
  maxW: number;
  w: number;
  h: number;
  hDemand: number;
  hCap: number;
  // Sizes assigned to each item (child or leaf) along x and y.
  itemW: number[];
  itemH: number[];
  // Leaf content heights at their assigned widths, and growth caps.
  leafH: number[];
  leafCap: number[];
}

function itemCount(n: Work): number {
  return n.spec.kind === 'slot' ? n.leaves.length : n.children.length;
}

function gapFor(n: Work, gap: { x: number; y: number }): number {
  return (n.spec.axis === 'x' ? gap.x : gap.y) * n.spec.gapScale;
}

function build(spec: NodeSpec, leavesBySlot: ReadonlyMap<string, readonly LeafModel[]>): Work | null {
  const base = { spec, minW: 0, maxW: 0, w: 0, h: 0, hDemand: 0, hCap: 0, itemW: [], itemH: [], leafH: [], leafCap: [] };
  if (spec.kind === 'slot') {
    const leaves = leavesBySlot.get(spec.id) ?? [];
    return leaves.length > 0 ? { ...base, children: [], leaves } : null;
  }
  const children = spec.children.map((c) => build(c, leavesBySlot)).filter((c): c is Work => c !== null);
  return children.length > 0 ? { ...base, children, leaves: [] } : null;
}

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
const max = (xs: readonly number[]) => xs.reduce((a, b) => Math.max(a, b), 0);

// ---------------------------------------------------------------------------
// Pass 1 — widths
// ---------------------------------------------------------------------------

function measureWidths(n: Work, gap: { x: number; y: number }): void {
  let mins: number[];
  let maxs: number[];
  if (n.spec.kind === 'slot') {
    mins = n.leaves.map((l) => l.minW);
    maxs = n.leaves.map((l) => Math.max(l.minW, l.maxW));
  } else {
    n.children.forEach((c) => measureWidths(c, gap));
    mins = n.children.map((c) => c.minW);
    maxs = n.children.map((c) => c.maxW);
  }
  if (n.spec.axis === 'x') {
    const gaps = gapFor(n, gap) * (itemCount(n) - 1);
    n.minW = sum(mins) + gaps;
    n.maxW = sum(maxs) + gaps;
  } else {
    n.minW = max(mins);
    n.maxW = max(maxs);
  }
}

function distributeWidths(
  space: number,
  mins: readonly number[],
  maxs: readonly number[],
  grows: readonly number[],
): { sizes: number[]; excess: number } {
  const room = Math.max(0, space);
  const sumMin = sum(mins);
  const sumMax = sum(maxs);
  if (sumMax <= room) {
    const slack = room - sumMax;
    const totalGrow = sum(grows);
    const sizes = maxs.map((m, i) => (totalGrow > 0 ? m + (slack * grows[i]!) / totalGrow : m));
    return { sizes, excess: 0 };
  }
  if (sumMin <= room) {
    // Shrink from max toward min, in proportion to how much each item can
    // give. Rigid items (min === max) give nothing.
    const deficit = sumMax - room;
    const flex = sumMax - sumMin;
    return { sizes: maxs.map((m, i) => m - ((m - mins[i]!) * deficit) / flex), excess: 0 };
  }
  const factor = sumMin > 0 ? room / sumMin : 0;
  return { sizes: mins.map((m) => m * factor), excess: sumMin - room };
}

function assignWidths(n: Work, w: number, squeezed: boolean, gap: { x: number; y: number }, out: Overflow[]): void {
  n.w = w;
  const kids = n.spec.kind === 'slot' ? null : n.children;
  const mins = kids ? kids.map((c) => c.minW) : n.leaves.map((l) => l.minW);
  const maxs = kids ? kids.map((c) => c.maxW) : n.leaves.map((l) => Math.max(l.minW, l.maxW));

  if (n.spec.axis === 'x') {
    const gaps = gapFor(n, gap) * (mins.length - 1);
    const grows = kids ? kids.map((c) => c.spec.grow) : mins.map(() => 0);
    const { sizes, excess } = distributeWidths(w - gaps, mins, maxs, grows);
    const overflowed = excess > OVERFLOW_EPSILON;
    if (overflowed && !squeezed) out.push({ nodeId: n.spec.id, axis: 'x', px: excess });
    n.itemW = sizes;
    kids?.forEach((c, i) => assignWidths(c, sizes[i]!, squeezed || overflowed, gap, out));
  } else {
    // Every child spans the full width; one that can't fit it overflows
    // across this column.
    n.itemW = mins.map(() => w);
    mins.forEach((m, i) => {
      const cross = m - w;
      if (cross > OVERFLOW_EPSILON && !squeezed) {
        const id = kids ? kids[i]!.spec.id : n.leaves[i]!.key;
        out.push({ nodeId: `${n.spec.id}>${id}`, axis: 'x', px: cross });
      }
    });
    kids?.forEach((c, i) => assignWidths(c, w, squeezed || mins[i]! - w > OVERFLOW_EPSILON, gap, out));
  }
}

// ---------------------------------------------------------------------------
// Pass 2 — heights
// ---------------------------------------------------------------------------

function measureHeights(n: Work, gap: { x: number; y: number }): void {
  let hs: number[];
  let caps: number[];
  let grows: number[];
  if (n.spec.kind === 'slot') {
    n.leafH = n.leaves.map((l, i) => l.size(n.itemW[i]!).h);
    n.leafCap = n.leaves.map((l, i) =>
      l.maxHeightAt ? Math.max(n.leafH[i]!, l.maxHeightAt(n.itemW[i]!)) : n.leafH[i]!,
    );
    hs = n.leafH;
    caps = n.leafCap;
    grows = n.leaves.map((l) => (l.maxHeightAt ? 1 : 0));
  } else {
    n.children.forEach((c) => measureHeights(c, gap));
    hs = n.children.map((c) => c.hDemand);
    caps = n.children.map((c) => c.hCap);
    grows = n.children.map((c) => c.spec.grow);
  }
  if (n.spec.axis === 'y') {
    const gaps = gapFor(n, gap) * (hs.length - 1);
    n.hDemand = sum(hs) + gaps;
    // Only growers can absorb extra height.
    n.hCap = n.hDemand + sum(caps.map((c, i) => (grows[i]! > 0 ? c - hs[i]! : 0)));
  } else {
    n.hDemand = max(hs);
    n.hCap = Math.max(n.hDemand, max(caps));
  }
}

function distributeHeights(
  space: number,
  hs: readonly number[],
  caps: readonly number[],
  grows: readonly number[],
): { sizes: number[]; excess: number } {
  const room = Math.max(0, space);
  const total = sum(hs);
  if (total > room) {
    const factor = total > 0 ? room / total : 0;
    return { sizes: hs.map((h) => h * factor), excess: total - room };
  }
  // Water-fill the slack into growers, each up to its cap.
  const sizes = [...hs];
  let slack = room - total;
  for (let round = 0; round < 8 && slack > 1e-6; round++) {
    const active = sizes.map((s, i) => (grows[i]! > 0 && s < caps[i]! - 1e-6 ? i : -1)).filter((i) => i >= 0);
    if (active.length === 0) break;
    const weight = sum(active.map((i) => grows[i]!));
    let given = 0;
    for (const i of active) {
      const share = Math.min((slack * grows[i]!) / weight, caps[i]! - sizes[i]!);
      sizes[i]! += share;
      given += share;
    }
    slack -= given;
  }
  return { sizes, excess: 0 };
}

function assignHeights(n: Work, h: number, squeezed: boolean, gap: { x: number; y: number }, out: Overflow[]): void {
  n.h = h;
  const kids = n.spec.kind === 'slot' ? null : n.children;
  const hs = kids ? kids.map((c) => c.hDemand) : n.leafH;
  const caps = kids ? kids.map((c) => c.hCap) : n.leafCap;
  const grows = kids ? kids.map((c) => c.spec.grow) : n.leaves.map((l) => (l.maxHeightAt ? 1 : 0));

  if (n.spec.axis === 'y') {
    const gaps = gapFor(n, gap) * (hs.length - 1);
    const { sizes, excess } = distributeHeights(h - gaps, hs, caps, grows);
    const overflowed = excess > OVERFLOW_EPSILON;
    if (overflowed && !squeezed) out.push({ nodeId: n.spec.id, axis: 'y', px: excess });
    n.itemH = sizes;
    kids?.forEach((c, i) => assignHeights(c, sizes[i]!, squeezed || overflowed, gap, out));
  } else {
    n.itemH = hs.map(() => h);
    hs.forEach((childH, i) => {
      const cross = childH - h;
      if (cross > OVERFLOW_EPSILON && !squeezed) {
        const id = kids ? kids[i]!.spec.id : n.leaves[i]!.key;
        out.push({ nodeId: `${n.spec.id}>${id}`, axis: 'y', px: cross });
      }
    });
    kids?.forEach((c, i) => assignHeights(c, h, squeezed || hs[i]! - h > OVERFLOW_EPSILON, gap, out));
  }
}

// ---------------------------------------------------------------------------
// Placement
// ---------------------------------------------------------------------------

function justifyOffsets(justify: Justify, leftover: number, count: number): { start: number; between: number } {
  switch (justify) {
    case 'start':
      return { start: 0, between: 0 };
    case 'center':
      return { start: leftover / 2, between: 0 };
    case 'end':
      return { start: leftover, between: 0 };
    case 'space-evenly': {
      const extra = leftover / (count + 1);
      return { start: extra, between: extra };
    }
  }
}

// The width a column's content actually occupies once laid out. Wrapped
// text rarely fills the width it was given, and a row that kept that
// difference inside the column would show it as a dead strip on one side.
// Only columns tighten: a row, or a slot holding a hero that may grow to
// fill its box, keeps the width it was given. Tightening never re-wraps
// anything — every leaf still gets at least its own laid-out width.
function usedWidth(n: Work): number {
  if (n.spec.axis === 'x') return n.w;
  if (n.spec.kind === 'group') return Math.min(n.w, max(n.children.map(usedWidth)));
  if (n.leaves.some((l) => l.maxHeightAt)) return n.w;
  return Math.min(n.w, max(n.leaves.map((l, i) => l.size(n.itemW[i]!).w)));
}

function place(
  n: Work,
  x: number,
  y: number,
  gap: { x: number; y: number },
  slots: { id: string; rect: FRect }[],
  leaves: Map<string, SolvedLeaf>,
): void {
  // A row places each child column at the width its content uses, so the
  // width wrapping freed joins the leftover that `justify` spreads out.
  // A child that `grow`s was given its extra width on purpose and keeps it.
  if (n.spec.kind === 'group' && n.spec.axis === 'x') {
    n.children.forEach((c, i) => {
      if (c.spec.grow > 0) return;
      c.w = usedWidth(c);
      n.itemW[i] = c.w;
    });
  }
  // A column that was tightened passes its new width down to its children.
  if (n.spec.kind === 'group' && n.spec.axis === 'y') {
    n.children.forEach((c) => (c.w = Math.min(c.w, n.w)));
  }
  const along = n.spec.axis === 'x' ? n.itemW : n.itemH;
  const extent = n.spec.axis === 'x' ? n.w : n.h;
  const g = gapFor(n, gap);
  const leftover = Math.max(0, extent - sum(along) - g * (along.length - 1));
  const { start, between } = justifyOffsets(n.spec.justify, leftover, along.length);

  if (n.spec.kind === 'slot') slots.push({ id: n.spec.id, rect: { x, y, w: n.w, h: n.h } });

  let cursor = start;
  along.forEach((size, i) => {
    const box: FRect =
      n.spec.axis === 'x'
        ? { x: x + cursor, y, w: size, h: n.h }
        : { x, y: y + cursor, w: n.w, h: size };
    cursor += size + g + between;
    if (n.spec.kind === 'slot') {
      const leaf = n.leaves[i]!;
      leaves.set(leaf.key, { key: leaf.key, slotId: n.spec.id, box, slotAxis: n.spec.axis, align: n.spec.align });
    } else {
      place(n.children[i]!, box.x, box.y, gap, slots, leaves);
    }
  });
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function solveBoxes(
  root: NodeSpec,
  leavesBySlot: ReadonlyMap<string, readonly LeafModel[]>,
  rect: FRect,
  gap: { x: number; y: number },
): Solution {
  const tree = build(root, leavesBySlot);
  const slots: { id: string; rect: FRect }[] = [];
  const leaves = new Map<string, SolvedLeaf>();
  if (!tree) return { excessX: 0, excessY: 0, overflows: [], slots, leaves };

  // The root is laid out exactly like any other node: a row root reports
  // its own horizontal deficit and any child taller than the surface; a
  // column root the reverse.
  const overflows: Overflow[] = [];
  measureWidths(tree, gap);
  assignWidths(tree, rect.w, false, gap, overflows);
  measureHeights(tree, gap);
  assignHeights(tree, rect.h, false, gap, overflows);

  place(tree, rect.x, rect.y, gap, slots, leaves);

  const excessX = sum(overflows.filter((o) => o.axis === 'x').map((o) => o.px));
  const excessY = sum(overflows.filter((o) => o.axis === 'y').map((o) => o.px));
  return { excessX, excessY, overflows, slots, leaves };
}

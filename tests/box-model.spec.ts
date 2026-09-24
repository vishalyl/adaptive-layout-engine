// Unit tests for the box model (src/engine/box-model.ts), independent of
// any ad: rigid and flexible leaves in rows and columns.

import { describe, expect, it } from 'vitest';
import { solveBoxes, type LeafModel, type NodeSpec } from '../src/engine/box-model';

const rigid = (key: string, w: number, h: number): LeafModel => ({ key, minW: w, maxW: w, size: () => ({ w, h }) });
// A text-like leaf: can be anywhere from 50 to 200 wide; narrower = taller.
const flexible = (key: string): LeafModel => ({
  key,
  minW: 50,
  maxW: 200,
  size: (width) => ({ w: Math.min(width, 200), h: 20 * Math.ceil(200 / Math.max(width, 1)) }),
});
// A hero-like leaf that can grow taller while it stays within its width.
const growable = (key: string, w: number, h: number): LeafModel => ({
  key,
  minW: w,
  maxW: w,
  size: () => ({ w, h }),
  maxHeightAt: (width) => Math.max(h, width * (h / w)),
});

const slot = (id: string, axis: 'x' | 'y', extra: Partial<NodeSpec> = {}): NodeSpec =>
  ({ kind: 'slot', id, axis, justify: 'start', align: 'start', grow: 0, gapScale: 1, ...extra }) as NodeSpec;
const group = (id: string, axis: 'x' | 'y', children: NodeSpec[], extra: Partial<NodeSpec> = {}): NodeSpec =>
  ({ kind: 'group', id, axis, children, justify: 'start', align: 'start', grow: 0, gapScale: 1, ...extra }) as NodeSpec;

const rect = (w: number, h: number) => ({ x: 0, y: 0, w, h });
const NO_GAP = { x: 0, y: 0 };

describe('rows', () => {
  it('give every child its max width when everything fits', () => {
    const sol = solveBoxes(slot('s', 'x'), new Map([['s', [rigid('a', 100, 10), flexible('b')]]]), rect(400, 100), NO_GAP);
    expect(sol.excessX).toBe(0);
    expect(sol.leaves.get('a')!.box.w).toBe(100);
    expect(sol.leaves.get('b')!.box.w).toBe(200);
  });

  it('shrink only the flexible child when space is short — rigid ones give nothing', () => {
    const sol = solveBoxes(slot('s', 'x'), new Map([['s', [rigid('a', 100, 10), flexible('b')]]]), rect(220, 100), NO_GAP);
    expect(sol.excessX).toBe(0);
    expect(sol.leaves.get('a')!.box.w).toBe(100);
    expect(sol.leaves.get('b')!.box.w).toBeCloseTo(120, 6);
  });

  it('report horizontal overflow below the sum of minimum widths (gaps included)', () => {
    const sol = solveBoxes(slot('s', 'x'), new Map([['s', [rigid('a', 100, 10), flexible('b')]]]), rect(140, 100), { x: 10, y: 0 });
    // minimums: 100 + 50 + one 10px gap = 160 > 140
    expect(sol.excessX).toBeCloseTo(20, 6);
  });

  it('give leftover width to children with `grow`', () => {
    const root = group('r', 'x', [slot('a', 'y', { grow: 1 }), slot('b', 'y')]);
    const sol = solveBoxes(root, new Map([['a', [rigid('a1', 50, 10)]], ['b', [rigid('b1', 50, 10)]]]), rect(300, 100), NO_GAP);
    expect(sol.slots.find((s) => s.id === 'a')!.rect.w).toBe(250);
    expect(sol.slots.find((s) => s.id === 'b')!.rect.w).toBe(50);
  });
});

describe('columns', () => {
  it('water-fill leftover height into a growable leaf up to what it can use; the rest is spacing', () => {
    // A 100-wide column; the hero can grow to 100×100 (square) at most.
    const root = group('r', 'y', [slot('hero', 'y', { grow: 1 }), slot('text', 'y')], { justify: 'center' });
    const sol = solveBoxes(
      root,
      new Map([['hero', [growable('h', 50, 50)]], ['text', [rigid('t', 100, 20)]]]),
      rect(100, 400),
      NO_GAP,
    );
    expect(sol.excessY).toBe(0);
    expect(sol.slots.find((s) => s.id === 'hero')!.rect.h).toBeCloseTo(100, 6);
  });

  it('report vertical overflow when children are taller than the column', () => {
    const sol = solveBoxes(slot('s', 'y'), new Map([['s', [rigid('a', 10, 60), rigid('b', 10, 60)]]]), rect(100, 100), { x: 0, y: 5 });
    expect(sol.excessY).toBeCloseTo(25, 6);
  });

  it('report a child wider than the column as horizontal overflow', () => {
    const sol = solveBoxes(slot('s', 'y'), new Map([['s', [rigid('a', 150, 10)]]]), rect(100, 100), NO_GAP);
    expect(sol.excessX).toBeCloseTo(50, 6);
  });
});

describe('structure', () => {
  it('empty slots collapse: they take no space and no gap', () => {
    const root = group('r', 'y', [slot('a', 'y'), slot('empty', 'y'), slot('b', 'y')]);
    const sol = solveBoxes(root, new Map([['a', [rigid('a1', 10, 40)]], ['b', [rigid('b1', 10, 40)]]]), rect(100, 90), { x: 0, y: 10 });
    expect(sol.excessY).toBe(0); // 40 + 10 + 40 = 90: the empty slot added nothing
    expect(sol.slots.map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('an overflow is counted once, not again in every child it squeezes', () => {
    const root = group('r', 'x', [group('c1', 'y', [slot('a', 'x')]), group('c2', 'y', [slot('b', 'x')])]);
    const sol = solveBoxes(
      root,
      new Map([['a', [rigid('a1', 100, 10), rigid('a2', 100, 10)]], ['b', [rigid('b1', 100, 10)]]]),
      rect(200, 100),
      NO_GAP,
    );
    expect(sol.excessX).toBeCloseTo(100, 6);
    expect(sol.overflows).toHaveLength(1);
  });

  it('never places two leaves over each other, even when overflowing', () => {
    const sol = solveBoxes(slot('s', 'x'), new Map([['s', [rigid('a', 100, 10), rigid('b', 100, 10)]]]), rect(150, 100), { x: 10, y: 0 });
    const a = sol.leaves.get('a')!.box;
    const b = sol.leaves.get('b')!.box;
    expect(a.x + a.w).toBeLessThanOrEqual(b.x + 1e-9);
    expect(b.x + b.w).toBeLessThanOrEqual(150 + 1e-9);
  });
});

import { describe, expect, it } from 'vitest';
import {
  insetRect,
  px,
  type Rect,
  rectArea,
  rectContains,
  rectIntersects,
  splitRect,
} from '../src/engine/types';

const rect = (x: number, y: number, w: number, h: number): Rect => ({
  x: px(x),
  y: px(y),
  w: px(w),
  h: px(h),
});

describe('rectArea', () => {
  it('multiplies width by height', () => {
    expect(rectArea(rect(0, 0, 10, 20))).toBe(200);
  });
});

describe('rectIntersects', () => {
  it('detects a clear overlap', () => {
    expect(rectIntersects(rect(0, 0, 10, 10), rect(5, 5, 10, 10))).toBe(true);
  });

  it('reports no overlap for disjoint rects', () => {
    expect(rectIntersects(rect(0, 0, 10, 10), rect(20, 20, 10, 10))).toBe(false);
  });

  it('does not treat edge-touching rects as overlapping', () => {
    // b starts exactly where a ends â zero-width shared edge, not a real overlap.
    expect(rectIntersects(rect(0, 0, 10, 10), rect(10, 0, 10, 10))).toBe(false);
  });

  it('tolerates sub-epsilon overlap from rounding', () => {
    expect(rectIntersects(rect(0, 0, 10, 10), rect(9.8, 0, 10, 10), 0.5)).toBe(false);
  });
});

describe('rectContains', () => {
  const outer = rect(0, 0, 100, 100);

  it('accepts a rect fully inside', () => {
    expect(rectContains(outer, rect(10, 10, 20, 20))).toBe(true);
  });

  it('rejects a rect that spills past the right edge', () => {
    expect(rectContains(outer, rect(90, 0, 20, 20))).toBe(false);
  });

  it('allows a rect exactly on the boundary', () => {
    expect(rectContains(outer, rect(0, 0, 100, 100))).toBe(true);
  });

  it('tolerates a fraction-of-a-pixel overshoot', () => {
    expect(rectContains(outer, rect(0, 0, 100.2, 100), 0.5)).toBe(true);
  });
});

describe('insetRect', () => {
  it('shrinks the rect by each edge inset', () => {
    const result = insetRect(rect(0, 0, 100, 200), { top: 10, right: 5, bottom: 20, left: 5 });
    expect(result).toEqual(rect(5, 10, 90, 170));
  });

  it('clamps to zero size instead of going negative', () => {
    const result = insetRect(rect(0, 0, 10, 10), { top: 0, right: 50, bottom: 0, left: 50 });
    expect(result.w).toBe(0);
    expect(result.h).toBe(10);
  });
});

describe('splitRect', () => {
  it('splits along x proportionally to the given fractions', () => {
    const [lead, body, tail] = splitRect(rect(0, 0, 1000, 100), 'x', [0.2, 0.58, 0.22]);
    expect(lead).toEqual(rect(0, 0, 200, 100));
    expect(body).toEqual(rect(200, 0, 580, 100));
    expect(tail).toEqual(rect(780, 0, 220, 100));
  });

  it('splits along y and normalises fractions that do not sum to 1', () => {
    const [top, bottom] = splitRect(rect(0, 0, 100, 300), 'y', [1, 2]);
    expect(top).toEqual(rect(0, 0, 100, 100));
    expect(bottom).toEqual(rect(0, 100, 100, 200));
  });

  it('returns an empty array for an empty fractions list', () => {
    expect(splitRect(rect(0, 0, 100, 100), 'x', [])).toEqual([]);
  });

  it('pieces tile the original rect exactly with no gap or overlap', () => {
    const original = rect(0, 0, 733, 100);
    const pieces = splitRect(original, 'x', [1, 1, 1]);
    const totalWidth = pieces.reduce((sum, p) => sum + p.w, 0);
    expect(totalWidth).toBeCloseTo(original.w, 6);
  });
});

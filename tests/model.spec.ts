import { describe, expect, it } from 'vitest';
import { keelAd } from '../src/demo/creative';
import { surfaces } from '../src/demo/surfaces';

describe('keelAd', () => {
  it('has eight elements with unique ids', () => {
    expect(keelAd.elements).toHaveLength(8);
    const ids = keelAd.elements.map((el) => el.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has exactly one primary (headline) and one action (CTA) element', () => {
    expect(keelAd.elements.filter((el) => el.role === 'primary')).toHaveLength(1);
    expect(keelAd.elements.filter((el) => el.role === 'action')).toHaveLength(1);
  });

  it('spans five distinct priority levels', () => {
    const priorities = new Set(keelAd.elements.map((el) => el.priority));
    expect(priorities.size).toBe(5);
  });
});

describe('surfaces', () => {
  it('ships exactly six named profiles with unique keys', () => {
    expect(surfaces).toHaveLength(6);
    expect(new Set(surfaces.map((s) => s.key)).size).toBe(6);
  });

  it('every profile has a safe area that fits inside its own dimensions', () => {
    for (const { profile } of surfaces) {
      const { top, right, bottom, left } = profile.safeArea;
      expect(left + right).toBeLessThanOrEqual(profile.widthPx);
      expect(top + bottom).toBeLessThanOrEqual(profile.heightPx);
    }
  });

  it('the cramped surface is genuinely small (stress case)', () => {
    const cramped = surfaces.find((s) => s.key === 'cramped');
    expect(cramped).toBeDefined();
    expect(cramped!.profile.widthPx * cramped!.profile.heightPx).toBeLessThan(320 * 480);
  });
});

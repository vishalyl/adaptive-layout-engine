// §16.4 — the test that mechanically proves §0.2: "The resolver must never
// know a surface's name." This reads every file under src/engine/ as plain
// text and asserts none of them contain a surface identity — not in a
// conditional, not in a comment, nowhere — and that the engine imports
// nothing from src/demo/ or src/render/, and touches no DOM global.
//
// The surface-key list is imported from the real surfaces module rather
// than retyped here, so this test can never go stale relative to what
// src/demo/surfaces.ts actually ships.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { surfaces } from '../src/demo/surfaces';

const here = dirname(fileURLToPath(import.meta.url));
const ENGINE_DIR = join(here, '..', 'src', 'engine');

// Generic device/surface-category words the brief calls out by name (§16.4),
// independent of what this project happens to name its own shipped
// surfaces.
const FORBIDDEN_WORDS = ['mobile', 'kiosk', 'broadcast', 'phone', 'tv', 'portrait', 'landscape'];

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...listTsFiles(full));
    } else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
      out.push(full);
    }
  }
  return out;
}

const engineFiles = listTsFiles(ENGINE_DIR);
const surfaceKeys = surfaces.map((s) => s.key);
const forbiddenStrings = [...surfaceKeys, ...FORBIDDEN_WORDS];

describe('engine purity — no surface identity anywhere under src/engine/', () => {
  it('found at least one engine file to check (the test itself is not vacuous)', () => {
    expect(engineFiles.length).toBeGreaterThan(5);
  });

  for (const file of engineFiles) {
    const relative = file.slice(ENGINE_DIR.length + 1);
    const content = readFileSync(file, 'utf8');

    it(`${relative}: contains no surface-identity string`, () => {
      // Word-boundary matching, not a plain substring check — a naive
      // `includes('tv')` flags `selectVictim` (it contains "tV"), which is
      // a false positive from the check, not a purity violation.
      const found = forbiddenStrings.filter((word) => new RegExp(`\\b${word}\\b`, 'i').test(content));
      expect(found, `${relative} contains forbidden word(s): ${found.join(', ')}`).toEqual([]);
    });

    it(`${relative}: imports nothing from src/demo/ or src/render/`, () => {
      const importLines = content.match(/^\s*(?:import|export)[^;]*from\s+['"][^'"]+['"];?/gm) ?? [];
      const offending = importLines.filter((line) => /['"](\.\.\/)*(demo|render)\//.test(line));
      expect(offending, `${relative} imports from demo/ or render/: ${offending.join(' | ')}`).toEqual([]);
    });

    it(`${relative}: references no DOM global (document, window, HTMLElement)`, () => {
      const matches = content.match(/\b(document|window|HTMLElement)\b/g) ?? [];
      expect(matches, `${relative} references DOM globals: ${matches.join(', ')}`).toEqual([]);
    });
  }
});

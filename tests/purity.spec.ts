// The test that mechanically proves the engine's one hard rule: "The
// resolver must never know a surface's name." The engine is src/spec.ts,
// src/resolver.ts and everything under src/engine/. This reads each of them
// as plain text and asserts none contains a surface identity — not in a
// conditional, not in a comment, nowhere — that none imports the demo or a
// renderer, and that none touches a DOM global.
//
// The surface-key list is imported from the real surfaces module rather
// than retyped here, so this test can never go stale relative to what
// src/surfaces.ts actually ships.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { surfaces } from '../src/surfaces';

const here = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = join(here, '..', 'src');
const ENGINE_DIR = join(SRC_DIR, 'engine');
const ENGINE_ROOT_FILES = ['spec.ts', 'resolver.ts'].map((f) => join(SRC_DIR, f));

// Generic device/surface-category words the brief calls out by name,
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

const engineFiles = [...ENGINE_ROOT_FILES, ...listTsFiles(ENGINE_DIR)];
const surfaceKeys = surfaces.map((s) => s.key);
const forbiddenStrings = [...surfaceKeys, ...FORBIDDEN_WORDS];
// What the engine may never import: the demo, the renderers, and the
// root-level files that belong to them (named surfaces, the app, the DOM
// renderer).
const FORBIDDEN_IMPORT = /['"](?:\.\.?\/)+(?:demo|render)\/|['"](?:\.\.?\/)+(?:surfaces|App|render-dom|main)['"]/;

describe('engine purity — no surface identity anywhere in the engine', () => {
  it('found at least one engine file to check (the test itself is not vacuous)', () => {
    expect(engineFiles.length).toBeGreaterThan(5);
  });

  for (const file of engineFiles) {
    const relative = file.slice(SRC_DIR.length + 1).replace(/\\/g, '/');
    const content = readFileSync(file, 'utf8');

    it(`${relative}: contains no surface-identity string`, () => {
      // Word-boundary matching, not a plain substring check — a naive
      // `includes('tv')` flags `selectVictim` (it contains "tV"), which is
      // a false positive from the check, not a purity violation.
      const found = forbiddenStrings.filter((word) => new RegExp(`\\b${word}\\b`, 'i').test(content));
      expect(found, `${relative} contains forbidden word(s): ${found.join(', ')}`).toEqual([]);
    });

    it(`${relative}: imports nothing from the demo or a renderer`, () => {
      const importLines = content.match(/^\s*(?:import|export)[^;]*from\s+['"][^'"]+['"];?/gm) ?? [];
      const offending = importLines.filter((line) => FORBIDDEN_IMPORT.test(line));
      expect(offending, `${relative} imports from the demo or a renderer: ${offending.join(' | ')}`).toEqual([]);
    });

    it(`${relative}: references no DOM global (document, window, HTMLElement)`, () => {
      const matches = content.match(/\b(document|window|HTMLElement)\b/g) ?? [];
      expect(matches, `${relative} references DOM globals: ${matches.join(', ')}`).toEqual([]);
    });
  }
});

// Type-level assertions (BUILD_SPEC.md §16.5). These files are never run —
// they exist purely so `tsc` (via `npm run typecheck`) fails the build if a
// type guarantee silently stops holding. A `// @ts-expect-error` line is
// itself the assertion: if the line below it ever stops erroring, tsc
// reports "Unused '@ts-expect-error' directive" and the build fails.
//
// This file grows gate by gate, matching what has been built so far
// (BUILD_SPEC.md §23). At Gate 2 only spec.ts and surface.ts exist, so the
// ResolvedLayout-based assertions ("layout.elements.headline resolves")
// land once resolver.ts defines PlacedElement/ResolvedLayout in a later
// gate — they are not faked here.

import { expectTypeOf } from 'vitest';
import { defineAd, type ElementIdOf } from '../src/engine/spec';
import type { Interaction, Viewing } from '../src/engine/surface';

// --- defineAd preserves literal id types through ElementIdOf -------------

const sample = defineAd({
  name: 'Type-level fixture',
  elements: [
    {
      id: 'headline',
      type: 'text',
      role: 'primary',
      priority: 1,
      degradability: 'shrinkable',
      content: 'Hello',
      idealFontPx: 20,
      minFontPx: 12,
      maxLines: 1,
      weight: 700,
    },
    {
      id: 'cta',
      type: 'button',
      role: 'action',
      priority: 2,
      degradability: 'fixed',
      label: 'Go',
      idealFontPx: 16,
      minFontPx: 12,
      paddingRatio: 1.2,
    },
  ],
});

// The union of ids should be exactly 'headline' | 'cta' — not `string`.
expectTypeOf<ElementIdOf<typeof sample>>().toEqualTypeOf<'headline' | 'cta'>();

// A typo'd id must not be assignable to ElementIdOf<typeof sample>.
// @ts-expect-error 'nope' is not one of the spec's real element ids
const badId: ElementIdOf<typeof sample> = 'nope';
void badId;

// --- Interaction: a passive surface has no minTapTargetPx ----------------

function tapFloor(interaction: Interaction): number | null {
  if (interaction.mode === 'passive') {
    // @ts-expect-error passive interactions carry no minTapTargetPx at all
    return interaction.minTapTargetPx;
  }
  return interaction.minTapTargetPx;
}
void tapFloor;

// Constructing a passive interaction WITH a tap target is not a smaller
// valid surface — it is a value the discriminated union should refuse.
// @ts-expect-error 'passive' has no minTapTargetPx field
const invalidInteraction: Interaction = { mode: 'passive', minTapTargetPx: 44 };
void invalidInteraction;

// --- Viewing: 'far'/'mid' require minTextPx, 'near' must not have one ----

// @ts-expect-error 'far' viewing distance requires minTextPx
const farWithoutFloor: Viewing = { distance: 'far' };
void farWithoutFloor;

// @ts-expect-error 'near' viewing distance carries no minTextPx field
const nearWithFloor: Viewing = { distance: 'near', minTextPx: 20 };
void nearWithFloor;

function textFloor(viewing: Viewing): number | null {
  switch (viewing.distance) {
    case 'near':
      return null;
    case 'mid':
    case 'far':
      return viewing.minTextPx;
  }
}
void textFloor;

// The named ad specs. Mirrors src/demo/surfaces.ts exactly: a named,
// curated list of demo content, with identity (key/label) living entirely
// in the demo layer. The engine (src/engine/) never imports this file and
// never sees these names — resolve() takes any AdSpec, and nothing about
// the algorithm is ad-specific. See NEXT_STEPS_UI_PLAN.md §2.

import type { AdSpec } from '../../engine/spec';
import type { AdPalette } from '../../render/render-dom';
import { keelAd, keelPalette } from './keel';
import { orbitAd, orbitPalette } from './orbit';
import { fernAd, fernPalette } from './fern';
import { fitPulseAd, fitPulsePalette } from './fitpulse';

export interface NamedAd {
  readonly key: string;
  readonly label: string;
  readonly spec: AdSpec;
  readonly palette: AdPalette;
}

export const ads: readonly NamedAd[] = [
  { key: 'keel', label: 'KEEL Tidal 700', spec: keelAd, palette: keelPalette },
  { key: 'orbit', label: 'ORBIT earbuds', spec: orbitAd, palette: orbitPalette },
  { key: 'fern', label: 'FERN meal kit', spec: fernAd, palette: fernPalette },
  { key: 'fitpulse', label: 'FitPulse Pro (watch)', spec: fitPulseAd, palette: fitPulsePalette },
];

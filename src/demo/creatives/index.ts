// The named ad specs. Mirrors src/surfaces.ts exactly: a named,
// curated list of demo content, with identity (key/label) living entirely
// in the demo layer. The engine never imports this file and
// never sees these names — resolve() takes any AdSpec, and nothing about
// the algorithm is ad-specific.

import type { AdSpec } from '../../spec';
import type { AdPalette } from '../../render-dom';
import { keelAd, keelPalette } from './keel';
import { orbitAd, orbitPalette } from './orbit';
import { fernAd, fernPalette } from './fern';
import { sipPulseAd, sipPulsePalette } from './sipPulse';
import { provoxAd, provoxPalette } from './provox';

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
  { key: 'sipPulse', label: 'SipPulse Sparkling', spec: sipPulseAd, palette: sipPulsePalette },
  { key: 'provox', label: 'Provox One ANC', spec: provoxAd, palette: provoxPalette },
];

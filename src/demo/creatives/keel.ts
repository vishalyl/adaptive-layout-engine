// KEEL, a fictional insulated flask brand. See BUILD_SPEC.md §6 for why
// this product was chosen — a tall, narrow hero silhouette (intrinsic
// aspect 0.38) is a genuinely hostile shape to lay out on a 1920×250
// broadcast band, which forces the engine to recompose rather than
// uniformly scale.

import { defineAd } from '../../engine/spec';
import { svgDataUri } from './svg';
import type { AdPalette } from '../../render/render-dom';

const KEEL_MARINE = '#0E2A38';
const KEEL_SEAGLASS = '#86B8A9';
const KEEL_SAND = '#EDE3D0';
const KEEL_SIGNAL = '#F2B705';

// Matches the renderers' own built-in default palette (BUILD_SPEC.md §6.3)
// — passed through explicitly rather than relying on the renderers'
// fallback, so KEEL is a real, ordinary `NamedAd` like ORBIT and FERN, not
// a hidden default the other two are exceptions to.
export const keelPalette: AdPalette = {
  background: KEEL_MARINE,
  text: KEEL_SAND,
  textMuted: 'rgba(237, 227, 208, 0.7)',
  badgeBg: KEEL_SEAGLASS,
  badgeText: KEEL_MARINE,
  ctaBg: KEEL_SIGNAL,
  ctaText: KEEL_MARINE,
};

// A rounded-rectangle flask body with a narrower cap, an accent band at the
// shoulder, and a subtle highlight stripe down the left third.
// Polished with gradient fills, a drop shadow, and a background circle
// for contrast. viewBox is 190×500 → intrinsicAspect 0.38, matched below.
const heroSvg = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 190 500">
    <defs>
      <linearGradient id="keelBody" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#243B44"/>
        <stop offset="100%" stop-color="#1C4A50"/>
      </linearGradient>
      <linearGradient id="keelCap" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#2A555C"/>
        <stop offset="100%" stop-color="#1C4A50"/>
      </linearGradient>
      <filter id="keelShadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="6" stdDeviation="10" flood-opacity="0.35"/>
      </filter>
      <radialGradient id="keelBg" cx="50%" cy="45%" r="55%">
        <stop offset="0%" stop-color="${KEEL_SEAGLASS}" stop-opacity="0.12"/>
        <stop offset="100%" stop-color="${KEEL_SEAGLASS}" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <!-- Background glow circle -->
    <circle cx="95" cy="240" r="120" fill="url(#keelBg)"/>
    <!-- Drop shadow group -->
    <g filter="url(#keelShadow)">
      <!-- Cap -->
      <rect x="75" y="0" width="40" height="34" rx="8" fill="url(#keelCap)"/>
      <rect x="78" y="2" width="6" height="28" rx="3" fill="white" opacity="0.12"/>
      <!-- Neck -->
      <rect x="62" y="28" width="66" height="34" rx="16" fill="url(#keelBody)"/>
      <!-- Bottle body -->
      <rect x="15" y="56" width="160" height="444" rx="56" fill="url(#keelBody)"/>
      <!-- Left highlight -->
      <rect x="15" y="56" width="22" height="430" rx="11" fill="${KEEL_SAND}" opacity="0.10"/>
      <!-- Accent band at shoulder -->
      <rect x="15" y="150" width="160" height="30" fill="${KEEL_SEAGLASS}" opacity="0.85"/>
      <rect x="15" y="150" width="160" height="6" fill="${KEEL_SEAGLASS}" opacity="0.6"/>
      <!-- Subtle bottom reflection -->
      <rect x="15" y="450" width="160" height="50" rx="0" fill="white" opacity="0.04"/>
    </g>
  </svg>
`;

// A simple monogram mark, square (intrinsicAspect 1). Filled with seaglass
// rather than marine: the demo's ad background is marine (§6.3's "ad
// background on dark surfaces"), so a marine-on-marine mark would vanish.
const logoSvg = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
    <rect width="64" height="64" rx="14" fill="${KEEL_SEAGLASS}" />
    <path
      d="M20 14 L20 50 M20 32 L38 14 M20 32 L40 50"
      stroke="${KEEL_MARINE}"
      stroke-width="6"
      stroke-linecap="round"
      stroke-linejoin="round"
      fill="none"
    />
  </svg>
`;

export const keelAd = defineAd({
  name: 'KEEL Tidal 700 — Autumn Sale',
  elements: [
    {
      id: 'headline',
      type: 'text',
      role: 'primary',
      priority: 1,
      degradability: 'shrinkable',
      content: 'Cold for 24 hours. Seriously.',
      idealFontPx: 40,
      minFontPx: 20,
      maxLines: 2,
      weight: 800,
      tracking: -0.5,
    },
    {
      id: 'hero',
      type: 'image',
      role: 'hero',
      priority: 1,
      degradability: 'shrinkable',
      src: svgDataUri(heroSvg),
      intrinsicAspect: 0.38,
      fit: 'contain',
      minShortSidePx: 48,
    },
    {
      id: 'cta',
      type: 'button',
      role: 'action',
      priority: 2,
      degradability: 'fixed',
      label: 'Shop the Tidal',
      idealFontPx: 18,
      minFontPx: 14,
      paddingRatio: 1.4,
    },
    {
      id: 'price',
      type: 'text',
      role: 'secondary',
      priority: 2,
      degradability: 'shrinkable',
      content: '₹2,490 · was ₹3,320',
      idealFontPx: 22,
      minFontPx: 14,
      maxLines: 1,
      weight: 700,
    },
    {
      id: 'logo',
      type: 'image',
      role: 'branding',
      priority: 3,
      degradability: 'droppable',
      src: svgDataUri(logoSvg),
      intrinsicAspect: 1,
      fit: 'contain',
      minShortSidePx: 24,
    },
    {
      id: 'badge',
      type: 'text',
      role: 'incentive',
      priority: 4,
      degradability: 'droppable',
      content: 'Save 25%',
      idealFontPx: 16,
      minFontPx: 11,
      maxLines: 1,
      weight: 700,
    },
    {
      id: 'qr',
      type: 'scan',
      role: 'scan',
      priority: 4,
      degradability: 'droppable',
      payload: 'https://keel.example/tidal-700',
      minModulePx: 4,
      modules: 21,
    },
    {
      id: 'legal',
      type: 'text',
      role: 'legal',
      priority: 5,
      degradability: 'droppable',
      content: 'Offer ends 30 September. Limited stock.',
      idealFontPx: 12,
      minFontPx: 9,
      maxLines: 2,
      weight: 400,
    },
  ],
});

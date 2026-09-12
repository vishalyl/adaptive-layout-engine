// ORBIT, a fictional wireless-earbuds brand. Chosen to stress the engine
// differently than KEEL: a hero that's slightly *wide* (intrinsicAspect
// 1.2, the opposite of KEEL's tall 0.38 flask) and a leaner element list
// (no badge, no legal line) — proving the engine handles a sparse spec as
// gracefully as a rich one. See NEXT_STEPS_UI_PLAN.md §2.

import { defineAd } from '../../engine/spec';
import { svgDataUri } from './svg';
import type { AdPalette } from '../../render/render-dom';

const ORBIT_CHARCOAL = '#2B2724';
const ORBIT_CORAL = '#FF6B4A';
const ORBIT_CREAM = '#F5EDE4';

export const orbitPalette: AdPalette = {
  background: ORBIT_CHARCOAL,
  text: ORBIT_CREAM,
  textMuted: 'rgba(245, 237, 228, 0.7)',
  badgeBg: ORBIT_CORAL,
  badgeText: ORBIT_CHARCOAL,
  ctaBg: ORBIT_CORAL,
  ctaText: ORBIT_CHARCOAL,
};

// A rounded earbud-case shape with more detail: a subtle gradient body,
// hinge line, LED indicator, and two earbuds with stems and grilles.
// Background glow circle for contrast. viewBox is 240×200 → intrinsicAspect 1.2.
const heroSvg = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 200">
    <defs>
      <linearGradient id="orbitCase" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#4A423A"/>
        <stop offset="100%" stop-color="#3E3833"/>
      </linearGradient>
      <linearGradient id="orbitBud" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#F5EDE4"/>
        <stop offset="100%" stop-color="#E8D8C8"/>
      </linearGradient>
      <filter id="orbitShadow" x="-15%" y="-15%" width="130%" height="130%">
        <feDropShadow dx="0" dy="4" stdDeviation="8" flood-opacity="0.30"/>
      </filter>
      <radialGradient id="orbitBg" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="${ORBIT_CREAM}" stop-opacity="0.08"/>
        <stop offset="100%" stop-color="${ORBIT_CREAM}" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <!-- Background glow circle -->
    <circle cx="120" cy="100" r="100" fill="url(#orbitBg)"/>
    <g filter="url(#orbitShadow)">
      <!-- Case body -->
      <rect x="10" y="10" width="220" height="180" rx="42" fill="url(#orbitCase)"/>
      <!-- Case lid line -->
      <line x1="10" y1="100" x2="230" y2="100" stroke="#2B2724" stroke-width="2.5" opacity="0.5"/>
      <!-- Left earbud (visible in left half) -->
      <circle cx="82" cy="82" r="32" fill="url(#orbitBud)"/>
      <circle cx="82" cy="82" r="12" fill="#3E3833"/>
      <circle cx="82" cy="82" r="4" fill="#5C5C5C"/>
      <!-- Earbud stem -->
      <rect x="77" y="110" width="10" height="28" rx="5" fill="url(#orbitBud)"/>
      <!-- Right earbud (visible in right half) -->
      <circle cx="158" cy="82" r="32" fill="url(#orbitBud)"/>
      <circle cx="158" cy="82" r="12" fill="#3E3833"/>
      <circle cx="158" cy="82" r="4" fill="#5C5C5C"/>
      <!-- Earbud stem -->
      <rect x="153" y="110" width="10" height="28" rx="5" fill="url(#orbitBud)"/>
      <!-- Hinge detail -->
      <rect x="112" y="14" width="16" height="8" rx="4" fill="${ORBIT_CORAL}"/>
      <!-- Subtle highlight -->
      <rect x="10" y="10" width="220" height="4" rx="2" fill="white" opacity="0.08"/>
    </g>
  </svg>
`;

// A ring monogram "O", square (intrinsicAspect 1). Filled with cream rather
// than charcoal: the ad background is charcoal, so a charcoal-on-charcoal
// mark would vanish (the same reasoning KEEL's logo follows, §6.3).
const logoSvg = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
    <rect width="64" height="64" rx="14" fill="${ORBIT_CREAM}" />
    <circle cx="32" cy="32" r="19" fill="none" stroke="${ORBIT_CHARCOAL}" stroke-width="8" />
  </svg>
`;

export const orbitAd = defineAd({
  name: 'ORBIT earbuds — Launch',
  elements: [
    {
      id: 'headline',
      type: 'text',
      role: 'primary',
      priority: 1,
      degradability: 'shrinkable',
      content: '48 hours of charge. Zero excuses.',
      idealFontPx: 36,
      minFontPx: 20,
      maxLines: 2,
      weight: 800,
      tracking: -0.3,
    },
    {
      id: 'hero',
      type: 'image',
      role: 'hero',
      priority: 1,
      degradability: 'shrinkable',
      src: svgDataUri(heroSvg),
      intrinsicAspect: 1.2,
      fit: 'contain',
      minShortSidePx: 48,
    },
    {
      id: 'price',
      type: 'text',
      role: 'secondary',
      priority: 2,
      degradability: 'shrinkable',
      content: '$129',
      idealFontPx: 24,
      minFontPx: 14,
      maxLines: 1,
      weight: 700,
    },
    {
      id: 'cta',
      type: 'button',
      role: 'action',
      priority: 2,
      degradability: 'fixed',
      label: 'Get Orbit',
      idealFontPx: 18,
      minFontPx: 14,
      paddingRatio: 1.4,
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
      id: 'qr',
      type: 'scan',
      role: 'scan',
      priority: 4,
      degradability: 'droppable',
      payload: 'https://orbit.example/earbuds',
      minModulePx: 4,
      modules: 21,
    },
  ],
});

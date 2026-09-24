// ORBIT, a fictional wireless-earbuds brand. Chosen to stress the engine
// differently than KEEL: a hero that's slightly *wide* (intrinsicAspect
// 1.2, the opposite of KEEL's tall 0.38 flask) and a leaner element list
// (no badge, no legal line) — proving the engine handles a sparse spec as
// gracefully as a rich one.

import { defineAd } from '../../spec';
import { brandLockup, svgDataUri } from './svg';
import type { AdPalette } from '../../render-dom';

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
      <linearGradient id="orbitBudHighlight" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.3"/>
        <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
      </linearGradient>
      <filter id="orbitShadow" x="-15%" y="-15%" width="130%" height="130%">
        <feDropShadow dx="0" dy="4" stdDeviation="8" flood-opacity="0.30"/>
      </filter>
      <filter id="orbitShadowSoft" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="8" stdDeviation="14" flood-opacity="0.15"/>
      </filter>
      <radialGradient id="orbitBg" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="${ORBIT_CREAM}" stop-opacity="0.10"/>
        <stop offset="100%" stop-color="${ORBIT_CREAM}" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="orbitSpeaker" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#5C5C5C"/>
        <stop offset="60%" stop-color="#4A4A4A"/>
        <stop offset="100%" stop-color="#3E3E3E"/>
      </radialGradient>
    </defs>
    <!-- Background glow circle (slightly larger, more diffuse) -->
    <circle cx="120" cy="100" r="110" fill="url(#orbitBg)" opacity="0.8"/>
    <g filter="url(#orbitShadowSoft)">
      <!-- Case body -->
      <rect x="10" y="10" width="220" height="180" rx="42" fill="url(#orbitCase)"/>
      <!-- Top highlight (specular reflection) -->
      <rect x="10" y="10" width="220" height="6" rx="3" fill="white" opacity="0.07"/>
      <!-- Left edge highlight -->
      <rect x="10" y="16" width="3" height="168" rx="1.5" fill="white" opacity="0.04"/>
      <!-- Case lid line -->
      <line x1="10" y1="100" x2="230" y2="100" stroke="#2B2724" stroke-width="2.5" opacity="0.5"/>
      <!-- Left earbud (visible in left half) -->
      <circle cx="82" cy="82" r="32" fill="url(#orbitBud)"/>
      <!-- Earbud specular highlight -->
      <circle cx="78" cy="76" r="14" fill="white" opacity="0.12"/>
      <!-- Inner grille -->
      <circle cx="82" cy="82" r="14" fill="url(#orbitSpeaker)"/>
      <!-- Speaker mesh dots -->
      <circle cx="82" cy="82" r="5" fill="#3E3833" opacity="0.6"/>
      <circle cx="79" cy="80" r="1.5" fill="#3E3833" opacity="0.4"/>
      <circle cx="85" cy="80" r="1.5" fill="#3E3833" opacity="0.4"/>
      <circle cx="79" cy="84" r="1.5" fill="#3E3833" opacity="0.4"/>
      <circle cx="85" cy="84" r="1.5" fill="#3E3833" opacity="0.4"/>
      <!-- Center dot -->
      <circle cx="82" cy="82" r="4" fill="#5C5C5C"/>
      <!-- Earbud stem -->
      <rect x="77" y="110" width="10" height="30" rx="5" fill="url(#orbitBud)"/>
      <!-- Stem specular -->
      <rect x="78" y="112" width="2" height="26" rx="1" fill="white" opacity="0.08"/>
      <!-- Stem tip (smaller oval) -->
      <ellipse cx="82" cy="142" rx="4" ry="2" fill="url(#orbitBud)"/>
      <!-- Right earbud (visible in right half) -->
      <circle cx="158" cy="82" r="32" fill="url(#orbitBud)"/>
      <!-- Earbud specular highlight -->
      <circle cx="154" cy="76" r="14" fill="white" opacity="0.12"/>
      <!-- Inner grille -->
      <circle cx="158" cy="82" r="14" fill="url(#orbitSpeaker)"/>
      <circle cx="158" cy="82" r="5" fill="#3E3833" opacity="0.6"/>
      <circle cx="155" cy="80" r="1.5" fill="#3E3833" opacity="0.4"/>
      <circle cx="161" cy="80" r="1.5" fill="#3E3833" opacity="0.4"/>
      <circle cx="155" cy="84" r="1.5" fill="#3E3833" opacity="0.4"/>
      <circle cx="161" cy="84" r="1.5" fill="#3E3833" opacity="0.4"/>
      <circle cx="158" cy="82" r="4" fill="#5C5C5C"/>
      <!-- Earbud stem -->
      <rect x="153" y="110" width="10" height="30" rx="5" fill="url(#orbitBud)"/>
      <rect x="154" y="112" width="2" height="26" rx="1" fill="white" opacity="0.08"/>
      <ellipse cx="158" cy="142" rx="4" ry="2" fill="url(#orbitBud)"/>
      <!-- Hinge detail -->
      <rect x="112" y="14" width="16" height="8" rx="4" fill="${ORBIT_CORAL}"/>
      <!-- Hinge reflection -->
      <rect x="113" y="15" width="14" height="2" rx="1" fill="white" opacity="0.25"/>
    </g>
  </svg>
`;

// A ring monogram "O", square (intrinsicAspect 1). Filled with cream rather
// than charcoal: the ad background is charcoal, so a charcoal-on-charcoal
// mark would vanish (the same reasoning KEEL's logo follows).
// Brand lockup: the monogram tile plus the brand name, so the brand is
// legible wherever the logo survives (see brandLockup in svg.ts).
const logo = brandLockup({
  tile: `
    <rect width="64" height="64" rx="14" fill="${ORBIT_CREAM}" />
    <circle cx="32" cy="32" r="19" fill="none" stroke="${ORBIT_CHARCOAL}" stroke-width="8" />
  `,
  name: 'ORBIT',
  nameColor: ORBIT_CREAM,
  charWidth: 29,
});

export const orbitAd = defineAd({
  name: 'ORBIT earbuds — Launch',
  background: ORBIT_CHARCOAL,
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
      priority: 2,
      degradability: 'droppable',
      src: svgDataUri(logo.svg),
      markColor: ORBIT_CREAM,
      intrinsicAspect: logo.aspect,
      fit: 'contain',
      minShortSidePx: 22,
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

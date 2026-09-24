// FERN, a fictional meal-kit subscription brand. Chosen as the inverse
// stress case to KEEL: a hero hostile to *tall* surfaces rather than short
// ones — a flat-lay ingredients-box silhouette (intrinsicAspect 1.6, wide
// landscape) that should look genuinely awkward wherever KEEL's tall bottle
// looks comfortable, and vice versa.

import { defineAd } from '../../spec';
import { brandLockup, svgDataUri } from './svg';
import type { AdPalette } from '../../render-dom';

const FERN_FOREST = '#2F4A34';
const FERN_MOSS = '#5C8A5A';
const FERN_CREAM = '#F7F1E3';
const FERN_KRAFT = '#C9A876';
const FERN_TOMATO = '#D9643A';

export const fernPalette: AdPalette = {
  background: FERN_FOREST,
  text: FERN_CREAM,
  textMuted: 'rgba(247, 241, 227, 0.7)',
  badgeBg: FERN_MOSS,
  badgeText: FERN_CREAM,
  ctaBg: FERN_TOMATO,
  ctaText: FERN_CREAM,
};

// A flat-lay ingredients box with a kraft-paper tray, three realistic
// ingredient shapes (tomato, carrot, herb), leaf accents, and subtle
// gradients. Background glow circle for contrast.
// viewBox is 320×200 → intrinsicAspect 1.6, matched below in the spec.
const heroSvg = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200">
    <defs>
      <linearGradient id="fernTray" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#D4B486"/>
        <stop offset="100%" stop-color="#C9A876"/>
      </linearGradient>
      <linearGradient id="fernTomato" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#E8734A"/>
        <stop offset="100%" stop-color="#D9643A"/>
      </linearGradient>
      <linearGradient id="fernCarrot" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#F0A060"/>
        <stop offset="100%" stop-color="#E8944A"/>
      </linearGradient>
      <linearGradient id="fernMoss" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#6A9E68"/>
        <stop offset="100%" stop-color="#5C8A5A"/>
      </linearGradient>
      <filter id="fernShadow" x="-10%" y="-10%" width="120%" height="120%">
        <feDropShadow dx="0" dy="4" stdDeviation="6" flood-opacity="0.25"/>
      </filter>
      <filter id="fernShadowGround" x="-10%" y="-10%" width="120%" height="120%">
        <feDropShadow dx="0" dy="8" stdDeviation="12" flood-opacity="0.15"/>
      </filter>
      <radialGradient id="fernBg" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="${FERN_MOSS}" stop-opacity="0.10"/>
        <stop offset="100%" stop-color="${FERN_MOSS}" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <!-- Background glow circle -->
    <circle cx="160" cy="100" r="125" fill="url(#fernBg)" opacity="0.85"/>
    <!-- Ground shadow under tray -->
    <ellipse cx="160" cy="198" rx="155" ry="6" fill="${FERN_FOREST}" opacity="0.12"/>
    <g filter="url(#fernShadowGround)">
      <!-- Tray body -->
      <rect x="4" y="20" width="312" height="176" rx="18" fill="url(#fernTray)"/>
      <!-- Tray corner fold details -->
      <path d="M22 20 L22 38 L4 38" fill="none" stroke="${FERN_KRAFT}" stroke-width="1" opacity="0.2"/>
      <path d="M318 20 L318 38 L300 38" fill="none" stroke="${FERN_KRAFT}" stroke-width="1" opacity="0.2"/>
      <path d="M22 196 L22 178 L4 178" fill="none" stroke="${FERN_KRAFT}" stroke-width="1" opacity="0.2"/>
      <path d="M318 196 L318 178 L300 178" fill="none" stroke="${FERN_KRAFT}" stroke-width="1" opacity="0.2"/>
      <!-- Tray inner shadow / rim -->
      <rect x="4" y="4" width="312" height="28" rx="12" fill="${FERN_FOREST}" opacity="0.12"/>
      <rect x="12" y="28" width="296" height="164" rx="10" fill="none" stroke="${FERN_KRAFT}" stroke-width="1" opacity="0.25"/>
      <!-- Subtle texture lines on tray -->
      <line x1="60" y1="50" x2="60" y2="170" stroke="${FERN_KRAFT}" stroke-width="0.5" opacity="0.15"/>
      <line x1="160" y1="50" x2="160" y2="170" stroke="${FERN_KRAFT}" stroke-width="0.5" opacity="0.15"/>
      <line x1="260" y1="50" x2="260" y2="170" stroke="${FERN_KRAFT}" stroke-width="0.5" opacity="0.15"/>
      <line x1="110" y1="50" x2="110" y2="170" stroke="${FERN_KRAFT}" stroke-width="0.5" opacity="0.10"/>
      <line x1="210" y1="50" x2="210" y2="170" stroke="${FERN_KRAFT}" stroke-width="0.5" opacity="0.10"/>
      <line x1="310" y1="50" x2="310" y2="170" stroke="${FERN_KRAFT}" stroke-width="0.5" opacity="0.10"/>
      <!-- Tomato (left) -->
      <circle cx="92" cy="112" r="54" fill="url(#fernTomato)"/>
      <circle cx="86" cy="104" r="10" fill="white" opacity="0.10"/>
      <!-- Tomato surface texture (small dots) -->
      <circle cx="80" cy="95" r="1" fill="white" opacity="0.08"/>
      <circle cx="95" cy="100" r="1" fill="white" opacity="0.06"/>
      <circle cx="75" cy="110" r="1" fill="white" opacity="0.07"/>
      <circle cx="100" cy="118" r="1" fill="white" opacity="0.06"/>
      <circle cx="85" cy="125" r="1" fill="white" opacity="0.05"/>
      <!-- Tomato stem dimple -->
      <circle cx="92" cy="58" r="5" fill="${FERN_FOREST}" opacity="0.3"/>
      <!-- Tomato leaf -->
      <ellipse cx="92" cy="58" rx="14" ry="6" fill="${FERN_FOREST}" opacity="0.6" transform="rotate(-15,92,58)"/>
      <!-- Leaf vein -->
      <line x1="78" y1="58" x2="106" y2="58" stroke="${FERN_MOSS}" stroke-width="0.5" opacity="0.4"/>
      <!-- Carrot (top-right) -->
      <circle cx="210" cy="72" r="44" fill="url(#fernCarrot)"/>
      <circle cx="204" cy="64" r="8" fill="white" opacity="0.10"/>
      <!-- Carrot surface texture -->
      <circle cx="195" cy="60" r="1" fill="white" opacity="0.07"/>
      <circle cx="215" cy="68" r="1" fill="white" opacity="0.06"/>
      <circle cx="200" cy="80" r="1" fill="white" opacity="0.05"/>
      <circle cx="220" cy="78" r="1" fill="white" opacity="0.06"/>
      <!-- Carrot top -->
      <path d="M210 28 Q200 18 208 12 Q216 8 212 18 Z" fill="${FERN_MOSS}" opacity="0.7"/>
      <path d="M210 28 Q220 16 228 14 Q224 8 218 16 Z" fill="${FERN_MOSS}" opacity="0.6"/>
      <!-- Herb/basil (bottom-right) -->
      <circle cx="236" cy="148" r="40" fill="url(#fernMoss)"/>
      <circle cx="230" cy="140" r="7" fill="white" opacity="0.10"/>
      <!-- Herb surface texture -->
      <circle cx="220" cy="135" r="1" fill="white" opacity="0.06"/>
      <circle cx="245" cy="140" r="1" fill="white" opacity="0.05"/>
      <circle cx="228" cy="155" r="1" fill="white" opacity="0.05"/>
      <!-- Herb leaf detail -->
      <ellipse cx="236" cy="108" rx="12" ry="5" fill="${FERN_FOREST}" opacity="0.5" transform="rotate(20,236,108)"/>
      <!-- Steam/wisp lines above ingredients -->
      <path d="M80 40 Q85 25 80 10" fill="none" stroke="white" stroke-width="1" opacity="0.06" stroke-linecap="round"/>
      <path d="M160 35 Q165 20 160 5" fill="none" stroke="white" stroke-width="1" opacity="0.05" stroke-linecap="round"/>
      <path d="M240 30 Q245 15 240 0" fill="none" stroke="white" stroke-width="1" opacity="0.04" stroke-linecap="round"/>
      <!-- Highlight on tray -->
      <rect x="4" y="20" width="312" height="3" rx="1.5" fill="white" opacity="0.12"/>
    </g>
  </svg>
`;

// Brand lockup: a leaf monogram on moss, plus the name.
const logo = brandLockup({
  tile: `
    <rect width="64" height="64" rx="14" fill="${FERN_MOSS}" />
    <path d="M18 46 C18 26 30 16 48 16 C48 34 38 46 18 46 Z" fill="${FERN_CREAM}" />
    <path d="M20 44 L40 24" stroke="${FERN_MOSS}" stroke-width="3" stroke-linecap="round" />
  `,
  name: 'FERN',
  nameColor: FERN_CREAM,
  charWidth: 30,
});

export const fernAd = defineAd({
  name: 'FERN meal kit — Trial box',
  background: FERN_FOREST,
  elements: [
    {
      id: 'headline',
      type: 'text',
      role: 'primary',
      priority: 1,
      degradability: 'shrinkable',
      content: 'Dinner, decided. In 20 minutes.',
      idealFontPx: 38,
      minFontPx: 20,
      maxLines: 2,
      weight: 800,
      tracking: -0.4,
    },
    {
      id: 'hero',
      type: 'image',
      role: 'hero',
      priority: 1,
      degradability: 'shrinkable',
      src: svgDataUri(heroSvg),
      intrinsicAspect: 1.6,
      fit: 'contain',
      minShortSidePx: 48,
    },
    {
      id: 'cta',
      type: 'button',
      role: 'action',
      priority: 2,
      degradability: 'fixed',
      label: 'Start my box',
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
      content: 'From $8.99/serving',
      idealFontPx: 20,
      minFontPx: 14,
      maxLines: 1,
      weight: 700,
    },
    {
      id: 'logo',
      type: 'image',
      role: 'branding',
      priority: 2,
      degradability: 'droppable',
      src: svgDataUri(logo.svg),
      markColor: FERN_CREAM,
      intrinsicAspect: logo.aspect,
      fit: 'contain',
      minShortSidePx: 22,
    },
    {
      id: 'badge',
      type: 'text',
      role: 'incentive',
      priority: 4,
      degradability: 'droppable',
      content: 'First box free',
      idealFontPx: 16,
      minFontPx: 11,
      maxLines: 1,
      weight: 700,
    },
    {
      id: 'legal',
      type: 'text',
      role: 'legal',
      priority: 5,
      degradability: 'droppable',
      content: 'New customers only. Cancel anytime.',
      idealFontPx: 12,
      minFontPx: 9,
      maxLines: 2,
      weight: 400,
    },
  ],
});

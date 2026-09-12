// FERN, a fictional meal-kit subscription brand. Chosen as the inverse
// stress case to KEEL: a hero hostile to *tall* surfaces rather than short
// ones — a flat-lay ingredients-box silhouette (intrinsicAspect 1.6, wide
// landscape) that should look genuinely awkward wherever KEEL's tall bottle
// looks comfortable, and vice versa. See NEXT_STEPS_UI_PLAN.md §2.

import { defineAd } from '../../engine/spec';
import { svgDataUri } from './svg';
import type { AdPalette } from '../../render/render-dom';

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
      <radialGradient id="fernBg" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="${FERN_MOSS}" stop-opacity="0.08"/>
        <stop offset="100%" stop-color="${FERN_MOSS}" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <!-- Background glow circle -->
    <circle cx="160" cy="100" r="120" fill="url(#fernBg)"/>
    <g filter="url(#fernShadow)">
      <!-- Tray body -->
      <rect x="4" y="20" width="312" height="176" rx="18" fill="url(#fernTray)"/>
      <!-- Tray inner shadow / rim -->
      <rect x="4" y="4" width="312" height="28" rx="12" fill="${FERN_FOREST}" opacity="0.12"/>
      <rect x="12" y="28" width="296" height="164" rx="10" fill="none" stroke="${FERN_KRAFT}" stroke-width="1" opacity="0.25"/>
      <!-- Subtle texture lines on tray -->
      <line x1="60" y1="50" x2="60" y2="170" stroke="${FERN_KRAFT}" stroke-width="0.5" opacity="0.15"/>
      <line x1="160" y1="50" x2="160" y2="170" stroke="${FERN_KRAFT}" stroke-width="0.5" opacity="0.15"/>
      <line x1="260" y1="50" x2="260" y2="170" stroke="${FERN_KRAFT}" stroke-width="0.5" opacity="0.15"/>
      <!-- Tomato (left) -->
      <circle cx="92" cy="112" r="54" fill="url(#fernTomato)"/>
      <circle cx="86" cy="104" r="10" fill="white" opacity="0.10"/>
      <!-- Tomato leaf -->
      <ellipse cx="92" cy="58" rx="14" ry="6" fill="${FERN_FOREST}" opacity="0.6" transform="rotate(-15,92,58)"/>
      <!-- Carrot (top-right) -->
      <circle cx="210" cy="72" r="44" fill="url(#fernCarrot)"/>
      <circle cx="204" cy="64" r="8" fill="white" opacity="0.10"/>
      <!-- Carrot top -->
      <path d="M210 28 Q200 18 208 12 Q216 8 212 18 Z" fill="${FERN_MOSS}" opacity="0.7"/>
      <path d="M210 28 Q220 16 228 14 Q224 8 218 16 Z" fill="${FERN_MOSS}" opacity="0.6"/>
      <!-- Herb/basil (bottom-right) -->
      <circle cx="236" cy="148" r="40" fill="url(#fernMoss)"/>
      <circle cx="230" cy="140" r="7" fill="white" opacity="0.10"/>
      <!-- Herb leaf detail -->
      <ellipse cx="236" cy="108" rx="12" ry="5" fill="${FERN_FOREST}" opacity="0.5" transform="rotate(20,236,108)"/>
      <!-- Highlight on tray -->
      <rect x="4" y="20" width="312" height="3" rx="1.5" fill="white" opacity="0.12"/>
    </g>
  </svg>
`;

export const fernAd = defineAd({
  name: 'FERN meal kit — Trial box',
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

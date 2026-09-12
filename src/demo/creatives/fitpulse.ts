// FitPulse Pro, a fictional smartwatch. A dense ad with many zones that
// demonstrates the engine's degradation capability — on small surfaces
// it gracefully drops lower-priority elements while keeping the hero,
// headline, and CTA intact.

import { defineAd } from '../../engine/spec';
import { svgDataUri } from './svg';
import type { AdPalette } from '../../render/render-dom';

const FIT_PULSE_DARK = '#1A1A2E';
const FIT_PULSE_PURPLE = '#6C5CE7';
const FIT_PULSE_TEAL = '#00B894';
const FIT_PULSE_LAVENDER = '#E8E4F0';

export const fitPulsePalette: AdPalette = {
  background: FIT_PULSE_DARK,
  text: FIT_PULSE_LAVENDER,
  textMuted: 'rgba(232, 228, 240, 0.65)',
  badgeBg: FIT_PULSE_PURPLE,
  badgeText: '#FFFFFF',
  ctaBg: FIT_PULSE_TEAL,
  ctaText: '#FFFFFF',
};

// A stylized smartwatch face with gradient fills, a detailed dial with
// sub-dials, illuminated markers, band details, and a subtle glow effect.
// viewBox 200×200 → intrinsicAspect 1.0.
const watchSvg = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
    <defs>
      <linearGradient id="fitBand" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#3D3D55"/>
        <stop offset="100%" stop-color="#2D2D44"/>
      </linearGradient>
      <linearGradient id="fitFace" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#33427A"/>
        <stop offset="100%" stop-color="#202C52"/>
      </linearGradient>
      <linearGradient id="fitRing" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${FIT_PULSE_PURPLE}"/>
        <stop offset="100%" stop-color="${FIT_PULSE_TEAL}"/>
      </linearGradient>
      <filter id="fitGlow" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="6" result="blur"/>
        <feComposite in="SourceGraphic" in2="blur" operator="over"/>
      </filter>
      <filter id="fitShadow" x="-15%" y="-15%" width="130%" height="130%">
        <feDropShadow dx="0" dy="4" stdDeviation="8" flood-opacity="0.35"/>
      </filter>
      <radialGradient id="fitBg" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="${FIT_PULSE_PURPLE}" stop-opacity="0.10"/>
        <stop offset="100%" stop-color="${FIT_PULSE_PURPLE}" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <!-- Background glow circle -->
    <circle cx="100" cy="100" r="100" fill="url(#fitBg)"/>
    <g filter="url(#fitShadow)">
      <!-- Top band -->
      <rect x="50" y="10" width="100" height="30" rx="10" fill="url(#fitBand)"/>
      <rect x="55" y="12" width="90" height="8" rx="4" fill="white" opacity="0.06"/>
      <!-- Band attachment points -->
      <rect x="65" y="36" width="70" height="4" rx="2" fill="${FIT_PULSE_PURPLE}" opacity="0.4"/>
      <!-- Bottom band -->
      <rect x="50" y="160" width="100" height="30" rx="10" fill="url(#fitBand)"/>
      <rect x="55" y="180" width="90" height="8" rx="4" fill="white" opacity="0.06"/>
      <!-- Band attachment points -->
      <rect x="65" y="160" width="70" height="4" rx="2" fill="${FIT_PULSE_PURPLE}" opacity="0.4"/>
      <!-- Band texture lines -->
      <line x1="60" y1="20" x2="60" y2="36" stroke="#4A4A66" stroke-width="1" opacity="0.3"/>
      <line x1="70" y1="20" x2="70" y2="36" stroke="#4A4A66" stroke-width="1" opacity="0.3"/>
      <line x1="80" y1="20" x2="80" y2="36" stroke="#4A4A66" stroke-width="1" opacity="0.3"/>
      <line x1="120" y1="164" x2="120" y2="180" stroke="#4A4A66" stroke-width="1" opacity="0.3"/>
      <line x1="130" y1="164" x2="130" y2="180" stroke="#4A4A66" stroke-width="1" opacity="0.3"/>
      <line x1="140" y1="164" x2="140" y2="180" stroke="#4A4A66" stroke-width="1" opacity="0.3"/>
      <!-- Watch case outer -->
      <circle cx="100" cy="100" r="72" fill="#26325C" stroke="url(#fitRing)" stroke-width="6"/>
      <!-- Watch face -->
      <circle cx="100" cy="100" r="66" fill="url(#fitFace)"/>
      <!-- Inner bezel ring -->
      <circle cx="100" cy="100" r="62" fill="none" stroke="#2D2D44" stroke-width="1"/>
      <!-- Accent ring with gradient -->
      <circle cx="100" cy="100" r="60" fill="none" stroke="url(#fitRing)" stroke-width="3" stroke-dasharray="8 4" opacity="0.7"/>
      <!-- Sub-dial (top-left, heart rate) -->
      <circle cx="72" cy="72" r="14" fill="none" stroke="${FIT_PULSE_PURPLE}" stroke-width="0.8" opacity="0.4"/>
      <text x="72" y="75" text-anchor="middle" font-size="6" fill="${FIT_PULSE_PURPLE}" opacity="0.6" font-family="sans-serif">72</text>
      <!-- Sub-dial (bottom-right, steps) -->
      <circle cx="128" cy="128" r="14" fill="none" stroke="${FIT_PULSE_TEAL}" stroke-width="0.8" opacity="0.4"/>
      <text x="128" y="131" text-anchor="middle" font-size="5" fill="${FIT_PULSE_TEAL}" opacity="0.6" font-family="sans-serif">8.4k</text>
      <!-- Hour markers -->
      ${[0,1,2,3,4,5,6,7,8,9,10,11].map(i => {
        const a = (i * 30) * Math.PI / 180;
        const x = 100 + 65 * Math.cos(a);
        const y = 100 + 65 * Math.sin(a);
        const isMajor = i % 3 === 0;
        return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${isMajor ? 2.5 : 1.5}" fill="${FIT_PULSE_LAVENDER}" opacity="${isMajor ? 0.7 : 0.35}"/>`;
      }).join('')}
      <!-- Hour hand (pointing to ~10) -->
      <line x1="100" y1="100" x2="72" y2="72" stroke="${FIT_PULSE_LAVENDER}" stroke-width="3.5" stroke-linecap="round" opacity="0.85"/>
      <!-- Minute hand (pointing to ~2) -->
      <line x1="100" y1="100" x2="140" y2="85" stroke="${FIT_PULSE_LAVENDER}" stroke-width="2" stroke-linecap="round" opacity="0.7"/>
      <!-- Second hand (accent color, pointing to ~6) -->
      <line x1="100" y1="100" x2="100" y2="150" stroke="${FIT_PULSE_TEAL}" stroke-width="1" stroke-linecap="round" opacity="0.5"/>
      <!-- Center dot -->
      <circle cx="100" cy="100" r="5" fill="${FIT_PULSE_TEAL}" filter="url(#fitGlow)"/>
      <circle cx="100" cy="100" r="2.5" fill="#FFFFFF"/>
      <!-- Crown button on right side -->
      <rect x="172" y="88" width="8" height="24" rx="4" fill="#3D3D55"/>
      <rect x="174" y="90" width="2" height="8" rx="1" fill="white" opacity="0.1"/>
    </g>
  </svg>
`;

// A simple brand monogram SVG.
const logoSvg = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
    <rect width="64" height="64" rx="12" fill="${FIT_PULSE_PURPLE}"/>
    <text x="32" y="42" text-anchor="middle" font-size="28" font-weight="bold" fill="white" font-family="sans-serif">F</text>
  </svg>
`;

export const fitPulseAd = defineAd({
  name: 'FitPulse Pro — Smartwatch',
  elements: [
    {
      id: 'hero',
      type: 'image',
      role: 'hero',
      priority: 1,
      degradability: 'shrinkable',
      src: svgDataUri(watchSvg),
      intrinsicAspect: 1,
      fit: 'contain',
      minShortSidePx: 40,
    },
    {
      id: 'headline',
      type: 'text',
      role: 'primary',
      priority: 1,
      degradability: 'shrinkable',
      content: 'FitPulse Pro',
      idealFontPx: 48,
      minFontPx: 18,
      maxLines: 1,
      weight: 800,
      tracking: -0.3,
    },
    {
      id: 'subtitle',
      type: 'text',
      role: 'secondary',
      priority: 2,
      degradability: 'shrinkable',
      content: 'Track every beat. Own every run.',
      idealFontPx: 22,
      minFontPx: 12,
      maxLines: 1,
      weight: 500,
    },
    {
      id: 'features',
      type: 'text',
      role: 'secondary',
      priority: 2,
      degradability: 'shrinkable',
      content: 'GPS · Heart Rate · 7-Day Battery · 50m Waterproof',
      idealFontPx: 16,
      minFontPx: 10,
      maxLines: 2,
      weight: 500,
    },
    {
      id: 'cta',
      type: 'button',
      role: 'action',
      priority: 2,
      degradability: 'fixed',
      label: 'Buy Now — $299',
      idealFontPx: 20,
      minFontPx: 12,
      paddingRatio: 1.6,
    },
    {
      id: 'badge',
      type: 'text',
      role: 'incentive',
      priority: 3,
      degradability: 'droppable',
      content: '★ 4.9 (12k reviews)',
      idealFontPx: 16,
      minFontPx: 10,
      maxLines: 1,
      weight: 700,
    },
    {
      id: 'promo',
      type: 'text',
      role: 'incentive',
      priority: 3,
      degradability: 'droppable',
      content: 'Pre-order ships Oct 15',
      idealFontPx: 15,
      minFontPx: 10,
      maxLines: 1,
      weight: 600,
    },
    {
      id: 'logo',
      type: 'image',
      role: 'branding',
      priority: 4,
      degradability: 'droppable',
      src: svgDataUri(logoSvg),
      intrinsicAspect: 1,
      fit: 'contain',
      minShortSidePx: 20,
    },
    {
      id: 'qr',
      type: 'scan',
      role: 'scan',
      priority: 4,
      degradability: 'droppable',
      payload: 'https://fitpulse.example/pro',
      minModulePx: 3,
      modules: 21,
    },
    {
      id: 'legal',
      type: 'text',
      role: 'legal',
      priority: 5,
      degradability: 'droppable',
      content: 'Water resistance tested to ISO 22810. Battery life varies with usage.',
      idealFontPx: 10,
      minFontPx: 8,
      maxLines: 2,
      weight: 400,
    },
  ],
});

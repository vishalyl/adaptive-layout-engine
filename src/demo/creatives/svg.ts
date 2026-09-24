// Shared by every ad's hand-authored inline SVG hero/logo art — embedded as
// data URIs so the deployed demo has no network dependency, no
// broken-image risk, and an exactly known intrinsic aspect ratio.

export function svgDataUri(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg.trim())}`;
}

// A brand lockup: a 64×64 monogram tile followed by the brand name as a
// wordmark. The wordmark's width is pinned with `textLength`, so the lockup
// has an exact, font-independent aspect ratio (an SVG inside an <img> can't
// load the page's webfont, so without this the fallback font would decide
// the width). The engine sizes the whole lockup as one branding image.
export interface Lockup {
  readonly svg: string;
  readonly aspect: number; // width / height
}

const TILE = 64;
const GAP = 14;
const NAME_SIZE = 40;

export function brandLockup(opts: {
  readonly tile: string; // the monogram's inner SVG, drawn in a 64×64 box
  readonly name: string;
  readonly nameColor: string;
  readonly charWidth?: number; // wordmark advance per character, in viewBox units
}): Lockup {
  const nameWidth = Math.round(opts.name.length * (opts.charWidth ?? 29));
  const width = TILE + GAP + nameWidth;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${TILE}">
      ${opts.tile}
      <text x="${TILE + GAP}" y="${TILE / 2 + NAME_SIZE * 0.36}" font-family="Archivo, Arial, Helvetica, sans-serif"
        font-size="${NAME_SIZE}" font-weight="800" fill="${opts.nameColor}"
        textLength="${nameWidth}" lengthAdjust="spacingAndGlyphs">${opts.name}</text>
    </svg>`;
  return { svg, aspect: width / TILE };
}

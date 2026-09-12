// Shared by every ad's hand-authored inline SVG hero/logo art — embedded as
// data URIs so the deployed demo has no network dependency, no
// broken-image risk, and an exactly known intrinsic aspect ratio. See
// BUILD_SPEC.md §6.2.

export function svgDataUri(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg.trim())}`;
}

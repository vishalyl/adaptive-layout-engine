# Adaptive Layout Engine for Multi-Surface Ads

One ad spec. One resolver. Any surface.

Given a creative's content and any surface's real geometry and constraints, the resolver computes a layout that genuinely recomposes for that surface — never just scaling one fixed design up or down. The same ad looks structurally different on a broadcast lower-third than it does on a retail kiosk, because it is solving a different geometry problem each time.

Built by **Y.L. Vishal** (VIT Chennai, Roll No: 22MIA1073) for **Flam's Frontend R&D Assignment**, as an application for the **Software Engineering Intern** role in Bangalore.

---

## Setup

```bash
cd adaptive-layout-engine
npm install
```

---

## Running the Demo

```bash
npm run dev          # start dev server (HMR, hot reload)
npm run build        # production build (outputs to dist/)
npm run preview      # preview the production build locally
```

Open the URL shown in the terminal. The app opens on the Live Demo tab with the default ad (KEEL Tidal 700) and the mobile landscape surface.

---

## How to Use

1. **Switch surfaces** — click the six surface chips (Mobile interstitial, Mobile landscape, Broadcast lower-third, Retail kiosk, Print-to-digital QR panel, Compact banner) and watch the same ad recompose differently on each.

2. **Switch creatives** — use the ad picker (KEEL, ORBIT, FERN, FitPulse Pro). The same surfaces produce different layouts for different ads.

3. **Custom surface** — drag any slider in the Custom surface panel to invent a profile the engine has never seen and watch it classify and resolve in real time. Use the presets (Ultra-wide ticker, Skyscraper, Square mid, Micro) or paste a raw JSON profile.

4. **Compare mode** — toggle the Compare switch to see the fixed baseline layout (mobilePortrait 320x480) side by side with the current adaptive layout.

5. **Renderer toggle** — switch between DOM and Canvas backends on the same surface. Both render the exact same resolved layout independently.

6. **Keyboard shortcuts** — `1-4` switch creatives, `R` toggles renderer, `C` toggles compare, `D` toggles debug overlay.

7. **Stress test** — click the "Stress test" button in the diagnostics panel to resolve the current ad on all six surfaces back-to-back.

---

## Resolution Flow

```
Ad Spec + Surface Profile -> Constraint Resolver -> Resolved Layout -> Renderer
```

The resolver runs seven phases in sequence:

| Phase | Name | What it does |
|-------|------|-------------|
| 0 | Normalise | Converts raw surface numbers (width, height, safe area, interaction mode, viewing distance) into one flat usable rectangle plus constraint floors (tap-target size, minimum text size). Every later phase reads from this, never from the raw surface. |
| 1 | Classify | Looks only at the usable rectangle's width-to-height ratio and its shorter side. Computes an aspect class (ultra-wide / wide / square / tall / ultra-tall) and a scale class (micro / small / medium / large) — pure arithmetic with zero knowledge of the surface's name or category. |
| 2 | Select | Looks up a composition template from the (aspect class, scale class) pair. Two completely different surfaces that classify the same way get the same template. |
| 3 | Demand | For each element, computes its ideal size, its minimum size, and the hard floor it cannot cross (a tap target, a text legibility floor, a QR module size). |
| 4 | Partition | Splits the usable rectangle into named zones (e.g. lead / body / tail) according to the chosen template, with proportions, flow direction, alignment, and gap. |
| 5 | Allocate | Places everything at its ideal size. Then loops: if anything overflows its zone, pick the least-important element still holding a rung to apply, apply it, and check again — until nothing overflows or nothing is left to give. |
| 6 | Position | Converts zone-relative boxes to absolute pixel coordinates, with rounding that guarantees no overlaps or out-of-bounds. |
| 7 | Validate | Runs every hard invariant one more time: pairwise overlap, bounds containment, safe-area respect, tap-target floor, text-size floor, scan integrity. Any violation is flagged; errors throw in dev mode. |

---

## The Priority & Degradation Algorithm

When space is insufficient, the resolver never guesses — it follows a predictable, explainable path:

### The Degradation Ladder

Each element has a ladder of five rungs, applied in order:

1. **SHRINK_STEP** — reduce the element by 15% of the gap between its ideal and its hard floor. Repeatable: the allocation loop keeps applying shrink steps until the element reaches its floor or the zone fits.
2. **TRUNCATE_LINE** — for text elements: reduce the maximum line count by one.
3. **ELLIPSIS** — for shrinkable text: allow an ellipsis on the final line.
4. **REFLOW** — move the element to its next preferred zone in the template (e.g. from the "heading" zone to the "detail" zone).
5. **DROP** — remove the element entirely from the layout.

### Victim Selection

When multiple elements overflow, the resolver picks the least-important one:

1. **Sort by priority descending** — highest priority first (priority 1 = headline/CTA, priority 5 = fine print).
2. **Tiebreak by rungs already applied** — elements with fewer rungs get degraded first, so the pain spreads out.
3. **Tiebreak by role importance** — within the same priority, less essential roles (legal, incentive, branding) go before more essential ones (action, hero, primary).

This produces one invariant: *no element of priority P has a rung applied while any element of priority greater than P still has a rung remaining.*

### Layout Status

| Status | Meaning |
|--------|---------|
| ok | Nothing degraded. All elements fit at their ideal sizes. |
| degraded | Some elements shrank, truncated, or moved — but every hard constraint was met. |
| constrained | The surface was too small to satisfy every hard constraint even after every fallback. A uniform squeeze factor is applied as a last resort. |

---

## TypeScript Design

### Spec Typing

Elements are a discriminated union on `type`: `TextElement`, `ImageElement`, `ButtonElement`, `ScanElement`. Each carries only the fields relevant to its type (a button has no `maxLines`, a text element has no `fit`). The `defineAd()` function validates at runtime: unique element IDs, exactly one `action` (CTA) role, exactly one `primary` (headline) role.

`const` type parameters ensure that `defineAd({...})` infers precise literal types for element IDs — `ElementIdOf<S>` turns a spec's type into a union of its element IDs, so `layout.elements.headline` typechecks and `layout.elements.typo` is a compile error.

### Surface Typing

Interaction and viewing constraints use discriminated unions instead of optional fields: `Interaction` is `{ mode: 'touch', minTapTargetPx } | { mode: 'pointer', minTapTargetPx } | { mode: 'passive' }`. A passive surface has no `minTapTargetPx` field at all — the compiler forces the CTA-sizing logic to first narrow on `mode`. Similarly, `Viewing` is `{ distance: 'near' } | { distance: 'mid', minTextPx } | { distance: 'far', minTextPx }`.

### Layout Output

The resolved layout's `elements` field is `ReadonlyRecord<ElementIdOf<S>, LayoutEntry>`, fully typed so a renderer consumes it without guessing. Each `LayoutEntry` is either `PlacedElement` (with `rect`, `zone`, `typography`) or `DroppedElement` (with `reason`). The `Px` branded type (`number & { [PxBrand]: true }`) prevents mixing pixel values with plain numbers at compile time.

---

## Architecture Overview

```
src/
├── engine/          <- PURE TYPESCRIPT. No React, no DOM, no surface names.
│   ├── spec.ts      <- Element types, defineAd(), runtime validation
│   ├── surface.ts   <- SurfaceProfile type, defineSurface(), runtime validation
│   ├── types.ts     <- Rect, Size, splitRect, rectIntersects, EPSILON
│   ├── classify.ts  <- Phase 1: aspect class + scale class from geometry
│   ├── templates.ts <- Phase 2+4: composition templates + zone partitioning
│   ├── degradation.ts <- Priority ladder: nextRung(), selectVictim()
│   ├── diagnostics.ts <- Decision trace: decisions, drops, rungs, violations
│   ├── resolver.ts  <- Phases 0,3-7: the main resolve() entry point
│   └── validate.ts  <- Phase 7: invariant checking (overlap, bounds, floors)
├── render/          <- TWO INDEPENDENT RENDERERS. Each reads spec + layout.
│   ├── render-dom.tsx   <- React components, absolute-positioned elements
│   └── render-canvas.ts <- Imperative Canvas 2D API
├── demo/            <- CHROME: React UI, pickers, panels, styling
│   ├── App.tsx          <- Main shell, URL persistence, keyboard shortcuts
│   ├── demo.css         <- Full design system (tokens, panels, buttons, motion)
│   ├── surfaces.ts      <- Named surface profiles (the ONLY place with names)
│   ├── creatives/       <- Ad specs + palettes (KEEL, ORBIT, FERN, FitPulse)
│   ├── BrandHeader.tsx  <- Assignment branding, author signature
│   ├── StageFrame.tsx   <- The hero stage with zoom + comparison support
│   ├── SurfacePicker.tsx <- Surface chip picker with SVG thumbnails
│   ├── AdPicker.tsx     <- Ad creative picker
│   ├── CustomSurfacePanel.tsx <- Live sliders for inventing surfaces
│   ├── DiagnosticsPanel.tsx   <- Timeline, stats, benchmark, stress test
│   ├── ElementInspector.tsx   <- Key-value readout of a selected element
│   ├── GuideTab.tsx   <- Static documentation about the engine
│   ├── RenderCanvas.tsx <- React wrapper around render-canvas.ts
│   ├── InfoTooltip.tsx  <- Flip-aware tooltip component
│   ├── Icon.tsx         <- Inline SVG icon system
│   ├── SurfaceThumb.tsx <- SVG aspect-ratio thumbnail component
│   └── DemoErrorBoundary.tsx <- React error boundary
└── tests/         <- 7 test files, 185 tests, all passing
    ├── types.spec.ts    <- 15 type-safety tests
    ├── purity.spec.ts   <- 37 boundary-enforcement tests
    ├── model.spec.ts    <- 6 spec/surface model tests
    ├── resolver.spec.ts <- 35 resolver tests
    ├── degradation.spec.ts <- 19 degradation tests
    ├── ads.spec.ts      <- 72 creative tests
    └── fuzz.spec.ts     <- 1 fuzz test (2000 random surfaces, no overlaps)
```

### Module Boundaries

- `engine/` never imports from `demo/` or `render/`. It is pure TypeScript.
- `render/` only imports from `engine/` and React. Never from `demo/` or each other.
- `demo/` is the only layer that knows about surface names, ad creative names, or React.
- `tests/purity.spec.ts` enforces these boundaries mechanically at test time.

---

## Known Limitations

- **No QR generation**: The `scan` element renders as a decorative module grid, not a real scannable code. The payload string is real and flows through the same sizing/constraint logic as a working QR would.
- **No animated transitions**: Switching surfaces or changing constraints is instant. There are no layout animations.
- **Text measurement**: The demo's default measurer (`createCanvasMeasurer`) uses a real `CanvasRenderingContext2D.measureText()`, so glyph widths are accurate, not estimated — the engine also ships a pure-heuristic `estimateMeasurer` (used by the test suite, so tests stay DOM-free) for any environment without canvas access. What's still approximate is the wrap algorithm itself: line breaks are decided by a greedy word-wrap over those measured widths, not by handing the string to the browser and reading back its own line boxes, so a very unusual font's kerning/ligatures could still disagree with the DOM by a pixel or two.
- **No text wrapping beyond line count**: Text truncation works via `WebkitLineClamp` and ellipsis; line breaks come from the greedy wrap above, not from reflowing actual DOM text nodes.
- **Five templates cover most aspect ratios**: ultra-wide, wide, square, tall, ultra-tall. Edge-case aspect ratios (e.g. exactly 1:1 with unusual constraints) use the closest template rather than a perfect match.
- **Forced fit on impossible surfaces**: When every rung is exhausted and a zone still overflows, a uniform squeeze factor is applied. This is documented as a compromise, not a bug.
- **Single-pass resolution**: The resolver does one allocation pass. It does not retry after dropping elements or explore alternative template choices.

---

## Time Spent

This was designed and implemented over approximately **4-5 days** of focused work:

- **Day 1**: Engine core (spec, surface, types, classify, templates, resolver phases 0-2)
- **Day 2**: Allocation loop (degradation ladder, victim selection, positioning, validation)
- **Day 3**: Renderers (DOM + Canvas), demo shell, surface picker, ad picker, custom surface panel
- **Day 4**: Premium UI overhaul ("Obsidian & Signal" design system), bug fixes, 158 tests
- **Day 5**: Functional overhaul (4th creative, before/after toggle, URL persistence, canvas click-to-inspect, timing benchmark, stress test, keyboard shortcuts, error boundary, reduced-motion), 176 tests, final polish

---

## Credits & Tools

Built with **TypeScript, React 19, Vite 8, Vitest 5, Oxlint**. Canvas rendering uses the native 2D Context. Design system influenced by Linear, Vercel, and Arc's product aesthetics.

**AI tools disclosure**: Built with **Claude Code** (Anthropic), used throughout for code generation, debugging, refactors, and documentation drafting across the engine, renderers, demo UI, and this README/ARCHITECTURE.md. Every generated change was reviewed, tested, and — where behavior mattered — verified against the resolver's own diagnostics before being kept.

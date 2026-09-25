# Adaptive Layout Engine for Multi-Surface Ads

One ad spec. One resolver. Any surface.

Given a creative's content and any surface's real geometry and constraints, the resolver computes a layout that recomposes for that surface — a tall stack on a phone, a hero-beside-copy grid on a kiosk, a single left-to-right band on a broadcast lower-third — and, when space runs out, degrades it one explainable step at a time in strict priority order. It never overlaps, never clips, and never silently shrinks anything.

Built by **Y.L. Vishal** (VIT Chennai, Roll No: 22MIA1073) for **Flam's Frontend R&D Assignment**, as an application for the **Software Engineering Intern** role in Bangalore.

---

## Setup

```bash
cd adaptive-layout-engine
npm install
```

## Running the demo

```bash
npm run dev          # dev server — open the URL it prints
npm run build        # production build (dist/)
npm run preview      # serve the production build
```

## Checking it

```bash
npm run verify       # typecheck + 237 unit/property tests + production build
npm run test:render  # real-browser check (uses your installed Chrome)
npm run lint
```

`test:render` opens every shipped ad on every shipped surface (30 combinations) in a real Chrome, lets the webfont load, and asks the *browser* — not the engine — whether any text overflows its box, any CTA label is clipped, or any two elements overlap. Set `CHROME_PATH` if Chrome isn't in its standard location.

---

## How to use the demo

1. **Switch surfaces** — six chips: Mobile interstitial, Mobile landscape, Broadcast lower-third, Retail kiosk, Print-to-digital QR panel, and **Compact card (stress case)**.
2. **Switch creatives** — five ads (KEEL, ORBIT, FERN, SipPulse, Provox) with different hero shapes and copy lengths. Each carries its brand as a lockup (monogram + name) at priority 2, so the brand name survives on every surface that has any room for it.
3. **Inspect an element** — click any element on the stage for the inspector: its slot, size, font, the steps it took and its contrast. The resolution summary shows the status, template, aspect class and step count.
4. **Custom surface** — drag the sliders or paste a JSON surface profile to resolve a surface the engine has never seen.
5. **Renderer toggle** — DOM and Canvas draw the same resolved layout independently.
6. **Keyboard** — `1`–`5` switch creatives, `R` renderer, `D` debug overlay (slot boundaries and element boxes).

The stress case is the one to watch: on a 320×180 card, KEEL drops **legal (priority 5)**, then **QR and badge (4)**, then — only as the very last thing — the **logo (2)** — and the headline, price, CTA and hero all survive intact.

---

## Resolution flow

```
Ad Spec + Surface Profile → Constraint Resolver → Resolved Layout → Renderer (DOM | Canvas)
```

| # | Phase | What it does |
|---|-------|--------------|
| 0 | Normalise | Surface → usable rect (minus safe area), content rect, spacing (2% of each axis), tap-target floor, text floor. The only place that reads interaction mode or viewing distance. |
| 1 | Classify | Usable rect's aspect ratio → one of five aspect classes. Pure arithmetic; never sees the surface's name. |
| 2 | Select | Aspect class → a **template tree** of rows and columns (how things are *arranged*, never how big). |
| 3 | Demand | Each element gets a protected starting size and a hard floor. **Every element is attempted** — nothing is excluded up front. |
| 4 | Place | Brand marks start in the first slot whose backdrop clears the contrast floor. |
| 5 | Degrade | Solve the box model; while anything overflows, take **one step on one element** (below). |
| 6 | Reclaim | Undo any step the final layout turned out not to need. |
| 7 | Grow | If nothing needed degrading, type grows uniformly on big surfaces (≤1.8×); the hero absorbs leftover space. |
| 8 | Position | Boxes → whole-pixel rects, rounding *edges* so rounding can never create an overlap. |
| 9 | Validate | Independent re-check of overlap, bounds, safe area, tap target, text floor, scan integrity and contrast on the final geometry. |

### The box model

Templates are trees, not coordinates or fractions. `box-model.ts` is a small flexbox written for this engine:

- **Widths top-down.** Every node knows its narrowest acceptable width (for text: the width at which it still fits its line budget) and its widest useful width. A row hands out maximum widths if they fit, otherwise shrinks flexible children (text re-wraps) toward their minimums; rigid ones (images, buttons, QR) give nothing. Below the sum of minimums, it reports horizontal overflow in pixels.
- **Heights next.** With widths fixed every leaf has a definite height. A column stacks its children; leftover height is water-filled into children that can grow (a hero, up to what its width allows), the rest becomes spacing. Below the sum of heights it reports vertical overflow.
- **Columns shrink-wrap when placed.** Wrapped text rarely fills the width it was given, so a row places each (non-growing) column at the width its content actually uses and spreads the difference with its `justify`. Otherwise it would sit as a dead strip on one side of the column. This only moves boxes; it never re-wraps text or changes the overflow the degradation loop sees.
- **Empty slots collapse** — no space, no gap — so room an absent element would have used goes to the rest instead of sitting in an empty zone.

Widths are resolved before heights for the same reason CSS does it: text height depends on width, never the reverse.

---

## The priority & degradation algorithm

### The ladder

Each element may take these steps, gentlest first:

```
SHRINK_STEP* → ELLIPSIS → TRUNCATE_LINE* → REFLOW → DROP
```

| Step | Meaning |
|------|---------|
| SHRINK_STEP | Scale down by 10% of the ideal→floor range (font for text/buttons, size for images). Never below the hard floor. |
| ELLIPSIS | Text may be cut with "…" at its current line budget. |
| TRUNCATE_LINE | Text shows one line fewer (cut with "…"). |
| REFLOW | Move to a later slot in the template's preference list (e.g. price up beside the CTA). |
| DROP | Remove the element. |

Degradability caps the ladder: **fixed** elements may shrink and move but never lose content or disappear; **shrinkable** ones may also be cut; only **droppable** ones can be dropped. A QR shrinks only in whole-pixel modules and never below its module floor (below it, it stops scanning).

### The rule

While the layout overflows:

1. **Width before height.** Resolve horizontal overflow first.
2. **Worst priority first.** Walk priority bands from 5 to 1. In each band, find each element's **gentlest step that actually reduces the overflow** — steps that wouldn't help are skipped, never taken. The first band where anyone has such a step supplies the victim.
3. **Within a band:** gentlest step, then fewest steps taken so far, then a fixed role order (legal, incentive, scan, branding, secondary, action, hero, primary).
4. Apply that one step, re-solve, repeat.

This gives two guarantees, both checked on **every step of every resolve** in the tests (from the step log the resolver records):

> **No element is ever degraded while an element of worse priority had a step that would have helped. No step is ever taken that doesn't reduce the overflow.**

Three refinements keep single steps from getting stuck, each logged as such:

- **A cut can enable a move.** A price that won't fit beside the CTA uncut fits once it may end in "…" — so a REFLOW may carry the cut it depends on, as one step.
- **Joint steps for shared rows.** A row is as tall as its tallest member, so dropping one of two equally tall slot-mates saves nothing. The same step is then tried on the element *together with* its slot-mates of equal or worse priority — never anything more important.
- **Relaxed height steps.** If no height step fits without creating horizontal overflow, one that reduces the *total* is accepted and the next (width) iteration fixes the rest, still in priority order.

After convergence a **reclaim** pass tries to undo each element's last step — best priority first, so freed space goes to what matters most — and keeps any undo that still fits. Every size change in the output is either a logged step or a logged undo.

Termination is guaranteed: every step is irreversible and every ladder is finite.

### Layout status

| Status | Meaning |
|--------|---------|
| ok | Nothing degraded (type may have grown on a big surface). |
| degraded | Some elements shrank, were cut, moved or dropped — every hard constraint still met. |
| constrained | No step anywhere could remove the remaining overflow (e.g. a hero whose minimum size is taller than the whole surface). What's left is scaled down proportionally — never clipped — and the validator reports exactly which floor that broke. |

All 30 shipped ad × surface combinations resolve `ok` or `degraded` with zero violations.

---

## Contrast-aware branding placement

Contrast is a constraint in the resolver, not a styling tweak in the renderer.

- **Inputs.** An ad may declare its `background`, and an image (e.g. the logo) its `markColor` — both typed as hex strings (`HexColor`), so `markColor: 'teal'` is a compile error. A surface may declare `backdrop` regions (e.g. a lit white header strip) and a `minContrastRatio` (default **3:1**, WCAG 1.4.11).
- **Placement.** Each mark starts in the first preferred slot whose worst-case backdrop clears the floor. No step is spent.
- **Plate.** If the mark's final rect still fails, the layout carries `contrast.plate` — white or near-black, whichever separates more from the mark — painted inside the mark's own rect, so fixing contrast can never cause an overlap. A mark is never dropped for colour.
- **Validation.** Phase 9 re-checks contrast independently.

Try it by pasting this into **Custom surface → Paste a surface profile** — a kiosk whose top strip sits under a bright, lit header:

```json
{ "widthPx": 1080, "heightPx": 1080, "safeArea": { "top": 0, "right": 0, "bottom": 0, "left": 0 },
  "interaction": { "mode": "touch", "minTapTargetPx": 60 }, "viewing": { "distance": "mid", "minTextPx": 20 },
  "backdrop": [{ "x": 0, "y": 0, "w": 1080, "h": 86, "color": "#F4F4F0" }] }
```

Light wordmarks (KEEL, ORBIT, FERN, SipPulse, Provox) move off the white strip to a bottom sign-off; a mid-tone mark that clears the floor on white stays put. `tests/contrast.spec.ts` covers placement, plating and validation.

---

## TypeScript design

- **Specs.** Elements are a discriminated union on `type` (`text | image | button | scan`), each carrying only its own fields. `defineAd()` uses a `const` type parameter so `ElementIdOf<typeof spec>` is the union of real ids: `layout.elements.headline` typechecks, `layout.elements.typo` doesn't. Runtime checks cover what types can't: unique ids, exactly one CTA and one headline, valid colours.
- **Surfaces.** Dependent constraints are unions, not optional fields: a `passive` surface has no `minTapTargetPx` field at all; `far`/`mid` viewing requires `minTextPx`, `near` forbids it. `defineSurface()` rejects negative sizes, safe areas wider than the surface, backdrop regions outside it, bad colours and impossible contrast ratios.
- **Output.** `ResolvedLayout<Ids>` maps each id to `PlacedElement | DroppedElement`. A placed element carries its `rect` (branded `Px`), slot, `typography` (font size, lines, `truncated`, alignment — for text *and* buttons), the steps it took, and its contrast outcome. A renderer consumes it without guessing anything.
- **Type-level tests** (`tests/types.spec-d.ts`) fail the build if any of these guarantees stops holding.

---

## Architecture

The five files the brief asks for sit at the top of `src/`; the modules they're built from sit in folders beside them.

```
src/
├── spec.ts            element types, defineAd()                   ┐
├── resolver.ts        resolve(): phases 0–9                        │ THE ENGINE — pure TypeScript:
├── engine/            the resolver's building blocks               │ no React, no DOM,
│   ├── surface.ts       SurfaceProfile, defineSurface()            │ no surface names
│   ├── classify.ts      aspect class                               │
│   ├── templates.ts     the five composition trees + role prefs    │
│   ├── box-model.ts     the two-pass flex-like solver              │
│   ├── degradation.ts   the ladder + victim selection              │
│   ├── contrast.ts      WCAG luminance/contrast, backdrops         │
│   ├── validate.ts      independent invariant checks               │
│   ├── diagnostics.ts   the step log and decision trace            │
│   ├── measure.ts       TextMeasurer interface + DOM-free estimator│
│   ├── textChrome.ts    text padding shared by engine and renderer │
│   ├── types.ts         Rect, Px, geometry helpers                 │
│   └── index.ts         public re-exports                          ┘
├── surfaces.ts        the named surface profiles — the only place a surface has a name
├── render-dom.tsx     DOM renderer: React, absolutely positioned at true pixels
├── render/
│   ├── render-canvas.ts Canvas 2D renderer, same ResolvedLayout
│   └── measure-canvas.ts real measureText() measurer used by the demo
├── App.tsx            the demo app
├── main.tsx           entry point
└── demo/              the demo's parts: pickers, stage, panels, creatives, styles
scripts/check-render.mjs  real-browser rendering check
tests/                 9 files, 237 tests
```

`render-dom` is `.tsx` rather than the brief's `.ts` because it is a React component and uses JSX.

- The engine (`spec.ts`, `resolver.ts`, `engine/`) imports nothing from the surfaces, the renderers or the app, touches no DOM global, and contains no surface name or device word — `tests/purity.spec.ts` enforces all three.
- **New surface?** Add a `SurfaceProfile` to `src/surfaces.ts` (or paste one into the demo). No engine change.
- **New renderer?** Consume `ResolvedLayout` + the spec. The Canvas backend was added without touching the resolver.
- The DOM renderer draws at the surface's **true pixel size**; the stage fits it on screen with a CSS `transform`, so the browser wraps text at exactly the sizes the resolver measured.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full walkthrough.

### Tests

| File | Tests | Covers |
|------|------:|--------|
| degradation.spec.ts | 19 | the ladder, victim selection, **the rule on every step** of every shipped combination, a 2× density and 1,800 random surfaces; reclaim; the stress-case drop order; the kiosk shrink scenario |
| fuzz.spec.ts | 5 | 400 random surfaces × 5 ads: no overlap, nothing out of bounds, no silent floor violation, every step reduces overflow |
| box-model.spec.ts | 10 | row/column distribution, growth caps, overflow accounting, collapsing slots |
| resolver.spec.ts | 40 | every surface, determinism, template selection, recomposition vs scaling, text boxes fit their text, slots collapse, hero growth, type hierarchy |
| ads.spec.ts | 90 | every ad × every surface: resolves, places fixed elements, zero violations |
| contrast.spec.ts | 9 | WCAG maths, placement, plates, validation |
| purity.spec.ts | 43 | engine boundaries |
| types.spec.ts / types.spec-d.ts | 15 | type-level guarantees |
| model.spec.ts | 6 | spec and surface models |

---

## Known limitations

- **Greedy, not optimal.** One step at a time, with the refinements above. It finds a valid layout whenever the tested ones exist, but it is not an exhaustive search; a cleverer combination of steps on *different* priority bands could occasionally keep one more element.
- **Not monotonic across sizes.** Within one resolve the order is guaranteed, but text wraps in discrete jumps, so a slightly *smaller* surface can occasionally keep an element a slightly larger one dropped (e.g. once a headline has to shrink anyway, it may fit on one line and free room). The step log always explains why.
- **Five templates.** One composition per aspect class; there is no size-dependent template choice.
- **Text measurement.** The demo measures with the browser's own `measureText()`; line breaking is a greedy word wrap over those widths. The tests use a deterministic estimator so they stay DOM-free. Negative letter-spacing is ignored (safe: the browser renders narrower than measured).
- **Contrast** is evaluated for image marks only; backdrops are solid colours, not sampled imagery.
- **No animated transitions** between surfaces.
- **QR** renders as a placeholder module grid, not a real scannable code (the sizing constraints are real).
- **The Canvas renderer** isn't covered by the browser check (it has no DOM to inspect).

---

## Time spent

Approximately **4–5 days**:

- **Day 1**: engine core (spec, surface, types, classify, templates, first resolver)
- **Day 2**: allocation loop, degradation ladder, positioning, validation
- **Day 3**: DOM and Canvas renderers, demo shell, pickers, custom surface panel
- **Day 4**: UI polish, tests, bug fixes
- **Day 5**: box-model rewrite of allocation, the per-step priority rule and its tests, contrast-aware placement, true-pixel rendering and the real-browser check

---

## Credits & tools

TypeScript, React 19, Vite 8, Vitest 5, Oxlint, playwright-core (browser check only).

**AI tools disclosure**: built with **Claude Code** (Anthropic), used throughout for code generation, debugging, refactors and documentation drafting across the engine, renderers, demo UI and these docs. Every change was reviewed and tested, and behaviour was verified against the resolver's own diagnostics and the real-browser check before being kept.

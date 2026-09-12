# Architecture — Adaptive Layout Engine

> "A precision instrument, photographed in a dark studio."

This document explains the codebase structure, module boundaries, data flow, and design decisions. It is the canonical reference for anyone reading the code — including interviewers walking through it live.

---

## 1. Design Philosophy

The engine was built around one principle: **the resolver is a pure function**.

```
resolve(adSpec, surfaceProfile) -> ResolvedLayout
```

That function takes two typed inputs and returns a geometry description. It touches no DOM, reads no globals, imports no frameworks. Every decision it makes is derived from its inputs alone. This purity is what makes the algorithm generalise: an unseen 5000x5000 surface that has never been named in the codebase still classifies, partitions, allocates, and validates correctly — because classification is based on geometry, not identity.

The three layers exist to preserve this boundary:

| Layer | Responsibility | Can import from |
|-------|---------------|-----------------|
| `engine/` | Constraint solving, geometry, validation | Nothing external |
| `render/` | Pixel output (DOM or Canvas) | `engine/` only |
| `demo/` | User interaction, chrome, presentation | `engine/` + `render/` |

---

## 2. The Resolver Pipeline

The resolver is seven phases pipelined inside a single `resolve()` function. Each phase transforms the problem closer to a concrete pixel layout.

```
SurfaceProfile -> [0] Normalise -> NormalisedSurface
                    [1] Classify  -> Classification
                    [2] Select    -> Template
                    [3] Demand    -> Demand[] (per element)
                    [4] Partition -> Zone[]
                    [5] Allocate  -> AllocState[] (with degradation)
                    [6] Position  -> LayoutEntry[]
                    [7] Validate  -> Violation[]
                                    ResolvedLayout
```

### Phase 0: Normalise

Input: raw `SurfaceProfile` (widthPx, heightPx, safeArea, interaction, viewing)
Output: `NormalisedSurface` (usable rect, minTapTargetPx, minTextPx, canReceiveTouch)

This phase strips the discriminated unions into flat numbers. Every later phase reads from `NormalisedSurface`, not from the original `SurfaceProfile`. This is the single boundary where surface-specific information (touch, far-viewing) enters the pipeline.

### Phase 1: Classify

Input: `usable` rect from Phase 0
Output: `{ aspectClass, scaleClass, aspect, minSidePx }`

Two axes of pure arithmetic:
- **Aspect class** — width/height ratio falls into one of five bands: ultra-wide (>=3.5), wide (>=1.35), square (>=0.8), tall (>=0.5), ultra-tall (<0.5).
- **Scale class** — shorter side falls into one of four bands: micro (<140px), small (<400px), medium (<900px), large (>=900px).

The same surface name never appears here. A brand-new surface with the same geometry as "retailKiosk" lands in exactly the same bucket without any code change.

### Phase 2: Select

Input: `{ aspectClass, scaleClass }`
Output: `Template` object

A lookup table maps (aspect, scale) pairs to one of five templates:
- `band-horizontal` — ultra-wide: 20/58/22 split into lead/body/tail
- `split-horizontal` — wide: 38/62 split into media/content
- `grid-square` — square: 6 zones in a stacked layout
- `stack-vertical` — tall: 6 zones in a vertical scroll
- `column-narrow` — ultra-tall: single column, very narrow

Each template carries its own `partition` function (pure geometry), `rolePreference` mapping, and `ambition` table (which roles are attempted at which scale).

### Phase 3: Demand

Input: `Template` + `NormalisedSurface`
Output: `Demand[]` (ideal size, minimum size, hard floor, scale knob)

For each element, computes what it wants and what it can't go below:
- **Text**: ideal font size, floored by surface's `minTextPx`. Measures content width at both ideal and floor.
- **Button**: computes natural width from label measurement, enforces `minTapTargetPx` on both axes for touch surfaces.
- **Image**: starts at a fraction of the usable short side (0.45 for hero, 0.14 for branding), clamped to `minShortSidePx`.
- **Scan**: fixed size (`modules * minModulePx`). Ideal and floor are the same value — it cannot shrink.

### Phase 4: Partition

Input: `Template` + `usable` rect
Output: `Zone[]` (id, rect, flow, align, gapPx, maxOccupants)

The template's `partition` function divides the usable rectangle into named zones using proportional splits. Each zone carries its stacking direction (y or x), alignment, gap, and maximum occupant count.

### Phase 5: Allocate

Input: `Demand[]` + `Zone[]` + `Template`
Output: `AllocState[]` (scale, maxLines, zoneIndex, dropped, appliedRungs)

The core algorithm. Three sub-steps run in a loop (bounded to 64 iterations):

1. **Measure** — for each occupant of each zone, compute its actual size at its current scale (text measured against zone width, images clamped to zone cross-axis).
2. **Detect overflow** — sum main-axis sizes with gaps; compare to zone capacity.
3. **Degrade** — if overflow exists, select the victim (lowest priority, fewest rungs applied, then role rank), apply the next rung of its ladder, and repeat.

The degradation ladder is: SHRINK_STEP -> TRUNCATE_LINE -> ELLIPSIS -> REFLOW -> DROP.

If all rungs are exhausted and a zone still overflows, the layout enters `constrained` status and a uniform squeeze factor is applied to all occupants of that zone.

### Phase 6: Position

Input: `AllocState[]` + `Zone[]`
Output: `LayoutEntry[]` with absolute `Rect`

Converts zone-relative placements to absolute pixel coordinates. Rounding strategy: floor positions, ceil sizes, then clamp each size against its zone's floored far edge. This single pass prevents the 1px rounding drift that previously caused false overlaps between adjacent zones.

### Phase 7: Validate

Input: `AdSpec` + layout geometry
Output: `Violation[]`

Runs six independent checks against the final layout:
1. Pairwise overlap (O(n^2) over placed elements)
2. Bounds containment (every element inside the surface)
3. Safe-area respect (warning only — resting in the margin is flagged)
4. Tap target floor (button/scan height and width >= tap floor on touch surfaces)
5. Text floor (every text element's font size >= surface's minimum)
6. Scan integrity (scan element size >= modules * minModulePx)

In dev mode, error-severity violations throw `LayoutInvariantError`. In production, they are recorded but the layout is returned with `status: 'constrained'`.

---

## 3. Degradation Ladder

### Per-Element Ladder Paths

Each element type has a different ladder based on its `degradability`:

**Fixed** (e.g. CTA button): SHRINK_STEP only — may shrink but never dropped.
**Shrinkable** (e.g. headline text): SHRINK_STEP -> TRUNCATE_LINE -> ELLIPSIS.
**Droppable** (e.g. branding, legal, incentive): SHRINK_STEP -> TRUNCATE_LINE -> REFLOW -> DROP.

**Scan elements** skip SHRINK_STEP entirely (a QR below module floor doesn't scan) and go straight to REFLOW -> DROP.

### Victim Selection Algorithm

```
candidates = all elements in overflowing zones that still have rungs

sort by:
  1. priority DESCENDING (priority 1 before priority 5)
  2. rungsApplied ASCENDING (fewer rungs first, spreads pain)
  3. ROLE_SUFFER_RANK (legal=0, incentive=1, scan=2, branding=3, secondary=4, action=5, hero=6, primary=7)

victim = sorted[0]
```

This guarantees the invariant: no element of priority P has a rung applied while any element of priority > P still has rungs remaining.

### Suffer Rank Design

The role suffer rank encodes a design decision about which roles are "less essential" when priorities are equal:
- `legal` and `incentive` (fine print, promo badge) go first — they are the cheapest to lose.
- `scan` and `branding` go next — the QR and logo can be dropped while the core message survives.
- `secondary` (price) goes before `action` (CTA) and `hero` (product image) — the thing being sold and the button to buy it are always protected.
- `primary` (headline) is never dropped at any priority level in our creatives — but the ladder allows it if the surface is truly impossible.

---

## 4. Templates — Composition Library

Five templates, each a pure partition function:

### band-horizontal (ultra-wide, >=3.5 aspect)
Zones: lead (20%) | body (58%) | tail (22%)
Best for: billboard banners, broadcast ticker ads
Limitation: no room for fine print or QR codes.

### split-horizontal (wide, 1.35-3.5 aspect)
Zones: media (38%) | content (62%)
Best for: retail kiosk displays, tablet interstitials
The visual hero gets its own column; all text and CTAs flow below or beside.

### grid-square (square, 0.8-1.35 aspect)
Zones: top(12%) | media(36%) | heading(13%) | detail(14%) | cta(17%) | legal(8%)
Best for: Instagram-style square ads, kiosk screens
Six zones, most expressive layout. `legal` gets its own band because three items in one row were visually crowded.

### stack-vertical (tall, 0.5-0.8 aspect)
Zones: brand(8%) | hero(42%) | heading(14%) | detail(12%) | cta(14%) | legal(10%)
Best for: mobile portrait interstitials
Six zones in a single column. The CTA zone lands in the lower half naturally by construction — this is "thumb-reachable" on a phone, even though the engine never knows it's a phone.

### column-narrow (ultra-tall, <0.5 aspect)
Zones: brand(10%) | hero(50%) | heading(12%) | detail(12%) | cta(10%) | legal(6%)
Best for: print-to-digital QR panels, narrow banners
Single narrow column. Elements stack vertically with generous hero space.

---

## 5. Renderers

### render-dom.tsx (React)
Absolute-positioned divs inside a position:relative container. Every `left/top/width/height` comes from `entry.rect` — zero CSS layout decisions (no flexbox/grid deciding element positions). The one flexbox usage: centring a button label inside an already-sized box.

### render-canvas.ts (Imperative)
2D canvas API. Draws background, then iterates spec elements in order, drawing each at its resolver-assigned rect. Text is measured using the same measurer the resolver used, so wrapping agrees. Images are loaded async and cached.

Both renderers are independent. Neither imports from the other or from `demo/`. They each carry their own copy of color tokens. This independence is what proves the architecture: if the two render the same layout and look consistent, the module boundary claim is proven, not just asserted.

---

## 6. Test Strategy

### Purity tests (34 tests)
Mechanically verify that `engine/` never imports from `demo/` or `render/`. Uses AST parsing of import paths. These are the immune system — if someone accidentally adds a demo import to the engine, these tests fail immediately.

### Fuzz tests (1 test, 2000 surfaces)
Generates 2000 random surface profiles (random width, height, safe areas, interaction modes, viewing distances), resolves the KEEL ad against each, and checks:
- No pairwise element overlap
- No element outside surface bounds
- No undetected hard-constraint violations

A seed is stored so failures are reproducible. This is the strongest evidence the algorithm works for unseen surfaces.

### Model tests (6 tests)
Test spec validation: duplicate IDs, missing roles, valid specs.

### Resolver tests (29 tests)
Test classification boundaries, template selection, demand computation, allocation convergence, validation.

### Degradation tests (19 tests)
Test each rung's conditions, victim selection ordering, ladder paths for each degradability type.

### Ad tests (72 tests)
Test each of the four creatives (KEEL, ORBIT, FERN, FitPulse) against all six surfaces for correct classification, status, and no violations.

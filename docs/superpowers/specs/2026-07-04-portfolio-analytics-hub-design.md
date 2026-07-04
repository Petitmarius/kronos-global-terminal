# Portfolio "Performance & Asset Hub" (right panel) — Design

- **Date:** 2026-07-04
- **Proposed branch:** `feat/portfolio-analytics-hub`
- **Status:** Design approved, proceeding to spec review → plan (user said "écris le spec et enchaîne")

## 1. Goal

Balance the Global Map's Portfolio mode by using the empty space on the **right**
of the map. Add a right-docked **"Performance & Asset Hub"** symmetric to the left
PortfolioPanel, and tidy the left panel.

## 2. Decisions

| Point | Decision |
|---|---|
| Left panel | Add discreet `EXP · LAT · REAL` mini column headers above BY COUNTRY; **remove** the NON-GEOGRAPHIC section (it moves right) |
| Right panel | New `AnalyticsPanel`, docked right, **only in portfolio mode** (macro/geo drawers don't render there → no conflict) |
| Top of right | **Realized P&L 30-day** area chart (lightweight-charts) — cumulative realized within a trailing 30-day window, starting at 0 |
| Bottom of right | **Non-Geographic Risk** hub — SVG donut (allocation by notional per class) + per-class LAT/REAL columns; hovering a slice drills into that class's symbols with their realized (+latent) P&L |
| Data | Extend `NonGeoBucket` with a per-symbol `items` list; add a pure `realizedCurve(history, days)` helper |
| Chart libs | lightweight-charts (area, already used in CountryPanel); donut = hand-rolled SVG arcs |

## 3. Data model (`types.ts` + `geo/exposure.ts`)

```ts
export interface NonGeoItem { symbol: string; notional: number; latent: number; realized: number }
export interface NonGeoBucket { notional: number; latent: number; realized: number; count: number; items: NonGeoItem[] }
```

`bucket()` seeds `items: []`. In `buildExposure`, accumulate a per-`(cat,symbol)`
map for non-geographic positions (notional+latent) and closed trades (realized),
then attach `nonGeo.byCat[cat].items = Object.values(map).sort((a,b) => b.notional - a.notional)`.
The top-level `nonGeo.items` stays `[]` (only per-category buckets are populated).

**`realizedCurve`** (pure, exported from `exposure.ts`):

```ts
export function realizedCurve(history: ClosedTrade[], days = 30): { time: number; value: number }[] {
  const dayMs = 86_400_000
  const start = Date.now() - days * dayMs
  const inWindow = history.filter((t) => t.closedAt >= start)
  if (inWindow.length === 0) return []
  const byDay = new Map<number, number>()
  for (const t of inWindow) {
    const di = Math.floor((t.closedAt - start) / dayMs)
    byDay.set(di, (byDay.get(di) ?? 0) + t.pnl)
  }
  const out: { time: number; value: number }[] = []
  let cum = 0
  for (let i = 0; i <= days; i++) {
    out.push({ time: Math.floor((start + i * dayMs) / 1000), value: cum })  // point BEFORE day i's trades
    cum += byDay.get(i) ?? 0
  }
  return out
}
```

Starts at 0 (day −30), ends at the total realized within the window. Returns `[]`
when no trade closed in the window → the panel shows an empty state.

## 4. Left panel changes (`PortfolioPanel.tsx`)

- **Column headers**: before the BY COUNTRY rows, a `.ppColHead` grid (same tracks
  as `.ppRow`) with two empty cells then `EXP`, `LAT`, `REAL` (tiny, dim, right-aligned).
- To make headers align with values, give `.ppRow` **fixed** numeric tracks:
  `grid-template-columns: 24px 1fr 56px 52px 52px`, with `.ppNum` and the `Signed`
  spans right-aligned (`Signed` gains a `styles.sVal` class: `text-align:right; tabular-nums`).
- **Remove** the entire NON-GEOGRAPHIC block (and the now-unused `CATS` list / `hasNonGeo`
  branch). `maxBar` no longer includes `nonGeo.notional`.
- Empty state: full "No open positions" only when there is neither country exposure
  nor any non-geo activity; if there are only non-geo positions, show a small
  "No geographic exposure." note under BY COUNTRY (the numbers live on the right).

## 5. Right panel (`AnalyticsPanel.tsx`, new)

Docked `.rp` (mirror of `.pp` but `right: 12px`), rendered by `GlobalMap` only when
`portfolio` is on. Props: `{ exposure: ExposureModel; history: ClosedTrade[]; onPick: (symbol: string) => void }`.
No close button (symmetry via the left ✕ / legend toggle already exit the mode).

### 5.1 Top — Realized P&L 30D (area chart)

A `lightweight-charts` area series built from `realizedCurve(history)`, mirroring
`CountryPanel`'s chart pattern: transparent layout, hidden axes, magnet-free vertical
crosshair, `subscribeCrosshairMove` → a `chartTip` showing the value. Line/area color
green when the final value ≥ 0, red otherwise. Height ~120px. Empty state
("No realized P&L in the last 30 days.") when the curve is `[]`.

### 5.2 Bottom — Non-Geographic Risk (`NonGeoDonut.tsx`, new)

- Categories from `exposure.nonGeo.byCat` (FX / CRYPTO / CMD / …). Palette:
  FX `#42A5F5`, CRYPTO `#7E57C2`, CMD `#FF9100`, else `#607D8B`.
- **Donut**: SVG annular sectors sized by each class's `notional` share of total
  non-geo notional. Helper `arcPath(cx, cy, rOuter, rInner, a0, a1)` (angles from −π/2).
  Each slice: `onMouseEnter` → `setHovered(cat)`, `onMouseLeave` → `setHovered(null)`;
  non-hovered slices dim when one is hovered. Center label = hovered class + its
  notional, else `NON-GEO` + total non-geo exposure.
- **Below the donut**:
  - Default (no hover): one **summary row per class** — `CLASS · $notional · LAT · REAL`.
  - On hover of a class slice: the **drill-down** — that class's `items` (symbol +
    realized, plus latent), e.g. `EURUSD  +$…  +$…`. Rows are clickable → `onPick(symbol)`.
- Render the donut only when total non-geo notional > 0; classes that are realized-only
  (closed trades, no open position) still appear in the summary rows. Empty state
  ("No non-geographic positions.") when there is no non-geo activity at all.

## 6. `GlobalMap.tsx`

```tsx
{portfolio && <PortfolioPanel exposure={exposure} onPick={pick} onClose={() => togglePortfolio(false)} />}
{portfolio && <AnalyticsPanel exposure={exposure} history={history} onPick={pick} />}
```

Both panels float over the full-width map (absolute), leaving a visible center strip;
the map stays zoomable/pannable.

## 7. Styles (`GlobalMap.module.css`)

- `.rp` (mirror `.pp`, `right: 12px`, box-shadow to the left).
- `.ppColHead` (grid header) + fixed `.ppRow` tracks + `.sVal` right-align.
- `.rpChart` / `.rpChartInner` / reuse `.chartTip`; `.rpEmpty`.
- `.donutWrap`, `.donutCenter`, `.ngRow` (class summary), `.ngItem` (drill-down),
  `.ngDot`, reuse `.pos`/`.neg`.

## 8. Edge cases

- No history → realized curve empty state; donut/hub independent.
- Non-geo class realized-only (notional 0) → no donut slice, but a summary row with its realized.
- Symbols shown as stored tickers (`EURUSD`, `USDJPY`, `BTCUSD`) for consistency with the rest of the app.
- Both panels only in portfolio mode; toggling off removes both.

## 9. Files

- **New:** `frontend/src/components/globe/AnalyticsPanel.tsx`, `frontend/src/components/globe/NonGeoDonut.tsx`.
- **Modify:** `frontend/src/types.ts` (`NonGeoItem` + `items`), `frontend/src/geo/exposure.ts`
  (items + `realizedCurve`), `frontend/src/components/globe/PortfolioPanel.tsx` (headers, remove non-geo),
  `frontend/src/components/globe/GlobalMap.tsx` (render right panel),
  `frontend/src/components/globe/GlobalMap.module.css` (right panel + donut + headers).
- **Backend:** none.

## 10. Verification

- `cd frontend && npm run build` green.
- Live (portfolio mode): left panel shows `EXP · LAT · REAL` headers and no NON-GEOGRAPHIC
  section; the right panel shows the 30-day realized P&L area chart (hover → value tooltip)
  and the non-geo donut with per-class LAT/REAL; hovering the FX slice lists your FX pairs
  (EURUSD, USDJPY…) with realized P&L; clicking a drill-down row jumps to the Terminal.

## 11. Out of scope

- Radar-chart alternative for the hub (donut chosen).
- Persisting/replaying an equity curve beyond realized closed-trade timestamps.
- Formatting FX tickers as `EUR/USD` (kept raw for app consistency).

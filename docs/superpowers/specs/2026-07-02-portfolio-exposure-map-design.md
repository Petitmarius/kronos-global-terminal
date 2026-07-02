# Portfolio Exposure on the Global Map — Design

- **Date:** 2026-07-02
- **Proposed branch:** `feat/portfolio-exposure-map`
- **Status:** Design approved, pending spec review

## 1. Problem & goal

The Global Map (`view === 'GLOBAL'`) is today isolated from the user's book. The
goal is to surface the live portfolio **on the map**: where the user is
geographically exposed, and their P&L per country — turning the map into a
portfolio lens that stays in sync with the Terminal, and letting the user jump
back to the Terminal from a country.

## 2. Decisions (from brainstorming)

| Point | Decision |
|---|---|
| Exposure metric | **Notional value** = `price × lots × contract` |
| Non-equity positions (FX / crypto / commodities) | **Not** placed on the map; aggregated in a **"Non-geographic"** bucket in the panel |
| Presentation | A **"Portfolio" mode toggle**: country tint + exposure bubbles + a **left-docked** panel |
| Panel P&L | **Latent (unrealized) AND realized**, per country |
| Visual encoding | **Tint = exposure intensity** (blue sequential ramp); **bubble size = notional**; **bubble color = latent P&L** (green/red). Green/red is reserved for P&L only, so exposure (blue) and P&L (green/red) never clash. |
| Where the logic lives | **Entirely frontend.** Positions/history are in the Zustand store (localStorage); no backend change. |

## 3. Non-goals / YAGNI

- No historical portfolio-value time series / 6-month equity curve (the simulator
  does not persist snapshots over time).
- No new frontend test framework — verify via `tsc --noEmit && vite build` + live
  check. The resolver is kept pure for an optional future unit test.
- No backend endpoint.
- FX / crypto / commodities are **not** force-mapped to countries.

## 4. Architecture

One-way data flow:

```
Zustand store (positions, history, assets, customs)
   └── geo/exposure.ts  (pure: resolve symbol→ISO, aggregate)
         └── GlobalMap.tsx  (portfolio mode state, useMemo(exposure))
               ├── WorldMap.tsx     → exposure tint + exposure bubbles
               └── PortfolioPanel.tsx (left drawer) → allocation + latent/realized
```

The **index → ISO** map is derived at runtime from the already-loaded markets
board (`markets.countries[].index → iso`), so we do not duplicate the backend's
index list on the frontend.

### 4.1 `geo/exposure.ts` (new, pure)

Types (also exported into `types.ts`):

```ts
interface CountryExposure {
  iso: string
  notional: number
  latent: number
  realized: number
  count: number
  topSymbol: string   // largest-notional open position in this country (for click-through)
}
interface NonGeoBucket { notional: number; latent: number; realized: number; count: number }
interface NonGeo extends NonGeoBucket {
  byCat: Record<string, NonGeoBucket>   // 'FX' | 'CRYPTO' | 'CMD' | 'OTHER'
  topSymbol: string
}
interface ExposureModel {
  perCountry: Record<string, CountryExposure>
  nonGeo: NonGeo
  totals: { notional: number; latent: number; realized: number; positions: number }
  maxNotional: number    // max perCountry.notional, guarded ≥ 1
  maxAbsLatent: number   // max |perCountry.latent|, guarded ≥ 1
}
```

**Resolver** `resolveIso(symbol, customs, indexMap): string | null`:

1. `SYMBOL_ISO[symbol]` (base universe) → iso.
2. `yf = customs[symbol]?.yahoo ?? symbol`.
3. `indexMap[yf]` (from markets board) → iso.
4. suffix after last `.` of `yf` in `YF_SUFFIX_ISO` → iso.
5. no suffix + alphabetic ticker + `assets[symbol]?.cat === 'EQ'` → `'US'`.
6. else `null` (non-geographic).

`SYMBOL_ISO` (base universe overrides):
`NAS100/US30/SPX500/AAPL/NVDA/TSLA/MSFT/AMZN → US`, `GER40 → DE`, `UK100 → GB`.
FX / crypto / commodity symbols are intentionally **absent** → they fall through
to non-geographic.

`YF_SUFFIX_ISO` (Yahoo exchange suffix → ISO, aligned to the 42 mapped countries):

```
PA→FR  L→GB  DE→DE  F→DE  MI→IT  AS→NL  MC→ES  SW→CH  VX→CH  ST→SE
OL→NO  CO→DK  HE→FI  VI→AT  BR→BE  LS→PT  AT→GR  IR→IE  WA→PL  IS→TR
JO→ZA  TA→IL  SR→SA  CA→EG  ME→RU  T→JP  SS→CN  SZ→CN  HK→HK  NS→IN
BO→IN  KS→KR  KQ→KR  TW→TW  TWO→TW  AX→AU  NZ→NZ  SI→SG  JK→ID  BK→TH
KL→MY  PS→PH  SA→BR  MX→MX  BA→AR  SN→CL  TO→CA  V→CA  NE→CA
```

Notable Yahoo quirks documented in a code comment: `.CA` = Cairo (Egypt), Canada
is `.TO`/`.V`; `.SA` = São Paulo (Brazil), Saudi is `.SR`; `.AT` = Athens
(Greece), Austria is `.VI`; `.BR` = Brussels (Belgium), Brazil is `.SA`.

**Aggregator** `buildExposure(positions, history, assets, customs, indexMap): ExposureModel`:

- Per **open** position `p`: `iso = resolveIso(p.symbol, …)`;
  `notional = (assets[p.symbol]?.price ?? p.entry) × p.lots × (assets[p.symbol]?.contract ?? 1)`;
  `latent = positionPnl(p, assets).pnl` (reuses existing `store.ts` helper).
  If `iso` → accumulate into `perCountry[iso]` (track `topSymbol` by notional);
  else → `nonGeo` and `nonGeo.byCat[assets[p.symbol]?.cat ?? 'OTHER']`.
- Per **closed** trade `t`: `iso = resolveIso(t.symbol, …)`; `realized = t.pnl`
  (all-time). If `iso` → `perCountry[iso].realized`; else `nonGeo.realized`
  (+ `byCat`). Trades for a country with **no** open position still create a
  realized-only `perCountry` entry (notional 0 → no bubble, but shows in panel).
- `totals`, `maxNotional`, `maxAbsLatent` computed at the end (guarded ≥ 1).

### 4.2 Centroids — `geo/countries.ts`

Add `COUNTRY_CENTROID: Record<string, [number, number]>` (`[lon, lat]`) for all
42 mapped ISO codes (representative economic center / capital), reusing the
coordinates already present in the backend `NEWS_COUNTRIES` where they overlap.
Hardcoded on purpose — avoids adding a `d3-geo` direct dependency and gives
predictable placement.

### 4.3 Color scales — `geo/scales.ts` (additions)

- `expoFill(share: number)`: sequential **blue** ramp `DARK[20,27,35] → BLUE[66,165,245]`,
  `t = clamp(sqrt(share)) × 0.85 + 0.15`, `share = notional / maxNotional`.
- `pnlFill(latent: number, bound: number)`: diverging, `DARK → GREEN` for
  `latent ≥ 0`, `DARK → RED` for `latent < 0`, scaled by `latent / bound`
  (`bound = maxAbsLatent`).
- `PORTFOLIO_LEGEND` meta for the legend (blue exposure bar + green/red P&L swatches).

### 4.4 `WorldMap.tsx`

New optional props: `portfolio: boolean`, `exposure: ExposureModel | null`,
`onExposureClick: (iso: string) => void`.

When `portfolio` is on:
- `fill = (perCountry[iso]?.notional ?? 0) > 0 ? expoFill(notional / maxNotional) : '#141b23'`.
  A **realized-only** country (closed trades, no open position → `notional === 0`)
  is therefore **not** tinted or bubbled on the map; it appears in the panel list only.
- For each `perCountry` iso **with `notional > 0`**, render a `<Marker coordinates={COUNTRY_CENTROID[iso]}>`:
  outer circle `r = clamp(6 + sqrt(notional / maxNotional) × 18, 6, 26)`,
  `fill = pnlFill(latent, maxAbsLatent)` at ~0.3 alpha, stroke in the P&L color;
  small solid inner dot. Hover → tooltip `Name · $notional · latent · realized · n`.
  Click → `onExposureClick(iso)`.
- Macro metric tint and the macro hover/click are suppressed while `portfolio` is on.

### 4.5 `MapLegend.tsx`

Add a **"Portfolio"** toggle button (same pattern as the existing "Geopolitical"
toggle). While Portfolio is on, the macro metric buttons (EQ/GDP/CPI/JOBS) are
replaced by the portfolio legend: a blue **Exposure low→high** bar + green/red
**P&L −/+** swatches.

### 4.6 `PortfolioPanel.tsx` (new — left drawer, mirrors `CountryPanel`)

Props: `exposure: ExposureModel`, `onPick: (symbol: string) => void`, `onClose`.

- Header **PORTFOLIO** + close button.
- Summary grid: **Exposure** (`fmtUsd(totals.notional)`), **Latent** (signed),
  **Realized** (signed), **Positions** (count).
- Country rows sorted by notional desc:
  `ISO · allocation bar (notional/totals.notional %) · $notional · latent(signed) · realized(signed)`.
  Row click → `onPick(perCountry[iso].topSymbol)`; a **realized-only** row
  (`topSymbol === ''`) is rendered non-clickable.
- **Non-geographic** row: aggregated FX/Crypto/CMD (`notional · latent · realized`),
  with a small per-category breakdown; clickable → `onPick(nonGeo.topSymbol)` when set.
- Empty state (no positions & no history): "No open positions — open a trade in
  the Terminal to see your geographic exposure." + a button that switches to the
  Terminal.

### 4.7 `GlobalMap.tsx`

- New state `portfolio: boolean` (default `false`; persisted under `apex.globe.portfolio`).
- Read store slices `positions, history, assets, customs`; build
  `indexMap = Object.fromEntries((markets?.countries ?? []).map(c => [c.index, c.iso]))`;
  `exposure = useMemo(() => buildExposure(positions, history, assets, customs, indexMap), [positions, history, assets, customs, markets])`.
  `assets` changes on every `applyQuotes`, so latent stays live.
- When `portfolio` is on: pass `portfolio/exposure/onExposureClick` to `WorldMap`,
  render `<PortfolioPanel>` on the left, and route country/bubble clicks to the
  Terminal bridge instead of opening the right-hand macro drawer.

### 4.8 Terminal bridge

`onPick(symbol) = () => { useStore.getState().select(symbol); useStore.getState().setView('TERMINAL') }`.
Uses existing store actions. If the symbol is no longer registered (custom
removed), `select` still sets it; the Terminal shows last-known data — acceptable.

## 5. Styling — `GlobalMap.module.css`

Left panel `.pp` mirrors `.cp` but docked `left: 12px`. New rules: allocation bar,
summary grid, non-geographic row, and the exposure-bubble tooltip. Reuse existing
CSS tokens and the `.pos`/`.neg` color classes.

## 6. Edge cases & honesty

- FX notional is huge (1 lot EURUSD ≈ $108K) → FX is excluded from the map (bucket
  only), which keeps the bubble scale meaningful for equities.
- Realized P&L for a symbol whose custom mapping was removed from the watchlist →
  falls into non-geographic (rare, documented).
- A holding on an exchange outside the 42 mapped countries → non-geographic.
- No simulated values: equity notional is exact (real price × contract); FX/crypto/
  commodities appear only in the aggregate bucket.
- `maxNotional` / `maxAbsLatent` guarded ≥ 1 to avoid divide-by-zero.

## 7. Files

- **New:** `frontend/src/geo/exposure.ts`, `frontend/src/components/globe/PortfolioPanel.tsx`.
- **Edit:** `frontend/src/geo/countries.ts` (centroids), `frontend/src/geo/scales.ts`
  (expo/pnl fills + legend meta), `frontend/src/components/globe/WorldMap.tsx`,
  `MapLegend.tsx`, `GlobalMap.tsx`, `GlobalMap.module.css`, `frontend/src/types.ts`
  (exposure types).
- **Backend:** none.

## 8. Verification

- `cd frontend && npm run build` (`tsc --noEmit` + `vite build`) is green.
- Live check: open positions in the Terminal on `AAPL` (US), a `.PA` custom (FR),
  and `GER40` (DE); switch to GLOBAL, toggle **Portfolio**:
  - US/FR/DE tinted by exposure (blue), bubbles sized by notional and colored by
    latent P&L;
  - left panel lists them with latent + realized, and shows the non-geographic
    bucket for any FX/crypto/commodity positions;
  - clicking a bubble or a panel row lands on the Terminal with that symbol selected;
  - closing a position moves its P&L into that country's realized figure and the
    bubble shrinks/disappears.
- `cd backend && python -m pytest -q` still green (unaffected — sanity only).

## 9. Out of scope (future ideas)

- Persisted portfolio-value history / 6-month equity curve.
- Region-level rollups (Americas / EMEA / Asia-Pacific) in the panel.
- Force-mapping FX / commodities to countries.

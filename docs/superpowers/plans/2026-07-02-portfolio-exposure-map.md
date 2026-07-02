# Portfolio Exposure on the Global Map — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the user's live book on the Global Map — exposure-tinted countries, notional-sized bubbles colored by latent P&L, a left panel with per-country latent + realized P&L and a non-geographic bucket, and click-through back to the Terminal.

**Architecture:** Entirely frontend. A pure module `geo/exposure.ts` resolves each traded symbol to an ISO country (base table + Yahoo exchange suffix + the loaded markets board) and aggregates the Zustand store (`positions`, `history`, `assets`, `customs`) into an `ExposureModel`. `GlobalMap` memoizes that model and feeds `WorldMap` (tint + bubbles) and a new `PortfolioPanel`. A "Portfolio" toggle in `MapLegend` switches the map into portfolio mode.

**Tech Stack:** React 18 + TypeScript, Zustand, react-simple-maps v3, CSS Modules. No new dependencies.

## Global Constraints

- **Frontend-only.** No backend changes. No new npm dependencies.
- **No test framework.** Verification for every task is `cd frontend && npm run build` (runs `tsc --noEmit && vite build`) and must be green, plus the live checks noted in UI tasks.
- **Honesty:** equities/indices carry exact notional (real price × contract); FX/crypto/commodities appear **only** in the non-geographic bucket, never on the map; nothing is simulated.
- **Color rule:** green/red (`#00E676` / `#FF1744`) is reserved for P&L. Exposure uses the blue ramp (`#141b23 → #42A5F5`).
- **Node 24.** The build currently transforms 374 modules; it must stay green.
- Commit at the end of each task with the exact message given.

---

## File structure

| File | Responsibility | Change |
|---|---|---|
| `frontend/src/types.ts` | Shared exposure interfaces | Modify (append) |
| `frontend/src/geo/exposure.ts` | Pure symbol→ISO resolver + aggregation | Create |
| `frontend/src/geo/countries.ts` | 42 country centroids for bubbles | Modify (append) |
| `frontend/src/geo/scales.ts` | `expoFill` (blue) + `pnlFill` (green/red) | Modify (append) |
| `frontend/src/components/globe/WorldMap.tsx` | Portfolio tint + exposure bubbles | Modify (full rewrite) |
| `frontend/src/components/globe/MapLegend.tsx` | Portfolio toggle + portfolio legend | Modify (full rewrite) |
| `frontend/src/components/globe/PortfolioPanel.tsx` | Left drawer: allocation + latent/realized | Create |
| `frontend/src/components/globe/GlobalMap.tsx` | Portfolio state, store wiring, memo, bridge | Modify (full rewrite) |
| `frontend/src/components/globe/GlobalMap.module.css` | Panel + legend styles | Modify (append) |
| `CLAUDE.md` | Document portfolio mode | Modify |

---

## Task 1: Exposure types + pure resolver/aggregator

**Files:**
- Modify: `frontend/src/types.ts` (append at end)
- Create: `frontend/src/geo/exposure.ts`

**Interfaces:**
- Consumes: `Asset`, `ClosedTrade`, `Position` from `types.ts`.
- Produces: `ExposureModel`, `CountryExposure`, `NonGeo` (types); `resolveIso(symbol, customs, indexMap, assets): string | null`; `buildExposure(positions, history, assets, customs, indexMap): ExposureModel`.

- [ ] **Step 1: Append the exposure types to `types.ts`**

```ts
// --- Portfolio exposure (Global Map) ----------------------------------------
export interface CountryExposure {
  iso: string
  notional: number
  latent: number
  realized: number
  count: number
  topSymbol: string   // largest-notional open position in this country (click-through)
}
export interface NonGeoBucket { notional: number; latent: number; realized: number; count: number }
export interface NonGeo extends NonGeoBucket {
  byCat: Record<string, NonGeoBucket>   // 'FX' | 'CRYPTO' | 'CMD' | 'INDEX' | 'EQ' | 'OTHER'
  topSymbol: string
}
export interface ExposureModel {
  perCountry: Record<string, CountryExposure>
  nonGeo: NonGeo
  totals: { notional: number; latent: number; realized: number; positions: number }
  maxNotional: number    // max perCountry.notional, guarded >= 1
  maxAbsLatent: number   // max |perCountry.latent|, guarded >= 1
}
```

- [ ] **Step 2: Create `frontend/src/geo/exposure.ts`**

```ts
import type { Asset, ClosedTrade, CountryExposure, ExposureModel, NonGeo, NonGeoBucket, Position } from '../types'

interface CustomMeta { symbol: string; yahoo: string; name: string; cat: string }

// Base tradable symbols -> ISO. Equities & indices only; FX/crypto/CMD are
// deliberately absent so they fall through to the non-geographic bucket.
const SYMBOL_ISO: Record<string, string> = {
  NAS100: 'US', US30: 'US', SPX500: 'US', AAPL: 'US', NVDA: 'US', TSLA: 'US', MSFT: 'US', AMZN: 'US',
  GER40: 'DE', UK100: 'GB',
}

// Yahoo exchange suffix -> ISO, aligned to the 42 mapped countries.
// Quirks: .CA = Cairo/Egypt (Canada is .TO/.V); .SA = Sao Paulo/Brazil (Saudi is .SR);
// .AT = Athens/Greece (Austria is .VI); .BR = Brussels/Belgium (Brazil is .SA).
const YF_SUFFIX_ISO: Record<string, string> = {
  PA: 'FR', L: 'GB', DE: 'DE', F: 'DE', MI: 'IT', AS: 'NL', MC: 'ES', SW: 'CH', VX: 'CH', ST: 'SE',
  OL: 'NO', CO: 'DK', HE: 'FI', VI: 'AT', BR: 'BE', LS: 'PT', AT: 'GR', IR: 'IE', WA: 'PL', IS: 'TR',
  JO: 'ZA', TA: 'IL', SR: 'SA', CA: 'EG', ME: 'RU', T: 'JP', SS: 'CN', SZ: 'CN', HK: 'HK', NS: 'IN',
  BO: 'IN', KS: 'KR', KQ: 'KR', TW: 'TW', TWO: 'TW', AX: 'AU', NZ: 'NZ', SI: 'SG', JK: 'ID', BK: 'TH',
  KL: 'MY', PS: 'PH', SA: 'BR', MX: 'MX', BA: 'AR', SN: 'CL', TO: 'CA', V: 'CA', NE: 'CA',
}

export function resolveIso(
  symbol: string,
  customs: Record<string, CustomMeta>,
  indexMap: Record<string, string>,
  assets: Record<string, Asset>,
): string | null {
  const base = SYMBOL_ISO[symbol]
  if (base) return base
  const yf = customs[symbol]?.yahoo ?? symbol
  if (indexMap[yf]) return indexMap[yf]              // known index from the markets board
  const dot = yf.lastIndexOf('.')
  if (dot >= 0) {
    const suf = yf.slice(dot + 1).toUpperCase()
    return YF_SUFFIX_ISO[suf] ?? null                 // unmapped exchange -> non-geographic
  }
  if (/^[A-Za-z]+$/.test(yf) && assets[symbol]?.cat === 'EQ') return 'US'  // plain US equity
  return null
}

const bucket = (): NonGeoBucket => ({ notional: 0, latent: 0, realized: 0, count: 0 })

export function buildExposure(
  positions: Position[],
  history: ClosedTrade[],
  assets: Record<string, Asset>,
  customs: Record<string, CustomMeta>,
  indexMap: Record<string, string>,
): ExposureModel {
  const perCountry: Record<string, CountryExposure> = {}
  const nonGeo: NonGeo = { ...bucket(), byCat: {}, topSymbol: '' }
  const topNotional: Record<string, number> = {}
  let nonGeoTop = 0

  const ensure = (iso: string): CountryExposure => {
    let c = perCountry[iso]
    if (!c) { c = { iso, notional: 0, latent: 0, realized: 0, count: 0, topSymbol: '' }; perCountry[iso] = c }
    return c
  }
  const catBucket = (cat: string): NonGeoBucket => nonGeo.byCat[cat] ?? (nonGeo.byCat[cat] = bucket())

  for (const p of positions) {
    const a = assets[p.symbol]
    const notional = (a?.price ?? p.entry) * p.lots * (a?.contract ?? 1)
    const latent = a ? (a.price - p.entry) * p.sign * p.lots * a.contract : 0
    const iso = resolveIso(p.symbol, customs, indexMap, assets)
    if (iso) {
      const c = ensure(iso)
      c.notional += notional; c.latent += latent; c.count += 1
      if (notional > (topNotional[iso] ?? 0)) { topNotional[iso] = notional; c.topSymbol = p.symbol }
    } else {
      nonGeo.notional += notional; nonGeo.latent += latent; nonGeo.count += 1
      const b = catBucket(a?.cat ?? 'OTHER')
      b.notional += notional; b.latent += latent; b.count += 1
      if (notional > nonGeoTop) { nonGeoTop = notional; nonGeo.topSymbol = p.symbol }
    }
  }

  for (const t of history) {
    const iso = resolveIso(t.symbol, customs, indexMap, assets)
    if (iso) ensure(iso).realized += t.pnl
    else { nonGeo.realized += t.pnl; catBucket(assets[t.symbol]?.cat ?? 'OTHER').realized += t.pnl }
  }

  let notionalTot = 0, latentTot = 0, realizedTot = 0, maxNotional = 0, maxAbsLatent = 0
  for (const c of Object.values(perCountry)) {
    notionalTot += c.notional; latentTot += c.latent; realizedTot += c.realized
    if (c.notional > maxNotional) maxNotional = c.notional
    if (Math.abs(c.latent) > maxAbsLatent) maxAbsLatent = Math.abs(c.latent)
  }
  notionalTot += nonGeo.notional; latentTot += nonGeo.latent; realizedTot += nonGeo.realized

  return {
    perCountry, nonGeo,
    totals: { notional: notionalTot, latent: latentTot, realized: realizedTot, positions: positions.length },
    maxNotional: Math.max(maxNotional, 1),
    maxAbsLatent: Math.max(maxAbsLatent, 1),
  }
}
```

- [ ] **Step 3: Verify the resolver by inspection against this table**

The module is pure. Confirm each row by reading `resolveIso` (no runner is configured; types are checked by the build in Step 4):

| symbol | customs[symbol].yahoo | indexMap has? | assets.cat | → ISO |
|---|---|---|---|---|
| `AAPL` | — | — | EQ | `US` (base table) |
| `GER40` | — | — | INDEX | `DE` (base table) |
| `MC` | `MC.PA` | no | EQ | `FR` (suffix PA) |
| `VOD` | `VOD.L` | no | EQ | `GB` (suffix L) |
| `CAC` | `^FCHI` | yes→FR | INDEX | `FR` (index board) |
| `GOOGL` | `GOOGL` | no | EQ | `US` (plain equity) |
| `EURUSD` | — | — | FX | `null` (non-geographic) |
| `BTCUSD` | — | — | CRYPTO | `null` (non-geographic) |
| `XYZ` | `XYZ.ZZ` | no | EQ | `null` (unmapped suffix) |

- [ ] **Step 4: Verify the build is green**

Run: `cd frontend && npm run build`
Expected: `tsc --noEmit` passes and `vite build` prints `✓ built`. (`exposure.ts` is not imported yet — unused module is fine.)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/types.ts frontend/src/geo/exposure.ts
git commit -m "feat(globe): pure portfolio exposure model (symbol->country + aggregation)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Country centroids + portfolio color scales

**Files:**
- Modify: `frontend/src/geo/countries.ts` (append)
- Modify: `frontend/src/geo/scales.ts` (append)

**Interfaces:**
- Produces: `COUNTRY_CENTROID: Record<string, [number, number]>` (`[lon, lat]`); `expoFill(share: number): string`; `pnlFill(latent: number, bound: number): string`.

- [ ] **Step 1: Append centroids to `countries.ts`**

```ts
// [lon, lat] economic-center / capital points for the 42 mapped countries,
// used to place portfolio exposure bubbles. Hardcoded (no d3-geo dependency).
export const COUNTRY_CENTROID: Record<string, [number, number]> = {
  US: [-98, 39], CA: [-106, 56], BR: [-51, -12], MX: [-102, 23], AR: [-64, -34], CL: [-71, -33],
  GB: [-2, 54], DE: [10, 51], FR: [2, 47], ES: [-4, 40], IT: [12, 42], CH: [8, 47], NL: [5, 52],
  SE: [15, 62], NO: [9, 61], DK: [10, 56], FI: [26, 64], AT: [14, 47.5], BE: [4.5, 50.6], PT: [-8, 39.5],
  GR: [22, 39], IE: [-8, 53], PL: [19, 52], TR: [35, 39], ZA: [25, -29], IL: [35, 31.5], SA: [45, 24],
  EG: [30, 27], RU: [37, 55],
  JP: [138, 36], CN: [104, 35], HK: [114, 22.3], IN: [79, 22], KR: [128, 36.5], TW: [121, 23.7],
  AU: [134, -25], NZ: [172, -41], SG: [104, 1.3], ID: [113, -2], TH: [101, 15], MY: [102, 4], PH: [122, 12],
}
```

- [ ] **Step 2: Append the color scales to `scales.ts`**

Add `BLUE` next to the existing color constants, then append the two functions (they reuse the module-local `DARK`, `GREEN`, `RED`, `mix`):

```ts
const BLUE = [66, 165, 245]

// Sequential blue ramp for exposure intensity (share = notional / maxNotional).
export function expoFill(share: number): string {
  const t = Math.max(0, Math.min(1, Math.sqrt(Math.max(0, share)))) * 0.85 + 0.15
  return mix(DARK, BLUE, t)
}

// Diverging green/red for latent P&L, scaled to the book's own max |latent|.
export function pnlFill(latent: number, bound: number): string {
  const t = Math.max(-1, Math.min(1, latent / (bound || 1)))
  return t >= 0 ? mix(DARK, GREEN, t * 0.85 + 0.12) : mix(DARK, RED, -t * 0.85 + 0.12)
}
```

- [ ] **Step 3: Verify the build is green**

Run: `cd frontend && npm run build`
Expected: `✓ built`. (New exports are unused so far — fine.)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/geo/countries.ts frontend/src/geo/scales.ts
git commit -m "feat(globe): country centroids + exposure/pnl color scales

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: WorldMap — portfolio tint + exposure bubbles

**Files:**
- Modify: `frontend/src/components/globe/WorldMap.tsx` (full rewrite)

**Interfaces:**
- Consumes: `expoFill`, `pnlFill` (Task 2), `COUNTRY_CENTROID` (Task 2), `ExposureModel` (Task 1), `fmtCompact` (existing `format.ts`).
- Produces: `WorldMap` with new optional props `portfolio?: boolean`, `exposure?: ExposureModel | null`, `onExposureClick?: (iso: string) => void`. Existing props unchanged, so the current `GlobalMap` still compiles.

- [ ] **Step 1: Replace the entire contents of `WorldMap.tsx`**

```tsx
import { useState } from 'react'
import { ComposableMap, Geographies, Geography, Marker, ZoomableGroup } from 'react-simple-maps'
import topo from 'world-atlas/countries-110m.json'

import { fmtCompact } from '../../format'
import { COUNTRY_CENTROID, NUM_TO_ISO } from '../../geo/countries'
import { METRIC_META, expoFill, metricFill, pnlFill, type MapMetric } from '../../geo/scales'
import type { ExposureModel, GeoPoint, GlobeGeo, GlobeMarkets, MacroLayer } from '../../types'
import styles from './GlobalMap.module.css'

const GEO_URL = topo as unknown as Record<string, unknown>
const signed = (v: number) => `${v >= 0 ? '+' : '−'}$${fmtCompact(Math.abs(v))}`

export default function WorldMap(
  { markets, geo, showGeo, metric, layer, portfolio = false, exposure = null, onSelect, onGeoHover, onExposureClick }:
  {
    markets: GlobeMarkets | null; geo: GlobeGeo | null; showGeo: boolean; metric: MapMetric; layer: MacroLayer | null
    portfolio?: boolean; exposure?: ExposureModel | null
    onSelect: (iso: string) => void; onGeoHover: (p: GeoPoint) => void; onExposureClick?: (iso: string) => void
  },
) {
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null)
  const byIso = new Map((markets?.countries ?? []).map((c) => [c.iso, c]))
  const layerVals = metric !== 'eq' && layer ? layer.metrics[metric] : undefined
  const nameOf = (iso: string) => byIso.get(iso)?.name ?? iso

  const valueFor = (iso: string | undefined, c: GlobeMarkets['countries'][number] | undefined): number | undefined => {
    if (!iso) return undefined
    if (metric === 'eq') return c?.pct
    return layerVals?.[iso]?.value
  }
  const macroTip = (c: GlobeMarkets['countries'][number], v: number | undefined) =>
    metric === 'eq'
      ? `${c.name} · ${c.index} ${c.pct >= 0 ? '+' : ''}${c.pct}%`
      : `${c.name} · ${METRIC_META[metric].label} ${v != null ? `${v}${METRIC_META[metric].unit}` : '—'}`
  const expoTip = (iso: string) => {
    const e = exposure!.perCountry[iso]
    return `${nameOf(iso)} · $${fmtCompact(e.notional)} · P&L ${signed(e.latent)} · real ${signed(e.realized)} · ${e.count} pos`
  }
  const heldNotional = (iso: string | undefined): number =>
    portfolio && exposure && iso ? (exposure.perCountry[iso]?.notional ?? 0) : 0

  const fillFor = (iso: string | undefined, v: number | undefined) => {
    if (portfolio && exposure) {
      const n = heldNotional(iso)
      return n > 0 ? expoFill(n / exposure.maxNotional) : '#141b23'
    }
    return metricFill(metric, v)
  }

  return (
    <>
      <ComposableMap projection="geoEqualEarth" projectionConfig={{ scale: 165 }} width={980} height={500} style={{ width: '100%', height: '100%' }}>
        <ZoomableGroup center={[10, 20]} zoom={1} minZoom={1} maxZoom={5}>
          <Geographies geography={GEO_URL}>
            {({ geographies }) =>
              geographies.map((g) => {
                const iso = NUM_TO_ISO[Number(g.id)]
                const c = iso ? byIso.get(iso) : undefined
                const v = valueFor(iso, c)
                const held = heldNotional(iso) > 0
                const interactive = portfolio ? held : !!c
                const fill = fillFor(iso, v)
                return (
                  <Geography
                    key={g.rsmKey}
                    geography={g}
                    fill={fill}
                    stroke="#0a0e13"
                    strokeWidth={0.4}
                    style={{
                      default: { outline: 'none' },
                      hover: { outline: 'none', fill: interactive ? '#8fa3b3' : fill, cursor: interactive ? 'pointer' : 'default' },
                      pressed: { outline: 'none' },
                    }}
                    onMouseEnter={(e: React.MouseEvent) => {
                      if (portfolio) { if (held && iso) setTip({ x: e.clientX, y: e.clientY, text: expoTip(iso) }) }
                      else if (c) setTip({ x: e.clientX, y: e.clientY, text: macroTip(c, v) })
                    }}
                    onMouseMove={(e: React.MouseEvent) => setTip((t) => (t ? { ...t, x: e.clientX, y: e.clientY } : t))}
                    onMouseLeave={() => setTip(null)}
                    onClick={() => { if (portfolio) { if (held && iso) onExposureClick?.(iso) } else if (c) onSelect(c.iso) }}
                  />
                )
              })
            }
          </Geographies>

          {portfolio && exposure && Object.values(exposure.perCountry).filter((e) => e.notional > 0).map((e) => {
            const ctr = COUNTRY_CENTROID[e.iso]
            if (!ctr) return null
            const r = Math.min(6 + Math.sqrt(e.notional / exposure.maxNotional) * 18, 26)
            const col = e.latent >= 0 ? '#00E676' : '#FF1744'
            return (
              <Marker key={e.iso} coordinates={ctr}
                style={{ default: { cursor: 'pointer' }, hover: { cursor: 'pointer' }, pressed: {} }}
                onMouseEnter={(ev: React.MouseEvent) => setTip({ x: ev.clientX, y: ev.clientY, text: expoTip(e.iso) })}
                onMouseMove={(ev: React.MouseEvent) => setTip((t) => (t ? { ...t, x: ev.clientX, y: ev.clientY } : t))}
                onMouseLeave={() => setTip(null)}
                onClick={() => onExposureClick?.(e.iso)}>
                <circle r={r} fill={pnlFill(e.latent, exposure.maxAbsLatent)} fillOpacity={0.32} stroke={col} strokeWidth={1.2} />
                <circle r={3} fill={col} />
              </Marker>
            )
          })}

          {!portfolio && showGeo && (geo?.points ?? []).map((p) => (
            <Marker key={p.iso} coordinates={[p.lon, p.lat]}
              style={{ default: { cursor: 'pointer' }, hover: { cursor: 'pointer' }, pressed: {} }}
              onMouseEnter={() => onGeoHover(p)}>
              <circle r={Math.min(4 + Math.sqrt(p.count) * 4, 22)} fill="rgba(255,145,0,0.28)" stroke="#FF9100" strokeWidth={1} />
              <circle r={3} fill="#FF9100" />
            </Marker>
          ))}
        </ZoomableGroup>
      </ComposableMap>
      {tip && <div className={styles.mapTip} style={{ left: tip.x + 12, top: tip.y + 12 }}>{tip.text}</div>}
    </>
  )
}
```

- [ ] **Step 2: Verify the build is green**

Run: `cd frontend && npm run build`
Expected: `✓ built`. `GlobalMap` still calls `WorldMap` without the new props, which is valid because they are optional (portfolio defaults `false`, so behavior is unchanged for now).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/globe/WorldMap.tsx
git commit -m "feat(globe): WorldMap portfolio tint + exposure bubbles (opt-in props)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: MapLegend toggle + PortfolioPanel + styles

**Files:**
- Modify: `frontend/src/components/globe/MapLegend.tsx` (full rewrite)
- Create: `frontend/src/components/globe/PortfolioPanel.tsx`
- Modify: `frontend/src/components/globe/GlobalMap.module.css` (append)

**Interfaces:**
- Consumes: `ExposureModel` (Task 1), `fmtCompact`/`fmtUsd` (existing `format.ts`).
- Produces: `MapLegend` with new optional props `portfolio?: boolean`, `onTogglePortfolio?: (v: boolean) => void`; `PortfolioPanel({ exposure, onPick, onClose })`.

- [ ] **Step 1: Replace the entire contents of `MapLegend.tsx`**

```tsx
import { METRIC_META, type MapMetric } from '../../geo/scales'
import styles from './GlobalMap.module.css'

const METRICS: MapMetric[] = ['eq', 'gdp', 'inflation', 'unemployment']

export default function MapLegend(
  { metric, onMetric, showGeo, onToggleGeo, portfolio = false, onTogglePortfolio }:
  {
    metric: MapMetric; onMetric: (m: MapMetric) => void; showGeo: boolean; onToggleGeo: (v: boolean) => void
    portfolio?: boolean; onTogglePortfolio?: (v: boolean) => void
  },
) {
  const meta = METRIC_META[metric]
  return (
    <div className={styles.legend}>
      {portfolio ? (
        <div className={styles.pfLegend}>
          <span className={styles.pfLegLbl}>EXPOSURE</span>
          <span className={styles.legendBar} style={{ background: 'linear-gradient(90deg,#141b23,#42A5F5)' }} />
          <span className={styles.pfLegLbl}>P&amp;L</span>
          <span className={styles.pfSwatch} style={{ background: '#FF1744' }} />
          <span className={styles.pfSwatch} style={{ background: '#00E676' }} />
        </div>
      ) : (
        <>
          <div className={styles.metricSel}>
            {METRICS.map((m) => (
              <button key={m} className={`${styles.metricBtn} ${metric === m ? styles.metricOn : ''}`} onClick={() => onMetric(m)}>
                {METRIC_META[m].short}
              </button>
            ))}
          </div>
          <div className={styles.legendScale}>
            <span>{meta.lo}</span>
            <span className={styles.legendBar} style={{ background: meta.gradient }} />
            <span>{meta.hi}</span>
          </div>
        </>
      )}
      <button className={`${styles.legendToggle} ${portfolio ? styles.pfToggleOn : ''}`} onClick={() => onTogglePortfolio?.(!portfolio)}>
        ◧ Portfolio
      </button>
      <button className={`${styles.legendToggle} ${showGeo ? styles.legendToggleOn : ''}`} onClick={() => onToggleGeo(!showGeo)}>
        ◉ Geopolitical
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Create `frontend/src/components/globe/PortfolioPanel.tsx`**

```tsx
import { fmtCompact, fmtUsd } from '../../format'
import type { ExposureModel } from '../../types'
import styles from './GlobalMap.module.css'

const CATS = ['FX', 'CRYPTO', 'CMD', 'INDEX', 'EQ', 'OTHER']

function Signed({ v }: { v: number }) {
  return <span className={v >= 0 ? styles.pos : styles.neg}>{v >= 0 ? '+' : '−'}${fmtCompact(Math.abs(v))}</span>
}
const usdSigned = (v: number) => `${v >= 0 ? '+' : ''}${fmtUsd(v)}`

export default function PortfolioPanel(
  { exposure, onPick, onClose }: { exposure: ExposureModel; onPick: (symbol: string) => void; onClose: () => void },
) {
  const rows = Object.values(exposure.perCountry).sort((a, b) => b.notional - a.notional)
  const { totals, nonGeo } = exposure
  const hasNonGeo = nonGeo.count > 0 || nonGeo.realized !== 0
  const empty = rows.length === 0 && !hasNonGeo
  const pctOf = (n: number) => (totals.notional > 0 ? (n / totals.notional) * 100 : 0)

  return (
    <div className={styles.pp}>
      <div className={styles.ppHead}>
        <span className={styles.ppTitle}>PORTFOLIO</span>
        <button className={styles.cpClose} onClick={onClose}>✕</button>
      </div>
      {empty ? (
        <div className={styles.ppEmpty}>
          <div className={styles.ppEmptyBig}>No open positions</div>
          Open a trade in the Terminal to see your geographic exposure.
        </div>
      ) : (
        <div className={styles.ppBody}>
          <div className={styles.ppSummary}>
            <div className={styles.ppCell}><span className={styles.ppK}>EXPOSURE</span><b>{fmtUsd(totals.notional)}</b></div>
            <div className={styles.ppCell}><span className={styles.ppK}>POSITIONS</span><b>{totals.positions}</b></div>
            <div className={styles.ppCell}><span className={styles.ppK}>LATENT P&amp;L</span><b className={totals.latent >= 0 ? styles.pos : styles.neg}>{usdSigned(totals.latent)}</b></div>
            <div className={styles.ppCell}><span className={styles.ppK}>REALIZED</span><b className={totals.realized >= 0 ? styles.pos : styles.neg}>{usdSigned(totals.realized)}</b></div>
          </div>

          <div className={styles.cpSection}>BY COUNTRY</div>
          {rows.map((c) => {
            const click = c.topSymbol ? () => onPick(c.topSymbol) : undefined
            return (
              <div key={c.iso} className={`${styles.ppRow} ${click ? styles.ppRowClickable : ''}`} onClick={click}>
                <span className={styles.ppIso}>{c.iso}</span>
                <span className={styles.ppBar}><span className={styles.ppBarFill} style={{ width: `${Math.max(3, pctOf(c.notional))}%` }} /></span>
                <span className={styles.ppNum}>${fmtCompact(c.notional)}</span>
                <Signed v={c.latent} />
                <Signed v={c.realized} />
              </div>
            )
          })}

          {hasNonGeo && (
            <>
              <div className={styles.cpSection}>NON-GEOGRAPHIC</div>
              <div className={`${styles.ppRow} ${nonGeo.topSymbol ? styles.ppRowClickable : ''}`} onClick={nonGeo.topSymbol ? () => onPick(nonGeo.topSymbol) : undefined}>
                <span className={styles.ppIso}>ALL</span>
                <span className={styles.ppBar}><span className={styles.ppBarFill} style={{ width: `${Math.max(3, pctOf(nonGeo.notional))}%`, background: '#607D8B' }} /></span>
                <span className={styles.ppNum}>${fmtCompact(nonGeo.notional)}</span>
                <Signed v={nonGeo.latent} />
                <Signed v={nonGeo.realized} />
              </div>
              {CATS.filter((k) => nonGeo.byCat[k]).map((k) => {
                const b = nonGeo.byCat[k]
                return (
                  <div key={k} className={styles.ppSubRow}>
                    <span className={styles.ppSubK}>{k}</span>
                    <span className={styles.ppNum}>${fmtCompact(b.notional)}</span>
                    <Signed v={b.latent} />
                    <Signed v={b.realized} />
                  </div>
                )
              })}
            </>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Append styles to `GlobalMap.module.css`**

```css
/* portfolio panel (left drawer) */
.pp { position: absolute; top: 12px; left: 12px; bottom: 12px; width: 300px; z-index: 15; background: rgba(10,14,19,.96); border: 1px solid var(--border); border-radius: 10px; display: flex; flex-direction: column; box-shadow: 8px 0 30px rgba(0,0,0,.4); }
.ppHead { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border-bottom: 1px solid var(--border); }
.ppTitle { font: 800 13px/1 'JetBrains Mono', monospace; letter-spacing: 1px; color: #eef3f8; }
.ppBody { flex: 1; min-height: 0; overflow-y: auto; padding: 12px; }
.ppEmpty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; text-align: center; padding: 24px; color: var(--dim); font: 600 11px/1.5 'JetBrains Mono', monospace; }
.ppEmptyBig { font: 800 13px/1 'JetBrains Mono', monospace; color: #cfd8e3; }
.ppSummary { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: var(--border); border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
.ppCell { background: rgba(12,17,22,.7); padding: 7px 9px; display: flex; flex-direction: column; gap: 3px; }
.ppK { font: 700 8.5px/1 'JetBrains Mono', monospace; letter-spacing: 1px; color: var(--dim); }
.ppCell b { font: 800 13px/1 'JetBrains Mono', monospace; color: #eef3f8; font-variant-numeric: tabular-nums; }
.ppRow { display: grid; grid-template-columns: 26px 1fr auto auto auto; gap: 7px; align-items: center; padding: 6px 0; border-bottom: 1px solid rgba(96,125,139,.12); font: 700 10.5px/1.2 'JetBrains Mono', monospace; color: #cfd8e3; }
.ppRowClickable { cursor: pointer; }
.ppRowClickable:hover .ppIso { color: #42A5F5; }
.ppIso { font-weight: 800; color: #eef3f8; }
.ppBar { height: 6px; border-radius: 3px; background: rgba(66,165,245,.14); overflow: hidden; }
.ppBarFill { display: block; height: 100%; background: #42A5F5; border-radius: 3px; }
.ppNum { color: #cfd8e3; font-variant-numeric: tabular-nums; }
.ppSubRow { display: grid; grid-template-columns: 1fr auto auto auto; gap: 7px; align-items: center; padding: 3px 0 3px 8px; font: 700 9.5px/1.2 'JetBrains Mono', monospace; color: var(--dim); }
.ppSubK { letter-spacing: .5px; }
/* portfolio legend + toggle */
.pfLegend { display: flex; align-items: center; gap: 7px; font: 700 9px/1 'JetBrains Mono', monospace; color: var(--dim); }
.pfLegLbl { letter-spacing: .5px; }
.pfSwatch { width: 12px; height: 8px; border-radius: 2px; }
.pfToggleOn { color: #0b1116; background: #42A5F5; border-color: transparent; }
```

- [ ] **Step 4: Verify the build is green**

Run: `cd frontend && npm run build`
Expected: `✓ built`. `PortfolioPanel` is not imported yet (created for Task 5); `MapLegend`'s new props are optional so the current `GlobalMap` still compiles.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/globe/MapLegend.tsx frontend/src/components/globe/PortfolioPanel.tsx frontend/src/components/globe/GlobalMap.module.css
git commit -m "feat(globe): portfolio legend toggle + PortfolioPanel + styles

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: GlobalMap wiring — state, store, memo, Terminal bridge (feature goes live)

**Files:**
- Modify: `frontend/src/components/globe/GlobalMap.tsx` (full rewrite)

**Interfaces:**
- Consumes: `buildExposure` (Task 1); `WorldMap` portfolio props (Task 3); `MapLegend` portfolio props + `PortfolioPanel` (Task 4); `useStore` (existing) for `positions`, `history`, `assets`, `customs`, `select`, `setView`.

- [ ] **Step 1: Replace the entire contents of `GlobalMap.tsx`**

```tsx
import { useEffect, useMemo, useState } from 'react'

import { fetchGlobeGeo, fetchGlobeMacroLayer, fetchGlobeMarkets } from '../../api'
import { buildExposure } from '../../geo/exposure'
import type { MapMetric } from '../../geo/scales'
import { useStore } from '../../store'
import type { GeoPoint, GlobeGeo, GlobeMarkets, MacroLayer } from '../../types'
import CountryPanel from './CountryPanel'
import GeoPanel from './GeoPanel'
import MapLegend from './MapLegend'
import PortfolioPanel from './PortfolioPanel'
import SessionClock from './SessionClock'
import WorldMap from './WorldMap'
import WorldSummary from './WorldSummary'
import styles from './GlobalMap.module.css'

const LS_PF = 'apex.globe.portfolio'
const loadPf = (): boolean => { try { return localStorage.getItem(LS_PF) === '1' } catch { return false } }

export default function GlobalMap() {
  const [markets, setMarkets] = useState<GlobeMarkets | null>(null)
  const [geo, setGeo] = useState<GlobeGeo | null>(null)
  const [layer, setLayer] = useState<MacroLayer | null>(null)
  const [metric, setMetric] = useState<MapMetric>('eq')
  const [selected, setSelected] = useState<string | null>(null)
  const [geoSel, setGeoSel] = useState<GeoPoint | null>(null)
  const [showGeo, setShowGeo] = useState(false)
  const [portfolio, setPortfolio] = useState<boolean>(loadPf)

  const positions = useStore((s) => s.positions)
  const history = useStore((s) => s.history)
  const assets = useStore((s) => s.assets)
  const customs = useStore((s) => s.customs)
  const select = useStore((s) => s.select)
  const setView = useStore((s) => s.setView)

  const exposure = useMemo(() => {
    const indexMap: Record<string, string> = {}
    for (const c of markets?.countries ?? []) indexMap[c.index] = c.iso
    return buildExposure(positions, history, assets, customs, indexMap)
  }, [positions, history, assets, customs, markets])

  const selectCountry = (iso: string) => { setGeoSel(null); setSelected(iso) }
  const hoverGeo = (p: GeoPoint) => { setSelected(null); setGeoSel(p) }
  const toggleGeo = (v: boolean) => { if (!v) setGeoSel(null); if (v) setPortfolio(false); setShowGeo(v) }
  const togglePortfolio = (v: boolean) => {
    if (v) { setShowGeo(false); setGeoSel(null); setSelected(null) }
    setPortfolio(v)
    try { localStorage.setItem(LS_PF, v ? '1' : '0') } catch { /* ignore */ }
  }
  const pick = (symbol: string) => { select(symbol); setView('TERMINAL') }
  const exposureClick = (iso: string) => { const c = exposure.perCountry[iso]; if (c?.topSymbol) pick(c.topSymbol) }

  useEffect(() => {
    let alive = true
    const pullM = () => { void fetchGlobeMarkets().then((m) => alive && m && setMarkets(m)) }
    const pullG = () => { void fetchGlobeGeo().then((g) => alive && g && setGeo(g)) }
    pullM(); pullG()
    void fetchGlobeMacroLayer().then((l) => alive && l && setLayer(l))
    const m = setInterval(pullM, 20_000)
    const g = setInterval(pullG, 10 * 60_000)
    return () => { alive = false; clearInterval(m); clearInterval(g) }
  }, [])

  return (
    <div className={styles.wrap}>
      <WorldSummary markets={markets} />
      <div className={styles.mapArea}>
        <WorldMap markets={markets} geo={geo} showGeo={showGeo} metric={metric} layer={layer}
          portfolio={portfolio} exposure={portfolio ? exposure : null}
          onSelect={selectCountry} onGeoHover={hoverGeo} onExposureClick={exposureClick} />
        <MapLegend metric={metric} onMetric={setMetric} showGeo={showGeo} onToggleGeo={toggleGeo}
          portfolio={portfolio} onTogglePortfolio={togglePortfolio} />
        {portfolio && <PortfolioPanel exposure={exposure} onPick={pick} onClose={() => togglePortfolio(false)} />}
        {!portfolio && selected && <CountryPanel iso={selected} onClose={() => setSelected(null)} />}
        {showGeo && geoSel && <GeoPanel point={geoSel} onClose={() => setGeoSel(null)} />}
      </div>
      <SessionClock />
      <footer className={styles.disclaimer}>
        Indices &amp; FX via Yahoo · macro via World Bank (annual) · geopolitical = countries in
        current market news · portfolio = your open positions &amp; trades (client-side). No values are simulated.
      </footer>
    </div>
  )
}
```

- [ ] **Step 2: Verify the build is green**

Run: `cd frontend && npm run build`
Expected: `✓ built`.

- [ ] **Step 3: Live verification**

Start the app (`./dev.ps1`, or backend on :8000 + `cd frontend && npm run dev`) and:
1. In the **Terminal**, open a BUY on `AAPL` (US) and a BUY on `GER40` (DE); optionally a `EURUSD` position (non-geographic) and search-add a `.PA` stock and buy it (FR).
2. Switch to **GLOBAL**, click **◧ Portfolio** in the legend.
   - US / DE / FR are tinted blue by exposure; a bubble sits on each, sized by notional, green if up / red if down.
   - Hover a bubble → tooltip `Name · $notional · P&L ±$… · real ±$… · N pos`.
   - The left **PORTFOLIO** panel lists EXPOSURE / POSITIONS / LATENT / REALIZED, a BY COUNTRY list with allocation bars, and a NON-GEOGRAPHIC row showing the EURUSD (FX) exposure.
3. Click the AAPL bubble (or its US panel row) → the app switches to the **Terminal** with `AAPL` selected.
4. Back in GLOBAL/Portfolio, close the GER40 position in the Terminal → its bubble disappears and its P&L moves into DE's realized figure in the panel.
5. Reload the page → Portfolio mode is still on (persisted).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/globe/GlobalMap.tsx
git commit -m "feat(globe): wire portfolio mode — exposure memo, toggle, Terminal bridge

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Documentation + final verification

**Files:**
- Modify: `CLAUDE.md` (Global Map bullet)

- [ ] **Step 1: Update the Global Map bullet in `CLAUDE.md`**

Find the `**Global Map**` bullet under "Key behaviours" and append this sentence to it:

```
A client-side **Portfolio** mode (toggle in the map legend, persisted `apex.globe.portfolio`) overlays the user's book on the map: countries tinted by notional exposure (blue ramp) with bubbles sized by notional and colored by latent P&L, a left `PortfolioPanel` (per-country latent + realized, plus a non-geographic FX/crypto/commodity bucket), and click-through back to the Terminal. Symbol→country resolution lives in `geo/exposure.ts` (base table + Yahoo exchange suffix + the loaded markets board); nothing is simulated.
```

- [ ] **Step 2: Full frontend build**

Run: `cd frontend && npm run build`
Expected: `✓ built` with no TypeScript errors.

- [ ] **Step 3: Backend sanity (unchanged, but confirm nothing regressed)**

Run: `cd backend && python -m pytest -q`
Expected: `32 passed`.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(globe): document portfolio exposure mode

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-review (completed by plan author)

**1. Spec coverage**

| Spec requirement | Task |
|---|---|
| Notional exposure | Task 1 (`buildExposure` notional) |
| Non-geographic bucket for FX/crypto/CMD | Task 1 (`nonGeo` + `byCat`), Task 4 (panel rows) |
| Symbol→ISO (base table + Yahoo suffix + index board) | Task 1 (`resolveIso`) |
| Exposure tint = blue ramp | Task 2 (`expoFill`), Task 3 (`fillFor`) |
| Bubble size = notional, color = latent P&L | Task 3 (Markers) |
| Green/red reserved for P&L | Task 2 (`pnlFill`/`BLUE` split), Task 3 |
| Left panel: latent + realized per country | Task 4 (`PortfolioPanel`) |
| Realized-only country = panel-only (no tint/bubble) | Task 3 (`notional > 0` guards), Task 4 (rows) |
| Portfolio toggle (persisted) | Task 4 (`MapLegend`), Task 5 (`LS_PF`) |
| Terminal bridge (click → select + setView) | Task 5 (`pick`/`exposureClick`) |
| Empty state → CTA to Terminal | Task 4 (`ppEmpty`) |
| Honesty disclaimer | Task 5 (footer), Task 6 (CLAUDE.md) |
| Frontend-only, no backend change | All tasks (backend untouched; Task 6 confirms pytest) |

**2. Placeholder scan:** No TBD/TODO; every code step contains complete content. ✓

**3. Type consistency:** `ExposureModel` / `CountryExposure` / `NonGeo` defined in Task 1 are used with the same field names (`perCountry`, `notional`, `latent`, `realized`, `topSymbol`, `maxNotional`, `maxAbsLatent`, `nonGeo.byCat`) in Tasks 3–5. `resolveIso`/`buildExposure` signatures match their call site in Task 5. `expoFill`/`pnlFill` signatures match their use in Task 3. ✓

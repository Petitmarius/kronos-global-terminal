# Portfolio "Performance & Asset Hub" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a right-docked "Performance & Asset Hub" to the map's Portfolio mode (30-day realized-P&L area chart + non-geographic donut with hover drill-down) and tidy the left PortfolioPanel (column headers, drop the non-geo section).

**Architecture:** Entirely frontend. `geo/exposure.ts` gains per-symbol `items` on each non-geo class and a pure `realizedCurve(history)` helper. A new right panel `AnalyticsPanel` (area chart via lightweight-charts + a hand-rolled SVG `NonGeoDonut`) renders next to the existing left `PortfolioPanel`, both only in portfolio mode.

**Tech Stack:** React 18 + TypeScript + Zustand, lightweight-charts (area), CSS Modules. No new dependencies.

## Global Constraints

- **Frontend-only.** No backend, no new npm dependencies, no test framework. Verify each task with `cd frontend && npm run build` (`tsc --noEmit && vite build`) + the noted live checks.
- Both panels render **only in portfolio mode**; the realized curve uses `history` closed-trade timestamps; the donut allocation is by non-geo **notional**.
- Symbols are shown as stored tickers (`EURUSD`, `USDJPY`, `BTCUSD`) — no `EUR/USD` reformatting.
- Reuse existing CSS tokens/classes (`.pos`, `.neg`, `.empty`, `.cpSection`, `.chartTip`, `.ppHead`, `.ppTitle`, `.ppBody`).
- Commit at the end of each task with the exact message given.

---

## File structure

| File | Responsibility | Change |
|---|---|---|
| `frontend/src/types.ts` | `NonGeoItem` + `items` on `NonGeoBucket` | Modify |
| `frontend/src/geo/exposure.ts` | per-symbol non-geo items + `realizedCurve` | Modify |
| `frontend/src/components/globe/PortfolioPanel.tsx` | column headers, drop non-geo | Modify |
| `frontend/src/components/globe/NonGeoDonut.tsx` | SVG donut + class rows + drill-down | Create |
| `frontend/src/components/globe/AnalyticsPanel.tsx` | right panel: realized chart + donut | Create |
| `frontend/src/components/globe/GlobalMap.tsx` | render the right panel in portfolio mode | Modify |
| `frontend/src/components/globe/GlobalMap.module.css` | headers, `.rp`, donut styles | Modify |
| `CLAUDE.md` | document the hub | Modify |

---

## Task 1: Data model — non-geo `items` + `realizedCurve`

**Files:**
- Modify: `frontend/src/types.ts`, `frontend/src/geo/exposure.ts`

**Interfaces:**
- Produces: `NonGeoItem { symbol, notional, latent, realized }`; `NonGeoBucket.items: NonGeoItem[]`;
  `realizedCurve(history: ClosedTrade[], days?): { time: number; value: number }[]`.

- [ ] **Step 1: Extend the types (`types.ts`)**

Replace the `NonGeoBucket` interface:

```ts
export interface NonGeoItem { symbol: string; notional: number; latent: number; realized: number }
export interface NonGeoBucket { notional: number; latent: number; realized: number; count: number; items: NonGeoItem[] }
```

- [ ] **Step 2: Populate `items` + add `realizedCurve` (`exposure.ts`)**

Update the import line to include `NonGeoItem`:

```ts
import type { Asset, ClosedTrade, CountryExposure, ExposureModel, NonGeo, NonGeoBucket, NonGeoItem, Position } from '../types'
```

Change `bucket()` to seed `items`:

```ts
const bucket = (): NonGeoBucket => ({ notional: 0, latent: 0, realized: 0, count: 0, items: [] })
```

Inside `buildExposure`, add a per-`(cat,symbol)` accumulator next to the other locals
(after `let nonGeoTop = 0`):

```ts
  const catItems: Record<string, Record<string, NonGeoItem>> = {}
```

and, next to `catBucket`, an `itemFor` helper:

```ts
  const itemFor = (cat: string, symbol: string): NonGeoItem => {
    const m = catItems[cat] ?? (catItems[cat] = {})
    return m[symbol] ?? (m[symbol] = { symbol, notional: 0, latent: 0, realized: 0 })
  }
```

In the **position** loop, replace the non-geo `else` branch:

```ts
    } else {
      nonGeo.notional += notional; nonGeo.latent += latent; nonGeo.count += 1
      const cat = a?.cat ?? 'OTHER'
      const b = catBucket(cat)
      b.notional += notional; b.latent += latent; b.count += 1
      const it = itemFor(cat, p.symbol); it.notional += notional; it.latent += latent
      if (notional > nonGeoTop) { nonGeoTop = notional; nonGeo.topSymbol = p.symbol }
    }
```

In the **history** loop, replace the non-geo `else` branch:

```ts
    else {
      nonGeo.realized += t.pnl
      const cat = assets[t.symbol]?.cat ?? 'OTHER'
      catBucket(cat).realized += t.pnl
      itemFor(cat, t.symbol).realized += t.pnl
    }
```

After the history loop (before the totals accumulation), attach the sorted items:

```ts
  for (const [cat, m] of Object.entries(catItems)) {
    catBucket(cat).items = Object.values(m).sort((a, b) => b.notional - a.notional)
  }
```

At the **end of the file**, add the pure helper:

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
    out.push({ time: Math.floor((start + i * dayMs) / 1000), value: cum })
    cum += byDay.get(i) ?? 0
  }
  return out
}
```

- [ ] **Step 3: Verify the build**

Run: `cd frontend && npm run build`
Expected: `✓ built`. (`items` is additive; the existing PortfolioPanel non-geo rows still compile; `realizedCurve` is unused for now.)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types.ts frontend/src/geo/exposure.ts
git commit -m "feat(globe): per-symbol non-geo items + realizedCurve helper

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Left panel — column headers + drop non-geo

**Files:**
- Modify: `frontend/src/components/globe/PortfolioPanel.tsx`, `frontend/src/components/globe/GlobalMap.module.css`

**Interfaces:**
- Produces: `.sVal` (right-aligned signed value) and `.ppColHead` classes reused by the right panel.

- [ ] **Step 1: Rewrite `PortfolioPanel.tsx`**

```tsx
import { fmtCompact, fmtUsd } from '../../format'
import type { ExposureModel } from '../../types'
import styles from './GlobalMap.module.css'

const PAL = ['#42A5F5', '#26C6DA', '#7E57C2', '#5C6BC0', '#78909C']

function Signed({ v }: { v: number }) {
  return <span className={`${styles.sVal} ${v >= 0 ? styles.pos : styles.neg}`}>{v >= 0 ? '+' : '−'}${fmtCompact(Math.abs(v))}</span>
}
const usdSigned = (v: number) => `${v >= 0 ? '+' : ''}${fmtUsd(v)}`

export default function PortfolioPanel(
  { exposure, onPick, onClose }: { exposure: ExposureModel; onPick: (symbol: string) => void; onClose: () => void },
) {
  const rows = Object.values(exposure.perCountry).sort((a, b) => b.notional - a.notional)
  const { totals, nonGeo } = exposure
  const empty = rows.length === 0 && nonGeo.count === 0 && nonGeo.realized === 0
  const maxBar = Math.max(...rows.map((r) => r.notional), 1)

  const geoTotal = rows.reduce((s, c) => s + c.notional, 0) || 1
  const segs = rows.slice(0, 5).map((c, i) => ({ iso: c.iso, pct: (c.notional / geoTotal) * 100, color: PAL[i] }))
  const othersN = rows.slice(5).reduce((s, c) => s + c.notional, 0)
  if (othersN > 0) segs.push({ iso: 'Others', pct: (othersN / geoTotal) * 100, color: '#37424d' })

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

          {rows.length > 0 && (
            <>
              <div className={styles.cpSection}>ALLOCATION · TOP {Math.min(5, rows.length)}</div>
              <div className={styles.ppStack}>
                {segs.map((s) => <span key={s.iso} className={styles.ppSeg} style={{ width: `${s.pct}%`, background: s.color }} title={`${s.iso} ${s.pct.toFixed(1)}%`} />)}
              </div>
              <div className={styles.ppStackLeg}>
                {segs.map((s) => (
                  <span key={s.iso} className={styles.ppStackItem}>
                    <span className={styles.ppDot} style={{ background: s.color }} />{s.iso} {s.pct.toFixed(0)}%
                  </span>
                ))}
              </div>
            </>
          )}

          <div className={styles.cpSection}>BY COUNTRY</div>
          {rows.length === 0 ? (
            <div className={styles.empty}>No geographic exposure.</div>
          ) : (
            <>
              <div className={styles.ppColHead}><span /><span /><span>EXP</span><span>LAT</span><span>REAL</span></div>
              {rows.map((c) => {
                const click = c.topSymbol ? () => onPick(c.topSymbol) : undefined
                return (
                  <div key={c.iso} className={`${styles.ppRow} ${click ? styles.ppRowClickable : ''}`} onClick={click}>
                    <span className={styles.ppIso}>{c.iso}</span>
                    <span className={styles.ppBar}><span className={styles.ppBarFill} style={{ width: `${Math.max(3, (c.notional / maxBar) * 100)}%` }} /></span>
                    <span className={styles.ppNum}>${fmtCompact(c.notional)}</span>
                    <Signed v={c.latent} />
                    <Signed v={c.realized} />
                  </div>
                )
              })}
            </>
          )}

          <div className={styles.ppCaption}>Bubble size = exposure · color = latent P&amp;L</div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Update the CSS (`GlobalMap.module.css`)**

Change the `.ppRow` grid to fixed numeric tracks — replace:

```css
.ppRow { display: grid; grid-template-columns: 26px 1fr auto auto auto; gap: 7px; align-items: center; padding: 6px 0; border-bottom: 1px solid rgba(96,125,139,.12); font: 700 10.5px/1.2 'JetBrains Mono', monospace; color: #cfd8e3; }
```

with:

```css
.ppRow { display: grid; grid-template-columns: 24px 1fr 56px 52px 52px; gap: 7px; align-items: center; padding: 6px 0; border-bottom: 1px solid rgba(96,125,139,.12); font: 700 10.5px/1.2 'JetBrains Mono', monospace; color: #cfd8e3; }
```

Change `.ppNum` to right-align — replace:

```css
.ppNum { color: #cfd8e3; font-variant-numeric: tabular-nums; }
```

with:

```css
.ppNum { color: #cfd8e3; font-variant-numeric: tabular-nums; text-align: right; }
```

Append the header + right-aligned-value classes:

```css
.ppColHead { display: grid; grid-template-columns: 24px 1fr 56px 52px 52px; gap: 7px; padding: 2px 0 3px; font: 700 8px/1 'JetBrains Mono', monospace; letter-spacing: .5px; color: var(--dim); }
.ppColHead span:nth-child(n+3) { text-align: right; }
.sVal { text-align: right; font-variant-numeric: tabular-nums; }
```

- [ ] **Step 3: Verify the build**

Run: `cd frontend && npm run build`
Expected: `✓ built`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/globe/PortfolioPanel.tsx frontend/src/components/globe/GlobalMap.module.css
git commit -m "feat(globe): PortfolioPanel column headers; drop non-geo section

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: `NonGeoDonut` component

**Files:**
- Create: `frontend/src/components/globe/NonGeoDonut.tsx`
- Modify: `frontend/src/components/globe/GlobalMap.module.css`

**Interfaces:**
- Consumes: `NonGeoBucket` with `items` (Task 1); `.sVal` (Task 2).
- Produces: `NonGeoDonut({ byCat: Record<string, NonGeoBucket>; onPick: (symbol: string) => void })`.

- [ ] **Step 1: Create `NonGeoDonut.tsx`**

```tsx
import { useState } from 'react'

import { fmtCompact } from '../../format'
import type { NonGeoBucket } from '../../types'
import styles from './GlobalMap.module.css'

const CAT_COLOR: Record<string, string> = { FX: '#42A5F5', CRYPTO: '#7E57C2', CMD: '#FF9100', INDEX: '#26C6DA', EQ: '#5C6BC0', OTHER: '#607D8B' }
const catColor = (c: string) => CAT_COLOR[c] ?? '#607D8B'

const polar = (cx: number, cy: number, r: number, ang: number): [number, number] => [cx + r * Math.cos(ang), cy + r * Math.sin(ang)]
function arcPath(cx: number, cy: number, rO: number, rI: number, a0: number, a1: number): string {
  const large = a1 - a0 > Math.PI ? 1 : 0
  const [x0o, y0o] = polar(cx, cy, rO, a0)
  const [x1o, y1o] = polar(cx, cy, rO, a1)
  const [x1i, y1i] = polar(cx, cy, rI, a1)
  const [x0i, y0i] = polar(cx, cy, rI, a0)
  return `M ${x0o} ${y0o} A ${rO} ${rO} 0 ${large} 1 ${x1o} ${y1o} L ${x1i} ${y1i} A ${rI} ${rI} 0 ${large} 0 ${x0i} ${y0i} Z`
}

function Signed({ v }: { v: number }) {
  return <span className={`${styles.sVal} ${v >= 0 ? styles.pos : styles.neg}`}>{v >= 0 ? '+' : '−'}${fmtCompact(Math.abs(v))}</span>
}

export default function NonGeoDonut(
  { byCat, onPick }: { byCat: Record<string, NonGeoBucket>; onPick: (symbol: string) => void },
) {
  const [hover, setHover] = useState<string | null>(null)
  const cats = Object.entries(byCat)
    .map(([cat, b]) => ({ cat, ...b }))
    .filter((c) => c.notional > 0 || c.realized !== 0 || c.count > 0)
    .sort((a, b) => b.notional - a.notional)

  if (cats.length === 0) return <div className={styles.empty}>No non-geographic positions.</div>

  const total = cats.reduce((s, c) => s + c.notional, 0)
  const cx = 60, cy = 60, rO = 52, rI = 32
  let ang = -Math.PI / 2
  const slices = total > 0 ? cats.filter((c) => c.notional > 0).map((c) => {
    const a0 = ang; const a1 = ang + (c.notional / total) * Math.PI * 2; ang = a1
    return { cat: c.cat, path: arcPath(cx, cy, rO, rI, a0, a1) }
  }) : []

  const hoveredCat = hover ? cats.find((c) => c.cat === hover) ?? null : null
  const centerLabel = hoveredCat ? hoveredCat.cat : 'NON-GEO'
  const centerValue = hoveredCat ? `$${fmtCompact(hoveredCat.notional)}` : `$${fmtCompact(total)}`

  return (
    <div>
      {slices.length > 0 && (
        <div className={styles.donutWrap}>
          <svg viewBox="0 0 120 120" className={styles.donut}>
            {slices.map((s) => (
              <path key={s.cat} d={s.path} fill={catColor(s.cat)}
                opacity={hover && hover !== s.cat ? 0.35 : 1}
                onMouseEnter={() => setHover(s.cat)} onMouseLeave={() => setHover(null)} />
            ))}
          </svg>
          <div className={styles.donutCenter}>
            <span className={styles.donutLbl}>{centerLabel}</span>
            <span className={styles.donutVal}>{centerValue}</span>
          </div>
        </div>
      )}

      {hoveredCat ? (
        hoveredCat.items.length > 0 ? hoveredCat.items.map((it) => (
          <div key={it.symbol} className={styles.ngItem} onClick={() => onPick(it.symbol)}>
            <span className={styles.ngSym}>{it.symbol}</span>
            <Signed v={it.latent} />
            <Signed v={it.realized} />
          </div>
        )) : <div className={styles.empty}>No open {hoveredCat.cat} positions.</div>
      ) : (
        <>
          <div className={styles.ngHead}><span /><span /><span>EXP</span><span>LAT</span><span>REAL</span></div>
          {cats.map((c) => (
            <div key={c.cat} className={styles.ngRow}>
              <span className={styles.ngDot} style={{ background: catColor(c.cat) }} />
              <span className={styles.ngCat}>{c.cat}</span>
              <span className={styles.ngNum}>${fmtCompact(c.notional)}</span>
              <Signed v={c.latent} />
              <Signed v={c.realized} />
            </div>
          ))}
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Append the donut styles (`GlobalMap.module.css`)**

```css
/* non-geo donut */
.donutWrap { position: relative; width: 120px; height: 120px; margin: 6px auto 12px; }
.donut { width: 120px; height: 120px; display: block; }
.donut path { cursor: pointer; transition: opacity .12s; }
.donutCenter { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; pointer-events: none; }
.donutLbl { font: 700 8px/1.4 'JetBrains Mono', monospace; letter-spacing: 1px; color: var(--dim); }
.donutVal { font: 800 13px/1.3 'JetBrains Mono', monospace; color: #eef3f8; font-variant-numeric: tabular-nums; }
.ngHead { display: grid; grid-template-columns: 12px 1fr 54px 50px 50px; gap: 6px; padding: 2px 0 3px; font: 700 8px/1 'JetBrains Mono', monospace; letter-spacing: .5px; color: var(--dim); }
.ngHead span:nth-child(n+3) { text-align: right; }
.ngRow { display: grid; grid-template-columns: 12px 1fr 54px 50px 50px; gap: 6px; align-items: center; padding: 5px 0; border-bottom: 1px solid rgba(96,125,139,.12); font: 700 10.5px/1.2 'JetBrains Mono', monospace; color: #cfd8e3; }
.ngDot { width: 9px; height: 9px; border-radius: 2px; }
.ngCat { font-weight: 800; color: #eef3f8; letter-spacing: .5px; }
.ngNum { text-align: right; color: #cfd8e3; font-variant-numeric: tabular-nums; }
.ngItem { display: grid; grid-template-columns: 1fr 50px 50px; gap: 6px; align-items: center; padding: 5px 0; border-bottom: 1px solid rgba(96,125,139,.12); font: 700 10.5px/1.2 'JetBrains Mono', monospace; color: #cfd8e3; cursor: pointer; }
.ngItem:hover .ngSym { color: #42A5F5; }
.ngSym { font-weight: 800; color: #eef3f8; }
```

- [ ] **Step 3: Verify the build**

Run: `cd frontend && npm run build`
Expected: `✓ built`. (`NonGeoDonut` is not imported yet — a valid unused module.)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/globe/NonGeoDonut.tsx frontend/src/components/globe/GlobalMap.module.css
git commit -m "feat(globe): NonGeoDonut — allocation donut with hover drill-down

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: `AnalyticsPanel` (right panel) + GlobalMap wiring

**Files:**
- Create: `frontend/src/components/globe/AnalyticsPanel.tsx`
- Modify: `frontend/src/components/globe/GlobalMap.tsx`, `frontend/src/components/globe/GlobalMap.module.css`

**Interfaces:**
- Consumes: `realizedCurve` (Task 1), `NonGeoDonut` (Task 3), `ExposureModel`/`ClosedTrade`.

- [ ] **Step 1: Create `AnalyticsPanel.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react'
import { ColorType, createChart, LineStyle, type IChartApi, type ISeriesApi } from 'lightweight-charts'

import { fmtUsd } from '../../format'
import { realizedCurve } from '../../geo/exposure'
import type { ClosedTrade, ExposureModel } from '../../types'
import NonGeoDonut from './NonGeoDonut'
import styles from './GlobalMap.module.css'

function RealizedChart({ history }: { history: ClosedTrade[] }) {
  const ref = useRef<HTMLDivElement>(null)
  const [tip, setTip] = useState<{ x: number; y: number; v: number } | null>(null)
  const curve = realizedCurve(history)

  useEffect(() => {
    setTip(null)
    if (curve.length < 2 || !ref.current) return
    const up = curve[curve.length - 1].value >= 0
    const chart: IChartApi = createChart(ref.current, {
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#4A5663', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, attributionLogo: false },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      rightPriceScale: { visible: false }, timeScale: { visible: false },
      crosshair: {
        horzLine: { visible: false, labelVisible: false },
        vertLine: { visible: true, color: 'rgba(120,144,163,.5)', width: 1, style: LineStyle.Dotted, labelVisible: false },
      },
      autoSize: true, handleScroll: false, handleScale: false,
    })
    const area: ISeriesApi<'Area'> = chart.addAreaSeries({ lineColor: up ? '#00E676' : '#FF1744', topColor: up ? 'rgba(0,230,118,.25)' : 'rgba(255,23,68,.25)', bottomColor: 'transparent', lineWidth: 2, priceLineVisible: false, lastValueVisible: false })
    area.setData(curve.map((p) => ({ time: p.time as never, value: p.value })))
    chart.timeScale().fitContent()
    chart.subscribeCrosshairMove((param) => {
      const pt = param.point
      const pd = param.seriesData.get(area) as { value?: number } | undefined
      if (!pt || !pd || pd.value == null) { setTip(null); return }
      setTip({ x: pt.x as number, y: pt.y as number, v: pd.value })
    })
    return () => { chart.remove() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history])

  if (curve.length < 2) return <div className={styles.rpEmpty}>No realized P&amp;L in the last 30 days.</div>

  return (
    <div className={styles.rpChart}>
      <div ref={ref} className={styles.rpChartInner} />
      {tip && <div className={styles.chartTip} style={{ left: tip.x, top: tip.y }}>{tip.v >= 0 ? '+' : '−'}{fmtUsd(Math.abs(tip.v))}</div>}
    </div>
  )
}

export default function AnalyticsPanel(
  { exposure, history, onPick }: { exposure: ExposureModel; history: ClosedTrade[]; onPick: (symbol: string) => void },
) {
  return (
    <div className={styles.rp}>
      <div className={styles.ppHead}><span className={styles.ppTitle}>PERFORMANCE</span></div>
      <div className={styles.ppBody}>
        <div className={styles.cpSection}>REALIZED P&amp;L · 30D</div>
        <RealizedChart history={history} />

        <div className={styles.cpSection}>NON-GEOGRAPHIC RISK</div>
        <NonGeoDonut byCat={exposure.nonGeo.byCat} onPick={onPick} />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Append the right-panel styles (`GlobalMap.module.css`)**

```css
/* right analytics panel */
.rp { position: absolute; top: 12px; right: 12px; bottom: 12px; width: 300px; z-index: 15; background: rgba(10,14,19,.96); border: 1px solid var(--border); border-radius: 10px; display: flex; flex-direction: column; box-shadow: -8px 0 30px rgba(0,0,0,.4); }
.rpChart { height: 120px; margin: 8px 0 4px; position: relative; }
.rpChartInner { position: absolute; inset: 0; }
.rpEmpty { height: 90px; display: flex; align-items: center; justify-content: center; text-align: center; color: var(--dim); font: 600 10px/1.4 'JetBrains Mono', monospace; padding: 0 12px; }
```

- [ ] **Step 3: Render the right panel (`GlobalMap.tsx`)**

Add the import next to the other globe imports (after `import PortfolioPanel from './PortfolioPanel'`):

```tsx
import AnalyticsPanel from './AnalyticsPanel'
```

Add the panel right after the `PortfolioPanel` render line:

```tsx
        {portfolio && <PortfolioPanel exposure={exposure} onPick={pick} onClose={() => togglePortfolio(false)} />}
        {portfolio && <AnalyticsPanel exposure={exposure} history={history} onPick={pick} />}
```

- [ ] **Step 4: Verify (build + live)**

Run: `cd frontend && npm run build`
Expected: `✓ built`.

Live (portfolio mode): the right **PERFORMANCE** panel appears. With closed trades, the
30-day realized area chart renders (hover → `±$` tooltip); with FX/crypto/commodity
positions the donut shows a slice per class; hovering the **FX** slice lists your FX
pairs (`EURUSD`, `USDJPY`…) with latent + realized; clicking a drill-down row jumps to
the Terminal. Left panel shows `EXP · LAT · REAL` headers and no NON-GEOGRAPHIC section.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/globe/AnalyticsPanel.tsx frontend/src/components/globe/GlobalMap.tsx frontend/src/components/globe/GlobalMap.module.css
git commit -m "feat(globe): right AnalyticsPanel — realized-P&L chart + non-geo donut

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Docs + final verification

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Document the hub (`CLAUDE.md`)**

In the **Global Map** bullet, find the Portfolio-mode sentence ending
"…and click-through back to the Terminal." and append:

```
A right-docked **AnalyticsPanel** balances the view: a 30-day **realized-P&L** area chart (`geo/exposure.realizedCurve`) and a **non-geographic** SVG donut (`NonGeoDonut`, FX/crypto/commodities) with per-class latent/realized P&L and a hover drill-down to the underlying symbols. The left `PortfolioPanel` keeps only geographic exposure (EXP/LAT/REAL columns); non-geographic assets live in the right panel.
```

- [ ] **Step 2: Final build**

Run: `cd frontend && npm run build`
Expected: `✓ built` with no TypeScript errors.

- [ ] **Step 3: Backend sanity**

Run: `cd backend && python -m pytest -q`
Expected: `35 passed`.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(globe): document the Performance & Asset Hub

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-review (completed by plan author)

**1. Spec coverage**

| Spec requirement | Task |
|---|---|
| `NonGeoItem` + `items` on `NonGeoBucket` | Task 1 |
| `realizedCurve(history, days)` helper | Task 1 |
| Left: `EXP·LAT·REAL` headers | Task 2 |
| Left: remove NON-GEOGRAPHIC | Task 2 |
| Donut (allocation by notional) + per-class P&L | Task 3 |
| Hover slice → symbol drill-down with P&L | Task 3 |
| Right panel: 30-day realized area chart | Task 4 (`RealizedChart`) |
| Right panel only in portfolio mode | Task 4 (GlobalMap guard) |
| Empty states (no history / no non-geo) | Task 3 + Task 4 |
| Docs | Task 5 |

**2. Placeholder scan:** No TBD/TODO; every code step is complete. ✓

**3. Type consistency:** `NonGeoBucket.items: NonGeoItem[]` (Task 1) consumed by `NonGeoDonut` (Task 3). `realizedCurve` signature (Task 1) matches its call in `RealizedChart` (Task 4). `NonGeoDonut({ byCat, onPick })` (Task 3) matches its use in `AnalyticsPanel` (Task 4). `AnalyticsPanel({ exposure, history, onPick })` (Task 4) matches the `GlobalMap` render (Task 4). `.sVal`/`.ppColHead` defined in Task 2, reused in Task 3. ✓

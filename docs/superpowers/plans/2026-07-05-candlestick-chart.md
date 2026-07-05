# Candlestick Chart + Line/Candles Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real candlestick rendering mode to the main chart with a persisted LINE/CANDLES toolbar toggle (default LINE), using Yahoo's per-bar OHLC.

**Architecture:** The candle feed gains `open`/`high`/`low` (Yahoo already returns them). A `chartType` flag in the store drives `PriceChart` to build either the current area series or a candlestick series; the live tick updates the last bar accordingly. Studies and the range badge are unchanged (they use the close).

**Tech Stack:** FastAPI + urllib (backend), React 18 + TypeScript + Zustand + lightweight-charts (frontend). No new dependencies.

## Global Constraints

- **Frontend-only verification** via `cd frontend && npm run build`; backend via `cd backend && python -m pytest -q` (37 passing). No new deps.
- **No fabrication:** OHLC is real Yahoo data; when a bar has no OHLC (synthetic fallback), render **line**, never a fake candle. Default chart type is **LINE**.
- Studies (MA/BB/RSI/MACD/VOL) and the range-performance badge stay unchanged — they read the close (`value`).
- Commit at the end of each task with the exact message given.

---

## File structure

| File | Responsibility | Change |
|---|---|---|
| `backend/providers.py` | Attach per-bar `open`/`high`/`low` to candles | Modify |
| `frontend/src/types.ts` | `CandlePoint` OHLC fields | Modify |
| `frontend/src/store.ts` | `chartType` state + `setChartType` (persisted) | Modify |
| `frontend/src/components/CenterPanel.tsx` | LINE/CANDLES toolbar toggle | Modify |
| `frontend/src/components/PriceChart.tsx` | Render area or candlestick; candle live tick | Modify |
| `CLAUDE.md`, `README.md` | Note candlestick support | Modify |

---

## Task 1: Backend — per-bar OHLC in candles

**Files:**
- Modify: `backend/providers.py`

**Interfaces:**
- Produces: candle points now include `open`/`high`/`low` (each may be `null`).

- [ ] **Step 1: Extract high/low and attach OHLC (`providers.py`)**

In `_candles_from_chart`, extend the arrays read from the quote block:

```python
        closes = q["close"]
        opens = q.get("open", [])
        highs = q.get("high", [])
        lows = q.get("low", [])
        vols = q.get("volume", [])
```

and replace the `points.append(...)` line inside the loop:

```python
        points.append({
            "time": int(t), "value": round(float(c), 6),
            "open": round(float(opens[i]), 6) if i < len(opens) and opens[i] is not None else None,
            "high": round(float(highs[i]), 6) if i < len(highs) and highs[i] is not None else None,
            "low": round(float(lows[i]), 6) if i < len(lows) and lows[i] is not None else None,
            "volume": int(vols[i]) if i < len(vols) and vols[i] is not None else None,
        })
```

(The first-bar `value = open` override below is unchanged.)

- [ ] **Step 2: Verify (pytest + live)**

Run: `cd backend && python -m pytest -q`
Expected: `37 passed` (unaffected).

Start the backend and probe:
`cd backend && python -m uvicorn main:app --port 8000` (background), then
`curl -s "http://localhost:8000/api/assets/AAPL/candles?tf=1M" | python -c "import sys,json; p=json.load(sys.stdin)['points'][-2]; print('o',p.get('open'),'h',p.get('high'),'l',p.get('low'),'c',p['value'])"`
Expected: real numbers for `o/h/l/c` (a non-current bar, so OHLC is complete).

- [ ] **Step 3: Commit**

```bash
git add backend/providers.py
git commit -m "feat(chart): per-bar OHLC in the candle feed

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Frontend — types + `chartType` store state

**Files:**
- Modify: `frontend/src/types.ts`, `frontend/src/store.ts`

**Interfaces:**
- Produces: `CandlePoint.open/high/low`; store `chartType: 'line' | 'candles'` + `setChartType(t)`.

- [ ] **Step 1: Add OHLC to `CandlePoint` (`types.ts`)**

```ts
export interface CandlePoint {
  time: number
  value: number
  volume?: number | null
  open?: number | null
  high?: number | null
  low?: number | null
}
```

- [ ] **Step 2: Add `chartType` to the store (`store.ts`)**

Add the LS key next to the others (after `const LS_CAPITAL = 'apex.capital'`):

```ts
const LS_CHARTTYPE = 'apex.charttype'
```

Add the persisted load (after `const persistedCapital = loadLS<number>(LS_CAPITAL, BALANCE)`):

```ts
const persistedChartType = loadLS<'line' | 'candles'>(LS_CHARTTYPE, 'line')
```

In the `Store` interface, add the state + action (after `view` / `setView`):

```ts
  view: 'TERMINAL' | 'MACRO' | 'GLOBAL'
  setView: (v: 'TERMINAL' | 'MACRO' | 'GLOBAL') => void
  chartType: 'line' | 'candles'
  setChartType: (t: 'line' | 'candles') => void
```

In the initial state, after `view: loadLS<...>(LS_VIEW, 'TERMINAL'),`:

```ts
  chartType: persistedChartType,
```

Add the action next to `setView` (which is `setView: (view) => { saveLS(LS_VIEW, view); set({ view }) },`):

```ts
  setChartType: (chartType) => { saveLS(LS_CHARTTYPE, chartType); set({ chartType }) },
```

- [ ] **Step 3: Verify the build**

Run: `cd frontend && npm run build`
Expected: `✓ built`. (Unused new state is fine.)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types.ts frontend/src/store.ts
git commit -m "feat(chart): CandlePoint OHLC + persisted chartType store state

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Frontend — LINE/CANDLES toolbar toggle

**Files:**
- Modify: `frontend/src/components/CenterPanel.tsx`

**Interfaces:**
- Consumes: store `chartType` / `setChartType` (Task 2).

- [ ] **Step 1: Read the store fields (`CenterPanel.tsx`)**

Add next to the other `useStore` reads (after `const toggleIndicator = useStore((s) => s.toggleIndicator)`):

```ts
  const chartType = useStore((s) => s.chartType)
  const setChartType = useStore((s) => s.setChartType)
```

- [ ] **Step 2: Add the toolbar group (`CenterPanel.tsx`)**

In the `.toolbar`, after the STUDIES `.tgroup` block (the one containing `{STUDIES.map(...)}`), add:

```tsx
          <div className={styles.tgroup}>
            <span className={styles.tlabel}>CHART</span>
            <div className="seg">
              {(['line', 'candles'] as const).map((t) => (
                <button key={t} className={chartType === t ? 'on' : ''} onClick={() => setChartType(t)}>
                  {t === 'line' ? 'LINE' : 'CANDLES'}
                </button>
              ))}
            </div>
          </div>
```

- [ ] **Step 3: Verify the build**

Run: `cd frontend && npm run build`
Expected: `✓ built`. (Toggle is visible; `PriceChart` starts reacting in Task 4.)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/CenterPanel.tsx
git commit -m "feat(chart): LINE/CANDLES toolbar toggle

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Frontend — render candlesticks + live tick

**Files:**
- Modify: `frontend/src/components/PriceChart.tsx`

**Interfaces:**
- Consumes: store `chartType` (Task 2); `CandlePoint.open/high/low` (Tasks 1–2).

- [ ] **Step 1: Import the series type + read `chartType` (`PriceChart.tsx`)**

Extend the lightweight-charts import to include the union `ISeriesApi` already imported;
add `chartType` to the store reads (after `const indicators = useStore((s) => s.indicators)`):

```ts
  const chartType = useStore((s) => s.chartType)
```

Replace the `areaRef` declaration with generic series + bar refs (the block near
`const areaRef = useRef<ISeriesApi<'Area'> | null>(null)`):

```ts
  const seriesRef = useRef<ISeriesApi<'Area'> | ISeriesApi<'Candlestick'> | null>(null)
  const chartTypeRef = useRef<'line' | 'candles'>(chartType)
  const lastBarRef = useRef<{ open: number; high: number; low: number } | null>(null)
  const lastTimeRef = useRef<number | null>(null)
  const firstCloseRef = useRef<number | null>(null)
  const upRef = useRef(true)
```

(Remove the old `const areaRef = useRef<ISeriesApi<'Area'> | null>(null)` and
`const lastTimeRef = ...`/`const firstCloseRef = ...`/`const upRef = ...` duplicates — keep one of each as shown above.)

- [ ] **Step 2: Build area or candlestick in the rebuild effect (`PriceChart.tsx`)**

Add `chartType` to the effect's dependency array (`}, [selected, timeframe, indicators, digits, chartType])`),
set `chartTypeRef.current = chartType` at the top of the async body, and replace the
area-series creation + `areaRef`/`lastTimeRef`/`firstCloseRef` assignment block:

```ts
      const pts = data.points
      const up = (useStore.getState().assets[selected]?.pct ?? 0) >= 0
      upRef.current = up
      chartTypeRef.current = chartType

      const hasVol = pts.some((p) => (p.volume ?? 0) > 0)
      const volOn = indicators.has('VOL') && hasVol
      const useCandles = chartType === 'candles' && pts.some((p) => p.open != null)
      const chart = createChart(mainRef.current, {
        ...baseLayout,
        rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.12, bottom: volOn ? 0.24 : 0.08 } },
        timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false, rightOffset: 4 },
      })
      charts.push(chart)

      if (useCandles) {
        const candle = chart.addCandlestickSeries({
          upColor: COLORS.green, downColor: COLORS.red, borderVisible: false,
          wickUpColor: COLORS.green, wickDownColor: COLORS.red,
          priceFormat: { type: 'price', precision: digits, minMove: 10 ** -digits },
        })
        candle.setData(pts.map((p) => ({
          time: T(p.time), open: p.open ?? p.value, high: p.high ?? p.value, low: p.low ?? p.value, close: p.value,
        })))
        seriesRef.current = candle
        const last = pts.at(-1)
        lastBarRef.current = last ? { open: last.open ?? last.value, high: last.high ?? last.value, low: last.low ?? last.value } : null
      } else {
        const area = chart.addAreaSeries({
          ...neon(up), lineWidth: 2, priceLineVisible: false, lastValueVisible: true,
          crosshairMarkerRadius: 3, priceFormat: { type: 'price', precision: digits, minMove: 10 ** -digits },
        })
        area.setData(pts.map((p) => ({ time: T(p.time), value: p.value })))
        seriesRef.current = area
        lastBarRef.current = null
      }
      lastTimeRef.current = pts.at(-1)?.time ?? null
      firstCloseRef.current = pts[0]?.value ?? null
      const cur = useStore.getState().assets[selected]?.price ?? pts.at(-1)?.value ?? 0
      setRangePerf(firstCloseRef.current ? ((cur - firstCloseRef.current) / firstCloseRef.current) * 100 : null)
```

The MA / BB / VOL / RSI / MACD blocks below are unchanged (they use `pts` closes).
Update the cleanup to null `seriesRef` instead of `areaRef`:

```ts
    return () => {
      cancelled = true
      charts.forEach((c) => c.remove())
      seriesRef.current = null
      lastTimeRef.current = null
    }
```

- [ ] **Step 3: Update the live-tick effect for both modes (`PriceChart.tsx`)**

Replace the live-tick effect body:

```ts
  useEffect(() => {
    const series = seriesRef.current
    const t = lastTimeRef.current
    if (series && t != null && price != null) {
      if (chartTypeRef.current === 'candles' && lastBarRef.current) {
        const b = lastBarRef.current
        b.high = Math.max(b.high, price)
        b.low = Math.min(b.low, price)
        ;(series as ISeriesApi<'Candlestick'>).update({ time: T(t), open: b.open, high: b.high, low: b.low, close: price })
      } else {
        ;(series as ISeriesApi<'Area'>).update({ time: T(t), value: price })
        if (upRef.current !== (pct >= 0)) {
          upRef.current = pct >= 0
          ;(series as ISeriesApi<'Area'>).applyOptions(neon(pct >= 0))
        }
      }
      if (firstCloseRef.current) setRangePerf(((price - firstCloseRef.current) / firstCloseRef.current) * 100)
    }
  }, [price, pct])
```

- [ ] **Step 4: Verify (build + live)**

Run: `cd frontend && npm run build`
Expected: `✓ built`.

Live: with the backend + `npm run dev` up, on `AAPL` toggle **CANDLES** → real green/red
candlesticks; **LINE** → the area chart (unchanged). The live price grows the last candle's
high/low. Reload → the mode persists. Switch timeframe/symbol → mode kept. Toggle MA/BB/VOL
→ overlays render on candles too. `EURUSD` (no volume) VOL stays empty.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/PriceChart.tsx
git commit -m "feat(chart): render candlesticks + candle live tick

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Docs + final verification

**Files:**
- Modify: `CLAUDE.md`, `README.md`

- [ ] **Step 1: Note candlestick support (`CLAUDE.md`)**

In the **Timeframes are RANGE-based** bullet (or the chart description), append:

```
The main chart renders as an area **line** or real **candlesticks** (LINE/CANDLES toolbar toggle, persisted `apex.charttype`; OHLC is real Yahoo per-bar data — a bar with no OHLC falls back to line).
```

- [ ] **Step 2: Note it in the README chart bullet (`README.md`)**

In the "Graphique néon" feature bullet, add after the timeframes/studies:

```
· bascule **ligne / bougies** (OHLC réel Yahoo)
```

- [ ] **Step 3: Final build + tests**

Run: `cd frontend && npm run build`
Expected: `✓ built`.

Run: `cd backend && python -m pytest -q`
Expected: `37 passed`.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md README.md
git commit -m "docs(chart): document candlestick / line toggle

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-review (completed by plan author)

**1. Spec coverage**

| Spec requirement | Task |
|---|---|
| Per-bar OHLC in candle feed | Task 1 |
| `CandlePoint` OHLC | Task 2 |
| `chartType` persisted (`apex.charttype`, default line) | Task 2 |
| LINE/CANDLES toolbar toggle | Task 3 |
| Candlestick render + line fallback (`useCandles`) | Task 4 |
| Candle live tick (grow last bar) | Task 4 |
| Studies + range badge unchanged | Task 4 (untouched blocks) |
| Docs | Task 5 |

**2. Placeholder scan:** No TBD/TODO; every code step complete. ✓

**3. Type consistency:** `chartType: 'line' | 'candles'` + `setChartType` defined in Task 2, consumed in Tasks 3–4. `CandlePoint.open/high/low` (Task 2) consumed by `useCandles`/candle data (Task 4) and produced by the backend (Task 1). `seriesRef`/`lastBarRef`/`chartTypeRef` introduced in Task 4 Step 1 and used consistently in Steps 2–3. `COLORS.green/red` and `T`/`neon`/`baseLayout` already exist in `PriceChart.tsx`. ✓

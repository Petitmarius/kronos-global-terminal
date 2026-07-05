# Candlestick Chart + Line/Candles Toggle — Design

- **Date:** 2026-07-05
- **Proposed branch:** `feat/candlestick-chart`
- **Status:** Design approved, proceeding to spec → plan (cycle 1 of 2; analytics dashboard is cycle 2)

## 1. Goal

Let the main chart render as **real candlesticks** (open/high/low/close) with a
**LINE / CANDLES** toggle. Default stays **LINE** (today's area chart). OHLC is 100%
real (Yahoo chart API already returns per-bar OHLC); nothing new is fabricated.

## 2. Decisions

| Point | Decision |
|---|---|
| Toggle UI | A **LINE / CANDLES** segment in the chart toolbar (next to RANGE / STUDIES) |
| Default | **LINE** (unchanged behaviour) |
| Persistence | Store `chartType` persisted to `apex.charttype` |
| Data | Extend the candle feed with `open`/`high`/`low` (already done for `volume`) |
| Fallback | If a bar has no OHLC (synthetic fallback when Yahoo is down), render **line** — never fabricate candles |
| Studies / badge | Unchanged — they use the close (`value`), which candles keep |

## 3. Backend (`providers.py`)

`_candles_from_chart` already reads `close`/`open`/`volume`; add `high`/`low` and attach
`open`/`high`/`low` to each point:

```python
        closes = q["close"]
        opens = q.get("open", [])
        highs = q.get("high", [])
        lows = q.get("low", [])
        vols = q.get("volume", [])
        ...
        points.append({
            "time": int(t), "value": round(float(c), 6),
            "open": round(float(opens[i]), 6) if i < len(opens) and opens[i] is not None else None,
            "high": round(float(highs[i]), 6) if i < len(highs) and highs[i] is not None else None,
            "low": round(float(lows[i]), 6) if i < len(lows) and lows[i] is not None else None,
            "volume": int(vols[i]) if i < len(vols) and vols[i] is not None else None,
        })
```

The existing "first bar `value` = real open" override is unchanged (it only fixes the
line's left edge; candles use each bar's own `open`). `market.py`'s synthetic fallback
candles are **not** changed — they carry close only, so the frontend renders them as a
line (see §5).

## 4. Types + store

- **`types.ts`**: `CandlePoint` += `open?: number | null`, `high?: number | null`, `low?: number | null`.
- **`store.ts`**: `chartType: 'line' | 'candles'` (loaded from `apex.charttype`, default `'line'`)
  + `setChartType(t)` (persists + sets), mirroring the existing `view` persistence pattern.

## 5. Frontend — chart (`PriceChart.tsx`)

- Read `chartType` from the store.
- `const hasOHLC = pts.some((p) => p.open != null)`; `const useCandles = chartType === 'candles' && hasOHLC`.
- In the (re)build effect (add `chartType` to its deps):
  - **useCandles** → `chart.addCandlestickSeries({ upColor: '#00E676', downColor: '#FF1744', borderVisible: false, wickUpColor, wickDownColor })`, data mapped as
    `{ time, open: p.open ?? p.value, high: p.high ?? p.value, low: p.low ?? p.value, close: p.value }`.
  - else → the current `addAreaSeries` (unchanged).
  - Keep a `seriesRef` to the created series and a `lastBarRef` holding the last bar's
    `{ time, open, high, low, close }` (candles) or `{ time, value }` (line), plus a `chartTypeRef`.
- **Live tick** effect (`[price, pct]`): read `chartTypeRef`:
  - line → `series.update({ time, value: price })` (as today);
  - candles → update `lastBarRef` (`close = price`, `high = max(high, price)`, `low = min(low, price)`),
    then `series.update({ time, open, high, low, close })`.
- **Studies** (MA/BB/RSI/MACD/VOL) and the **range-performance badge** are unchanged — they
  read the close (`value`)/`firstCloseRef`, which candles preserve. Studies overlay on candles fine.

## 6. Frontend — toggle (`CenterPanel.tsx`)

Add a third toolbar group after STUDIES, reusing the global `.seg` styling:

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

reading `chartType` / `setChartType` from the store.

## 7. Edge cases & honesty

- **No OHLC** (synthetic fallback / a bar missing OHLC) → line render / doji-at-close; never a fabricated candle.
- **Live tick on candles** grows the last bar's high/low from the live price — same idea as the area's last-value nudge.
- OHLC is real Yahoo data. Order book / spread remain the only synthetic pieces (unchanged).

## 8. Files

- **Backend:** `providers.py`.
- **Frontend:** `types.ts`, `store.ts`, `components/CenterPanel.tsx`, `components/PriceChart.tsx`.
- **Docs:** `CLAUDE.md` (chart supports candlesticks), README (features).
- No backend test (candle extraction needs network mocking); verified live.

## 9. Verification

- `cd backend && python -m pytest -q` (37 unaffected); `curl .../api/assets/AAPL/candles?tf=1M` shows `open`/`high`/`low` per point.
- `cd frontend && npm run build` green.
- Live: toggle **CANDLES** → real candlesticks; **LINE** → area (unchanged); the choice persists across reloads; studies + range badge work on both; switching timeframe/symbol keeps the mode.

## 10. Out of scope

- Candlestick pattern detection, drawing tools (future ideas).
- OHLC on the synthetic fallback candles (kept close-only → renders as line).

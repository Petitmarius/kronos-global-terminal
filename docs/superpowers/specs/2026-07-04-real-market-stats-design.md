# Real Market Stats — 52W hi/lo + volume (stat & VOL study)

- **Date:** 2026-07-04
- **Proposed branch:** `feat/real-market-stats`
- **Status:** Design approved (option A — honest), proceeding to spec → plan

## 1. Goal

Replace the currently **synthetic** 52-week high/low and volume with **real Yahoo
data**, and make the **VOL** study plot real per-bar volume. Yahoo already exposes
everything needed: `fiftyTwoWeekHigh` / `fiftyTwoWeekLow` / `regularMarketVolume`
in the quote meta, and a per-bar `volume` array in the chart API.

**Honesty (option A):** never fabricate. When Yahoo provides no value → show `—`;
for instruments with no real volume (typically FX spot) the VOL study shows
**nothing** (no synthetic bars). The **spread** and the **order book** stay
synthetic (no free L2 source) — they remain the only non-real values, documented.
MA / RSI / MACD / BB are already real and unchanged.

## 2. Backend

### 2.1 `providers.py`
- `quote_from_meta(meta)` and `yahoo_quote(symbol)` add to their returned dict:
  `"w52high": meta.get("fiftyTwoWeekHigh")`, `"w52low": meta.get("fiftyTwoWeekLow")`,
  `"volume": meta.get("regularMarketVolume")` (any may be `None`).
- `_candles_from_chart(ysym, tf)`: read `vols = q.get("volume", [])` from
  `res["indicators"]["quote"][0]` and attach `"volume"` to each kept point
  (`vols[i]` when present and non-null, else `None`). The first-bar open override is
  unchanged.

### 2.2 `market.py`
- `MarketState.__init__`: seed `"w52high": None, "w52low": None, "volume": None`
  (remove the random synthetic seeds). Intraday `open/high/low` seeding is unchanged.
- `apply_stats(..., w52high=None, w52low=None, volume=None)` and
  `apply_baseline(..., w52high=None, w52low=None, volume=None)`: set each field only
  when the incoming value is not `None` (`a["w52high"] = w52high if w52high is not None else a.get("w52high")`,
  same for `w52low` / `volume`) so real values populate and persist, and `None` never clobbers.
- `register(...)`: read `"w52high": quote.get("w52high")`, `"w52low": quote.get("w52low")`,
  `"volume": quote.get("volume")` from the passed `quote` (no new params).
- `_quote(a)`: add `"w52High": _r(a.get("w52high"))`, `"w52Low": _r(a.get("w52low"))`,
  `"volume": round(a["volume"]) if a.get("volume") is not None else None` — so the tick
  stream carries the latest real stats (like `usdRate`), fixing the connect-before-first-poll gap.
  (`_r(x)` = `round(x, a["digits"]) if x is not None else None`.)
- `asset_dict(a)`: guard `round()` against `None` for `w52High`, `w52Low`, `volume`
  (emit `None` → frontend shows `—`).

### 2.3 `feeds.py`
- `poll_loop` and `baseline_loop`: pass the new fields through, e.g.
  `MARKET.apply_stats(sym, q["price"], q["prevClose"], q["open"], q["high"], q["low"], q.get("w52high"), q.get("w52low"), q.get("volume"))`.

### 2.4 `main.py`
- `add_asset`: no change beyond `register` reading the fields from `quote`.

### 2.5 Tests (`tests/test_providers.py`)
- `quote_from_meta` captures `w52high`/`w52low`/`volume` from meta, and yields `None`
  when the keys are absent (pure, no network).

## 3. Frontend

### 3.1 `types.ts`
- `CandlePoint` += `volume?: number | null`.
- `Stats`: `w52High`, `w52Low`, `volume` become `number | null`.
- `Quote` += `w52High?: number | null`, `w52Low?: number | null`, `volume?: number | null`.

### 3.2 `store.ts` — `applyQuotes`
Merge the stats fields into the asset's `stats` (keep previous when the tick omits them):

```ts
if (cur) assets[q.symbol] = {
  ...cur, price: q.price, change: q.change, pct: q.pct, source: q.source, ts: q.ts,
  usdRate: q.usdRate ?? cur.usdRate,
  stats: { ...cur.stats, w52High: q.w52High ?? cur.stats.w52High, w52Low: q.w52Low ?? cur.stats.w52Low, volume: q.volume ?? cur.stats.volume },
}
```

### 3.3 `indicators.ts` — `volume()`
Use the **real** per-bar volume; color by the bar's up/down (unchanged coloring):

```ts
export function volume(pts: CandlePoint[], up = '#00E676', down = '#FF1744'): HistData[] {
  return pts.map((p, i) => {
    const prev = i > 0 ? pts[i - 1].value : p.value
    return { time: p.time, value: p.volume ?? 0, color: p.value >= prev ? up : down }
  })
}
```

### 3.4 `PriceChart.tsx`
- After `const pts = data.points`, compute `const hasVol = pts.some((p) => (p.volume ?? 0) > 0)`.
- `const volOn = indicators.has('VOL') && hasVol`.
- Use `volOn` for the price-scale bottom margin and to gate adding the VOL histogram.
  → For instruments with no real volume (FX), toggling VOL does nothing (honest empty),
  no reserved space, no synthetic bars.

### 3.5 `CenterPanel.tsx`
No change required: the grid already renders `st.volume ? fmtCompact(st.volume) : '—'`
and `fmt(st.w52High, dig)` / `fmt(st.w52Low, dig)`, and `fmt`/`fmtCompact` treat
`null`/`0` as `—`.

## 4. Edge cases & honesty

- **FX / no-volume instruments**: Yahoo returns `regularMarketVolume` 0/absent and null
  candle volume → VOLUME stat shows `—`, VOL study shows nothing. No fabrication.
- **Startup window**: base assets seed `None`; real values arrive within the first
  poll cycle and reach the frontend via the `_quote` stream (merged into `stats`).
- **`round(None)`**: guarded in `_quote` and `asset_dict`.
- **Spread & order book**: remain synthetic (no free L2) — the only non-real values,
  documented in `CLAUDE.md` / README.
- **Nullish merge**: `q.x ?? cur.stats.x` keeps prior real value when a sim tick omits it;
  a real `0` (FX volume) overrides to `0` → renders `—`.

## 5. Files

- **Backend:** `providers.py`, `market.py`, `feeds.py` (`main.py` only via `register`),
  `tests/test_providers.py`.
- **Frontend:** `types.ts`, `store.ts`, `indicators.ts`, `components/PriceChart.tsx`.
- **Docs:** `CLAUDE.md` + README data-caveats (52W/volume now real; spread/order book synthetic).

## 6. Verification

- `cd backend && python -m pytest -q` (new quote-meta assertions).
- `cd frontend && npm run build` green.
- Live: select `AAPL`/`NAS100` → **52W HI/LO** and **VOLUME** show real numbers; toggle
  **VOL** → real volume bars. Select `EURUSD` → VOLUME shows `—` and VOL shows nothing
  (honest). Compare the 52W hi/lo against Yahoo to confirm they match.

## 7. Out of scope

- Real spread / L2 order book (no free source).
- Live-ticking the intraday OHLC stats (pre-existing snapshot-frozen behaviour kept).

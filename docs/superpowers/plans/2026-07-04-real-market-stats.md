# Real Market Stats (52W hi/lo + volume) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace synthetic 52-week high/low and volume with real Yahoo data, make the VOL study plot real per-bar volume, and show `—`/empty (never fabricated) when Yahoo has no value.

**Architecture:** Backend captures `fiftyTwoWeekHigh/Low` + `regularMarketVolume` in the quote and per-bar `volume` in candles, seeds those stats `None` (no synthetic), and streams the real 52W/volume in the `_quote` tick. Frontend merges them into `stats`, and the VOL study uses real candle volume (empty for no-volume instruments). Spread + order book stay synthetic.

**Tech Stack:** FastAPI + urllib (backend), React 18 + TypeScript + Zustand + lightweight-charts (frontend). No new dependencies.

## Global Constraints

- **No fabrication (option A):** when Yahoo provides no value, show `—` (stats) or nothing (VOL study). Never synthesize 52W/volume.
- **Still synthetic (documented):** `stats.spread` and the order book (no free L2 source). MA/RSI/MACD/BB already real, unchanged.
- **Verify:** backend `cd backend && python -m pytest -q` (currently 35 passing); frontend `cd frontend && npm run build`.
- Commit at the end of each task with the exact message given.

---

## File structure

| File | Responsibility | Change |
|---|---|---|
| `backend/providers.py` | Capture 52W/volume in quote; per-bar candle volume | Modify |
| `backend/tests/test_providers.py` | Assertions for the above | Modify |
| `backend/market.py` | Seed `None`; store real; `_quote`/`asset_dict`/`apply_*`/`register` | Modify |
| `backend/feeds.py` | Pass 52W/volume through the poll/baseline loops | Modify |
| `frontend/src/types.ts` | `CandlePoint.volume`, `Stats` nullable, `Quote` fields | Modify |
| `frontend/src/store.ts` | Merge 52W/volume into `stats` in `applyQuotes` | Modify |
| `frontend/src/indicators.ts` | `volume()` uses real per-bar volume | Modify |
| `frontend/src/components/PriceChart.tsx` | Gate the VOL study on real volume | Modify |
| `CLAUDE.md`, `README.md` | Data-caveats update | Modify |

---

## Task 1: Backend — capture 52W hi/lo + volume (quote & candles)

**Files:**
- Modify: `backend/providers.py`, `backend/tests/test_providers.py`

**Interfaces:**
- Produces: `quote_from_meta(...)`/`yahoo_quote(...)` return `w52high`/`w52low`/`volume`;
  candle points carry `volume`.

- [ ] **Step 1: Add failing tests (`tests/test_providers.py`)**

Append:

```python
def test_quote_from_meta_captures_stats():
    meta = {"regularMarketPrice": 100.0, "previousClose": 99.0,
            "fiftyTwoWeekHigh": 120.0, "fiftyTwoWeekLow": 80.0, "regularMarketVolume": 1234567}
    q = providers.quote_from_meta(meta)
    assert q["w52high"] == 120.0 and q["w52low"] == 80.0 and q["volume"] == 1234567


def test_quote_from_meta_stats_optional():
    meta = {"regularMarketPrice": 100.0, "previousClose": 99.0}
    q = providers.quote_from_meta(meta)
    assert q["w52high"] is None and q["w52low"] is None and q["volume"] is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_providers.py -q`
Expected: FAIL with `KeyError: 'w52high'`.

- [ ] **Step 3: Add the fields to the quote builders (`providers.py`)**

In `quote_from_meta`, extend the returned dict:

```python
    return {
        "price": float(price), "prevClose": float(prev), "pct": pct,
        "open": meta.get("regularMarketOpen"),
        "high": meta.get("regularMarketDayHigh"),
        "low": meta.get("regularMarketDayLow"),
        "currency": meta.get("currency"),
        "w52high": meta.get("fiftyTwoWeekHigh"),
        "w52low": meta.get("fiftyTwoWeekLow"),
        "volume": meta.get("regularMarketVolume"),
    }
```

In `yahoo_quote`, extend the `out` dict:

```python
    out = {"price": float(price), "prevClose": float(prev),
           "open": float(o) if o else None, "high": float(h) if h else None,
           "low": float(l) if l else None, "currency": meta.get("currency"),
           "w52high": meta.get("fiftyTwoWeekHigh"), "w52low": meta.get("fiftyTwoWeekLow"),
           "volume": meta.get("regularMarketVolume")}
```

- [ ] **Step 4: Add per-bar volume to candles (`providers.py`)**

In `_candles_from_chart`, read the volume array after `opens`:

```python
        closes = q["close"]
        opens = q.get("open", [])
        vols = q.get("volume", [])
```

and attach it to each kept point (replace the `points.append(...)` line inside the loop):

```python
        points.append({"time": int(t), "value": round(float(c), 6),
                       "volume": int(vols[i]) if i < len(vols) and vols[i] is not None else None})
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_providers.py -q`
Expected: PASS (5 passed).

- [ ] **Step 6: Commit**

```bash
git add backend/providers.py backend/tests/test_providers.py
git commit -m "feat(data): capture Yahoo 52W hi/lo + volume (quote + per-bar candles)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Backend — store real stats, stream them, drop synthetic

**Files:**
- Modify: `backend/market.py`, `backend/feeds.py`

**Interfaces:**
- Consumes: `quote["w52high"|"w52low"|"volume"]` (Task 1).
- Produces: `apply_stats`/`apply_baseline` accept `w52high, w52low, volume`; assets/quotes carry real `w52High`/`w52Low`/`volume` (or `None`).

- [ ] **Step 1: Seed stats `None` in `__init__` (`market.py`)**

Remove the synthetic `vol = ...` line and set the three stats to `None`. Replace the
asset-dict construction block in `MarketState.__init__`:

```python
            rng = np.random.default_rng(_seed(sym, "stats"))
            price, prev = a["price"], a["prev_close"]
            span = abs(price) * 0.007 + 10 ** -a["digits"]
            hi = max(price, prev) + rng.uniform(0.2, 1.0) * span
            lo = min(price, prev) - rng.uniform(0.2, 1.0) * span
            self.assets[sym] = {
                **a,
                "open": prev + rng.uniform(-0.3, 0.3) * span,
                "high": hi, "low": lo,
                "w52high": None, "w52low": None, "volume": None,
                "spread": round(span * 0.05, max(1, a["digits"] - 1)),
                "source": "sim",
                "pc_real": False,   # True once a real previous close is known
                "usd_rate": 1.0,
            }
```

- [ ] **Step 2: Stream real stats in `_quote` (`market.py`)**

Replace `_quote`:

```python
    def _quote(self, a: dict) -> dict:
        change = a["price"] - a["prev_close"]
        pct = change / a["prev_close"] * 100 if a["prev_close"] else 0.0
        d = a["digits"]
        w52h, w52l, vol = a.get("w52high"), a.get("w52low"), a.get("volume")
        return {
            "symbol": a["symbol"], "price": round(a["price"], d),
            "change": round(change, d), "pct": round(pct, 2),
            "source": a["source"], "ts": int(time.time() * 1000),
            "usdRate": a.get("usd_rate", 1.0),
            "w52High": round(w52h, d) if w52h is not None else None,
            "w52Low": round(w52l, d) if w52l is not None else None,
            "volume": round(vol) if vol is not None else None,
        }
```

- [ ] **Step 3: Guard `asset_dict` stats against `None` (`market.py`)**

In `asset_dict`, replace the three synthetic-derived stat lines:

```python
                "w52High": round(a["w52high"], a["digits"]) if a.get("w52high") is not None else None,
                "w52Low": round(a["w52low"], a["digits"]) if a.get("w52low") is not None else None,
                "volume": round(a["volume"]) if a.get("volume") is not None else None,
```

- [ ] **Step 4: Accept + store real stats in `apply_stats` / `apply_baseline` (`market.py`)**

`apply_stats` — new params + set (only when provided):

```python
    def apply_stats(self, symbol: str, price: float, prev_close: float,
                    open_: float, high: float, low: float,
                    w52high: float | None = None, w52low: float | None = None,
                    volume: float | None = None) -> dict | None:
        """Set a full real quote (price + previous close + OHLC + 52W/volume)."""
        a = self.assets.get(symbol)
        if not a or price <= 0 or prev_close <= 0:
            return None
        a["price"] = price
        a["prev_close"] = prev_close
        a["open"] = open_ if open_ and open_ > 0 else prev_close
        a["high"] = max(high or price, price)
        a["low"] = min(low or price, price)
        if w52high is not None:
            a["w52high"] = w52high
        if w52low is not None:
            a["w52low"] = w52low
        if volume is not None:
            a["volume"] = volume
        a["pc_real"] = True
        a["source"] = "live"
        return self._quote(a)
```

`apply_baseline` — same new params, set block added before `a["pc_real"] = True`:

```python
    def apply_baseline(self, symbol: str, price: float, prev_close: float,
                       open_: float, high: float, low: float,
                       w52high: float | None = None, w52low: float | None = None,
                       volume: float | None = None) -> dict | None:
        a = self.assets.get(symbol)
        if not a or prev_close <= 0:
            return None
        a["prev_close"] = prev_close
        if open_ and open_ > 0:
            a["open"] = open_
        if high:
            a["high"] = max(a["high"], high, a["price"])
        if low:
            a["low"] = min(a["low"], low) if a["low"] else low
        if w52high is not None:
            a["w52high"] = w52high
        if w52low is not None:
            a["w52low"] = w52low
        if volume is not None:
            a["volume"] = volume
        a["pc_real"] = True
        if a["source"] == "sim" and price > 0:   # not yet streaming: bootstrap
            a["price"] = price
            a["source"] = "live"
        return self._quote(a)
```

- [ ] **Step 5: `register` reads 52W/volume from the quote (`market.py`)**

In `register`, replace the synthetic stat lines:

```python
            "w52high": quote.get("w52high"), "w52low": quote.get("w52low"),
            "volume": quote.get("volume"),
```

- [ ] **Step 6: Pass the fields through the loops (`feeds.py`)**

In `poll_loop`, the `apply_stats` call:

```python
                    r = MARKET.apply_stats(sym, q["price"], q["prevClose"],
                                           q["open"], q["high"], q["low"],
                                           q.get("w52high"), q.get("w52low"), q.get("volume"))
```

In `baseline_loop`, the `apply_baseline` call:

```python
                    r = MARKET.apply_baseline(sym, q["price"], q["prevClose"],
                                              q["open"], q["high"], q["low"],
                                              q.get("w52high"), q.get("w52low"), q.get("volume"))
```

- [ ] **Step 7: Verify (pytest + live)**

Run: `cd backend && python -m pytest -q`
Expected: `37 passed`.

Then start the backend and probe a real symbol:
`cd backend && python -m uvicorn main:app --port 8000` (background), wait for health,
`curl -s "http://localhost:8000/api/assets/add?symbol=AAPL&name=Apple&cat=EQ" -X POST | python -c "import sys,json; a=json.load(sys.stdin)['stats']; print('52wH', a['w52High'], '| 52wL', a['w52Low'], '| vol', a['volume'])"`
Expected: real numbers (not `None`), e.g. `52wH 260.1 | 52wL 169.2 | vol 41897600`.

- [ ] **Step 8: Commit**

```bash
git add backend/market.py backend/feeds.py
git commit -m "feat(data): store + stream real 52W hi/lo + volume; drop synthetic seeds

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Frontend — types + merge stats in the store

**Files:**
- Modify: `frontend/src/types.ts`, `frontend/src/store.ts`

**Interfaces:**
- Consumes: backend `w52High`/`w52Low`/`volume` on quotes/assets, candle `volume` (Tasks 1–2).
- Produces: `CandlePoint.volume`, nullable `Stats`, `Quote` stat fields; `applyQuotes` merges them.

- [ ] **Step 1: Extend the types (`types.ts`)**

`Stats` — make the three fields nullable:

```ts
export interface Stats {
  open: number
  high: number
  low: number
  prevClose: number
  w52High: number | null
  w52Low: number | null
  volume: number | null
  spread: number
}
```

`Quote` — add the streamed stat fields:

```ts
export interface Quote {
  symbol: string
  price: number
  change: number
  pct: number
  source: Source
  ts: number
  usdRate?: number
  w52High?: number | null
  w52Low?: number | null
  volume?: number | null
}
```

`CandlePoint` — add per-bar volume:

```ts
export interface CandlePoint {
  time: number
  value: number
  volume?: number | null
}
```

- [ ] **Step 2: Merge the stats in `applyQuotes` (`store.ts`)**

Replace the quote-merge line:

```ts
        if (cur) assets[q.symbol] = { ...cur, price: q.price, change: q.change, pct: q.pct, source: q.source, ts: q.ts, usdRate: q.usdRate ?? cur.usdRate, stats: { ...cur.stats, w52High: q.w52High ?? cur.stats.w52High, w52Low: q.w52Low ?? cur.stats.w52Low, volume: q.volume ?? cur.stats.volume } }
```

- [ ] **Step 3: Verify the build**

Run: `cd frontend && npm run build`
Expected: `✓ built`. (`CenterPanel` already renders `st.volume ? fmtCompact(st.volume) : '—'`
and `fmt(st.w52High, dig)`; `fmt`/`fmtCompact` handle `null`/`0` → `—`, so no change there.)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types.ts frontend/src/store.ts
git commit -m "feat(data): nullable 52W/volume stats + candle volume; merge in applyQuotes

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Frontend — real VOL study

**Files:**
- Modify: `frontend/src/indicators.ts`, `frontend/src/components/PriceChart.tsx`

**Interfaces:**
- Consumes: `CandlePoint.volume` (Task 3).

- [ ] **Step 1: Use real volume in `volume()` (`indicators.ts`)**

Replace the `volume` function:

```ts
// real per-bar volume from the candle feed (empty for instruments Yahoo has no volume for)
export function volume(pts: CandlePoint[], up = '#00E676', down = '#FF1744'): HistData[] {
  return pts.map((p, i) => {
    const prev = i > 0 ? pts[i - 1].value : p.value
    return { time: p.time, value: p.volume ?? 0, color: p.value >= prev ? up : down }
  })
}
```

- [ ] **Step 2: Gate the VOL study on real volume (`PriceChart.tsx`)**

After `const pts = data.points`, add the availability check and derive `volOn` from it.
Replace the block:

```ts
      const pts = data.points
      const up = (useStore.getState().assets[selected]?.pct ?? 0) >= 0
      upRef.current = up

      const volOn = indicators.has('VOL')
```

with:

```ts
      const pts = data.points
      const up = (useStore.getState().assets[selected]?.pct ?? 0) >= 0
      upRef.current = up

      const hasVol = pts.some((p) => (p.volume ?? 0) > 0)
      const volOn = indicators.has('VOL') && hasVol
```

(The existing `scaleMargins: { ... bottom: volOn ? 0.24 : 0.08 }` and `if (volOn) { … addHistogramSeries … }`
now only reserve space / draw when there is real volume. For FX the VOL toggle is a no-op — honest.)

- [ ] **Step 3: Verify (build + live)**

Run: `cd frontend && npm run build`
Expected: `✓ built`.

Live: `AAPL` → stats show real 52W HI/LO + VOLUME; enable **VOL** → real volume bars.
`EURUSD` → VOLUME shows `—`; enabling **VOL** draws nothing (no synthetic bars).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/indicators.ts frontend/src/components/PriceChart.tsx
git commit -m "feat(data): VOL study plots real per-bar volume (empty when none)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Docs + final verification

**Files:**
- Modify: `CLAUDE.md`, `README.md`

- [ ] **Step 1: Update the data caveat (`CLAUDE.md`)**

Replace the caveat bullet:

```
- `stats.spread`, `volume`, 52W hi/lo for base assets are synthetic; price / change% / OHLC / history are real (Yahoo).
```

with:

```
- **52W hi/lo and volume are real** (Yahoo `fiftyTwoWeekHigh`/`fiftyTwoWeekLow` + `regularMarketVolume`, streamed in `_quote`); the **VOL** study plots real per-bar candle volume. Instruments Yahoo reports no volume for (e.g. FX spot) show `—` / an empty VOL study — never fabricated. Only `stats.spread` and the order book remain synthetic (no free L2 feed). price / change% / OHLC / history are real (Yahoo).
```

- [ ] **Step 2: Update the README transparency note (`README.md`)**

In the "## Données — transparence" section, replace the sentence about the order book /
spread with:

```
Prix, variations %, OHLC, historique, **52W haut/bas et volume** sont **réels** (Yahoo) ;
la study **VOL** trace le vrai volume par barre (vide pour les instruments sans volume, ex. forex).
Seuls le **carnet d'ordres** et le **spread** sont **simulés** (aucune source L2 gratuite) ;
le carnet dérive du même spread que la grille pour rester cohérent. Aucun ordre n'est envoyé à un vrai broker.
```

- [ ] **Step 3: Final build + tests**

Run: `cd frontend && npm run build`
Expected: `✓ built`.

Run: `cd backend && python -m pytest -q`
Expected: `37 passed`.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md README.md
git commit -m "docs(data): 52W hi/lo + volume are now real (spread/order book still synthetic)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-review (completed by plan author)

**1. Spec coverage**

| Spec requirement | Task |
|---|---|
| Capture `fiftyTwoWeekHigh/Low` + `regularMarketVolume` | Task 1 |
| Per-bar candle volume | Task 1 |
| Seed `None`, drop synthetic | Task 2 (`__init__`) |
| Store real in `apply_stats`/`apply_baseline`/`register` | Task 2 |
| Stream via `_quote`; guard `asset_dict` | Task 2 |
| Loops pass fields | Task 2 (`feeds.py`) |
| `CandlePoint.volume`, nullable `Stats`, `Quote` fields | Task 3 |
| Merge into `stats` in `applyQuotes` | Task 3 |
| `volume()` real; VOL empty when none | Task 4 |
| `—`/empty honesty | Tasks 2–4 (None guards, `hasVol` gate) |
| Docs | Task 5 |

**2. Placeholder scan:** No TBD/TODO; every code step complete. ✓

**3. Type consistency:** `_quote` emits `w52High`/`w52Low`/`volume` (Task 2) consumed by `Quote` + `applyQuotes` merge (Task 3). `apply_stats`/`apply_baseline` 3 new params match the `feeds.py` calls (Task 2). `CandlePoint.volume` (Task 3) consumed by `volume()` + `hasVol` (Task 4). `Stats` nullable fields render via existing `fmt`/`fmtCompact`. ✓

# Foreign-Currency Conversion (B2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make foreign-currency **equities** correct: display the local-currency price with a `≈ $X` conversion, and run all money math (order value/margin, P&L, balance, map exposure) in USD with the FX rate frozen at entry so P&L includes the currency move.

**Architecture:** The backend attaches `currency` + a live `usdRate` (USD per local unit) to each asset/quote (via a cached `providers.usd_rate()` and an `fx_loop`). The frontend keeps the local price on screen and multiplies through by `usdRate` (current) and the position's `entryRate` (frozen at open) wherever money is computed. Scope is `cat === 'EQ'` and `currency !== 'USD'`; everything else keeps `usdRate = 1` and behaves exactly as today.

**Tech Stack:** FastAPI + urllib (backend), React 18 + TypeScript + Zustand (frontend). No new dependencies.

## Global Constraints

- **Scope:** foreign **equities** only (`cat === 'EQ'` and `currency !== 'USD'`). FX pairs, crypto, commodities, and indices keep `usdRate = 1` (unchanged).
- **Display:** local-currency price stays primary; add a currency tag + a `≈ $X` line. **SL/TP stay in local price.**
- **Money math (B2):** `P&L_USD = sign × (price×curRate − entry×entryRate) × lots × contract`, `Margin_USD = orderPrice×usdRate × lots×contract / LEVERAGE` locked at open.
- **Migration safety:** a position is FX-converted **only if it carries `entryRate`** (i.e. it was opened after this change). Pre-existing positions (no `entryRate`) use `curRate = entryRate = 1` → they behave exactly as today. Express this as `hasRate = p.entryRate != null`.
- **Honesty:** on a failed rate lookup use the last-known rate (else `1.0`); hide the `≈ $X` line whenever `usdRate === 1`.
- **Verification:** backend `cd backend && python -m pytest -q` (currently 32 passing); frontend `cd frontend && npm run build` (`tsc --noEmit && vite build`). No frontend test runner exists.
- Commit at the end of each task with the exact message given.

---

## File structure

| File | Responsibility | Change |
|---|---|---|
| `backend/providers.py` | Capture `currency`; `usd_rate()` FX lookup | Modify |
| `backend/tests/test_providers.py` | Unit tests for the above | Create |
| `backend/assets.py` | Base assets carry `currency: "USD"` | Modify |
| `backend/market.py` | `usd_rate` field on assets; emit `currency`/`usdRate`; `set_usd_rate` | Modify |
| `backend/feeds.py` | `fx_loop` refreshing foreign-equity rates | Modify |
| `backend/main.py` | Register `fx_loop`; wire currency/rate in add-asset | Modify |
| `frontend/src/types.ts` | `Asset.currency/usdRate`, `Quote.usdRate?`, `Position.entryRate?` | Modify |
| `frontend/src/store.ts` | Currency-aware `positionPnl`/`computeAccount`/`buildClosed`; stamp `entryRate` | Modify |
| `frontend/src/components/OrderPanel.tsx` | USD value/margin/risk; stamp `entryRate`; FX hint | Modify |
| `frontend/src/components/OrderPanel.module.css` | `.fxHint` | Modify |
| `frontend/src/components/CenterPanel.tsx` | Currency tag + `≈ $X` line | Modify |
| `frontend/src/components/CenterPanel.module.css` | `.curBadge`, `.usdConv` | Modify |
| `frontend/src/geo/exposure.ts` | Rate-aware notional/latent | Modify |
| `CLAUDE.md` | Document foreign-equity currency handling | Modify |

---

## Task 1: Backend — capture currency + `usd_rate()` lookup

**Files:**
- Modify: `backend/providers.py`
- Create: `backend/tests/test_providers.py`

**Interfaces:**
- Produces: `quote_from_meta(...)['currency']` and `yahoo_quote(...)['currency']`;
  `usd_rate(currency: str) -> float` (USD per 1 unit; `1.0` for USD/failure).

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_providers.py`:

```python
import providers


def test_usd_rate_usd_passthrough():
    assert providers.usd_rate("USD") == 1.0
    assert providers.usd_rate("") == 1.0
    assert providers.usd_rate(None) == 1.0


def test_quote_from_meta_captures_currency():
    meta = {"regularMarketPrice": 100.0, "previousClose": 99.0, "currency": "EUR"}
    q = providers.quote_from_meta(meta)
    assert q is not None and q["currency"] == "EUR"


def test_quote_from_meta_currency_optional():
    meta = {"regularMarketPrice": 100.0, "previousClose": 99.0}
    q = providers.quote_from_meta(meta)
    assert q is not None and q["currency"] is None
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_providers.py -q`
Expected: FAIL (`AttributeError: module 'providers' has no attribute 'usd_rate'` and missing `currency` key).

- [ ] **Step 3: Add `currency` to the two quote builders**

In `backend/providers.py`, `quote_from_meta` — add the `currency` line to the returned dict:

```python
    return {
        "price": float(price), "prevClose": float(prev), "pct": pct,
        "open": meta.get("regularMarketOpen"),
        "high": meta.get("regularMarketDayHigh"),
        "low": meta.get("regularMarketDayLow"),
        "currency": meta.get("currency"),
    }
```

In `yahoo_quote`, extend the `out` dict:

```python
    out = {"price": float(price), "prevClose": float(prev),
           "open": float(o) if o else None, "high": float(h) if h else None,
           "low": float(l) if l else None, "currency": meta.get("currency")}
```

- [ ] **Step 4: Add the `usd_rate` helper**

In `backend/providers.py`, immediately after `yahoo_quote_raw` (which it reuses), add:

```python
_fx_cache: dict[str, tuple[float, float]] = {}   # currency -> (ts, rate)
_FX_TTL = 60.0


def usd_rate(currency: str) -> float:
    """USD per 1 unit of `currency` (EUR->~1.08, JPY->~0.0063). Cached ~60s.
    USD passes through as 1.0; a failed lookup returns the last known rate (else 1.0)."""
    cur = (currency or "USD").upper()
    if cur == "USD":
        return 1.0
    now = time.time()
    c = _fx_cache.get(cur)
    if c and now - c[0] < _FX_TTL:
        return c[1]
    q = yahoo_quote_raw(f"{cur}USD=X")
    if q and q.get("price"):
        rate = float(q["price"])
        _fx_cache[cur] = (now, rate)
        return rate
    return c[1] if c else 1.0
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_providers.py -q`
Expected: PASS (3 passed).

- [ ] **Step 6: Commit**

```bash
git add backend/providers.py backend/tests/test_providers.py
git commit -m "feat(fx): capture quote currency + usd_rate() FX lookup

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Backend — serve & refresh currency/usdRate

**Files:**
- Modify: `backend/assets.py`, `backend/market.py`, `backend/feeds.py`, `backend/main.py`

**Interfaces:**
- Consumes: `providers.usd_rate` (Task 1).
- Produces: assets/quotes carry `currency` + `usdRate`; `MARKET.register(..., currency, usd_rate)`; `MARKET.set_usd_rate(symbol, rate)`; `feeds.fx_loop`.

- [ ] **Step 1: Base assets carry a currency (`assets.py`)**

In `backend/assets.py`, `universe()`, add `"currency": "USD"` to the appended dict:

```python
        out.append({
            "symbol": sym, "name": name, "cat": cat, "digits": digits,
            "contract": contract, "price": price, "prev_close": prev_close,
            "provider": FINNHUB_MAP.get(sym), "currency": "USD",
        })
```

- [ ] **Step 2: Store & emit `usd_rate`/`currency` (`market.py`)**

In `MarketState.__init__`, add `"usd_rate": 1.0` to each constructed asset dict (after `"pc_real": False,`):

```python
                "source": "sim",
                "pc_real": False,   # True once a real previous close is known
                "usd_rate": 1.0,
            }
```

In `_quote`, add `usdRate` to the returned dict:

```python
        return {
            "symbol": a["symbol"], "price": round(a["price"], a["digits"]),
            "change": round(change, a["digits"]), "pct": round(pct, 2),
            "source": a["source"], "ts": int(time.time() * 1000),
            "usdRate": a.get("usd_rate", 1.0),
        }
```

In `asset_dict`, add `currency` + `usdRate`:

```python
        return {
            **q, "name": a["name"], "cat": a["cat"], "digits": a["digits"],
            "contract": a["contract"],
            "currency": a.get("currency", "USD"),
            "usdRate": a.get("usd_rate", 1.0),
            "stats": {
```

- [ ] **Step 3: `register` accepts currency/rate; add `set_usd_rate` (`market.py`)**

Change the `register` signature and stored dict:

```python
    def register(self, symbol: str, name: str, cat: str, digits: int,
                 contract: float, quote: dict, currency: str = "USD",
                 usd_rate: float = 1.0) -> dict:
        """Add a user-requested instrument to the universe at runtime."""
        price, prev = quote["price"], quote["prevClose"]
        self.assets[symbol] = {
            "symbol": symbol, "name": name, "cat": cat, "digits": digits,
            "contract": contract, "price": price, "prev_close": prev,
            "open": quote.get("open") or prev,
            "high": max(quote.get("high") or price, price),
            "low": min(quote.get("low") or price, price),
            "w52high": price * 1.3, "w52low": price * 0.72,
            "volume": 0.0,
            "spread": round(max(price * 5e-4, 10 ** -digits), max(1, digits - 1)),
            "source": "live", "pc_real": True, "custom": True,
            "currency": currency, "usd_rate": usd_rate,
        }
        return self.asset_dict(self.assets[symbol])
```

Add `set_usd_rate` right after `remove`:

```python
    def set_usd_rate(self, symbol: str, rate: float) -> dict | None:
        a = self.assets.get(symbol)
        if not a or rate <= 0:
            return None
        a["usd_rate"] = rate
        return self._quote(a)
```

- [ ] **Step 4: `fx_loop` refreshes foreign-equity rates (`feeds.py`)**

In `backend/feeds.py`, add after `baseline_loop`:

```python
async def fx_loop() -> None:
    """Refresh the USD conversion rate for foreign-currency equities (~60s) so the
    account math stays correct as FX moves. The quote carries usdRate downstream."""
    await asyncio.sleep(2.0)
    while True:
        updated: list[dict] = []
        for sym, a in list(MARKET.assets.items()):
            cur = a.get("currency", "USD")
            if a.get("cat") == "EQ" and cur != "USD":
                try:
                    rate = await asyncio.to_thread(providers.usd_rate, cur)
                    r = MARKET.set_usd_rate(sym, rate)
                    if r:
                        updated.append(r)
                except Exception as exc:  # noqa: BLE001
                    log.debug("fx %s failed: %s", sym, exc)
                await asyncio.sleep(0.2)
        if updated:
            await HUB.broadcast({"type": "quotes", "data": updated})
        await asyncio.sleep(60)
```

- [ ] **Step 5: Register `fx_loop` + wire add-asset (`main.py`)**

Update the feeds import:

```python
from feeds import baseline_loop, finnhub_loop, fx_loop, poll_loop, simulator_loop
```

Add the task in `lifespan` (after `poll_loop()`/`baseline_loop()`):

```python
        asyncio.create_task(baseline_loop()),
        asyncio.create_task(fx_loop()),
```

In `add_asset`, capture currency + rate and pass them to `register` (replace the tail from `price = quote["price"]`):

```python
    price = quote["price"]
    digits = 6 if price < 1 else 4 if price < 20 else 2
    currency = (quote.get("currency") or "USD").upper()
    cat_final = cat or "EQ"
    rate = (await asyncio.to_thread(providers.usd_rate, currency)
            if cat_final == "EQ" and currency != "USD" else 1.0)
    asset = MARKET.register(local, name or local, cat_final, digits, 1.0, quote, currency, rate)
    await HUB.broadcast({"type": "asset", "data": asset})
    return asset
```

- [ ] **Step 6: Verify backend (tests + live)**

Run: `cd backend && python -m pytest -q`
Expected: `32 passed` (existing suite unaffected).

Then start the backend and confirm the new fields:
Run: `cd backend && python -m uvicorn main:app --port 8000` (background), then
`curl -s "http://localhost:8000/api/assets" | python -c "import sys,json; a=json.load(sys.stdin)[0]; print(a['symbol'], a['currency'], a['usdRate'])"`
Expected: e.g. `NAS100 USD 1.0`.
`curl -s -X POST "http://localhost:8000/api/assets/add?symbol=MC.PA&name=LVMH&cat=EQ" | python -c "import sys,json; a=json.load(sys.stdin); print(a['symbol'], a['currency'], a['usdRate'])"`
Expected: `MC EUR <~1.0–1.2>` (a real EUR→USD rate, not 1.0).

- [ ] **Step 7: Commit**

```bash
git add backend/assets.py backend/market.py backend/feeds.py backend/main.py
git commit -m "feat(fx): backend serves + refreshes currency/usdRate per asset

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Frontend — types + currency-aware store math

**Files:**
- Modify: `frontend/src/types.ts`, `frontend/src/store.ts`

**Interfaces:**
- Consumes: backend `currency`/`usdRate` on assets/quotes (Task 2).
- Produces: `Asset.currency/usdRate`, `Quote.usdRate?`, `Position.entryRate?`;
  currency-aware `positionPnl`, `computeAccount`, and `buildClosed(p, exit, reason, contract, exitRate)`.

- [ ] **Step 1: Extend the types (`types.ts`)**

`Asset` — add `currency` and `usdRate` (backend always provides them):

```ts
export interface Asset {
  symbol: string
  name: string
  cat: string
  digits: number
  contract: number
  price: number
  change: number
  pct: number
  source: Source
  ts: number
  currency: string
  usdRate: number
  stats: Stats
}
```

`Quote` — add optional `usdRate`:

```ts
export interface Quote {
  symbol: string
  price: number
  change: number
  pct: number
  source: Source
  ts: number
  usdRate?: number
}
```

`Position` — add optional `entryRate` (absent on pre-existing positions):

```ts
export interface Position {
  id: string
  symbol: string
  dir: 'BUY' | 'SELL'
  sign: 1 | -1
  lots: number
  entry: number
  sl: number | null
  tp: number | null
  margin: number
  openedAt: number
  entryRate?: number
}
```

- [ ] **Step 2: Currency-aware `buildClosed` (`store.ts`)**

Replace `buildClosed` (top of the file) with a version taking `exitRate`, and add a
small `fxRates` helper above it:

```ts
// A position is FX-converted only if it carries entryRate (opened after the FX
// change). Pre-existing positions use rate 1 on both sides -> behave as before.
function fxRates(p: Position, a: Asset | undefined): { curRate: number; entRate: number } {
  const hasRate = p.entryRate != null
  return { curRate: hasRate ? (a?.usdRate ?? 1) : 1, entRate: p.entryRate ?? 1 }
}

function buildClosed(p: Position, exit: number, reason: CloseReason, contract: number, exitRate: number): ClosedTrade {
  const hasRate = p.entryRate != null
  const er = hasRate ? exitRate : 1
  const pnl = (exit * er - p.entry * (p.entryRate ?? 1)) * p.sign * p.lots * contract
  return {
    id: uid(), symbol: p.symbol, dir: p.dir, sign: p.sign, lots: p.lots,
    entry: p.entry, exit, pnl, pnlPct: p.margin ? (pnl / p.margin) * 100 : 0,
    openedAt: p.openedAt, closedAt: Date.now(), reason,
  }
}
```

Add `Asset` to the type import at the top of `store.ts` if not already present
(it imports from `./types` — ensure `Asset` is in the list).

- [ ] **Step 3: Thread `usdRate` through `applyQuotes` and the pending fill (`store.ts`)**

In `applyQuotes`, the quote-merge line becomes:

```ts
        if (cur) assets[q.symbol] = { ...cur, price: q.price, change: q.change, pct: q.pct, source: q.source, ts: q.ts, usdRate: q.usdRate ?? cur.usdRate }
```

The SL/TP close inside `applyQuotes` passes the current rate as `exitRate`:

```ts
        if (hit) {
          const exit = hit === 'SL' ? (p.sl as number) : (p.tp as number)
          const ct = buildClosed(p, exit, hit, a.contract, a.usdRate ?? 1)
```

The pending-fill push stamps `entryRate` at fill:

```ts
          filled.push({ id: uid(), symbol: o.symbol, dir: o.dir, sign: o.sign, lots: o.lots, entry: o.price, sl: o.sl, tp: o.tp, margin: o.margin, openedAt: Date.now(), entryRate: a.usdRate ?? 1 })
```

- [ ] **Step 4: Currency-aware `positionPnl`, `computeAccount`, and close callers (`store.ts`)**

`positionPnl`:

```ts
export function positionPnl(p: Position, assets: Record<string, Asset>): { pnl: number; pct: number; current: number } {
  const a = assets[p.symbol]
  const current = a ? a.price : p.entry
  const { curRate, entRate } = fxRates(p, a)
  const pnl = (current * curRate - p.entry * entRate) * p.sign * p.lots * (a?.contract ?? 1)
  const pct = p.margin ? (pnl / p.margin) * 100 : 0
  return { pnl, pct, current }
}
```

In `computeAccount`, the unrealized loop:

```ts
  for (const p of positions) {
    const a = assets[p.symbol]
    margin += p.margin
    if (a) {
      const { curRate, entRate } = fxRates(p, a)
      unrealized += (a.price * curRate - p.entry * entRate) * p.sign * p.lots * a.contract
    }
  }
```

`closePosition` — pass the current rate as `exitRate`:

```ts
      const a = s.assets[p.symbol]
      const exit = a ? a.price : p.entry
      const ct = buildClosed(p, exit, reason, a?.contract ?? 1, a?.usdRate ?? 1)
```

`closeAll` — same inside the loop:

```ts
      for (const p of s.positions) {
        const a = s.assets[p.symbol]
        const exit = a ? a.price : p.entry
        history = [buildClosed(p, exit, 'manual', a?.contract ?? 1, a?.usdRate ?? 1), ...history]
        orders = [orderRec(p.symbol, p.dir, 'CLOSE', p.lots, exit), ...orders]
      }
```

- [ ] **Step 5: Verify the build (with worked examples)**

Run: `cd frontend && npm run build`
Expected: `✓ built`.

Confirm the logic by inspection:
- US position (`entryRate: 1`, `usdRate: 1`) → `(price − entry) × …` — unchanged.
- New EUR position opened at €650 when EUR/USD was 1.10 (`entryRate: 1.10`), now €660 at 1.08 → `pnl = (660×1.08 − 650×1.10) × qty = (712.8 − 715.0) × qty` (a small loss driven by FX — correct).
- Pre-existing position with no `entryRate` → `hasRate = false` → `(price×1 − entry×1) × …` — exactly today's behavior.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/types.ts frontend/src/store.ts
git commit -m "feat(fx): currency-aware P&L/account math (frozen entry rate)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Frontend — OrderPanel USD math + entryRate + FX hint

**Files:**
- Modify: `frontend/src/components/OrderPanel.tsx`, `frontend/src/components/OrderPanel.module.css`

**Interfaces:**
- Consumes: `asset.usdRate`, `asset.currency` (Task 3); `openPosition` expecting `entryRate`.

- [ ] **Step 1: Rate-aware value/margin/risk + FX hint (`OrderPanel.tsx`)**

Add the rate next to the other derived values (after `const spread = ...`):

```ts
  const rate = asset?.usdRate ?? 1
```

Replace the `useMemo` block:

```ts
  const { value, margin, risk } = useMemo(() => {
    if (!asset) return { value: 0, margin: 0, risk: 0 }
    const v = lots * orderPrice * asset.contract * rate
    const m = v / LEVERAGE
    const r = slVal != null ? Math.abs(orderPrice - slVal) * lots * asset.contract * rate : v * 0.0022
    return { value: v, margin: m, risk: r }
  }, [asset, orderPrice, lots, slVal, rate])
```

Stamp `entryRate` on the market order (in `submit`):

```ts
      openPosition({
        id: uid(), symbol: selected, dir: side, sign, lots,
        entry: side === 'BUY' ? book.ask : book.bid,
        sl: slVal, tp: tpVal, margin, openedAt: Date.now(), entryRate: rate,
      })
```

Add the FX hint right after the `.risk` row (`</div>` that closes `styles.risk`):

```tsx
        {asset.currency !== 'USD' && (
          <div className={styles.fxHint}>≈ converted at {asset.currency}/USD {rate.toFixed(4)}</div>
        )}
```

- [ ] **Step 2: Style the hint (`OrderPanel.module.css`)**

Append:

```css
.fxHint { font-size: 9.5px; color: var(--dim); text-align: center; margin-top: 6px; letter-spacing: .3px; }
```

- [ ] **Step 3: Verify the build**

Run: `cd frontend && npm run build`
Expected: `✓ built`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/OrderPanel.tsx frontend/src/components/OrderPanel.module.css
git commit -m "feat(fx): OrderPanel shows USD value/margin, stamps entryRate

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Frontend — CenterPanel currency tag + converted price

**Files:**
- Modify: `frontend/src/components/CenterPanel.tsx`, `frontend/src/components/CenterPanel.module.css`

**Interfaces:**
- Consumes: `asset.currency`, `asset.usdRate` (Task 3); `fmtUsd` (existing).

- [ ] **Step 1: Add the currency tag + `≈ $X` line (`CenterPanel.tsx`)**

In the identity row, add the currency tag after the category badge:

```tsx
              <span className={styles.badge}>{asset.cat}</span>
              {asset.currency !== 'USD' && <span className={styles.curBadge}>{asset.currency}</span>}
              {asset.source === 'live' && <span className={styles.liveBadge}>● LIVE</span>}
```

In the `.bigprice` block, add the converted line after the change `<div>` (before the `mktCap` line):

```tsx
            {asset.currency !== 'USD' && asset.usdRate !== 1 && (
              <div className={styles.usdConv}>≈ {fmtUsd(asset.price * asset.usdRate)}</div>
            )}
            {mktCap != null && <div className={styles.mcap}>MKT CAP <b>{fmtMcap(mktCap)}</b></div>}
```

(`fmtUsd` is already imported in `CenterPanel.tsx`.)

- [ ] **Step 2: Style them (`CenterPanel.module.css`)**

Append:

```css
.curBadge { font-size: 9px; padding: 2px 7px; border: 1px solid var(--border-2); border-radius: 4px; color: #7EC8FF; letter-spacing: 1px; }
.usdConv { font-size: 11px; font-weight: 700; color: var(--dim); margin-top: 3px; font-variant-numeric: tabular-nums; }
```

- [ ] **Step 3: Verify the build**

Run: `cd frontend && npm run build`
Expected: `✓ built`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/CenterPanel.tsx frontend/src/components/CenterPanel.module.css
git commit -m "feat(fx): headline shows local price + currency tag + USD conversion

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Frontend — rate-aware map exposure

**Files:**
- Modify: `frontend/src/geo/exposure.ts`

**Interfaces:**
- Consumes: `asset.usdRate`, `position.entryRate` (Task 3).

- [ ] **Step 1: Convert notional & latent to USD (`exposure.ts`)**

In `buildExposure`, replace the per-open-position `notional`/`latent` computation:

```ts
  for (const p of positions) {
    const a = assets[p.symbol]
    const hasRate = p.entryRate != null
    const curRate = hasRate ? (a?.usdRate ?? 1) : 1
    const entRate = p.entryRate ?? 1
    const notional = (a?.price ?? p.entry) * p.lots * (a?.contract ?? 1) * curRate
    const latent = a ? (a.price * curRate - p.entry * entRate) * p.sign * p.lots * a.contract : 0
    const iso = resolveIso(p.symbol, customs, indexMap, assets)
```

(The rest of the loop body — the `if (iso) { … } else { … }` accumulation — is unchanged. Realized P&L comes from `ClosedTrade.pnl`, already USD.)

- [ ] **Step 2: Verify the build**

Run: `cd frontend && npm run build`
Expected: `✓ built`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/geo/exposure.ts
git commit -m "feat(fx): map exposure notional/latent in USD

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Docs + final verification

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Document the behaviour (`CLAUDE.md`)**

Append to the **Account** bullet under "Key behaviours":

```
Foreign-currency **equities** (e.g. `.PA`/`.T` custom symbols) are displayed in their local currency (with a `≈ $X` conversion and a currency tag) but all money math is USD: the asset carries `currency` + a live `usdRate` (backend `providers.usd_rate` + `fx_loop`), and the position freezes `entryRate` at open, so P&L includes the FX move (`store.buildClosed`/`positionPnl`/`computeAccount`). SL/TP stay in local price. FX pairs, crypto, commodities and indices keep `usdRate=1`; positions opened before this feature (no `entryRate`) keep their prior local-number behaviour.
```

- [ ] **Step 2: Full backend + frontend verification**

Run: `cd backend && python -m pytest -q`
Expected: `35 passed` (32 existing + 3 new from Task 1).

Run: `cd frontend && npm run build`
Expected: `✓ built` with no TypeScript errors.

- [ ] **Step 3: Live check**

Start backend (`:8000`) + frontend (`npm run dev`). Then:
1. Search-add a `.PA` or `.T` stock (e.g. `MC.PA`). The headline shows the local
   price, a currency tag (`EUR`), and a `≈ $…` line. `AAPL` shows neither.
2. Order ticket: VALUE / MARGIN are in USD (much larger than local × lots for a big
   FX like JPY, or × the EUR rate), with the `≈ converted at EUR/USD …` hint.
3. Open a BUY; the positions P&L (and account equity) move with **both** the local
   price and the EUR/USD rate. Enter SL/TP in EUR — they trigger against the local price.
4. Close it → realized P&L is in USD. On the GLOBAL map (Portfolio mode), that
   country's exposure/latent is in USD.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(fx): document foreign-equity currency conversion

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-review (completed by plan author)

**1. Spec coverage**

| Spec requirement | Task |
|---|---|
| Capture `currency` from Yahoo meta | Task 1 |
| `usd_rate()` cached FX lookup, USD/failure → last/1.0 | Task 1 |
| `Asset.currency/usdRate`, `Quote.usdRate?`, `Position.entryRate?` | Task 3 |
| Backend emits currency/usdRate; `fx_loop` refresh; add-asset wiring | Task 2 |
| B2 formula (frozen entry rate) in P&L/account/close | Task 3 |
| Margin/value/risk in USD; stamp `entryRate` at open | Task 4 (market) / Task 3 (pending fill) |
| SL/TP stay in local price | Tasks 3–4 (untouched compare path) |
| Local price + currency tag + `≈ $X` line | Task 5 |
| Map exposure in USD | Task 6 |
| Scope EQ-only; FX/crypto/CMD/indices `usdRate=1` | Task 2 (`fx_loop`/add-asset guards), Task 1 (`usd_rate` USD passthrough) |
| Migration: pre-existing positions behave as today | Task 3 (`hasRate` in `fxRates`/`buildClosed`), Task 6 |
| Hide `≈ $X` when `usdRate===1` | Task 5 |
| Docs | Task 7 |

**2. Placeholder scan:** No TBD/TODO; every code step is complete. ✓

**3. Type consistency:** `buildClosed(p, exit, reason, contract, exitRate)` is defined in Task 3 and every caller (closePosition, closeAll, applyQuotes SL/TP) passes 5 args. `fxRates` returns `{ curRate, entRate }`, used consistently. `Position.entryRate?`, `Asset.usdRate`, `Quote.usdRate?` names match across Tasks 3–6. `MARKET.register(..., currency, usd_rate)` matches the call in Task 2 Step 5. `set_usd_rate`/`usd_rate` names consistent between `market.py`, `feeds.py`, `providers.py`. ✓

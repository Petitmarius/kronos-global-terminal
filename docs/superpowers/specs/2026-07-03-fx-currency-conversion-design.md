# Foreign-Currency Conversion for Foreign Equities (B2) — Design

- **Date:** 2026-07-03
- **Proposed branch:** `feat/fx-currency-conversion`
- **Status:** Design approved, pending spec review

## 1. Problem

A foreign equity (e.g. `MC.PA` = LVMH quoted in **EUR**, `7203.T` = Toyota in **JPY**)
is returned by Yahoo at its **local-currency** price. But the whole money chain
treats that number as **USD**:

- `OrderPanel`: `VALUE = lots × price × contract`, `MARGIN`, `RISK` — shown in `$`
  but computed on a EUR price.
- `store`: `positionPnl`, `computeAccount` (balance/equity), `buildClosed`
  (realized P&L) — same.
- `geo/exposure.ts`: `notional` / `latent` in local currency treated as USD.

No currency is captured today (only `macro.market_cap` reads it). The account is
USD (balance = $50k + realized), so foreign positions are mis-valued by the
FX rate (e.g. a €650 stock treated as $650).

## 2. Decision (chosen approach: B2)

Keep the **authentic local price** on display, do all **money math in USD**, and
**freeze the FX rate at entry** so P&L reflects both the price move and the
currency move — exactly like a USD account holding a foreign stock.

| Aspect | Decision |
|---|---|
| Scope | Foreign **equities** only: `cat === 'EQ'` and `currency !== 'USD'` |
| Display price | Local currency (unchanged) + a secondary `≈ $X` line + a currency tag |
| Money math | USD, via `price × usdRate` and `entry × entryRate` |
| FX realism | **Frozen entry rate** (`entryRate` stored on the position) → P&L includes FX drift |
| SL / TP | Stay in **local price** (compared against the local `price`) — unchanged |
| Out of scope | FX pairs (price is itself a rate), crypto (USD), commodities (USD), indices (points $/pt convention). All keep `usdRate = 1`. FX-pair pip-value realism is explicitly unchanged. |

## 3. The formula

For quantity `qty = lots × contract`, local entry `entry`, frozen `entryRate`
(USD per local unit at open), current local price `p`, current rate `r`,
direction `sign`:

```
P&L_USD   = sign × (p × r − entry × entryRate) × qty
Margin_USD = orderPrice × usdRate × qty / LEVERAGE     (locked at open)
```

USD assets have `usdRate = entryRate = 1`, so the formula reduces to the current
one — a pure superset. Defensive defaults (`?? 1`) make it safe for positions and
assets persisted before this change.

## 4. Data model

- **`Asset`** (`types.ts`) += `currency: string` (e.g. `'EUR'`), `usdRate: number`
  (USD per 1 unit of `currency`; `1` unless a foreign equity).
- **`Position`** (`types.ts`) += `entryRate: number` (the `usdRate` frozen at open;
  `1` for USD).
- **`Quote`** (`types.ts`) += `usdRate?: number` (so live ticks keep the rate fresh).
- `PendingOrder` is unchanged: a LIMIT/STOP captures the rate **at fill**, not at
  placement.

## 5. Backend

### 5.1 `providers.py`
- `quote_from_meta` and `yahoo_quote`: add `"currency": meta.get("currency")` to
  the returned dict (Yahoo `meta` already carries it).
- New `usd_rate(currency: str) -> float` — USD per 1 unit of `currency`; cached ~60s:
  ```python
  _fx_cache: dict[str, tuple[float, float]] = {}
  _FX_TTL = 60.0
  def usd_rate(currency: str) -> float:
      cur = (currency or "USD").upper()
      if cur == "USD":
          return 1.0
      now = time.time()
      c = _fx_cache.get(cur)
      if c and now - c[0] < _FX_TTL:
          return c[1]
      q = yahoo_quote_raw(f"{cur}USD=X")          # e.g. EURUSD=X, JPYUSD=X
      if q and q.get("price"):
          rate = float(q["price"])
          _fx_cache[cur] = (now, rate)
          return rate
      return c[1] if c else 1.0                    # failure: last-known, else 1.0 (not cached)
  ```

### 5.2 `assets.py`
- `universe()`: add `"currency": "USD"` to every base asset dict (base assets are
  US/USD or point-convention indices — no conversion).

### 5.3 `market.py`
- `MarketState.__init__`: store `"usd_rate": 1.0` on each base asset dict.
- `asset_dict`: emit `"currency": a.get("currency", "USD")` and
  `"usdRate": a.get("usd_rate", 1.0)`.
- `_quote`: emit `"usdRate": a.get("usd_rate", 1.0)`.
- `register(...)`: add params `currency: str = "USD", usd_rate: float = 1.0`; store
  `"currency": currency, "usd_rate": usd_rate` on the asset.
- New `set_usd_rate(symbol: str, rate: float) -> dict | None`: set `a["usd_rate"]`
  and return `self._quote(a)`.

### 5.4 `feeds.py` — new `fx_loop`
Refresh the USD rate for foreign equities every 60s and broadcast it (the quote
carries `usdRate`):
```python
async def fx_loop() -> None:
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

### 5.5 `main.py`
- Import `fx_loop`; add `asyncio.create_task(fx_loop())` to the lifespan tasks.
- `/api/assets/add`: after fetching `quote`, capture currency + rate and pass them
  to `register`:
  ```python
  currency = (quote.get("currency") or "USD").upper()
  cat_final = cat or "EQ"
  rate = (await asyncio.to_thread(providers.usd_rate, currency)
          if cat_final == "EQ" and currency != "USD" else 1.0)
  asset = MARKET.register(local, name or local, cat_final, digits, 1.0, quote, currency, rate)
  ```

## 6. Frontend

### 6.1 `store.ts`
- `applyQuotes`: when merging a quote, add `usdRate: q.usdRate ?? cur.usdRate`.
- `positionPnl`: rate-aware — `pnl = (current * (a?.usdRate ?? 1) − p.entry * (p.entryRate ?? 1)) * p.sign * p.lots * (a?.contract ?? 1)`.
- `computeAccount`: unrealized uses the same rate-aware term.
- `buildClosed(p, exit, reason, contract, exitRate)`: new `exitRate` param;
  `pnl = (exit * exitRate − p.entry * (p.entryRate ?? 1)) * p.sign * p.lots * contract`.
  Callers pass the **current** `asset.usdRate` as `exitRate`:
  - `closePosition` / `closeAll`: `exitRate = a?.usdRate ?? p.entryRate ?? 1`.
  - `applyQuotes` SL/TP branch: `exitRate = a.usdRate ?? 1`.
- Pending fill (`applyQuotes`): the new `Position` gets `entryRate: a.usdRate ?? 1`
  (rate at fill).

### 6.2 `OrderPanel.tsx`
- `const rate = asset?.usdRate ?? 1`.
- `value = lots * orderPrice * asset.contract * rate`; `margin = value / LEVERAGE`;
  `risk = slVal != null ? Math.abs(orderPrice - slVal) * lots * asset.contract * rate : value * 0.0022`.
- MARKET submit: `openPosition({ ..., entry: side === 'BUY' ? book.ask : book.bid, entryRate: rate, margin, ... })`.
- When `asset.currency !== 'USD'`, show a small hint: `≈ converted at {currency}/USD {rate}`.

### 6.3 `CenterPanel.tsx`
- Currency tag next to the category badge when `asset.currency !== 'USD'`.
- A secondary line under the change, when `asset.currency !== 'USD' && asset.usdRate !== 1`:
  `≈ {fmtUsd(asset.price * asset.usdRate)}`.
- The positions table already shows P&L via `positionPnl` (now USD-correct) and
  entry/current in local price — no change needed there.

### 6.4 `geo/exposure.ts`
- `notional = (a?.price ?? p.entry) * p.lots * (a?.contract ?? 1) * (a?.usdRate ?? 1)`.
- `latent = a ? (a.price * (a.usdRate ?? 1) − p.entry * (p.entryRate ?? 1)) * p.sign * p.lots * a.contract : 0`.
- `realized` from `ClosedTrade.pnl` (already USD) — unchanged.

### 6.5 CSS
- `CenterPanel.module.css`: `.curBadge` (like `.badge`) and `.usdConv` (like `.mcap`, dim).
- `OrderPanel.module.css`: `.fxHint` (small, dim).

## 7. Edge cases & honesty

- **Rate fetch fails** → last-known rate, else `1.0` (not cached); the `≈ $` line is
  hidden whenever `usdRate === 1` for a non-USD currency, so no misleading equal figure.
- **Old persisted data** (positions without `entryRate`, assets without `usdRate`) →
  `?? 1` defaults make them behave exactly as today (USD-assumed) until closed/reopened.
- **Pending orders**: margin is previewed at placement using the then-current rate;
  the position's `entryRate` is set at fill. Minor and consistent with the existing
  approximate pending margin.
- **FX pairs / indices / crypto / commodities**: `usdRate = 1`, unchanged. FX-pair
  pip-value realism is explicitly out of scope.
- **Base foreign indices** `GER40`/`UK100`: keep the points ($/pt) convention
  (`currency = 'USD'`, no badge, no conversion).

## 8. Files

- **Backend:** `providers.py` (currency + `usd_rate`), `assets.py` (base currency),
  `market.py` (`usd_rate` field, `asset_dict`/`_quote`/`register`/`set_usd_rate`),
  `feeds.py` (`fx_loop`), `main.py` (task + add-asset wiring),
  `tests/test_providers.py` (new: `usd_rate('USD') == 1.0`, currency capture).
- **Frontend:** `types.ts`, `store.ts`, `components/OrderPanel.tsx`,
  `components/OrderPanel.module.css`, `components/CenterPanel.tsx`,
  `components/CenterPanel.module.css`, `geo/exposure.ts`.
- **Docs:** `CLAUDE.md` (note foreign-equity currency handling).

## 9. Verification

- `cd backend && python -m pytest -q` (add a small `usd_rate` / currency test).
- `cd frontend && npm run build` green.
- Live: search-add `MC.PA` (or another `.PA`/`.T` stock) → headline shows the local
  price with a `EUR` tag and a `≈ $…` line; order ticket VALUE/MARGIN in USD with the
  FX hint; open a position → P&L moves with **both** the local price and EUR/USD;
  SL/TP entered in EUR; close → realized P&L in USD; the map's exposure/P&L for that
  country is in USD. A US stock (e.g. `AAPL`) shows no tag/line and is unaffected.

## 10. Out of scope (future)

- Realistic FX-pair pip-value P&L (USDJPY/USDCAD notional & P&L stay simplified).
- Converting foreign **indices** from points to a currency notional.
- A dedicated FX-rate panel / showing the entry rate in the positions table.

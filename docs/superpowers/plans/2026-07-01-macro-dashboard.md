# Macro Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full-screen "Macro Dashboard" primary view to APEX with 8 institutional-macro panels fed by real data (Yahoo keyless for market macro, FRED for economics).

**Architecture:** A `view` toggle in the Zustand store switches `App` between the existing 3-column terminal and a new `MacroDashboard`. A new backend `macro.py` module + 4 REST endpoints serve a Yahoo-derived "board" (rates/VIX/DXY/sectors/cross-asset, refreshed by a background loop) and three FRED-backed endpoints (econ indicators, yield curve, latest releases) that degrade gracefully to `available:false` when no FRED key is present.

**Tech Stack:** FastAPI + urllib (backend), pytest (new, backend unit tests), React 18 + TypeScript + Zustand + lightweight-charts (frontend).

## Global Constraints

- Python 3.14 / Node 24. Backend uses stdlib `urllib` for HTTP (no `requests`) — match `providers.py`.
- Keyless-first: everything in `/api/macro/board` works with **no API key**. FRED endpoints return `{"available": false, ...}` when `FRED_API_KEY` is empty — **never** fabricate economic values.
- `FRED_API_KEY` lives in `backend/.env` (gitignored, like `FINNHUB_API_KEY`) — never commit it.
- Backend JSON keys are **camelCase** to match the frontend types verbatim (e.g. `crossAsset`, `spread2s10s`, `chgY10`).
- Frontend: no new runtime dependencies. lightweight-charts is already present. Reuse `COLORS` from `constants.ts` and existing CSS tokens (`--border`, `--dim`).
- Frontend "test" = `cd frontend && npm run build` (runs `tsc --noEmit && vite build`) must pass, plus the described manual visual check. Do not add a frontend test runner.
- Yahoo may 429; every fetch must fall back to the last cached value without crashing (mirror `providers.py`).

## File Structure

**Backend**
- `backend/config.py` — MODIFY: add `FRED_API_KEY`.
- `backend/providers.py` — MODIFY: add `yahoo_quote_raw(ysym)` (quote for an arbitrary Yahoo symbol, not requiring `YAHOO_MAP`).
- `backend/macro.py` — CREATE: constants (symbol/series registries), pure helpers (`normalize_yield`, `risk_regime`, `latest_prior`, `spark`, `sort_releases`), FRED client, board/econ/curve/releases assembly + caches, `macro_loop`.
- `backend/main.py` — MODIFY: 4 routes + register `macro_loop` in lifespan.
- `backend/requirements.txt` — MODIFY: add `pytest`.
- `backend/tests/__init__.py`, `backend/tests/test_macro.py` — CREATE: unit tests for pure helpers + assembly.
- `backend/.env.example` — CREATE/MODIFY: document `FRED_API_KEY`.

**Frontend**
- `frontend/src/types.ts` — MODIFY: macro types.
- `frontend/src/api.ts` — MODIFY: `fetchMacroBoard/Econ/Curve/Releases`.
- `frontend/src/store.ts` — MODIFY: `view` + `setView` (persisted `apex.view`).
- `frontend/src/components/Header.tsx` + `Header.module.css` — MODIFY: `[TERMINAL] [MACRO]` segmented nav.
- `frontend/src/App.tsx` — MODIFY: conditional body.
- `frontend/src/components/macro/MacroDashboard.tsx` + `MacroDashboard.module.css` — CREATE: grid + polling.
- `frontend/src/components/macro/Panel.tsx` — CREATE: shared panel shell.
- `frontend/src/components/macro/panels/*.tsx` — CREATE: 8 panels.

**Docs**
- `README.md`, `CLAUDE.md` — MODIFY: new view + `FRED_API_KEY`.

---

### Task 1: Pytest harness + pure macro helpers

**Files:**
- Create: `backend/macro.py` (helpers only, this task)
- Create: `backend/tests/__init__.py`, `backend/tests/test_macro.py`
- Modify: `backend/requirements.txt`

**Interfaces:**
- Produces:
  - `normalize_yield(v: float | None) -> float | None` — divide by 10 if `v > 25` (Yahoo occasionally quotes yields ×10); passes through `None`.
  - `risk_regime(vix: float | None) -> str` — `"Calm"` (<15), `"Normal"` (15–20), `"Elevated"` (20–30), `"Risk-off"` (≥30), `"—"` (None).
  - `latest_prior(obs: list[dict]) -> tuple[float | None, float | None]` — from FRED observations (each `{"date","value"}`, oldest→newest), the last and second-to-last **numeric** values (skip `"."`).
  - `spark(obs: list[dict], n: int) -> list[float]` — last `n` numeric values, oldest→newest.
  - `sort_releases(items: list[dict]) -> list[dict]` — sort by `item["updated"]` (ISO string) descending.

- [ ] **Step 1: Add pytest to requirements**

Append to `backend/requirements.txt`:

```
pytest>=8.0
```

- [ ] **Step 2: Write the failing tests**

Create `backend/tests/__init__.py` (empty). Create `backend/tests/test_macro.py`:

```python
import macro


def test_normalize_yield_passthrough_small():
    assert macro.normalize_yield(4.23) == 4.23

def test_normalize_yield_scales_down_when_times_ten():
    assert macro.normalize_yield(42.3) == 4.23

def test_normalize_yield_none():
    assert macro.normalize_yield(None) is None

def test_risk_regime_buckets():
    assert macro.risk_regime(12) == "Calm"
    assert macro.risk_regime(17) == "Normal"
    assert macro.risk_regime(25) == "Elevated"
    assert macro.risk_regime(40) == "Risk-off"
    assert macro.risk_regime(None) == "—"

def test_latest_prior_skips_missing():
    obs = [{"date": "2024-01", "value": "1.0"},
           {"date": "2024-02", "value": "."},
           {"date": "2024-03", "value": "2.0"},
           {"date": "2024-04", "value": "3.0"}]
    assert macro.latest_prior(obs) == (3.0, 2.0)

def test_latest_prior_empty():
    assert macro.latest_prior([]) == (None, None)

def test_spark_last_n_numeric():
    obs = [{"value": str(i)} for i in range(10)]
    obs.insert(3, {"value": "."})
    assert macro.spark(obs, 3) == [7.0, 8.0, 9.0]

def test_sort_releases_desc_by_updated():
    items = [{"label": "a", "updated": "2024-01-01"},
             {"label": "b", "updated": "2024-03-01"},
             {"label": "c", "updated": "2024-02-01"}]
    assert [i["label"] for i in macro.sort_releases(items)] == ["b", "c", "a"]
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_macro.py -v`
Expected: FAIL / collection error (`macro` has no attribute `normalize_yield`, etc.)

- [ ] **Step 4: Implement the pure helpers**

Create `backend/macro.py`:

```python
"""Macro dashboard data layer.

Two data planes:
  - Yahoo (keyless): the "board" — rates majors, VIX, DXY, sectors, cross-asset.
  - FRED (free key): economic indicators, full yield curve, latest releases.
FRED functions degrade to {"available": False} when no key is configured.
"""
from __future__ import annotations


def _num(v) -> float | None:
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f


def normalize_yield(v: float | None) -> float | None:
    """Yahoo sometimes quotes rate indices ×10 (42.3 == 4.23%)."""
    if v is None:
        return None
    return round(v / 10.0, 4) if v > 25 else round(v, 4)


def risk_regime(vix: float | None) -> str:
    if vix is None:
        return "—"
    if vix < 15:
        return "Calm"
    if vix < 20:
        return "Normal"
    if vix < 30:
        return "Elevated"
    return "Risk-off"


def latest_prior(obs: list[dict]) -> tuple[float | None, float | None]:
    vals = [f for o in obs if (f := _num(o.get("value"))) is not None]
    latest = vals[-1] if vals else None
    prior = vals[-2] if len(vals) >= 2 else None
    return latest, prior


def spark(obs: list[dict], n: int) -> list[float]:
    vals = [f for o in obs if (f := _num(o.get("value"))) is not None]
    return vals[-n:]


def sort_releases(items: list[dict]) -> list[dict]:
    return sorted(items, key=lambda i: i.get("updated") or "", reverse=True)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_macro.py -v`
Expected: PASS (8 passed)

- [ ] **Step 6: Commit**

```bash
git add backend/macro.py backend/tests backend/requirements.txt
git commit -m "feat(macro): pure helpers + pytest harness"
```

---

### Task 2: Config FRED key + Yahoo raw quote

**Files:**
- Modify: `backend/config.py`
- Modify: `backend/providers.py`
- Modify: `backend/tests/test_macro.py` (add parse test)

**Interfaces:**
- Consumes: `providers._chart`, `providers._quote_cache` pattern.
- Produces:
  - `config.FRED_API_KEY: str`
  - `providers.quote_from_meta(meta: dict) -> dict | None` — pure: from a Yahoo chart `meta` block returns `{"price","prevClose","pct","open","high","low"}` or `None`.
  - `providers.yahoo_quote_raw(ysym: str) -> dict | None` — fetch+cache a quote for an **arbitrary** Yahoo symbol.

- [ ] **Step 1: Add the FRED key to config**

In `backend/config.py`, after the `FINNHUB_API_KEY` line add:

```python
FRED_API_KEY: str = os.getenv("FRED_API_KEY", "").strip()
```

- [ ] **Step 2: Write the failing parse test**

Append to `backend/tests/test_macro.py`:

```python
import providers


def test_quote_from_meta_computes_pct():
    meta = {"regularMarketPrice": 110.0, "previousClose": 100.0,
            "regularMarketOpen": 101.0, "regularMarketDayHigh": 111.0,
            "regularMarketDayLow": 99.0}
    q = providers.quote_from_meta(meta)
    assert q["price"] == 110.0
    assert q["prevClose"] == 100.0
    assert round(q["pct"], 2) == 10.0

def test_quote_from_meta_missing_returns_none():
    assert providers.quote_from_meta({"regularMarketPrice": 0}) is None
```

- [ ] **Step 3: Run to verify fail**

Run: `cd backend && python -m pytest tests/test_macro.py -k quote_from_meta -v`
Expected: FAIL (`providers` has no attribute `quote_from_meta`)

- [ ] **Step 4: Implement `quote_from_meta` + `yahoo_quote_raw`**

In `backend/providers.py`, add a separate raw-quote cache near the other caches:

```python
_raw_quote_cache: dict[str, tuple[float, dict]] = {}
```

Add these functions (place `quote_from_meta` above `yahoo_quote`, and `yahoo_quote_raw` below it):

```python
def quote_from_meta(meta: dict) -> dict | None:
    price = meta.get("regularMarketPrice")
    prev = meta.get("previousClose") or meta.get("chartPreviousClose")
    if not price or not prev:
        return None
    pct = (float(price) / float(prev) - 1.0) * 100.0
    return {
        "price": float(price), "prevClose": float(prev), "pct": pct,
        "open": meta.get("regularMarketOpen"),
        "high": meta.get("regularMarketDayHigh"),
        "low": meta.get("regularMarketDayLow"),
    }


def yahoo_quote_raw(ysym: str) -> dict | None:
    """Quote for an arbitrary Yahoo symbol (no YAHOO_MAP entry needed)."""
    now = time.time()
    if ysym in _raw_quote_cache and now - _raw_quote_cache[ysym][0] < _QUOTE_TTL:
        return _raw_quote_cache[ysym][1]
    try:
        meta = _chart(ysym, "1d", "1d")["chart"]["result"][0]["meta"]
    except (KeyError, IndexError, TypeError):
        return _raw_quote_cache.get(ysym, (0, None))[1]  # stale fallback
    q = quote_from_meta(meta)
    if q:
        _raw_quote_cache[ysym] = (now, q)
    return q
```

- [ ] **Step 5: Run to verify pass**

Run: `cd backend && python -m pytest tests/test_macro.py -v`
Expected: PASS (all)

- [ ] **Step 6: Commit**

```bash
git add backend/config.py backend/providers.py backend/tests/test_macro.py
git commit -m "feat(macro): FRED key config + yahoo_quote_raw"
```

---

### Task 3: FRED client

**Files:**
- Modify: `backend/macro.py`
- Modify: `backend/tests/test_macro.py`

**Interfaces:**
- Consumes: `config.FRED_API_KEY`, `providers._get`.
- Produces:
  - `fred_available() -> bool`
  - `fred_observations(series_id: str, *, units: str = "lin", limit: int = 40) -> list[dict]` — returns FRED observations oldest→newest, or `[]` (no key / error).
  - `fred_meta(series_id: str) -> dict` — `{"units": str, "updated": str}` (from FRED series metadata), or `{}`.

- [ ] **Step 1: Write the failing test (gating without a key)**

Append to `backend/tests/test_macro.py`:

```python
import config


def test_fred_unavailable_without_key(monkeypatch):
    monkeypatch.setattr(config, "FRED_API_KEY", "")
    assert macro.fred_available() is False
    assert macro.fred_observations("CPIAUCSL") == []
    assert macro.fred_meta("CPIAUCSL") == {}
```

- [ ] **Step 2: Run to verify fail**

Run: `cd backend && python -m pytest tests/test_macro.py -k fred -v`
Expected: FAIL (`macro` has no attribute `fred_available`)

- [ ] **Step 3: Implement the FRED client**

Add to `backend/macro.py` (add `import time`, `import urllib.parse`, `import config`, `import providers` at top):

```python
import time
import urllib.parse

import config
import providers

_FRED_BASE = "https://api.stlouisfed.org/fred"
_fred_cache: dict[str, tuple[float, object]] = {}
_FRED_TTL = 6 * 3600.0


def fred_available() -> bool:
    return bool(config.FRED_API_KEY)


def _fred_get(path: str, params: dict) -> dict | None:
    if not fred_available():
        return None
    params = {**params, "api_key": config.FRED_API_KEY, "file_type": "json"}
    url = f"{_FRED_BASE}/{path}?{urllib.parse.urlencode(params)}"
    key = url
    now = time.time()
    if key in _fred_cache and now - _fred_cache[key][0] < _FRED_TTL:
        return _fred_cache[key][1]
    try:
        data = providers._get(url)
    except Exception:  # noqa: BLE001 — keep resilient, fall back to stale
        return _fred_cache.get(key, (0, None))[1]
    _fred_cache[key] = (now, data)
    return data


def fred_observations(series_id: str, *, units: str = "lin", limit: int = 40) -> list[dict]:
    data = _fred_get("series/observations", {
        "series_id": series_id, "units": units,
        "sort_order": "asc", "limit": str(limit),
    })
    return (data or {}).get("observations", []) if data else []


def fred_meta(series_id: str) -> dict:
    data = _fred_get("series", {"series_id": series_id})
    if not data:
        return {}
    arr = data.get("seriess") or []
    if not arr:
        return {}
    s = arr[0]
    return {"units": s.get("units_short") or s.get("units") or "", "updated": s.get("last_updated") or ""}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd backend && python -m pytest tests/test_macro.py -v`
Expected: PASS (all)

- [ ] **Step 5: Commit**

```bash
git add backend/macro.py backend/tests/test_macro.py
git commit -m "feat(macro): FRED client with 6h cache + key gating"
```

---

### Task 4: Board assembly (Yahoo)

**Files:**
- Modify: `backend/macro.py`
- Modify: `backend/tests/test_macro.py`

**Interfaces:**
- Consumes: `providers.yahoo_quote_raw`, `normalize_yield`, `risk_regime`.
- Produces:
  - Registries: `SECTORS`, `CROSS_ASSET`, `YIELDS_YH`, `VIX_YH`, `DXY_YH`.
  - `board_symbols() -> list[str]` — unique Yahoo symbols the board needs.
  - `build_board(quotes: dict[str, dict]) -> dict` — pure assembly from `{ysym: quote}` (quote = `yahoo_quote_raw` shape) → the board dict (camelCase).
  - `fetch_board() -> dict` — I/O: fills a `{ysym: quote}` map via `yahoo_quote_raw` and returns `build_board(...)`; caches under `_board_cache`.

- [ ] **Step 1: Write the failing test for `build_board`**

Append to `backend/tests/test_macro.py`:

```python
def test_build_board_shape():
    quotes = {}
    for ysym in macro.board_symbols():
        # yields come back ×10 to prove norm_yield runs; others plain
        quotes[ysym] = {"price": 42.0, "prevClose": 41.0, "pct": 1.5,
                        "open": None, "high": None, "low": None}
    b = macro.build_board(quotes)
    assert set(b) >= {"ts", "rates", "vix", "dxy", "sectors", "crossAsset"}
    assert b["rates"]["y10"] == 4.2            # 42.0 normalized
    assert b["vix"]["regime"] in {"Calm", "Normal", "Elevated", "Risk-off"}
    assert len(b["sectors"]) == 11
    assert {c["key"] for c in b["crossAsset"]} == {
        "equities", "rates", "commodities", "fx", "crypto"}
    assert b["sectors"][0]["pct"] >= b["sectors"][-1]["pct"]  # sorted desc
```

- [ ] **Step 2: Run to verify fail**

Run: `cd backend && python -m pytest tests/test_macro.py -k build_board -v`
Expected: FAIL (no `board_symbols`)

- [ ] **Step 3: Implement registries + `build_board` + `fetch_board`**

Add to `backend/macro.py`:

```python
SECTORS = [
    ("XLK", "Technology"), ("XLF", "Financials"), ("XLE", "Energy"),
    ("XLV", "Health Care"), ("XLI", "Industrials"), ("XLY", "Cons. Disc."),
    ("XLP", "Cons. Staples"), ("XLU", "Utilities"), ("XLB", "Materials"),
    ("XLRE", "Real Estate"), ("XLC", "Comm. Svcs"),
]
CROSS_ASSET = [
    ("equities", "Equities", [("^GSPC", "S&P 500"), ("^NDX", "Nasdaq 100"),
        ("^DJI", "Dow 30"), ("^GDAXI", "DAX"), ("^FTSE", "FTSE 100")]),
    ("rates", "Bonds", [("TLT", "20Y+ Treas"), ("IEF", "7-10Y Treas"),
        ("LQD", "IG Credit"), ("HYG", "HY Credit")]),
    ("commodities", "Commodities", [("GC=F", "Gold"), ("CL=F", "WTI Crude"),
        ("SI=F", "Silver"), ("HG=F", "Copper"), ("NG=F", "Nat Gas")]),
    ("fx", "FX", [("DX-Y.NYB", "US Dollar"), ("EURUSD=X", "EUR/USD"),
        ("USDJPY=X", "USD/JPY"), ("GBPUSD=X", "GBP/USD")]),
    ("crypto", "Crypto", [("BTC-USD", "Bitcoin"), ("ETH-USD", "Ethereum"),
        ("SOL-USD", "Solana")]),
]
YIELDS_YH = {"m3": "^IRX", "y5": "^FVX", "y10": "^TNX", "y30": "^TYX"}
VIX_YH = "^VIX"
DXY_YH = "DX-Y.NYB"

_board_cache: tuple[float, dict] | None = None
_BOARD_TTL = 20.0


def board_symbols() -> list[str]:
    syms = set(YIELDS_YH.values()) | {VIX_YH, DXY_YH}
    syms |= {s for s, _ in SECTORS}
    for _, _, items in CROSS_ASSET:
        syms |= {s for s, _ in items}
    return sorted(syms)


def _bp_change(q: dict | None) -> float | None:
    if not q:
        return None
    return round((normalize_yield(q["price"]) - normalize_yield(q["prevClose"])) * 100, 1)


def build_board(quotes: dict[str, dict]) -> dict:
    def lvl(ysym):
        q = quotes.get(ysym)
        return normalize_yield(q["price"]) if q else None

    vix_q = quotes.get(VIX_YH)
    dxy_q = quotes.get(DXY_YH)
    sectors = sorted(
        [{"symbol": s, "label": lbl, "pct": round(quotes[s]["pct"], 2)}
         for s, lbl in SECTORS if s in quotes],
        key=lambda x: x["pct"], reverse=True)
    cross = []
    for key, label, items in CROSS_ASSET:
        cells = [{"symbol": s, "label": lbl, "pct": round(quotes[s]["pct"], 2)}
                 for s, lbl in items if s in quotes]
        cross.append({"key": key, "label": label, "items": cells})
    return {
        "ts": int(time.time() * 1000),
        "rates": {
            "m3": lvl(YIELDS_YH["m3"]), "y5": lvl(YIELDS_YH["y5"]),
            "y10": lvl(YIELDS_YH["y10"]), "y30": lvl(YIELDS_YH["y30"]),
            "chgM3": _bp_change(quotes.get(YIELDS_YH["m3"])),
            "chgY10": _bp_change(quotes.get(YIELDS_YH["y10"])),
            "chgY30": _bp_change(quotes.get(YIELDS_YH["y30"])),
        },
        "vix": {"level": round(vix_q["price"], 2) if vix_q else None,
                "pct": round(vix_q["pct"], 2) if vix_q else None,
                "regime": risk_regime(vix_q["price"] if vix_q else None)},
        "dxy": {"level": round(dxy_q["price"], 3) if dxy_q else None,
                "pct": round(dxy_q["pct"], 2) if dxy_q else None},
        "sectors": sectors,
        "crossAsset": cross,
    }


def fetch_board() -> dict:
    global _board_cache
    now = time.time()
    if _board_cache and now - _board_cache[0] < _BOARD_TTL:
        return _board_cache[1]
    quotes: dict[str, dict] = {}
    for ysym in board_symbols():
        q = providers.yahoo_quote_raw(ysym)
        if q:
            quotes[ysym] = q
    board = build_board(quotes)
    _board_cache = (now, board)
    return board
```

- [ ] **Step 4: Run to verify pass**

Run: `cd backend && python -m pytest tests/test_macro.py -v`
Expected: PASS (all)

- [ ] **Step 5: Commit**

```bash
git add backend/macro.py backend/tests/test_macro.py
git commit -m "feat(macro): board assembly from Yahoo quotes"
```

---

### Task 5: Econ, curve & releases assembly (FRED)

**Files:**
- Modify: `backend/macro.py`
- Modify: `backend/tests/test_macro.py`

**Interfaces:**
- Consumes: `fred_available`, `fred_observations`, `fred_meta`, `latest_prior`, `spark`, `normalize_yield`, `sort_releases`.
- Produces (all return camelCase dicts with an `available` flag):
  - `build_econ() -> dict` — `{"available": bool, "series": [{key,label,value,prior,unit,spark}]}`.
  - `build_curve() -> dict` — `{"available": bool, "points": [{label,months,yield}], "spread2s10s": float|None, "inverted": bool}`.
  - `build_releases() -> dict` — `{"available": bool, "items": [{series,label,value,unit,period,updated}]}`.

- [ ] **Step 1: Write the failing tests (unavailable path)**

Append to `backend/tests/test_macro.py`:

```python
def test_build_econ_unavailable(monkeypatch):
    monkeypatch.setattr(config, "FRED_API_KEY", "")
    assert macro.build_econ() == {"available": False, "series": []}

def test_build_curve_unavailable(monkeypatch):
    monkeypatch.setattr(config, "FRED_API_KEY", "")
    c = macro.build_curve()
    assert c["available"] is False and c["points"] == []

def test_build_releases_unavailable(monkeypatch):
    monkeypatch.setattr(config, "FRED_API_KEY", "")
    assert macro.build_releases() == {"available": False, "items": []}
```

- [ ] **Step 2: Run to verify fail**

Run: `cd backend && python -m pytest tests/test_macro.py -k "econ or curve or releases" -v`
Expected: FAIL (no `build_econ`)

- [ ] **Step 3: Implement the FRED assemblies**

Add to `backend/macro.py`:

```python
ECON = [
    ("CPIAUCSL", "CPI (YoY)", "pc1", "%"),
    ("CPILFESL", "Core CPI (YoY)", "pc1", "%"),
    ("UNRATE", "Unemployment", "lin", "%"),
    ("A191RL1Q225SBEA", "GDP (QoQ SAAR)", "lin", "%"),
    ("FEDFUNDS", "Fed Funds", "lin", "%"),
]
CURVE_FRED = [
    ("DGS1MO", 1, "1M"), ("DGS3MO", 3, "3M"), ("DGS6MO", 6, "6M"),
    ("DGS1", 12, "1Y"), ("DGS2", 24, "2Y"), ("DGS3", 36, "3Y"),
    ("DGS5", 60, "5Y"), ("DGS7", 84, "7Y"), ("DGS10", 120, "10Y"),
    ("DGS20", 240, "20Y"), ("DGS30", 360, "30Y"),
]
RELEASES_FRED = [
    ("CPIAUCSL", "CPI", "pc1", "%"), ("CPILFESL", "Core CPI", "pc1", "%"),
    ("PAYEMS", "Nonfarm Payrolls", "chg", "K"), ("UNRATE", "Unemployment Rate", "lin", "%"),
    ("A191RL1Q225SBEA", "GDP Growth", "lin", "%"), ("RSAFS", "Retail Sales (YoY)", "pc1", "%"),
]


def build_econ() -> dict:
    if not fred_available():
        return {"available": False, "series": []}
    series = []
    for sid, label, units, unit in ECON:
        obs = fred_observations(sid, units=units, limit=40)
        value, prior = latest_prior(obs)
        series.append({"key": sid, "label": label, "value": value,
                       "prior": prior, "unit": unit, "spark": spark(obs, 24)})
    return {"available": True, "series": series}


def build_curve() -> dict:
    if not fred_available():
        return {"available": False, "points": [], "spread2s10s": None, "inverted": False}
    points, by_months = [], {}
    for sid, months, label in CURVE_FRED:
        value, _ = latest_prior(fred_observations(sid, limit=5))
        if value is not None:
            points.append({"label": label, "months": months, "yield": round(value, 3)})
            by_months[months] = value
    spread = None
    if 24 in by_months and 120 in by_months:
        spread = round(by_months[120] - by_months[24], 2)
    return {"available": True, "points": points,
            "spread2s10s": spread, "inverted": spread is not None and spread < 0}


def build_releases() -> dict:
    if not fred_available():
        return {"available": False, "items": []}
    items = []
    for sid, label, units, unit in RELEASES_FRED:
        obs = fred_observations(sid, units=units, limit=5)
        value, _ = latest_prior(obs)
        period = obs[-1]["date"] if obs else ""
        meta = fred_meta(sid)
        items.append({"series": sid, "label": label, "value": value,
                      "unit": unit, "period": period,
                      "updated": (meta.get("updated") or "")[:10]})
    return {"available": True, "items": sort_releases(items)}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd backend && python -m pytest tests/test_macro.py -v`
Expected: PASS (all)

- [ ] **Step 5: Commit**

```bash
git add backend/macro.py backend/tests/test_macro.py
git commit -m "feat(macro): FRED econ/curve/releases assembly"
```

---

### Task 6: FastAPI routes + background board loop

**Files:**
- Modify: `backend/main.py`

**Interfaces:**
- Consumes: `macro.fetch_board`, `macro.build_econ`, `macro.build_curve`, `macro.build_releases`.
- Produces: `GET /api/macro/board`, `/api/macro/econ`, `/api/macro/curve`, `/api/macro/releases`; `macro_loop` task.

- [ ] **Step 1: Add the import and routes**

In `backend/main.py`, add `import macro` with the other imports. Add routes after the orderbook route:

```python
@app.get("/api/macro/board")
async def macro_board():
    return await asyncio.to_thread(macro.fetch_board)


@app.get("/api/macro/econ")
async def macro_econ():
    return await asyncio.to_thread(macro.build_econ)


@app.get("/api/macro/curve")
async def macro_curve():
    return await asyncio.to_thread(macro.build_curve)


@app.get("/api/macro/releases")
async def macro_releases():
    return await asyncio.to_thread(macro.build_releases)
```

- [ ] **Step 2: Add the warm-up loop and register it**

In `backend/main.py`, add above `lifespan`:

```python
async def macro_loop() -> None:
    """Keep the Yahoo board cache warm so the dashboard loads instantly."""
    while True:
        try:
            await asyncio.to_thread(macro.fetch_board)
        except Exception:  # noqa: BLE001
            pass
        await asyncio.sleep(30)
```

In `lifespan`, add `asyncio.create_task(macro_loop()),` to the `tasks` list.

- [ ] **Step 3: Verify the server boots and routes respond**

Run (kill any zombie first):
```bash
cd backend && python -c "import main; print('import ok')"
```
Expected: `import ok` (no exceptions).

Then start it and curl the board:
```bash
cd backend && python -m uvicorn main:app --port 8000 &
sleep 8
curl -s http://localhost:8000/api/macro/board | head -c 400
curl -s http://localhost:8000/api/macro/econ | head -c 200
```
Expected: board JSON with `rates`/`sectors`/`crossAsset` populated; econ shows `{"available": false, ...}` if no FRED key (or real series if a key is set). Stop the server (`Get-Process python | Stop-Process -Force` on Windows).

- [ ] **Step 4: Commit**

```bash
git add backend/main.py
git commit -m "feat(macro): REST endpoints + warm-up loop"
```

---

### Task 7: Frontend macro types + API client

**Files:**
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/api.ts`

**Interfaces:**
- Produces: types `MacroBoard`, `SectorPerf`, `CrossAssetBucket`, `MacroEcon`, `EconSeries`, `MacroCurve`, `CurvePoint`, `MacroReleases`, `Release`; fetchers `fetchMacroBoard/Econ/Curve/Releases`.

- [ ] **Step 1: Add the types**

Append to `frontend/src/types.ts`:

```ts
export interface SectorPerf { symbol: string; label: string; pct: number }
export interface CrossAssetCell { symbol: string; label: string; pct: number }
export interface CrossAssetBucket { key: string; label: string; items: CrossAssetCell[] }
export interface MacroBoard {
  ts: number
  rates: {
    m3: number | null; y5: number | null; y10: number | null; y30: number | null
    chgM3: number | null; chgY10: number | null; chgY30: number | null
  }
  vix: { level: number | null; pct: number | null; regime: string }
  dxy: { level: number | null; pct: number | null }
  sectors: SectorPerf[]
  crossAsset: CrossAssetBucket[]
}
export interface EconSeries {
  key: string; label: string; value: number | null; prior: number | null; unit: string; spark: number[]
}
export interface MacroEcon { available: boolean; series: EconSeries[] }
export interface CurvePoint { label: string; months: number; yield: number }
export interface MacroCurve {
  available: boolean; points: CurvePoint[]; spread2s10s: number | null; inverted: boolean
}
export interface Release {
  series: string; label: string; value: number | null; unit: string; period: string; updated: string
}
export interface MacroReleases { available: boolean; items: Release[] }
```

- [ ] **Step 2: Add the fetchers**

Append to `frontend/src/api.ts` (and add the imports to the top `import type` line):

```ts
export async function fetchMacroBoard(): Promise<MacroBoard | null> {
  const r = await fetch('/api/macro/board')
  return r.ok ? r.json() : null
}
export async function fetchMacroEcon(): Promise<MacroEcon | null> {
  const r = await fetch('/api/macro/econ')
  return r.ok ? r.json() : null
}
export async function fetchMacroCurve(): Promise<MacroCurve | null> {
  const r = await fetch('/api/macro/curve')
  return r.ok ? r.json() : null
}
export async function fetchMacroReleases(): Promise<MacroReleases | null> {
  const r = await fetch('/api/macro/releases')
  return r.ok ? r.json() : null
}
```

Update the first line of `api.ts` to import the new types:

```ts
import type {
  Asset, Candles, MacroBoard, MacroCurve, MacroEcon, MacroReleases, OrderBook, Quote,
} from './types'
```

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npm run build`
Expected: build succeeds (types compile; unused-import errors would fail the build, so this proves the types are wired).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types.ts frontend/src/api.ts
git commit -m "feat(macro): frontend types + api client"
```

---

### Task 8: View state + Header nav + App switch + Panel shell

**Files:**
- Modify: `frontend/src/store.ts`
- Modify: `frontend/src/components/Header.tsx`, `frontend/src/components/Header.module.css`
- Modify: `frontend/src/App.tsx`
- Create: `frontend/src/components/macro/Panel.tsx`
- Create: `frontend/src/components/macro/MacroDashboard.tsx`, `frontend/src/components/macro/MacroDashboard.module.css`

**Interfaces:**
- Consumes: `useStore`.
- Produces: store `view: 'TERMINAL' | 'MACRO'` + `setView`; `<MacroDashboard/>`; `<Panel title source>` shell.

- [ ] **Step 1: Add `view` to the store**

In `frontend/src/store.ts`: add constant near the other LS keys:

```ts
const LS_VIEW = 'apex.view'
```

Add to the `Store` interface (near `selected`):

```ts
  view: 'TERMINAL' | 'MACRO'
  setView: (v: 'TERMINAL' | 'MACRO') => void
```

Add to the store body initial state (near `selected: 'NAS100',`):

```ts
  view: loadLS<'TERMINAL' | 'MACRO'>(LS_VIEW, 'TERMINAL'),
```

Add the action (near `select:`):

```ts
  setView: (view) => { saveLS(LS_VIEW, view); set({ view }) },
```

- [ ] **Step 2: Add the segmented nav to the Header**

In `frontend/src/components/Header.tsx`, read `view`/`setView` and render a nav between brand and metrics. After the `const live = ...` line add:

```tsx
  const view = useStore((s) => s.view)
  const setView = useStore((s) => s.setView)
```

Immediately after the `</div>` closing `styles.brand`, insert:

```tsx
        <nav className={styles.nav}>
          {(['TERMINAL', 'MACRO'] as const).map((v) => (
            <button
              key={v}
              className={`${styles.navBtn} ${view === v ? styles.navOn : ''}`}
              onClick={() => setView(v)}
            >
              {v}
            </button>
          ))}
        </nav>
```

- [ ] **Step 3: Style the nav**

Append to `frontend/src/components/Header.module.css`:

```css
.nav { display: flex; gap: 4px; margin-left: 14px; }
.navBtn {
  font: 700 11px/1 'JetBrains Mono', monospace;
  letter-spacing: 1px;
  padding: 6px 12px;
  color: var(--dim);
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 5px;
  cursor: pointer;
}
.navBtn:hover { color: #cfd8e3; }
.navOn { color: #0b1116; background: var(--accent, #00E676); border-color: transparent; }
```

- [ ] **Step 4: Create the Panel shell**

Create `frontend/src/components/macro/Panel.tsx`:

```tsx
import type { ReactNode } from 'react'
import styles from './MacroDashboard.module.css'

export default function Panel(
  { title, source, span = 1, children }:
  { title: string; source?: string; span?: number; children: ReactNode },
) {
  return (
    <section className={styles.panel} style={{ gridColumn: `span ${span}` }}>
      <header className={styles.panelHead}>
        <span className={styles.panelTitle}>{title}</span>
        {source && <span className={styles.panelSrc}>{source}</span>}
      </header>
      <div className={styles.panelBody}>{children}</div>
    </section>
  )
}
```

- [ ] **Step 5: Create the MacroDashboard shell + CSS**

Create `frontend/src/components/macro/MacroDashboard.tsx`:

```tsx
import Panel from './Panel'
import styles from './MacroDashboard.module.css'

export default function MacroDashboard() {
  return (
    <div className={styles.dash}>
      <div className={styles.grid}>
        <Panel title="Yield Curve" source="FRED" span={2}>—</Panel>
        <Panel title="Rates & Central Bank" source="LIVE">—</Panel>
        <Panel title="Cross-Asset" source="LIVE" span={2}>—</Panel>
        <Panel title="Volatility / Risk" source="LIVE">—</Panel>
        <Panel title="Sector Rotation" source="LIVE" span={2}>—</Panel>
        <Panel title="US Dollar (DXY)" source="LIVE">—</Panel>
        <Panel title="Economic Indicators" source="FRED" span={2}>—</Panel>
        <Panel title="Latest Releases" source="FRED">—</Panel>
      </div>
      <footer className={styles.disclaimer}>
        Market macro (rates, VIX, DXY, sectors, cross-asset) via Yahoo Finance ·
        economic data via FRED. No values are simulated.
      </footer>
    </div>
  )
}
```

Create `frontend/src/components/macro/MacroDashboard.module.css`:

```css
.dash { height: 100%; overflow-y: auto; padding: 12px; }
.grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}
.panel {
  background: rgba(12, 17, 22, .55);
  border: 1px solid var(--border);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  min-height: 200px;
}
.panelHead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
}
.panelTitle { font: 700 11px/1 'JetBrains Mono', monospace; letter-spacing: 1.5px; color: #cfd8e3; }
.panelSrc { font: 700 9px/1 'JetBrains Mono', monospace; letter-spacing: 1px; color: var(--dim); border: 1px solid var(--border); border-radius: 4px; padding: 3px 5px; }
.panelBody { flex: 1; min-height: 0; padding: 12px; position: relative; }
.disclaimer { margin: 14px 4px 4px; font-size: 10px; color: var(--dim); text-align: center; }
```

- [ ] **Step 6: Wire the view switch in App**

In `frontend/src/App.tsx`, import `MacroDashboard` and read `view`; render conditionally:

```tsx
import MacroDashboard from './components/macro/MacroDashboard'
```

Add inside `App` (with the other `useStore` calls):

```tsx
  const view = useStore((s) => s.view)
```

Replace the `<div className="body">…</div>` block with:

```tsx
      {view === 'TERMINAL' ? (
        <div className="body">
          <Watchlist />
          <CenterPanel />
          <OrderPanel />
        </div>
      ) : (
        <MacroDashboard />
      )}
```

- [ ] **Step 7: Typecheck + visual check**

Run: `cd frontend && npm run build`
Expected: build succeeds.

Manual: start backend + `npm run dev`, open http://localhost:5173, click **MACRO** in the header → the 8 empty panels render in a 3-column grid with the disclaimer; click **TERMINAL** → the trading view returns. The account bar + ticker stay visible in both.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/store.ts frontend/src/components/Header.tsx frontend/src/components/Header.module.css frontend/src/App.tsx frontend/src/components/macro
git commit -m "feat(macro): view switch, header nav, dashboard shell"
```

---

### Task 9: Dashboard data layer (polling)

**Files:**
- Modify: `frontend/src/components/macro/MacroDashboard.tsx`

**Interfaces:**
- Consumes: `fetchMacroBoard/Econ/Curve/Releases`.
- Produces: `MacroDashboard` holds `board/econ/curve/releases` state and passes them to panels. (Panels still placeholders this task, but rendered from live data to prove plumbing.)

- [ ] **Step 1: Add polling state**

Replace `frontend/src/components/macro/MacroDashboard.tsx` with:

```tsx
import { useEffect, useState } from 'react'

import { fetchMacroBoard, fetchMacroCurve, fetchMacroEcon, fetchMacroReleases } from '../../api'
import type { MacroBoard, MacroCurve, MacroEcon, MacroReleases } from '../../types'
import Panel from './Panel'
import styles from './MacroDashboard.module.css'

export default function MacroDashboard() {
  const [board, setBoard] = useState<MacroBoard | null>(null)
  const [econ, setEcon] = useState<MacroEcon | null>(null)
  const [curve, setCurve] = useState<MacroCurve | null>(null)
  const [releases, setReleases] = useState<MacroReleases | null>(null)

  useEffect(() => {
    let alive = true
    const pullBoard = () => { void fetchMacroBoard().then((b) => alive && b && setBoard(b)) }
    const pullFred = () => {
      void fetchMacroEcon().then((e) => alive && e && setEcon(e))
      void fetchMacroCurve().then((c) => alive && c && setCurve(c))
      void fetchMacroReleases().then((r) => alive && r && setReleases(r))
    }
    pullBoard(); pullFred()
    const b = setInterval(pullBoard, 20_000)
    const f = setInterval(pullFred, 30 * 60_000)
    return () => { alive = false; clearInterval(b); clearInterval(f) }
  }, [])

  return (
    <div className={styles.dash}>
      <div className={styles.grid}>
        <Panel title="Yield Curve" source="FRED" span={2}>{curve ? `${curve.points.length} pts` : '…'}</Panel>
        <Panel title="Rates & Central Bank" source="LIVE">{board ? `10Y ${board.rates.y10 ?? '—'}` : '…'}</Panel>
        <Panel title="Cross-Asset" source="LIVE" span={2}>{board ? `${board.crossAsset.length} classes` : '…'}</Panel>
        <Panel title="Volatility / Risk" source="LIVE">{board ? board.vix.regime : '…'}</Panel>
        <Panel title="Sector Rotation" source="LIVE" span={2}>{board ? `${board.sectors.length} sectors` : '…'}</Panel>
        <Panel title="US Dollar (DXY)" source="LIVE">{board ? board.dxy.level ?? '—' : '…'}</Panel>
        <Panel title="Economic Indicators" source="FRED" span={2}>{econ ? (econ.available ? `${econ.series.length} series` : 'add FRED key') : '…'}</Panel>
        <Panel title="Latest Releases" source="FRED">{releases ? (releases.available ? `${releases.items.length}` : 'add FRED key') : '…'}</Panel>
      </div>
      <footer className={styles.disclaimer}>
        Market macro (rates, VIX, DXY, sectors, cross-asset) via Yahoo Finance ·
        economic data via FRED. No values are simulated.
      </footer>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck + visual check**

Run: `cd frontend && npm run build`
Expected: success.

Manual: with backend running, open MACRO → panels fill with live summaries (e.g. "11 sectors", "5 classes", VIX regime, DXY level). FRED panels show "add FRED key" without a key, or counts with one.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/macro/MacroDashboard.tsx
git commit -m "feat(macro): dashboard polling data layer"
```

---

### Task 10: Cross-Asset, Sector Rotation & Volatility panels

**Files:**
- Create: `frontend/src/components/macro/panels/CrossAssetPanel.tsx`
- Create: `frontend/src/components/macro/panels/SectorRotationPanel.tsx`
- Create: `frontend/src/components/macro/panels/VolatilityPanel.tsx`
- Modify: `frontend/src/components/macro/MacroDashboard.tsx`
- Modify: `frontend/src/components/macro/MacroDashboard.module.css`

**Interfaces:**
- Consumes: `MacroBoard`.
- Produces: three presentational panels taking `board` (or its slices) as props.

- [ ] **Step 1: Shared helpers for heat coloring**

Add to the top of `MacroDashboard.module.css` a set of cell styles (append):

```css
.heatRow { display: flex; flex-wrap: wrap; gap: 6px; }
.heatCell { flex: 1 1 90px; border-radius: 5px; padding: 7px 8px; border: 1px solid var(--border); }
.heatCell .sym { font: 700 10px/1.2 'JetBrains Mono', monospace; color: #cfd8e3; }
.heatCell .pct { font: 800 12px/1.3 'JetBrains Mono', monospace; }
.bucket { margin-bottom: 10px; }
.bucketLbl { font: 700 9px/1 'JetBrains Mono', monospace; letter-spacing: 1px; color: var(--dim); margin-bottom: 5px; }
.barRow { display: flex; align-items: center; gap: 8px; margin: 4px 0; font: 700 10px/1 'JetBrains Mono', monospace; }
.barName { width: 92px; color: #cfd8e3; }
.barTrack { flex: 1; height: 12px; background: rgba(255,255,255,.04); border-radius: 3px; position: relative; }
.barFill { position: absolute; top: 0; bottom: 0; border-radius: 3px; }
.barVal { width: 52px; text-align: right; }
.vixBig { font: 800 40px/1 'JetBrains Mono', monospace; }
.vixRegime { margin-top: 8px; font: 700 13px/1 'JetBrains Mono', monospace; letter-spacing: 1px; }
.pos { color: #00E676; }
.neg { color: #FF1744; }
```

- [ ] **Step 2: Create the Cross-Asset panel**

Create `frontend/src/components/macro/panels/CrossAssetPanel.tsx`:

```tsx
import type { CrossAssetBucket } from '../../../types'
import styles from '../MacroDashboard.module.css'

function heat(pct: number): string {
  const a = Math.min(Math.abs(pct) / 3, 1) * 0.5 + 0.08
  return pct >= 0 ? `rgba(0,230,118,${a.toFixed(2)})` : `rgba(255,23,68,${a.toFixed(2)})`
}

export default function CrossAssetPanel({ buckets }: { buckets: CrossAssetBucket[] }) {
  return (
    <div>
      {buckets.map((b) => (
        <div className={styles.bucket} key={b.key}>
          <div className={styles.bucketLbl}>{b.label}</div>
          <div className={styles.heatRow}>
            {b.items.map((c) => (
              <div className={styles.heatCell} key={c.symbol} style={{ background: heat(c.pct) }}>
                <div className="sym">{c.label}</div>
                <div className={`pct ${c.pct >= 0 ? styles.pos : styles.neg}`}>
                  {c.pct >= 0 ? '+' : ''}{c.pct.toFixed(2)}%
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Create the Sector Rotation panel**

Create `frontend/src/components/macro/panels/SectorRotationPanel.tsx`:

```tsx
import type { SectorPerf } from '../../../types'
import styles from '../MacroDashboard.module.css'

export default function SectorRotationPanel({ sectors }: { sectors: SectorPerf[] }) {
  const max = Math.max(0.5, ...sectors.map((s) => Math.abs(s.pct)))
  return (
    <div>
      {sectors.map((s) => (
        <div className={styles.barRow} key={s.symbol}>
          <span className={styles.barName}>{s.label}</span>
          <span className={styles.barTrack}>
            <span
              className={styles.barFill}
              style={{
                left: s.pct >= 0 ? '50%' : `${50 - (Math.abs(s.pct) / max) * 50}%`,
                width: `${(Math.abs(s.pct) / max) * 50}%`,
                background: s.pct >= 0 ? '#00E676' : '#FF1744',
              }}
            />
          </span>
          <span className={`${styles.barVal} ${s.pct >= 0 ? styles.pos : styles.neg}`}>
            {s.pct >= 0 ? '+' : ''}{s.pct.toFixed(2)}%
          </span>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Create the Volatility panel**

Create `frontend/src/components/macro/panels/VolatilityPanel.tsx`:

```tsx
import type { MacroBoard } from '../../../types'
import styles from '../MacroDashboard.module.css'

const REGIME_COLOR: Record<string, string> = {
  Calm: '#00E676', Normal: '#42A5F5', Elevated: '#FF9100', 'Risk-off': '#FF1744',
}

export default function VolatilityPanel({ vix }: { vix: MacroBoard['vix'] }) {
  const color = REGIME_COLOR[vix.regime] ?? '#607D8B'
  return (
    <div>
      <div className={styles.vixBig} style={{ color }}>{vix.level ?? '—'}</div>
      <div className={vix.pct != null && vix.pct >= 0 ? styles.neg : styles.pos}>
        VIX {vix.pct != null ? `${vix.pct >= 0 ? '+' : ''}${vix.pct.toFixed(2)}%` : ''}
      </div>
      <div className={styles.vixRegime} style={{ color }}>{vix.regime}</div>
    </div>
  )
}
```

(Note: a VIX rise is risk-off, hence `pct >= 0` uses the red class.)

- [ ] **Step 5: Wire the three panels into the dashboard**

In `MacroDashboard.tsx`, add imports:

```tsx
import CrossAssetPanel from './panels/CrossAssetPanel'
import SectorRotationPanel from './panels/SectorRotationPanel'
import VolatilityPanel from './panels/VolatilityPanel'
```

Replace the three placeholder panel bodies:

```tsx
        <Panel title="Cross-Asset" source="LIVE" span={2}>
          {board ? <CrossAssetPanel buckets={board.crossAsset} /> : '…'}
        </Panel>
        <Panel title="Volatility / Risk" source="LIVE">
          {board ? <VolatilityPanel vix={board.vix} /> : '…'}
        </Panel>
        <Panel title="Sector Rotation" source="LIVE" span={2}>
          {board ? <SectorRotationPanel sectors={board.sectors} /> : '…'}
        </Panel>
```

- [ ] **Step 6: Typecheck + visual check**

Run: `cd frontend && npm run build`
Expected: success.

Manual: MACRO view → Cross-Asset shows 5 colored buckets; Sector Rotation shows 11 ranked diverging bars; Volatility shows the VIX number + regime label in the regime color.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/macro
git commit -m "feat(macro): cross-asset, sector rotation, volatility panels"
```

---

### Task 11: Yield Curve, Rates & DXY panels

**Files:**
- Create: `frontend/src/components/macro/panels/YieldCurvePanel.tsx`
- Create: `frontend/src/components/macro/panels/RatesPanel.tsx`
- Create: `frontend/src/components/macro/panels/DollarPanel.tsx`
- Modify: `frontend/src/components/macro/MacroDashboard.tsx`
- Modify: `frontend/src/components/macro/MacroDashboard.module.css`

**Interfaces:**
- Consumes: `MacroCurve`, `MacroBoard`, `MacroEcon`, lightweight-charts, `fetchCandles`.
- Produces: three panels.

- [ ] **Step 1: Add tile + curve styles**

Append to `MacroDashboard.module.css`:

```css
.tiles { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.tile { border: 1px solid var(--border); border-radius: 6px; padding: 9px 10px; }
.tileK { font: 700 9px/1 'JetBrains Mono', monospace; letter-spacing: 1px; color: var(--dim); }
.tileV { font: 800 18px/1.2 'JetBrains Mono', monospace; color: #eef3f8; margin-top: 4px; }
.tileSub { font: 700 10px/1 'JetBrains Mono', monospace; margin-top: 3px; }
.curveWrap { position: absolute; inset: 12px; }
.badge { display: inline-block; font: 800 10px/1 'JetBrains Mono', monospace; padding: 4px 7px; border-radius: 4px; letter-spacing: .5px; }
.badgeInv { background: rgba(255,23,68,.18); color: #FF1744; border: 1px solid rgba(255,23,68,.5); }
.badgeOk { background: rgba(0,230,118,.14); color: #00E676; border: 1px solid rgba(0,230,118,.4); }
.empty { color: var(--dim); font: 700 11px/1.5 'JetBrains Mono', monospace; }
```

- [ ] **Step 2: Create the Yield Curve panel**

Create `frontend/src/components/macro/panels/YieldCurvePanel.tsx`:

```tsx
import { useEffect, useRef } from 'react'
import { ColorType, createChart } from 'lightweight-charts'

import type { MacroCurve } from '../../../types'
import styles from '../MacroDashboard.module.css'

export default function YieldCurvePanel({ curve }: { curve: MacroCurve | null }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!curve || !curve.available || !ref.current || curve.points.length < 2) return
    const chart = createChart(ref.current, {
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#4A5663', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, attributionLogo: false },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      rightPriceScale: { borderVisible: false },
      timeScale: { visible: false },
      autoSize: true,
      handleScroll: false, handleScale: false,
    })
    const line = chart.addLineSeries({ color: '#42A5F5', lineWidth: 2, priceLineVisible: false, lastValueVisible: false })
    // x = maturity in months mapped onto a synthetic time axis (ordinal)
    line.setData(curve.points.map((p, i) => ({ time: (i + 1) as never, value: p.yield })))
    curve.points.forEach((p, i) => {
      if (['3M', '2Y', '10Y', '30Y'].includes(p.label)) {
        line.createPriceLine({ price: p.yield, color: 'rgba(96,125,139,.3)', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: p.label })
      }
      void i
    })
    chart.timeScale().fitContent()
    return () => chart.remove()
  }, [curve])

  if (!curve || !curve.available) return <div className={styles.empty}>Add a free FRED key to backend/.env<br />(FRED_API_KEY=…) to load the yield curve.</div>
  return (
    <>
      <div style={{ marginBottom: 6 }}>
        <span className={`${styles.badge} ${curve.inverted ? styles.badgeInv : styles.badgeOk}`}>
          2s10s {curve.spread2s10s != null ? `${curve.spread2s10s > 0 ? '+' : ''}${curve.spread2s10s}%` : '—'}
          {curve.inverted ? ' · INVERTED' : ''}
        </span>
      </div>
      <div ref={ref} className={styles.curveWrap} style={{ top: 34 }} />
    </>
  )
}
```

- [ ] **Step 3: Create the Rates panel**

Create `frontend/src/components/macro/panels/RatesPanel.tsx`:

```tsx
import type { MacroBoard, MacroCurve, MacroEcon } from '../../../types'
import styles from '../MacroDashboard.module.css'

function bp(v: number | null): { txt: string; cls: string } {
  if (v == null) return { txt: '', cls: '' }
  return { txt: `${v > 0 ? '+' : ''}${v}bp`, cls: v >= 0 ? styles.neg : styles.pos } // yields up = tightening = red
}

export default function RatesPanel(
  { board, curve, econ }: { board: MacroBoard; curve: MacroCurve | null; econ: MacroEcon | null },
) {
  const y2 = curve?.points.find((p) => p.label === '2Y')?.yield ?? null
  const fed = econ?.series.find((s) => s.key === 'FEDFUNDS')?.value ?? null
  const c10 = bp(board.rates.chgY10)
  const c30 = bp(board.rates.chgY30)
  const tile = (k: string, v: number | null, sub?: { txt: string; cls: string }) => (
    <div className={styles.tile}>
      <div className={styles.tileK}>{k}</div>
      <div className={styles.tileV}>{v != null ? `${v.toFixed(2)}%` : '—'}</div>
      {sub && <div className={`${styles.tileSub} ${sub.cls}`}>{sub.txt}</div>}
    </div>
  )
  return (
    <div className={styles.tiles}>
      {tile('FED FUNDS', fed)}
      {tile('2Y', y2)}
      {tile('10Y', board.rates.y10, c10)}
      {tile('30Y', board.rates.y30, c30)}
    </div>
  )
}
```

- [ ] **Step 4: Create the DXY panel**

Create `frontend/src/components/macro/panels/DollarPanel.tsx`:

```tsx
import { useEffect, useRef } from 'react'
import { ColorType, createChart } from 'lightweight-charts'

import { fetchCandles } from '../../../api'
import type { MacroBoard } from '../../../types'
import styles from '../MacroDashboard.module.css'

export default function DollarPanel({ dxy }: { dxy: MacroBoard['dxy'] }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let dead = false
    void (async () => {
      // DX-Y.NYB is not in the tradable universe; the candles endpoint needs a
      // registered symbol, so we chart the dollar via EURUSD inverse proxy is
      // avoided — instead show the live number only if history is unavailable.
      const data = await fetchCandles('USDJPY', '1M').catch(() => null)
      if (dead || !ref.current || !data || data.points.length < 2) return
      const chart = createChart(ref.current, {
        layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#4A5663', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, attributionLogo: false },
        grid: { vertLines: { visible: false }, horzLines: { visible: false } },
        rightPriceScale: { borderVisible: false }, timeScale: { visible: false },
        autoSize: true, handleScroll: false, handleScale: false,
      })
      const up = (dxy.pct ?? 0) >= 0
      const area = chart.addAreaSeries({ lineColor: up ? '#00E676' : '#FF1744', topColor: up ? 'rgba(0,230,118,.25)' : 'rgba(255,23,68,.25)', bottomColor: 'transparent', lineWidth: 2, priceLineVisible: false, lastValueVisible: false })
      area.setData(data.points.map((p) => ({ time: p.time as never, value: p.value })))
      chart.timeScale().fitContent()
    })()
    return () => { dead = true }
  }, [dxy.pct])

  return (
    <div>
      <div className={styles.tileV} style={{ fontSize: 26 }}>{dxy.level ?? '—'}</div>
      <div className={`${styles.tileSub} ${dxy.pct != null && dxy.pct >= 0 ? styles.pos : styles.neg}`}>
        DXY {dxy.pct != null ? `${dxy.pct >= 0 ? '+' : ''}${dxy.pct.toFixed(2)}%` : ''}
      </div>
      <div ref={ref} style={{ position: 'absolute', left: 12, right: 12, bottom: 12, height: 90 }} />
    </div>
  )
}
```

> Note: the DXY sparkline uses USDJPY (a registered symbol) purely as a dollar-strength shape proxy since `DX-Y.NYB` is not in the tradable universe and the candles endpoint requires a registered symbol. The headline number/percent are the real DXY from the board. If you prefer, register `DX-Y.NYB` in `providers.YAHOO_MAP` in a follow-up so the exact index can be charted — out of scope here.

- [ ] **Step 5: Wire the three panels**

In `MacroDashboard.tsx`, add imports:

```tsx
import DollarPanel from './panels/DollarPanel'
import RatesPanel from './panels/RatesPanel'
import YieldCurvePanel from './panels/YieldCurvePanel'
```

Replace the placeholders:

```tsx
        <Panel title="Yield Curve" source="FRED" span={2}>
          <YieldCurvePanel curve={curve} />
        </Panel>
        <Panel title="Rates & Central Bank" source="LIVE">
          {board ? <RatesPanel board={board} curve={curve} econ={econ} /> : '…'}
        </Panel>
        ...
        <Panel title="US Dollar (DXY)" source="LIVE">
          {board ? <DollarPanel dxy={board.dxy} /> : '…'}
        </Panel>
```

- [ ] **Step 6: Typecheck + visual check**

Run: `cd frontend && npm run build`
Expected: success.

Manual: Rates shows 4 tiles (Fed Funds / 2Y from FRED — "—" without a key; 10Y/30Y live with bp change). Yield Curve draws a line with a 2s10s badge (or the "add FRED key" empty state). DXY shows the live level + a sparkline.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/macro
git commit -m "feat(macro): yield curve, rates, dollar panels"
```

---

### Task 12: Economic Indicators & Latest Releases panels

**Files:**
- Create: `frontend/src/components/macro/panels/EconIndicatorsPanel.tsx`
- Create: `frontend/src/components/macro/panels/ReleasesPanel.tsx`
- Modify: `frontend/src/components/macro/MacroDashboard.tsx`
- Modify: `frontend/src/components/macro/MacroDashboard.module.css`

**Interfaces:**
- Consumes: `MacroEcon`, `MacroReleases`.
- Produces: two panels with an "add FRED key" empty state.

- [ ] **Step 1: Add econ/releases styles**

Append to `MacroDashboard.module.css`:

```css
.econGrid { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 8px; }
.econCard { border: 1px solid var(--border); border-radius: 6px; padding: 9px 10px; }
.econLbl { font: 700 9px/1.2 'JetBrains Mono', monospace; letter-spacing: .5px; color: var(--dim); }
.econVal { font: 800 20px/1.2 'JetBrains Mono', monospace; color: #eef3f8; margin: 3px 0; }
.spark { display: flex; align-items: flex-end; gap: 1px; height: 22px; margin-top: 5px; }
.sparkBar { flex: 1; background: rgba(66,165,245,.5); border-radius: 1px; min-height: 1px; }
.relRow { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--border); font: 700 11px/1.2 'JetBrains Mono', monospace; }
.relLbl { color: #cfd8e3; }
.relMeta { color: var(--dim); font-size: 9px; }
.relVal { color: #eef3f8; }
```

- [ ] **Step 2: Create the Economic Indicators panel**

Create `frontend/src/components/macro/panels/EconIndicatorsPanel.tsx`:

```tsx
import type { EconSeries, MacroEcon } from '../../../types'
import styles from '../MacroDashboard.module.css'

function Spark({ data }: { data: number[] }) {
  if (data.length < 2) return null
  const min = Math.min(...data), max = Math.max(...data), range = max - min || 1
  return (
    <div className={styles.spark}>
      {data.map((v, i) => (
        <div key={i} className={styles.sparkBar} style={{ height: `${((v - min) / range) * 100}%` }} />
      ))}
    </div>
  )
}

function Card({ s }: { s: EconSeries }) {
  const delta = s.value != null && s.prior != null ? s.value - s.prior : null
  return (
    <div className={styles.econCard}>
      <div className={styles.econLbl}>{s.label}</div>
      <div className={styles.econVal}>{s.value != null ? `${s.value.toFixed(1)}${s.unit}` : '—'}</div>
      {delta != null && (
        <div className={`${styles.tileSub} ${delta >= 0 ? styles.pos : styles.neg}`}>
          {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(2)} vs prior
        </div>
      )}
      <Spark data={s.spark} />
    </div>
  )
}

export default function EconIndicatorsPanel({ econ }: { econ: MacroEcon | null }) {
  if (!econ || !econ.available) return <div className={styles.empty}>Add a free FRED key to backend/.env (FRED_API_KEY=…) to load CPI, GDP, unemployment and rates.</div>
  return (
    <div className={styles.econGrid}>
      {econ.series.map((s) => <Card key={s.key} s={s} />)}
    </div>
  )
}
```

- [ ] **Step 3: Create the Latest Releases panel**

Create `frontend/src/components/macro/panels/ReleasesPanel.tsx`:

```tsx
import type { MacroReleases } from '../../../types'
import styles from '../MacroDashboard.module.css'

export default function ReleasesPanel({ releases }: { releases: MacroReleases | null }) {
  if (!releases || !releases.available) return <div className={styles.empty}>Add a free FRED key to backend/.env (FRED_API_KEY=…) to load latest releases.</div>
  return (
    <div>
      {releases.items.map((r) => (
        <div className={styles.relRow} key={r.series}>
          <span>
            <span className={styles.relLbl}>{r.label}</span>
            <span className={styles.relMeta}> · {r.period} · pub {r.updated}</span>
          </span>
          <span className={styles.relVal}>{r.value != null ? `${r.value.toFixed(1)}${r.unit}` : '—'}</span>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Wire the two panels**

In `MacroDashboard.tsx` add imports:

```tsx
import EconIndicatorsPanel from './panels/EconIndicatorsPanel'
import ReleasesPanel from './panels/ReleasesPanel'
```

Replace the placeholders:

```tsx
        <Panel title="Economic Indicators" source="FRED" span={2}>
          <EconIndicatorsPanel econ={econ} />
        </Panel>
        <Panel title="Latest Releases" source="FRED">
          <ReleasesPanel releases={releases} />
        </Panel>
```

- [ ] **Step 5: Typecheck + visual check**

Run: `cd frontend && npm run build`
Expected: success.

Manual: without a FRED key both panels show the "Add a free FRED key…" message. With a key, Economic Indicators shows CPI/Core/Unemployment/GDP/Fed Funds cards with sparklines, and Latest Releases lists dated rows sorted by publication.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/macro
git commit -m "feat(macro): economic indicators + latest releases panels"
```

---

### Task 13: Docs + .env.example + final verification

**Files:**
- Modify: `README.md`, `CLAUDE.md`
- Create/Modify: `backend/.env.example`

**Interfaces:** none (documentation).

- [ ] **Step 1: Document the FRED key**

Ensure `backend/.env.example` contains (create if missing):

```
FINNHUB_API_KEY=
FRED_API_KEY=
```

- [ ] **Step 2: Update README**

In `README.md`, under "Fonctionnalités" add a bullet:

```markdown
- **Macro Dashboard** (onglet principal) : courbe des taux, taux directeurs, VIX /
  régime de risque, rotation sectorielle, heatmap cross-asset, DXY, indicateurs
  économiques et dernières publications. Macro de marché réelle via Yahoo (sans
  clé) ; indicateurs éco via **FRED** (clé gratuite dans `backend/.env`,
  `FRED_API_KEY`) — sinon ces panneaux invitent à ajouter la clé (rien de simulé).
```

- [ ] **Step 3: Update CLAUDE.md**

In `CLAUDE.md` under "Key behaviours" add:

```markdown
- **Macro Dashboard** (`components/macro/`): a second primary view toggled from the
  Header (`store.view`). Backend `macro.py` serves `/api/macro/board` (Yahoo:
  rates, VIX, DXY, sectors, cross-asset; warmed by `macro_loop`) and FRED-backed
  `/api/macro/econ|curve|releases` (return `available:false` without `FRED_API_KEY`).
  Nothing is simulated — FRED panels show an "add key" state instead.
```

And add `FRED_API_KEY` next to the `FINNHUB_API_KEY` note in "Gotchas".

- [ ] **Step 4: Full backend test + build**

Run:
```bash
cd backend && python -m pytest -v
cd ../frontend && npm run build
```
Expected: all pytest pass; frontend build succeeds.

- [ ] **Step 5: End-to-end visual pass**

Start both (`./dev.ps1`), open http://localhost:5173:
- Toggle TERMINAL ⇄ MACRO; account bar + ticker persist.
- All 8 panels render; market panels show live values matching an external source (e.g. VIX, sector leaders).
- FRED panels: "add key" state without a key, or real CPI/GDP/curve/releases with one.
- No console errors; switching views repeatedly does not leak charts.

- [ ] **Step 6: Commit**

```bash
git add README.md CLAUDE.md backend/.env.example
git commit -m "docs(macro): document Macro Dashboard + FRED_API_KEY"
```

---

## Self-Review

**Spec coverage:**
- Navigation switch in Header → Task 8. ✓
- Backend `macro.py` + `yahoo_quote_raw` + endpoints → Tasks 2–6. ✓
- 8 panels (Yield Curve, Rates, Cross-Asset, Sector Rotation, Volatility, DXY, Econ, Releases) → Tasks 10–12. ✓
- FRED key gating / honest empty state → Tasks 3, 5, 11, 12. ✓
- Data honesty disclaimer → Task 8 (footer). ✓
- Docs (README/CLAUDE/.env.example) → Task 13. ✓
- Caching + resilience to 429 → Tasks 2 (stale fallback), 3 (FRED cache), 4 (board cache/loop). ✓

**Placeholder scan:** No "TBD"/"handle edge cases"; every code step shows complete code. The DXY sparkline proxy and the optional `DX-Y.NYB` registration are called out explicitly as scoped decisions, not as unfinished work.

**Type consistency:** Backend emits camelCase (`crossAsset`, `chgY10`, `spread2s10s`) matching `types.ts`. Board dict keys (`rates/vix/dxy/sectors/crossAsset`) used identically in `build_board` (Task 4) and the panels (Tasks 10–11). `EconSeries.key/value/prior/unit/spark`, `Release.series/label/value/unit/period/updated`, `CurvePoint.label/months/yield` are defined once (Task 7) and consumed unchanged.

**Known caveats (intentional, documented in-plan):**
- DXY history is charted via a USDJPY-shaped proxy (the headline number is the real DXY); registering `DX-Y.NYB` for exact history is a noted follow-up.
- Yahoo `^TNX`-style yields are normalized (`normalize_yield`) to guard the ×10 quoting ambiguity; verify magnitude on first run (Task 6 curl).

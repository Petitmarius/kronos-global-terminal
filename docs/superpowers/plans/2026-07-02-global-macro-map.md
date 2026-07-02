# Global Macro Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a third primary view — an interactive dark world map that layers real financial (equity indices), macro (World Bank), and geopolitical (country-tagged news) data.

**Architecture:** `store.view` gains `'GLOBAL'`; `App` renders a new `GlobalMap`. A new backend `globe.py` module + REST endpoints serve a markets board (Yahoo), per-country detail (Yahoo + World Bank + filtered news), and news-derived geopolitical hotspots. The map is a `react-simple-maps` choropleth with a togglable hotspot-bubble overlay and a client-side world session clock.

**Tech Stack:** FastAPI + urllib + numpy (backend), React 18 + TypeScript + Zustand + `react-simple-maps` + `world-atlas` topojson (frontend), pytest.

## Global Constraints

- Python 3.14 / Node 24. Backend HTTP via stdlib `urllib` (match `providers.py`/`macro.py`).
- Keyless-first: markets (Yahoo) and macro (World Bank) need no key; geopolitical reuses the existing news feed. **Never fabricate** — World Bank values show their year; a country with no data shows an explicit empty state.
- Backend JSON keys are **camelCase** to match frontend types.
- Frontend new deps: `react-simple-maps`, `world-atlas`, `@types/react-simple-maps` (dev). No other runtime deps.
- Reuse `COLORS` and CSS tokens (`--border`, `--dim`). Frontend "test" = `cd frontend && npm run build` passes + described visual check.
- Yahoo/World Bank may fail/rate-limit; every fetch falls back to last cache or an empty/omitted entry without crashing.
- Data honesty labels: macro = "World Bank (annual, <year>)"; geopolitical = "countries in current market news"; sessions = "regular hours, holidays excluded".

## File Structure

**Backend**
- `backend/globe.py` — CREATE: `GLOBE_MARKETS` + `NEWS_COUNTRIES` registries; pure helpers (`_wb_latest`, `build_globe_markets`, `news_hotspots`, `_country_news`); I/O (`world_bank_macro`, `fetch_globe_markets`, `build_country`, `build_geo`) + caches.
- `backend/main.py` — MODIFY: 3 routes + `globe_loop` in lifespan.
- `backend/tests/test_globe.py` — CREATE: unit tests for pure helpers.

**Frontend**
- `frontend/package.json` — MODIFY: deps.
- `frontend/src/types.ts` — MODIFY: globe types.
- `frontend/src/api.ts` — MODIFY: globe fetchers.
- `frontend/src/store.ts` — MODIFY: `view` union + `'GLOBAL'`.
- `frontend/src/components/Header.tsx` — MODIFY: 3-way nav.
- `frontend/src/App.tsx` — MODIFY: render `GlobalMap` when `view==='GLOBAL'`.
- `frontend/src/components/globe/GlobalMap.tsx` (+ `.module.css`) — CREATE: orchestration + polling + layout.
- `frontend/src/components/globe/WorldMap.tsx` — CREATE: choropleth + hotspot markers.
- `frontend/src/components/globe/CountryPanel.tsx` — CREATE: detail drawer.
- `frontend/src/components/globe/SessionClock.tsx` — CREATE: open-markets strip.
- `frontend/src/components/globe/MapLegend.tsx` — CREATE: colour scale + layer toggle.
- `frontend/src/geo/countries.ts` — CREATE: numeric-ISO → iso2 join map for the mapped countries.

**Docs**
- `README.md`, `CLAUDE.md` — MODIFY.

---

### Task 1: Globe registries + World Bank macro

**Files:**
- Create: `backend/globe.py`
- Create: `backend/tests/test_globe.py`

**Interfaces:**
- Produces:
  - `GLOBE_MARKETS: list[dict]` — each `{"iso","num","name","index","fx","invFx"}`.
  - `_wb_latest(payload) -> tuple[float|None, str|None]` — from a World Bank `[meta, rows]` JSON payload (rows newest-first), the latest non-null `(value, year)`.
  - `world_bank_macro(iso: str) -> dict` — `{"gdp","inflation","unemployment","year"}` (values `float|None`), or `{"available": False}` when nothing resolves.

- [ ] **Step 1: Write the failing test for `_wb_latest`**

Create `backend/tests/test_globe.py`:

```python
import globe


def test_wb_latest_picks_newest_non_null():
    payload = [
        {"page": 1, "total": 3},
        [
            {"date": "2025", "value": None},
            {"date": "2024", "value": 2.5},
            {"date": "2023", "value": 1.9},
        ],
    ]
    assert globe._wb_latest(payload) == (2.5, "2024")


def test_wb_latest_empty():
    assert globe._wb_latest([{"page": 1}, []]) == (None, None)
    assert globe._wb_latest(None) == (None, None)
```

- [ ] **Step 2: Run it, expect failure**

Run: `cd backend && python -m pytest tests/test_globe.py -q`
Expected: FAIL (module `globe` not found / no `_wb_latest`).

- [ ] **Step 3: Implement `globe.py` registry + World Bank**

Create `backend/globe.py`:

```python
"""Global Macro Map data layer: markets board, per-country detail (Yahoo +
World Bank + news), and news-derived geopolitical hotspots. All real data."""
from __future__ import annotations

import time
import urllib.parse

import providers

# iso2, ISO numeric (int, for topojson join), display name, Yahoo index,
# Yahoo FX pair vs USD (or None), invFx=True when pair is USD-quoted (USDxxx).
GLOBE_MARKETS = [
    {"iso": "US", "num": 840, "name": "United States", "index": "^GSPC", "fx": None, "invFx": False},
    {"iso": "CA", "num": 124, "name": "Canada", "index": "^GSPTSE", "fx": "USDCAD=X", "invFx": True},
    {"iso": "BR", "num": 76, "name": "Brazil", "index": "^BVSP", "fx": "USDBRL=X", "invFx": True},
    {"iso": "MX", "num": 484, "name": "Mexico", "index": "^MXX", "fx": "USDMXN=X", "invFx": True},
    {"iso": "GB", "num": 826, "name": "United Kingdom", "index": "^FTSE", "fx": "GBPUSD=X", "invFx": False},
    {"iso": "DE", "num": 276, "name": "Germany", "index": "^GDAXI", "fx": "EURUSD=X", "invFx": False},
    {"iso": "FR", "num": 250, "name": "France", "index": "^FCHI", "fx": "EURUSD=X", "invFx": False},
    {"iso": "ES", "num": 724, "name": "Spain", "index": "^IBEX", "fx": "EURUSD=X", "invFx": False},
    {"iso": "IT", "num": 380, "name": "Italy", "index": "FTSEMIB.MI", "fx": "EURUSD=X", "invFx": False},
    {"iso": "CH", "num": 756, "name": "Switzerland", "index": "^SSMI", "fx": "USDCHF=X", "invFx": True},
    {"iso": "NL", "num": 528, "name": "Netherlands", "index": "^AEX", "fx": "EURUSD=X", "invFx": False},
    {"iso": "JP", "num": 392, "name": "Japan", "index": "^N225", "fx": "USDJPY=X", "invFx": True},
    {"iso": "CN", "num": 156, "name": "China", "index": "000001.SS", "fx": "USDCNY=X", "invFx": True},
    {"iso": "HK", "num": 344, "name": "Hong Kong", "index": "^HSI", "fx": "USDHKD=X", "invFx": True},
    {"iso": "IN", "num": 356, "name": "India", "index": "^BSESN", "fx": "USDINR=X", "invFx": True},
    {"iso": "KR", "num": 410, "name": "South Korea", "index": "^KS11", "fx": "USDKRW=X", "invFx": True},
    {"iso": "TW", "num": 158, "name": "Taiwan", "index": "^TWII", "fx": "USDTWD=X", "invFx": True},
    {"iso": "AU", "num": 36, "name": "Australia", "index": "^AXJO", "fx": "AUDUSD=X", "invFx": False},
    {"iso": "SG", "num": 702, "name": "Singapore", "index": "^STI", "fx": "USDSGD=X", "invFx": True},
    {"iso": "ID", "num": 360, "name": "Indonesia", "index": "^JKSE", "fx": "USDIDR=X", "invFx": True},
    {"iso": "TR", "num": 792, "name": "Turkey", "index": "XU100.IS", "fx": "USDTRY=X", "invFx": True},
    {"iso": "ZA", "num": 710, "name": "South Africa", "index": "^J203.JO", "fx": "USDZAR=X", "invFx": True},
]

_WB_BASE = "https://api.worldbank.org/v2"
_WB_INDICATORS = {"gdp": "NY.GDP.MKTP.KD.ZG", "inflation": "FP.CPI.TOTL.ZG", "unemployment": "SL.UEM.TOTL.ZS"}
_wb_cache: dict[str, tuple[float, dict]] = {}
_WB_TTL = 24 * 3600.0


def _wb_latest(payload) -> tuple[float | None, str | None]:
    """From a World Bank [meta, rows] payload (rows newest-first) -> (value, year)."""
    if not payload or not isinstance(payload, list) or len(payload) < 2 or not payload[1]:
        return None, None
    for row in payload[1]:
        v = row.get("value")
        if v is not None:
            return float(v), row.get("date")
    return None, None


def world_bank_macro(iso: str) -> dict:
    now = time.time()
    if iso in _wb_cache and now - _wb_cache[iso][0] < _WB_TTL:
        return _wb_cache[iso][1]
    out: dict = {"gdp": None, "inflation": None, "unemployment": None, "year": None}
    got = False
    for key, ind in _WB_INDICATORS.items():
        url = f"{_WB_BASE}/country/{iso}/indicator/{ind}?format=json&per_page=8&mrv=8"
        try:
            payload = providers._get(url)
        except Exception:  # noqa: BLE001
            continue
        val, year = _wb_latest(payload)
        if val is not None:
            out[key] = round(val, 2)
            out["year"] = out["year"] or year
            got = True
    out = out if got else {"available": False}
    _wb_cache[iso] = (now, out)
    return out
```

- [ ] **Step 4: Run tests, expect pass**

Run: `cd backend && python -m pytest tests/test_globe.py -q`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/globe.py backend/tests/test_globe.py
git commit -m "feat(globe): market registry + World Bank macro"
```

---

### Task 2: Markets board (Yahoo)

**Files:**
- Modify: `backend/globe.py`
- Modify: `backend/tests/test_globe.py`

**Interfaces:**
- Consumes: `GLOBE_MARKETS`, `providers.yahoo_quote_raw`.
- Produces:
  - `build_globe_markets(quotes: dict[str, dict]) -> dict` — pure: from `{index_symbol: quote}` → `{"updated": int, "countries": [{iso,name,index,level,pct}]}` (only countries whose index is present).
  - `fetch_globe_markets() -> dict` — I/O: fills quotes via `yahoo_quote_raw`, caches ~20s.

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_globe.py`:

```python
def test_build_globe_markets_shape():
    quotes = {c["index"]: {"price": 100.0, "prevClose": 99.0, "pct": 1.01,
                           "open": None, "high": None, "low": None}
              for c in globe.GLOBE_MARKETS}
    b = globe.build_globe_markets(quotes)
    assert "updated" in b and len(b["countries"]) == len(globe.GLOBE_MARKETS)
    us = next(c for c in b["countries"] if c["iso"] == "US")
    assert us["index"] == "^GSPC" and us["pct"] == 1.01 and us["level"] == 100.0

def test_build_globe_markets_omits_missing():
    b = globe.build_globe_markets({})
    assert b["countries"] == []
```

- [ ] **Step 2: Run it, expect failure**

Run: `cd backend && python -m pytest tests/test_globe.py -k globe_markets -q`
Expected: FAIL (no `build_globe_markets`).

- [ ] **Step 3: Implement**

Add to `backend/globe.py`:

```python
_markets_cache: tuple[float, dict] | None = None
_MK_TTL = 20.0


def build_globe_markets(quotes: dict[str, dict]) -> dict:
    countries = []
    for c in GLOBE_MARKETS:
        q = quotes.get(c["index"])
        if not q:
            continue
        countries.append({"iso": c["iso"], "num": c["num"], "name": c["name"],
                          "index": c["index"], "level": round(q["price"], 2),
                          "pct": round(q["pct"], 2)})
    return {"updated": int(time.time() * 1000), "countries": countries}


def fetch_globe_markets() -> dict:
    global _markets_cache
    now = time.time()
    if _markets_cache and now - _markets_cache[0] < _MK_TTL:
        return _markets_cache[1]
    quotes: dict[str, dict] = {}
    for c in GLOBE_MARKETS:
        q = providers.yahoo_quote_raw(c["index"])
        if q:
            quotes[c["index"]] = q
    board = build_globe_markets(quotes)
    _markets_cache = (now, board)
    return board
```

- [ ] **Step 4: Run tests, expect pass**

Run: `cd backend && python -m pytest tests/test_globe.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/globe.py backend/tests/test_globe.py
git commit -m "feat(globe): markets board from Yahoo quotes"
```

---

### Task 3: News-derived geopolitical hotspots

**Files:**
- Modify: `backend/globe.py`
- Modify: `backend/tests/test_globe.py`

**Interfaces:**
- Consumes: `macro.fetch_news` (existing: returns `{"items": [{"headline","url","source","datetime","impact",...}]}`).
- Produces:
  - `NEWS_COUNTRIES: list[dict]` — `{"iso","name","lat","lon","aliases":[...]}`.
  - `news_hotspots(items: list[dict]) -> list[dict]` — pure: count items whose headline word-matches a country alias → `[{iso,name,lat,lon,count,headline}]` sorted by count desc.
  - `build_geo() -> dict` — I/O: `{"available": bool, "points": [...]}` from `macro.fetch_news()`.

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_globe.py`:

```python
def test_news_hotspots_counts_and_samples():
    items = [
        {"headline": "China tightens chip export rules", "datetime": 3},
        {"headline": "US and China resume trade talks", "datetime": 2},
        {"headline": "Ukraine grain deal stalls", "datetime": 1},
        {"headline": "Local bakery news", "datetime": 0},
    ]
    pts = globe.news_hotspots(items)
    by = {p["iso"]: p for p in pts}
    assert by["CN"]["count"] == 2
    assert by["US"]["count"] == 1
    assert by["CN"]["headline"] == "China tightens chip export rules"  # newest sample
    assert "UA" in by and all(k in by["CN"] for k in ("lat", "lon", "name"))

def test_news_hotspots_word_boundary():
    # "usa" substring must not trigger on "cause"; "US" matches its alias set only as a word
    pts = globe.news_hotspots([{"headline": "This caused a stir", "datetime": 0}])
    assert pts == []
```

- [ ] **Step 2: Run it, expect failure**

Run: `cd backend && python -m pytest tests/test_globe.py -k hotspots -q`
Expected: FAIL (no `news_hotspots`).

- [ ] **Step 3: Implement**

Add to `backend/globe.py` (add `import re` and `import macro` at the top of the file):

```python
# name -> centroid + match aliases (word-boundary, case-insensitive)
NEWS_COUNTRIES = [
    {"iso": "US", "name": "United States", "lat": 39.0, "lon": -98.0, "aliases": ["US", "USA", "U.S.", "United States", "America", "American", "Fed", "Washington"]},
    {"iso": "CN", "name": "China", "lat": 35.0, "lon": 103.0, "aliases": ["China", "Chinese", "Beijing", "PBOC"]},
    {"iso": "JP", "name": "Japan", "lat": 36.0, "lon": 138.0, "aliases": ["Japan", "Japanese", "Tokyo", "BOJ"]},
    {"iso": "GB", "name": "United Kingdom", "lat": 54.0, "lon": -2.0, "aliases": ["UK", "Britain", "British", "England", "London", "BoE"]},
    {"iso": "DE", "name": "Germany", "lat": 51.0, "lon": 10.0, "aliases": ["Germany", "German", "Berlin"]},
    {"iso": "FR", "name": "France", "lat": 46.0, "lon": 2.0, "aliases": ["France", "French", "Paris"]},
    {"iso": "RU", "name": "Russia", "lat": 61.0, "lon": 90.0, "aliases": ["Russia", "Russian", "Moscow", "Kremlin", "Putin"]},
    {"iso": "UA", "name": "Ukraine", "lat": 49.0, "lon": 32.0, "aliases": ["Ukraine", "Ukrainian", "Kyiv", "Kiev"]},
    {"iso": "IN", "name": "India", "lat": 22.0, "lon": 79.0, "aliases": ["India", "Indian", "Mumbai", "RBI"]},
    {"iso": "BR", "name": "Brazil", "lat": -10.0, "lon": -55.0, "aliases": ["Brazil", "Brazilian", "Brasilia"]},
    {"iso": "IL", "name": "Israel", "lat": 31.0, "lon": 35.0, "aliases": ["Israel", "Israeli", "Tel Aviv", "Gaza"]},
    {"iso": "IR", "name": "Iran", "lat": 32.0, "lon": 53.0, "aliases": ["Iran", "Iranian", "Tehran"]},
    {"iso": "SA", "name": "Saudi Arabia", "lat": 24.0, "lon": 45.0, "aliases": ["Saudi", "Saudi Arabia", "Riyadh", "OPEC"]},
    {"iso": "KR", "name": "South Korea", "lat": 36.5, "lon": 128.0, "aliases": ["South Korea", "Korean", "Seoul"]},
    {"iso": "KP", "name": "North Korea", "lat": 40.0, "lon": 127.0, "aliases": ["North Korea", "Pyongyang"]},
    {"iso": "TW", "name": "Taiwan", "lat": 23.7, "lon": 121.0, "aliases": ["Taiwan", "Taiwanese", "Taipei", "TSMC"]},
    {"iso": "TR", "name": "Turkey", "lat": 39.0, "lon": 35.0, "aliases": ["Turkey", "Turkish", "Ankara", "Erdogan"]},
    {"iso": "CA", "name": "Canada", "lat": 56.0, "lon": -106.0, "aliases": ["Canada", "Canadian", "Ottawa"]},
    {"iso": "MX", "name": "Mexico", "lat": 23.0, "lon": -102.0, "aliases": ["Mexico", "Mexican"]},
    {"iso": "AU", "name": "Australia", "lat": -25.0, "lon": 133.0, "aliases": ["Australia", "Australian", "Sydney", "RBA"]},
]
_geo_cache: tuple[float, dict] | None = None
_GEO_TTL = 300.0


def news_hotspots(items: list[dict]) -> list[dict]:
    acc: dict[str, dict] = {}
    for it in items:
        head = it.get("headline") or ""
        low = head.lower()
        for c in NEWS_COUNTRIES:
            if any(re.search(rf"\b{re.escape(a.lower())}\b", low) for a in c["aliases"]):
                cur = acc.get(c["iso"])
                if not cur:
                    cur = {"iso": c["iso"], "name": c["name"], "lat": c["lat"],
                           "lon": c["lon"], "count": 0, "headline": head, "_ts": it.get("datetime", 0)}
                    acc[c["iso"]] = cur
                cur["count"] += 1
                if it.get("datetime", 0) >= cur["_ts"]:  # keep newest sample headline
                    cur["_ts"] = it.get("datetime", 0)
                    cur["headline"] = head
    pts = sorted(acc.values(), key=lambda p: p["count"], reverse=True)
    for p in pts:
        p.pop("_ts", None)
    return pts


def build_geo() -> dict:
    global _geo_cache
    now = time.time()
    if _geo_cache and now - _geo_cache[0] < _GEO_TTL:
        return _geo_cache[1]
    news = macro.fetch_news()
    pts = news_hotspots(news.get("items", []))
    out = {"available": bool(pts), "points": pts}
    _geo_cache = (now, out)
    return out
```

- [ ] **Step 4: Run tests, expect pass**

Run: `cd backend && python -m pytest tests/test_globe.py -q`
Expected: PASS. (Note: `test_news_hotspots_word_boundary` relies on `\bus\b` etc. not matching "caused" — the alias "US" lowercased is "us"; `\bus\b` does not match inside "caused", good.)

- [ ] **Step 5: Commit**

```bash
git add backend/globe.py backend/tests/test_globe.py
git commit -m "feat(globe): news-derived geopolitical hotspots"
```

---

### Task 4: Country detail assembly

**Files:**
- Modify: `backend/globe.py`
- Modify: `backend/tests/test_globe.py`

**Interfaces:**
- Consumes: `GLOBE_MARKETS`, `providers.yahoo_quote_raw`, `providers.yahoo_candles_raw`, `world_bank_macro`, `macro.fetch_news`, `NEWS_COUNTRIES`.
- Produces:
  - `_country_news(iso: str, items: list[dict], limit: int = 6) -> list[dict]` — pure: news items whose headline matches that country's aliases (from `NEWS_COUNTRIES`), newest first, trimmed to `{headline,url,source,datetime}`.
  - `build_country(iso: str) -> dict | None` — I/O: full detail dict, or `None` if `iso` unknown.

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_globe.py`:

```python
def test_country_news_filters_and_trims():
    items = [
        {"headline": "Germany bond sale", "url": "u1", "source": "s", "datetime": 2, "impact": "high"},
        {"headline": "France budget vote", "url": "u2", "source": "s", "datetime": 1, "impact": "low"},
    ]
    out = globe._country_news("DE", items)
    assert len(out) == 1 and out[0]["headline"] == "Germany bond sale"
    assert set(out[0]) == {"headline", "url", "source", "datetime"}

def test_country_news_unknown_iso_empty():
    assert globe._country_news("ZZ", [{"headline": "x", "datetime": 0}]) == []
```

- [ ] **Step 2: Run it, expect failure**

Run: `cd backend && python -m pytest tests/test_globe.py -k country_news -q`
Expected: FAIL (no `_country_news`).

- [ ] **Step 3: Implement**

Add to `backend/globe.py`:

```python
_country_cache: dict[str, tuple[float, dict]] = {}
_COUNTRY_TTL = 300.0
_NEWS_BY_ISO = {c["iso"]: c for c in NEWS_COUNTRIES}


def _country_news(iso: str, items: list[dict], limit: int = 6) -> list[dict]:
    c = _NEWS_BY_ISO.get(iso)
    if not c:
        return []
    pats = [re.compile(rf"\b{re.escape(a.lower())}\b") for a in c["aliases"]]
    hits = [it for it in items if any(p.search((it.get("headline") or "").lower()) for p in pats)]
    hits.sort(key=lambda it: it.get("datetime", 0), reverse=True)
    return [{"headline": it.get("headline"), "url": it.get("url"),
             "source": it.get("source"), "datetime": it.get("datetime", 0)} for it in hits[:limit]]


def build_country(iso: str) -> dict | None:
    meta = next((c for c in GLOBE_MARKETS if c["iso"] == iso), None)
    if not meta:
        return None
    now = time.time()
    if iso in _country_cache and now - _country_cache[iso][0] < _COUNTRY_TTL:
        return _country_cache[iso][1]

    q = providers.yahoo_quote_raw(meta["index"])
    candles = providers.yahoo_candles_raw(meta["index"], "1M")
    index = {"symbol": meta["index"],
             "level": round(q["price"], 2) if q else None,
             "pct": round(q["pct"], 2) if q else None,
             "points": (candles or {}).get("points", [])}
    fx = None
    if meta["fx"]:
        fq = providers.yahoo_quote_raw(meta["fx"])
        if fq:
            lvl = 1.0 / fq["price"] if meta["invFx"] and fq["price"] else fq["price"]
            fx = {"pair": meta["fx"], "level": round(lvl, 4), "pct": round(fq["pct"], 2)}
    macro_data = world_bank_macro(iso)
    news = _country_news(iso, macro.fetch_news().get("items", []))
    out = {"iso": iso, "name": meta["name"], "index": index, "fx": fx,
           "macro": macro_data, "news": news}
    _country_cache[iso] = (now, out)
    return out
```

- [ ] **Step 4: Run tests, expect pass**

Run: `cd backend && python -m pytest tests/test_globe.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/globe.py backend/tests/test_globe.py
git commit -m "feat(globe): per-country detail assembly"
```

---

### Task 5: FastAPI routes + warm-up loop

**Files:**
- Modify: `backend/main.py`

**Interfaces:**
- Consumes: `globe.fetch_globe_markets`, `globe.build_country`, `globe.build_geo`.
- Produces: `GET /api/globe/markets`, `/api/globe/country/{iso}`, `/api/globe/geo`; `globe_loop`.

- [ ] **Step 1: Add import and routes**

In `backend/main.py`, add `import globe` beside `import macro`. Add after the macro routes:

```python
@app.get("/api/globe/markets")
async def globe_markets():
    return await asyncio.to_thread(globe.fetch_globe_markets)


@app.get("/api/globe/geo")
async def globe_geo():
    return await asyncio.to_thread(globe.build_geo)


@app.get("/api/globe/country/{iso}")
async def globe_country(iso: str):
    data = await asyncio.to_thread(globe.build_country, iso.upper())
    if data is None:
        raise HTTPException(404, f"Unknown country {iso}")
    return data
```

- [ ] **Step 2: Add the warm-up loop and register it**

In `backend/main.py`, above `lifespan`:

```python
async def globe_loop() -> None:
    while True:
        try:
            await asyncio.to_thread(globe.fetch_globe_markets)
        except Exception:  # noqa: BLE001
            pass
        await asyncio.sleep(30)
```

Add `asyncio.create_task(globe_loop()),` to the `tasks` list in `lifespan`.

- [ ] **Step 3: Verify boot + endpoints**

Run:
```bash
cd backend && python -c "import main; print('import ok')"
```
Expected: `import ok`.

Then (kill any zombie first with `Get-Process python | Stop-Process -Force`):
```bash
cd backend && python -m uvicorn main:app --port 8000 &
sleep 10
curl -s http://localhost:8000/api/globe/markets | python -c "import sys,json;d=json.load(sys.stdin);print('countries',len(d['countries']));[print(' ',c['iso'],c['index'],c['pct']) for c in d['countries']]"
curl -s http://localhost:8000/api/globe/country/US | python -c "import sys,json;d=json.load(sys.stdin);print('US index',d['index']['level'],'macro',d['macro'])"
curl -s http://localhost:8000/api/globe/geo | python -c "import sys,json;d=json.load(sys.stdin);print('geo',d['available'],len(d['points']))"
```
Expected: markets lists countries with real %; **note any index returning no row** (bad Yahoo symbol) — fix or drop it in `GLOBE_MARKETS`. US macro shows GDP/inflation/unemployment + year. Stop the server after.

- [ ] **Step 4: Commit**

```bash
git add backend/main.py backend/globe.py
git commit -m "feat(globe): REST endpoints + warm-up loop"
```

---

### Task 6: Frontend deps + types + API client

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/src/types.ts`, `frontend/src/api.ts`
- Create: `frontend/src/geo/countries.ts`

**Interfaces:**
- Produces: types `GlobeCountry`, `GlobeMarkets`, `GeoPoint`, `GlobeGeo`, `CountryDetail`; fetchers `fetchGlobeMarkets/Geo/Country`; `NUM_TO_ISO` join map.

- [ ] **Step 1: Install deps**

Run:
```bash
cd frontend && npm install react-simple-maps world-atlas && npm install -D @types/react-simple-maps
```
Expected: installs succeed; `package.json` gains the deps.

- [ ] **Step 2: Add types**

Append to `frontend/src/types.ts`:

```ts
// --- Global Macro Map -------------------------------------------------------
export interface GlobeCountry { iso: string; num: number; name: string; index: string; level: number; pct: number }
export interface GlobeMarkets { updated: number; countries: GlobeCountry[] }
export interface GeoPoint { iso: string; name: string; lat: number; lon: number; count: number; headline: string }
export interface GlobeGeo { available: boolean; points: GeoPoint[] }
export interface CountryNews { headline: string; url: string; source: string; datetime: number }
export interface CountryMacro { gdp: number | null; inflation: number | null; unemployment: number | null; year: string | null; available?: boolean }
export interface CountryDetail {
  iso: string; name: string
  index: { symbol: string; level: number | null; pct: number | null; points: { time: number; value: number }[] }
  fx: { pair: string; level: number; pct: number } | null
  macro: CountryMacro
  news: CountryNews[]
}
```

- [ ] **Step 3: Add fetchers**

Append to `frontend/src/api.ts` and add the types to its top `import type` block
(`GlobeMarkets, GlobeGeo, CountryDetail`):

```ts
export async function fetchGlobeMarkets(): Promise<GlobeMarkets | null> {
  const r = await fetch('/api/globe/markets')
  return r.ok ? r.json() : null
}
export async function fetchGlobeGeo(): Promise<GlobeGeo | null> {
  const r = await fetch('/api/globe/geo')
  return r.ok ? r.json() : null
}
export async function fetchGlobeCountry(iso: string): Promise<CountryDetail | null> {
  const r = await fetch(`/api/globe/country/${encodeURIComponent(iso)}`)
  return r.ok ? r.json() : null
}
```

- [ ] **Step 4: Create the numeric-ISO join map**

Create `frontend/src/geo/countries.ts` (world-atlas geographies carry a numeric ISO `id`; we join to our data by number):

```ts
// ISO 3166 numeric -> alpha-2, for joining world-atlas topojson to our data.
export const NUM_TO_ISO: Record<number, string> = {
  840: 'US', 124: 'CA', 76: 'BR', 484: 'MX', 826: 'GB', 276: 'DE', 250: 'FR',
  724: 'ES', 380: 'IT', 756: 'CH', 528: 'NL', 392: 'JP', 156: 'CN', 344: 'HK',
  356: 'IN', 410: 'KR', 158: 'TW', 36: 'AU', 702: 'SG', 360: 'ID', 792: 'TR', 710: 'ZA',
}
```

- [ ] **Step 5: Typecheck**

Run: `cd frontend && npm run build`
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/types.ts frontend/src/api.ts frontend/src/geo/countries.ts
git commit -m "feat(globe): frontend deps, types, api client"
```

---

### Task 7: View state + Header nav + App switch + GlobalMap shell

**Files:**
- Modify: `frontend/src/store.ts`, `frontend/src/components/Header.tsx`, `frontend/src/App.tsx`
- Create: `frontend/src/components/globe/GlobalMap.tsx`, `frontend/src/components/globe/GlobalMap.module.css`

**Interfaces:**
- Produces: `store.view` includes `'GLOBAL'`; `<GlobalMap/>` shell with polling state.

- [ ] **Step 1: Extend the store view union**

In `frontend/src/store.ts`, change both the interface and the initial loader:

```ts
  view: 'TERMINAL' | 'MACRO' | 'GLOBAL'
  setView: (v: 'TERMINAL' | 'MACRO' | 'GLOBAL') => void
```

```ts
  view: loadLS<'TERMINAL' | 'MACRO' | 'GLOBAL'>(LS_VIEW, 'TERMINAL'),
```

- [ ] **Step 2: 3-way Header nav**

In `frontend/src/components/Header.tsx`, replace the nav array:

```tsx
          {(['TERMINAL', 'MACRO', 'GLOBAL'] as const).map((v) => (
```
(The existing `.map` body and styles already handle any value.)

- [ ] **Step 3: App renders GlobalMap**

In `frontend/src/App.tsx`, add the import and a branch:

```tsx
import GlobalMap from './components/globe/GlobalMap'
```

Change the body conditional to:

```tsx
      {view === 'TERMINAL' && (
        <div className="body">
          <Watchlist />
          <CenterPanel />
          <OrderPanel />
        </div>
      )}
      {view === 'MACRO' && <MacroDashboard />}
      {view === 'GLOBAL' && <GlobalMap />}
```

- [ ] **Step 4: Create the GlobalMap shell**

Create `frontend/src/components/globe/GlobalMap.tsx`:

```tsx
import { useEffect, useState } from 'react'

import { fetchGlobeGeo, fetchGlobeMarkets } from '../../api'
import type { GlobeGeo, GlobeMarkets } from '../../types'
import styles from './GlobalMap.module.css'

export default function GlobalMap() {
  const [markets, setMarkets] = useState<GlobeMarkets | null>(null)
  const [geo, setGeo] = useState<GlobeGeo | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [showGeo, setShowGeo] = useState(false)

  useEffect(() => {
    let alive = true
    const pullM = () => { void fetchGlobeMarkets().then((m) => alive && m && setMarkets(m)) }
    const pullG = () => { void fetchGlobeGeo().then((g) => alive && g && setGeo(g)) }
    pullM(); pullG()
    const m = setInterval(pullM, 20_000)
    const g = setInterval(pullG, 10 * 60_000)
    return () => { alive = false; clearInterval(m); clearInterval(g) }
  }, [])

  return (
    <div className={styles.wrap}>
      <div className={styles.mapArea}>
        {markets ? `${markets.countries.length} markets · geo ${geo?.points.length ?? 0}` : 'loading…'}
      </div>
      <footer className={styles.disclaimer}>
        Indices &amp; FX via Yahoo · macro via World Bank (annual) · geopolitical = countries in
        current market news · sessions = regular hours (holidays excluded). No values are simulated.
      </footer>
      {/* selected / showGeo wired in later tasks */}
      <span hidden>{selected}{String(showGeo)}{setSelected.name}{setShowGeo.name}</span>
    </div>
  )
}
```

Create `frontend/src/components/globe/GlobalMap.module.css`:

```css
.wrap { position: absolute; inset: 0; display: flex; flex-direction: column; padding: 12px; gap: 8px; }
.mapArea { flex: 1; min-height: 0; position: relative; border: 1px solid var(--border); border-radius: 10px; background: radial-gradient(circle at 50% 40%, #0e1620, #0a0e13); overflow: hidden; }
.disclaimer { flex: 0 0 auto; font-size: 10px; color: var(--dim); text-align: center; }
```

- [ ] **Step 5: Typecheck + visual**

Run: `cd frontend && npm run build`
Expected: success.

Manual: header shows `TERMINAL · MACRO · GLOBAL`; clicking GLOBAL shows the map area placeholder ("N markets · geo M") + disclaimer; account bar/ticker persist.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/store.ts frontend/src/components/Header.tsx frontend/src/App.tsx frontend/src/components/globe
git commit -m "feat(globe): view switch, header nav, dashboard shell"
```

---

### Task 8: World choropleth map

**Files:**
- Create: `frontend/src/components/globe/WorldMap.tsx`
- Modify: `frontend/src/components/globe/GlobalMap.tsx`, `frontend/src/components/globe/GlobalMap.module.css`

**Interfaces:**
- Consumes: `GlobeMarkets`, `GlobeGeo`, `NUM_TO_ISO`, `react-simple-maps`, `world-atlas`.
- Produces: `<WorldMap markets geo showGeo onSelect />` — choropleth coloured by `pct`, hover tooltip, click → `onSelect(iso)`; hotspot bubbles when `showGeo`.

- [ ] **Step 1: Create WorldMap (choropleth first; bubbles added in Task 11)**

Create `frontend/src/components/globe/WorldMap.tsx`:

```tsx
import { useState } from 'react'
import { ComposableMap, Geographies, Geography, ZoomableGroup } from 'react-simple-maps'
import topo from 'world-atlas/countries-110m.json'

import { NUM_TO_ISO } from '../../geo/countries'
import type { GlobeGeo, GlobeMarkets } from '../../types'
import styles from './GlobalMap.module.css'

const GEO_URL = topo as unknown as Record<string, unknown>

function fill(pct: number | undefined): string {
  if (pct == null) return '#141b23'
  const a = Math.min(Math.abs(pct) / 3, 1) * 0.7 + 0.12
  return pct >= 0 ? `rgba(0,230,118,${a.toFixed(2)})` : `rgba(255,23,68,${a.toFixed(2)})`
}

export default function WorldMap(
  { markets, onSelect }:
  { markets: GlobeMarkets | null; geo: GlobeGeo | null; showGeo: boolean; onSelect: (iso: string) => void },
) {
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null)
  const byIso = new Map((markets?.countries ?? []).map((c) => [c.iso, c]))

  return (
    <>
      <ComposableMap projection="geoEqualEarth" projectionConfig={{ scale: 165 }} width={980} height={500} style={{ width: '100%', height: '100%' }}>
        <ZoomableGroup center={[10, 20]} zoom={1} minZoom={1} maxZoom={5}>
          <Geographies geography={GEO_URL}>
            {({ geographies }) =>
              geographies.map((g) => {
                const iso = NUM_TO_ISO[Number(g.id)]
                const c = iso ? byIso.get(iso) : undefined
                return (
                  <Geography
                    key={g.rsmKey}
                    geography={g}
                    fill={fill(c?.pct)}
                    stroke="#0a0e13"
                    strokeWidth={0.4}
                    style={{
                      default: { outline: 'none' },
                      hover: { outline: 'none', fill: c ? '#8fa3b3' : '#1b2530', cursor: c ? 'pointer' : 'default' },
                      pressed: { outline: 'none' },
                    }}
                    onMouseEnter={(e) => c && setTip({ x: e.clientX, y: e.clientY, text: `${c.name} · ${c.index} ${c.pct >= 0 ? '+' : ''}${c.pct}%` })}
                    onMouseMove={(e) => c && setTip((t) => (t ? { ...t, x: e.clientX, y: e.clientY } : t))}
                    onMouseLeave={() => setTip(null)}
                    onClick={() => c && onSelect(c.iso)}
                  />
                )
              })
            }
          </Geographies>
        </ZoomableGroup>
      </ComposableMap>
      {tip && <div className={styles.mapTip} style={{ left: tip.x + 12, top: tip.y + 12 }}>{tip.text}</div>}
    </>
  )
}
```

- [ ] **Step 2: Add tooltip style + a TS shim for the topojson import**

Append to `GlobalMap.module.css`:

```css
.mapTip { position: fixed; z-index: 20; pointer-events: none; background: rgba(12,17,22,.95); border: 1px solid var(--border); border-radius: 4px; padding: 3px 7px; font: 700 10px/1 'JetBrains Mono', monospace; color: #eef3f8; white-space: nowrap; }
```

Create `frontend/src/geo/world-atlas.d.ts` so TS accepts the JSON import:

```ts
declare module 'world-atlas/countries-110m.json' {
  const value: unknown
  export default value
}
```

- [ ] **Step 3: Mount WorldMap in GlobalMap**

In `GlobalMap.tsx`, replace the `mapArea` placeholder content with the map, and drop the temporary `<span hidden>`:

```tsx
import WorldMap from './WorldMap'
```
```tsx
      <div className={styles.mapArea}>
        <WorldMap markets={markets} geo={geo} showGeo={showGeo} onSelect={setSelected} />
      </div>
```

- [ ] **Step 4: Typecheck + visual**

Run: `cd frontend && npm run build`
Expected: success (if TS complains about `rsmKey`/`id` types, they come from `@types/react-simple-maps`; `g.id` is `string|number` → `Number(g.id)` is safe).

Manual: GLOBAL shows a dark world map; mapped countries are tinted green/red by their index %; hovering shows a tooltip; the map pans/zooms; clicking a tinted country sets selection (panel arrives in Task 10).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/globe frontend/src/geo
git commit -m "feat(globe): world choropleth coloured by index performance"
```

---

### Task 9: World session clock

**Files:**
- Create: `frontend/src/components/globe/SessionClock.tsx`
- Modify: `frontend/src/components/globe/GlobalMap.tsx`, `frontend/src/components/globe/GlobalMap.module.css`

**Interfaces:**
- Produces: `<SessionClock />` — a strip of major exchanges with an open/closed dot + local time, refreshed each minute.

- [ ] **Step 1: Create SessionClock**

Create `frontend/src/components/globe/SessionClock.tsx`:

```tsx
import { useEffect, useState } from 'react'

import styles from './GlobalMap.module.css'

const EXCHANGES = [
  { city: 'Tokyo', tz: 'Asia/Tokyo', open: 9 * 60, close: 15 * 60 },
  { city: 'Hong Kong', tz: 'Asia/Hong_Kong', open: 9 * 60 + 30, close: 16 * 60 },
  { city: 'Frankfurt', tz: 'Europe/Berlin', open: 9 * 60, close: 17 * 60 + 30 },
  { city: 'London', tz: 'Europe/London', open: 8 * 60, close: 16 * 60 + 30 },
  { city: 'New York', tz: 'America/New_York', open: 9 * 60 + 30, close: 16 * 60 },
  { city: 'Sydney', tz: 'Australia/Sydney', open: 10 * 60, close: 16 * 60 },
]

function localState(tz: string, open: number, close: number) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date())
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  const hh = Number(get('hour')) % 24
  const mm = Number(get('minute'))
  const wd = get('weekday')
  const mins = hh * 60 + mm
  const weekday = !['Sat', 'Sun'].includes(wd)
  return { open: weekday && mins >= open && mins < close, time: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}` }
}

export default function SessionClock() {
  const [, tick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 60_000)
    return () => clearInterval(id)
  }, [])
  return (
    <div className={styles.sessions}>
      {EXCHANGES.map((e) => {
        const s = localState(e.tz, e.open, e.close)
        return (
          <span className={styles.session} key={e.city}>
            <span className={`${styles.sessionDot} ${s.open ? styles.sessionOn : ''}`} />
            <b>{e.city}</b> <span className={styles.sessionTime}>{s.time}</span>
          </span>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Styles**

Append to `GlobalMap.module.css`:

```css
.sessions { flex: 0 0 auto; display: flex; flex-wrap: wrap; gap: 16px; justify-content: center; padding: 6px 0; }
.session { display: inline-flex; align-items: center; gap: 6px; font: 700 10px/1 'JetBrains Mono', monospace; color: #cfd8e3; }
.sessionDot { width: 8px; height: 8px; border-radius: 50%; background: #37424d; }
.sessionOn { background: #00E676; box-shadow: 0 0 7px rgba(0,230,118,.7); }
.sessionTime { color: var(--dim); }
```

- [ ] **Step 3: Mount above the disclaimer in GlobalMap**

```tsx
import SessionClock from './SessionClock'
```
Place `<SessionClock />` between `mapArea` and the `<footer>`.

- [ ] **Step 4: Typecheck + visual**

Run: `cd frontend && npm run build`
Expected: success.

Manual: a strip under the map shows Tokyo/HK/Frankfurt/London/NY/Sydney with a green dot when that market is within regular hours (verify against the actual current time), grey otherwise, each with its local HH:MM.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/globe
git commit -m "feat(globe): world session clock"
```

---

### Task 10: Country detail drawer

**Files:**
- Create: `frontend/src/components/globe/CountryPanel.tsx`
- Modify: `frontend/src/components/globe/GlobalMap.tsx`, `frontend/src/components/globe/GlobalMap.module.css`

**Interfaces:**
- Consumes: `fetchGlobeCountry`, `CountryDetail`, `lightweight-charts`.
- Produces: `<CountryPanel iso onClose />` — right drawer with index sparkline, FX, World Bank macro, country news.

- [ ] **Step 1: Create CountryPanel**

Create `frontend/src/components/globe/CountryPanel.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'
import { ColorType, createChart, type IChartApi } from 'lightweight-charts'

import { fetchGlobeCountry } from '../../api'
import type { CountryDetail } from '../../types'
import styles from './GlobalMap.module.css'

export default function CountryPanel({ iso, onClose }: { iso: string; onClose: () => void }) {
  const [d, setD] = useState<CountryDetail | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setD(null)
    let alive = true
    void fetchGlobeCountry(iso).then((r) => alive && setD(r))
    return () => { alive = false }
  }, [iso])

  useEffect(() => {
    let chart: IChartApi | null = null
    if (d && ref.current && d.index.points.length > 1) {
      chart = createChart(ref.current, {
        layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#4A5663', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, attributionLogo: false },
        grid: { vertLines: { visible: false }, horzLines: { visible: false } },
        rightPriceScale: { visible: false }, timeScale: { visible: false },
        crosshair: { horzLine: { visible: false }, vertLine: { visible: false } },
        autoSize: true, handleScroll: false, handleScale: false,
      })
      const up = (d.index.pct ?? 0) >= 0
      const area = chart.addAreaSeries({ lineColor: up ? '#00E676' : '#FF1744', topColor: up ? 'rgba(0,230,118,.25)' : 'rgba(255,23,68,.25)', bottomColor: 'transparent', lineWidth: 2, priceLineVisible: false, lastValueVisible: false })
      area.setData(d.index.points.map((p) => ({ time: p.time as never, value: p.value })))
      chart.timeScale().fitContent()
    }
    return () => { chart?.remove() }
  }, [d])

  const macroRow = (label: string, v: number | null, unit = '%') => (
    <div className={styles.cpMacroRow}><span>{label}</span><b>{v != null ? `${v}${unit}` : '—'}</b></div>
  )

  return (
    <div className={styles.cp}>
      <div className={styles.cpHead}>
        <span className={styles.cpTitle}>{d?.name ?? iso}</span>
        <button className={styles.cpClose} onClick={onClose}>✕</button>
      </div>
      {!d ? <div className={styles.empty}>loading…</div> : (
        <div className={styles.cpBody}>
          <div className={styles.cpIndex}>
            <span className={styles.cpIndexSym}>{d.index.symbol}</span>
            <span className={styles.cpIndexLvl}>{d.index.level ?? '—'}</span>
            <span className={d.index.pct != null && d.index.pct >= 0 ? styles.pos : styles.neg}>
              {d.index.pct != null ? `${d.index.pct >= 0 ? '+' : ''}${d.index.pct}%` : ''}
            </span>
          </div>
          <div ref={ref} className={styles.cpChart} />
          {d.fx && <div className={styles.cpFx}>FX {d.fx.pair.replace('=X', '')} · {d.fx.level} <span className={d.fx.pct >= 0 ? styles.pos : styles.neg}>{d.fx.pct >= 0 ? '+' : ''}{d.fx.pct}%</span></div>}

          <div className={styles.cpSection}>MACRO {d.macro.year ? `· World Bank ${d.macro.year}` : ''}</div>
          {d.macro.available === false
            ? <div className={styles.empty}>No World Bank data.</div>
            : (<>{macroRow('GDP growth', d.macro.gdp)}{macroRow('Inflation', d.macro.inflation)}{macroRow('Unemployment', d.macro.unemployment)}</>)}

          <div className={styles.cpSection}>NEWS</div>
          {d.news.length === 0 ? <div className={styles.empty}>No tagged news.</div> : d.news.map((n, i) => (
            <a key={i} className={styles.cpNews} href={n.url} target="_blank" rel="noopener noreferrer">{n.headline}</a>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Styles**

Append to `GlobalMap.module.css`:

```css
.cp { position: absolute; top: 12px; right: 12px; bottom: 12px; width: 320px; z-index: 15; background: rgba(10,14,19,.96); border: 1px solid var(--border); border-radius: 10px; display: flex; flex-direction: column; box-shadow: -8px 0 30px rgba(0,0,0,.4); }
.cpHead { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border-bottom: 1px solid var(--border); }
.cpTitle { font: 800 13px/1 'JetBrains Mono', monospace; letter-spacing: .5px; color: #eef3f8; }
.cpClose { background: transparent; border: none; color: var(--dim); font-size: 14px; cursor: pointer; }
.cpClose:hover { color: #eef3f8; }
.cpBody { flex: 1; min-height: 0; overflow-y: auto; padding: 12px; }
.cpIndex { display: flex; align-items: baseline; gap: 8px; }
.cpIndexSym { font: 700 10px/1 'JetBrains Mono', monospace; color: var(--dim); }
.cpIndexLvl { font: 800 20px/1 'JetBrains Mono', monospace; color: #eef3f8; }
.cpChart { height: 90px; margin: 8px 0; position: relative; }
.cpFx { font: 700 11px/1 'JetBrains Mono', monospace; color: #cfd8e3; margin-bottom: 4px; }
.cpSection { font: 700 9px/1 'JetBrains Mono', monospace; letter-spacing: 1.5px; color: var(--dim); margin: 14px 0 8px; border-bottom: 1px solid var(--border); padding-bottom: 4px; }
.cpMacroRow { display: flex; justify-content: space-between; font: 700 11px/1.8 'JetBrains Mono', monospace; color: #cfd8e3; }
.cpNews { display: block; font: 600 11px/1.35 'JetBrains Mono', monospace; color: #cfd8e3; text-decoration: none; padding: 6px 0; border-bottom: 1px solid rgba(96,125,139,.12); }
.cpNews:hover { color: #42A5F5; }
```

- [ ] **Step 3: Wire selection in GlobalMap**

In `GlobalMap.tsx`: import and render the panel when `selected`, and remove the temporary `<span hidden>` line (if still present):

```tsx
import CountryPanel from './CountryPanel'
```
```tsx
      {selected && <CountryPanel iso={selected} onClose={() => setSelected(null)} />}
```

- [ ] **Step 4: Typecheck + visual**

Run: `cd frontend && npm run build`
Expected: success.

Manual: click a tinted country → a right drawer opens with its index level/% + sparkline, FX line, World Bank macro (year-labelled) or "No World Bank data", and tagged news links; ✕ closes it.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/globe
git commit -m "feat(globe): country detail drawer (index, FX, World Bank, news)"
```

---

### Task 11: Geopolitical hotspot overlay + legend/toggle

**Files:**
- Modify: `frontend/src/components/globe/WorldMap.tsx`
- Create: `frontend/src/components/globe/MapLegend.tsx`
- Modify: `frontend/src/components/globe/GlobalMap.tsx`, `frontend/src/components/globe/GlobalMap.module.css`

**Interfaces:**
- Consumes: `GlobeGeo`, `react-simple-maps` `Marker`.
- Produces: hotspot bubbles on the map when `showGeo`; `<MapLegend showGeo onToggleGeo />`.

- [ ] **Step 1: Add Marker bubbles to WorldMap**

In `WorldMap.tsx`, add `Marker` to the import and render bubbles inside `<ZoomableGroup>` after `</Geographies>`:

```tsx
import { ComposableMap, Geographies, Geography, Marker, ZoomableGroup } from 'react-simple-maps'
```
```tsx
          {showGeo && (geo?.points ?? []).map((p) => (
            <Marker key={p.iso} coordinates={[p.lon, p.lat]}
              onMouseEnter={(e) => setTip({ x: e.clientX, y: e.clientY, text: `${p.name} · ${p.count} news · ${p.headline.slice(0, 60)}` })}
              onMouseMove={(e) => setTip((t) => (t ? { ...t, x: e.clientX, y: e.clientY } : t))}
              onMouseLeave={() => setTip(null)}>
              <circle r={Math.min(4 + Math.sqrt(p.count) * 4, 22)} fill="rgba(255,145,0,0.28)" stroke="#FF9100" strokeWidth={1} />
            </Marker>
          ))}
```

- [ ] **Step 2: Create MapLegend**

Create `frontend/src/components/globe/MapLegend.tsx`:

```tsx
import styles from './GlobalMap.module.css'

export default function MapLegend({ showGeo, onToggleGeo }: { showGeo: boolean; onToggleGeo: (v: boolean) => void }) {
  return (
    <div className={styles.legend}>
      <div className={styles.legendScale}>
        <span className={styles.neg}>−3%</span>
        <span className={styles.legendBar} />
        <span className={styles.pos}>+3%</span>
      </div>
      <button className={`${styles.legendToggle} ${showGeo ? styles.legendToggleOn : ''}`} onClick={() => onToggleGeo(!showGeo)}>
        ◉ Geopolitical
      </button>
    </div>
  )
}
```

- [ ] **Step 3: Styles + mount**

Append to `GlobalMap.module.css`:

```css
.legend { position: absolute; left: 12px; bottom: 12px; z-index: 12; display: flex; align-items: center; gap: 12px; background: rgba(12,17,22,.8); border: 1px solid var(--border); border-radius: 8px; padding: 6px 10px; }
.legendScale { display: flex; align-items: center; gap: 6px; font: 700 9px/1 'JetBrains Mono', monospace; }
.legendBar { width: 90px; height: 8px; border-radius: 4px; background: linear-gradient(90deg, #FF1744, #141b23 50%, #00E676); }
.legendToggle { font: 700 9px/1 'JetBrains Mono', monospace; letter-spacing: .5px; color: var(--dim); background: transparent; border: 1px solid var(--border); border-radius: 5px; padding: 5px 8px; cursor: pointer; }
.legendToggleOn { color: #0b1116; background: #FF9100; border-color: transparent; }
```

In `GlobalMap.tsx`, mount the legend inside `mapArea` (after `<WorldMap/>`):

```tsx
import MapLegend from './MapLegend'
```
```tsx
        <MapLegend showGeo={showGeo} onToggleGeo={setShowGeo} />
```

- [ ] **Step 4: Typecheck + visual**

Run: `cd frontend && npm run build`
Expected: success.

Manual: a legend sits bottom-left with the colour scale + a "Geopolitical" toggle; toggling on overlays amber bubbles (sized by news count) on countries in the news; hovering a bubble shows name + count + a headline snippet.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/globe
git commit -m "feat(globe): geopolitical hotspot overlay + legend toggle"
```

---

### Task 12: Docs + final verification

**Files:**
- Modify: `README.md`, `CLAUDE.md`

- [ ] **Step 1: README**

In `README.md`, add a feature bullet under Fonctionnalités:

```markdown
- **Global Macro Map** (onglet principal) : carte du monde interactive — pays colorés par la
  performance du jour de leur indice (Yahoo), clic → volet pays (indice + mini-graphe, devise,
  macro **World Bank** annuelle, news du pays), **horloge des sessions** mondiales, et une couche
  **géopolitique** en bulles (pays cités dans l'actu marché). Rien n'est simulé.
```

- [ ] **Step 2: CLAUDE.md**

In `CLAUDE.md` "Key behaviours", add:

```markdown
- **Global Map** (`components/globe/`): 3rd primary view (`store.view==='GLOBAL'`). Backend
  `globe.py` serves `/api/globe/markets` (Yahoo indices for ~22 countries, warmed by `globe_loop`),
  `/api/globe/country/{iso}` (index + FX + World Bank macro + country-tagged news), `/api/globe/geo`
  (geopolitical hotspots derived from the existing news feed by country-name matching). Map uses
  `react-simple-maps` + `world-atlas` topojson, joined to data by numeric ISO (`geo/countries.ts`).
  World Bank macro is annual (year shown); sessions are computed client-side (holidays excluded).
```

- [ ] **Step 3: Full backend test + frontend build**

Run:
```bash
cd backend && python -m pytest -q
cd ../frontend && npm run build
```
Expected: all pytest pass; frontend build succeeds.

- [ ] **Step 4: End-to-end visual pass**

Start both (`./dev.ps1`), open http://localhost:5173:
- Header toggles TERMINAL / MACRO / GLOBAL; bar + ticker persist.
- Map tinted by index %; hover tooltip; click → country drawer (real values, WB year, news).
- Session clock dots match current time; Geopolitical toggle overlays news bubbles.
- No console errors; switching views repeatedly does not leak charts.

- [ ] **Step 5: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "docs(globe): document Global Macro Map"
```

---

## Self-Review

**Spec coverage:**
- 3rd view + nav → Task 7. ✓
- Choropleth by index % (Yahoo) → Tasks 2, 8. ✓
- Country drawer (index+sparkline, FX, World Bank macro, news) → Tasks 1, 4, 10. ✓
- Session clock (client, holidays excluded) → Task 9. ✓
- Geopolitical bubbles from news + toggle → Tasks 3, 11. ✓
- Endpoints + warm-up loop → Task 5. ✓
- Deps (react-simple-maps, world-atlas) + numeric-ISO join → Task 6. ✓
- Data honesty labels (WB year, geo caption, sessions) → Tasks 7 (disclaimer), 10, 11. ✓
- Docs → Task 12. ✓

**Placeholder scan:** No TBD/"handle errors" — every code step is complete. The uncertain Yahoo index symbols (ZA/TR/etc.) are handled by design (omitted if no quote) and flagged for verification in Task 5 Step 3, not left as a placeholder.

**Type consistency:** Backend emits camelCase (`invFx`, `updated`) matching `types.ts`. `GlobeCountry` (iso/num/name/index/level/pct), `GeoPoint` (iso/name/lat/lon/count/headline), `CountryDetail` (index{symbol,level,pct,points}, fx{pair,level,pct}|null, macro, news) are defined once in Task 6 and consumed unchanged in Tasks 8/10/11. `NUM_TO_ISO` (Task 6) used in Task 8. `fetchGlobeMarkets/Geo/Country` (Task 6) used in Tasks 7/10. `showGeo`/`onSelect` props consistent between WorldMap (Tasks 8/11) and GlobalMap.

**Known caveats (intentional, in-plan):**
- World-atlas geographies join by numeric ISO via `Number(g.id)`; countries not in `NUM_TO_ISO` render inert dark (expected).
- Country index symbols are best-effort; Task 5 verifies live and drops any that Yahoo 404s.
- Geopolitical layer is news-name matching (country-level), explicitly labelled — not event geolocation (GDELT GEO was found 404 during design).

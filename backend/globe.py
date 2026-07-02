"""Global Macro Map data layer: markets board, per-country detail (Yahoo +
World Bank + news), and news-derived geopolitical hotspots. All real data."""
from __future__ import annotations

import re
import time

import macro
import providers

# iso2, ISO numeric (int, for topojson join), display name, Yahoo index,
# Yahoo FX pair vs USD (or None), invFx=True when pair is USD-quoted (USDxxx), region.
GLOBE_MARKETS = [
    # Americas
    {"iso": "US", "num": 840, "name": "United States", "index": "^GSPC", "fx": None, "invFx": False, "region": "Americas"},
    {"iso": "CA", "num": 124, "name": "Canada", "index": "^GSPTSE", "fx": "USDCAD=X", "invFx": True, "region": "Americas"},
    {"iso": "BR", "num": 76, "name": "Brazil", "index": "^BVSP", "fx": "USDBRL=X", "invFx": True, "region": "Americas"},
    {"iso": "MX", "num": 484, "name": "Mexico", "index": "^MXX", "fx": "USDMXN=X", "invFx": True, "region": "Americas"},
    {"iso": "AR", "num": 32, "name": "Argentina", "index": "^MERV", "fx": "USDARS=X", "invFx": True, "region": "Americas"},
    {"iso": "CL", "num": 152, "name": "Chile", "index": "^IPSA", "fx": "USDCLP=X", "invFx": True, "region": "Americas"},
    # EMEA
    {"iso": "GB", "num": 826, "name": "United Kingdom", "index": "^FTSE", "fx": "GBPUSD=X", "invFx": False, "region": "EMEA"},
    {"iso": "DE", "num": 276, "name": "Germany", "index": "^GDAXI", "fx": "EURUSD=X", "invFx": False, "region": "EMEA"},
    {"iso": "FR", "num": 250, "name": "France", "index": "^FCHI", "fx": "EURUSD=X", "invFx": False, "region": "EMEA"},
    {"iso": "ES", "num": 724, "name": "Spain", "index": "^IBEX", "fx": "EURUSD=X", "invFx": False, "region": "EMEA"},
    {"iso": "IT", "num": 380, "name": "Italy", "index": "FTSEMIB.MI", "fx": "EURUSD=X", "invFx": False, "region": "EMEA"},
    {"iso": "CH", "num": 756, "name": "Switzerland", "index": "^SSMI", "fx": "USDCHF=X", "invFx": True, "region": "EMEA"},
    {"iso": "NL", "num": 528, "name": "Netherlands", "index": "^AEX", "fx": "EURUSD=X", "invFx": False, "region": "EMEA"},
    {"iso": "SE", "num": 752, "name": "Sweden", "index": "^OMX", "fx": "USDSEK=X", "invFx": True, "region": "EMEA"},
    {"iso": "NO", "num": 578, "name": "Norway", "index": "OSEBX.OL", "fx": "USDNOK=X", "invFx": True, "region": "EMEA"},
    {"iso": "DK", "num": 208, "name": "Denmark", "index": "^OMXC25", "fx": "USDDKK=X", "invFx": True, "region": "EMEA"},
    {"iso": "FI", "num": 246, "name": "Finland", "index": "^OMXH25", "fx": "EURUSD=X", "invFx": False, "region": "EMEA"},
    {"iso": "AT", "num": 40, "name": "Austria", "index": "^ATX", "fx": "EURUSD=X", "invFx": False, "region": "EMEA"},
    {"iso": "BE", "num": 56, "name": "Belgium", "index": "^BFX", "fx": "EURUSD=X", "invFx": False, "region": "EMEA"},
    {"iso": "PT", "num": 620, "name": "Portugal", "index": "PSI20.LS", "fx": "EURUSD=X", "invFx": False, "region": "EMEA"},
    {"iso": "GR", "num": 300, "name": "Greece", "index": "GD.AT", "fx": "EURUSD=X", "invFx": False, "region": "EMEA"},
    {"iso": "IE", "num": 372, "name": "Ireland", "index": "^ISEQ", "fx": "EURUSD=X", "invFx": False, "region": "EMEA"},
    {"iso": "PL", "num": 616, "name": "Poland", "index": "WIG20.WA", "fx": "USDPLN=X", "invFx": True, "region": "EMEA"},
    {"iso": "TR", "num": 792, "name": "Turkey", "index": "XU100.IS", "fx": "USDTRY=X", "invFx": True, "region": "EMEA"},
    {"iso": "ZA", "num": 710, "name": "South Africa", "index": "^J203.JO", "fx": "USDZAR=X", "invFx": True, "region": "EMEA"},
    {"iso": "IL", "num": 376, "name": "Israel", "index": "^TA125.TA", "fx": "USDILS=X", "invFx": True, "region": "EMEA"},
    {"iso": "SA", "num": 682, "name": "Saudi Arabia", "index": "^TASI.SR", "fx": "USDSAR=X", "invFx": True, "region": "EMEA"},
    {"iso": "EG", "num": 818, "name": "Egypt", "index": "^CASE30", "fx": "USDEGP=X", "invFx": True, "region": "EMEA"},
    {"iso": "RU", "num": 643, "name": "Russia", "index": "IMOEX.ME", "fx": "USDRUB=X", "invFx": True, "region": "EMEA"},
    # Asia-Pacific
    {"iso": "JP", "num": 392, "name": "Japan", "index": "^N225", "fx": "USDJPY=X", "invFx": True, "region": "Asia-Pacific"},
    {"iso": "CN", "num": 156, "name": "China", "index": "000001.SS", "fx": "USDCNY=X", "invFx": True, "region": "Asia-Pacific"},
    {"iso": "HK", "num": 344, "name": "Hong Kong", "index": "^HSI", "fx": "USDHKD=X", "invFx": True, "region": "Asia-Pacific"},
    {"iso": "IN", "num": 356, "name": "India", "index": "^BSESN", "fx": "USDINR=X", "invFx": True, "region": "Asia-Pacific"},
    {"iso": "KR", "num": 410, "name": "South Korea", "index": "^KS11", "fx": "USDKRW=X", "invFx": True, "region": "Asia-Pacific"},
    {"iso": "TW", "num": 158, "name": "Taiwan", "index": "^TWII", "fx": "USDTWD=X", "invFx": True, "region": "Asia-Pacific"},
    {"iso": "AU", "num": 36, "name": "Australia", "index": "^AXJO", "fx": "AUDUSD=X", "invFx": False, "region": "Asia-Pacific"},
    {"iso": "NZ", "num": 554, "name": "New Zealand", "index": "^NZ50", "fx": "NZDUSD=X", "invFx": False, "region": "Asia-Pacific"},
    {"iso": "SG", "num": 702, "name": "Singapore", "index": "^STI", "fx": "USDSGD=X", "invFx": True, "region": "Asia-Pacific"},
    {"iso": "ID", "num": 360, "name": "Indonesia", "index": "^JKSE", "fx": "USDIDR=X", "invFx": True, "region": "Asia-Pacific"},
    {"iso": "TH", "num": 764, "name": "Thailand", "index": "^SET.BK", "fx": "USDTHB=X", "invFx": True, "region": "Asia-Pacific"},
    {"iso": "MY", "num": 458, "name": "Malaysia", "index": "^KLSE", "fx": "USDMYR=X", "invFx": True, "region": "Asia-Pacific"},
    {"iso": "PH", "num": 608, "name": "Philippines", "index": "PSEI.PS", "fx": "USDPHP=X", "invFx": True, "region": "Asia-Pacific"},
]

_WB_BASE = "https://api.worldbank.org/v2"
# layer metrics (batched all-country fetch) vs the fuller set shown in the country panel
_WB_LAYER = {"gdp": "NY.GDP.MKTP.KD.ZG", "inflation": "FP.CPI.TOTL.ZG", "unemployment": "SL.UEM.TOTL.ZS"}
_WB_PANEL = {**_WB_LAYER, "population": "SP.POP.TOTL", "gdpUsd": "NY.GDP.MKTP.CD",
             "debt": "GC.DOD.TOTL.GD.ZS", "currentAccount": "BN.CAB.XOKA.GD.ZS"}
_WB_TTL = 24 * 3600.0
_wb_metric_cache: dict[str, tuple[float, dict]] = {}   # indicator -> {iso: {value, year}}
_wb_panel_cache: tuple[float, dict] | None = None      # {iso: {metrics..., year}}


def _wb_latest(payload) -> tuple[float | None, str | None]:
    """From a World Bank [meta, rows] payload (rows newest-first) -> (value, year)."""
    if not payload or not isinstance(payload, list) or len(payload) < 2 or not payload[1]:
        return None, None
    for row in payload[1]:
        v = row.get("value")
        if v is not None:
            return float(v), row.get("date")
    return None, None


def _wb_all_rows(payload) -> dict[str, dict]:
    """World Bank country/all payload -> {iso2: {value, year}}. Rows come newest
    first per country; keep the newest non-null (skip nulls, don't overwrite)."""
    if not payload or not isinstance(payload, list) or len(payload) < 2 or not payload[1]:
        return {}
    out: dict[str, dict] = {}
    for row in payload[1]:
        v = row.get("value")
        iso2 = (row.get("country") or {}).get("id")
        if v is not None and iso2 and iso2 not in out:
            out[iso2] = {"value": round(float(v), 2), "year": row.get("date")}
    return out


def _wb_all(indicator: str) -> dict[str, dict]:
    """Latest value of an indicator for every country — one request, cached 24h."""
    now = time.time()
    c = _wb_metric_cache.get(indicator)
    if c and now - c[0] < _WB_TTL:
        return c[1]
    url = f"{_WB_BASE}/country/all/indicator/{indicator}?format=json&per_page=1200&mrv=3"
    try:
        rows = _wb_all_rows(providers._get(url))
    except Exception:  # noqa: BLE001
        return c[1] if c else {}  # transient failure: don't cache it
    if rows:
        _wb_metric_cache[indicator] = (now, rows)
    return rows


def _wb_panel_all() -> dict[str, dict]:
    """{iso: {gdp, inflation, unemployment, population, gdpUsd, debt, currentAccount, year}}
    for every mapped country, from batched per-indicator fetches."""
    global _wb_panel_cache
    now = time.time()
    if _wb_panel_cache and now - _wb_panel_cache[0] < _WB_TTL:
        return _wb_panel_cache[1]
    per = {key: _wb_all(ind) for key, ind in _WB_PANEL.items()}
    out: dict[str, dict] = {}
    for c in GLOBE_MARKETS:
        iso = c["iso"]
        rec: dict = {}
        got, year = False, None
        for key in _WB_PANEL:
            r = per[key].get(iso)
            if r is not None:
                rec[key] = round(r["value"]) if key in ("population", "gdpUsd") else r["value"]
                if key == "gdp":
                    year = r["year"]
                got = True
            else:
                rec[key] = None
        rec["year"] = year
        out[iso] = rec if got else {"available": False}
    if any(per.values()):  # only cache when at least one metric resolved
        _wb_panel_cache = (now, out)
    return out


def world_bank_macro(iso: str) -> dict:
    return _wb_panel_all().get(iso, {"available": False})


def macro_layer() -> dict:
    """Latest World Bank GDP/inflation/unemployment for every mapped country."""
    isos = {c["iso"] for c in GLOBE_MARKETS}
    per = {key: _wb_all(ind) for key, ind in _WB_LAYER.items()}
    metrics = {key: {iso: rows[iso] for iso in isos if iso in rows} for key, rows in per.items()}
    return {"metrics": metrics}


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
                          "pct": round(q["pct"], 2), "region": c["region"]})
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
                           "lon": c["lon"], "count": 0, "news": []}
                    acc[c["iso"]] = cur
                cur["count"] += 1
                cur["news"].append({"headline": head, "url": it.get("url") or "",
                                    "source": it.get("source") or "", "datetime": it.get("datetime", 0)})
    pts = sorted(acc.values(), key=lambda p: p["count"], reverse=True)
    for p in pts:
        p["news"].sort(key=lambda n: n["datetime"], reverse=True)
        p["news"] = p["news"][:6]
        p["headline"] = p["news"][0]["headline"] if p["news"] else ""  # marker tooltip sample
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

"""Global Macro Map data layer: markets board, per-country detail (Yahoo +
World Bank + news), and news-derived geopolitical hotspots. All real data."""
from __future__ import annotations

import re
import time

import macro
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

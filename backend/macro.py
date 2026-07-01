"""Macro dashboard data layer.

Two data planes:
  - Yahoo (keyless): the "board" — rates majors, VIX, DXY, sectors, cross-asset.
  - FRED (free key): economic indicators, full yield curve, latest releases.
FRED functions degrade to {"available": False} when no key is configured.
"""
from __future__ import annotations

import datetime
import email.utils
import re
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

import config
import providers


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


# --- FRED client ------------------------------------------------------------

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
    # sort_order=desc + limit -> the *most recent* `limit` observations; reverse
    # so callers still receive them oldest -> newest (latest_prior/spark expect that).
    data = _fred_get("series/observations", {
        "series_id": series_id, "units": units,
        "sort_order": "desc", "limit": str(limit),
    })
    obs = (data or {}).get("observations", []) if data else []
    return list(reversed(obs))


def fred_meta(series_id: str) -> dict:
    data = _fred_get("series", {"series_id": series_id})
    if not data:
        return {}
    arr = data.get("seriess") or []
    if not arr:
        return {}
    s = arr[0]
    return {"units": s.get("units_short") or s.get("units") or "", "updated": s.get("last_updated") or ""}


# --- Board (Yahoo) ----------------------------------------------------------

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

# cross-asset Yahoo symbol -> our tradable symbol (for click-through to terminal).
# Instruments with no tradable equivalent (bond ETFs, copper, DXY) map to None.
LOCAL_MAP = {
    "^GSPC": "SPX500", "^NDX": "NAS100", "^DJI": "US30", "^GDAXI": "GER40", "^FTSE": "UK100",
    "BTC-USD": "BTCUSD", "ETH-USD": "ETHUSD", "SOL-USD": "SOLUSD",
    "GC=F": "XAUUSD", "SI=F": "XAGUSD", "CL=F": "WTI", "NG=F": "NATGAS",
    "EURUSD=X": "EURUSD", "USDJPY=X": "USDJPY", "GBPUSD=X": "GBPUSD",
}

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
        cells = [{"symbol": s, "label": lbl, "pct": round(quotes[s]["pct"], 2),
                  "local": LOCAL_MAP.get(s)}
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


# --- Economics, curve & releases (FRED) -------------------------------------

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


# --- Live Wire: financial news + economic calendar --------------------------

_FINNHUB_BASE = "https://finnhub.io/api/v1"
_news_cache: tuple[float, dict] | None = None
_NEWS_TTL = 300.0
_cal_cache: tuple[float, dict] | None = None
_CAL_TTL = 1800.0


def _http_text(url: str, timeout: float = 8.0) -> str | None:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": providers._UA})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.read().decode("utf-8", "replace")
    except Exception:  # noqa: BLE001
        return None


def _finnhub_get(path: str, params: dict):
    if not config.FINNHUB_API_KEY:
        return None
    q = {**params, "token": config.FINNHUB_API_KEY}
    url = f"{_FINNHUB_BASE}/{path}?{urllib.parse.urlencode(q)}"
    try:
        return providers._get(url)
    except Exception:  # noqa: BLE001 — premium endpoints 403 on the free tier
        return None


_IMPACT_HIGH = ("fed", "fomc", "rate cut", "rate hike", "inflation", "cpi", "recession",
                "jobs report", "payroll", "gdp", "war", "tariff", "default", "crisis",
                "crash", "powell", "treasury", "sanction", "central bank", "jobless",
                "tension", "tensions", "conflict", "opec", "shutdown", "election")
_IMPACT_MED = ("earnings", "stocks", "oil", "dollar", "bitcoin", "crypto", "merger", "ipo",
               "guidance", "downgrade", "upgrade", "revenue", "profit", "shares", "fund")


def _matches(h: str, words: tuple[str, ...]) -> bool:
    return any(re.search(rf"\b{re.escape(k)}\b", h) for k in words)


def _news_impact(headline: str) -> str:
    h = (headline or "").lower()
    if _matches(h, _IMPACT_HIGH):
        return "high"
    if _matches(h, _IMPACT_MED):
        return "med"
    return "low"


def _news_from_finnhub() -> list[dict]:
    data = _finnhub_get("news", {"category": "general"})
    if not isinstance(data, list):
        return []
    out = []
    for it in data[:30]:
        url, head = it.get("url"), it.get("headline")
        if not url or not head:
            continue
        out.append({"headline": head, "url": url,
                    "source": it.get("source") or "Finnhub",
                    "datetime": int(it.get("datetime", 0)) * 1000,
                    "impact": _news_impact(head),
                    "summary": (it.get("summary") or "")[:200]})
    return out


def _news_from_yahoo() -> list[dict]:
    url = ("https://feeds.finance.yahoo.com/rss/2.0/headline?"
           + urllib.parse.urlencode({"s": "^GSPC,^IXIC,^DJI", "region": "US", "lang": "en-US"}))
    text = _http_text(url)
    if not text:
        return []
    try:
        root = ET.fromstring(text)
    except ET.ParseError:
        return []
    out = []
    for item in root.iter("item"):
        title, link = item.findtext("title"), item.findtext("link")
        if not title or not link:
            continue
        ts = 0
        pub = item.findtext("pubDate")
        if pub:
            try:
                ts = int(email.utils.parsedate_to_datetime(pub).timestamp() * 1000)
            except (TypeError, ValueError):
                ts = 0
        out.append({"headline": title, "url": link, "source": "Yahoo Finance",
                    "datetime": ts, "impact": _news_impact(title),
                    "summary": (item.findtext("description") or "")[:200]})
    return out


def fetch_news() -> dict:
    global _news_cache
    now = time.time()
    if _news_cache and now - _news_cache[0] < _NEWS_TTL:
        return _news_cache[1]
    items, source = _news_from_finnhub(), "finnhub"
    if not items:
        items, source = _news_from_yahoo(), "yahoo"
    items.sort(key=lambda x: x["datetime"], reverse=True)
    out = {"available": bool(items), "source": source, "items": items[:18]}
    _news_cache = (now, out)
    return out


# Upcoming economic-release schedule (real forward dates from FRED). release_name
# substring -> short display label. Only the market-moving reports are kept.
CAL_RELEASES = [
    ("Employment Situation", "Employment Situation (NFP)"),
    ("Consumer Price Index", "CPI"),
    ("Producer Price Index", "PPI"),
    ("Gross Domestic Product", "GDP"),
    ("Personal Income and Outlays", "PCE · Personal Income"),
    ("Advance Monthly Sales for Retail", "Retail Sales"),
    ("Job Openings and Labor Turnover", "JOLTS Job Openings"),
]


def _fred_release_calendar() -> list[dict]:
    if not fred_available():
        return []
    today = datetime.date.today().isoformat()
    # desc puts the furthest-future scheduled dates first; keep upcoming, then
    # re-sort ascending for a proper agenda.
    # realtime_start=today + asc returns only *upcoming* scheduled dates, nearest
    # first — exactly the agenda we want.
    data = _fred_get("releases/dates", {
        "realtime_start": today,
        "include_release_dates_with_no_data": "true",
        "sort_order": "asc", "limit": "1000",  # 1000 is FRED's max page size
    })
    rows = (data or {}).get("release_dates") or []
    out, seen = [], set()
    for r in rows:
        date = r.get("date") or ""
        if date < today:
            continue
        label = next((lbl for sub, lbl in CAL_RELEASES if sub in (r.get("release_name") or "")), None)
        if not label or (date, label) in seen:
            continue
        seen.add((date, label))
        out.append({"date": date, "event": label})
    out.sort(key=lambda x: x["date"])
    return out[:14]


def build_calendar() -> dict:
    global _cal_cache
    now = time.time()
    if _cal_cache and now - _cal_cache[0] < _CAL_TTL:
        return _cal_cache[1]
    items = _fred_release_calendar()
    out = {"available": bool(items), "source": "fred" if items else None, "items": items}
    _cal_cache = (now, out)
    return out

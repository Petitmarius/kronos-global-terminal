"""Macro dashboard data layer.

Three data planes:
  - Yahoo (keyless): the "board" — rates majors, VIX, DXY, sectors, cross-asset.
  - US Treasury (keyless): the par yield curve, straight from the publisher.
  - FRED (free key): economic indicators, latest releases, curve fallback.
FRED functions degrade to {"available": False} when no key is configured.
"""
from __future__ import annotations

import csv
import datetime
import email.utils
import io
import re
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor

import numpy as np

import cache
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

# A safety ceiling, not the freshness knob: `main.WARM` refreshes the board on a
# far shorter period, so a request is served from cache. This only bites if that
# loop dies -- the previous behaviour (TTL 20s under a 30s loop) left a 10s hole
# in every cycle where the client rebuilt all 37 quotes itself, costing 4.3s.
_BOARD_HARD_TTL = 120.0


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


def _clamp(v: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, v))


def _risk_label(score: float) -> str:
    if score >= 80:
        return "Extreme Risk-On"
    if score >= 60:
        return "Risk-On"
    if score >= 40:
        return "Neutral"
    if score >= 20:
        return "Risk-Off"
    return "Extreme Risk-Off"


def build_risk(quotes: dict[str, dict]) -> dict | None:
    """Composite 0-100 Risk-On/Risk-Off score from real market signals.
    100 = full risk-on, 0 = full risk-off. Returns None if inputs are missing."""
    def pct(sym):
        q = quotes.get(sym)
        return q["pct"] if q else None

    vix_q = quotes.get(VIX_YH)
    vix = vix_q["price"] if vix_q else None
    hyg, lqd = pct("HYG"), pct("LQD")
    spx, tlt = pct("^GSPC"), pct("TLT")
    dxy, gold = pct(DXY_YH), pct("GC=F")
    if None in (vix, hyg, lqd, spx, tlt, dxy, gold):
        return None

    # each driver -> 0..100 sub-score (100 = risk-on)
    drivers = [
        ("Volatility", _clamp((32 - vix) / 20 * 100), 0.30),          # VIX 12->100, 32->0
        ("Credit HY/IG", _clamp(50 + (hyg - lqd) * 40), 0.20),        # HY outperforming = risk-on
        ("Equities/Bonds", _clamp(50 + (spx - tlt) * 20), 0.20),      # stocks > bonds = risk-on
        ("US Dollar", _clamp(50 - dxy * 30), 0.15),                   # dollar up = risk-off
        ("Gold", _clamp(50 - gold * 20), 0.15),                       # gold up = risk-off
    ]
    score = round(sum(v * w for _, v, w in drivers))
    return {"score": score, "label": _risk_label(score),
            "drivers": [{"name": n, "value": round(v)} for n, v, _ in drivers]}


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
        "risk": build_risk(quotes),
    }


def _build_board() -> dict:
    """Every board symbol in one batched call: 37 quotes, 4.3s -> 0.11s."""
    return build_board(providers.yahoo_quotes_batch(board_symbols()))


BOARD = cache.Cached(_build_board, hard_ttl=_BOARD_HARD_TTL)


def fetch_board() -> dict:
    return BOARD.get()


# --- Economics, curve & releases (FRED) -------------------------------------

ECON = [
    ("CPIAUCSL", "CPI (YoY)", "pc1", "%"),
    ("CPILFESL", "Core CPI (YoY)", "pc1", "%"),
    ("UNRATE", "Unemployment", "lin", "%"),
    ("A191RL1Q225SBEA", "GDP (QoQ SAAR)", "lin", "%"),
    ("FEDFUNDS", "Fed Funds", "lin", "%"),
]
# Fallback tenors only (see `_fred_curve`); Treasury is the primary source.
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
    # One round-trip per indicator, none of them waiting on the previous one.
    with ThreadPoolExecutor(max_workers=min(len(ECON), _SERIES_WORKERS)) as ex:
        fetched = list(ex.map(lambda e: fred_observations(e[0], units=e[2], limit=40), ECON))
    series = []
    for (sid, label, units, unit), obs in zip(ECON, fetched):
        value, prior = latest_prior(obs)
        # `period` is the observation date, not the publication date: FEDFUNDS is
        # a MONTHLY AVERAGE, so the UI can say which month it is showing.
        series.append({"key": sid, "label": label, "value": value,
                       "prior": prior, "unit": unit, "spark": spark(obs, 24),
                       "period": _latest_obs(obs)[1]})
    return {"available": True, "series": series}


def _latest_obs(obs: list[dict]) -> tuple[float | None, str | None]:
    """Most recent numeric observation and the date it belongs to."""
    for o in reversed(obs):
        v = _num(o.get("value"))
        if v is not None:
            return v, o.get("date")
    return None, None


def _fred_curve() -> dict | None:
    """Backstop only — see `build_curve`. Each DGS series is fetched separately,
    so the reported `asOf` is the newest date any of them carries."""
    if not fred_available():
        return None
    points, as_of = [], ""
    for sid, months, label in CURVE_FRED:
        value, date = _latest_obs(fred_observations(sid, limit=5))
        if value is not None:
            points.append({"label": label, "months": months, "yield": round(value, 3)})
            as_of = max(as_of, date or "")
    if len(points) < 2:
        return None
    return {"source": "FRED", "asOf": as_of or None, "points": points}


# --- Yield curve (US Treasury primary) --------------------------------------

# treasury.gov publishes the par yield curve itself: same day, every tenor on a
# single date, no API key. FRED's DGS* series are a one-business-day-lagged
# mirror of this very file, which is why they used to disagree with the live
# ^TNX quote sitting next to them on the dashboard.
_TREASURY_CSV = (
    "https://home.treasury.gov/resource-center/data-chart-center/interest-rates/"
    "daily-treasury-rates.csv/{year}/all"
    "?type=daily_treasury_yield_curve&field_tdr_date_value={year}&page&_format=csv"
)
_TENOR_RE = re.compile(r"^\s*(\d+(?:\.\d+)?)\s*(mo|month|yr|year)s?\s*$", re.I)
_curve_cache: tuple[float, dict] | None = None
_CURVE_TTL = 900.0  # the file is rewritten once a day, ~4pm ET


def _tenor(header: str) -> tuple[float, str] | None:
    """'1 Mo' -> (1, '1M'), '1.5 Month' -> (1.5, '1.5M'), '10 Yr' -> (120, '10Y').

    Treasury is inconsistent inside its own header row ('1.5 Month' sitting next
    to '2 Mo'), so match on the unit rather than on an exact spelling.
    """
    m = _TENOR_RE.match(header)
    if not m:
        return None
    n = float(m.group(1))
    yearly = m.group(2).lower().startswith("y")
    return (n * 12 if yearly else n, f"{n:g}{'Y' if yearly else 'M'}")


def parse_treasury_curve(text: str) -> dict | None:
    """The newest row of the Treasury daily CSV, as curve points.

    Rows arrive newest-first today, but that is not contractual — the row is
    chosen by parsed date. A blank cell means the tenor was not quoted that day:
    it is dropped, never coerced to 0.0.
    """
    rows = list(csv.reader(io.StringIO(text)))
    if len(rows) < 2 or not rows[0] or rows[0][0].strip().lower() != "date":
        return None
    header = rows[0]
    tenors = [(i, *t) for i, h in enumerate(header) if i and (t := _tenor(h))]
    if not tenors:
        return None
    best: tuple[datetime.date, list[str]] | None = None
    for row in rows[1:]:
        if len(row) != len(header):
            continue
        try:
            day = datetime.datetime.strptime(row[0].strip(), "%m/%d/%Y").date()
        except ValueError:
            continue
        if best is None or day > best[0]:
            best = (day, row)
    if best is None:
        return None
    day, row = best
    points = [{"label": label, "months": months, "yield": round(v, 3)}
              for i, months, label in tenors
              if (v := _num(row[i].strip())) is not None]
    if len(points) < 2:
        return None
    return {"source": "US TREASURY", "asOf": day.isoformat(), "points": points}


def fetch_treasury_curve() -> dict | None:
    """Cached Treasury curve. Falls back to last year's file during the first
    days of January, when the current year's file can still be empty. A failure
    is never cached — a transient 503 must not blank the panel for 15 minutes.
    """
    global _curve_cache
    now = time.time()
    if _curve_cache and now - _curve_cache[0] < _CURVE_TTL:
        return _curve_cache[1]
    year = datetime.date.today().year
    for y in (year, year - 1):
        text = _http_text(_TREASURY_CSV.format(year=y), timeout=12.0)
        if text and (curve := parse_treasury_curve(text)):
            _curve_cache = (now, curve)
            return curve
    return None


def build_curve() -> dict:
    """The US Treasury par yield curve, with FRED as a fallback.

    The payload carries `source` and `asOf` because a curve with no date invites
    exactly the wrong comparison — against a live quote from a different
    session. 2s10s stays in percentage points here; the UI renders it in bp.
    """
    curve = fetch_treasury_curve() or _fred_curve()
    if curve is None:
        return {"available": False, "source": None, "asOf": None,
                "points": [], "spread2s10s": None, "inverted": False}
    by_months = {p["months"]: p["yield"] for p in curve["points"]}
    spread = None
    if 24 in by_months and 120 in by_months:
        spread = round(by_months[120] - by_months[24], 2)
    return {"available": True, "source": curve["source"], "asOf": curve["asOf"],
            "points": curve["points"], "spread2s10s": spread,
            "inverted": spread is not None and spread < 0}


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


# --- Cross-asset correlations (real history) --------------------------------

CORR_ASSETS = [
    ("^GSPC", "S&P 500"), ("^NDX", "Nasdaq"), ("^RUT", "Russell 2K"),
    ("GC=F", "Gold"), ("CL=F", "WTI Oil"), ("BTC-USD", "Bitcoin"),
    ("DX-Y.NYB", "US Dollar"), ("^TNX", "US 10Y"), ("TLT", "Long Bonds"),
]
_corr_cache: tuple[float, dict] | None = None
_CORR_TTL = 3600.0


_SERIES_WORKERS = 8


def _day_series(ysym: str, tf: str) -> dict[int, float]:
    """Daily close keyed by UTC day (robust alignment across asset calendars)."""
    c = providers.yahoo_candles_raw(ysym, tf)
    if not c:
        return {}
    return {p["time"] // 86400: p["value"] for p in c["points"]}


def _day_series_many(ysyms: list[str], tf: str) -> dict[str, dict[int, float]]:
    """The same fetch for a whole basket at once.

    Yahoo exposes no batch endpoint for candles the way it does for quotes, so
    this is plain concurrency: the RRG's 12 histories cost ~1.9s one after
    another and ~0.3s together. `ThreadPoolExecutor.map` preserves order, which
    is what keeps each series with the symbol it belongs to.
    """
    if not ysyms:
        return {}
    with ThreadPoolExecutor(max_workers=min(len(ysyms), _SERIES_WORKERS)) as ex:
        return dict(zip(ysyms, ex.map(lambda s: _day_series(s, tf), ysyms)))


def build_correlations() -> dict:
    global _corr_cache
    now = time.time()
    if _corr_cache and now - _corr_cache[0] < _CORR_TTL:
        return _corr_cache[1]

    series = _day_series_many([sym for sym, _ in CORR_ASSETS], "3M")
    series = {s: d for s, d in series.items() if len(d) > 15}
    out = {"available": False, "labels": [], "matrix": []}
    if len(series) >= 3:
        common = sorted(set.intersection(*[set(d) for d in series.values()]))
        if len(common) >= 12:
            syms = list(series)
            mat = np.array([[series[s][day] for day in common] for s in syms])
            rets = np.diff(np.log(mat), axis=1)
            corr = np.corrcoef(rets)
            names = dict(CORR_ASSETS)
            out = {
                "available": True,
                "labels": [names[s] for s in syms],
                "matrix": [[round(float(corr[i][j]), 2) for j in range(len(syms))]
                           for i in range(len(syms))],
            }
    _corr_cache = (now, out)
    return out


# --- Sector RRG (Relative Rotation Graph) -----------------------------------

RRG_BENCH = "SPY"
_RRG_N, _RRG_M = 21, 10            # RS-Ratio / RS-Momentum smoothing (trading days)
_RRG_STRIDE, _RRG_TRAIL = 5, 5     # weekly sampling, ~5 weeks of tail
_rrg_cache: tuple[float, dict] | None = None
_RRG_TTL = 3600.0


def _sma(a: np.ndarray, n: int) -> np.ndarray:
    return np.convolve(a, np.ones(n) / n, mode="valid")


def _quadrant(x: float, y: float) -> str:
    if x >= 100 and y >= 100:
        return "leading"
    if x >= 100:
        return "weakening"
    if y >= 100:
        return "improving"
    return "lagging"


def build_rrg() -> dict:
    global _rrg_cache
    now = time.time()
    if _rrg_cache and now - _rrg_cache[0] < _RRG_TTL:
        return _rrg_cache[1]

    # One pass for the benchmark and all 11 sectors; the length guard below is
    # unchanged, it just runs after the fetch instead of gating it.
    hist = _day_series_many([RRG_BENCH] + [s for s, _ in SECTORS], "6M")
    bench = hist.get(RRG_BENCH, {})
    sectors = []
    if len(bench) >= 40:
        for sym, label in SECTORS:
            sec = hist.get(sym, {})
            days = sorted(set(sec) & set(bench))
            if len(days) < _RRG_N + _RRG_M + _RRG_STRIDE * _RRG_TRAIL:
                continue
            rs = np.array([sec[d] / bench[d] for d in days])
            ratio = 100 * rs[_RRG_N - 1:] / _sma(rs, _RRG_N)
            mom = 100 * ratio[_RRG_M - 1:] / _sma(ratio, _RRG_M)
            ratio = ratio[_RRG_M - 1:]  # align to mom
            # sample weekly, most-recent-last, for a short smooth tail
            idx = sorted(list(range(len(mom) - 1, -1, -_RRG_STRIDE))[:_RRG_TRAIL])
            trail = [{"x": round(float(ratio[k]), 2), "y": round(float(mom[k]), 2)} for k in idx]
            head = trail[-1]
            sectors.append({"symbol": sym, "label": label, "trail": trail,
                            "quadrant": _quadrant(head["x"], head["y"])})
    out = {"available": bool(sectors), "sectors": sectors}
    _rrg_cache = (now, out)
    return out


# --- Market cap (Finnhub, equities only) ------------------------------------

_mktcap_cache: dict[str, tuple[float, dict]] = {}
_MKTCAP_TTL = 3600.0


def market_cap(symbol: str, currency: str = "USD", cat: str = "EQ") -> dict:
    """Market capitalization (absolute currency units) for a **US-listed** equity,
    via Finnhub `stock/profile2` (marketCapitalization is in millions). Everything
    else resolves to None, deliberately -- there is no free source for foreign caps:

    * Finnhub's free profile2 returns 403 for any non-US ticker (MC.PA, 7203.T);
    * a BARE foreign display ticker does resolve, but to a different company --
      LVMH's "MC" returns Moelis & Co, which is how a $5.5B cap ended up on a
      ~EUR 220B stock;
    * Yahoo's marketCap only lives on quoteSummary / v7 quote, both 401 without a
      crumb, and the chart `meta` we do have access to does not carry it.

    Showing nothing beats showing another company's number.

    `currency` and `cat` come from the registered asset and are the robust guard:
    unlike YAHOO_MAP they survive the symbol being unregistered (a watchlist
    removal or a backend restart empties it, and the old `.get(symbol, symbol)`
    fallback then made a foreign "MC" look US-listed)."""
    now = time.time()
    key = f"{symbol}|{(currency or 'USD').upper()}|{cat}"
    if key in _mktcap_cache and now - _mktcap_cache[key][0] < _MKTCAP_TTL:
        return _mktcap_cache[key][1]
    out = {"marketCap": None, "currency": None}
    ysym = providers.YAHOO_MAP.get(symbol)   # no fallback: unknown -> no guess
    us_listed = (
        cat == "EQ"
        and (currency or "USD").upper() == "USD"
        and ysym is not None
        # exchange suffix / index / FX / crypto
        and not any(ch in ysym for ch in (".", "^", "=", "-"))
    )
    if us_listed:
        data = _finnhub_get("stock/profile2", {"symbol": symbol})
        if isinstance(data, dict) and data.get("marketCapitalization"):
            out = {"marketCap": round(float(data["marketCapitalization"]) * 1e6),
                   "currency": data.get("currency")}
    _mktcap_cache[key] = (now, out)
    return out

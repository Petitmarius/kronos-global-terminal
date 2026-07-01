"""Macro dashboard data layer.

Two data planes:
  - Yahoo (keyless): the "board" — rates majors, VIX, DXY, sectors, cross-asset.
  - FRED (free key): economic indicators, full yield curve, latest releases.
FRED functions degrade to {"available": False} when no key is configured.
"""
from __future__ import annotations

import time
import urllib.parse

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

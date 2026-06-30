"""Deterministic mock market data for the APEX terminal.

Everything is generated from a stable per-symbol seed so the interface looks
alive but stays consistent across reruns (prices, charts and the order book do
not jump around every time Streamlit redraws the page).
"""
from __future__ import annotations

import numpy as np

# ----------------------------------------------------------------------------
# Static universe.  (symbol, full name, category, last price, daily %, digits)
# ----------------------------------------------------------------------------
_RAW = [
    ("NAS100",  "NASDAQ 100 Index",      "INDEX",  22700.00, -0.77, 2),
    ("US30",    "Dow Jones 30",          "INDEX",  43210.50,  0.21, 2),
    ("SPX500",  "S&P 500 Index",         "INDEX",   5912.30, -0.18, 2),
    ("GER40",   "DAX 40 Index",          "INDEX",  18540.00,  0.44, 2),
    ("UK100",   "FTSE 100 Index",        "INDEX",   8210.40, -0.09, 2),
    ("EURUSD",  "Euro / US Dollar",      "FX",         1.08563,  0.12, 5),
    ("GBPUSD",  "British Pound / USD",   "FX",         1.27840, -0.23, 5),
    ("USDJPY",  "US Dollar / Yen",       "FX",       158.852,   0.31, 3),
    ("AUDUSD",  "Aussie / US Dollar",    "FX",         0.65420, -0.41, 5),
    ("USDCAD",  "US Dollar / Loonie",    "FX",         1.37210,  0.08, 5),
    ("BTCUSD",  "Bitcoin / US Dollar",   "CRYPTO",  64250.00,  2.14, 2),
    ("ETHUSD",  "Ethereum / US Dollar",  "CRYPTO",   3120.50,  1.66, 2),
    ("SOLUSD",  "Solana / US Dollar",    "CRYPTO",    146.20, -3.21, 2),
    ("XRPUSD",  "Ripple / US Dollar",    "CRYPTO",      0.5234, -1.12, 4),
    ("AAPL",    "Apple Inc.",            "EQ",        212.45,  0.54, 2),
    ("NVDA",    "NVIDIA Corp.",          "EQ",        126.80,  3.42, 2),
    ("TSLA",    "Tesla Inc.",            "EQ",        184.30, -2.05, 2),
    ("MSFT",    "Microsoft Corp.",       "EQ",        441.20,  0.36, 2),
    ("AMZN",    "Amazon.com Inc.",       "EQ",        186.10, -0.62, 2),
    ("XAUUSD",  "Gold Spot / USD",       "CMD",      5172.00,  0.12, 2),
    ("XAGUSD",  "Silver Spot / USD",     "CMD",        31.45, -0.88, 2),
    ("WTI",     "Crude Oil WTI",         "CMD",        78.34,  1.05, 2),
    ("BRENT",   "Brent Crude Oil",       "CMD",        82.10,  0.92, 2),
    ("NATGAS",  "Natural Gas",           "CMD",         2.845, -1.74, 3),
]

CATEGORIES = ["ALL", "FX", "CRYPTO", "INDEX", "EQ", "CMD"]

ASSETS: dict[str, dict] = {}
for _sym, _name, _cat, _price, _pct, _dig in _RAW:
    ASSETS[_sym] = {
        "symbol": _sym,
        "name": _name,
        "cat": _cat,
        "price": _price,
        "pct": _pct,
        "chg": _price * _pct / 100.0,
        "digits": _dig,
    }

DEFAULT_SYMBOL = "NAS100"

# Hand-set market grid for the headline instrument so it matches the blueprint.
_NAS100_STATS = {
    "OPEN": 22867.0, "HIGH": 22825.0, "LOW": 22669.0, "PREV CLOSE": 22876.0,
    "52W HI": 23950.0, "52W LO": 16800.0, "VOLUME": None, "SPREAD": 2.0,
}


def _seed(symbol: str, salt: str = "") -> int:
    return abs(hash(f"{symbol}|{salt}")) % (2**32)


def fmt(value: float | None, digits: int) -> str:
    """Format a price with thousands separators, or an em dash when missing."""
    if value is None:
        return "—"
    return f"{value:,.{digits}f}"


def market_stats(symbol: str) -> dict:
    """Return the 8-cell market data grid for *symbol*."""
    a = ASSETS[symbol]
    digits = a["digits"]
    if symbol == "NAS100":
        stats = dict(_NAS100_STATS)
    else:
        rng = np.random.default_rng(_seed(symbol, "stats"))
        price, prev = a["price"], a["price"] - a["chg"]
        span = abs(price) * 0.006 + 10 ** -digits
        hi = max(price, prev) + rng.uniform(0.2, 1.0) * span
        lo = min(price, prev) - rng.uniform(0.2, 1.0) * span
        vol = float(rng.integers(40, 980)) * (10 ** (3 if a["cat"] in ("EQ", "CRYPTO") else 0))
        stats = {
            "OPEN": prev + rng.uniform(-0.3, 0.3) * span,
            "HIGH": hi,
            "LOW": lo,
            "PREV CLOSE": prev,
            "52W HI": price * (1.18 + rng.uniform(0, 0.25)),
            "52W LO": price * (0.62 - rng.uniform(0, 0.18)),
            "VOLUME": vol,
            "SPREAD": round(span * 0.05, max(1, digits - 1)),
        }
    return stats


# Number of points and relative volatility per timeframe.
_TF = {
    "1m":  (90,  0.10),
    "5m":  (96,  0.22),
    "15m": (104, 0.40),
    "1h":  (120, 0.70),
    "4h":  (140, 1.10),
    "1D":  (160, 1.60),
}
TIMEFRAMES = list(_TF.keys())


def price_series(symbol: str, timeframe: str) -> np.ndarray:
    """Deterministic random-walk that *ends* at the asset's current price and
    leans in the direction of the day's move."""
    a = ASSETS[symbol]
    n, vmul = _TF.get(timeframe, _TF["1D"])
    rng = np.random.default_rng(_seed(symbol, timeframe))

    price = a["price"]
    vol = price * 0.0018 * vmul
    drift = (a["chg"] / max(n, 1)) * 0.9
    steps = rng.normal(drift, vol, n)
    walk = np.cumsum(steps)

    start = price - a["chg"]                # roughly the open
    series = start + walk
    series += np.linspace(0, price - series[-1], n)  # pin the final point to "now"
    return series


def order_book(symbol: str, levels: int = 5) -> dict:
    """Generate a depth-of-market snapshot around the current price."""
    a = ASSETS[symbol]
    digits = a["digits"]
    rng = np.random.default_rng(_seed(symbol, "book"))

    if symbol == "NAS100":
        bid, ask = 22697.75, 22702.11
    else:
        tick = max(10 ** -digits, a["price"] * 5e-5)
        spread = tick * rng.uniform(1.5, 4.0)
        bid = a["price"] - spread / 2
        ask = a["price"] + spread / 2

    step = (ask - bid) if (ask - bid) > 0 else max(10 ** -digits, a["price"] * 1e-4)

    asks, bids = [], []
    cum = 0.0
    for i in range(levels):
        size = int(rng.integers(60, 480))
        cum += size
        price = ask + step * i
        asks.append({"price": price, "size": size, "total": cum * price})
    cum = 0.0
    for i in range(levels):
        size = int(rng.integers(60, 480))
        cum += size
        price = bid - step * i
        bids.append({"price": price, "size": size, "total": cum * price})

    max_size = max([l["size"] for l in asks + bids] + [1])
    return {
        "asks": asks, "bids": bids,
        "bid": bid, "ask": ask, "spread": ask - bid,
        "max_size": max_size, "digits": digits,
    }


def ticker_items() -> list[dict]:
    """Subset of headline instruments for the scrolling ticker tape."""
    syms = ["XAUUSD", "USDJPY", "NVDA", "TSLA", "BTCUSD", "EURUSD",
            "NAS100", "SPX500", "ETHUSD", "WTI", "AAPL", "GER40"]
    return [ASSETS[s] for s in syms if s in ASSETS]

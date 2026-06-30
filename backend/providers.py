"""Keyless real-market data via the Yahoo Finance chart API.

Covers every asset class (indices, stocks, forex, crypto, commodities) with
both historical candles and live-ish quotes (price + previous close). Used for:
  - real chart history that matches the selected timeframe, and
  - live prices for instruments Finnhub does not stream (indices, commodities).

Small in-memory TTL caches keep us well under Yahoo's rate limits.
"""
from __future__ import annotations

import json
import time
import urllib.parse
import urllib.request

# our symbol -> Yahoo symbol
YAHOO_MAP = {
    "NAS100": "^NDX", "US30": "^DJI", "SPX500": "^GSPC", "GER40": "^GDAXI", "UK100": "^FTSE",
    "EURUSD": "EURUSD=X", "GBPUSD": "GBPUSD=X", "USDJPY": "USDJPY=X",
    "AUDUSD": "AUDUSD=X", "USDCAD": "USDCAD=X",
    "BTCUSD": "BTC-USD", "ETHUSD": "ETH-USD", "SOLUSD": "SOL-USD", "XRPUSD": "XRP-USD",
    "AAPL": "AAPL", "NVDA": "NVDA", "TSLA": "TSLA", "MSFT": "MSFT", "AMZN": "AMZN",
    "XAUUSD": "GC=F", "XAGUSD": "SI=F", "WTI": "CL=F", "BRENT": "BZ=F", "NATGAS": "NG=F",
}

# our timeframe (= visible range) -> (yahoo interval, yahoo range)
# the interval is chosen so the bottom axis labels match the range
_YF_TF = {
    "1D":  ("5m",  "1d"),    # intraday today  -> HH:MM
    "1W":  ("30m", "5d"),    # ~1 week         -> days
    "1M":  ("60m", "1mo"),   # 1 month         -> days
    "3M":  ("1d",  "3mo"),   # 3 months        -> months
    "6M":  ("1d",  "6mo"),
    "YTD": ("1d",  "ytd"),
    "1Y":  ("1d",  "1y"),
    "5Y":  ("1wk", "5y"),    # 5 years         -> years
    "MAX": ("1mo", "max"),
}

_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
_BASE = "https://query1.finance.yahoo.com/v8/finance/chart/"

_candle_cache: dict[tuple[str, str], tuple[float, dict]] = {}
_quote_cache: dict[str, tuple[float, dict]] = {}
_CANDLE_TTL = 25.0
_QUOTE_TTL = 4.0


def _get(url: str, timeout: float = 8.0) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": _UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())


def _chart(ysym: str, interval: str, rng: str) -> dict:
    url = f"{_BASE}{urllib.parse.quote(ysym, safe='')}?interval={interval}&range={rng}"
    return _get(url)


def yahoo_candles(symbol: str, tf: str) -> dict | None:
    ysym = YAHOO_MAP.get(symbol)
    if not ysym:
        return None
    key = (symbol, tf)
    now = time.time()
    if key in _candle_cache and now - _candle_cache[key][0] < _CANDLE_TTL:
        return _candle_cache[key][1]

    interval, rng = _YF_TF.get(tf, ("1d", "6mo"))
    try:
        res = _chart(ysym, interval, rng)["chart"]["result"][0]
        ts = res["timestamp"]
        closes = res["indicators"]["quote"][0]["close"]
    except (KeyError, IndexError, TypeError):
        return None

    points = [{"time": int(t), "value": round(float(c), 6)}
              for t, c in zip(ts, closes) if c is not None]
    if len(points) < 2:
        return None
    out = {"symbol": symbol, "tf": tf, "points": points}
    _candle_cache[key] = (now, out)
    return out


def yahoo_quote(symbol: str) -> dict | None:
    ysym = YAHOO_MAP.get(symbol)
    if not ysym:
        return None
    now = time.time()
    if symbol in _quote_cache and now - _quote_cache[symbol][0] < _QUOTE_TTL:
        return _quote_cache[symbol][1]

    try:
        # range=1d -> chartPreviousClose is the *previous session* close, which
        # gives the correct daily % change (a longer range would compare against
        # a multi-day-old close).
        res = _chart(ysym, "1d", "1d")["chart"]["result"][0]
        meta = res["meta"]
    except (KeyError, IndexError, TypeError):
        return None

    price = meta.get("regularMarketPrice")
    prev = meta.get("previousClose") or meta.get("chartPreviousClose")
    if not price or not prev:
        return None

    o = meta.get("regularMarketOpen")
    h = meta.get("regularMarketDayHigh")
    l = meta.get("regularMarketDayLow")
    if o is None or h is None or l is None:
        try:
            q = res["indicators"]["quote"][0]
            closes = q.get("close", [])
            for i in range(len(closes) - 1, -1, -1):
                if closes[i] is not None:
                    o = o if o is not None else q["open"][i]
                    h = h if h is not None else q["high"][i]
                    l = l if l is not None else q["low"][i]
                    break
        except (KeyError, IndexError, TypeError):
            pass

    out = {"price": float(price), "prevClose": float(prev),
           "open": float(o) if o else None, "high": float(h) if h else None,
           "low": float(l) if l else None}
    _quote_cache[symbol] = (now, out)
    return out


_TYPE_CAT = {
    "EQUITY": "EQ", "ETF": "EQ", "MUTUALFUND": "EQ",
    "INDEX": "INDEX", "CURRENCY": "FX",
    "CRYPTOCURRENCY": "CRYPTO", "FUTURE": "CMD", "COMMODITY": "CMD",
}


def yahoo_search(q: str) -> list[dict]:
    """Search Yahoo for tradable symbols to add to the watchlist."""
    q = (q or "").strip()
    if not q:
        return []
    try:
        url = (f"https://query1.finance.yahoo.com/v1/finance/search?q={urllib.parse.quote(q)}"
               f"&quotesCount=8&newsCount=0")
        d = _get(url)
    except Exception:  # noqa: BLE001
        return []
    out = []
    for it in d.get("quotes", []):
        sym, qt = it.get("symbol"), it.get("quoteType")
        if not sym or qt not in _TYPE_CAT:
            continue
        out.append({
            "symbol": sym,
            "name": it.get("shortname") or it.get("longname") or sym,
            "cat": _TYPE_CAT[qt],
            "exch": it.get("exchDisp") or "",
        })
    return out


def register_symbol(local: str, ysym: str) -> None:
    """Make a custom symbol resolvable by yahoo_candles / yahoo_quote."""
    YAHOO_MAP.setdefault(local, ysym)


def unregister_symbol(local: str) -> None:
    YAHOO_MAP.pop(local, None)
    _quote_cache.pop(local, None)

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
from concurrent.futures import ThreadPoolExecutor

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
_INTRADAY = {"1m", "2m", "5m", "15m", "30m", "60m", "90m", "1h"}

_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
_BASE = "https://query1.finance.yahoo.com/v8/finance/chart/"

_candle_cache: dict[tuple[str, str], tuple[float, dict]] = {}
_raw_candle_cache: dict[tuple[str, str], tuple[float, dict]] = {}
_quote_cache: dict[str, tuple[float, dict]] = {}
_raw_quote_cache: dict[str, tuple[float, dict]] = {}
_CANDLE_TTL = 25.0
_QUOTE_TTL = 4.0
# Candle TTL by bar size. A chart request is the one Yahoo call that scales with
# TRAFFIC -- the warm loops cost the same whether one visitor is connected or a
# thousand -- and the portfolio equity curve fires one per held symbol. Holding a
# DAILY series for 25s re-downloads three months of history to learn nothing:
# within a session only the last bar moves, and the client overwrites that one
# from the live tick (`PriceChart` lastBarRef), so the refetch never carried the
# update anyway. The cost of a longer TTL is that a NEW bar shows up late, which
# is why it is minutes for daily bars and an hour for weekly/monthly ones.
_CANDLE_TTL_BY_INTERVAL = {"1d": 900.0, "1wk": 3600.0, "1mo": 3600.0}


def _candle_ttl(tf: str) -> float:
    interval, _rng = _YF_TF.get(tf, ("1d", "6mo"))
    return _CANDLE_TTL_BY_INTERVAL.get(interval, _CANDLE_TTL)


def _get(url: str, timeout: float = 8.0) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": _UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())


# `_get` raises TRANSPORT errors, not shape errors, and the two need catching
# together. A dead symbol 404s, a throttled client gets 429 -- both HTTPError,
# which derives from OSError like URLError does; a read timeout is TimeoutError
# (also OSError); an HTML error page decodes as ValueError. Catching only the
# shape errors let every one of those escape into FastAPI as a 500, which is the
# opposite of this app's contract: an instrument nobody can price reads as
# "no data", never as a crashed panel.
_PROVIDER_ERRORS = (KeyError, IndexError, TypeError, OSError, ValueError)


def _chart(ysym: str, interval: str, rng: str) -> dict:
    url = f"{_BASE}{urllib.parse.quote(ysym, safe='')}?interval={interval}&range={rng}"
    return _get(url)


def _candles_from_chart(ysym: str, tf: str) -> list[dict] | None:
    """Fetch a Yahoo chart for a raw Yahoo symbol and return line points."""
    interval, rng = _YF_TF.get(tf, ("1d", "6mo"))
    try:
        res = _chart(ysym, interval, rng)["chart"]["result"][0]
        ts = res["timestamp"]
        q = res["indicators"]["quote"][0]
        closes = q["close"]
        opens = q.get("open", [])
        highs = q.get("high", [])
        lows = q.get("low", [])
        vols = q.get("volume", [])
    except _PROVIDER_ERRORS:
        return None

    points = []
    first_idx = None
    for i, (t, c) in enumerate(zip(ts, closes)):
        if c is None:
            continue
        if first_idx is None:
            first_idx = i
        points.append({
            "time": int(t), "value": round(float(c), 6),
            "open": round(float(opens[i]), 6) if i < len(opens) and opens[i] is not None else None,
            "high": round(float(highs[i]), 6) if i < len(highs) and highs[i] is not None else None,
            "low": round(float(lows[i]), 6) if i < len(lows) and lows[i] is not None else None,
            "volume": int(vols[i]) if i < len(vols) and vols[i] is not None else None,
        })
    if len(points) < 2:
        return None

    # Intraday: the first bar's CLOSE is already a few minutes into the session
    # and sits above the open. Start the line at the real session OPEN so the
    # chart's left edge matches the day's open (and the grid OPEN cell).
    if interval in _INTRADAY and first_idx is not None and first_idx < len(opens):
        o0 = opens[first_idx]
        if o0 is not None:
            points[0]["value"] = round(float(o0), 6)
    return points


def yahoo_candles(symbol: str, tf: str) -> dict | None:
    ysym = YAHOO_MAP.get(symbol)
    if not ysym:
        return None
    key = (symbol, tf)
    now = time.time()
    if key in _candle_cache and now - _candle_cache[key][0] < _candle_ttl(tf):
        return _candle_cache[key][1]

    points = _candles_from_chart(ysym, tf)
    if points is None:
        return None
    out = {"symbol": symbol, "tf": tf, "points": points}
    _candle_cache[key] = (now, out)
    return out


def yahoo_candles_raw(ysym: str, tf: str) -> dict | None:
    """Candles for an arbitrary Yahoo symbol (no YAHOO_MAP entry needed).

    Used by the Macro Dashboard to chart instruments outside the tradable
    universe, e.g. the real Dollar index (DX-Y.NYB)."""
    key = (ysym, tf)
    now = time.time()
    if key in _raw_candle_cache and now - _raw_candle_cache[key][0] < _candle_ttl(tf):
        return _raw_candle_cache[key][1]
    points = _candles_from_chart(ysym, tf)
    if points is None:
        return _raw_candle_cache.get(key, (0, None))[1]  # stale fallback
    out = {"symbol": ysym, "tf": tf, "points": points}
    _raw_candle_cache[key] = (now, out)
    return out


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
        "currency": meta.get("currency"),
        "w52high": meta.get("fiftyTwoWeekHigh"),
        "w52low": meta.get("fiftyTwoWeekLow"),
        "volume": meta.get("regularMarketVolume"),
    }


def yahoo_quote_raw(ysym: str) -> dict | None:
    """Quote for an arbitrary Yahoo symbol (no YAHOO_MAP entry needed)."""
    now = time.time()
    if ysym in _raw_quote_cache and now - _raw_quote_cache[ysym][0] < _QUOTE_TTL:
        return _raw_quote_cache[ysym][1]
    try:
        meta = _chart(ysym, "1d", "1d")["chart"]["result"][0]["meta"]
    except _PROVIDER_ERRORS:
        return _raw_quote_cache.get(ysym, (0, None))[1]  # stale fallback
    q = quote_from_meta(meta)
    if q:
        _raw_quote_cache[ysym] = (now, q)
    return q


# --- Batched quotes (Yahoo /v8/finance/spark) --------------------------------

# One request carries many symbols, which is what the macro and world boards
# need: 37 symbols cost 4.3s fetched one by one and 0.11s batched. Spark returns
# only the close series and the previous close -- no OHLC, no 52-week range, no
# volume -- so it feeds those boards and never the terminal's quote path.
_SPARK = "https://query1.finance.yahoo.com/v8/finance/spark"
_SPARK_MAX = 18          # 25 symbols answers HTTP 400; 20 is the observed ceiling
_SPARK_WORKERS = 4


def _chunks(seq: list, n: int) -> "list[list]":
    return [seq[i:i + n] for i in range(0, len(seq), n)]


def spark_quotes(payload) -> dict[str, dict]:
    """A spark response -> {symbol: {price, prevClose, pct}}.

    `previousClose` is frequently null in the live payload and the usable value
    sits in `chartPreviousClose`, so both are tried.

    A symbol whose close series is empty or all-null is left OUT rather than
    zeroed, so the caller retries it on its own: thin or closed markets (^IPSA,
    IMOEX.ME) come back empty here while the per-symbol chart endpoint answers.
    """
    out: dict[str, dict] = {}
    if not isinstance(payload, dict):
        return out
    for sym, v in payload.items():
        if not isinstance(v, dict):
            continue
        closes = v.get("close")
        if not isinstance(closes, (list, tuple)):
            continue
        price = next((float(c) for c in reversed(closes)
                      if isinstance(c, (int, float)) and not isinstance(c, bool)), None)
        prev = v.get("previousClose") or v.get("chartPreviousClose")
        if price is None or not isinstance(prev, (int, float)) or isinstance(prev, bool) or not prev:
            continue
        prev = float(prev)
        out[sym] = {"price": price, "prevClose": prev, "pct": (price / prev - 1.0) * 100.0}
    return out


def _spark_fetch(symbols: list[str]) -> dict:
    q = urllib.parse.quote(",".join(symbols), safe="")
    return _get(f"{_SPARK}?symbols={q}&range=1d&interval=1d")


def _spark_safe(symbols: list[str]) -> dict:
    try:
        return _spark_fetch(symbols)
    except Exception:  # noqa: BLE001 -- a dead batch degrades to the per-symbol path
        return {}


def yahoo_quotes_batch(symbols: list[str]) -> dict[str, dict]:
    """Quotes for many Yahoo symbols in a handful of requests instead of one each.

    Anything the batch cannot price falls back to the per-symbol chart endpoint,
    so neither a spark outage nor a thin market blanks a board. A symbol no
    source can price is simply absent from the result -- never a zero.
    """
    syms = list(dict.fromkeys(symbols))
    out: dict[str, dict] = {}
    batches = _chunks(syms, _SPARK_MAX)
    if batches:
        with ThreadPoolExecutor(max_workers=min(len(batches), _SPARK_WORKERS)) as ex:
            for payload in ex.map(_spark_safe, batches):
                out.update(spark_quotes(payload))
    # Kept deliberately narrow: the fallback exists for the handful of thin
    # markets spark cannot price, but it is also what a total spark outage lands
    # on, and that is 79 chart requests per warm cycle. Same width as the batch
    # path so a degraded cycle is no burstier than a healthy one.
    gaps = [s for s in syms if s not in out]
    if gaps:
        with ThreadPoolExecutor(max_workers=min(len(gaps), _SPARK_WORKERS)) as ex:
            for sym, q in zip(gaps, ex.map(yahoo_quote_raw, gaps)):
                if q:
                    out[sym] = q
    return out


_fx_cache: dict[str, tuple[float, float]] = {}   # currency -> (ts, rate)
_FX_TTL = 60.0


def usd_rate(currency: str) -> float:
    """USD per 1 unit of `currency` (EUR->~1.08, JPY->~0.0063). Cached ~60s.
    USD passes through as 1.0; a failed lookup returns the last known rate (else 1.0)."""
    cur = (currency or "USD").upper()
    if cur == "USD":
        return 1.0
    now = time.time()
    c = _fx_cache.get(cur)
    if c and now - c[0] < _FX_TTL:
        return c[1]
    q = yahoo_quote_raw(f"{cur}USD=X")
    if q and q.get("price"):
        rate = float(q["price"])
        _fx_cache[cur] = (now, rate)
        return rate
    return c[1] if c else 1.0


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
    except _PROVIDER_ERRORS:
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
           "low": float(l) if l else None, "currency": meta.get("currency"),
           "w52high": meta.get("fiftyTwoWeekHigh"), "w52low": meta.get("fiftyTwoWeekLow"),
           "volume": meta.get("regularMarketVolume")}
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

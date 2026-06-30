"""In-memory market state: live/simulated quotes, candles and depth-of-market."""
from __future__ import annotations

import datetime
import time

import numpy as np

import assets as assets_mod

# per-tick simulator volatility by asset class
_VOL = {"FX": 0.00025, "CRYPTO": 0.0014, "INDEX": 0.00045, "EQ": 0.0010, "CMD": 0.0007}
# timeframe (= visible range) -> (points, seconds per bar, amplitude multiplier)
# only used as a synthetic fallback when the real provider is unavailable
_TF = {
    "1D":  (78,  300,       0.15),   # ~1 trading day of 5-min bars
    "1W":  (66,  1800,      0.40),
    "1M":  (150, 3600,      0.80),
    "3M":  (66,  86400,     1.10),
    "6M":  (130, 86400,     1.40),
    "YTD": (0,   86400,     1.40),   # points computed from Jan 1
    "1Y":  (252, 86400,     1.80),
    "5Y":  (260, 604800,    3.00),
    "MAX": (240, 2592000,   4.50),   # ~20 years of monthly bars
}
TIMEFRAMES = list(_TF.keys())


def _seed(*parts) -> int:
    return abs(hash("|".join(map(str, parts)))) % (2**32)


class MarketState:
    def __init__(self) -> None:
        self._rng = np.random.default_rng(7)
        self.assets: dict[str, dict] = {}
        for a in assets_mod.universe():
            sym = a["symbol"]
            rng = np.random.default_rng(_seed(sym, "stats"))
            price, prev = a["price"], a["prev_close"]
            span = abs(price) * 0.007 + 10 ** -a["digits"]
            hi = max(price, prev) + rng.uniform(0.2, 1.0) * span
            lo = min(price, prev) - rng.uniform(0.2, 1.0) * span
            vol = float(rng.integers(40, 980)) * (1000 if a["cat"] in ("EQ", "CRYPTO") else 1)
            self.assets[sym] = {
                **a,
                "open": prev + rng.uniform(-0.3, 0.3) * span,
                "high": hi, "low": lo,
                "w52high": price * (1.18 + rng.uniform(0, 0.25)),
                "w52low": price * (0.62 - rng.uniform(0, 0.18)),
                "volume": vol,
                "spread": round(span * 0.05, max(1, a["digits"] - 1)),
                "source": "sim",
                "pc_real": False,   # True once a real previous close is known
            }

    # -- quote helpers -----------------------------------------------------
    def _quote(self, a: dict) -> dict:
        change = a["price"] - a["prev_close"]
        pct = change / a["prev_close"] * 100 if a["prev_close"] else 0.0
        return {
            "symbol": a["symbol"], "price": round(a["price"], a["digits"]),
            "change": round(change, a["digits"]), "pct": round(pct, 2),
            "source": a["source"], "ts": int(time.time() * 1000),
        }

    def asset_dict(self, a: dict) -> dict:
        q = self._quote(a)
        return {
            **q, "name": a["name"], "cat": a["cat"], "digits": a["digits"],
            "contract": a["contract"],
            "stats": {
                "open": round(a["open"], a["digits"]),
                "high": round(a["high"], a["digits"]),
                "low": round(a["low"], a["digits"]),
                "prevClose": round(a["prev_close"], a["digits"]),
                "w52High": round(a["w52high"], a["digits"]),
                "w52Low": round(a["w52low"], a["digits"]),
                "volume": round(a["volume"]),
                "spread": a["spread"],
            },
        }

    def snapshot(self) -> list[dict]:
        return [self.asset_dict(a) for a in self.assets.values()]

    # -- mutation ----------------------------------------------------------
    def apply_live(self, symbol: str, price: float) -> dict | None:
        a = self.assets.get(symbol)
        if not a or price <= 0:
            return None
        # First live tick on a symbol with no real previous close: anchor the
        # baseline to it so the % change starts near 0 instead of comparing a
        # real price against a stale seeded close (which produced absurd %).
        if not a["pc_real"] and a["source"] == "sim":
            a["prev_close"] = price
            a["open"] = price
            a["high"] = price
            a["low"] = price
        a["price"] = price
        a["source"] = "live"
        a["high"] = max(a["high"], price)
        a["low"] = min(a["low"], price)
        return self._quote(a)

    def apply_stats(self, symbol: str, price: float, prev_close: float,
                    open_: float, high: float, low: float) -> dict | None:
        """Set a full real quote (price + previous close + OHLC). Used for
        instruments whose live source is a REST poll (indices, commodities)."""
        a = self.assets.get(symbol)
        if not a or price <= 0 or prev_close <= 0:
            return None
        a["price"] = price
        a["prev_close"] = prev_close
        a["open"] = open_ if open_ and open_ > 0 else prev_close
        a["high"] = max(high or price, price)
        a["low"] = min(low or price, price)
        a["pc_real"] = True
        a["source"] = "live"
        return self._quote(a)

    def apply_baseline(self, symbol: str, price: float, prev_close: float,
                       open_: float, high: float, low: float) -> dict | None:
        """Refresh the real daily baseline (previous close / OHLC) without
        overwriting a faster websocket price. If the symbol has no live price
        yet, bootstrap it from this quote."""
        a = self.assets.get(symbol)
        if not a or prev_close <= 0:
            return None
        a["prev_close"] = prev_close
        if open_ and open_ > 0:
            a["open"] = open_
        if high:
            a["high"] = max(a["high"], high, a["price"])
        if low:
            a["low"] = min(a["low"], low) if a["low"] else low
        a["pc_real"] = True
        if a["source"] == "sim" and price > 0:   # not yet streaming: bootstrap
            a["price"] = price
            a["source"] = "live"
        return self._quote(a)

    def sim_step(self) -> list[dict]:
        """Advance every simulated asset one mean-reverting random-walk step."""
        out = []
        for a in self.assets.values():
            if a["source"] == "live":
                continue
            vol = _VOL.get(a["cat"], 0.0006)
            shock = float(self._rng.normal(0, vol))
            revert = (a["prev_close"] - a["price"]) / a["prev_close"] * 0.015
            a["price"] = max(a["price"] * (1 + revert + shock), 10 ** -a["digits"])
            a["high"] = max(a["high"], a["price"])
            a["low"] = min(a["low"], a["price"])
            out.append(self._quote(a))
        return out

    def register(self, symbol: str, name: str, cat: str, digits: int,
                 contract: float, quote: dict) -> dict:
        """Add a user-requested instrument to the universe at runtime."""
        price, prev = quote["price"], quote["prevClose"]
        self.assets[symbol] = {
            "symbol": symbol, "name": name, "cat": cat, "digits": digits,
            "contract": contract, "price": price, "prev_close": prev,
            "open": quote.get("open") or prev,
            "high": max(quote.get("high") or price, price),
            "low": min(quote.get("low") or price, price),
            "w52high": price * 1.3, "w52low": price * 0.72,
            "volume": 0.0,
            "spread": round(max(price * 5e-4, 10 ** -digits), max(1, digits - 1)),
            "source": "live", "pc_real": True, "custom": True,
        }
        return self.asset_dict(self.assets[symbol])

    def remove(self, symbol: str) -> bool:
        a = self.assets.get(symbol)
        if a and a.get("custom"):
            del self.assets[symbol]
            return True
        return False

    # -- chart / depth -----------------------------------------------------
    def candles(self, symbol: str, tf: str) -> dict:
        a = self.assets[symbol]
        n, step, vmul = _TF.get(tf, _TF["1D"])
        digits = a["digits"]
        if tf == "YTD":
            jan1 = datetime.datetime(datetime.datetime.utcnow().year, 1, 1)
            n = max((datetime.datetime.utcnow() - jan1).days, 20)

        rng = np.random.default_rng(_seed(symbol, tf))
        price = a["price"]

        # A linear trend from an older `start` price to "now", plus a detrended
        # random walk whose amplitude is always a visible fraction of price.
        # (The previous version added a correction ramp that could swamp the
        # noise and flatten the line — that is what produced the linear charts.)
        net = price * 0.05 * vmul * (1 if rng.random() > 0.45 else -1) * rng.uniform(0.5, 1.4)
        amp = price * 0.018 * vmul
        start = max(price - net, 10 ** -digits)
        base = np.linspace(start, price, n)

        walk = np.cumsum(rng.normal(0, 1, n))
        walk -= np.linspace(walk[0], walk[-1], n)          # zero drift at both ends
        peak = float(np.max(np.abs(walk))) or 1.0
        walk = walk / peak * amp
        series = np.maximum(base + walk, 10 ** -digits)
        series[-1] = price                                  # pin to the live price

        now = int(time.time())
        now -= now % step
        points = [{"time": now - (n - 1 - i) * step, "value": round(float(series[i]), digits)}
                  for i in range(n)]
        return {"symbol": symbol, "tf": tf, "points": points}

    def orderbook(self, symbol: str, levels: int = 6) -> dict:
        a = self.assets[symbol]
        digits = a["digits"]
        rng = np.random.default_rng(_seed(symbol, "book", int(time.time() / 2)))
        tick = max(10 ** -digits, a["price"] * 5e-5)
        spread = tick * rng.uniform(1.5, 4.0)
        bid, ask = a["price"] - spread / 2, a["price"] + spread / 2
        step = ask - bid if ask > bid else tick

        asks, bids, cum = [], [], 0.0
        for i in range(levels):
            size = int(rng.integers(60, 480))
            cum += size
            asks.append({"price": round(ask + step * i, digits), "size": size,
                         "total": round(cum * (ask + step * i))})
        cum = 0.0
        for i in range(levels):
            size = int(rng.integers(60, 480))
            cum += size
            bids.append({"price": round(bid - step * i, digits), "size": size,
                         "total": round(cum * (bid - step * i))})
        max_size = max([l["size"] for l in asks + bids] + [1])
        return {"symbol": symbol, "bid": round(bid, digits), "ask": round(ask, digits),
                "spread": round(ask - bid, digits + 1), "asks": asks, "bids": bids,
                "maxSize": max_size, "digits": digits}


MARKET = MarketState()

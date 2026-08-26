"""In-memory market state: real quotes only, plus depth-of-market.

Nothing here invents a price. An instrument starts with `price = None` and stays
that way until a provider (Yahoo poll / Finnhub websocket) supplies a real one;
the UI renders that absence as "no data". The only synthetic thing left is the
depth-of-market ladder, which has no free L2 source and is derived from the real
price (see `spread_for`).
"""
from __future__ import annotations

import time

import numpy as np

import assets as assets_mod

# Chart ranges. The bars themselves always come from Yahoo (providers.py) --
# there is no synthetic fallback.
TIMEFRAMES = ["1D", "1W", "1M", "3M", "6M", "YTD", "1Y", "5Y", "MAX"]


def spread_for(price: float, digits: int) -> float:
    """Quoted spread, scaled off the REAL price. Feeds the depth-of-market
    ladder; recomputed on every stats refresh so it can never drift onto a
    stale number."""
    return round(max(price * 5e-4, 10 ** -digits), digits)


class MarketState:
    def __init__(self) -> None:
        self.assets: dict[str, dict] = {}
        for a in assets_mod.universe():
            self.assets[a["symbol"]] = {
                **a,
                "open": None, "high": None, "low": None,
                "w52high": None, "w52low": None, "volume": None,
                "spread": None,
                "source": "none",   # 'none' until a provider delivers a real price
                "pc_real": False,   # True once a real previous close is known
                "usd_rate": 1.0,
            }

    # -- quote helpers -----------------------------------------------------
    def _quote(self, a: dict) -> dict:
        """A quote with no real price carries price/change/pct = None. The client
        renders that as "no data" -- it never substitutes a placeholder number."""
        price, prev = a["price"], a["prev_close"]
        d = a["digits"]
        if price is None:
            change = pct = None
        else:
            change = price - prev if prev else None
            pct = round(change / prev * 100, 2) if change is not None and prev else None
            change = round(change, d) if change is not None else None
        w52h, w52l, vol = a.get("w52high"), a.get("w52low"), a.get("volume")
        return {
            "symbol": a["symbol"], "price": round(price, d) if price is not None else None,
            "change": change, "pct": pct,
            "source": a["source"], "ts": int(time.time() * 1000),
            "usdRate": a.get("usd_rate", 1.0),
            "w52High": round(w52h, d) if w52h is not None else None,
            "w52Low": round(w52l, d) if w52l is not None else None,
            "volume": round(vol) if vol is not None else None,
            # The MARKET DATA grid. These used to travel only in the one-shot
            # `snapshot` frame, so a page opened before the first Yahoo poll (or
            # during a throttle) showed "—" for the whole session with no way to
            # recover short of a reload.
            "open": round(a["open"], d) if a.get("open") is not None else None,
            "high": round(a["high"], d) if a.get("high") is not None else None,
            "low": round(a["low"], d) if a.get("low") is not None else None,
            "prevClose": round(prev, d) if prev is not None else None,
            "spread": a.get("spread"),
        }

    def asset_dict(self, a: dict) -> dict:
        q = self._quote(a)
        d = a["digits"]
        rnd = lambda v: round(v, d) if v is not None else None   # noqa: E731
        return {
            **q, "name": a["name"], "cat": a["cat"], "digits": d,
            "contract": a["contract"],
            "currency": a.get("currency", "USD"),
            "usdRate": a.get("usd_rate", 1.0),
            "stats": {
                "open": rnd(a["open"]), "high": rnd(a["high"]), "low": rnd(a["low"]),
                "prevClose": rnd(a["prev_close"]),
                "w52High": rnd(a.get("w52high")), "w52Low": rnd(a.get("w52low")),
                "volume": round(a["volume"]) if a.get("volume") is not None else None,
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
        # First real tick on a symbol with no previous close yet: anchor the
        # baseline to it so the day % starts at 0 rather than dividing by None.
        # baseline_loop replaces it with the true previous close shortly after.
        # One-shot, keyed on `prev_close` alone. Keying it on `pc_real` re-ran the
        # anchor on EVERY tick until Yahoo delivered a real close, which pinned the
        # day change at +0.00% and collapsed high/low onto the last price -- the
        # permanent state of a Finnhub-streamed pair while Yahoo is throttling us.
        if a["prev_close"] is None:
            a["prev_close"] = price
            a["open"] = a["open"] if a["open"] is not None else price
            a["high"] = a["low"] = price
        a["price"] = price
        a["source"] = "live"
        a["high"] = max(a["high"] if a["high"] is not None else price, price)
        a["low"] = min(a["low"] if a["low"] is not None else price, price)
        a["spread"] = spread_for(price, a["digits"])
        return self._quote(a)

    def apply_stats(self, symbol: str, price: float, prev_close: float,
                    open_: float, high: float, low: float,
                    w52high: float | None = None, w52low: float | None = None,
                    volume: float | None = None) -> dict | None:
        """Set a full real quote (price + previous close + OHLC + 52W/volume). Used
        for instruments whose live source is a REST poll (indices, commodities)."""
        a = self.assets.get(symbol)
        if not a or price <= 0 or prev_close <= 0:
            return None
        a["price"] = price
        a["prev_close"] = prev_close
        a["open"] = open_ if open_ and open_ > 0 else prev_close
        a["high"] = max(high or price, price)
        a["low"] = min(low or price, price)
        if w52high is not None:
            a["w52high"] = w52high
        if w52low is not None:
            a["w52low"] = w52low
        if volume is not None:
            a["volume"] = volume
        a["pc_real"] = True
        a["source"] = "live"
        a["spread"] = spread_for(price, a["digits"])
        return self._quote(a)

    def apply_baseline(self, symbol: str, price: float, prev_close: float,
                       open_: float, high: float, low: float,
                       w52high: float | None = None, w52low: float | None = None,
                       volume: float | None = None) -> dict | None:
        """Refresh the real daily baseline (previous close / OHLC / 52W / volume)
        without overwriting a faster websocket price. If the symbol has no live
        price yet, bootstrap it from this quote."""
        a = self.assets.get(symbol)
        if not a or prev_close <= 0:
            return None
        a["prev_close"] = prev_close
        if open_ and open_ > 0:
            a["open"] = open_
        # None-safe: on an instrument that never received a tick, high/low/price
        # are all still unknown -- fold in only the values we actually have.
        if high:
            known = [v for v in (a["high"], a["price"], high) if v is not None]
            a["high"] = max(known)
        if low:
            known = [v for v in (a["low"], a["price"], low) if v is not None]
            a["low"] = min(known)
        if w52high is not None:
            a["w52high"] = w52high
        if w52low is not None:
            a["w52low"] = w52low
        if volume is not None:
            a["volume"] = volume
        a["pc_real"] = True
        if price > 0:
            a["spread"] = spread_for(price, a["digits"])
            if a["source"] != "live":   # not yet streaming: bootstrap off the poll
                a["price"] = price
                a["source"] = "live"
        return self._quote(a)

    def register(self, symbol: str, name: str, cat: str, digits: int,
                 contract: float, quote: dict, currency: str = "USD",
                 usd_rate: float = 1.0) -> dict:
        """Add a user-requested instrument to the universe at runtime."""
        price, prev = quote["price"], quote["prevClose"]
        self.assets[symbol] = {
            "symbol": symbol, "name": name, "cat": cat, "digits": digits,
            "contract": contract, "price": price, "prev_close": prev,
            "open": quote.get("open") or prev,
            "high": max(quote.get("high") or price, price),
            "low": min(quote.get("low") or price, price),
            "w52high": quote.get("w52high"), "w52low": quote.get("w52low"),
            "volume": quote.get("volume"),
            "spread": spread_for(price, digits),
            "source": "live", "pc_real": True, "custom": True,
            "currency": currency, "usd_rate": usd_rate,
        }
        return self.asset_dict(self.assets[symbol])

    def remove(self, symbol: str) -> bool:
        a = self.assets.get(symbol)
        if a and a.get("custom"):
            del self.assets[symbol]
            return True
        return False

    def set_usd_rate(self, symbol: str, rate: float) -> dict | None:
        a = self.assets.get(symbol)
        if not a or rate <= 0:
            return None
        a["usd_rate"] = rate
        return self._quote(a)

    # -- depth of market ---------------------------------------------------
    def orderbook(self, symbol: str, levels: int = 6) -> dict:
        """Synthetic depth: no free L2 feed exists for any of these instruments.
        Derived from the real price + `spread_for`, so the ladder always brackets
        the true market. Returns empty rungs while the price is still unknown."""
        a = self.assets[symbol]
        digits, price = a["digits"], a["price"]
        if price is None:
            return {"symbol": symbol, "bid": None, "ask": None, "spread": None,
                    "asks": [], "bids": [], "maxSize": 1, "digits": digits}
        rng = np.random.default_rng(abs(hash((symbol, int(time.time() / 2)))) % (2**32))
        tick = max(10 ** -digits, price * 5e-5)
        spread = a["spread"] or tick * 2
        bid, ask = price - spread / 2, price + spread / 2
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

"""Background feeds.

Data sources, layered:
  - Yahoo Finance (keyless) — real daily baseline (previous close / OHLC) for
    every instrument, and the live price source for things Finnhub can't stream
    (indices, commodities), polled every few seconds.
  - Finnhub websocket (optional key) — fast real-time ticks for crypto / forex /
    stocks; these override the polled price.
  - Simulator — only drives anything still waiting for its first real datapoint.
"""
from __future__ import annotations

import asyncio
import json
import logging

import websockets

import config
import providers
from assets import FINNHUB_MAP, PROVIDER_TO_LOCAL
from hub import HUB
from market import MARKET

log = logging.getLogger("feeds")

async def poll_loop() -> None:
    """Live price for indices / commodities / custom symbols via Yahoo (no
    websocket exists for them). The set is recomputed each cycle so symbols the
    user adds at runtime start streaming immediately."""
    await asyncio.sleep(0.5)
    while True:
        updated: list[dict] = []
        for sym in [s for s in list(MARKET.assets) if s not in FINNHUB_MAP]:
            try:
                q = await asyncio.to_thread(providers.yahoo_quote, sym)
                if q:
                    r = MARKET.apply_stats(sym, q["price"], q["prevClose"],
                                           q["open"], q["high"], q["low"])
                    if r:
                        updated.append(r)
            except Exception as exc:  # noqa: BLE001
                log.debug("poll %s failed: %s", sym, exc)
            await asyncio.sleep(0.25)
        if updated:
            await HUB.broadcast({"type": "quotes", "data": updated})
        await asyncio.sleep(7)


async def baseline_loop() -> None:
    """Refresh the real previous close / OHLC for websocket-fed symbols so the
    daily % change is correct (price itself keeps coming from the live ticks)."""
    await asyncio.sleep(1.5)
    while True:
        updated: list[dict] = []
        for sym in FINNHUB_MAP:
            try:
                q = await asyncio.to_thread(providers.yahoo_quote, sym)
                if q:
                    r = MARKET.apply_baseline(sym, q["price"], q["prevClose"],
                                              q["open"], q["high"], q["low"])
                    if r:
                        updated.append(r)
            except Exception as exc:  # noqa: BLE001
                log.debug("baseline %s failed: %s", sym, exc)
            await asyncio.sleep(0.25)
        if updated:
            await HUB.broadcast({"type": "quotes", "data": updated})
        await asyncio.sleep(60)


async def fx_loop() -> None:
    """Refresh the USD conversion rate for foreign-currency equities (~60s) so the
    account math stays correct as FX moves. The quote carries usdRate downstream."""
    await asyncio.sleep(2.0)
    while True:
        updated: list[dict] = []
        for sym, a in list(MARKET.assets.items()):
            cur = a.get("currency", "USD")
            if a.get("cat") == "EQ" and cur != "USD":
                try:
                    rate = await asyncio.to_thread(providers.usd_rate, cur)
                    r = MARKET.set_usd_rate(sym, rate)
                    if r:
                        updated.append(r)
                except Exception as exc:  # noqa: BLE001
                    log.debug("fx %s failed: %s", sym, exc)
                await asyncio.sleep(0.2)
        if updated:
            await HUB.broadcast({"type": "quotes", "data": updated})
        await asyncio.sleep(60)


async def simulator_loop() -> None:
    while True:
        quotes = MARKET.sim_step()
        if quotes:
            await HUB.broadcast({"type": "quotes", "data": quotes})
        await asyncio.sleep(config.SIM_INTERVAL)


async def finnhub_loop() -> None:
    if not config.LIVE_ENABLED:
        log.info("FINNHUB_API_KEY not set — running on simulator only.")
        return

    url = f"{config.FINNHUB_WS_URL}?token={config.FINNHUB_API_KEY}"
    backoff = 2
    while True:
        try:
            async with websockets.connect(url, ping_interval=20) as ws:
                log.info("Finnhub connected — subscribing %d symbols", len(FINNHUB_MAP))
                for provider_sym in FINNHUB_MAP.values():
                    await ws.send(json.dumps({"type": "subscribe", "symbol": provider_sym}))
                backoff = 2
                async for raw in ws:
                    await _handle(raw)
        except Exception as exc:  # noqa: BLE001 - keep the feed resilient
            log.warning("Finnhub disconnected (%s) — retrying in %ss", exc, backoff)
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, 30)


async def _handle(raw: str) -> None:
    try:
        msg = json.loads(raw)
    except (ValueError, TypeError):
        return
    if msg.get("type") != "trade":
        return
    latest: dict[str, float] = {}
    for trade in msg.get("data", []):
        local = PROVIDER_TO_LOCAL.get(trade.get("s"))
        if local and trade.get("p"):
            latest[local] = float(trade["p"])
    quotes = [q for sym, price in latest.items()
              if (q := MARKET.apply_live(sym, price)) is not None]
    if quotes:
        await HUB.broadcast({"type": "quotes", "data": quotes})

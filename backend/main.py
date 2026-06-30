"""APEX terminal backend — FastAPI REST + WebSocket price stream."""
from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

import config
import providers
from assets import CATEGORIES
from feeds import baseline_loop, finnhub_loop, poll_loop, simulator_loop
from hub import HUB
from market import MARKET, TIMEFRAMES

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    tasks = [
        asyncio.create_task(simulator_loop()),
        asyncio.create_task(finnhub_loop()),
        asyncio.create_task(poll_loop()),
        asyncio.create_task(baseline_loop()),
    ]
    try:
        yield
    finally:
        for t in tasks:
            t.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)


app = FastAPI(title="APEX Terminal API", version="2.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware, allow_origins=config.CORS_ORIGINS or ["*"],
    allow_methods=["*"], allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {"status": "ok", "live": True, "finnhub": config.LIVE_ENABLED, "clients": len(HUB.clients)}


@app.get("/api/meta")
def meta():
    return {"categories": CATEGORIES, "timeframes": TIMEFRAMES, "live": True}


@app.get("/api/assets")
def list_assets():
    return MARKET.snapshot()


@app.get("/api/search")
async def search(q: str = ""):
    return await asyncio.to_thread(providers.yahoo_search, q)


def _clean_symbol(ysym: str) -> str:
    """A clean display ticker from a Yahoo symbol: ^FCHI->FCHI, MC.PA->MC,
    DOGE-USD->DOGEUSD, EURGBP=X->EURGBP."""
    s = ysym.upper().lstrip("^")
    if s.endswith("=X"):
        s = s[:-2]
    s = s.replace("-USD", "USD").replace("-", "")
    if "." in s:
        s = s.split(".")[0]
    return s or ysym.upper()


@app.post("/api/assets/add")
async def add_asset(symbol: str, name: str = "", cat: str = "EQ"):
    """Register a user-chosen Yahoo symbol so it streams like any other asset.
    The key/display symbol is a clean ticker; the Yahoo symbol stays internal."""
    ysym = symbol.upper()
    local = _clean_symbol(ysym)
    # if the clean ticker is already taken by a different instrument, fall back
    if local in MARKET.assets and providers.YAHOO_MAP.get(local) != ysym:
        local = ysym
    if local in MARKET.assets:
        return MARKET.asset_dict(MARKET.assets[local])

    providers.register_symbol(local, ysym)
    quote = await asyncio.to_thread(providers.yahoo_quote, local)
    if not quote:
        providers.unregister_symbol(local)
        raise HTTPException(404, f"No market data for {symbol}")
    price = quote["price"]
    digits = 6 if price < 1 else 4 if price < 20 else 2
    asset = MARKET.register(local, name or local, cat or "EQ", digits, 1.0, quote)
    await HUB.broadcast({"type": "asset", "data": asset})
    return asset


@app.delete("/api/assets/{symbol}")
def remove_asset(symbol: str):
    local = symbol.upper()
    if MARKET.remove(local):
        providers.unregister_symbol(local)
        return {"removed": local}
    raise HTTPException(400, "Only custom symbols can be removed")


@app.get("/api/assets/{symbol}")
def get_asset(symbol: str):
    a = MARKET.assets.get(symbol.upper())
    if not a:
        raise HTTPException(404, f"Unknown symbol {symbol}")
    return MARKET.asset_dict(a)


@app.get("/api/assets/{symbol}/candles")
async def get_candles(symbol: str, tf: str = "1D"):
    sym = symbol.upper()
    if sym not in MARKET.assets:
        raise HTTPException(404, f"Unknown symbol {symbol}")
    if tf not in TIMEFRAMES:
        raise HTTPException(400, f"Unknown timeframe {tf}")
    # real history from Yahoo; fall back to the simulator if it is unavailable
    real = await asyncio.to_thread(providers.yahoo_candles, sym, tf)
    return real or MARKET.candles(sym, tf)


@app.get("/api/orderbook/{symbol}")
def get_orderbook(symbol: str):
    if symbol.upper() not in MARKET.assets:
        raise HTTPException(404, f"Unknown symbol {symbol}")
    return MARKET.orderbook(symbol.upper())


@app.websocket("/ws/prices")
async def ws_prices(ws: WebSocket):
    await HUB.connect(ws)
    try:
        await ws.send_json({"type": "snapshot", "data": MARKET.snapshot(), "live": True})
        while True:
            await ws.receive_text()   # ignore client input; detects disconnect
    except WebSocketDisconnect:
        pass
    finally:
        await HUB.disconnect(ws)

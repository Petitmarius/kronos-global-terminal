"""Guards against fabricated market data creeping back in.

A stale hardcoded seed (SPX500 at 5912 while the market was 7641) used to be
broadcast for the first seconds after every restart, which force-closed stops and
filled limit orders at levels the market never traded. Nothing may invent a price.
"""
import assets
import market
from market import MarketState


def test_universe_carries_no_prices():
    for a in assets.universe():
        assert a["price"] is None, f"{a['symbol']} ships with a hardcoded price"
        assert a["prev_close"] is None, f"{a['symbol']} ships with a hardcoded close"


def test_universe_keeps_reference_metadata():
    u = {a["symbol"]: a for a in assets.universe()}
    assert u["SPX500"]["name"] == "S&P 500 Index"
    assert u["SPX500"]["cat"] == "INDEX"
    assert u["EURUSD"]["digits"] == 5 and u["EURUSD"]["contract"] == 100_000


def test_fresh_state_has_no_price_anywhere():
    m = MarketState()
    for sym, a in m.assets.items():
        assert a["price"] is None, f"{sym} was seeded with a price"
        assert a["source"] == "none", f"{sym} claims a source before any provider"
        assert a["spread"] is None, f"{sym} was seeded with a spread"


def test_quote_of_an_unpriced_asset_is_null_not_zero():
    m = MarketState()
    q = m.asset_dict(m.assets["SPX500"])
    assert q["price"] is None and q["change"] is None and q["pct"] is None
    assert q["stats"]["prevClose"] is None and q["stats"]["spread"] is None


def test_simulator_is_gone():
    assert not hasattr(MarketState, "sim_step")
    assert not hasattr(MarketState, "candles")   # synthetic charts removed


def test_real_tick_makes_the_asset_live_and_derives_the_spread():
    m = MarketState()
    q = m.apply_live("SPX500", 7641.16)
    assert q["price"] == 7641.16
    assert q["source"] == "live"
    assert q["pct"] == 0.0                       # baseline anchors to the first tick
    assert m.assets["SPX500"]["spread"] == market.spread_for(7641.16, 2)


def test_stats_refresh_rescales_the_spread_off_the_real_price():
    m = MarketState()
    m.apply_live("SPX500", 100.0)
    cheap = m.assets["SPX500"]["spread"]
    m.apply_stats("SPX500", 7641.16, 7707.98, 7690.49, 7699.96, 7639.01)
    assert m.assets["SPX500"]["spread"] > cheap  # scales with price, never stale


def test_orderbook_is_empty_until_a_real_price_exists():
    m = MarketState()
    book = m.orderbook("SPX500")
    assert book["bids"] == [] and book["asks"] == []
    assert book["bid"] is None and book["ask"] is None


def test_orderbook_brackets_the_real_price_once_known():
    m = MarketState()
    m.apply_live("SPX500", 7641.16)
    book = m.orderbook("SPX500")
    assert book["bid"] < 7641.16 < book["ask"]
    assert len(book["bids"]) == 6 and len(book["asks"]) == 6


def test_baseline_bootstraps_an_instrument_that_never_ticked():
    """Yahoo's 60s baseline is the ONLY price source for symbols Finnhub does not
    stream (SOLUSD/XRPUSD on a free key). It must cope with high/low/price all
    being unknown -- a crash there left those rows permanently blank."""
    m = MarketState()
    q = m.apply_baseline("SOLUSD", 90.96, 87.63, 87.63, 92.99, 87.61)
    assert q is not None and q["price"] == 90.96
    assert q["source"] == "live"
    assert m.assets["SOLUSD"]["high"] == 92.99
    assert m.assets["SOLUSD"]["low"] == 87.61


def test_baseline_does_not_overwrite_a_faster_websocket_price():
    m = MarketState()
    m.apply_live("BTCUSD", 77232.06)
    m.apply_baseline("BTCUSD", 70000.0, 73013.0, 73013.0, 79244.37, 73013.0)
    assert m.assets["BTCUSD"]["price"] == 77232.06   # live tick wins
    assert m.assets["BTCUSD"]["prev_close"] == 73013.0


def test_spread_never_rounds_away_to_zero():
    """A zero spread would collapse the depth ladder onto a single price."""
    for price, digits in [(7670.21, 2), (90.95, 2), (1.4111, 4), (1.1712, 5)]:
        assert market.spread_for(price, digits) > 0

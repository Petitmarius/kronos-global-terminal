"""Live-tick bookkeeping: the day baseline and what a quote frame carries."""
import market


def fresh(symbol="BTCUSD"):
    m = market.MarketState()
    return m, m.assets[symbol], symbol


def test_apply_live_anchors_the_day_baseline_only_once():
    """The anchor is a one-shot: it exists so the first tick does not divide by
    None. Re-running it on every tick pins the day change at +0.00% for any
    symbol whose Yahoo baseline is late or failing (429), which is exactly what
    a Finnhub-streamed crypto pair looks like during a Yahoo outage."""
    m, a, sym = fresh()
    for p in (100.0, 105.0, 110.0, 102.0):
        q = m.apply_live(sym, p)
    assert a["prev_close"] == 100.0, "the baseline moved with the price"
    assert q["pct"] == 2.0, f"day change pinned at {q['pct']}%"


def test_apply_live_accumulates_the_day_range():
    m, a, sym = fresh()
    for p in (100.0, 105.0, 110.0, 102.0):
        m.apply_live(sym, p)
    assert (a["high"], a["low"]) == (110.0, 100.0), "the range is reset by every tick"


def test_apply_live_keeps_a_real_baseline():
    """Once Yahoo delivers the true previous close, ticks must not overwrite it."""
    m, a, sym = fresh()
    m.apply_stats(sym, 100.0, 90.0, 95.0, 101.0, 94.0)
    m.apply_live(sym, 108.0)
    assert a["prev_close"] == 90.0 and a["pc_real"] is True
    assert a["high"] == 108.0 and a["low"] == 94.0


def test_apply_live_still_starts_at_zero_on_the_very_first_tick():
    m, a, sym = fresh()
    q = m.apply_live(sym, 100.0)
    assert q["pct"] == 0.0 and a["prev_close"] == 100.0


def test_quote_frame_carries_the_market_data_grid():
    """These reach the client only in the one-shot `snapshot` frame today, so a
    page opened before the first Yahoo poll shows `—` for OPEN/HIGH/LOW/PREV
    CLOSE for the rest of the session, with no reconnect and no recovery."""
    m, a, sym = fresh()
    m.apply_stats(sym, 100.0, 90.0, 95.0, 101.0, 94.0)
    q = m.apply_live(sym, 108.0)
    for k in ("open", "high", "low", "prevClose", "spread"):
        assert k in q, f"{k} never reaches the client over the websocket"
    assert q["prevClose"] == 90.0 and q["high"] == 108.0 and q["low"] == 94.0
    assert q["open"] == 95.0 and q["spread"] is not None


def test_quote_frame_keeps_nulls_null():
    """An unpriced instrument must not gain a fabricated grid."""
    m, a, sym = fresh()
    q = m._quote(a)
    assert q["price"] is None
    assert all(q[k] is None for k in ("open", "high", "low", "prevClose", "spread"))


# -- the shared custom-symbol registry ------------------------------------
#
# `MARKET.assets` is one dict shared by every visitor, and each custom entry
# joins the poll loop. Nothing shrinks it any more now that the watchlist no
# longer sends DELETE, so it has to bound itself or a public deploy walks into
# a Yahoo 429.

QUOTE = {"price": 100.0, "prevClose": 99.0}


def custom(m, symbol, touched=None):
    m.register(symbol, symbol, "EQ", 2, 1.0, QUOTE)
    if touched is not None:
        m.assets[symbol]["touched"] = touched
    return m.assets[symbol]


def test_register_stamps_a_touched_time():
    m = market.MarketState()
    a = custom(m, "MC.PA")
    assert a.get("touched"), "no touched stamp -> eviction cannot order candidates"


def test_touch_only_moves_custom_symbols():
    m = market.MarketState()
    custom(m, "MC.PA", touched=0.0)
    m.touch("MC.PA")
    assert m.assets["MC.PA"]["touched"] > 0.0
    m.touch("BTCUSD")  # base universe: must not gain the field
    assert "touched" not in m.assets["BTCUSD"]


def test_evict_is_a_noop_under_the_cap():
    m = market.MarketState()
    custom(m, "MC.PA", touched=0.0)
    assert m.evict_idle_customs(cap=5, idle_secs=60.0) == []
    assert "MC.PA" in m.assets


def test_evict_drops_the_oldest_idle_first():
    m = market.MarketState()
    for i, sym in enumerate(("A.PA", "B.PA", "C.PA")):
        custom(m, sym, touched=1000.0 + i)   # A oldest, C newest
    assert m.evict_idle_customs(cap=1, idle_secs=60.0) == ["A.PA", "B.PA"]
    assert "C.PA" in m.assets and "A.PA" not in m.assets


def test_evict_never_touches_the_base_universe():
    m = market.MarketState()
    base = len(m.assets)
    assert m.evict_idle_customs(cap=0, idle_secs=60.0) == []
    assert len(m.assets) == base, "a base-universe symbol was evicted"


def test_evict_spares_a_symbol_someone_is_charting():
    """A candle request touches the symbol, which is what keeps the chart you are
    looking at out of the eviction set."""
    m = market.MarketState()
    custom(m, "A.PA", touched=0.0)
    custom(m, "B.PA", touched=0.0)
    m.touch("A.PA")                                     # now live
    assert m.evict_idle_customs(cap=1, idle_secs=60.0) == ["B.PA"]
    assert "A.PA" in m.assets


def test_evict_stays_over_cap_rather_than_dropping_a_live_symbol():
    """Evicting a symbol someone is watching to satisfy a number is the worse
    failure: the registry is allowed to run over cap until something goes idle."""
    m = market.MarketState()
    custom(m, "A.PA")
    custom(m, "B.PA")
    assert m.evict_idle_customs(cap=1, idle_secs=1800.0) == []
    assert "A.PA" in m.assets and "B.PA" in m.assets

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

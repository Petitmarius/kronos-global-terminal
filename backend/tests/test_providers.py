import urllib.error

import providers


def test_usd_rate_usd_passthrough():
    assert providers.usd_rate("USD") == 1.0
    assert providers.usd_rate("") == 1.0
    assert providers.usd_rate(None) == 1.0


def test_quote_from_meta_captures_currency():
    meta = {"regularMarketPrice": 100.0, "previousClose": 99.0, "currency": "EUR"}
    q = providers.quote_from_meta(meta)
    assert q is not None and q["currency"] == "EUR"


def test_quote_from_meta_currency_optional():
    meta = {"regularMarketPrice": 100.0, "previousClose": 99.0}
    q = providers.quote_from_meta(meta)
    assert q is not None and q["currency"] is None


def test_quote_from_meta_captures_stats():
    meta = {"regularMarketPrice": 100.0, "previousClose": 99.0,
            "fiftyTwoWeekHigh": 120.0, "fiftyTwoWeekLow": 80.0, "regularMarketVolume": 1234567}
    q = providers.quote_from_meta(meta)
    assert q["w52high"] == 120.0 and q["w52low"] == 80.0 and q["volume"] == 1234567


def test_quote_from_meta_stats_optional():
    meta = {"regularMarketPrice": 100.0, "previousClose": 99.0}
    q = providers.quote_from_meta(meta)
    assert q["w52high"] is None and q["w52low"] is None and q["volume"] is None


# --- Batched quotes (Yahoo /v8/finance/spark) --------------------------------

# Shape copied from a live response: `previousClose` really is null and the
# usable value sits in `chartPreviousClose`.
SPARK = {
    "XLK": {"symbol": "XLK", "timestamp": [1787664600], "previousClose": None,
            "chartPreviousClose": 180.05, "close": [181.74], "dataGranularity": 300},
    "^TNX": {"symbol": "^TNX", "timestamp": [1787664600], "previousClose": 4.6,
             "chartPreviousClose": 4.6, "close": [4.639], "dataGranularity": 300},
}


def test_spark_quotes_parses_price_prev_and_pct():
    q = providers.spark_quotes(SPARK)
    assert q["XLK"]["price"] == 181.74
    assert q["XLK"]["prevClose"] == 180.05, "previousClose is null; chartPreviousClose carries it"
    assert round(q["XLK"]["pct"], 4) == round((181.74 / 180.05 - 1) * 100, 4)


def test_spark_quotes_prefers_previous_close_when_present():
    q = providers.spark_quotes({"A": {"previousClose": 10.0, "chartPreviousClose": 99.0,
                                      "close": [11.0]}})
    assert q["A"]["prevClose"] == 10.0


def test_spark_quotes_takes_the_last_non_null_close():
    q = providers.spark_quotes({"A": {"chartPreviousClose": 10.0, "close": [10.5, 11.0, None]}})
    assert q["A"]["price"] == 11.0


def test_spark_quotes_drops_symbols_with_no_usable_close():
    """Thin/closed markets (^IPSA, IMOEX.ME) come back with an empty `close`.
    They must be ABSENT, not zeroed, so the caller falls back per symbol -- the
    per-symbol chart endpoint does answer for them."""
    q = providers.spark_quotes({
        "^IPSA": {"chartPreviousClose": 10947.4, "close": []},
        "IMOEX.ME": {"chartPreviousClose": 2226.65, "close": [None]},
        "GOOD": {"chartPreviousClose": 1.0, "close": [2.0]},
    })
    assert set(q) == {"GOOD"}


def test_spark_quotes_drops_symbols_with_no_previous_close():
    assert providers.spark_quotes({"A": {"close": [2.0]}}) == {}


def test_spark_quotes_never_divides_by_a_zero_previous_close():
    assert providers.spark_quotes({"A": {"chartPreviousClose": 0, "close": [2.0]}}) == {}


def test_spark_quotes_ignores_a_junk_payload():
    assert providers.spark_quotes({}) == {}
    assert providers.spark_quotes({"A": None}) == {}
    assert providers.spark_quotes({"A": {"close": "nope", "chartPreviousClose": 1.0}}) == {}


def test_chunks_respects_the_batch_ceiling():
    """25 symbols in one spark call returns HTTP 400; 20 is the observed ceiling."""
    assert providers._SPARK_MAX <= 20
    got = list(providers._chunks(list(range(45)), 18))
    assert [len(c) for c in got] == [18, 18, 9]
    assert [x for c in got for x in c] == list(range(45))


def test_chunks_handles_short_and_empty_input():
    assert list(providers._chunks([], 5)) == []
    assert list(providers._chunks([1, 2], 5)) == [[1, 2]]


def test_yahoo_quotes_batch_falls_back_per_symbol_only_for_gaps(monkeypatch):
    """Chile and Russia are real gaps in the live spark response. Everything the
    batch did answer must NOT be re-fetched one by one."""
    monkeypatch.setattr(providers, "_spark_fetch",
                        lambda syms: {s: {"chartPreviousClose": 1.0, "close": [2.0]}
                                      for s in syms if s not in ("^IPSA", "IMOEX.ME")})
    asked = []
    monkeypatch.setattr(providers, "yahoo_quote_raw",
                        lambda s: asked.append(s) or {"price": 9.0, "prevClose": 9.0, "pct": 0.0})
    syms = ["XLK", "^IPSA", "^GSPC", "IMOEX.ME"]
    q = providers.yahoo_quotes_batch(syms)
    assert sorted(asked) == ["IMOEX.ME", "^IPSA"], "only the gaps go per-symbol"
    assert set(q) == set(syms)
    assert q["XLK"]["price"] == 2.0 and q["^IPSA"]["price"] == 9.0


def test_yahoo_quotes_batch_survives_a_dead_spark_endpoint(monkeypatch):
    """A 400/timeout on the batch must degrade to today's per-symbol path, not
    blank the board."""
    def boom(_syms):
        raise OSError("spark down")
    monkeypatch.setattr(providers, "_spark_fetch", boom)
    monkeypatch.setattr(providers, "yahoo_quote_raw",
                        lambda s: {"price": 5.0, "prevClose": 4.0, "pct": 25.0})
    q = providers.yahoo_quotes_batch(["A", "B"])
    assert set(q) == {"A", "B"} and q["A"]["price"] == 5.0


def test_yahoo_quotes_batch_omits_what_no_source_can_price(monkeypatch):
    """The no-fake-data contract: an unpriceable symbol is absent, never 0."""
    monkeypatch.setattr(providers, "_spark_fetch", lambda syms: {})
    monkeypatch.setattr(providers, "yahoo_quote_raw", lambda s: None)
    assert providers.yahoo_quotes_batch(["A", "B"]) == {}


def test_yahoo_quotes_batch_splits_into_batched_requests(monkeypatch):
    calls = []
    def fake(syms):
        calls.append(list(syms))
        return {s: {"chartPreviousClose": 1.0, "close": [1.0]} for s in syms}
    monkeypatch.setattr(providers, "_spark_fetch", fake)
    monkeypatch.setattr(providers, "yahoo_quote_raw", lambda s: None)
    syms = [f"S{i}" for i in range(40)]
    q = providers.yahoo_quotes_batch(syms)
    assert len(q) == 40
    assert len(calls) == 3, f"40 symbols must batch into 3 calls, got {len(calls)}"
    assert all(len(c) <= providers._SPARK_MAX for c in calls)


# --- Provider outages must degrade, never 500 -------------------------------

# `_get` raises transport errors, not shape errors: HTTPError (404 on a dead
# symbol, 429 when Yahoo throttles us) and URLError both derive from OSError,
# and a JSON error page surfaces as ValueError. Catching only KeyError /
# IndexError / TypeError let all of those escape all the way to FastAPI.
def _raises(exc):
    def f(*_a, **_k):
        raise exc
    return f


HTTP_429 = urllib.error.HTTPError("u", 429, "Too Many Requests", {}, None)
HTTP_404 = urllib.error.HTTPError("u", 404, "Not Found", {}, None)
URL_DOWN = urllib.error.URLError("connection refused")


def test_yahoo_quote_raw_degrades_on_a_provider_outage(monkeypatch):
    providers._raw_quote_cache.clear()
    for exc in (HTTP_404, HTTP_429, URL_DOWN, TimeoutError("read timed out"),
                ValueError("Expecting value: line 1 column 1")):
        monkeypatch.setattr(providers, "_get", _raises(exc))
        assert providers.yahoo_quote_raw("ANY") is None, f"{type(exc).__name__} escaped"


def test_yahoo_quote_raw_keeps_serving_the_last_good_quote(monkeypatch):
    providers._raw_quote_cache.clear()
    monkeypatch.setattr(providers, "_get", lambda *a, **k: {
        "chart": {"result": [{"meta": {"regularMarketPrice": 10.0, "previousClose": 9.0}}]}})
    assert providers.yahoo_quote_raw("X")["price"] == 10.0
    providers._raw_quote_cache["X"] = (0.0, providers._raw_quote_cache["X"][1])  # force expiry
    monkeypatch.setattr(providers, "_get", _raises(HTTP_429))
    assert providers.yahoo_quote_raw("X")["price"] == 10.0, "stale but real beats nothing"


def test_yahoo_candles_raw_degrades_on_a_provider_outage(monkeypatch):
    providers._raw_candle_cache.clear()
    for exc in (HTTP_404, HTTP_429, URL_DOWN, TimeoutError("t"), ValueError("bad json")):
        monkeypatch.setattr(providers, "_get", _raises(exc))
        assert providers.yahoo_candles_raw("ANY", "1M") is None, f"{type(exc).__name__} escaped"


def test_yahoo_candles_degrades_on_a_provider_outage(monkeypatch):
    """The mapped-symbol path the terminal chart uses."""
    providers._candle_cache.clear()
    monkeypatch.setattr(providers, "_get", _raises(HTTP_429))
    assert providers.yahoo_candles("SPX500", "1M") is None


def test_usd_rate_degrades_on_a_provider_outage(monkeypatch):
    providers._fx_cache.clear()
    providers._raw_quote_cache.clear()
    monkeypatch.setattr(providers, "_get", _raises(HTTP_429))
    assert providers.usd_rate("EUR") == 1.0, "an FX outage must not raise into the account math"


def test_one_dead_symbol_cannot_take_down_the_whole_board(monkeypatch):
    """A single 404/429 inside the per-symbol fallback used to propagate out of
    yahoo_quotes_batch and 500 both /api/macro/board and /api/globe/markets."""
    providers._raw_quote_cache.clear()
    monkeypatch.setattr(providers, "_spark_fetch",
                        lambda syms: {s: {"chartPreviousClose": 1.0, "close": [2.0]}
                                      for s in syms if s != "DEAD"})
    monkeypatch.setattr(providers, "_get", _raises(HTTP_429))
    q = providers.yahoo_quotes_batch(["^VIX", "DEAD", "^GSPC"])
    assert set(q) == {"^VIX", "^GSPC"}, "the dead symbol is dropped, the board survives"


# -- candle cache TTL by interval -----------------------------------------
#
# A chart request is the one Yahoo call that scales with TRAFFIC rather than
# being a fixed cost like the warm loops, and the portfolio equity curve fires
# one per held symbol. A 25s TTL on a DAILY series re-fetches three months of
# history every 25 seconds to learn nothing: the bar that actually moves during
# a session is the last one, and the client overwrites it from the live tick
# (`PriceChart` lastBarRef), so the fetch never carried that update anyway.

import market


def test_every_timeframe_has_a_positive_candle_ttl():
    for tf in market.TIMEFRAMES:
        assert providers._candle_ttl(tf) > 0, f"{tf} has no TTL"


def test_intraday_timeframes_keep_the_short_ttl():
    """1D/1W/1M are 5m/30m/60m bars -- a new bar lands every few minutes."""
    for tf in ("1D", "1W", "1M"):
        assert providers._candle_ttl(tf) == providers._CANDLE_TTL


def test_daily_timeframes_cache_far_longer():
    for tf in ("3M", "6M", "YTD", "1Y"):
        assert providers._candle_ttl(tf) >= 600.0, f"{tf} still on the intraday TTL"


def test_weekly_and_monthly_cache_longest():
    for tf in ("5Y", "MAX"):
        assert providers._candle_ttl(tf) >= providers._candle_ttl("1Y")


def test_unknown_timeframe_falls_back_without_raising():
    assert providers._candle_ttl("nonsense") > 0


def _counting_chart(monkeypatch):
    calls = []

    def fake(ysym, tf):
        calls.append((ysym, tf))
        return [{"time": 1, "value": 1.0}]

    monkeypatch.setattr(providers, "_candles_from_chart", fake)
    providers._candle_cache.clear()
    providers.YAHOO_MAP.setdefault("ZZTEST", "ZZTEST")
    return calls


def test_daily_candles_are_reused_after_the_old_25s_window(monkeypatch):
    """The actual win: a second viewer 30s later costs zero Yahoo requests."""
    calls = _counting_chart(monkeypatch)
    providers.yahoo_candles("ZZTEST", "3M")
    ts, payload = providers._candle_cache[("ZZTEST", "3M")]
    providers._candle_cache[("ZZTEST", "3M")] = (ts - 30.0, payload)  # age it 30s
    providers.yahoo_candles("ZZTEST", "3M")
    assert len(calls) == 1, "a daily series was re-fetched 30s later"


def test_intraday_candles_still_expire_quickly(monkeypatch):
    calls = _counting_chart(monkeypatch)
    providers.yahoo_candles("ZZTEST", "1D")
    ts, payload = providers._candle_cache[("ZZTEST", "1D")]
    providers._candle_cache[("ZZTEST", "1D")] = (ts - 30.0, payload)
    providers.yahoo_candles("ZZTEST", "1D")
    assert len(calls) == 2, "intraday bars went stale behind a long TTL"

import time
import pytest

import config
import macro
import providers


def test_normalize_yield_passthrough_small():
    assert macro.normalize_yield(4.23) == 4.23

def test_normalize_yield_scales_down_when_times_ten():
    assert macro.normalize_yield(42.3) == 4.23

def test_normalize_yield_none():
    assert macro.normalize_yield(None) is None

def test_risk_regime_buckets():
    assert macro.risk_regime(12) == "Calm"
    assert macro.risk_regime(17) == "Normal"
    assert macro.risk_regime(25) == "Elevated"
    assert macro.risk_regime(40) == "Risk-off"
    assert macro.risk_regime(None) == "—"

def test_latest_prior_skips_missing():
    obs = [{"date": "2024-01", "value": "1.0"},
           {"date": "2024-02", "value": "."},
           {"date": "2024-03", "value": "2.0"},
           {"date": "2024-04", "value": "3.0"}]
    assert macro.latest_prior(obs) == (3.0, 2.0)

def test_latest_prior_empty():
    assert macro.latest_prior([]) == (None, None)

def test_spark_last_n_numeric():
    obs = [{"value": str(i)} for i in range(10)]
    obs.insert(3, {"value": "."})
    assert macro.spark(obs, 3) == [7.0, 8.0, 9.0]

def test_sort_releases_desc_by_updated():
    items = [{"label": "a", "updated": "2024-01-01"},
             {"label": "b", "updated": "2024-03-01"},
             {"label": "c", "updated": "2024-02-01"}]
    assert [i["label"] for i in macro.sort_releases(items)] == ["b", "c", "a"]


def test_quote_from_meta_computes_pct():
    meta = {"regularMarketPrice": 110.0, "previousClose": 100.0,
            "regularMarketOpen": 101.0, "regularMarketDayHigh": 111.0,
            "regularMarketDayLow": 99.0}
    q = providers.quote_from_meta(meta)
    assert q["price"] == 110.0
    assert q["prevClose"] == 100.0
    assert round(q["pct"], 2) == 10.0

def test_quote_from_meta_missing_returns_none():
    assert providers.quote_from_meta({"regularMarketPrice": 0}) is None


def test_fred_unavailable_without_key(monkeypatch):
    monkeypatch.setattr(config, "FRED_API_KEY", "")
    assert macro.fred_available() is False
    assert macro.fred_observations("CPIAUCSL") == []
    assert macro.fred_meta("CPIAUCSL") == {}


def test_build_board_shape():
    quotes = {}
    for ysym in macro.board_symbols():
        # yields come back ×10 to prove norm_yield runs; others plain
        quotes[ysym] = {"price": 42.0, "prevClose": 41.0, "pct": 1.5,
                        "open": None, "high": None, "low": None}
    b = macro.build_board(quotes)
    assert set(b) >= {"ts", "rates", "vix", "dxy", "sectors", "crossAsset"}
    assert b["rates"]["y10"] == 4.2            # 42.0 normalized
    assert b["vix"]["regime"] in {"Calm", "Normal", "Elevated", "Risk-off"}
    assert len(b["sectors"]) == 11
    assert {c["key"] for c in b["crossAsset"]} == {
        "equities", "rates", "commodities", "fx", "crypto"}
    assert b["sectors"][0]["pct"] >= b["sectors"][-1]["pct"]  # sorted desc


def test_build_econ_unavailable(monkeypatch):
    monkeypatch.setattr(config, "FRED_API_KEY", "")
    assert macro.build_econ() == {"available": False, "series": []}

def test_build_releases_unavailable(monkeypatch):
    monkeypatch.setattr(config, "FRED_API_KEY", "")
    assert macro.build_releases() == {"available": False, "items": []}


def test_news_impact_levels():
    assert macro._news_impact("Fed signals rate cut amid inflation") == "high"
    assert macro._news_impact("Apple earnings beat on strong revenue") == "med"
    assert macro._news_impact("Local bakery wins award") == "low"

def test_build_calendar_unavailable(monkeypatch):
    monkeypatch.setattr(config, "FRED_API_KEY", "")
    macro._cal_cache = None
    c = macro.build_calendar()
    assert c["available"] is False and c["items"] == []

def test_fetch_news_unavailable(monkeypatch):
    monkeypatch.setattr(config, "FINNHUB_API_KEY", "")
    monkeypatch.setattr(macro, "_news_from_yahoo", lambda: [])
    macro._news_cache = None
    n = macro.fetch_news()
    assert n["available"] is False and n["items"] == []

def test_risk_label_and_quadrant():
    assert macro._risk_label(90) == "Extreme Risk-On"
    assert macro._risk_label(50) == "Neutral"
    assert macro._risk_label(10) == "Extreme Risk-Off"
    assert macro._quadrant(101, 101) == "leading"
    assert macro._quadrant(101, 99) == "weakening"
    assert macro._quadrant(99, 101) == "improving"
    assert macro._quadrant(99, 99) == "lagging"

def test_build_risk_score_range():
    q = lambda price, pct: {"price": price, "prevClose": price, "pct": pct,
                            "open": None, "high": None, "low": None}
    quotes = {
        macro.VIX_YH: q(15.0, 0.0), "HYG": q(80, 0.3), "LQD": q(110, 0.1),
        "^GSPC": q(5000, 0.8), "TLT": q(90, -0.4), macro.DXY_YH: q(101, 0.2),
        "GC=F": q(2400, -0.5),
    }
    r = macro.build_risk(quotes)
    assert 0 <= r["score"] <= 100
    assert r["label"] in {"Extreme Risk-On", "Risk-On", "Neutral", "Risk-Off", "Extreme Risk-Off"}
    assert len(r["drivers"]) == 5

def test_build_risk_none_when_missing():
    assert macro.build_risk({}) is None

def test_build_board_cell_has_local():
    quotes = {s: {"price": 1.0, "prevClose": 1.0, "pct": 0.0,
                  "open": None, "high": None, "low": None} for s in macro.board_symbols()}
    b = macro.build_board(quotes)
    eq = next(c for c in b["crossAsset"] if c["key"] == "equities")
    sp = next(cell for cell in eq["items"] if cell["symbol"] == "^GSPC")
    assert sp["local"] == "SPX500"


# --- Yield curve: US Treasury primary, FRED fallback ------------------------

# Deliberately out of chronological order, with a blank 1.5-Month cell on the
# most recent day -- both things the live file actually does.
TREASURY_CSV = '''Date,"1 Mo","1.5 Month","2 Mo","3 Mo","6 Mo","1 Yr","2 Yr","3 Yr","5 Yr","7 Yr","10 Yr","20 Yr","30 Yr"
08/19/2026,3.77,3.77,3.81,3.86,3.94,4.00,4.19,4.25,4.35,4.48,4.65,5.17,5.19
08/21/2026,3.80,,3.80,3.88,3.95,4.03,4.24,4.31,4.43,4.57,4.74,5.25,5.27
08/20/2026,3.80,3.77,3.79,3.87,3.94,3.99,4.19,4.26,4.39,4.53,4.69,5.20,5.23
'''


def test_parse_treasury_curve_picks_the_most_recent_row():
    c = macro.parse_treasury_curve(TREASURY_CSV)
    assert c["source"] == "US TREASURY"
    assert c["asOf"] == "2026-08-21"          # not the first row, the newest one
    ten = next(p for p in c["points"] if p["label"] == "10Y")
    assert ten["yield"] == 4.74 and ten["months"] == 120


def test_parse_treasury_curve_maps_every_tenor_spelling():
    pts = {p["label"]: p["months"] for p in macro.parse_treasury_curve(TREASURY_CSV)["points"]}
    assert pts["1M"] == 1 and pts["3M"] == 3 and pts["6M"] == 6
    assert pts["1Y"] == 12 and pts["2Y"] == 24 and pts["30Y"] == 360


def test_parse_treasury_curve_drops_blank_cells_instead_of_zeroing():
    pts = macro.parse_treasury_curve(TREASURY_CSV)["points"]
    assert "1.5M" not in [p["label"] for p in pts]   # blank on 08/21
    assert len(pts) == 12
    assert all(p["yield"] > 0 for p in pts)          # never coerced to 0.0


def test_parse_treasury_curve_rejects_non_csv():
    assert macro.parse_treasury_curve("") is None
    assert macro.parse_treasury_curve("<html>503 Service Unavailable</html>") is None
    assert macro.parse_treasury_curve('Date,"1 Mo"\n') is None   # header, no rows


def test_build_curve_prefers_treasury_and_reports_provenance(monkeypatch):
    monkeypatch.setattr(macro, "fetch_treasury_curve",
                        lambda: macro.parse_treasury_curve(TREASURY_CSV))
    c = macro.build_curve()
    assert c["available"] is True
    assert c["source"] == "US TREASURY" and c["asOf"] == "2026-08-21"
    assert c["spread2s10s"] == 0.5 and c["inverted"] is False   # 4.74 - 4.24


def test_build_curve_works_without_a_fred_key(monkeypatch):
    # the point of moving to Treasury: the curve no longer needs any API key
    monkeypatch.setattr(config, "FRED_API_KEY", "")
    monkeypatch.setattr(macro, "fetch_treasury_curve",
                        lambda: macro.parse_treasury_curve(TREASURY_CSV))
    assert macro.build_curve()["available"] is True


def test_build_curve_falls_back_to_fred_when_treasury_is_down(monkeypatch):
    monkeypatch.setattr(macro, "fetch_treasury_curve", lambda: None)
    monkeypatch.setattr(config, "FRED_API_KEY", "k")
    monkeypatch.setattr(macro, "fred_observations",
                        lambda sid, **kw: [{"date": "2026-08-20", "value": "4.19"}])
    c = macro.build_curve()
    assert c["source"] == "FRED" and c["asOf"] == "2026-08-20"
    assert len(c["points"]) == len(macro.CURVE_FRED)


def test_build_curve_unavailable_when_both_sources_fail(monkeypatch):
    monkeypatch.setattr(macro, "fetch_treasury_curve", lambda: None)
    monkeypatch.setattr(config, "FRED_API_KEY", "")
    c = macro.build_curve()
    assert c["available"] is False and c["points"] == [] and c["source"] is None


def test_treasury_failure_is_never_cached(monkeypatch):
    # a transient 503 must not blank the curve for the whole cache window
    calls: list[str] = []
    monkeypatch.setattr(macro, "_curve_cache", None)
    monkeypatch.setattr(macro, "_http_text", lambda url, **kw: calls.append(url) or None)
    assert macro.fetch_treasury_curve() is None
    assert macro.fetch_treasury_curve() is None
    assert len(calls) == 4          # 2 years tried, twice over


# --- Board: one batched request, not one per symbol -------------------------

def test_fetch_board_pulls_every_symbol_in_one_batched_call(monkeypatch):
    """37 sequential Yahoo calls cost 4.3s; the batch costs 0.11s."""
    calls = []
    def fake_batch(syms):
        calls.append(list(syms))
        return {s: {"price": 100.0, "prevClose": 99.0, "pct": 1.0101} for s in syms}
    monkeypatch.setattr(macro.providers, "yahoo_quotes_batch", fake_batch)
    monkeypatch.setattr(macro.providers, "yahoo_quote_raw",
                        lambda s: pytest.fail(f"per-symbol fetch for {s}"))
    board = macro.BOARD.refresh()
    assert len(calls) == 1 and set(calls[0]) == set(macro.board_symbols())
    assert board["vix"]["level"] == 100.0
    assert len(board["sectors"]) == len(macro.SECTORS)


def test_board_endpoint_never_rebuilds_while_the_warm_loop_covers_it(monkeypatch):
    """The old bug: TTL 20s under a 30s warm loop left a 10s window in every
    cycle where the client paid the full 4.3s rebuild itself."""
    builds = []
    monkeypatch.setattr(macro.providers, "yahoo_quotes_batch",
                        lambda syms: builds.append(1) or
                        {s: {"price": 1.0, "prevClose": 1.0, "pct": 0.0} for s in syms})
    macro.BOARD.refresh()          # the warm loop
    for _ in range(50):            # 50 client hits in the same window
        macro.fetch_board()
    assert len(builds) == 1, f"client requests rebuilt the board {len(builds) - 1} times"


# --- Histories: RRG and correlations fetch theirs concurrently ---------------

def _slow_series(delay=0.04):
    """Stand-in for a Yahoo candle fetch, with a per-symbol ramp so that a
    sequential implementation cannot pass by being lucky."""
    def f(ysym, tf):
        time.sleep(delay)
        base = 100.0 + (hash(ysym) % 7)
        return {d: base + d * 0.01 for d in range(19000, 19140)}
    return f


def test_day_series_many_runs_the_fetches_together(monkeypatch):
    monkeypatch.setattr(macro, "_day_series", _slow_series(0.05))
    syms = [f"S{i}" for i in range(8)]
    t0 = time.perf_counter()
    out = macro._day_series_many(syms, "3M")
    dt = time.perf_counter() - t0
    assert set(out) == set(syms)
    assert dt < 0.20, f"8 fetches took {dt:.2f}s -- still sequential (would be ~0.40s)"


def test_day_series_many_keeps_each_symbol_with_its_own_series(monkeypatch):
    monkeypatch.setattr(macro, "_day_series", lambda s, tf: {1: float(len(s))})
    out = macro._day_series_many(["A", "BB", "CCC"], "3M")
    assert out == {"A": {1: 1.0}, "BB": {1: 2.0}, "CCC": {1: 3.0}}, "results must not be shuffled"


def test_build_rrg_fetches_its_twelve_histories_together(monkeypatch):
    macro._rrg_cache = None
    monkeypatch.setattr(macro, "_day_series", _slow_series(0.05))
    t0 = time.perf_counter()
    out = macro.build_rrg()
    dt = time.perf_counter() - t0
    assert out["available"], "the fixture must still produce a usable RRG"
    assert dt < 0.25, f"12 histories took {dt:.2f}s -- still sequential (would be ~0.60s)"


def test_build_correlations_fetches_its_nine_histories_together(monkeypatch):
    macro._corr_cache = None
    monkeypatch.setattr(macro, "_day_series", _slow_series(0.05))
    t0 = time.perf_counter()
    out = macro.build_correlations()
    dt = time.perf_counter() - t0
    assert dt < 0.25, f"9 histories took {dt:.2f}s -- still sequential (would be ~0.45s)"
    assert out["available"] and len(out["labels"]) == len(macro.CORR_ASSETS)


def test_build_econ_fetches_its_series_together(monkeypatch):
    """Five FRED round-trips, one per indicator; nothing makes them wait on each
    other. This is the last thing between a fresh backend and a filled board."""
    monkeypatch.setattr(macro.config, "FRED_API_KEY", "test-key")
    def slow(series_id, *, units="lin", limit=40):
        time.sleep(0.05)
        return [{"date": "2026-07-01", "value": "3.6"}, {"date": "2026-08-01", "value": "3.8"}]
    monkeypatch.setattr(macro, "fred_observations", slow)
    t0 = time.perf_counter()
    out = macro.build_econ()
    dt = time.perf_counter() - t0
    assert dt < 0.15, f"5 series took {dt:.2f}s -- still sequential (would be ~0.25s)"
    assert out["available"] and len(out["series"]) == len(macro.ECON)


def test_build_econ_keeps_each_series_on_its_own_row(monkeypatch):
    monkeypatch.setattr(macro.config, "FRED_API_KEY", "test-key")
    monkeypatch.setattr(macro, "fred_observations",
                        lambda sid, *, units="lin", limit=40: [
                            {"date": "2026-08-01", "value": str(len(sid))}])
    out = macro.build_econ()
    for row, (sid, label, _u, _un) in zip(out["series"], macro.ECON):
        assert row["key"] == sid and row["label"] == label
        assert row["value"] == float(len(sid)), "a parallel fetch must not shuffle rows"


def test_build_econ_without_a_key_stays_unavailable(monkeypatch):
    monkeypatch.setattr(macro.config, "FRED_API_KEY", "")
    assert macro.build_econ() == {"available": False, "series": []}

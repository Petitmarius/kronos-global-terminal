import time

import globe


def test_wb_latest_picks_newest_non_null():
    payload = [
        {"page": 1, "total": 3},
        [
            {"date": "2025", "value": None},
            {"date": "2024", "value": 2.5},
            {"date": "2023", "value": 1.9},
        ],
    ]
    assert globe._wb_latest(payload) == (2.5, "2024")


def test_wb_latest_empty():
    assert globe._wb_latest([{"page": 1}, []]) == (None, None)
    assert globe._wb_latest(None) == (None, None)


def test_build_globe_markets_shape():
    quotes = {c["index"]: {"price": 100.0, "prevClose": 99.0, "pct": 1.01,
                           "open": None, "high": None, "low": None}
              for c in globe.GLOBE_MARKETS}
    b = globe.build_globe_markets(quotes)
    assert "updated" in b and len(b["countries"]) == len(globe.GLOBE_MARKETS)
    us = next(c for c in b["countries"] if c["iso"] == "US")
    assert us["index"] == "^GSPC" and us["pct"] == 1.01 and us["level"] == 100.0

def test_build_globe_markets_omits_missing():
    b = globe.build_globe_markets({})
    assert b["countries"] == []

def test_build_globe_markets_has_region():
    quotes = {c["index"]: {"price": 1.0, "prevClose": 1.0, "pct": 0.0,
                           "open": None, "high": None, "low": None}
              for c in globe.GLOBE_MARKETS}
    b = globe.build_globe_markets(quotes)
    us = next(c for c in b["countries"] if c["iso"] == "US")
    assert us["region"] == "Americas"
    assert {c["region"] for c in b["countries"]} == {"Americas", "EMEA", "Asia-Pacific"}

def test_wb_all_rows_parse():
    payload = [{"page": 1}, [
        {"country": {"id": "US"}, "date": "2024", "value": 2.5},
        {"country": {"id": "FR"}, "date": "2024", "value": None},
        {"country": {"id": "1W"}, "date": "2024", "value": 3.0},
    ]]
    out = globe._wb_all_rows(payload)
    assert out["US"] == {"value": 2.5, "year": "2024"}
    assert "FR" not in out
    assert out["1W"]["value"] == 3.0


def test_news_hotspots_counts_and_samples():
    items = [
        {"headline": "China tightens chip export rules", "datetime": 3},
        {"headline": "US and China resume trade talks", "datetime": 2},
        {"headline": "Ukraine grain deal stalls", "datetime": 1},
        {"headline": "Local bakery news", "datetime": 0},
    ]
    pts = globe.news_hotspots(items)
    by = {p["iso"]: p for p in pts}
    assert by["CN"]["count"] == 2
    assert by["US"]["count"] == 1
    assert by["CN"]["headline"] == "China tightens chip export rules"  # newest sample
    assert len(by["CN"]["news"]) == 2 and by["CN"]["news"][0]["datetime"] == 3
    assert "UA" in by and all(k in by["CN"] for k in ("lat", "lon", "name"))

def test_news_hotspots_word_boundary():
    pts = globe.news_hotspots([{"headline": "This caused a stir", "datetime": 0}])
    assert pts == []


def test_country_news_filters_and_trims():
    items = [
        {"headline": "Germany bond sale", "url": "u1", "source": "s", "datetime": 2, "impact": "high"},
        {"headline": "France budget vote", "url": "u2", "source": "s", "datetime": 1, "impact": "low"},
    ]
    out = globe._country_news("DE", items)
    assert len(out) == 1 and out[0]["headline"] == "Germany bond sale"
    assert set(out[0]) == {"headline", "url", "source", "datetime"}

def test_country_news_unknown_iso_empty():
    assert globe._country_news("ZZ", [{"headline": "x", "datetime": 0}]) == []


# --- Markets board: batched, with a per-symbol safety net -------------------

def test_fetch_globe_markets_uses_one_batched_call(monkeypatch):
    calls = []
    def fake_batch(syms):
        calls.append(list(syms))
        return {s: {"price": 100.0, "prevClose": 99.0, "pct": 1.01} for s in syms}
    monkeypatch.setattr(globe.providers, "yahoo_quotes_batch", fake_batch)
    board = globe.MARKETS.refresh()
    assert len(calls) == 1
    assert set(calls[0]) == {c["index"] for c in globe.GLOBE_MARKETS}
    assert len(board["countries"]) == len(globe.GLOBE_MARKETS)


def test_a_country_the_batch_cannot_price_is_omitted_not_zeroed(monkeypatch):
    """^IPSA (Chile) and IMOEX.ME (Russia) are the real gaps. If the fallback
    also fails, the country must vanish from the board rather than show 0."""
    drop = {"^IPSA", "IMOEX.ME"}
    monkeypatch.setattr(globe.providers, "yahoo_quotes_batch",
                        lambda syms: {s: {"price": 100.0, "prevClose": 99.0, "pct": 1.01}
                                      for s in syms if s not in drop})
    board = globe.MARKETS.refresh()
    isos = {c["iso"] for c in board["countries"]}
    assert "CL" not in isos and "RU" not in isos
    assert "US" in isos and len(board["countries"]) == len(globe.GLOBE_MARKETS) - 2


def test_markets_endpoint_serves_the_warm_cache_without_rebuilding(monkeypatch):
    builds = []
    monkeypatch.setattr(globe.providers, "yahoo_quotes_batch",
                        lambda syms: builds.append(1) or
                        {s: {"price": 1.0, "prevClose": 1.0, "pct": 0.0} for s in syms})
    globe.MARKETS.refresh()
    for _ in range(50):
        globe.fetch_globe_markets()
    assert len(builds) == 1, f"client requests rebuilt the map {len(builds) - 1} times"


def test_build_country_fetches_its_three_quotes_concurrently(monkeypatch):
    """Index quote, index candles and the FX pair are independent; serially they
    cost ~0.35s, together ~0.15s."""
    import threading
    seen, lock = [], threading.Lock()
    def slow(*_a, **_k):
        with lock: seen.append(threading.current_thread().name)
        time.sleep(0.05)
        return {"price": 1.0, "prevClose": 1.0, "pct": 0.0, "points": []}
    monkeypatch.setattr(globe.providers, "yahoo_quote_raw", slow)
    monkeypatch.setattr(globe.providers, "yahoo_candles_raw", lambda *a, **k: {"points": []})
    monkeypatch.setattr(globe, "world_bank_macro", lambda iso: {"available": False})
    monkeypatch.setattr(globe.macro, "fetch_news", lambda: {"items": []})
    globe._country_cache.clear()
    t0 = time.perf_counter()
    globe.build_country("FR")
    assert time.perf_counter() - t0 < 0.09, "the three fetches still run one after another"


# --- Country FX row ---------------------------------------------------------

def _stub_country(monkeypatch, fx_price, fx_pct):
    monkeypatch.setattr(globe.providers, "yahoo_quote_raw",
                        lambda sym: {"price": fx_price if sym.endswith("=X") else 100.0,
                                     "prevClose": 1.0,
                                     "pct": fx_pct if sym.endswith("=X") else 0.5})
    monkeypatch.setattr(globe.providers, "yahoo_candles_raw", lambda *a, **k: {"points": []})
    monkeypatch.setattr(globe, "world_bank_macro", lambda iso: {"available": False})
    monkeypatch.setattr(globe.macro, "fetch_news", lambda: {"items": []})
    globe._country_cache.clear()


def test_country_fx_is_reported_as_quoted(monkeypatch):
    """Inverting the rate while still printing the pair's own name rendered
    "USDJPY · 0.0063" -- that is the JPYUSD rate -- beside USDJPY's own
    percentage: label, value and sign each disagreeing, on the 26 USD-quoted
    countries. The Terminal shows the pair the same way the panel now does, so
    the click-through lands on what was on screen."""
    _stub_country(monkeypatch, 159.103, -0.06)
    fx = globe.build_country("JP")["fx"]
    assert fx["pair"] == "USDJPY=X"
    assert fx["level"] == 159.103, f"USDJPY rendered as {fx['level']}"
    assert fx["pct"] == -0.06


def test_country_fx_untouched_for_a_usd_quoted_pair(monkeypatch):
    _stub_country(monkeypatch, 1.1669, -0.05)
    fx = globe.build_country("FR")["fx"]
    assert fx["pair"] == "EURUSD=X" and fx["level"] == 1.1669


def test_country_without_an_fx_pair_reports_none(monkeypatch):
    _stub_country(monkeypatch, 1.0, 0.0)
    assert globe.build_country("US")["fx"] is None, "the US has no pair vs itself"


def test_country_fx_absent_when_the_pair_cannot_be_priced(monkeypatch):
    monkeypatch.setattr(globe.providers, "yahoo_quote_raw",
                        lambda sym: None if sym.endswith("=X") else
                        {"price": 100.0, "prevClose": 99.0, "pct": 1.0})
    monkeypatch.setattr(globe.providers, "yahoo_candles_raw", lambda *a, **k: {"points": []})
    monkeypatch.setattr(globe, "world_bank_macro", lambda iso: {"available": False})
    monkeypatch.setattr(globe.macro, "fetch_news", lambda: {"items": []})
    globe._country_cache.clear()
    assert globe.build_country("JP")["fx"] is None, "never a fabricated rate"

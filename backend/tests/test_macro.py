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

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

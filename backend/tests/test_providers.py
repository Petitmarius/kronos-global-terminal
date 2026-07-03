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

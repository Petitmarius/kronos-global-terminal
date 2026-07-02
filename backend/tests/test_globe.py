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

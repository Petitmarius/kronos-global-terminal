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

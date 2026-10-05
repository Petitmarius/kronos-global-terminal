"""The warm loops must outpace the caches they keep warm.

This is the regression guard for the measured bug: `/api/macro/board` expired
after 20s while its loop only came back every 30s, so one request in three
rebuilt all 37 quotes in the request path and took 4.1-4.6s instead of ~0.
"""
import globe
import macro
import main

# label in main.WARM -> the TTL that entry's period has to stay under
TTL = {
    "macro board": macro._BOARD_HARD_TTL,
    "world markets": globe._MK_HARD_TTL,
    "news": macro._NEWS_TTL,
    "yield curve": macro._CURVE_TTL,
    "calendar": macro._CAL_TTL,
    "correlations": macro._CORR_TTL,
    "sector RRG": macro._RRG_TTL,
    "econ": macro._FRED_TTL,
    "world bank": globe._WB_TTL,
}


def test_every_warm_period_is_shorter_than_its_cache_ttl():
    for label, _fn, every, _delay in main.WARM:
        ttl = TTL[label]
        assert every < ttl, (
            f"{label}: refreshed every {every}s but expires after {ttl}s -- "
            f"leaves a {ttl - every:.0f}s hole per cycle where the client rebuilds it"
        )


def test_every_warm_entry_is_covered_by_this_guard():
    assert {w[0] for w in main.WARM} == set(TTL), "a new warm entry needs a TTL here"


def test_warm_entries_are_callable_and_staggered():
    delays = [w[3] for w in main.WARM]
    assert all(callable(w[1]) for w in main.WARM)
    assert len(set(delays)) == len(delays), "stagger first passes; don't stampede on boot"


def test_boards_stay_at_least_as_fresh_as_the_dashboards_poll():
    """The Macro and Global views poll every 20s; refreshing slower than that
    would hand them a value older than the one they had before this change."""
    for label in ("macro board", "world markets"):
        every = next(w[2] for w in main.WARM if w[0] == label)
        assert every <= 20.0, f"{label} refreshed every {every}s, slower than the 20s UI poll"


# -- spin-down detection ---------------------------------------------------
#
# Same concern as the warm loops, seen from outside: a host that spins the
# service down on idle kills the process and every warm cache with it. Response
# timing cannot detect that -- an open browser tab keeps the service awake, so a
# fast reply looks identical to a working keep-alive ping. A monotonic uptime can:
# it restarts at 0 on every wake, so a reading of hours proves none happened.


def test_health_reports_uptime():
    h = main.health()
    assert "uptime" in h, "no uptime -> a free-tier spin-down is undetectable from outside"
    assert isinstance(h["uptime"], (int, float)) and h["uptime"] >= 0


def test_uptime_grows_and_is_monotonic(monkeypatch):
    first = main.health()["uptime"]
    monkeypatch.setattr(main.time, "monotonic", lambda: main._STARTED + 3600.0)
    assert main.health()["uptime"] == 3600.0
    assert main.health()["uptime"] > first


def test_health_keeps_its_existing_fields():
    """The uptime addition must not disturb what the UI already reads."""
    h = main.health()
    for k in ("status", "live", "finnhub", "clients"):
        assert k in h, f"{k} disappeared from /api/health"
    assert h["status"] == "ok"

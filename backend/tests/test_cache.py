"""The refresh-lock cache that fronts the dashboards' expensive builders."""
import threading
import time

import pytest

import cache


def test_builds_on_first_get_then_serves_the_stored_value():
    calls = []
    c = cache.Cached(lambda: calls.append(1) or "v1", hard_ttl=60)
    assert c.get() == "v1"
    assert c.get() == "v1"
    assert len(calls) == 1, "a warm cache must not rebuild"


def test_peek_does_not_build():
    c = cache.Cached(lambda: pytest.fail("peek must never build"), hard_ttl=60)
    assert c.peek() is None


def test_refresh_always_rebuilds():
    n = iter(range(10))
    c = cache.Cached(lambda: next(n), hard_ttl=60)
    assert c.get() == 0
    assert c.refresh() == 1
    assert c.get() == 1, "get must serve what refresh just stored"


def test_rebuilds_once_the_hard_ttl_has_passed():
    n = iter(range(10))
    c = cache.Cached(lambda: next(n), hard_ttl=0.05)
    assert c.get() == 0
    time.sleep(0.08)
    assert c.get() == 1


def test_concurrent_cold_gets_build_exactly_once():
    """Six clients landing on an empty cache issued 212 Yahoo requests where 37
    were needed. One build, shared by every waiter."""
    calls = []
    def build():
        calls.append(1)
        time.sleep(0.15)
        return "shared"
    c = cache.Cached(build, hard_ttl=60)
    out, barrier = [], threading.Barrier(6)
    def client():
        barrier.wait()
        out.append(c.get())
    threads = [threading.Thread(target=client) for _ in range(6)]
    for t in threads: t.start()
    for t in threads: t.join()
    assert out == ["shared"] * 6
    assert len(calls) == 1, f"thundering herd: built {len(calls)} times"


def test_concurrent_refresh_collapses_into_one_build():
    calls = []
    def build():
        calls.append(1)
        time.sleep(0.15)
        return len(calls)
    c = cache.Cached(build, hard_ttl=60)
    barrier = threading.Barrier(4)
    def client():
        barrier.wait()
        c.refresh()
    threads = [threading.Thread(target=client) for _ in range(4)]
    for t in threads: t.start()
    for t in threads: t.join()
    assert len(calls) == 1, "a refresh joining one already in flight must not duplicate it"


def test_a_failed_rebuild_keeps_serving_the_last_good_value():
    """Same rule as the World Bank and Treasury caches: a transient outage must
    not blank a panel, and must not be cached as if it were an answer."""
    state = {"boom": False}
    def build():
        if state["boom"]:
            raise RuntimeError("provider down")
        return "good"
    c = cache.Cached(build, hard_ttl=0.05)
    assert c.get() == "good"
    state["boom"] = True
    time.sleep(0.08)
    assert c.get() == "good", "stale but real beats empty"
    state["boom"] = False
    assert c.refresh() == "good"


def test_failure_with_nothing_cached_propagates():
    c = cache.Cached(lambda: (_ for _ in ()).throw(RuntimeError("cold and down")), hard_ttl=60)
    with pytest.raises(RuntimeError):
        c.get()

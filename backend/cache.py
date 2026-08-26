"""Single-value caches with a refresh lock.

Every dashboard board is expensive to build and identical for all callers, so
the cache in front of it is not a detail -- it is the thing that keeps a page
load off the network. Two failure modes this guards against, both measured on
this app:

  - Thundering herd. Six clients landing on an expired board issued 212 Yahoo
    requests where 37 were needed, because nothing serialised the rebuilds.
  - A rebuild inside the request. A client arriving on an expired cache paid the
    whole build (4.3s) itself. So `hard_ttl` is a safety ceiling, NOT the
    freshness knob: freshness comes from the warm loop calling `refresh()` on a
    period well under it, which is why `get()` almost never touches the lock.
"""
from __future__ import annotations

import threading
import time
from typing import Callable, Generic, TypeVar

T = TypeVar("T")


class Cached(Generic[T]):
    """One value, rebuilt by `build`, shared by every caller.

    A build that raises is never cached: the previous value keeps being served
    (stale but real beats an empty panel), the same rule the World Bank and
    Treasury caches already follow. With nothing cached yet the exception
    propagates -- there is no real value to serve and inventing one is the thing
    this app does not do.
    """

    def __init__(self, build: Callable[[], T], *, hard_ttl: float) -> None:
        self._build = build
        self._hard_ttl = hard_ttl
        self._lock = threading.Lock()
        self._value: T | None = None
        self._at = 0.0

    def peek(self) -> T | None:
        """Whatever is stored, however old, without ever building."""
        return self._value

    def age(self) -> float | None:
        return None if self._value is None else time.time() - self._at

    def get(self) -> T:
        """Serve the cached value; build only if there is nothing usable."""
        v = self._value
        if v is not None and time.time() - self._at < self._hard_ttl:
            return v
        return self._rebuild()

    def refresh(self) -> T:
        """Rebuild now (the warm loop's entry point), unless another thread is
        already doing exactly that -- then take its result."""
        return self._rebuild()

    def _rebuild(self) -> T:
        entered = time.time()
        with self._lock:
            # A rebuild that finished while we queued on the lock is our answer:
            # this is what collapses N concurrent callers into a single build.
            if self._value is not None and self._at > entered:
                return self._value
            try:
                self._value = self._build()
                self._at = time.time()
            except Exception:
                if self._value is None:
                    raise
                # Leave `_at` alone: the failure is not cached, so the next
                # caller past `hard_ttl` retries instead of inheriting it.
            return self._value

"""Macro dashboard data layer.

Two data planes:
  - Yahoo (keyless): the "board" — rates majors, VIX, DXY, sectors, cross-asset.
  - FRED (free key): economic indicators, full yield curve, latest releases.
FRED functions degrade to {"available": False} when no key is configured.
"""
from __future__ import annotations

import time
import urllib.parse

import config
import providers


def _num(v) -> float | None:
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f


def normalize_yield(v: float | None) -> float | None:
    """Yahoo sometimes quotes rate indices ×10 (42.3 == 4.23%)."""
    if v is None:
        return None
    return round(v / 10.0, 4) if v > 25 else round(v, 4)


def risk_regime(vix: float | None) -> str:
    if vix is None:
        return "—"
    if vix < 15:
        return "Calm"
    if vix < 20:
        return "Normal"
    if vix < 30:
        return "Elevated"
    return "Risk-off"


def latest_prior(obs: list[dict]) -> tuple[float | None, float | None]:
    vals = [f for o in obs if (f := _num(o.get("value"))) is not None]
    latest = vals[-1] if vals else None
    prior = vals[-2] if len(vals) >= 2 else None
    return latest, prior


def spark(obs: list[dict], n: int) -> list[float]:
    vals = [f for o in obs if (f := _num(o.get("value"))) is not None]
    return vals[-n:]


def sort_releases(items: list[dict]) -> list[dict]:
    return sorted(items, key=lambda i: i.get("updated") or "", reverse=True)


# --- FRED client ------------------------------------------------------------

_FRED_BASE = "https://api.stlouisfed.org/fred"
_fred_cache: dict[str, tuple[float, object]] = {}
_FRED_TTL = 6 * 3600.0


def fred_available() -> bool:
    return bool(config.FRED_API_KEY)


def _fred_get(path: str, params: dict) -> dict | None:
    if not fred_available():
        return None
    params = {**params, "api_key": config.FRED_API_KEY, "file_type": "json"}
    url = f"{_FRED_BASE}/{path}?{urllib.parse.urlencode(params)}"
    key = url
    now = time.time()
    if key in _fred_cache and now - _fred_cache[key][0] < _FRED_TTL:
        return _fred_cache[key][1]
    try:
        data = providers._get(url)
    except Exception:  # noqa: BLE001 — keep resilient, fall back to stale
        return _fred_cache.get(key, (0, None))[1]
    _fred_cache[key] = (now, data)
    return data


def fred_observations(series_id: str, *, units: str = "lin", limit: int = 40) -> list[dict]:
    data = _fred_get("series/observations", {
        "series_id": series_id, "units": units,
        "sort_order": "asc", "limit": str(limit),
    })
    return (data or {}).get("observations", []) if data else []


def fred_meta(series_id: str) -> dict:
    data = _fred_get("series", {"series_id": series_id})
    if not data:
        return {}
    arr = data.get("seriess") or []
    if not arr:
        return {}
    s = arr[0]
    return {"units": s.get("units_short") or s.get("units") or "", "updated": s.get("last_updated") or ""}

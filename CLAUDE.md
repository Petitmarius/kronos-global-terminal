# CLAUDE.md — APEX Terminal

Guidance for AI agents working in this repo. Keep it current.

## What this is
APEX is a high-density, real-time **trading / investment simulator** terminal.
- **frontend/** — React 18 + TypeScript + Vite + Zustand + `lightweight-charts` (TradingView). Cyber-trading dark UI.
- **backend/** — FastAPI + WebSocket. Streams quotes, serves candles / order book / macro data.

## Run
```bash
# backend  (http://localhost:8000)
cd backend && pip install -r requirements.txt && python -m uvicorn main:app --port 8000
# frontend (http://localhost:5173, proxies /api and /ws to :8000)
cd frontend && npm install && npm run dev
```
Or `./dev.ps1` (Windows) to launch both. Production check: `cd frontend && npm run build` (runs `tsc --noEmit && vite build`).

## Data sources (layered — see `backend/providers.py`, `backend/feeds.py`)
- **Yahoo Finance (keyless)** is the backbone: real historical candles for every timeframe + live quotes (price + previous close). It is the live source for **indices & commodities** (no websocket exists for them) via `poll_loop`, and refreshes the real previous close for everything via `baseline_loop`.
- **Finnhub websocket** (optional `FINNHUB_API_KEY` in `backend/.env`) — fast real-time ticks for crypto / forex / US stocks.
- **Simulator** (`market.py`) only fills the gap before the first real datapoint and as a candle fallback.

## Key behaviours
- **Timeframes are RANGE-based**: `1D 1W 1M 3M 6M YTD 1Y 5Y MAX`. Each maps to a Yahoo (interval, range) in `providers._YF_TF` so the x-axis labels always match. The chart shows a range-performance % badge (top-left).
- **Order types** (`OrderPanel.tsx`): MARKET fills immediately; LIMIT/STOP create **pending orders** (store `pending`) that fill in `applyQuotes` when price crosses the trigger → become positions.
- **SL/TP** auto-close in `applyQuotes`; **price alerts** fire there too; both raise toasts (`Toasts.tsx`).
- **Account**: Balance = 50k + realized P&L; Equity = Balance + unrealized; P&L Today = realized-today + unrealized (`store.ts computeAccount`).
- **Watchlist** is user-curated and **persisted in localStorage** (`apex.watchlist`, `apex.customs`, `apex.sim`). Search adds any Yahoo symbol; custom symbols get a clean display ticker (`^FCHI`→`FCHI`, `MC.PA`→`MC`) while the Yahoo symbol stays internal, and are re-registered on reload (`App.tsx`).
- **Macro Dashboard** (`components/macro/`): a second primary view toggled from the Header (`store.view`, persisted `apex.view`). Backend `macro.py` endpoints (all real data, nothing simulated):
  - `/api/macro/board` (Yahoo, warmed every 30s by `macro_loop`): rates majors, VIX, DXY, sectors, cross-asset (each cell carries a `local` tradable symbol for click-through), and a composite **Risk Barometer** score (`build_risk`: VIX + HY/IG credit + equities-vs-bonds + DXY + gold → 0–100).
  - `/api/macro/candles?symbol=&tf=` — line candles for an arbitrary Yahoo symbol (charts DXY `DX-Y.NYB`, VIX `^VIX` sparkline outside the tradable universe).
  - `/api/macro/correlations` — Pearson matrix of 3-month daily log-returns across 9 cross-asset instruments (numpy).
  - `/api/macro/rrg` — sector Relative Rotation Graph vs SPY (RS-Ratio/Momentum, weekly-sampled smooth trails, quadrant per sector).
  - `/api/macro/econ|curve|releases` (FRED) and `/api/macro/calendar` (upcoming release dates via FRED `releases/dates`, `asc` from today) — return `{"available": false}` / empty without `FRED_API_KEY`; panels show an "add key" state.
  - `/api/macro/news` — Finnhub general news with a keyless Yahoo-RSS fallback; each item gets an `impact` (high/med/low) keyword heuristic.
  - Yields run through `macro.normalize_yield` (Yahoo sometimes quotes rate indices ×10). `fred_observations` fetches `sort_order=desc` then reverses so callers get the **most recent** N points.
- **Global Map** (`components/globe/`): 3rd primary view (`store.view==='GLOBAL'`). Backend `globe.py` serves `/api/globe/markets` (Yahoo indices for ~42 countries, each with a region, warmed by `globe_loop`), `/api/globe/country/{iso}` (index + FX + fuller World Bank macro — growth/CPI/unemployment/population/nominal GDP/debt/current account — + country-tagged news), `/api/globe/macro-layer` (latest GDP/inflation/unemployment for all countries via batched `country/all` fetches, one request per metric), `/api/globe/geo` (geopolitical hotspots + per-country news derived from the existing news feed by country-name matching). World Bank fetches are batched/cached 24h and **failures are not cached**; layer coloring scales live in `geo/scales.ts`. Map uses `react-simple-maps` + `world-atlas` topojson, joined by numeric ISO (`geo/countries.ts`). A world summary bar (leaders/laggards + regional averages) and a client-side session clock (holidays excluded) round it out.

## Data caveats (be honest with the user)
- The **order book is simulated** — no free L2 feed exists. Its bid/ask derive from `asset.stats.spread` so it stays consistent with the market-data grid. Volume/sizes are synthetic.
- `stats.spread`, `volume`, 52W hi/lo for base assets are synthetic; price / change% / OHLC / history are real (Yahoo).

## Layout map
- backend: `main.py` (REST + `/ws/prices` + `/api/macro/*`), `feeds.py` (poll/baseline/finnhub/simulator loops + `macro_loop`), `market.py` (state, synthetic candles, order book, register custom), `providers.py` (Yahoo candles/quote/search + `YAHOO_MAP`, `_YF_TF`, `yahoo_quote_raw`, `yahoo_candles_raw`), `macro.py` (board + risk score, correlations & RRG via numpy, FRED econ/curve/releases/calendar, Finnhub/Yahoo news; pure helpers tested in `tests/test_macro.py`), `globe.py` (world markets board + per-country detail via World Bank + news-derived geo hotspots; tested in `tests/test_globe.py`), `assets.py` (universe + `FINNHUB_MAP`), `hub.py`, `config.py`.
- frontend `src/`: `store.ts` (Zustand + persistence + SL/TP/alert/pending engine in `applyQuotes`), `api.ts` (REST + reconnecting WS), `components/` (Header, Watchlist, CenterPanel, PriceChart, OrderPanel, Toasts, `macro/` = MacroDashboard + Panel + LiveWireCenter + `panels/*` = RiskBarometer, YieldCurve, Volatility, Rates, CrossAsset, Dollar, Rrg, CorrelationMatrix, EconIndicators; `globe/` = GlobalMap + WorldMap + CountryPanel + SessionClock + MapLegend, join map in `geo/countries.ts`), `indicators.ts`, `types.ts`, `format.ts`, `constants.ts`.

## Gotchas
- Runs on **Python 3.14 / Node 24**.
- On Windows, `uvicorn --reload` spawns a worker child that can keep holding port 8000 after the parent is killed. Free it with `Get-Process python | Stop-Process -Force` (filtering by command line misses the multiprocessing-spawn child). Prefer running without `--reload`.
- `backend/.env` holds `FINNHUB_API_KEY` and `FRED_API_KEY` — gitignored, never commit it (see `backend/.env.example`).
- Yahoo may occasionally rate-limit (429); the code falls back to last prices / synthetic candles without crashing.

# CLAUDE.md — KRONOS Global Terminal

Guidance for AI agents working in this repo. Keep it current.

## What this is
KRONOS Global Terminal is a high-density, real-time **trading / investment simulator** terminal.
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
- **Timeframes are RANGE-based**: `1D 1W 1M 3M 6M YTD 1Y 5Y MAX`. Each maps to a Yahoo (interval, range) in `providers._YF_TF` so the x-axis labels always match. The chart shows a range-performance % badge (top-left). The main chart renders as an area **line** or real **candlesticks** (LINE/CANDLES toolbar toggle, persisted `apex.charttype`, default LINE); OHLC is real Yahoo per-bar data (a bar with no OHLC falls back to line), and the live tick grows the current candle's high/low.
- **Order types** (`OrderPanel.tsx`): MARKET fills immediately; LIMIT/STOP create **pending orders** (store `pending`) that fill in `applyQuotes` when price crosses the trigger → become positions.
- **SL/TP** auto-close in `applyQuotes`; **price alerts** fire there too; both raise toasts (`Toasts.tsx`).
- **Account**: Balance = 50k + realized P&L; Equity = Balance + unrealized; P&L Today = realized-today + unrealized (`store.ts computeAccount`). Foreign-currency **equities** (e.g. `.PA`/`.T` custom symbols) are displayed in their local currency (with a `≈ $X` conversion and a currency tag) but all money math is USD: the asset carries `currency` + a live `usdRate` (backend `providers.usd_rate` + `fx_loop`), and the position freezes `entryRate` at open, so P&L includes the FX move (`store.buildClosed`/`positionPnl`/`computeAccount`). SL/TP stay in local price. FX pairs, crypto, commodities and indices keep `usdRate=1`; positions opened before this feature (no `entryRate`) keep their prior local-number behaviour. A **⚙ Settings** modal (Header) adjusts capital — deposit/withdraw (withdrawal capped at free margin), persisted `apex.capital` — and **resets** the account (clears positions/pending/history/orders/alerts, keeps capital). `computeAccount` takes `capital` as its 4th arg (`balance = capital + realized`). Orders whose margin exceeds free margin are **blocked** (`openPosition`/`placePending` guard → `ERROR` toast; inline warning + disabled BUY/SELL in the ticket). Clicking a **POSITIONS or PENDING** row selects that symbol in the chart.
- **Watchlist** is user-curated and **persisted in localStorage** (`apex.watchlist`, `apex.customs`, `apex.sim`). Search adds any Yahoo symbol; custom symbols get a clean display ticker (`^FCHI`→`FCHI`, `MC.PA`→`MC`) while the Yahoo symbol stays internal, and are re-registered on reload (`App.tsx`).
- **Macro Dashboard** (`components/macro/`): a second primary view toggled from the Header (`store.view`, persisted `apex.view`). Backend `macro.py` endpoints (all real data, nothing simulated):
  - `/api/macro/board` (Yahoo, warmed every 30s by `macro_loop`): rates majors, VIX, DXY, sectors, cross-asset (each cell carries a `local` tradable symbol for click-through), and a composite **Risk Barometer** score (`build_risk`: VIX + HY/IG credit + equities-vs-bonds + DXY + gold → 0–100).
  - `/api/macro/candles?symbol=&tf=` — line candles for an arbitrary Yahoo symbol (charts DXY `DX-Y.NYB`, VIX `^VIX` sparkline outside the tradable universe).
  - `/api/macro/correlations` — Pearson matrix of 3-month daily log-returns across 9 cross-asset instruments (numpy).
  - `/api/macro/rrg` — sector Relative Rotation Graph vs SPY (RS-Ratio/Momentum, weekly-sampled smooth trails, quadrant per sector).
  - `/api/macro/econ|curve|releases` (FRED) and `/api/macro/calendar` (upcoming release dates via FRED `releases/dates`, `asc` from today) — return `{"available": false}` / empty without `FRED_API_KEY`; panels show an "add key" state.
  - `/api/macro/news` — Finnhub general news with a keyless Yahoo-RSS fallback; each item gets an `impact` (high/med/low) keyword heuristic.
  - Yields run through `macro.normalize_yield` (Yahoo sometimes quotes rate indices ×10). `fred_observations` fetches `sort_order=desc` then reverses so callers get the **most recent** N points.
- **Global Map** (`components/globe/`): 3rd primary view (`store.view==='GLOBAL'`). Backend `globe.py` serves `/api/globe/markets` (Yahoo indices for ~42 countries, each with a region, warmed by `globe_loop`), `/api/globe/country/{iso}` (index + FX + fuller World Bank macro — growth/CPI/unemployment/population/nominal GDP/debt/current account — + country-tagged news), `/api/globe/macro-layer` (latest GDP/inflation/unemployment for all countries via batched `country/all` fetches, one request per metric), `/api/globe/geo` (geopolitical hotspots + per-country news derived from the existing news feed by country-name matching). World Bank fetches are batched/cached 24h and **failures are not cached**; layer coloring scales live in `geo/scales.ts`. Map uses `react-simple-maps` + `world-atlas` topojson, joined by numeric ISO (`geo/countries.ts`). A world summary bar (leaders/laggards + regional averages) and a client-side session clock (holidays excluded) round it out. A client-side **Portfolio** mode (toggle in the map legend, persisted `apex.globe.portfolio`) overlays the user's book on the map: countries tinted by notional exposure (blue ramp) with bubbles sized by notional and colored by latent P&L, a left `PortfolioPanel` (per-country latent + realized, plus a non-geographic FX/crypto/commodity bucket), and click-through back to the Terminal. Symbol→country resolution lives in `geo/exposure.ts` (base table + Yahoo exchange suffix + the loaded markets board); nothing is simulated. A right-docked **AnalyticsPanel** balances the view: a 30-day **realized-P&L** area chart (`geo/exposure.realizedCurve`) and a **non-geographic** SVG donut (`NonGeoDonut`, FX/crypto/commodities) with per-class latent/realized P&L and a hover drill-down to the underlying symbols. The left `PortfolioPanel` keeps only geographic exposure (EXP/LAT/REAL columns); its BY COUNTRY list and top-5 allocation show only countries with open exposure (`notional>0`), while a separate **REALIZED P&L · by-country** stacked bar (|realized| share, green/red by sign) covers realized-only countries. Non-geographic assets live in the right panel.

## Data caveats (be honest with the user)
- The **order book is simulated** — no free L2 feed exists. Its bid/ask derive from `asset.stats.spread` so it stays consistent with the market-data grid. Volume/sizes are synthetic.
- **52W hi/lo and volume are real** (Yahoo `fiftyTwoWeekHigh`/`fiftyTwoWeekLow` + `regularMarketVolume`, streamed in `_quote`); the **VOL** study plots real per-bar candle volume. Instruments Yahoo reports no volume for (e.g. FX spot) show `—` / an empty VOL study — never fabricated. Only `stats.spread` and the order book remain synthetic (no free L2 feed). price / change% / OHLC / history are real (Yahoo).

## Layout map
- backend: `main.py` (REST + `/ws/prices` + `/api/macro/*` + `/api/globe/*`; on startup spawns the async loops — incl. `macro_loop` + `globe_loop`, which warm the macro/world boards), `feeds.py` (poll/baseline/fx/finnhub/simulator loops), `market.py` (state, synthetic candles, order book, register custom), `providers.py` (Yahoo candles/quote/search + `YAHOO_MAP`, `_YF_TF`, `yahoo_quote_raw`, `yahoo_candles_raw`, `usd_rate`), `macro.py` (board + risk score, correlations & RRG via numpy, FRED econ/curve/releases/calendar, Finnhub/Yahoo news; pure helpers tested in `tests/test_macro.py`), `globe.py` (world markets board + per-country detail via World Bank + macro-layer + news-derived geo hotspots; tested in `tests/test_globe.py`), `assets.py` (universe + `FINNHUB_MAP`), `hub.py`, `config.py`.
- frontend `src/`: `store.ts` (Zustand + persistence + SL/TP/alert/pending engine in `applyQuotes`), `api.ts` (REST + reconnecting WS), `components/` (Header, Watchlist, CenterPanel, PriceChart, OrderPanel, SettingsModal, Toasts, `macro/` = MacroDashboard + Panel + LiveWireCenter + `panels/*` = RiskBarometer, YieldCurve, Volatility, Rates, CrossAsset, Dollar, Rrg, CorrelationMatrix, EconIndicators; `globe/` = GlobalMap + WorldMap + CountryPanel + SessionClock + MapLegend + WorldSummary + GeoPanel + PortfolioPanel + AnalyticsPanel + NonGeoDonut), `geo/` (`countries.ts` topojson ISO join, `scales.ts` macro-layer color scales, `exposure.ts` symbol→country + portfolio exposure model), `indicators.ts`, `types.ts`, `format.ts`, `constants.ts`.

## Gotchas
- Runs on **Python 3.14 / Node 24**.
- On Windows, `uvicorn --reload` spawns a worker child that can keep holding port 8000 after the parent is killed. Free it with `Get-Process python | Stop-Process -Force` (filtering by command line misses the multiprocessing-spawn child). Prefer running without `--reload`.
- `backend/.env` holds `FINNHUB_API_KEY` and `FRED_API_KEY` — gitignored, never commit it (see `backend/.env.example`).
- Yahoo may occasionally rate-limit (429); the code falls back to last prices / synthetic candles without crashing.

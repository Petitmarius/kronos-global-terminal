# CLAUDE.md — APEX Terminal

Guidance for AI agents working in this repo. Keep it current.

## What this is
APEX is a high-density, real-time **trading / investment simulator** terminal.
- **frontend/** — React 18 + TypeScript + Vite + Zustand + `lightweight-charts` (TradingView). Cyber-trading dark UI.
- **backend/** — FastAPI + WebSocket. Streams quotes, serves candles / order book.
- **legacy-streamlit/** — the original Streamlit prototype. **Do not extend it** (kept only for reference).

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

## Data caveats (be honest with the user)
- The **order book is simulated** — no free L2 feed exists. Its bid/ask derive from `asset.stats.spread` so it stays consistent with the market-data grid. Volume/sizes are synthetic.
- `stats.spread`, `volume`, 52W hi/lo for base assets are synthetic; price / change% / OHLC / history are real (Yahoo).

## Layout map
- backend: `main.py` (REST + `/ws/prices`), `feeds.py` (poll/baseline/finnhub/simulator loops), `market.py` (state, synthetic candles, order book, register custom), `providers.py` (Yahoo candles/quote/search + `YAHOO_MAP`, `_YF_TF`), `assets.py` (universe + `FINNHUB_MAP`), `hub.py`, `config.py`.
- frontend `src/`: `store.ts` (Zustand + persistence + SL/TP/alert/pending engine in `applyQuotes`), `api.ts` (REST + reconnecting WS), `components/` (Header, Watchlist, CenterPanel, PriceChart, OrderPanel, Toasts), `indicators.ts`, `types.ts`, `format.ts`, `constants.ts`.

## Gotchas
- Runs on **Python 3.14 / Node 24**. Use `width='stretch'` not `use_container_width` (legacy only).
- On Windows, `uvicorn --reload` spawns a worker child that can keep holding port 8000 after the parent is killed. Free it with `Get-Process python | Stop-Process -Force` (filtering by command line misses the multiprocessing-spawn child). Prefer running without `--reload`.
- `backend/.env` holds `FINNHUB_API_KEY` — gitignored, never commit it.
- Yahoo may occasionally rate-limit (429); the code falls back to last prices / synthetic candles without crashing.

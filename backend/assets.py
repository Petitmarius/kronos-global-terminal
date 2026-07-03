"""The tradable universe and its mapping to the Finnhub real-time feed.

`price` is the session's starting mark; `pct` the day's move used to derive the
fixed previous close.  Anything without a Finnhub symbol is driven purely by the
simulator (free tiers do not stream indices / most commodities).
"""
from __future__ import annotations

# symbol, name, category, start price, day %, decimals, contract size
_RAW = [
    ("NAS100",  "NASDAQ 100 Index",     "INDEX",  22700.00, -0.77, 2, 1),
    ("US30",    "Dow Jones 30",         "INDEX",  43210.50,  0.21, 2, 1),
    ("SPX500",  "S&P 500 Index",        "INDEX",   5912.30, -0.18, 2, 1),
    ("GER40",   "DAX 40 Index",         "INDEX",  18540.00,  0.44, 2, 1),
    ("UK100",   "FTSE 100 Index",       "INDEX",   8210.40, -0.09, 2, 1),
    ("EURUSD",  "Euro / US Dollar",     "FX",         1.08563,  0.12, 5, 100_000),
    ("GBPUSD",  "British Pound / USD",  "FX",         1.27840, -0.23, 5, 100_000),
    ("USDJPY",  "US Dollar / Yen",      "FX",       158.852,   0.31, 3, 100_000),
    ("AUDUSD",  "Aussie / US Dollar",   "FX",         0.65420, -0.41, 5, 100_000),
    ("USDCAD",  "US Dollar / Loonie",   "FX",         1.37210,  0.08, 5, 100_000),
    ("BTCUSD",  "Bitcoin / US Dollar",  "CRYPTO",  64250.00,  2.14, 2, 1),
    ("ETHUSD",  "Ethereum / US Dollar", "CRYPTO",   3120.50,  1.66, 2, 1),
    ("SOLUSD",  "Solana / US Dollar",   "CRYPTO",    146.20, -3.21, 2, 1),
    ("XRPUSD",  "Ripple / US Dollar",   "CRYPTO",      0.5234, -1.12, 4, 1),
    ("AAPL",    "Apple Inc.",           "EQ",        212.45,  0.54, 2, 1),
    ("NVDA",    "NVIDIA Corp.",         "EQ",        126.80,  3.42, 2, 1),
    ("TSLA",    "Tesla Inc.",           "EQ",        184.30, -2.05, 2, 1),
    ("MSFT",    "Microsoft Corp.",      "EQ",        441.20,  0.36, 2, 1),
    ("AMZN",    "Amazon.com Inc.",      "EQ",        186.10, -0.62, 2, 1),
    ("XAUUSD",  "Gold Spot / USD",      "CMD",      2412.00,  0.12, 2, 100),
    ("XAGUSD",  "Silver Spot / USD",    "CMD",        31.45, -0.88, 2, 5000),
    ("WTI",     "Crude Oil WTI",        "CMD",        78.34,  1.05, 2, 1000),
    ("BRENT",   "Brent Crude Oil",      "CMD",        82.10,  0.92, 2, 1000),
    ("NATGAS",  "Natural Gas",          "CMD",         2.845, -1.74, 3, 10000),
]

CATEGORIES = ["ALL", "FX", "CRYPTO", "INDEX", "EQ", "CMD"]

# our symbol -> Finnhub feed symbol (only these can go live)
FINNHUB_MAP = {
    "BTCUSD": "BINANCE:BTCUSDT",
    "ETHUSD": "BINANCE:ETHUSDT",
    "SOLUSD": "BINANCE:SOLUSDT",
    "XRPUSD": "BINANCE:XRPUSDT",
    "AAPL": "AAPL", "NVDA": "NVDA", "TSLA": "TSLA", "MSFT": "MSFT", "AMZN": "AMZN",
    "EURUSD": "OANDA:EUR_USD", "GBPUSD": "OANDA:GBP_USD", "USDJPY": "OANDA:USD_JPY",
    "AUDUSD": "OANDA:AUD_USD", "USDCAD": "OANDA:USD_CAD",
    "XAUUSD": "OANDA:XAU_USD", "XAGUSD": "OANDA:XAG_USD",
}
# reverse lookup: Finnhub symbol -> our symbol
PROVIDER_TO_LOCAL = {v: k for k, v in FINNHUB_MAP.items()}


def universe() -> list[dict]:
    out = []
    for sym, name, cat, price, pct, digits, contract in _RAW:
        prev_close = price / (1 + pct / 100.0)
        out.append({
            "symbol": sym, "name": name, "cat": cat, "digits": digits,
            "contract": contract, "price": price, "prev_close": prev_close,
            "provider": FINNHUB_MAP.get(sym), "currency": "USD",
        })
    return out

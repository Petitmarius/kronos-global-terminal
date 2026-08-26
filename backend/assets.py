"""The tradable universe and its mapping to the Finnhub real-time feed.

This file holds **reference metadata only** — symbol, display name, category,
decimals and contract size. It deliberately carries no prices: an instrument has
no price until a provider supplies one, and the UI renders that absence as
"no data" rather than inventing a plausible number.
"""
from __future__ import annotations

# symbol, name, category, decimals, contract size
_RAW = [
    ("NAS100",  "NASDAQ 100 Index",     "INDEX",  2, 1),
    ("US30",    "Dow Jones 30",         "INDEX",  2, 1),
    ("SPX500",  "S&P 500 Index",        "INDEX",  2, 1),
    ("GER40",   "DAX 40 Index",         "INDEX",  2, 1),
    ("UK100",   "FTSE 100 Index",       "INDEX",  2, 1),
    ("EURUSD",  "Euro / US Dollar",     "FX",     5, 100_000),
    ("GBPUSD",  "British Pound / USD",  "FX",     5, 100_000),
    ("USDJPY",  "US Dollar / Yen",      "FX",     3, 100_000),
    ("AUDUSD",  "Aussie / US Dollar",   "FX",     5, 100_000),
    ("USDCAD",  "US Dollar / Loonie",   "FX",     5, 100_000),
    ("BTCUSD",  "Bitcoin / US Dollar",  "CRYPTO", 2, 1),
    ("ETHUSD",  "Ethereum / US Dollar", "CRYPTO", 2, 1),
    ("SOLUSD",  "Solana / US Dollar",   "CRYPTO", 2, 1),
    ("XRPUSD",  "Ripple / US Dollar",   "CRYPTO", 4, 1),
    ("AAPL",    "Apple Inc.",           "EQ",     2, 1),
    ("NVDA",    "NVIDIA Corp.",         "EQ",     2, 1),
    ("TSLA",    "Tesla Inc.",           "EQ",     2, 1),
    ("MSFT",    "Microsoft Corp.",      "EQ",     2, 1),
    ("AMZN",    "Amazon.com Inc.",      "EQ",     2, 1),
    ("XAUUSD",  "Gold Spot / USD",      "CMD",    2, 100),
    ("XAGUSD",  "Silver Spot / USD",    "CMD",    2, 5000),
    ("WTI",     "Crude Oil WTI",        "CMD",    2, 1000),
    ("BRENT",   "Brent Crude Oil",      "CMD",    2, 1000),
    ("NATGAS",  "Natural Gas",          "CMD",    3, 10000),
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
    """Every instrument, priceless. Providers fill the price in; nothing else does."""
    return [
        {
            "symbol": sym, "name": name, "cat": cat, "digits": digits,
            "contract": contract, "price": None, "prev_close": None,
            "provider": FINNHUB_MAP.get(sym), "currency": "USD",
        }
        for sym, name, cat, digits, contract in _RAW
    ]

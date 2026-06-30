"""Runtime configuration, loaded from environment / .env."""
import os

from dotenv import load_dotenv

load_dotenv()

FINNHUB_API_KEY: str = os.getenv("FINNHUB_API_KEY", "").strip()
SIM_INTERVAL: float = float(os.getenv("SIM_INTERVAL", "1.0"))
CORS_ORIGINS: list[str] = [
    o.strip() for o in os.getenv(
        "CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
    ).split(",") if o.strip()
]

LIVE_ENABLED: bool = bool(FINNHUB_API_KEY)
FINNHUB_WS_URL = "wss://ws.finnhub.io"

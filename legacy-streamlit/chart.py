"""Neon price chart built with Plotly.

A clean continuous line on a grid-less dark canvas, with optional technical
overlays (MA, Bollinger Bands) and stacked study panels (VOL, RSI, MACD).
"""
from __future__ import annotations

import numpy as np
import pandas as pd
import plotly.graph_objects as go
from plotly.subplots import make_subplots

GREEN = "#00E676"
RED = "#FF1744"
AMBER = "#FF9100"
GRID = "#101820"


def _ema(s: pd.Series, n: int) -> pd.Series:
    return s.ewm(span=n, adjust=False).mean()


def _rsi(s: pd.Series, n: int = 14) -> pd.Series:
    delta = s.diff()
    up = delta.clip(lower=0).rolling(n).mean()
    down = (-delta.clip(upper=0)).rolling(n).mean()
    rs = up / down.replace(0, np.nan)
    return 100 - (100 / (1 + rs))


def build_chart(series: np.ndarray, indicators: set[str], up: bool) -> go.Figure:
    color = GREEN if up else RED
    s = pd.Series(series)
    x = list(range(len(s)))

    panels = [p for p in ("VOL", "RSI", "MACD") if p in indicators]
    rows = 1 + len(panels)
    heights = [1.0 - 0.17 * len(panels)] + [0.17] * len(panels)

    fig = make_subplots(
        rows=rows, cols=1, shared_xaxes=True,
        vertical_spacing=0.03, row_heights=heights,
    )

    # ---- Bollinger bands (behind the price line) --------------------------
    if "BB" in indicators:
        mid = s.rolling(20, min_periods=1).mean()
        std = s.rolling(20, min_periods=1).std().fillna(0)
        upper, lower = mid + 2 * std, mid - 2 * std
        fig.add_trace(go.Scatter(x=x, y=upper, line=dict(color="rgba(96,125,139,.45)", width=1),
                                 hoverinfo="skip", showlegend=False), row=1, col=1)
        fig.add_trace(go.Scatter(x=x, y=lower, fill="tonexty", fillcolor="rgba(96,125,139,.08)",
                                 line=dict(color="rgba(96,125,139,.45)", width=1),
                                 hoverinfo="skip", showlegend=False), row=1, col=1)

    # ---- gradient area + glow + crisp price line --------------------------
    rgb = "0,230,118" if up else "255,23,68"
    fig.add_trace(go.Scatter(x=x, y=s, fill="tozeroy",
                             fillcolor=f"rgba({rgb},0.10)",
                             line=dict(color=color, width=6),
                             opacity=0.18, hoverinfo="skip", showlegend=False), row=1, col=1)
    fig.add_trace(go.Scatter(x=x, y=s, mode="lines",
                             line=dict(color=color, width=2, shape="spline"),
                             name="Price",
                             hovertemplate="%{y:,.2f}<extra></extra>"), row=1, col=1)

    # ---- moving average overlay ------------------------------------------
    if "MA" in indicators:
        ma = s.rolling(20, min_periods=1).mean()
        fig.add_trace(go.Scatter(x=x, y=ma, mode="lines",
                                 line=dict(color=AMBER, width=1.3, dash="dot"),
                                 name="MA20", hovertemplate="MA %{y:,.2f}<extra></extra>"), row=1, col=1)

    # ---- stacked study panels --------------------------------------------
    r = 2
    if "VOL" in panels:
        vol = (s.diff().abs().fillna(0) * 800 + np.linspace(50, 120, len(s)))
        bar_col = [GREEN if (i > 0 and s.iloc[i] >= s.iloc[i - 1]) else RED for i in range(len(s))]
        fig.add_trace(go.Bar(x=x, y=vol, marker_color=bar_col, opacity=0.6,
                             hoverinfo="skip", showlegend=False), row=r, col=1)
        r += 1
    if "RSI" in panels:
        rsi = _rsi(s).fillna(50)
        fig.add_trace(go.Scatter(x=x, y=rsi, line=dict(color="#42A5F5", width=1.3),
                                 hovertemplate="RSI %{y:.1f}<extra></extra>", showlegend=False), row=r, col=1)
        fig.add_hline(y=70, line=dict(color="rgba(255,23,68,.4)", width=1, dash="dot"), row=r, col=1)
        fig.add_hline(y=30, line=dict(color="rgba(0,230,118,.4)", width=1, dash="dot"), row=r, col=1)
        fig.update_yaxes(range=[0, 100], row=r, col=1)
        r += 1
    if "MACD" in panels:
        macd = _ema(s, 12) - _ema(s, 26)
        signal = _ema(macd, 9)
        hist = macd - signal
        hcol = [GREEN if v >= 0 else RED for v in hist]
        fig.add_trace(go.Bar(x=x, y=hist, marker_color=hcol, opacity=0.5,
                             hoverinfo="skip", showlegend=False), row=r, col=1)
        fig.add_trace(go.Scatter(x=x, y=macd, line=dict(color=AMBER, width=1.2),
                                 hoverinfo="skip", showlegend=False), row=r, col=1)
        fig.add_trace(go.Scatter(x=x, y=signal, line=dict(color="#42A5F5", width=1.2),
                                 hoverinfo="skip", showlegend=False), row=r, col=1)
        r += 1

    # ---- canvas styling ---------------------------------------------------
    lo, hi = float(s.min()), float(s.max())
    pad = (hi - lo) * 0.12 or 1
    fig.update_yaxes(range=[lo - pad, hi + pad], row=1, col=1)

    fig.update_layout(
        height=330 + 70 * len(panels),
        margin=dict(l=4, r=10, t=6, b=4),
        paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)",
        showlegend=False, bargap=0.2, dragmode=False,
        hoverlabel=dict(bgcolor="#12161A", bordercolor=color,
                        font=dict(family="JetBrains Mono", color="#fff", size=12)),
        font=dict(family="JetBrains Mono", color="#607D8B", size=10),
    )
    fig.update_xaxes(showgrid=False, zeroline=False, showticklabels=False,
                     showspikes=True, spikecolor="#2c3a49", spikethickness=1, spikedash="dot")
    fig.update_yaxes(showgrid=False, zeroline=False, side="right",
                     tickfont=dict(color="#4A5663", size=9), nticks=5)
    return fig

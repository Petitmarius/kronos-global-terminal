"""APEX — High-density financial trading terminal (Streamlit).

Layout: global header + scrolling ticker, then three columns
    [ watchlist | analysis & chart | depth-of-market & order ticket ]
"""
from __future__ import annotations

import datetime as dt

import streamlit as st

import mock_data as md
from chart import build_chart
from styles import inject

st.set_page_config(page_title="APEX Terminal", page_icon="📈",
                   layout="wide", initial_sidebar_state="collapsed")
inject()

# ----------------------------------------------------------------------------
# Session state
# ----------------------------------------------------------------------------
ss = st.session_state
ss.setdefault("selected", md.DEFAULT_SYMBOL)
ss.setdefault("timeframe", "1D")
ss.setdefault("indicators", set())
ss.setdefault("order_type", "MARKET")
ss.setdefault("tab", "POSITIONS")
ss.setdefault("category", "ALL")
ss.setdefault("positions", [])

CONTRACT = {"FX": 100_000, "INDEX": 1, "EQ": 1, "CRYPTO": 1, "CMD": 100}
# short display labels so the 6 filter chips fit on one line each
CAT_LABELS = {"ALL": "ALL", "FX": "FX", "CRYPTO": "CRY", "INDEX": "IDX", "EQ": "EQ", "CMD": "CMD"}
BALANCE = 50_000.0


def set_state(key: str, value) -> None:
    if ss[key] != value:
        ss[key] = value
        st.rerun()


def toggle_indicator(name: str) -> None:
    ss.indicators ^= {name}
    st.rerun()


def cls(pct: float) -> str:
    return "pos" if pct >= 0 else "neg"


def arrow(pct: float) -> str:
    return "▲" if pct >= 0 else "▼"


# ----------------------------------------------------------------------------
# Account roll-up (driven by open demo positions)
# ----------------------------------------------------------------------------
def account_summary() -> dict:
    pnl = sum(p["pnl"] for p in ss.positions)
    margin = sum(p["margin"] for p in ss.positions)
    equity = BALANCE + pnl
    return {"balance": BALANCE, "equity": equity, "pnl": pnl,
            "margin": margin, "free": equity - margin}


def refresh_positions() -> None:
    """Re-mark open positions against the latest mid price."""
    for p in ss.positions:
        a = md.ASSETS[p["symbol"]]
        mult = CONTRACT[a["cat"]] * p["lots"]
        p["current"] = a["price"]
        p["pnl"] = (a["price"] - p["entry"]) * p["sign"] * mult
        p["pnl_pct"] = (p["pnl"] / p["margin"] * 100) if p["margin"] else 0.0


refresh_positions()
acct = account_summary()

# ============================================================================
# HEADER
# ============================================================================
m = acct


def _metric(k, v, klass=""):
    return f"<div class='metric'><span class='k'>{k}</span><span class='v {klass}'>{v}</span></div>"


pnl_klass = "pos" if m["pnl"] >= 0 else "neg"
header = f"""
<div class="apex-header">
  <div class="brand">
    <span class="logo">AP<b>E</b>X</span>
    <span class="tag">PROP&nbsp;TERMINAL&nbsp;·&nbsp;DEMO</span>
  </div>
  <div class="metrics">
    {_metric("Balance", f"${m['balance']:,.2f}")}
    {_metric("Equity", f"${m['equity']:,.2f}")}
    {_metric("P&amp;L Today", f"${m['pnl']:,.2f}", pnl_klass)}
    {_metric("Margin", f"${m['margin']:,.2f}")}
    {_metric("Free Margin", f"${m['free']:,.2f}")}
  </div>
  <div class="netbox">
    <div class="status pos"><span class="dot"></span>CONNECTED</div>
    <div class="ping">PING <b>12ms</b></div>
  </div>
</div>
"""
st.markdown(header, unsafe_allow_html=True)

# ---- ticker tape -----------------------------------------------------------
tk = ""
for a in md.ticker_items():
    tk += (f"<span class='tk'><b>{a['symbol']}</b>"
           f"<span class='px {cls(a['pct'])}'>{md.fmt(a['price'], a['digits'])} "
           f"{arrow(a['pct'])}{abs(a['pct']):.2f}%</span></span>")
st.markdown(f"<div class='ticker'><div class='ticker-track'>{tk}{tk}</div></div>",
            unsafe_allow_html=True)

# ============================================================================
# THREE-COLUMN BODY
# ============================================================================
left, center, right = st.columns([1, 3.5, 1.5], gap="small")

# ----------------------------------------------------------------------------
# LEFT — WATCHLIST
# ----------------------------------------------------------------------------
with left:
    st.markdown("<div class='panel-title'>MARKETS<span class='mut'>WATCHLIST</span></div>",
                unsafe_allow_html=True)
    search = st.text_input("search", placeholder="Search markets...",
                           label_visibility="collapsed", key="search").strip().upper()

    # category filter tabs
    cat_cols = st.columns(len(md.CATEGORIES))
    for c, name in zip(cat_cols, md.CATEGORIES):
        with c:
            if st.button(CAT_LABELS[name], key=f"cat_{name}", width='stretch',
                         type="primary" if ss.category == name else "secondary"):
                set_state("category", name)

    # filtered rows
    rows = [a for a in md.ASSETS.values()
            if (ss.category == "ALL" or a["cat"] == ss.category)
            and (not search or search in a["symbol"] or search in a["name"].upper())]

    if not rows:
        st.markdown("<div class='empty'>NO MATCHING MARKETS</div>", unsafe_allow_html=True)
    for a in rows:
        on = "on" if a["symbol"] == ss.selected else ""
        st.markdown(
            f"""<div class="wl-row {on}">
              <span class="wl-l"><div class="sym">{a['symbol']}</div>
              <div class="nm">{a['name']}</div></span>
              <span class="wl-r"><div class="px">{md.fmt(a['price'], a['digits'])}</div>
              <div class="ch {cls(a['pct'])}">{arrow(a['pct'])} {abs(a['pct']):.2f}%</div></span>
            </div>""", unsafe_allow_html=True)
        if st.button(a["symbol"], key=f"wl_{a['symbol']}", width='stretch'):
            set_state("selected", a["symbol"])

# ----------------------------------------------------------------------------
# CENTER — ANALYSIS
# ----------------------------------------------------------------------------
sym = ss.selected
asset = md.ASSETS[sym]
dig = asset["digits"]

with center:
    # ---- instrument identity + headline price ----
    st.markdown(f"""
    <div class="panel">
      <div class="idrow">
        <div class="idtitle">
          <div><span class="s">{sym}</span><span class="badge">{asset['cat']}</span></div>
          <div class="full">{asset['name']}</div>
        </div>
        <div class="bigprice">
          <div class="p {cls(asset['pct'])}">{md.fmt(asset['price'], dig)}</div>
          <div class="c {cls(asset['pct'])}">{arrow(asset['pct'])} {md.fmt(abs(asset['chg']), dig)} ({asset['pct']:+.2f}%)</div>
        </div>
      </div>
    """, unsafe_allow_html=True)

    # ---- 8-cell market data grid ----
    stats = md.market_stats(sym)

    def gridval(key, val):
        if val is None:
            return "—"
        if key == "VOLUME":
            return f"{val:,.0f}"
        if key == "SPREAD":
            return f"{val:g}"
        return md.fmt(val, dig)

    order = ["OPEN", "HIGH", "LOW", "PREV CLOSE", "VOLUME", "SPREAD", "52W HI", "52W LO"]
    cells = "".join(
        f"<div class='cell'><div class='k'>{k}</div><div class='v'>{gridval(k, stats[k])}</div></div>"
        for k in order)
    st.markdown(f"<div class='grid8'>{cells}</div></div>", unsafe_allow_html=True)

    # ---- chart toolbar ----
    tf_col, ind_col = st.columns([1.1, 1])
    with tf_col:
        st.markdown("<div class='tlabel'>TIMEFRAME</div>", unsafe_allow_html=True)
        cols = st.columns(len(md.TIMEFRAMES))
        for c, t in zip(cols, md.TIMEFRAMES):
            with c:
                if st.button(t, key=f"tf_{t}", width='stretch',
                             type="primary" if ss.timeframe == t else "secondary"):
                    set_state("timeframe", t)
    with ind_col:
        st.markdown("<div class='tlabel'>STUDIES</div>", unsafe_allow_html=True)
        inds = ["MA", "RSI", "MACD", "VOL", "BB"]
        cols = st.columns(len(inds))
        for c, name in zip(cols, inds):
            with c:
                if st.button(name, key=f"ind_{name}", width='stretch',
                             type="primary" if name in ss.indicators else "secondary"):
                    toggle_indicator(name)

    # ---- neon chart ----
    series = md.price_series(sym, ss.timeframe)
    fig = build_chart(series, ss.indicators, up=asset["pct"] >= 0)
    st.plotly_chart(fig, width='stretch', config={"displayModeBar": False})

    # ---- bottom: positions / orders tabs ----
    tabs = ["POSITIONS", "ORDER HISTORY", "TRADE LOG", "ALERTS"]
    tcols = st.columns(len(tabs))
    for c, name in zip(tcols, tabs):
        with c:
            label = name + (f"  ({len(ss.positions)})" if name == "POSITIONS" and ss.positions else "")
            if st.button(label, key=f"tab_{name}", width='stretch',
                         type="primary" if ss.tab == name else "secondary"):
                set_state("tab", name)

    if ss.tab == "POSITIONS" and ss.positions:
        head = "".join(f"<th>{h}</th>" for h in
                       ["SYMBOL", "DIR", "LOTS", "ENTRY", "CURRENT", "P&L", "P&L %",
                        "STOP LOSS", "TAKE PROFIT", "TIME"])
        body = ""
        for p in ss.positions:
            d = md.ASSETS[p["symbol"]]["digits"]
            tag = "tag-buy" if p["sign"] > 0 else "tag-sell"
            pc = cls(p["pnl"])
            body += (
                f"<tr><td><b>{p['symbol']}</b></td>"
                f"<td><span class='{tag}'>{p['dir']}</span></td>"
                f"<td>{p['lots']:.2f}</td>"
                f"<td>{md.fmt(p['entry'], d)}</td>"
                f"<td>{md.fmt(p['current'], d)}</td>"
                f"<td class='{pc}'>${p['pnl']:,.2f}</td>"
                f"<td class='{pc}'>{p['pnl_pct']:+.2f}%</td>"
                f"<td>{md.fmt(p['sl'], d) if p['sl'] else '—'}</td>"
                f"<td>{md.fmt(p['tp'], d) if p['tp'] else '—'}</td>"
                f"<td class='mut'>{p['time']}</td></tr>")
        st.markdown(f"<table class='ptable'><tr>{head}</tr>{body}</table>",
                    unsafe_allow_html=True)
    elif ss.tab == "POSITIONS":
        st.markdown("<div class='empty'><div class='big'>NO OPEN POSITIONS</div>"
                    "PLACE A DEMO TRADE TO GET STARTED</div>", unsafe_allow_html=True)
    else:
        msg = {"ORDER HISTORY": "NO ORDERS YET", "TRADE LOG": "TRADE LOG IS EMPTY",
               "ALERTS": "NO ACTIVE ALERTS"}[ss.tab]
        st.markdown(f"<div class='empty'>{msg}</div>", unsafe_allow_html=True)

# ----------------------------------------------------------------------------
# RIGHT — DEPTH OF MARKET + ORDER TICKET
# ----------------------------------------------------------------------------
with right:
    book = md.order_book(sym)
    bdig = book["digits"]

    # ---- order book ----
    dom = "<div class='panel'><div class='panel-title'>DEPTH OF MARKET<span class='mut'>L2</span></div>"
    dom += "<div class='dom-head'><span>PRICE</span><span>SIZE</span><span>TOTAL</span></div>"

    def dom_row(level, side):
        w = level["size"] / book["max_size"] * 100
        tot = level["total"]
        tot_s = f"{tot/1e6:.1f}M" if tot >= 1e6 else f"{tot/1e3:.0f}K"
        return (f"<div class='dom-row {side}'><div class='bar' style='width:{w:.0f}%'></div>"
                f"<span class='p'>{md.fmt(level['price'], bdig)}</span>"
                f"<span class='sz'>{level['size']}</span>"
                f"<span class='tt'>{tot_s}</span></div>")

    for lvl in reversed(book["asks"]):        # highest ask on top
        dom += dom_row(lvl, "ask")
    dom += (f"<div class='dom-spread'><span>SPREAD <span class='v'>{book['spread']:.2f}</span></span>"
            f"<span>BID <span class='v'>{md.fmt(book['bid'], bdig)}</span></span>"
            f"<span>ASK <span class='v'>{md.fmt(book['ask'], bdig)}</span></span></div>")
    for lvl in book["bids"]:                  # best bid just under spread
        dom += dom_row(lvl, "bid")
    dom += "</div>"
    st.markdown(dom, unsafe_allow_html=True)

    # ---- order ticket ----
    st.markdown("<div class='panel-title'>DEMO ORDER ENTRY<span class='mut'>"
                f"{sym}</span></div>", unsafe_allow_html=True)

    otypes = ["MARKET", "LIMIT", "STOP"]
    ocols = st.columns(3)
    for c, t in zip(ocols, otypes):
        with c:
            if st.button(t, key=f"ot_{t}", width='stretch',
                         type="primary" if ss.order_type == t else "secondary"):
                set_state("order_type", t)

    st.markdown("<div class='fieldlabel'>Lots</div>", unsafe_allow_html=True)
    lots = st.number_input("lots", min_value=0.01, value=0.10, step=0.01,
                           label_visibility="collapsed", key="lots", format="%.2f")

    fcol1, fcol2 = st.columns(2)
    with fcol1:
        st.markdown("<div class='fieldlabel'>Stop Loss</div>", unsafe_allow_html=True)
        sl_raw = st.text_input("sl", placeholder="Optional", label_visibility="collapsed", key="sl")
    with fcol2:
        st.markdown("<div class='fieldlabel'>Take Profit</div>", unsafe_allow_html=True)
        tp_raw = st.text_input("tp", placeholder="Optional", label_visibility="collapsed", key="tp")

    def parse_price(text):
        try:
            return float(text.replace(",", "").strip())
        except (ValueError, AttributeError):
            return None

    sl = parse_price(sl_raw)
    tp = parse_price(tp_raw)

    mult = CONTRACT[asset["cat"]]
    value = lots * asset["price"] * mult
    margin = value * 0.10
    risk = abs(asset["price"] - sl) * lots * mult if sl else value * 0.0022

    st.markdown(f"""
    <div class="riskrow">
      <div class="risk"><span class="k">VALUE</span><span class="v">${value:,.2f}</span></div>
      <div class="risk"><span class="k">MARGIN</span><span class="v">${margin:,.2f}</span></div>
      <div class="risk"><span class="k">RISK</span><span class="v neg">${risk:,.2f}</span></div>
    </div>""", unsafe_allow_html=True)

    def open_position(side: str) -> None:
        sign = 1 if side == "BUY" else -1
        entry = book["ask"] if side == "BUY" else book["bid"]
        ss.positions.append({
            "symbol": sym, "dir": side, "sign": sign, "lots": float(lots),
            "entry": entry, "current": asset["price"], "sl": sl, "tp": tp,
            "margin": margin, "pnl": 0.0, "pnl_pct": 0.0,
            "time": dt.datetime.now().strftime("%H:%M:%S"),
        })
        ss.tab = "POSITIONS"
        st.rerun()

    bcol, scol = st.columns(2)
    with bcol:
        st.markdown("<span class='k-buy'></span>", unsafe_allow_html=True)
        if st.button("▲ BUY", key="buy", width='stretch'):
            open_position("BUY")
    with scol:
        st.markdown("<span class='k-sell'></span>", unsafe_allow_html=True)
        if st.button("▼ SELL", key="sell", width='stretch'):
            open_position("SELL")

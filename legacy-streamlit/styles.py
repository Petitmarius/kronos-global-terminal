"""Global CSS for the APEX terminal — dark, high-density, monospaced.

All visual identity lives here so app.py stays focused on layout and data.
"""
import streamlit as st

_CSS = """
<style>
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700;800&display=swap');

:root{
  --bg:#0B0E11; --panel:#12161A; --panel2:#0E1217; --row:#0F141A;
  --border:#1D2530; --border2:#252F3B;
  --green:#00E676; --green-d:#0c3a26; --teal:#26A69A;
  --red:#FF1744;  --red-d:#3a0f18;  --rose:#EF5350;
  --amber:#FF9100; --gold:#FFC24A; --gray:#607D8B;
  --text:#D6DEE6; --muted:#7C8A99; --dim:#4A5663;
}

/* ---- kill Streamlit chrome & padding ----------------------------------- */
#MainMenu, footer, header[data-testid="stHeader"]{display:none!important;}
[data-testid="stToolbar"], [data-testid="stDecoration"], [data-testid="stStatusWidget"]{display:none!important;}
.stApp, [data-testid="stAppViewContainer"]{background:var(--bg);}
.block-container, .stMainBlockContainer{
  padding:0.4rem 0.7rem 0.5rem 0.7rem !important; max-width:100% !important;
}
html, body, [class*="st-"], .stMarkdown, p, span, div, input, button, label{
  font-family:'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace !important;
  color:var(--text);
}
[data-testid="stVerticalBlock"]{gap:0.4rem;}
[data-testid="stHorizontalBlock"]{gap:0.55rem;}
[data-testid="stMarkdownContainer"]{margin:0;}
[data-testid="stElementContainer"]{margin:0!important;}
::-webkit-scrollbar{width:7px;height:7px;}
::-webkit-scrollbar-track{background:transparent;}
::-webkit-scrollbar-thumb{background:#1f2935;border-radius:6px;}
::-webkit-scrollbar-thumb:hover{background:#2c3a49;}

a{text-decoration:none;}
.pos{color:var(--green);}
.neg{color:var(--red);}
.mut{color:var(--muted);}
.amb{color:var(--amber);}

/* ---- generic panel ----------------------------------------------------- */
.panel{
  background:linear-gradient(180deg,var(--panel) 0%,var(--panel2) 100%);
  border:1px solid var(--border); border-radius:7px; padding:8px 9px; margin-bottom:7px;
}
.panel-title{
  font-size:10px; letter-spacing:1.6px; color:var(--amber); font-weight:700;
  text-transform:uppercase; margin-bottom:7px; display:flex; justify-content:space-between;
}

/* ---- header ------------------------------------------------------------ */
.apex-header{
  display:flex; align-items:center; justify-content:space-between;
  background:linear-gradient(90deg,#0d1318,#10161c); border:1px solid var(--border);
  border-radius:7px; padding:8px 14px; margin-bottom:6px;
}
.brand{display:flex; align-items:baseline; gap:10px;}
.brand .logo{font-weight:800; font-size:18px; letter-spacing:3px; color:#fff;}
.brand .logo b{color:var(--green);}
.brand .tag{font-size:9.5px; letter-spacing:2px; color:var(--gray);}
.metrics{display:flex; gap:26px; align-items:center;}
.metric{display:flex; flex-direction:column; line-height:1.15;}
.metric .k{font-size:9px; letter-spacing:1.4px; color:var(--gray); text-transform:uppercase;}
.metric .v{font-size:15px; font-weight:700; color:var(--text);}
.netbox{display:flex; align-items:center; gap:14px;}
.status{display:flex; align-items:center; gap:7px; font-size:11px; font-weight:700; letter-spacing:1px;}
.dot{width:8px; height:8px; border-radius:50%; background:var(--green);
  box-shadow:0 0 8px 2px rgba(0,230,118,.7); animation:pulse 2s infinite;}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}
.ping{font-size:11px; color:var(--gray);} .ping b{color:var(--green);}

/* ---- ticker tape ------------------------------------------------------- */
.ticker{overflow:hidden; white-space:nowrap; background:var(--panel2);
  border:1px solid var(--border); border-radius:7px; padding:5px 0; margin-bottom:7px;}
.ticker-track{display:inline-block; padding-left:100%; animation:scroll 38s linear infinite;}
.ticker:hover .ticker-track{animation-play-state:paused;}
@keyframes scroll{0%{transform:translateX(0)}100%{transform:translateX(-100%)}}
.tk{display:inline-block; padding:0 22px; font-size:12px; border-right:1px solid var(--border);}
.tk b{color:var(--text); font-weight:700; letter-spacing:.5px;}
.tk .px{color:var(--muted); margin-left:8px;}

/* ---- watchlist --------------------------------------------------------- */
.cats{display:flex; flex-wrap:wrap; gap:4px; margin:2px 0 8px 0;}
.cat{font-size:10px; padding:3px 8px; border-radius:4px; color:var(--gray);
  border:1px solid var(--border); letter-spacing:1px;}
.cat.on{color:var(--bg); background:var(--amber); border-color:var(--amber); font-weight:700;}
.wl-row{display:flex; align-items:center; justify-content:space-between; height:46px;
  box-sizing:border-box; overflow:hidden;
  padding:6px 7px; border-bottom:1px solid #131a21; border-left:2px solid transparent;}
.wl-row:hover{background:#141b23;}
.wl-row.on{background:#11201a; border-left-color:var(--green);}
.wl-l .sym{font-size:12.5px; font-weight:700; color:var(--text); letter-spacing:.4px;}
.wl-l .nm{font-size:9.5px; color:var(--dim);}
.wl-r{text-align:right;}
.wl-r .px{font-size:12.5px; font-weight:700; color:var(--text);}
.wl-r .ch{font-size:10px; font-weight:600;}

/* ---- center: instrument identity & headline price ---------------------- */
.idrow{display:flex; align-items:flex-start; justify-content:space-between; gap:14px;}
.idtitle .s{font-size:22px; font-weight:800; color:#fff; letter-spacing:1px;}
.idtitle .badge{font-size:9px; padding:2px 7px; border:1px solid var(--border2);
  border-radius:4px; color:var(--amber); margin-left:8px; letter-spacing:1px; vertical-align:middle;}
.idtitle .full{font-size:11px; color:var(--muted); margin-top:2px;}
.bigprice{text-align:right;}
.bigprice .p{font-size:40px; font-weight:800; letter-spacing:1px; line-height:1;}
.bigprice .c{font-size:14px; font-weight:700; margin-top:4px;}

/* ---- center: 8-cell market grid --------------------------------------- */
.grid8{display:grid; grid-template-columns:repeat(4,1fr); gap:1px;
  background:var(--border); border:1px solid var(--border); border-radius:6px; overflow:hidden; margin-top:9px;}
.cell{background:var(--panel2); padding:7px 9px;}
.cell .k{font-size:9px; letter-spacing:1.2px; color:var(--gray); text-transform:uppercase;}
.cell .v{font-size:14px; font-weight:700; color:var(--text); margin-top:2px;}

/* ---- chart toolbar (anchor-link buttons) ------------------------------- */
.toolbar{display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap;
  gap:8px; margin:10px 0 4px 0;}
.btgroup{display:flex; gap:3px; background:var(--panel2); border:1px solid var(--border);
  border-radius:6px; padding:3px;}
.tbtn{font-size:11px; padding:4px 11px; border-radius:4px; color:var(--muted); letter-spacing:.5px;}
.tbtn:hover{color:var(--text); background:#161d25;}
.tbtn.on{background:var(--green); color:var(--bg); font-weight:700;}
.tbtn.ind.on{background:var(--amber); color:var(--bg);}
.tlabel{font-size:9px; color:var(--dim); letter-spacing:1.5px; margin-right:5px; align-self:center;}

/* ---- bottom: positions tabs & table ------------------------------------ */
.ptabs{display:flex; gap:0; border-bottom:1px solid var(--border); margin-bottom:0;}
.ptab{font-size:10.5px; letter-spacing:1.4px; padding:7px 14px; color:var(--gray);
  border-bottom:2px solid transparent;}
.ptab.on{color:var(--text); border-bottom-color:var(--amber); font-weight:700;}
.ptab .badge{font-size:8px; background:var(--border2); color:var(--text);
  border-radius:8px; padding:0 5px; margin-left:5px;}
.ptable{width:100%; border-collapse:collapse; font-size:11px;}
.ptable th{font-size:9px; letter-spacing:1px; color:var(--gray); text-align:right;
  padding:6px 8px; border-bottom:1px solid var(--border); font-weight:600;}
.ptable th:first-child, .ptable td:first-child{text-align:left;}
.ptable td{padding:6px 8px; border-bottom:1px solid #121922; text-align:right; font-weight:600;}
.empty{padding:34px 10px; text-align:center; color:var(--dim); font-size:12px; letter-spacing:1px;}
.empty .big{font-size:13px; color:var(--muted); margin-bottom:6px;}
.tag-buy{color:var(--green); border:1px solid var(--green-d); background:rgba(0,230,118,.08);
  padding:1px 6px; border-radius:3px; font-size:10px;}
.tag-sell{color:var(--red); border:1px solid var(--red-d); background:rgba(255,23,68,.08);
  padding:1px 6px; border-radius:3px; font-size:10px;}

/* ---- order book -------------------------------------------------------- */
.dom-head{display:flex; justify-content:space-between; font-size:9px; color:var(--gray);
  letter-spacing:1px; padding:0 4px 4px 4px;}
.dom-row{position:relative; display:flex; justify-content:space-between; align-items:center;
  font-size:11.5px; padding:3px 7px; z-index:0; font-weight:600;}
.dom-row .bar{position:absolute; top:0; bottom:0; right:0; z-index:-1; opacity:.85;}
.dom-row.ask .bar{background:linear-gradient(90deg,rgba(255,23,68,0),rgba(255,23,68,.20));}
.dom-row.bid .bar{background:linear-gradient(90deg,rgba(0,230,118,0),rgba(0,230,118,.18));}
.dom-row.ask .p{color:var(--rose);} .dom-row.bid .p{color:var(--green);}
.dom-row .sz, .dom-row .tt{color:var(--muted); font-weight:500;}
.dom-row .tt{width:54px; text-align:right;}
.dom-row .sz{width:46px; text-align:right;}
.dom-spread{display:flex; justify-content:space-between; align-items:center; gap:6px;
  background:#15110a; border-top:1px solid #2a2113; border-bottom:1px solid #2a2113;
  padding:6px 8px; margin:3px 0; font-size:10.5px; color:var(--gold); font-weight:700; letter-spacing:.5px;}
.dom-spread .v{color:#fff;}

/* ---- order ticket / native widget restyle ------------------------------ */
.seg{display:flex; gap:3px; background:var(--panel2); border:1px solid var(--border);
  border-radius:6px; padding:3px; margin-bottom:8px;}
.seg a{flex:1; text-align:center; font-size:11px; padding:6px 0; border-radius:4px;
  color:var(--muted); letter-spacing:1px;}
.seg a.on{background:var(--border2); color:#fff; font-weight:700;}
.fieldlabel{font-size:9px; letter-spacing:1.4px; color:var(--gray); margin:6px 0 2px 1px; text-transform:uppercase;}
.riskrow{display:flex; justify-content:space-between; background:var(--panel2);
  border:1px solid var(--border); border-radius:6px; padding:8px 10px; margin:8px 0;}
.risk{display:flex; flex-direction:column; text-align:center; flex:1;}
.risk .k{font-size:8.5px; letter-spacing:1px; color:var(--gray);}
.risk .v{font-size:13px; font-weight:700; color:var(--text); margin-top:2px;}

[data-testid="stTextInput"] input, [data-testid="stNumberInput"] input{
  background:var(--panel2)!important; border:1px solid var(--border)!important;
  color:var(--text)!important; font-size:13px!important; border-radius:5px!important;
  padding:6px 9px!important; height:34px!important;}
[data-testid="stTextInput"] input:focus, [data-testid="stNumberInput"] input:focus{
  border-color:var(--amber)!important; box-shadow:none!important;}
[data-testid="stNumberInput"] button{background:var(--row)!important; border-color:var(--border)!important;}
[data-testid="stWidgetLabel"]{display:none;}
[data-testid="stNumberInputContainer"]{border:none!important;}

/* generic control buttons — timeframe / studies / tabs / categories / order type */
.stButton{margin:0!important;}
.stButton>button{
  background:var(--panel2); border:1px solid var(--border); color:var(--muted);
  font-size:10.5px; letter-spacing:.5px; font-weight:600; padding:4px 6px;
  border-radius:5px; min-height:0; height:30px; line-height:1.05; width:100%;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
  transition:border-color .12s ease,color .12s ease,background .12s ease;}
.stButton>button p{white-space:nowrap;}
/* category filter chips are narrow — shrink to fit CRYPTO / INDEX */
[class*="st-key-cat_"] button{font-size:9px; letter-spacing:0; padding:4px 2px;}
.stButton>button:hover{border-color:var(--border2); color:var(--text); background:#161d25;}
.stButton>button:focus, .stButton>button:active{box-shadow:none!important; color:var(--text);}
.stButton>button[kind="primary"]{
  background:var(--amber)!important; border-color:var(--amber)!important;
  color:#0B0E11!important; font-weight:800;}
.stButton>button[kind="primary"]:hover{box-shadow:0 0 10px rgba(255,145,0,.45);}

/* watchlist rows: a transparent full-width click target pulled up over the HTML row */
[class*="st-key-wl_"]{margin-top:-52px!important; margin-bottom:0!important;
  height:46px; position:relative; z-index:4;}
[class*="st-key-wl_"] button{height:46px!important; background:transparent!important;
  border:none!important; opacity:0; padding:0!important;}
[class*="st-key-wl_"] button, [class*="st-key-wl_"] button *{color:transparent!important;}
[class*="st-key-wl_"] button:hover{opacity:1; background:rgba(255,255,255,.035)!important;
  box-shadow:none!important;}

/* BUY / SELL action buttons (native st.button via column) */
div[data-testid="column"]:has(.k-buy) .stButton>button{
  background:linear-gradient(180deg,#00E676,#00b85f); color:#04130b; border:none;
  font-weight:800; font-size:16px; letter-spacing:1px; height:46px; border-radius:6px;}
div[data-testid="column"]:has(.k-sell) .stButton>button{
  background:linear-gradient(180deg,#FF1744,#d50f37); color:#fff; border:none;
  font-weight:800; font-size:16px; letter-spacing:1px; height:46px; border-radius:6px;}
div[data-testid="column"]:has(.k-buy) .stButton>button:hover{box-shadow:0 0 16px rgba(0,230,118,.5);}
div[data-testid="column"]:has(.k-sell) .stButton>button:hover{box-shadow:0 0 16px rgba(255,23,68,.5);}

/* search box */
[data-testid="stTextInput"] input::placeholder{color:var(--dim)!important; letter-spacing:1px;}
</style>
"""


def inject() -> None:
    st.markdown(_CSS, unsafe_allow_html=True)

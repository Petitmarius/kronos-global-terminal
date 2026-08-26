import { useEffect, useState } from 'react'

import { fetchMarketCap } from '../api'
import { STUDIES, TIMEFRAMES } from '../constants'
import { arrow, fmt, fmtCompact, fmtPct, fmtUsd, formatStamp, formatTime, signClass } from '../format'
import { computeAccount, positionPnl, useStore } from '../store'
import PriceChart from './PriceChart'
import styles from './CenterPanel.module.css'

const TABS = ['POSITIONS', 'PENDING', 'ORDER HISTORY', 'TRADE LOG', 'ALERTS'] as const

const fmtMcap = (v: number) =>
  v >= 1e12 ? `$${(v / 1e12).toFixed(2)}T` : v >= 1e9 ? `$${(v / 1e9).toFixed(1)}B` : `$${(v / 1e6).toFixed(0)}M`

export default function CenterPanel() {
  const asset = useStore((s) => s.assets[s.selected])
  const assets = useStore((s) => s.assets)
  const selected = useStore((s) => s.selected)
  const timeframe = useStore((s) => s.timeframe)
  const indicators = useStore((s) => s.indicators)
  const setTimeframe = useStore((s) => s.setTimeframe)
  const toggleIndicator = useStore((s) => s.toggleIndicator)
  const chartType = useStore((s) => s.chartType)
  const setChartType = useStore((s) => s.setChartType)
  const positions = useStore((s) => s.positions)
  const pending = useStore((s) => s.pending)
  const history = useStore((s) => s.history)
  const orders = useStore((s) => s.orders)
  const alerts = useStore((s) => s.alerts)
  const closePosition = useStore((s) => s.closePosition)
  const cancelPending = useStore((s) => s.cancelPending)
  const closeAll = useStore((s) => s.closeAll)
  const clearHistory = useStore((s) => s.clearHistory)
  const addAlert = useStore((s) => s.addAlert)
  const removeAlert = useStore((s) => s.removeAlert)
  const select = useStore((s) => s.selectAndWatch)
  const capital = useStore((s) => s.capital)

  const [tab, setTab] = useState<(typeof TABS)[number]>('POSITIONS')
  const [alertPrice, setAlertPrice] = useState('')
  const [mktCap, setMktCap] = useState<number | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [armCloseAll, setArmCloseAll] = useState(false)

  // never leave CLOSE ALL armed once you navigate away or the book empties
  useEffect(() => {
    if (tab !== 'POSITIONS' || positions.length === 0) setArmCloseAll(false)
  }, [tab, positions.length])

  useEffect(() => {
    if (!armCloseAll) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setArmCloseAll(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [armCloseAll])

  useEffect(() => {
    setMktCap(null)
    let alive = true
    void fetchMarketCap(selected).then((r) => { if (alive) setMktCap(r?.marketCap ?? null) })
    return () => { alive = false }
  }, [selected])

  useEffect(() => {
    if (!expanded) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setExpanded(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [expanded])

  if (!asset) {
    return (
      <section className="col">
        <div className={`panel ${styles.connecting}`}>Connecting to market feed…</div>
      </section>
    )
  }

  const dig = asset.digits
  const st = asset.stats
  const grid: [string, string][] = [
    ['OPEN', fmt(st.open, dig)],
    ['HIGH', fmt(st.high, dig)],
    ['LOW', fmt(st.low, dig)],
    ['PREV CLOSE', fmt(st.prevClose, dig)],
    ['VOLUME', st.volume ? fmtCompact(st.volume) : '—'],
    ['52W HI', fmt(st.w52High, dig)],
    ['52W LO', fmt(st.w52Low, dig)],
  ]

  // picking a symbol from a row also drops the maximized overlay, otherwise it
  // keeps covering the very chart you just asked for
  const pickSymbol = (symbol: string) => { select(symbol); setExpanded(false) }

  const activeAlerts = alerts.filter((a) => a.active).length
  const acct = computeAccount(positions, assets, history, capital)
  // latent P&L the CLOSE ALL confirmation would realize
  const latent = positions.reduce((t, p) => t + positionPnl(p, assets).pnl, 0)
  const submitAlert = () => {
    const p = parseFloat(alertPrice)
    if (Number.isNaN(p) || p <= 0) return
    if (asset.price == null) return   // no reference price to compare against
    addAlert(selected, p, p >= asset.price ? 'above' : 'below')
    setAlertPrice('')
  }

  return (
    <section className="col">
      {/* identity + headline price + market grid */}
      <div className={`panel ${styles.head}`}>
        <div className={styles.idrow}>
          <div>
            <div className={styles.idtitle}>
              <span className={styles.sym}>{asset.symbol}</span>
              <span className={styles.badge}>{asset.cat}</span>
              {asset.currency !== 'USD' && <span className={styles.curBadge}>{asset.currency}</span>}
              {asset.source === 'live' && asset.price != null
                ? <span className={styles.liveBadge}>● LIVE</span>
                : <span className={styles.noDataBadge}>NO DATA</span>}
            </div>
            <div className={styles.full}>{asset.name}</div>
          </div>
          <div className={styles.bigprice}>
            <div data-testid="headline-price" className={`${styles.p} ${signClass(asset.pct)}`}>{fmt(asset.price, dig)}</div>
            <div className={`${styles.c} ${signClass(asset.pct)}`}>
              {asset.price == null
                ? 'awaiting market data'
                : <>{arrow(asset.pct)} {fmt(asset.change == null ? null : Math.abs(asset.change), dig)} ({fmtPct(asset.pct)})</>}
            </div>
            {asset.price != null && asset.currency !== 'USD' && asset.usdRate !== 1 && (
              <div className={styles.usdConv}>≈ {fmtUsd(asset.price * asset.usdRate)}</div>
            )}
            {mktCap != null && <div className={styles.mcap}>MKT CAP <b>{fmtMcap(mktCap)}</b></div>}
          </div>
        </div>

        {/* columns follow the cell count, so removing a stat can never leave a
            bare strip of grid background where the 8th column used to be */}
        <div className={styles.grid} style={{ gridTemplateColumns: `repeat(${grid.length}, 1fr)` }}>
          {grid.map(([k, v]) => (
            <div className={styles.cell} key={k}>
              <span className={styles.cellK}>{k}</span>
              <span className={styles.cellV}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* toolbar + chart */}
      <div className={`panel ${styles.chartPanel}`}>
        <div className={styles.toolbar}>
          <div className={styles.tgroup}>
            <span className={styles.tlabel}>RANGE</span>
            <div className="seg">
              {TIMEFRAMES.map((t) => (
                <button key={t} className={timeframe === t ? 'on-green' : ''} onClick={() => setTimeframe(t)}>{t}</button>
              ))}
            </div>
          </div>
          <div className={styles.tgroup}>
            <span className={styles.tlabel}>STUDIES</span>
            <div className="seg">
              {STUDIES.map((s) => (
                <button key={s} className={indicators.has(s) ? 'on' : ''} onClick={() => toggleIndicator(s)}>{s}</button>
              ))}
            </div>
          </div>
          <div className={styles.tgroup}>
            <span className={styles.tlabel}>CHART</span>
            <div className="seg">
              {(['line', 'candles'] as const).map((t) => (
                <button key={t} className={chartType === t ? 'on' : ''} onClick={() => setChartType(t)}>
                  {t === 'line' ? 'LINE' : 'CANDLES'}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className={styles.chartArea}>
          <PriceChart />
        </div>
      </div>

      {/* activity panel — inline, or maximized overlay */}
      {expanded && <div className={styles.posBackdrop} onClick={() => setExpanded(false)} />}
      <div className={`panel ${expanded ? styles.posOverlay : styles.posPanel}`}>
        {expanded && (
          <div className={styles.posAcct}>
            <span>EQUITY <b>{fmtUsd(acct.equity)}</b></span>
            <span>P&amp;L TODAY <b className={signClass(acct.pnl)}>{fmtUsd(acct.pnl)}</b></span>
            <span>MARGIN <b>{fmtUsd(acct.margin)}</b></span>
            <span>FREE MARGIN <b>{fmtUsd(acct.free)}</b></span>
          </div>
        )}
        <div className={styles.tabs}>
          {TABS.map((t) => {
            const badge = t === 'POSITIONS' ? positions.length : t === 'PENDING' ? pending.length : t === 'TRADE LOG' ? history.length : t === 'ALERTS' ? activeAlerts : 0
            return (
              <button key={t} className={`${styles.tab} ${tab === t ? styles.tabOn : ''}`} onClick={() => setTab(t)}>
                {t}
                {badge > 0 && <span className={styles.count}>{badge}</span>}
              </button>
            )
          })}
          <span className={styles.tabSpacer} />
          {tab === 'POSITIONS' && positions.length > 0 && (armCloseAll ? (
            <div className={styles.confirmBar}>
              <span className={styles.confirmMsg}>
                Close {positions.length} position{positions.length > 1 ? 's' : ''} at market ·{' '}
                <b className={signClass(latent)}>{fmtUsd(latent)}</b>
              </span>
              <button className={styles.confirmYes} onClick={() => { closeAll(); setArmCloseAll(false) }}>CONFIRM</button>
              <button className={styles.confirmNo} onClick={() => setArmCloseAll(false)}>CANCEL</button>
            </div>
          ) : (
            <button className={styles.tabAction} onClick={() => setArmCloseAll(true)}>CLOSE ALL</button>
          ))}
          {(tab === 'TRADE LOG' || tab === 'ORDER HISTORY') && history.length + orders.length > 0 && (
            <button className={styles.tabAction} onClick={clearHistory}>CLEAR</button>
          )}
          <button className={styles.tabExpand} onClick={() => setExpanded((v) => !v)} title={expanded ? 'Minimize (Esc)' : 'Expand'}>{expanded ? '⤡' : '⤢'}</button>
        </div>

        <div className={`scroll ${styles.posBody}`}>
          {/* ----- POSITIONS ----- */}
          {tab === 'POSITIONS' && (positions.length === 0 ? (
            <div className={styles.empty}>
              <div className={styles.emptyBig}>NO OPEN POSITIONS</div>
              PLACE A DEMO TRADE TO GET STARTED
            </div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>{['SYMBOL', 'DIR', 'LOTS', 'ENTRY', 'CURRENT', 'P&L', 'P&L %', 'STOP LOSS', 'TAKE PROFIT', 'TIME', ''].map((h) => <th key={h}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {positions.map((p) => {
                  const a = assets[p.symbol]
                  const d = a ? a.digits : 2
                  const { pnl, pct, current } = positionPnl(p, assets)
                  const sc = signClass(pnl)
                  return (
                    <tr key={p.id} className={styles.clickRow} onClick={() => pickSymbol(p.symbol)}>
                      <td className={styles.tsym}>{p.symbol}</td>
                      <td><span className={p.sign > 0 ? styles.tagBuy : styles.tagSell}>{p.dir}</span></td>
                      <td>{p.lots.toFixed(2)}</td>
                      <td>{fmt(p.entry, d)}</td>
                      <td>{fmt(current, d)}</td>
                      {/* current == null means the position is UNMARKED, not flat.
                          A green $0.00 / +0.00% would read as "no move today". */}
                      <td className={current == null ? 'mut' : sc}>{current == null ? '—' : fmtUsd(pnl)}</td>
                      <td className={current == null ? 'mut' : sc}>{current == null ? '—' : fmtPct(pct)}</td>
                      <td>{p.sl ? fmt(p.sl, d) : '—'}</td>
                      <td>{p.tp ? fmt(p.tp, d) : '—'}</td>
                      <td className="mut">{formatTime(p.openedAt)}</td>
                      <td><button className={styles.close} title="Close" onClick={(e) => { e.stopPropagation(); closePosition(p.id) }}>✕</button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ))}

          {/* ----- PENDING ORDERS ----- */}
          {tab === 'PENDING' && (pending.length === 0 ? (
            <div className={styles.empty}>NO PENDING ORDERS<div style={{ marginTop: 6, fontSize: 11 }}>USE LIMIT OR STOP IN THE ORDER TICKET</div></div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>{['SYMBOL', 'DIR', 'TYPE', 'TRIGGER', 'CURRENT', 'DISTANCE', 'LOTS', 'STOP LOSS', 'TAKE PROFIT', 'PLACED', ''].map((h) => <th key={h}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {pending.map((o) => {
                  const d = assets[o.symbol]?.digits ?? 2
                  const cur = assets[o.symbol]?.price
                  // how far the market still has to travel before this order triggers
                  const dist = cur ? ((o.price - cur) / cur) * 100 : null
                  return (
                    <tr key={o.id} className={styles.clickRow} onClick={() => pickSymbol(o.symbol)}>
                      <td className={styles.tsym}>{o.symbol}</td>
                      <td><span className={o.sign > 0 ? styles.tagBuy : styles.tagSell}>{o.dir}</span></td>
                      <td className="amb">{o.type}</td>
                      <td>{fmt(o.price, d)}</td>
                      <td className="mut">{cur != null ? fmt(cur, d) : '—'}</td>
                      <td className={dist == null ? 'mut' : dist < 0 ? 'neg' : dist > 0 ? 'pos' : 'amb'}>
                        {dist == null ? '—' : `${dist < 0 ? '▼' : dist > 0 ? '▲' : ''} ${Math.abs(dist).toFixed(2)}%`}
                      </td>
                      <td>{o.lots.toFixed(2)}</td>
                      <td>{o.sl ? fmt(o.sl, d) : '—'}</td>
                      <td>{o.tp ? fmt(o.tp, d) : '—'}</td>
                      <td className="mut">{formatStamp(o.createdAt)}</td>
                      <td><button className={styles.close} title="Cancel" onClick={(e) => { e.stopPropagation(); cancelPending(o.id) }}>✕</button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ))}

          {/* ----- TRADE LOG ----- */}
          {tab === 'TRADE LOG' && (history.length === 0 ? (
            <div className={styles.empty}>TRADE LOG IS EMPTY</div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>{['SYMBOL', 'DIR', 'LOTS', 'ENTRY', 'EXIT', 'P&L', 'P&L %', 'CLOSE', 'OPENED', 'CLOSED'].map((h) => <th key={h}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {history.map((t) => {
                  const d = assets[t.symbol]?.digits ?? 2
                  const sc = signClass(t.pnl)
                  const rc = t.reason === 'SL' ? styles.rSL : t.reason === 'TP' ? styles.rTP : styles.rMan
                  return (
                    <tr key={t.id}>
                      <td className={styles.tsym}>{t.symbol}</td>
                      <td><span className={t.sign > 0 ? styles.tagBuy : styles.tagSell}>{t.dir}</span></td>
                      <td>{t.lots.toFixed(2)}</td>
                      <td>{fmt(t.entry, d)}</td>
                      <td>{fmt(t.exit, d)}</td>
                      <td className={sc}>{fmtUsd(t.pnl)}</td>
                      <td className={sc}>{fmtPct(t.pnlPct)}</td>
                      <td><span className={rc}>{t.reason === 'manual' ? 'MANUAL' : t.reason}</span></td>
                      <td className="mut">{formatStamp(t.openedAt)}</td>
                      <td className="mut">{formatStamp(t.closedAt)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ))}

          {/* ----- ORDER HISTORY ----- */}
          {tab === 'ORDER HISTORY' && (orders.length === 0 ? (
            <div className={styles.empty}>NO ORDERS YET</div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>{['TIME', 'SYMBOL', 'SIDE', 'ACTION', 'LOTS', 'PRICE'].map((h) => <th key={h}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td className={`${styles.tsym} mut`}>{formatStamp(o.time)}</td>
                    <td className={styles.tsym}>{o.symbol}</td>
                    <td><span className={o.side === 'BUY' ? styles.tagBuy : styles.tagSell}>{o.side}</span></td>
                    <td className={o.action === 'OPEN' ? 'pos' : 'mut'}>{o.action}</td>
                    <td>{o.lots.toFixed(2)}</td>
                    <td>{fmt(o.price, assets[o.symbol]?.digits ?? 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}

          {/* ----- ALERTS ----- */}
          {tab === 'ALERTS' && (
            <div className={styles.alerts}>
              <div className={styles.alertForm}>
                <span className={styles.afLabel}>{selected} alert when price crosses</span>
                <input
                  className={styles.afInput}
                  data-testid="alert-price"
                  placeholder={fmt(asset.price, dig)}
                  value={alertPrice}
                  onChange={(e) => setAlertPrice(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submitAlert()}
                />
                <button className={styles.afAdd} onClick={submitAlert}>+ ADD ALERT</button>
              </div>
              {alerts.length === 0 ? (
                <div className={styles.empty}>NO ACTIVE ALERTS</div>
              ) : (
                <table className={styles.table}>
                  <thead>
                    <tr>{['', 'SYMBOL', 'CONDITION', 'TARGET', 'STATUS', ''].map((h, i) => <th key={i}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {alerts.map((al) => (
                      <tr key={al.id}>
                        <td><span className={`${styles.aDot} ${al.active ? styles.aOn : styles.aOff}`} /></td>
                        <td className={styles.tsym}>{al.symbol}</td>
                        <td className="mut">{al.cond === 'above' ? '▲ above' : '▼ below'}</td>
                        <td>{fmt(al.price, assets[al.symbol]?.digits ?? 2)}</td>
                        <td className={al.active ? 'amb' : 'mut'}>{al.active ? 'ARMED' : 'TRIGGERED'}</td>
                        <td><button className={styles.close} title="Remove" onClick={() => removeAlert(al.id)}>✕</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

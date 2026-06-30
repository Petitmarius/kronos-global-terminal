import { useState } from 'react'

import { STUDIES, TIMEFRAMES } from '../constants'
import { arrow, fmt, fmtCompact, fmtPct, fmtUsd, formatStamp, formatTime, signClass } from '../format'
import { positionPnl, useStore } from '../store'
import PriceChart from './PriceChart'
import styles from './CenterPanel.module.css'

const TABS = ['POSITIONS', 'PENDING', 'ORDER HISTORY', 'TRADE LOG', 'ALERTS'] as const

export default function CenterPanel() {
  const asset = useStore((s) => s.assets[s.selected])
  const assets = useStore((s) => s.assets)
  const selected = useStore((s) => s.selected)
  const timeframe = useStore((s) => s.timeframe)
  const indicators = useStore((s) => s.indicators)
  const setTimeframe = useStore((s) => s.setTimeframe)
  const toggleIndicator = useStore((s) => s.toggleIndicator)
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

  const [tab, setTab] = useState<(typeof TABS)[number]>('POSITIONS')
  const [alertPrice, setAlertPrice] = useState('')

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
    ['SPREAD', String(st.spread)],
    ['52W HI', fmt(st.w52High, dig)],
    ['52W LO', fmt(st.w52Low, dig)],
  ]

  const activeAlerts = alerts.filter((a) => a.active).length
  const submitAlert = () => {
    const p = parseFloat(alertPrice)
    if (Number.isNaN(p) || p <= 0) return
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
              {asset.source === 'live' && <span className={styles.liveBadge}>● LIVE</span>}
            </div>
            <div className={styles.full}>{asset.name}</div>
          </div>
          <div className={styles.bigprice}>
            <div data-testid="headline-price" className={`${styles.p} ${signClass(asset.pct)}`}>{fmt(asset.price, dig)}</div>
            <div className={`${styles.c} ${signClass(asset.pct)}`}>
              {arrow(asset.pct)} {fmt(Math.abs(asset.change), dig)} ({fmtPct(asset.pct)})
            </div>
          </div>
        </div>

        <div className={styles.grid}>
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
        </div>
        <div className={styles.chartArea}>
          <PriceChart />
        </div>
      </div>

      {/* activity panel */}
      <div className={`panel ${styles.posPanel}`}>
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
          {tab === 'POSITIONS' && positions.length > 0 && (
            <button className={styles.tabAction} onClick={closeAll}>CLOSE ALL</button>
          )}
          {(tab === 'TRADE LOG' || tab === 'ORDER HISTORY') && history.length + orders.length > 0 && (
            <button className={styles.tabAction} onClick={clearHistory}>CLEAR</button>
          )}
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
                    <tr key={p.id}>
                      <td className={styles.tsym}>{p.symbol}</td>
                      <td><span className={p.sign > 0 ? styles.tagBuy : styles.tagSell}>{p.dir}</span></td>
                      <td>{p.lots.toFixed(2)}</td>
                      <td>{fmt(p.entry, d)}</td>
                      <td>{fmt(current, d)}</td>
                      <td className={sc}>{fmtUsd(pnl)}</td>
                      <td className={sc}>{fmtPct(pct)}</td>
                      <td>{p.sl ? fmt(p.sl, d) : '—'}</td>
                      <td>{p.tp ? fmt(p.tp, d) : '—'}</td>
                      <td className="mut">{formatTime(p.openedAt)}</td>
                      <td><button className={styles.close} title="Close" onClick={() => closePosition(p.id)}>✕</button></td>
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
                <tr>{['SYMBOL', 'DIR', 'TYPE', 'TRIGGER', 'CURRENT', 'LOTS', 'STOP LOSS', 'TAKE PROFIT', 'PLACED', ''].map((h) => <th key={h}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {pending.map((o) => {
                  const d = assets[o.symbol]?.digits ?? 2
                  const cur = assets[o.symbol]?.price
                  return (
                    <tr key={o.id}>
                      <td className={styles.tsym}>{o.symbol}</td>
                      <td><span className={o.sign > 0 ? styles.tagBuy : styles.tagSell}>{o.dir}</span></td>
                      <td className="amb">{o.type}</td>
                      <td>{fmt(o.price, d)}</td>
                      <td className="mut">{cur != null ? fmt(cur, d) : '—'}</td>
                      <td>{o.lots.toFixed(2)}</td>
                      <td>{o.sl ? fmt(o.sl, d) : '—'}</td>
                      <td>{o.tp ? fmt(o.tp, d) : '—'}</td>
                      <td className="mut">{formatStamp(o.createdAt)}</td>
                      <td><button className={styles.close} title="Cancel" onClick={() => cancelPending(o.id)}>✕</button></td>
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

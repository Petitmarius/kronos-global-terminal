import { useEffect } from 'react'

import { fmt, fmtCompact, fmtPct, fmtUsd } from '../../format'
import { resolveIso } from '../../geo/exposure'
import { positionPnl, useStore } from '../../store'
import styles from './GlobalMap.module.css'

const signed = (v: number) => `${v >= 0 ? '+' : '−'}$${fmtCompact(Math.abs(v))}`

/**
 * Everything the user holds (and has held) in one country. Opened by clicking a
 * country on the portfolio map or a row in PortfolioPanel; clicking any line in
 * here is what actually navigates to the Terminal.
 */
export default function CountryPositionsModal(
  { iso, name, indexMap, onPick, onClose }: {
    iso: string
    name: string
    indexMap: Record<string, string>
    onPick: (symbol: string) => void
    onClose: () => void
  },
) {
  const positions = useStore((s) => s.positions)
  const history = useStore((s) => s.history)
  const assets = useStore((s) => s.assets)
  const customs = useStore((s) => s.customs)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const rows = positions
    .filter((p) => resolveIso(p.symbol, customs, indexMap, assets) === iso)
    .map((p) => {
      const a = assets[p.symbol]
      const { pnl, pct, current } = positionPnl(p, assets)
      // same notional convention as geo/exposure.ts: USD, live price
      const rate = p.entryRate != null ? (a?.usdRate ?? 1) : 1
      const notional = (current ?? p.entry) * p.lots * (a?.contract ?? 1) * rate
      return { p, digits: a?.digits ?? 2, pnl, pct, current, notional }
    })
    .sort((x, y) => y.notional - x.notional)

  // closed trades in this country, aggregated per symbol
  const byClosed = new Map<string, { symbol: string; trades: number; realized: number }>()
  for (const t of history) {
    if (resolveIso(t.symbol, customs, indexMap, assets) !== iso) continue
    const e = byClosed.get(t.symbol) ?? { symbol: t.symbol, trades: 0, realized: 0 }
    e.trades += 1
    e.realized += t.pnl
    byClosed.set(t.symbol, e)
  }
  const closed = [...byClosed.values()].sort((a, b) => Math.abs(b.realized) - Math.abs(a.realized))

  const expo = rows.reduce((s, r) => s + r.notional, 0)
  const latent = rows.reduce((s, r) => s + r.pnl, 0)
  const realized = closed.reduce((s, c) => s + c.realized, 0)

  return (
    <div className={styles.pmBackdrop} onClick={onClose}>
      <div className={styles.pmModal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.pmHead}>
          <span className={styles.pmIso}>{iso}</span>
          <span className={styles.pmName}>{name}</span>
          <span className={styles.pmCount}>
            {rows.length} OPEN{closed.length > 0 ? ` · ${closed.length} CLOSED` : ''}
          </span>
          <button className={styles.cpClose} onClick={onClose}>✕</button>
        </div>

        <div className={styles.pmSummary}>
          <div className={styles.ppCell}><span className={styles.ppK}>EXPOSURE</span><b>{fmtUsd(expo)}</b></div>
          <div className={styles.ppCell}><span className={styles.ppK}>LATENT P&amp;L</span><b className={latent >= 0 ? styles.pos : styles.neg}>{signed(latent)}</b></div>
          <div className={styles.ppCell}><span className={styles.ppK}>REALIZED</span><b className={realized >= 0 ? styles.pos : styles.neg}>{signed(realized)}</b></div>
        </div>

        <div className={styles.pmBody}>
          {rows.length === 0 ? (
            <div className={styles.pmEmpty}>No open position in {name}.</div>
          ) : (
            <>
              <div className={styles.cpSection}>OPEN POSITIONS</div>
              <table className={styles.pmTable}>
                <thead>
                  <tr>{['SYMBOL', 'DIR', 'LOTS', 'ENTRY', 'CURRENT', 'EXPOSURE', 'P&L', 'P&L %'].map((h) => <th key={h}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {rows.map(({ p, digits, pnl, pct, current, notional }) => (
                    <tr key={p.id} className={styles.pmRow} onClick={() => onPick(p.symbol)} title={`Open ${p.symbol} in the Terminal`}>
                      <td className={styles.pmSym}>{p.symbol}</td>
                      <td><span className={p.sign > 0 ? styles.pmBuy : styles.pmSell}>{p.dir}</span></td>
                      <td>{p.lots.toFixed(2)}</td>
                      <td>{fmt(p.entry, digits)}</td>
                      <td>{fmt(current, digits)}</td>
                      <td>${fmtCompact(notional)}</td>
                      {/* unmarked (no live price) reads as "—", not as a flat 0 */}
                      <td className={current == null ? styles.mut : pnl >= 0 ? styles.pos : styles.neg}>{current == null ? '—' : signed(pnl)}</td>
                      <td className={current == null ? styles.mut : pnl >= 0 ? styles.pos : styles.neg}>{current == null ? '—' : fmtPct(pct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {closed.length > 0 && (
            <>
              <div className={styles.cpSection}>CLOSED · REALIZED P&amp;L</div>
              {closed.map((c) => (
                <div key={c.symbol} className={styles.pmClosed} onClick={() => onPick(c.symbol)} title={`Open ${c.symbol} in the Terminal`}>
                  <span className={styles.pmSym}>{c.symbol}</span>
                  <span className={styles.pmTrades}>{c.trades} trade{c.trades > 1 ? 's' : ''}</span>
                  <span className={c.realized >= 0 ? styles.pos : styles.neg}>{signed(c.realized)}</span>
                </div>
              ))}
            </>
          )}
        </div>

        <div className={styles.pmFoot}>Click a line to open that symbol in the Terminal · Esc to close</div>
      </div>
    </div>
  )
}

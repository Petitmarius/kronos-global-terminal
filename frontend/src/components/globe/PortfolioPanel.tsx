import { fmtCompact, fmtUsd } from '../../format'
import type { ExposureModel } from '../../types'
import styles from './GlobalMap.module.css'

const PAL = ['#42A5F5', '#26C6DA', '#7E57C2', '#5C6BC0', '#78909C']

function Signed({ v }: { v: number }) {
  return <span className={`${styles.sVal} ${v >= 0 ? styles.pos : styles.neg}`}>{v >= 0 ? '+' : '−'}${fmtCompact(Math.abs(v))}</span>
}
const usdSigned = (v: number) => `${v >= 0 ? '+' : ''}${fmtUsd(v)}`

export default function PortfolioPanel(
  { exposure, onPick, onClose }: { exposure: ExposureModel; onPick: (symbol: string) => void; onClose: () => void },
) {
  const rows = Object.values(exposure.perCountry).sort((a, b) => b.notional - a.notional)
  const { totals, nonGeo } = exposure
  const empty = rows.length === 0 && nonGeo.count === 0 && nonGeo.realized === 0
  const maxBar = Math.max(...rows.map((r) => r.notional), 1)

  const geoTotal = rows.reduce((s, c) => s + c.notional, 0) || 1
  const segs = rows.slice(0, 5).map((c, i) => ({ iso: c.iso, pct: (c.notional / geoTotal) * 100, color: PAL[i] }))
  const othersN = rows.slice(5).reduce((s, c) => s + c.notional, 0)
  if (othersN > 0) segs.push({ iso: 'Others', pct: (othersN / geoTotal) * 100, color: '#37424d' })

  return (
    <div className={styles.pp}>
      <div className={styles.ppHead}>
        <span className={styles.ppTitle}>PORTFOLIO</span>
        <button className={styles.cpClose} onClick={onClose}>✕</button>
      </div>
      {empty ? (
        <div className={styles.ppEmpty}>
          <div className={styles.ppEmptyBig}>No open positions</div>
          Open a trade in the Terminal to see your geographic exposure.
        </div>
      ) : (
        <div className={styles.ppBody}>
          <div className={styles.ppSummary}>
            <div className={styles.ppCell}><span className={styles.ppK}>EXPOSURE</span><b>{fmtUsd(totals.notional)}</b></div>
            <div className={styles.ppCell}><span className={styles.ppK}>POSITIONS</span><b>{totals.positions}</b></div>
            <div className={styles.ppCell}><span className={styles.ppK}>LATENT P&amp;L</span><b className={totals.latent >= 0 ? styles.pos : styles.neg}>{usdSigned(totals.latent)}</b></div>
            <div className={styles.ppCell}><span className={styles.ppK}>REALIZED</span><b className={totals.realized >= 0 ? styles.pos : styles.neg}>{usdSigned(totals.realized)}</b></div>
          </div>

          {rows.length > 0 && (
            <>
              <div className={styles.cpSection}>ALLOCATION · TOP {Math.min(5, rows.length)}</div>
              <div className={styles.ppStack}>
                {segs.map((s) => <span key={s.iso} className={styles.ppSeg} style={{ width: `${s.pct}%`, background: s.color }} title={`${s.iso} ${s.pct.toFixed(1)}%`} />)}
              </div>
              <div className={styles.ppStackLeg}>
                {segs.map((s) => (
                  <span key={s.iso} className={styles.ppStackItem}>
                    <span className={styles.ppDot} style={{ background: s.color }} />{s.iso} {s.pct.toFixed(0)}%
                  </span>
                ))}
              </div>
            </>
          )}

          <div className={styles.cpSection}>BY COUNTRY</div>
          {rows.length === 0 ? (
            <div className={styles.empty}>No geographic exposure.</div>
          ) : (
            <>
              <div className={styles.ppColHead}><span /><span /><span>EXP</span><span>LAT</span><span>REAL</span></div>
              {rows.map((c) => {
                const click = c.topSymbol ? () => onPick(c.topSymbol) : undefined
                return (
                  <div key={c.iso} className={`${styles.ppRow} ${click ? styles.ppRowClickable : ''}`} onClick={click}>
                    <span className={styles.ppIso}>{c.iso}</span>
                    <span className={styles.ppBar}><span className={styles.ppBarFill} style={{ width: `${Math.max(3, (c.notional / maxBar) * 100)}%` }} /></span>
                    <span className={styles.ppNum}>${fmtCompact(c.notional)}</span>
                    <Signed v={c.latent} />
                    <Signed v={c.realized} />
                  </div>
                )
              })}
            </>
          )}

          <div className={styles.ppCaption}>Bubble size = exposure · color = latent P&amp;L</div>
        </div>
      )}
    </div>
  )
}

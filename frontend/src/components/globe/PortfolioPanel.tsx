import { fmtCompact, fmtUsd } from '../../format'
import type { ExposureModel } from '../../types'
import styles from './GlobalMap.module.css'

const PAL = ['#42A5F5', '#26C6DA', '#7E57C2', '#5C6BC0', '#78909C']

function Signed({ v }: { v: number }) {
  return <span className={`${styles.sVal} ${v >= 0 ? styles.pos : styles.neg}`}>{v >= 0 ? '+' : '−'}${fmtCompact(Math.abs(v))}</span>
}
const usdSigned = (v: number) => `${v >= 0 ? '+' : ''}${fmtUsd(v)}`
const sign$ = (v: number) => `${v >= 0 ? '+' : '−'}$${fmtCompact(Math.abs(v))}`

export default function PortfolioPanel(
  { exposure, onPick, onClose }: { exposure: ExposureModel; onPick: (symbol: string) => void; onClose: () => void },
) {
  const all = Object.values(exposure.perCountry)
  const geoRows = all.filter((c) => c.notional > 0).sort((a, b) => b.notional - a.notional)
  const realRows = all.filter((c) => c.realized !== 0).sort((a, b) => Math.abs(b.realized) - Math.abs(a.realized))
  const { totals, nonGeo } = exposure
  const empty = geoRows.length === 0 && realRows.length === 0 && nonGeo.count === 0 && nonGeo.realized === 0
  const maxBar = Math.max(...geoRows.map((r) => r.notional), 1)

  // top-5 exposure allocation (countries with actual exposure only)
  const geoTotal = geoRows.reduce((s, c) => s + c.notional, 0) || 1
  const allocSegs = geoRows.slice(0, 5).map((c, i) => ({ iso: c.iso, pct: (c.notional / geoTotal) * 100, color: PAL[i] }))
  const allocOthers = geoRows.slice(5).reduce((s, c) => s + c.notional, 0)
  if (allocOthers > 0) allocSegs.push({ iso: 'Others', pct: (allocOthers / geoTotal) * 100, color: '#37424d' })

  // realized-P&L distribution by country (magnitude share, colored by sign)
  const realAbs = realRows.reduce((s, c) => s + Math.abs(c.realized), 0) || 1
  const realSegs = realRows.slice(0, 5).map((c) => ({ iso: c.iso, realized: c.realized, pct: (Math.abs(c.realized) / realAbs) * 100, color: c.realized >= 0 ? '#00E676' : '#FF1744' }))
  const realOthers = realRows.slice(5)
  if (realOthers.length) {
    const net = realOthers.reduce((s, c) => s + c.realized, 0)
    const oAbs = realOthers.reduce((s, c) => s + Math.abs(c.realized), 0)
    realSegs.push({ iso: 'Others', realized: net, pct: (oAbs / realAbs) * 100, color: '#607D8B' })
  }

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

          {geoRows.length > 0 && (
            <>
              <div className={styles.cpSection}>ALLOCATION · TOP {Math.min(5, geoRows.length)}</div>
              <div className={styles.ppStack}>
                {allocSegs.map((s) => <span key={s.iso} className={styles.ppSeg} style={{ width: `${s.pct}%`, background: s.color }} title={`${s.iso} ${s.pct.toFixed(1)}%`} />)}
              </div>
              <div className={styles.ppStackLeg}>
                {allocSegs.map((s) => (
                  <span key={s.iso} className={styles.ppStackItem}>
                    <span className={styles.ppDot} style={{ background: s.color }} />{s.iso} {s.pct.toFixed(0)}%
                  </span>
                ))}
              </div>
            </>
          )}

          {realRows.length > 0 && (
            <>
              <div className={styles.cpSection}>REALIZED P&amp;L · BY COUNTRY</div>
              <div className={styles.ppStack}>
                {realSegs.map((s) => <span key={s.iso} className={styles.ppSeg} style={{ width: `${s.pct}%`, background: s.color }} title={`${s.iso} ${sign$(s.realized)} · ${s.pct.toFixed(1)}%`} />)}
              </div>
              <div className={styles.ppStackLeg}>
                {realSegs.map((s) => (
                  <span key={s.iso} className={styles.ppStackItem}>
                    <span className={styles.ppDot} style={{ background: s.color }} />{s.iso} {sign$(s.realized)} · {s.pct.toFixed(0)}%
                  </span>
                ))}
              </div>
            </>
          )}

          <div className={styles.cpSection}>BY COUNTRY</div>
          {geoRows.length === 0 ? (
            <div className={styles.empty}>No current geographic exposure.</div>
          ) : (
            <>
              <div className={styles.ppColHead}><span /><span /><span>EXP</span><span>LAT</span><span>REAL</span></div>
              {geoRows.map((c) => {
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

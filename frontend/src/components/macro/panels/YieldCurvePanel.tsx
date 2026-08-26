import { useRef, useState, type MouseEvent } from 'react'

import { fmtIsoDate } from '../../../format'
import type { MacroCurve } from '../../../types'
import styles from '../MacroDashboard.module.css'

const AXIS = ['1M', '3M', '1Y', '2Y', '5Y', '10Y', '30Y']
const W = 300, H = 150, PADL = 8, PADR = 30, PADT = 12, PADB = 18

export default function YieldCurvePanel({ curve }: { curve: MacroCurve | null }) {
  const plotRef = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<number | null>(null)

  if (!curve) return <div className={styles.empty}>loading…</div>
  if (!curve.available || curve.points.length < 2) {
    // Treasury needs no key, so this is a real outage, not a missing config.
    return <div className={styles.empty}>NO CURVE DATA<br />treasury.gov unreachable — retrying</div>
  }
  const pts = curve.points
  const bp = curve.spread2s10s != null ? Math.round(curve.spread2s10s * 100) : null
  const xs = pts.map((p) => Math.log(p.months))
  const xmin = Math.min(...xs), xmax = Math.max(...xs)
  const ys = pts.map((p) => p.yield)
  const lo = Math.min(...ys), hi = Math.max(...ys)
  const buf = (hi - lo || 1) * 0.18
  const ymin = lo - buf, ymax = hi + buf
  const X = (m: number) => PADL + ((Math.log(m) - xmin) / (xmax - xmin || 1)) * (W - PADL - PADR)
  const Y = (v: number) => PADT + (1 - (v - ymin) / (ymax - ymin || 1)) * (H - PADT - PADB)

  const line = pts.map((p) => `${X(p.months).toFixed(1)},${Y(p.yield).toFixed(1)}`).join(' ')
  const area = `${X(pts[0].months).toFixed(1)},${H - PADB} ${line} ${X(pts[pts.length - 1].months).toFixed(1)},${H - PADB}`
  const yTicks = [hi, (hi + lo) / 2, lo]

  const onMove = (e: MouseEvent) => {
    const rect = plotRef.current?.getBoundingClientRect()
    if (!rect) return
    const fx = (e.clientX - rect.left) / rect.width
    let best = 0, bd = Infinity
    pts.forEach((p, i) => { const d = Math.abs(X(p.months) / W - fx); if (d < bd) { bd = d; best = i } })
    setHover(best)
  }
  const hp = hover != null ? pts[hover] : null

  return (
    <>
      <div className={styles.curveHead}>
        <span className={`${styles.badge} ${curve.inverted ? styles.badgeInv : styles.badgeOk}`}>
          {/* a gap between two yields is basis points, not a percentage */}
          2s10s {bp != null ? `${bp > 0 ? '+' : ''}${bp} bp` : '—'}
          {curve.inverted ? ' · INVERTED' : ''}
        </span>
        <span className={styles.curveAsOf}>{curve.source} · {fmtIsoDate(curve.asOf)}</span>
      </div>
      <div className={styles.curvePlot} ref={plotRef} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        <svg className={styles.curveSvg} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
          <polygon points={area} fill="rgba(66,165,245,.12)" />
          <polyline points={line} fill="none" stroke="#42A5F5" strokeWidth={2} vectorEffect="non-scaling-stroke" />
          {pts.map((p, i) => (
            <circle key={p.label} cx={X(p.months)} cy={Y(p.yield)} r={i === hover ? 3.4 : 2.2} fill={i === hover ? '#42A5F5' : '#0d1116'} stroke="#42A5F5" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
        {hp && <div className={styles.curveGuide} style={{ left: `${(X(hp.months) / W) * 100}%` }} />}
        {hp && (
          <div className={styles.chartTip} style={{ left: `${(X(hp.months) / W) * 100}%`, top: `${(Y(hp.yield) / H) * 100}%` }}>
            {hp.label} · {hp.yield.toFixed(2)}%
          </div>
        )}
        {yTicks.map((v, i) => (
          <span key={i} className={styles.curveYlbl} style={{ top: `${(Y(v) / H) * 100}%` }}>{v.toFixed(1)}%</span>
        ))}
        {AXIS.map((label) => {
          const p = pts.find((pp) => pp.label === label)
          if (!p) return null
          return <span key={label} className={styles.curveXlbl} style={{ left: `${(X(p.months) / W) * 100}%` }}>{label}</span>
        })}
      </div>
    </>
  )
}

import type { MacroCurve } from '../../../types'
import styles from '../MacroDashboard.module.css'

const AXIS = ['1M', '3M', '1Y', '2Y', '5Y', '10Y', '30Y']
const W = 300, H = 150, PADL = 8, PADR = 30, PADT = 12, PADB = 18

export default function YieldCurvePanel({ curve }: { curve: MacroCurve | null }) {
  if (!curve || !curve.available || curve.points.length < 2) {
    return <div className={styles.empty}>Add a free FRED key to backend/.env<br />(FRED_API_KEY=…) to load the yield curve.</div>
  }
  const pts = curve.points
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

  return (
    <>
      <div className={styles.curveHead}>
        <span className={`${styles.badge} ${curve.inverted ? styles.badgeInv : styles.badgeOk}`}>
          2s10s {curve.spread2s10s != null ? `${curve.spread2s10s > 0 ? '+' : ''}${curve.spread2s10s}%` : '—'}
          {curve.inverted ? ' · INVERTED' : ''}
        </span>
      </div>
      <div className={styles.curvePlot}>
        <svg className={styles.curveSvg} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
          <polygon points={area} fill="rgba(66,165,245,.12)" />
          <polyline points={line} fill="none" stroke="#42A5F5" strokeWidth={2} vectorEffect="non-scaling-stroke" />
          {pts.map((p) => (
            <circle key={p.label} cx={X(p.months)} cy={Y(p.yield)} r={2.2} fill="#0d1116" stroke="#42A5F5" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
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

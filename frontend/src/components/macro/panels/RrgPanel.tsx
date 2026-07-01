import { useState } from 'react'

import type { MacroRrg } from '../../../types'
import styles from '../MacroDashboard.module.css'

const ABBR: Record<string, string> = {
  Technology: 'Tech', Financials: 'Fin', Energy: 'Enr', 'Health Care': 'Hlth',
  Industrials: 'Ind', 'Cons. Disc.': 'Disc', 'Cons. Staples': 'Stpl',
  Utilities: 'Util', Materials: 'Mat', 'Real Estate': 'RE', 'Comm. Svcs': 'Comm',
}
const QCOLOR: Record<string, string> = {
  leading: '#00E676', weakening: '#FF9100', improving: '#42A5F5', lagging: '#FF1744',
}

export default function RrgPanel({ rrg }: { rrg: MacroRrg | null }) {
  const [hover, setHover] = useState<number | null>(null)
  if (!rrg) return <div className={styles.empty}>loading…</div>
  if (!rrg.available || rrg.sectors.length === 0) return <div className={styles.empty}>RRG data unavailable (Yahoo history).</div>

  const allX = rrg.sectors.flatMap((s) => s.trail.map((p) => p.x))
  const allY = rrg.sectors.flatMap((s) => s.trail.map((p) => p.y))
  const halfX = Math.max(1.2, ...allX.map((x) => Math.abs(x - 100))) * 1.25
  const halfY = Math.max(1.2, ...allY.map((y) => Math.abs(y - 100))) * 1.25
  const fx = (x: number) => Math.max(2, Math.min(98, ((x - 100) / (2 * halfX) + 0.5) * 100))
  const fy = (y: number) => Math.max(2, Math.min(98, (1 - ((y - 100) / (2 * halfY) + 0.5)) * 100))

  return (
    <div className={styles.rrgWrap}>
      {/* quadrant backgrounds */}
      <div className={`${styles.rrgQuad} ${styles.rrgLeading}`}>LEADING</div>
      <div className={`${styles.rrgQuad} ${styles.rrgWeakening}`}>WEAKENING</div>
      <div className={`${styles.rrgQuad} ${styles.rrgImproving}`}>IMPROVING</div>
      <div className={`${styles.rrgQuad} ${styles.rrgLagging}`}>LAGGING</div>
      <div className={styles.rrgAxisV} />
      <div className={styles.rrgAxisH} />

      <svg className={styles.rrgSvg} viewBox="0 0 100 100" preserveAspectRatio="none">
        {rrg.sectors.map((s, i) => (
          <polyline
            key={s.symbol}
            points={s.trail.map((p) => `${fx(p.x).toFixed(1)},${fy(p.y).toFixed(1)}`).join(' ')}
            fill="none"
            stroke={QCOLOR[s.quadrant] ?? '#607D8B'}
            strokeWidth={hover === i ? 1.4 : 0.7}
            strokeOpacity={hover == null || hover === i ? 0.55 : 0.15}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>

      {rrg.sectors.map((s, i) => {
        const head = s.trail[s.trail.length - 1]
        const c = QCOLOR[s.quadrant] ?? '#607D8B'
        const dim = hover != null && hover !== i
        return (
          <div
            key={s.symbol}
            className={styles.rrgDot}
            style={{ left: `${fx(head.x)}%`, top: `${fy(head.y)}%`, opacity: dim ? 0.35 : 1 }}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            <span className={styles.rrgMark} style={{ background: c, boxShadow: `0 0 8px ${c}` }} />
            <span className={styles.rrgLabel}>{ABBR[s.label] ?? s.label}</span>
          </div>
        )
      })}

      {hover != null && (() => {
        const s = rrg.sectors[hover]; const h = s.trail[s.trail.length - 1]
        return (
          <div className={styles.rrgTip} style={{ left: `${fx(h.x)}%`, top: `${fy(h.y)}%` }}>
            {s.label} · {s.quadrant} · RS {h.x.toFixed(1)} / Mom {h.y.toFixed(1)}
          </div>
        )
      })()}
    </div>
  )
}

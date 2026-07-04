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

  // scale from the *current* positions so dots spread across the plot (trails,
  // shown only on hover, may extend past the edges — that's fine, they're clamped)
  const heads = rrg.sectors.map((s) => s.trail[s.trail.length - 1])
  const halfX = Math.max(0.8, ...heads.map((h) => Math.abs(h.x - 100))) * 1.4
  const halfY = Math.max(0.8, ...heads.map((h) => Math.abs(h.y - 100))) * 1.4
  const fx = (x: number) => Math.max(3, Math.min(97, ((x - 100) / (2 * halfX) + 0.5) * 100))
  const fy = (y: number) => Math.max(4, Math.min(96, (1 - ((y - 100) / (2 * halfY) + 0.5)) * 100))
  const hs = hover != null ? rrg.sectors[hover] : null

  return (
    <div className={styles.rrgWrap}>
      <div className={`${styles.rrgQuad} ${styles.rrgLeading}`}>LEADING</div>
      <div className={`${styles.rrgQuad} ${styles.rrgWeakening}`}>WEAKENING</div>
      <div className={`${styles.rrgQuad} ${styles.rrgImproving}`}>IMPROVING</div>
      <div className={`${styles.rrgQuad} ${styles.rrgLagging}`}>LAGGING</div>
      <div className={styles.rrgAxisV} />
      <div className={styles.rrgAxisH} />

      {/* trail only for the hovered sector — keeps the plot clean at rest */}
      {hs && (
        <svg className={styles.rrgSvg} viewBox="0 0 100 100" preserveAspectRatio="none">
          <polyline
            points={hs.trail.map((p) => `${fx(p.x).toFixed(1)},${fy(p.y).toFixed(1)}`).join(' ')}
            fill="none" stroke={QCOLOR[hs.quadrant] ?? '#607D8B'} strokeWidth={1.6}
            strokeOpacity={0.8} strokeLinecap="round" strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      )}

      {rrg.sectors.map((s, i) => {
        const head = s.trail[s.trail.length - 1]
        const c = QCOLOR[s.quadrant] ?? '#607D8B'
        const active = hover === i
        const dim = hover != null && !active
        return (
          <div
            key={s.symbol}
            className={`${styles.rrgDot} ${active ? styles.rrgDotOn : ''}`}
            style={{ left: `${fx(head.x)}%`, top: `${fy(head.y)}%`, opacity: dim ? 0.4 : 1, zIndex: active ? 4 : 2 }}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            <span className={styles.rrgMark} style={{ background: c, boxShadow: `0 0 8px ${c}` }} />
            <span className={styles.rrgLabel}>{ABBR[s.label] ?? s.label}</span>
          </div>
        )
      })}

      {/* numeric scale, auto-ranged around the 100 benchmark (X = RS-Ratio, Y = RS-Momentum) */}
      <span className={styles.rrgTick} style={{ left: 3, top: '50%', transform: 'translateY(-50%)' }}>{(100 - halfX).toFixed(1)}</span>
      <span className={styles.rrgTick} style={{ right: 3, top: '50%', transform: 'translateY(-50%)' }}>RS {(100 + halfX).toFixed(1)}</span>
      <span className={styles.rrgTick} style={{ left: '50%', top: 3, transform: 'translateX(-50%)' }}>Mom {(100 + halfY).toFixed(1)}</span>
      <span className={styles.rrgTick} style={{ left: '50%', bottom: 3, transform: 'translateX(-50%)' }}>{(100 - halfY).toFixed(1)}</span>
      <span className={styles.rrgTick} style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}>100</span>

      {hs && (
        <div className={styles.rrgTip} style={{ left: `${fx(heads[hover as number].x)}%`, top: `${fy(heads[hover as number].y)}%` }}>
          {hs.label} · {hs.quadrant} · RS {heads[hover as number].x.toFixed(1)} / Mom {heads[hover as number].y.toFixed(1)}
        </div>
      )}
    </div>
  )
}

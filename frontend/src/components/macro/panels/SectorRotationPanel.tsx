import type { SectorPerf } from '../../../types'
import styles from '../MacroDashboard.module.css'

export default function SectorRotationPanel({ sectors }: { sectors: SectorPerf[] }) {
  const max = Math.max(0.5, ...sectors.map((s) => Math.abs(s.pct)))
  return (
    <div>
      {sectors.map((s) => (
        <div className={styles.barRow} key={s.symbol}>
          <span className={styles.barName}>{s.label}</span>
          <span className={styles.barTrack}>
            <span
              className={styles.barFill}
              style={{
                left: s.pct >= 0 ? '50%' : `${50 - (Math.abs(s.pct) / max) * 50}%`,
                width: `${(Math.abs(s.pct) / max) * 50}%`,
                background: s.pct >= 0 ? '#00E676' : '#FF1744',
              }}
            />
          </span>
          <span className={`${styles.barVal} ${s.pct >= 0 ? styles.pos : styles.neg}`}>
            {s.pct >= 0 ? '+' : ''}{s.pct.toFixed(2)}%
          </span>
        </div>
      ))}
    </div>
  )
}

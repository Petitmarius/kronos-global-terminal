import type { CrossAssetBucket } from '../../../types'
import styles from '../MacroDashboard.module.css'

function heat(pct: number): string {
  const a = Math.min(Math.abs(pct) / 3, 1) * 0.5 + 0.08
  return pct >= 0 ? `rgba(0,230,118,${a.toFixed(2)})` : `rgba(255,23,68,${a.toFixed(2)})`
}

export default function CrossAssetPanel({ buckets }: { buckets: CrossAssetBucket[] }) {
  return (
    <div>
      {buckets.map((b) => (
        <div className={styles.bucket} key={b.key}>
          <div className={styles.bucketLbl}>{b.label}</div>
          <div className={styles.heatRow}>
            {b.items.map((c) => (
              <div className={styles.heatCell} key={c.symbol} style={{ background: heat(c.pct) }}>
                <div className="sym">{c.label}</div>
                <div className={`pct ${c.pct >= 0 ? styles.pos : styles.neg}`}>
                  {c.pct >= 0 ? '+' : ''}{c.pct.toFixed(2)}%
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

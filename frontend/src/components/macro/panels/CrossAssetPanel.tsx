import { useStore } from '../../../store'
import type { CrossAssetBucket } from '../../../types'
import styles from '../MacroDashboard.module.css'

function heat(pct: number): string {
  const a = Math.min(Math.abs(pct) / 3, 1) * 0.5 + 0.08
  return pct >= 0 ? `rgba(0,230,118,${a.toFixed(2)})` : `rgba(255,23,68,${a.toFixed(2)})`
}

export default function CrossAssetPanel({ buckets }: { buckets: CrossAssetBucket[] }) {
  const assets = useStore((s) => s.assets)
  const select = useStore((s) => s.select)
  const setView = useStore((s) => s.setView)

  const go = (local: string | null) => {
    if (local && assets[local]) { select(local); setView('TERMINAL') }
  }

  return (
    <div className={styles.caGrid}>
      {buckets.map((b) => (
        <div className={styles.caCol} key={b.key}>
          <div className={styles.caColHead}>{b.label}</div>
          {b.items.map((c) => {
            const clickable = !!(c.local && assets[c.local])
            return (
              <button
                key={c.symbol}
                type="button"
                className={`${styles.caCell} ${clickable ? styles.caClickable : ''}`}
                style={{ background: heat(c.pct) }}
                onClick={() => go(c.local)}
                disabled={!clickable}
                title={clickable ? `Open ${c.local} in terminal` : c.label}
              >
                <span className={styles.caSym}>{c.label}</span>
                <span className={`${styles.caPct} ${c.pct >= 0 ? styles.pos : styles.neg}`}>
                  {c.pct >= 0 ? '+' : ''}{c.pct.toFixed(2)}%
                </span>
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}

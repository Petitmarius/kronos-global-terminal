import type { MacroReleases } from '../../../types'
import styles from '../MacroDashboard.module.css'

export default function ReleasesPanel({ releases }: { releases: MacroReleases | null }) {
  if (!releases || !releases.available) {
    return <div className={styles.empty}>Add a free FRED key to backend/.env (FRED_API_KEY=…) to load latest releases.</div>
  }
  return (
    <div>
      {releases.items.map((r) => (
        <div className={styles.relRow} key={r.series}>
          <span>
            <span className={styles.relLbl}>{r.label}</span>
            <span className={styles.relMeta}> · {r.period} · pub {r.updated}</span>
          </span>
          <span className={styles.relVal}>{r.value != null ? `${r.value.toFixed(1)}${r.unit}` : '—'}</span>
        </div>
      ))}
    </div>
  )
}

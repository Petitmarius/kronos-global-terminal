import type { GeoPoint } from '../../types'
import styles from './GlobalMap.module.css'

function timeAgo(ms: number): string {
  if (!ms) return ''
  const s = (Date.now() - ms) / 1000
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

export default function GeoPanel({ point, onClose }: { point: GeoPoint; onClose: () => void }) {
  return (
    <div className={`${styles.cp} ${styles.geoPanel}`}>
      <div className={styles.cpHead}>
        <span className={styles.cpTitle}>◉ {point.name}</span>
        <button className={styles.cpClose} onClick={onClose}>✕</button>
      </div>
      <div className={styles.cpBody}>
        <div className={styles.geoCount}>{point.count} mention{point.count > 1 ? 's' : ''} in current market news</div>
        <div className={styles.cpSection}>HEADLINES</div>
        {point.news.length === 0 ? <div className={styles.empty}>No headlines.</div> : point.news.map((n, i) => (
          <a key={i} className={styles.cpNews} href={n.url} target="_blank" rel="noopener noreferrer">
            <span className={styles.geoNewsMeta}>{n.source || '—'} · {timeAgo(n.datetime)}</span>
            {n.headline}
          </a>
        ))}
      </div>
    </div>
  )
}

import type { GlobeMarkets } from '../../types'
import styles from './GlobalMap.module.css'

const REGIONS = ['Americas', 'EMEA', 'Asia-Pacific']

function Pct({ v }: { v: number }) {
  return <span className={v >= 0 ? styles.pos : styles.neg}>{v >= 0 ? '+' : ''}{v.toFixed(2)}%</span>
}

export default function WorldSummary({ markets }: { markets: GlobeMarkets | null }) {
  if (!markets || markets.countries.length === 0) return null
  const sorted = [...markets.countries].sort((a, b) => b.pct - a.pct)
  const up = sorted.slice(0, 3)
  const down = sorted.slice(-3).reverse()
  const regions = REGIONS.map((r) => {
    const g = markets.countries.filter((c) => c.region === r)
    const avg = g.length ? g.reduce((s, c) => s + c.pct, 0) / g.length : 0
    return { r, avg }
  })

  return (
    <div className={styles.summary}>
      <div className={styles.sumGroup}>
        <span className={styles.sumLbl} style={{ color: '#00E676' }}>▲ LEADERS</span>
        {up.map((c) => <span key={c.iso} className={styles.sumItem}><b>{c.iso}</b> <Pct v={c.pct} /></span>)}
      </div>
      <div className={styles.sumRegions}>
        {regions.map((x) => <span key={x.r} className={styles.sumRegion}>{x.r} <Pct v={x.avg} /></span>)}
      </div>
      <div className={styles.sumGroup}>
        <span className={styles.sumLbl} style={{ color: '#FF1744' }}>▼ LAGGARDS</span>
        {down.map((c) => <span key={c.iso} className={styles.sumItem}><b>{c.iso}</b> <Pct v={c.pct} /></span>)}
      </div>
    </div>
  )
}

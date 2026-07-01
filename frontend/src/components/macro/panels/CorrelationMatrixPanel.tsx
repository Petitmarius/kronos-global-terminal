import { Fragment, useState } from 'react'

import type { MacroCorrelations } from '../../../types'
import styles from '../MacroDashboard.module.css'

const SHORT: Record<string, string> = {
  'S&P 500': 'SPX', Nasdaq: 'NDX', 'Russell 2K': 'RUT', Gold: 'GOLD', 'WTI Oil': 'OIL',
  Bitcoin: 'BTC', 'US Dollar': 'DXY', 'US 10Y': '10Y', 'Long Bonds': 'TLT',
}

function color(v: number): string {
  const a = Math.min(Math.abs(v), 1) * 0.62 + 0.04
  return v >= 0 ? `rgba(0,230,118,${a.toFixed(2)})` : `rgba(255,23,68,${a.toFixed(2)})`
}

export default function CorrelationMatrixPanel({ corr }: { corr: MacroCorrelations | null }) {
  const [hover, setHover] = useState<[number, number] | null>(null)
  if (!corr) return <div className={styles.empty}>loading…</div>
  if (!corr.available) return <div className={styles.empty}>Correlation data unavailable (Yahoo history).</div>

  const n = corr.labels.length
  const short = corr.labels.map((l) => SHORT[l] ?? l)
  return (
    <div className={styles.corrWrap}>
      <div className={styles.corrCaption}>
        {hover
          ? <>{corr.labels[hover[0]]} × {corr.labels[hover[1]]} · <b style={{ color: corr.matrix[hover[0]][hover[1]] >= 0 ? '#00E676' : '#FF1744' }}>{corr.matrix[hover[0]][hover[1]].toFixed(2)}</b></>
          : <span className={styles.corrHint}>90-day return correlation · hover a cell</span>}
      </div>
      <div className={styles.corrGrid} style={{ gridTemplateColumns: `minmax(30px,auto) repeat(${n}, 1fr)` }}>
        <div className={styles.corrCorner} />
        {short.map((s, j) => (
          <div key={j} className={`${styles.corrHead} ${hover && hover[1] === j ? styles.corrHeadOn : ''}`}>{s}</div>
        ))}
        {corr.matrix.map((row, i) => (
          <Fragment key={i}>
            <div className={`${styles.corrHead} ${styles.corrHeadRow} ${hover && hover[0] === i ? styles.corrHeadOn : ''}`}>{short[i]}</div>
            {row.map((v, j) => (
              <div
                key={j}
                className={styles.corrCell}
                style={{ background: i === j ? 'rgba(66,165,245,.22)' : color(v) }}
                onMouseEnter={() => setHover([i, j])}
                onMouseLeave={() => setHover(null)}
              >
                {v.toFixed(2)}
              </div>
            ))}
          </Fragment>
        ))}
      </div>
    </div>
  )
}

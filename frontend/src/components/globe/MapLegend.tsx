import { METRIC_META, type MapMetric } from '../../geo/scales'
import styles from './GlobalMap.module.css'

const METRICS: MapMetric[] = ['eq', 'gdp', 'inflation', 'unemployment']

export default function MapLegend({ metric, onMetric }: { metric: MapMetric; onMetric: (m: MapMetric) => void }) {
  const meta = METRIC_META[metric]
  return (
    <div className={styles.legend}>
      <div className={styles.metricSel}>
        {METRICS.map((m) => (
          <button key={m} className={`${styles.metricBtn} ${metric === m ? styles.metricOn : ''}`} onClick={() => onMetric(m)}>
            {METRIC_META[m].short}
          </button>
        ))}
      </div>
      <div className={styles.legendScale}>
        <span>{meta.lo}</span>
        <span className={styles.legendBar} style={{ background: meta.gradient }} />
        <span>{meta.hi}</span>
      </div>
    </div>
  )
}

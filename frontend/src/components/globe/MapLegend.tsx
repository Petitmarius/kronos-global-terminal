import { METRIC_META, type MapMetric } from '../../geo/scales'
import styles from './GlobalMap.module.css'

const METRICS: MapMetric[] = ['eq', 'gdp', 'inflation', 'unemployment']

export default function MapLegend(
  { metric, onMetric, showGeo, onToggleGeo, portfolio = false, onTogglePortfolio }:
  {
    metric: MapMetric; onMetric: (m: MapMetric) => void; showGeo: boolean; onToggleGeo: (v: boolean) => void
    portfolio?: boolean; onTogglePortfolio?: (v: boolean) => void
  },
) {
  const meta = METRIC_META[metric]
  return (
    <div className={styles.legend}>
      {portfolio ? (
        <div className={styles.pfLegend}>
          <span className={styles.pfLegLbl}>EXPOSURE</span>
          <span className={styles.legendBar} style={{ background: 'linear-gradient(90deg,#141b23,#42A5F5)' }} />
          <span className={styles.pfLegLbl}>P&amp;L</span>
          <span className={styles.pfSwatch} style={{ background: '#FF1744' }} />
          <span className={styles.pfSwatch} style={{ background: '#00E676' }} />
        </div>
      ) : (
        <>
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
        </>
      )}
      <button className={`${styles.legendToggle} ${portfolio ? styles.pfToggleOn : ''}`} onClick={() => onTogglePortfolio?.(!portfolio)}>
        ◧ Portfolio
      </button>
      <button className={`${styles.legendToggle} ${showGeo ? styles.legendToggleOn : ''}`} onClick={() => onToggleGeo(!showGeo)}>
        ◉ Geopolitical
      </button>
    </div>
  )
}

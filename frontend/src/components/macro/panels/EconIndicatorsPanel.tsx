import type { EconSeries, MacroEcon } from '../../../types'
import styles from '../MacroDashboard.module.css'

function Spark({ data }: { data: number[] }) {
  if (data.length < 2) return null
  const min = Math.min(...data), max = Math.max(...data), range = max - min || 1
  return (
    <div className={styles.spark}>
      {data.map((v, i) => (
        <div key={i} className={styles.sparkBar} style={{ height: `${((v - min) / range) * 100}%` }} />
      ))}
    </div>
  )
}

function Card({ s }: { s: EconSeries }) {
  const delta = s.value != null && s.prior != null ? s.value - s.prior : null
  return (
    <div className={styles.econCard}>
      <div className={styles.econLbl}>{s.label}</div>
      <div className={styles.econVal}>{s.value != null ? `${s.value.toFixed(1)}${s.unit}` : '—'}</div>
      {delta != null && (
        <div className={`${styles.tileSub} ${delta >= 0 ? styles.pos : styles.neg}`}>
          {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(2)} vs prior
        </div>
      )}
      <Spark data={s.spark} />
    </div>
  )
}

export default function EconIndicatorsPanel({ econ }: { econ: MacroEcon | null }) {
  if (!econ || !econ.available) {
    return <div className={styles.empty}>Add a free FRED key to backend/.env (FRED_API_KEY=…) to load CPI, GDP, unemployment and rates.</div>
  }
  return (
    <div className={styles.econGrid}>
      {econ.series.map((s) => <Card key={s.key} s={s} />)}
    </div>
  )
}

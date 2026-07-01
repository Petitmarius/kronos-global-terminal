import type { MacroBoard } from '../../../types'
import styles from '../MacroDashboard.module.css'

const REGIME_COLOR: Record<string, string> = {
  Calm: '#00E676', Normal: '#42A5F5', Elevated: '#FF9100', 'Risk-off': '#FF1744',
}

export default function VolatilityPanel({ vix }: { vix: MacroBoard['vix'] }) {
  const color = REGIME_COLOR[vix.regime] ?? '#607D8B'
  return (
    <div>
      <div className={styles.vixBig} style={{ color }}>{vix.level ?? '—'}</div>
      <div className={vix.pct != null && vix.pct >= 0 ? styles.neg : styles.pos}>
        VIX {vix.pct != null ? `${vix.pct >= 0 ? '+' : ''}${vix.pct.toFixed(2)}%` : ''}
      </div>
      <div className={styles.vixRegime} style={{ color }}>{vix.regime}</div>
    </div>
  )
}

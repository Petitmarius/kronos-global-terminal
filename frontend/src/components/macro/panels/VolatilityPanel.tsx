import type { MacroBoard } from '../../../types'
import styles from '../MacroDashboard.module.css'

const REGIME_COLOR: Record<string, string> = {
  Calm: '#00E676', Normal: '#42A5F5', Elevated: '#FF9100', 'Risk-off': '#FF1744',
}

// map a VIX level onto the 10→40 gauge track (clamped)
const gaugePos = (v: number) => Math.max(0, Math.min(1, (v - 10) / 30)) * 100

export default function VolatilityPanel({ vix }: { vix: MacroBoard['vix'] }) {
  const color = REGIME_COLOR[vix.regime] ?? '#607D8B'
  return (
    <div>
      <div className={styles.vixBig} style={{ color }}>{vix.level ?? '—'}</div>
      <div className={vix.pct != null && vix.pct >= 0 ? styles.neg : styles.pos}>
        VIX {vix.pct != null ? `${vix.pct >= 0 ? '+' : ''}${vix.pct.toFixed(2)}%` : ''}
      </div>
      <div className={styles.vixRegime} style={{ color }}>{vix.regime}</div>

      {vix.level != null && (
        <div className={styles.gauge}>
          <div className={styles.gaugeTrack} />
          <div className={styles.gaugeMarker} style={{ left: `${gaugePos(vix.level)}%` }} />
          <div className={styles.gaugeScale}>
            <span>10</span><span>20</span><span>30</span><span>40</span>
          </div>
          <div className={styles.gaugeZones}>
            <span>CALM</span><span>NORMAL</span><span>ELEVATED</span><span>RISK-OFF</span>
          </div>
        </div>
      )}
    </div>
  )
}

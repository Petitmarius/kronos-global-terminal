import type { MacroRisk } from '../../../types'
import styles from '../MacroDashboard.module.css'

const zoneColor = (v: number) => (v >= 60 ? '#00E676' : v >= 40 ? '#FF9100' : '#FF1744')

export default function RiskBarometer({ risk }: { risk: MacroRisk | null }) {
  if (!risk) return <div className={styles.empty}>loading…</div>
  const color = zoneColor(risk.score)
  return (
    <div className={styles.riskWrap}>
      <div className={styles.riskScoreBlock}>
        <div className={styles.riskScore} style={{ color, textShadow: `0 0 22px ${color}66` }}>{risk.score}</div>
        <div className={styles.riskLabel} style={{ color }}>{risk.label}</div>
        <div className={styles.riskCaption}>RISK APPETITE · 0–100</div>
      </div>

      <div className={styles.riskMeter}>
        <div className={styles.riskTrack}>
          <div className={styles.riskMarker} style={{ left: `${risk.score}%` }}>
            <div className={styles.riskMarkerDot} style={{ borderColor: color, boxShadow: `0 0 10px ${color}` }} />
          </div>
        </div>
        <div className={styles.riskScale}><span>RISK-OFF</span><span>NEUTRAL</span><span>RISK-ON</span></div>
      </div>

      <div className={styles.riskDrivers}>
        {risk.drivers.map((d) => (
          <div className={styles.riskDriver} key={d.name}>
            <div className={styles.riskDriverTop}>
              <span className={styles.riskDriverName}>{d.name}</span>
              <span className={styles.riskDriverVal} style={{ color: zoneColor(d.value) }}>{d.value}</span>
            </div>
            <div className={styles.riskDriverBar}>
              <div className={styles.riskDriverFill} style={{ width: `${d.value}%`, background: zoneColor(d.value) }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

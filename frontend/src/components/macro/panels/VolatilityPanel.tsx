import { useEffect, useRef, useState, type MouseEvent } from 'react'

import { fetchMacroCandles } from '../../../api'
import type { MacroBoard } from '../../../types'
import styles from '../MacroDashboard.module.css'

const REGIME_COLOR: Record<string, string> = {
  Calm: '#00E676', Normal: '#42A5F5', Elevated: '#FF9100', 'Risk-off': '#FF1744',
}

// map a VIX level onto the 10→40 gauge track (clamped)
const gaugePos = (v: number) => Math.max(0, Math.min(1, (v - 10) / 30)) * 100

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<number | null>(null)
  if (data.length < 2) return null
  const w = 100, h = 24
  const min = Math.min(...data), max = Math.max(...data), range = max - min || 1
  const X = (i: number) => (i / (data.length - 1)) * w
  const Y = (v: number) => h - ((v - min) / range) * h
  const pts = data.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ')
  const onMove = (e: MouseEvent) => {
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    const fx = (e.clientX - r.left) / r.width
    setHover(Math.max(0, Math.min(data.length - 1, Math.round(fx * (data.length - 1)))))
  }
  const hv = hover != null ? data[hover] : null
  return (
    <div ref={ref} className={styles.vixSparkBox} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <svg className={styles.vixSpark} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
        <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        {hover != null && <line x1={X(hover)} x2={X(hover)} y1={0} y2={h} stroke="rgba(120,144,163,.5)" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
      </svg>
      {hover != null && hv != null && (
        <>
          <span className={styles.vixSparkDot} style={{ left: `${(X(hover) / w) * 100}%`, top: `${(Y(hv) / h) * 100}%`, background: color }} />
          <span className={styles.vixSparkTip} style={{ left: `${(X(hover) / w) * 100}%` }}>{hv.toFixed(2)}</span>
        </>
      )}
    </div>
  )
}

export default function VolatilityPanel({ vix }: { vix: MacroBoard['vix'] }) {
  const color = REGIME_COLOR[vix.regime] ?? '#607D8B'
  const [spark, setSpark] = useState<number[]>([])

  useEffect(() => {
    let alive = true
    void fetchMacroCandles('^VIX', '1M').then((d) => { if (alive && d) setSpark(d.points.map((p) => p.value)) })
    return () => { alive = false }
  }, [])

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
        </div>
      )}

      <div className={styles.vixSparkWrap}>
        <span className={styles.vixSparkLbl}>30D</span>
        <Sparkline data={spark} color={color} />
      </div>
    </div>
  )
}

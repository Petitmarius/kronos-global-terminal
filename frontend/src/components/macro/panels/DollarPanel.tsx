import { useEffect, useRef } from 'react'
import { ColorType, createChart } from 'lightweight-charts'

import { fetchCandles } from '../../../api'
import type { MacroBoard } from '../../../types'
import styles from '../MacroDashboard.module.css'

export default function DollarPanel({ dxy }: { dxy: MacroBoard['dxy'] }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let dead = false
    void (async () => {
      // DX-Y.NYB is not a registered tradable symbol, and the candles endpoint
      // needs one — so the sparkline uses USDJPY purely as a dollar-strength
      // shape proxy. The headline number/percent below are the real DXY.
      const data = await fetchCandles('USDJPY', '1M').catch(() => null)
      if (dead || !ref.current || !data || data.points.length < 2) return
      const chart = createChart(ref.current, {
        layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#4A5663', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, attributionLogo: false },
        grid: { vertLines: { visible: false }, horzLines: { visible: false } },
        rightPriceScale: { borderVisible: false }, timeScale: { visible: false },
        autoSize: true, handleScroll: false, handleScale: false,
      })
      const up = (dxy.pct ?? 0) >= 0
      const area = chart.addAreaSeries({ lineColor: up ? '#00E676' : '#FF1744', topColor: up ? 'rgba(0,230,118,.25)' : 'rgba(255,23,68,.25)', bottomColor: 'transparent', lineWidth: 2, priceLineVisible: false, lastValueVisible: false })
      area.setData(data.points.map((p) => ({ time: p.time as never, value: p.value })))
      chart.timeScale().fitContent()
    })()
    return () => { dead = true }
  }, [dxy.pct])

  return (
    <div>
      <div className={styles.tileV} style={{ fontSize: 26 }}>{dxy.level ?? '—'}</div>
      <div className={`${styles.tileSub} ${dxy.pct != null && dxy.pct >= 0 ? styles.pos : styles.neg}`}>
        DXY {dxy.pct != null ? `${dxy.pct >= 0 ? '+' : ''}${dxy.pct.toFixed(2)}%` : ''}
      </div>
      <div ref={ref} style={{ position: 'absolute', left: 12, right: 12, bottom: 12, height: 90 }} />
    </div>
  )
}

import { useEffect, useRef } from 'react'
import { ColorType, createChart, type IChartApi } from 'lightweight-charts'

import { fetchMacroCandles } from '../../../api'
import type { MacroBoard } from '../../../types'
import styles from '../MacroDashboard.module.css'

export default function DollarPanel({ dxy }: { dxy: MacroBoard['dxy'] }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let chart: IChartApi | null = null
    let dead = false
    void (async () => {
      // Real Dollar index history (DX-Y.NYB) — no proxy, so the sparkline shape
      // and scale match the headline DXY level.
      const data = await fetchMacroCandles('DX-Y.NYB', '1M').catch(() => null)
      if (dead || !ref.current || !data || data.points.length < 2) return
      chart = createChart(ref.current, {
        layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#4A5663', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, attributionLogo: false },
        grid: { vertLines: { visible: false }, horzLines: { visible: false } },
        rightPriceScale: { visible: false },
        leftPriceScale: { visible: false },
        timeScale: { visible: false },
        crosshair: { horzLine: { visible: false }, vertLine: { visible: false } },
        autoSize: true, handleScroll: false, handleScale: false,
      })
      const up = (dxy.pct ?? 0) >= 0
      const area = chart.addAreaSeries({ lineColor: up ? '#00E676' : '#FF1744', topColor: up ? 'rgba(0,230,118,.25)' : 'rgba(255,23,68,.25)', bottomColor: 'transparent', lineWidth: 2, priceLineVisible: false, lastValueVisible: false })
      area.setData(data.points.map((p) => ({ time: p.time as never, value: p.value })))
      chart.timeScale().fitContent()
    })()
    return () => { dead = true; chart?.remove() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className={styles.dxyWrap}>
      <div className={styles.tileV} style={{ fontSize: 26 }}>{dxy.level ?? '—'}</div>
      <div className={`${styles.tileSub} ${dxy.pct != null && dxy.pct >= 0 ? styles.pos : styles.neg}`}>
        DXY {dxy.pct != null ? `${dxy.pct >= 0 ? '+' : ''}${dxy.pct.toFixed(2)}%` : ''}
      </div>
      <div ref={ref} className={styles.dxyChart} />
    </div>
  )
}

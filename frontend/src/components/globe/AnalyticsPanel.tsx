import { useEffect, useRef, useState } from 'react'
import { ColorType, createChart, LineStyle, type IChartApi, type ISeriesApi } from 'lightweight-charts'

import { fmtUsd } from '../../format'
import { realizedCurve } from '../../geo/exposure'
import type { ClosedTrade, ExposureModel } from '../../types'
import NonGeoDonut from './NonGeoDonut'
import styles from './GlobalMap.module.css'

function RealizedChart({ history }: { history: ClosedTrade[] }) {
  const ref = useRef<HTMLDivElement>(null)
  const [tip, setTip] = useState<{ x: number; y: number; v: number; t: number } | null>(null)
  const curve = realizedCurve(history)

  useEffect(() => {
    setTip(null)
    if (curve.length < 2 || !ref.current) return
    const up = curve[curve.length - 1].value >= 0
    const chart: IChartApi = createChart(ref.current, {
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#4A5663', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, attributionLogo: false },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      rightPriceScale: { visible: false }, timeScale: { visible: true, borderVisible: false, timeVisible: false, secondsVisible: false },
      crosshair: {
        horzLine: { visible: false, labelVisible: false },
        vertLine: { visible: true, color: 'rgba(120,144,163,.5)', width: 1, style: LineStyle.Dotted, labelVisible: false },
      },
      autoSize: true, handleScroll: false, handleScale: false,
    })
    const area: ISeriesApi<'Area'> = chart.addAreaSeries({ lineColor: up ? '#00E676' : '#FF1744', topColor: up ? 'rgba(0,230,118,.25)' : 'rgba(255,23,68,.25)', bottomColor: 'transparent', lineWidth: 2, priceLineVisible: false, lastValueVisible: false })
    area.setData(curve.map((p) => ({ time: p.time as never, value: p.value })))
    chart.timeScale().fitContent()
    chart.subscribeCrosshairMove((param) => {
      const pt = param.point
      const pd = param.seriesData.get(area) as { value?: number } | undefined
      if (!pt || !pd || pd.value == null || param.time == null) { setTip(null); return }
      setTip({ x: pt.x as number, y: pt.y as number, v: pd.value, t: param.time as number })
    })
    return () => { chart.remove() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history])

  if (curve.length < 2) return <div className={styles.rpEmpty}>No realized P&amp;L in the last 30 days.</div>

  return (
    <div className={styles.rpChart}>
      <div ref={ref} className={styles.rpChartInner} />
      {tip && (
        <div className={styles.chartTip} style={{ left: tip.x, top: tip.y }}>
          {new Date(tip.t * 1000).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} · {tip.v >= 0 ? '+' : '−'}{fmtUsd(Math.abs(tip.v))}
        </div>
      )}
    </div>
  )
}

export default function AnalyticsPanel(
  { exposure, history, onPick }: { exposure: ExposureModel; history: ClosedTrade[]; onPick: (symbol: string) => void },
) {
  return (
    <div className={styles.rp}>
      <div className={styles.ppHead}><span className={styles.ppTitle}>PERFORMANCE</span></div>
      <div className={styles.ppBody}>
        <div className={styles.cpSection}>REALIZED P&amp;L · 30D</div>
        <RealizedChart history={history} />

        <div className={styles.cpSection}>NON-GEOGRAPHIC RISK</div>
        <NonGeoDonut byCat={exposure.nonGeo.byCat} onPick={onPick} />
      </div>
    </div>
  )
}

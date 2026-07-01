import { useEffect, useRef } from 'react'
import { ColorType, createChart, type IChartApi } from 'lightweight-charts'

import type { MacroCurve } from '../../../types'
import styles from '../MacroDashboard.module.css'

export default function YieldCurvePanel({ curve }: { curve: MacroCurve | null }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!curve || !curve.available || !ref.current || curve.points.length < 2) return
    let chart: IChartApi | null = createChart(ref.current, {
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#6b7a89', fontFamily: "'JetBrains Mono', monospace", fontSize: 9, attributionLogo: false },
      grid: { vertLines: { visible: false }, horzLines: { color: 'rgba(96,125,139,.10)' } },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.15, bottom: 0.12 } },
      timeScale: { visible: false, rightOffset: 0, fixLeftEdge: true, fixRightEdge: true },
      crosshair: { horzLine: { visible: false }, vertLine: { visible: false } },
      autoSize: true, handleScroll: false, handleScale: false,
    })
    const line = chart.addLineSeries({
      color: '#42A5F5', lineWidth: 2, priceLineVisible: false, lastValueVisible: false,
      crosshairMarkerVisible: false,
      priceFormat: { type: 'custom', minMove: 0.01, formatter: (v: number) => `${v.toFixed(1)}%` },
    })
    // x = maturity mapped onto a synthetic evenly-spaced ordinal axis
    line.setData(curve.points.map((p, i) => ({ time: (i + 1) as never, value: p.yield })))
    chart.timeScale().fitContent()
    return () => { chart?.remove(); chart = null }
  }, [curve])

  if (!curve || !curve.available) {
    return <div className={styles.empty}>Add a free FRED key to backend/.env<br />(FRED_API_KEY=…) to load the yield curve.</div>
  }
  return (
    <>
      <div className={styles.curveHead}>
        <span className={`${styles.badge} ${curve.inverted ? styles.badgeInv : styles.badgeOk}`}>
          2s10s {curve.spread2s10s != null ? `${curve.spread2s10s > 0 ? '+' : ''}${curve.spread2s10s}%` : '—'}
          {curve.inverted ? ' · INVERTED' : ''}
        </span>
      </div>
      <div ref={ref} className={styles.curveWrap} />
      <div className={styles.matAxis}>
        {curve.points.map((p) => <span key={p.label}>{p.label}</span>)}
      </div>
    </>
  )
}

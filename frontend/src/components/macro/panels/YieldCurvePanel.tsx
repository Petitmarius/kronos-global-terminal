import { useEffect, useRef } from 'react'
import { ColorType, createChart } from 'lightweight-charts'

import type { MacroCurve } from '../../../types'
import styles from '../MacroDashboard.module.css'

export default function YieldCurvePanel({ curve }: { curve: MacroCurve | null }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!curve || !curve.available || !ref.current || curve.points.length < 2) return
    const chart = createChart(ref.current, {
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#4A5663', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, attributionLogo: false },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      rightPriceScale: { borderVisible: false },
      timeScale: { visible: false },
      autoSize: true,
      handleScroll: false, handleScale: false,
    })
    const line = chart.addLineSeries({ color: '#42A5F5', lineWidth: 2, priceLineVisible: false, lastValueVisible: false })
    // x = maturity mapped onto a synthetic ordinal time axis
    line.setData(curve.points.map((p, i) => ({ time: (i + 1) as never, value: p.yield })))
    for (const p of curve.points) {
      if (['3M', '2Y', '10Y', '30Y'].includes(p.label)) {
        line.createPriceLine({ price: p.yield, color: 'rgba(96,125,139,.3)', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: p.label })
      }
    }
    chart.timeScale().fitContent()
    return () => chart.remove()
  }, [curve])

  if (!curve || !curve.available) {
    return <div className={styles.empty}>Add a free FRED key to backend/.env<br />(FRED_API_KEY=…) to load the yield curve.</div>
  }
  return (
    <>
      <div style={{ marginBottom: 6 }}>
        <span className={`${styles.badge} ${curve.inverted ? styles.badgeInv : styles.badgeOk}`}>
          2s10s {curve.spread2s10s != null ? `${curve.spread2s10s > 0 ? '+' : ''}${curve.spread2s10s}%` : '—'}
          {curve.inverted ? ' · INVERTED' : ''}
        </span>
      </div>
      <div ref={ref} className={styles.curveWrap} style={{ top: 34 }} />
    </>
  )
}

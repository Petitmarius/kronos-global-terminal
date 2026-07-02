import { useEffect, useRef, useState } from 'react'
import {
  ColorType,
  CrosshairMode,
  LineStyle,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts'

import { fetchCandles } from '../api'
import { COLORS } from '../constants'
import { bollinger, macd, rsi, sma, volume } from '../indicators'
import { useStore } from '../store'
import styles from './PriceChart.module.css'

const T = (t: number) => t as UTCTimestamp

function neon(up: boolean) {
  return {
    lineColor: up ? COLORS.green : COLORS.red,
    topColor: up ? 'rgba(0,230,118,0.30)' : 'rgba(255,23,68,0.30)',
    bottomColor: up ? 'rgba(0,230,118,0.0)' : 'rgba(255,23,68,0.0)',
  }
}

const baseLayout = {
  layout: {
    background: { type: ColorType.Solid, color: 'transparent' },
    textColor: '#4A5663',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 10,
    attributionLogo: false,
  },
  grid: { vertLines: { visible: false }, horzLines: { visible: false } },
  crosshair: {
    mode: CrosshairMode.Magnet,
    vertLine: { color: '#2c3a49', width: 1 as const, style: LineStyle.Dotted, labelBackgroundColor: '#1b2530' },
    horzLine: { color: '#2c3a49', width: 1 as const, style: LineStyle.Dotted, labelBackgroundColor: '#1b2530' },
  },
  autoSize: true,
}

export default function PriceChart() {
  const selected = useStore((s) => s.selected)
  const timeframe = useStore((s) => s.timeframe)
  const indicators = useStore((s) => s.indicators)
  const digits = useStore((s) => s.assets[s.selected]?.digits ?? 2)
  const price = useStore((s) => s.assets[s.selected]?.price)
  const pct = useStore((s) => s.assets[s.selected]?.pct ?? 0)

  const mainRef = useRef<HTMLDivElement>(null)
  const rsiRef = useRef<HTMLDivElement>(null)
  const macdRef = useRef<HTMLDivElement>(null)

  const areaRef = useRef<ISeriesApi<'Area'> | null>(null)
  const lastTimeRef = useRef<number | null>(null)
  const firstCloseRef = useRef<number | null>(null)
  const upRef = useRef(true)
  const [rangePerf, setRangePerf] = useState<number | null>(null)

  const showRSI = indicators.has('RSI')
  const showMACD = indicators.has('MACD')

  // (re)build the chart whenever the instrument, timeframe or studies change
  useEffect(() => {
    let cancelled = false
    const charts: IChartApi[] = []

    void (async () => {
      const data = await fetchCandles(selected, timeframe)
      if (cancelled || !mainRef.current) return
      const pts = data.points
      const up = (useStore.getState().assets[selected]?.pct ?? 0) >= 0
      upRef.current = up

      const volOn = indicators.has('VOL')
      const chart = createChart(mainRef.current, {
        ...baseLayout,
        rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.12, bottom: volOn ? 0.24 : 0.08 } },
        timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false, rightOffset: 4 },
      })
      charts.push(chart)

      const area = chart.addAreaSeries({
        ...neon(up),
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerRadius: 3,
        priceFormat: { type: 'price', precision: digits, minMove: 10 ** -digits },
      })
      area.setData(pts.map((p) => ({ time: T(p.time), value: p.value })))
      areaRef.current = area
      lastTimeRef.current = pts.at(-1)?.time ?? null
      firstCloseRef.current = pts[0]?.value ?? null
      const cur = useStore.getState().assets[selected]?.price ?? pts.at(-1)?.value ?? 0
      setRangePerf(firstCloseRef.current ? ((cur - firstCloseRef.current) / firstCloseRef.current) * 100 : null)

      if (indicators.has('MA')) {
        const ma = chart.addLineSeries({ color: COLORS.amber, lineWidth: 1, lineStyle: LineStyle.Dotted, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false })
        ma.setData(sma(pts, 20).map((d) => ({ time: T(d.time), value: d.value })))
      }
      if (indicators.has('BB')) {
        const bb = bollinger(pts, 20, 2)
        for (const band of [bb.upper, bb.lower]) {
          const s = chart.addLineSeries({ color: 'rgba(96,125,139,.55)', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false })
          s.setData(band.map((d) => ({ time: T(d.time), value: d.value })))
        }
      }
      if (volOn) {
        const vol = chart.addHistogramSeries({ priceScaleId: 'vol', priceFormat: { type: 'volume' }, color: '#26384a' })
        vol.setData(volume(pts, COLORS.green, COLORS.red).map((d) => ({ time: T(d.time), value: d.value, color: d.color })))
        chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } })
      }
      chart.timeScale().fitContent()

      if (showRSI && rsiRef.current) {
        const rc = createChart(rsiRef.current, { ...baseLayout, rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.12, bottom: 0.12 } }, timeScale: { visible: false } })
        charts.push(rc)
        const rs = rc.addLineSeries({ color: COLORS.blue, lineWidth: 1, priceLineVisible: false, lastValueVisible: false })
        rs.setData(rsi(pts).map((d) => ({ time: T(d.time), value: d.value })))
        rc.priceScale('right').applyOptions({ autoScale: false })
        rs.applyOptions({ autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }) })
        for (const lvl of [70, 30]) rs.createPriceLine({ price: lvl, color: lvl === 70 ? 'rgba(255,23,68,.4)' : 'rgba(0,230,118,.4)', lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: '' })
        rc.timeScale().fitContent()
      }
      if (showMACD && macdRef.current) {
        const mc = createChart(macdRef.current, { ...baseLayout, rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.12, bottom: 0.12 } }, timeScale: { visible: false } })
        charts.push(mc)
        const m = macd(pts, 12, 26, 9, COLORS.green, COLORS.red)
        const hist = mc.addHistogramSeries({ priceFormat: { type: 'price', precision: digits } })
        hist.setData(m.hist.map((d) => ({ time: T(d.time), value: d.value, color: d.color })))
        const ml = mc.addLineSeries({ color: COLORS.amber, lineWidth: 1, priceLineVisible: false, lastValueVisible: false })
        ml.setData(m.macdLine.map((d) => ({ time: T(d.time), value: d.value })))
        const sl = mc.addLineSeries({ color: COLORS.blue, lineWidth: 1, priceLineVisible: false, lastValueVisible: false })
        sl.setData(m.signalLine.map((d) => ({ time: T(d.time), value: d.value })))
        mc.timeScale().fitContent()
      }
    })()

    return () => {
      cancelled = true
      charts.forEach((c) => c.remove())
      areaRef.current = null
      lastTimeRef.current = null
    }
    // Rebuilds only on instrument / timeframe / studies change — NOT on every
    // price tick (live updates are handled by the effect below).
  }, [selected, timeframe, indicators, digits])

  // live tick: nudge the right edge of the price line
  useEffect(() => {
    const area = areaRef.current
    const t = lastTimeRef.current
    if (area && t != null && price != null) {
      area.update({ time: T(t), value: price })
      if (firstCloseRef.current) setRangePerf(((price - firstCloseRef.current) / firstCloseRef.current) * 100)
      const up = pct >= 0
      if (up !== upRef.current) {
        upRef.current = up
        area.applyOptions(neon(up))
      }
    }
  }, [price, pct])

  // 1D = the daily change vs the previous close (identical to the headline %);
  // longer ranges = move since the first bar of the range.
  const badgePerf = timeframe === '1D' ? pct : rangePerf

  return (
    <div className={styles.wrap}>
      {badgePerf != null && (
        <div className={`${styles.rangeBadge} ${badgePerf >= 0 ? 'pos' : 'neg'}`}>
          {timeframe} <b>{badgePerf >= 0 ? '+' : ''}{badgePerf.toFixed(2)}%</b>
        </div>
      )}
      <div ref={mainRef} className={styles.main} />
      {showRSI && (
        <div className={styles.sub}>
          <span className={styles.subLabel}>RSI 14</span>
          <div ref={rsiRef} className={styles.subChart} />
        </div>
      )}
      {showMACD && (
        <div className={styles.sub}>
          <span className={styles.subLabel}>MACD 12 26 9</span>
          <div ref={macdRef} className={styles.subChart} />
        </div>
      )}
    </div>
  )
}

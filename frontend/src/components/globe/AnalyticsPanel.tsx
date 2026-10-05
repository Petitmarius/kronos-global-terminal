import { useEffect, useMemo, useRef, useState } from 'react'
import { ColorType, createChart, LineStyle, type IChartApi, type ISeriesApi } from 'lightweight-charts'

import { fetchCandles } from '../../api'
import { fmtPct, fmtUsd, signClass } from '../../format'
import { closesByDay, curveStart, equityCurve } from '../../geo/exposure'
import type { Asset, ClosedTrade, ExposureModel, Position } from '../../types'
import NonGeoDonut from './NonGeoDonut'
import styles from './GlobalMap.module.css'

const UP = '#00E676'
const DOWN = '#FF1744'
const DAYS = 30
// Daily bars. `1M` is hourly (`_YF_TF`), which would bucket many bars onto one
// day and none onto the rest of the window.
const HIST_TF = '3M'

interface ChartProps {
  positions: Position[]
  history: ClosedTrade[]
  assets: Record<string, Asset>
  capital: number
  equity: number
}

function EquityChart({ positions, history, assets, capital, equity }: ChartProps) {
  const ref = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const areaRef = useRef<ISeriesApi<'Area'> | null>(null)
  const [tip, setTip] = useState<{ x: number; y: number; v: number; t: number } | null>(null)
  const [closes, setCloses] = useState<Record<string, (number | null)[]>>({})

  // Every symbol that held a lot at some point in the window — open positions
  // plus trades closed inside it. Joined into a string so the fetch effect keys
  // on the SET, not on the array identity (which changes on every quote frame).
  const start = curveStart(DAYS)
  const symbols = useMemo(() => {
    const s = new Set(positions.map((p) => p.symbol))
    for (const t of history) if (t.closedAt >= start) s.add(t.symbol)
    return [...s].sort()
  }, [positions, history, start])
  const symKey = symbols.join(',')

  useEffect(() => {
    let alive = true
    if (!symbols.length) { setCloses({}); return }
    void Promise.all(symbols.map((sym) =>
      fetchCandles(sym, HIST_TF)
        .then((c) => [sym, closesByDay(c.points, start, DAYS)] as const)
        // An unpriced or unregistered symbol leaves its lots unmarked rather
        // than failing the whole curve.
        .catch(() => [sym, new Array(DAYS + 1).fill(null)] as const),
    )).then((rows) => { if (alive) setCloses(Object.fromEntries(rows)) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symKey])

  const curve = useMemo(
    () => equityCurve(positions, history, assets, capital, equity, closes, DAYS),
    [positions, history, assets, capital, equity, closes],
  )

  // Built once. `equity` moves on every quote frame, so creating the chart inside
  // an effect keyed on it would tear the whole widget down several times a second
  // — the data is pushed separately below.
  useEffect(() => {
    if (!ref.current) return
    const chart = createChart(ref.current, {
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#4A5663', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, attributionLogo: false },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      rightPriceScale: { visible: false }, timeScale: { visible: true, borderVisible: false, timeVisible: false, secondsVisible: false },
      crosshair: {
        horzLine: { visible: false, labelVisible: false },
        vertLine: { visible: true, color: 'rgba(120,144,163,.5)', width: 1, style: LineStyle.Dotted, labelVisible: false },
      },
      autoSize: true, handleScroll: false, handleScale: false,
    })
    const area = chart.addAreaSeries({ bottomColor: 'transparent', lineWidth: 2, priceLineVisible: false, lastValueVisible: false })
    chart.subscribeCrosshairMove((param) => {
      const pt = param.point
      const pd = param.seriesData.get(area) as { value?: number } | undefined
      if (!pt || !pd || pd.value == null || param.time == null) { setTip(null); return }
      setTip({ x: pt.x as number, y: pt.y as number, v: pd.value, t: param.time as number })
    })
    chartRef.current = chart
    areaRef.current = area
    return () => { chart.remove(); chartRef.current = null; areaRef.current = null }
  }, [])

  useEffect(() => {
    const area = areaRef.current
    if (!area || curve.length < 2) return
    // Up or down is measured against where the window opened, not against zero:
    // this is an equity level around the account's capital, not a P&L delta.
    const up = curve[curve.length - 1].value >= curve[0].value
    area.applyOptions({
      lineColor: up ? UP : DOWN,
      topColor: up ? 'rgba(0,230,118,.25)' : 'rgba(255,23,68,.25)',
    })
    area.setData(curve.map((p) => ({ time: p.time as never, value: p.value })))
    chartRef.current?.timeScale().fitContent()
  }, [curve])

  const open = curve[0]?.value ?? capital
  const delta = (curve[curve.length - 1]?.value ?? capital) - open
  const pct = open ? (delta / open) * 100 : 0

  return (
    <>
      <div className={styles.rpStat}>
        <span className={styles[signClass(delta)]}>
          {delta >= 0 ? '+' : '−'}{fmtUsd(Math.abs(delta))}
        </span>
        <span className={styles[signClass(delta)]}>{fmtPct(pct)}</span>
        <span className={styles.rpBasis}>MARKED ON DAILY CLOSES</span>
      </div>
      <div className={styles.rpChart}>
        <div ref={ref} className={styles.rpChartInner} />
        {tip && (
          <div className={styles.chartTip} style={{ left: tip.x, top: tip.y }}>
            {new Date(tip.t * 1000).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} · {fmtUsd(tip.v)}
          </div>
        )}
      </div>
    </>
  )
}

export default function AnalyticsPanel(
  { exposure, positions, history, assets, capital, equity, onPick }: {
    exposure: ExposureModel; positions: Position[]; history: ClosedTrade[]
    assets: Record<string, Asset>; capital: number; equity: number
    onPick: (symbol: string) => void
  },
) {
  return (
    <div className={styles.rp}>
      <div className={styles.ppHead}><span className={styles.ppTitle}>PERFORMANCE</span></div>
      <div className={styles.ppBody}>
        <div className={styles.cpSection}>PORTFOLIO EQUITY · 30D</div>
        <EquityChart positions={positions} history={history} assets={assets} capital={capital} equity={equity} />

        <div className={styles.cpSection}>NON-GEOGRAPHIC RISK</div>
        <NonGeoDonut byCat={exposure.nonGeo.byCat} onPick={onPick} />
      </div>
    </div>
  )
}

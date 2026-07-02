import { useEffect, useRef, useState } from 'react'
import { ColorType, createChart, type IChartApi } from 'lightweight-charts'

import { fetchGlobeCountry } from '../../api'
import type { CountryDetail } from '../../types'
import styles from './GlobalMap.module.css'

export default function CountryPanel({ iso, onClose }: { iso: string; onClose: () => void }) {
  const [d, setD] = useState<CountryDetail | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setD(null)
    let alive = true
    void fetchGlobeCountry(iso).then((r) => alive && setD(r))
    return () => { alive = false }
  }, [iso])

  useEffect(() => {
    let chart: IChartApi | null = null
    if (d && ref.current && d.index.points.length > 1) {
      chart = createChart(ref.current, {
        layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#4A5663', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, attributionLogo: false },
        grid: { vertLines: { visible: false }, horzLines: { visible: false } },
        rightPriceScale: { visible: false }, timeScale: { visible: false },
        crosshair: { horzLine: { visible: false }, vertLine: { visible: false } },
        autoSize: true, handleScroll: false, handleScale: false,
      })
      const up = (d.index.pct ?? 0) >= 0
      const area = chart.addAreaSeries({ lineColor: up ? '#00E676' : '#FF1744', topColor: up ? 'rgba(0,230,118,.25)' : 'rgba(255,23,68,.25)', bottomColor: 'transparent', lineWidth: 2, priceLineVisible: false, lastValueVisible: false })
      area.setData(d.index.points.map((p) => ({ time: p.time as never, value: p.value })))
      chart.timeScale().fitContent()
    }
    return () => { chart?.remove() }
  }, [d])

  const macroRow = (label: string, v: number | null, unit = '%') => (
    <div className={styles.cpMacroRow}><span>{label}</span><b>{v != null ? `${v}${unit}` : '—'}</b></div>
  )

  return (
    <div className={styles.cp}>
      <div className={styles.cpHead}>
        <span className={styles.cpTitle}>{d?.name ?? iso}</span>
        <button className={styles.cpClose} onClick={onClose}>✕</button>
      </div>
      {!d ? <div className={styles.empty}>loading…</div> : (
        <div className={styles.cpBody}>
          <div className={styles.cpIndex}>
            <span className={styles.cpIndexSym}>{d.index.symbol}</span>
            <span className={styles.cpIndexLvl}>{d.index.level ?? '—'}</span>
            <span className={d.index.pct != null && d.index.pct >= 0 ? styles.pos : styles.neg}>
              {d.index.pct != null ? `${d.index.pct >= 0 ? '+' : ''}${d.index.pct}%` : ''}
            </span>
          </div>
          <div ref={ref} className={styles.cpChart} />
          {d.fx && <div className={styles.cpFx}>FX {d.fx.pair.replace('=X', '')} · {d.fx.level} <span className={d.fx.pct >= 0 ? styles.pos : styles.neg}>{d.fx.pct >= 0 ? '+' : ''}{d.fx.pct}%</span></div>}

          <div className={styles.cpSection}>MACRO {d.macro.year ? `· World Bank ${d.macro.year}` : ''}</div>
          {d.macro.available === false
            ? <div className={styles.empty}>No World Bank data.</div>
            : (<>{macroRow('GDP growth', d.macro.gdp)}{macroRow('Inflation', d.macro.inflation)}{macroRow('Unemployment', d.macro.unemployment)}</>)}

          <div className={styles.cpSection}>NEWS</div>
          {d.news.length === 0 ? <div className={styles.empty}>No tagged news.</div> : d.news.map((n, i) => (
            <a key={i} className={styles.cpNews} href={n.url} target="_blank" rel="noopener noreferrer">{n.headline}</a>
          ))}
        </div>
      )}
    </div>
  )
}

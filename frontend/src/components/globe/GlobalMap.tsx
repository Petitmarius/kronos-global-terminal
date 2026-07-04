import { useEffect, useMemo, useState } from 'react'

import { fetchGlobeGeo, fetchGlobeMacroLayer, fetchGlobeMarkets } from '../../api'
import { buildExposure } from '../../geo/exposure'
import type { MapMetric } from '../../geo/scales'
import { useStore } from '../../store'
import type { GeoPoint, GlobeGeo, GlobeMarkets, MacroLayer } from '../../types'
import CountryPanel from './CountryPanel'
import GeoPanel from './GeoPanel'
import MapLegend from './MapLegend'
import AnalyticsPanel from './AnalyticsPanel'
import PortfolioPanel from './PortfolioPanel'
import SessionClock from './SessionClock'
import WorldMap from './WorldMap'
import WorldSummary from './WorldSummary'
import styles from './GlobalMap.module.css'

const LS_PF = 'apex.globe.portfolio'
const loadPf = (): boolean => { try { return localStorage.getItem(LS_PF) === '1' } catch { return false } }

export default function GlobalMap() {
  const [markets, setMarkets] = useState<GlobeMarkets | null>(null)
  const [geo, setGeo] = useState<GlobeGeo | null>(null)
  const [layer, setLayer] = useState<MacroLayer | null>(null)
  const [metric, setMetric] = useState<MapMetric>('eq')
  const [selected, setSelected] = useState<string | null>(null)
  const [geoSel, setGeoSel] = useState<GeoPoint | null>(null)
  const [showGeo, setShowGeo] = useState(false)
  const [portfolio, setPortfolio] = useState<boolean>(loadPf)

  const positions = useStore((s) => s.positions)
  const history = useStore((s) => s.history)
  const assets = useStore((s) => s.assets)
  const customs = useStore((s) => s.customs)
  const select = useStore((s) => s.select)
  const setView = useStore((s) => s.setView)

  const exposure = useMemo(() => {
    const indexMap: Record<string, string> = {}
    for (const c of markets?.countries ?? []) indexMap[c.index] = c.iso
    return buildExposure(positions, history, assets, customs, indexMap)
  }, [positions, history, assets, customs, markets])

  const selectCountry = (iso: string) => { setGeoSel(null); setSelected(iso) }
  const hoverGeo = (p: GeoPoint) => { setSelected(null); setGeoSel(p) }
  const toggleGeo = (v: boolean) => { if (!v) setGeoSel(null); if (v) setPortfolio(false); setShowGeo(v) }
  const togglePortfolio = (v: boolean) => {
    if (v) { setShowGeo(false); setGeoSel(null); setSelected(null) }
    setPortfolio(v)
    try { localStorage.setItem(LS_PF, v ? '1' : '0') } catch { /* ignore */ }
  }
  const pick = (symbol: string) => { select(symbol); setView('TERMINAL') }
  const exposureClick = (iso: string) => { const c = exposure.perCountry[iso]; if (c?.topSymbol) pick(c.topSymbol) }

  useEffect(() => {
    let alive = true
    const pullM = () => { void fetchGlobeMarkets().then((m) => alive && m && setMarkets(m)) }
    const pullG = () => { void fetchGlobeGeo().then((g) => alive && g && setGeo(g)) }
    pullM(); pullG()
    void fetchGlobeMacroLayer().then((l) => alive && l && setLayer(l))
    const m = setInterval(pullM, 20_000)
    const g = setInterval(pullG, 10 * 60_000)
    return () => { alive = false; clearInterval(m); clearInterval(g) }
  }, [])

  return (
    <div className={styles.wrap}>
      <WorldSummary markets={markets} />
      <div className={styles.mapArea}>
        <WorldMap markets={markets} geo={geo} showGeo={showGeo} metric={metric} layer={layer}
          portfolio={portfolio} exposure={portfolio ? exposure : null}
          onSelect={selectCountry} onGeoHover={hoverGeo} onExposureClick={exposureClick} />
        <div className={styles.mapControls}>
          <button className={`${styles.ctrlBtn} ${portfolio ? styles.ctrlOn : ''}`} onClick={() => togglePortfolio(!portfolio)}>◧ Portfolio</button>
          <button className={`${styles.ctrlBtn} ${showGeo ? styles.ctrlGeoOn : ''}`} onClick={() => toggleGeo(!showGeo)}>◉ Geopolitical</button>
        </div>
        {!portfolio && <MapLegend metric={metric} onMetric={setMetric} />}
        {portfolio && <PortfolioPanel exposure={exposure} onPick={pick} onClose={() => togglePortfolio(false)} />}
        {portfolio && <AnalyticsPanel exposure={exposure} history={history} onPick={pick} />}
        {!portfolio && selected && <CountryPanel iso={selected} onClose={() => setSelected(null)} />}
        {showGeo && geoSel && <GeoPanel point={geoSel} onClose={() => setGeoSel(null)} />}
      </div>
      <SessionClock />
      <footer className={styles.disclaimer}>
        Indices &amp; FX via Yahoo · macro via World Bank (annual) · geopolitical = countries in
        current market news · portfolio = your open positions &amp; trades (client-side). No values are simulated.
      </footer>
    </div>
  )
}

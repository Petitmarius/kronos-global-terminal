import { useEffect, useMemo, useState } from 'react'

import { addAsset, fetchGlobeGeo, fetchGlobeMacroLayer, fetchGlobeMarkets } from '../../api'
import { buildExposure } from '../../geo/exposure'
import type { MapMetric } from '../../geo/scales'
import { useStore } from '../../store'
import type { GeoPoint, GlobeGeo, GlobeMarkets, MacroLayer } from '../../types'
import CountryPanel from './CountryPanel'
import CountryPositionsModal from './CountryPositionsModal'
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
  const [expoSel, setExpoSel] = useState<string | null>(null)

  const positions = useStore((s) => s.positions)
  const history = useStore((s) => s.history)
  const assets = useStore((s) => s.assets)
  const customs = useStore((s) => s.customs)
  const select = useStore((s) => s.selectAndWatch)
  const setView = useStore((s) => s.setView)
  const addToWatchlist = useStore((s) => s.addToWatchlist)

  const indexMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const c of markets?.countries ?? []) m[c.index] = c.iso
    return m
  }, [markets])

  const exposure = useMemo(
    () => buildExposure(positions, history, assets, customs, indexMap),
    [positions, history, assets, customs, indexMap],
  )

  const selectCountry = (iso: string) => { setGeoSel(null); setSelected(iso) }
  const hoverGeo = (p: GeoPoint) => { setSelected(null); setGeoSel(p) }
  const toggleGeo = (v: boolean) => { if (!v) setGeoSel(null); if (v) setPortfolio(false); setShowGeo(v) }
  const togglePortfolio = (v: boolean) => {
    if (v) { setShowGeo(false); setGeoSel(null); setSelected(null) }
    setExpoSel(null)
    setPortfolio(v)
    try { localStorage.setItem(LS_PF, v ? '1' : '0') } catch { /* ignore */ }
  }
  const pick = (symbol: string) => { setExpoSel(null); select(symbol); setView('TERMINAL') }
  // A country in portfolio mode opens the full book for that country; only a row
  // inside that modal navigates to the Terminal.
  const exposureClick = (iso: string) => setExpoSel(iso)
  const isoName = (iso: string) => markets?.countries.find((c) => c.iso === iso)?.name ?? iso
  // country-panel index title -> Terminal. Base indices that overlap a tradable
  // symbol select it directly; the other countries' indices are added on the fly.
  const INDEX_LOCAL: Record<string, string> = { '^GSPC': 'SPX500', '^GDAXI': 'GER40', '^FTSE': 'UK100' }
  const pickIndex = (yahoo: string, name: string) => {
    const local = INDEX_LOCAL[yahoo]
    if (local) { pick(local); return }
    // addToWatchlist (not registerAsset) so the custom meta is saved and the
    // index is re-registered on the next reload instead of leaving a dead row.
    void addAsset(yahoo, `${name} Index`, 'INDEX').then((a) => { if (a) { addToWatchlist(a, yahoo); setView('TERMINAL') } })
  }

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
        {portfolio && <PortfolioPanel exposure={exposure} onCountry={exposureClick} onClose={() => togglePortfolio(false)} />}
        {portfolio && <AnalyticsPanel exposure={exposure} history={history} onPick={pick} />}
        {portfolio && expoSel && (
          <CountryPositionsModal iso={expoSel} name={isoName(expoSel)} indexMap={indexMap}
            onPick={pick} onClose={() => setExpoSel(null)} />
        )}
        {!portfolio && selected && <CountryPanel iso={selected} onClose={() => setSelected(null)} onPickIndex={pickIndex} />}
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

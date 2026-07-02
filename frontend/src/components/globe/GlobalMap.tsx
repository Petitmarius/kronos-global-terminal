import { useEffect, useState } from 'react'

import { fetchGlobeGeo, fetchGlobeMacroLayer, fetchGlobeMarkets } from '../../api'
import type { MapMetric } from '../../geo/scales'
import type { GeoPoint, GlobeGeo, GlobeMarkets, MacroLayer } from '../../types'
import CountryPanel from './CountryPanel'
import GeoPanel from './GeoPanel'
import MapLegend from './MapLegend'
import SessionClock from './SessionClock'
import WorldMap from './WorldMap'
import WorldSummary from './WorldSummary'
import styles from './GlobalMap.module.css'

export default function GlobalMap() {
  const [markets, setMarkets] = useState<GlobeMarkets | null>(null)
  const [geo, setGeo] = useState<GlobeGeo | null>(null)
  const [layer, setLayer] = useState<MacroLayer | null>(null)
  const [metric, setMetric] = useState<MapMetric>('eq')
  const [selected, setSelected] = useState<string | null>(null)
  const [geoSel, setGeoSel] = useState<GeoPoint | null>(null)
  const [showGeo, setShowGeo] = useState(false)

  const selectCountry = (iso: string) => { setGeoSel(null); setSelected(iso) }
  const hoverGeo = (p: GeoPoint) => { setSelected(null); setGeoSel(p) }
  const toggleGeo = (v: boolean) => { if (!v) setGeoSel(null); setShowGeo(v) }

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
        <WorldMap markets={markets} geo={geo} showGeo={showGeo} metric={metric} layer={layer} onSelect={selectCountry} onGeoHover={hoverGeo} />
        <MapLegend metric={metric} onMetric={setMetric} showGeo={showGeo} onToggleGeo={toggleGeo} />
        {selected && <CountryPanel iso={selected} onClose={() => setSelected(null)} />}
        {showGeo && geoSel && <GeoPanel point={geoSel} onClose={() => setGeoSel(null)} />}
      </div>
      <SessionClock />
      <footer className={styles.disclaimer}>
        Indices &amp; FX via Yahoo · macro via World Bank (annual) · geopolitical = countries in
        current market news · sessions = regular hours (holidays excluded). No values are simulated.
      </footer>
    </div>
  )
}

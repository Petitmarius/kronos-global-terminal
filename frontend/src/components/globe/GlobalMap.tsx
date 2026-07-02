import { useEffect, useState } from 'react'

import { fetchGlobeGeo, fetchGlobeMarkets } from '../../api'
import type { GlobeGeo, GlobeMarkets } from '../../types'
import CountryPanel from './CountryPanel'
import MapLegend from './MapLegend'
import SessionClock from './SessionClock'
import WorldMap from './WorldMap'
import styles from './GlobalMap.module.css'

export default function GlobalMap() {
  const [markets, setMarkets] = useState<GlobeMarkets | null>(null)
  const [geo, setGeo] = useState<GlobeGeo | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [showGeo, setShowGeo] = useState(false)

  useEffect(() => {
    let alive = true
    const pullM = () => { void fetchGlobeMarkets().then((m) => alive && m && setMarkets(m)) }
    const pullG = () => { void fetchGlobeGeo().then((g) => alive && g && setGeo(g)) }
    pullM(); pullG()
    const m = setInterval(pullM, 20_000)
    const g = setInterval(pullG, 10 * 60_000)
    return () => { alive = false; clearInterval(m); clearInterval(g) }
  }, [])

  return (
    <div className={styles.wrap}>
      <div className={styles.mapArea}>
        <WorldMap markets={markets} geo={geo} showGeo={showGeo} onSelect={setSelected} />
        <MapLegend showGeo={showGeo} onToggleGeo={setShowGeo} />
        {selected && <CountryPanel iso={selected} onClose={() => setSelected(null)} />}
      </div>
      <SessionClock />
      <footer className={styles.disclaimer}>
        Indices &amp; FX via Yahoo · macro via World Bank (annual) · geopolitical = countries in
        current market news · sessions = regular hours (holidays excluded). No values are simulated.
      </footer>
    </div>
  )
}

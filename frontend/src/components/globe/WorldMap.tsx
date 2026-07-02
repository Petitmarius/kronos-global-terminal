import { useState } from 'react'
import { ComposableMap, Geographies, Geography, Marker, ZoomableGroup } from 'react-simple-maps'
import topo from 'world-atlas/countries-110m.json'

import { NUM_TO_ISO } from '../../geo/countries'
import type { GlobeGeo, GlobeMarkets } from '../../types'
import styles from './GlobalMap.module.css'

const GEO_URL = topo as unknown as Record<string, unknown>

function fill(pct: number | undefined): string {
  if (pct == null) return '#141b23'
  const a = Math.min(Math.abs(pct) / 3, 1) * 0.7 + 0.12
  return pct >= 0 ? `rgba(0,230,118,${a.toFixed(2)})` : `rgba(255,23,68,${a.toFixed(2)})`
}

export default function WorldMap(
  { markets, geo, showGeo, onSelect }:
  { markets: GlobeMarkets | null; geo: GlobeGeo | null; showGeo: boolean; onSelect: (iso: string) => void },
) {
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null)
  const byIso = new Map((markets?.countries ?? []).map((c) => [c.iso, c]))

  return (
    <>
      <ComposableMap projection="geoEqualEarth" projectionConfig={{ scale: 165 }} width={980} height={500} style={{ width: '100%', height: '100%' }}>
        <ZoomableGroup center={[10, 20]} zoom={1} minZoom={1} maxZoom={5}>
          <Geographies geography={GEO_URL}>
            {({ geographies }) =>
              geographies.map((g) => {
                const iso = NUM_TO_ISO[Number(g.id)]
                const c = iso ? byIso.get(iso) : undefined
                return (
                  <Geography
                    key={g.rsmKey}
                    geography={g}
                    fill={fill(c?.pct)}
                    stroke="#0a0e13"
                    strokeWidth={0.4}
                    style={{
                      default: { outline: 'none' },
                      hover: { outline: 'none', fill: c ? '#8fa3b3' : '#1b2530', cursor: c ? 'pointer' : 'default' },
                      pressed: { outline: 'none' },
                    }}
                    onMouseEnter={(e: React.MouseEvent) => c && setTip({ x: e.clientX, y: e.clientY, text: `${c.name} · ${c.index} ${c.pct >= 0 ? '+' : ''}${c.pct}%` })}
                    onMouseMove={(e: React.MouseEvent) => c && setTip((t) => (t ? { ...t, x: e.clientX, y: e.clientY } : t))}
                    onMouseLeave={() => setTip(null)}
                    onClick={() => c && onSelect(c.iso)}
                  />
                )
              })
            }
          </Geographies>
          {showGeo && (geo?.points ?? []).map((p) => (
            <Marker key={p.iso} coordinates={[p.lon, p.lat]}
              onMouseEnter={(e: React.MouseEvent) => setTip({ x: e.clientX, y: e.clientY, text: `${p.name} · ${p.count} news · ${p.headline.slice(0, 60)}` })}
              onMouseMove={(e: React.MouseEvent) => setTip((t) => (t ? { ...t, x: e.clientX, y: e.clientY } : t))}
              onMouseLeave={() => setTip(null)}>
              <circle r={Math.min(4 + Math.sqrt(p.count) * 4, 22)} fill="rgba(255,145,0,0.28)" stroke="#FF9100" strokeWidth={1} />
            </Marker>
          ))}
        </ZoomableGroup>
      </ComposableMap>
      {tip && <div className={styles.mapTip} style={{ left: tip.x + 12, top: tip.y + 12 }}>{tip.text}</div>}
    </>
  )
}

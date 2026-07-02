import { useState } from 'react'
import { ComposableMap, Geographies, Geography, Marker, ZoomableGroup } from 'react-simple-maps'
import topo from 'world-atlas/countries-110m.json'

import { NUM_TO_ISO } from '../../geo/countries'
import { METRIC_META, metricFill, type MapMetric } from '../../geo/scales'
import type { GeoPoint, GlobeGeo, GlobeMarkets, MacroLayer } from '../../types'
import styles from './GlobalMap.module.css'

const GEO_URL = topo as unknown as Record<string, unknown>

export default function WorldMap(
  { markets, geo, showGeo, metric, layer, onSelect, onGeoHover }:
  { markets: GlobeMarkets | null; geo: GlobeGeo | null; showGeo: boolean; metric: MapMetric; layer: MacroLayer | null; onSelect: (iso: string) => void; onGeoHover: (p: GeoPoint) => void },
) {
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null)
  const byIso = new Map((markets?.countries ?? []).map((c) => [c.iso, c]))
  const layerVals = metric !== 'eq' && layer ? layer.metrics[metric] : undefined

  const valueFor = (iso: string | undefined, c: GlobeMarkets['countries'][number] | undefined): number | undefined => {
    if (!iso) return undefined
    if (metric === 'eq') return c?.pct
    return layerVals?.[iso]?.value
  }
  const tipFor = (c: GlobeMarkets['countries'][number], v: number | undefined) =>
    metric === 'eq'
      ? `${c.name} · ${c.index} ${c.pct >= 0 ? '+' : ''}${c.pct}%`
      : `${c.name} · ${METRIC_META[metric].label} ${v != null ? `${v}${METRIC_META[metric].unit}` : '—'}`

  return (
    <>
      <ComposableMap projection="geoEqualEarth" projectionConfig={{ scale: 165 }} width={980} height={500} style={{ width: '100%', height: '100%' }}>
        <ZoomableGroup center={[10, 20]} zoom={1} minZoom={1} maxZoom={5}>
          <Geographies geography={GEO_URL}>
            {({ geographies }) =>
              geographies.map((g) => {
                const iso = NUM_TO_ISO[Number(g.id)]
                const c = iso ? byIso.get(iso) : undefined
                const v = valueFor(iso, c)
                return (
                  <Geography
                    key={g.rsmKey}
                    geography={g}
                    fill={metricFill(metric, v)}
                    stroke="#0a0e13"
                    strokeWidth={0.4}
                    style={{
                      default: { outline: 'none' },
                      hover: { outline: 'none', fill: c ? '#8fa3b3' : '#1b2530', cursor: c ? 'pointer' : 'default' },
                      pressed: { outline: 'none' },
                    }}
                    onMouseEnter={(e: React.MouseEvent) => c && setTip({ x: e.clientX, y: e.clientY, text: tipFor(c, v) })}
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
              style={{ default: { cursor: 'pointer' }, hover: { cursor: 'pointer' }, pressed: {} }}
              onMouseEnter={() => onGeoHover(p)}>
              <circle r={Math.min(4 + Math.sqrt(p.count) * 4, 22)} fill="rgba(255,145,0,0.28)" stroke="#FF9100" strokeWidth={1} />
              <circle r={3} fill="#FF9100" />
            </Marker>
          ))}
        </ZoomableGroup>
      </ComposableMap>
      {tip && <div className={styles.mapTip} style={{ left: tip.x + 12, top: tip.y + 12 }}>{tip.text}</div>}
    </>
  )
}

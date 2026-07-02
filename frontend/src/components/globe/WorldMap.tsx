import { useState } from 'react'
import { ComposableMap, Geographies, Geography, Marker, ZoomableGroup } from 'react-simple-maps'
import topo from 'world-atlas/countries-110m.json'

import { fmtCompact } from '../../format'
import { COUNTRY_CENTROID, NUM_TO_ISO } from '../../geo/countries'
import { METRIC_META, expoFill, metricFill, pnlFill, type MapMetric } from '../../geo/scales'
import type { ExposureModel, GeoPoint, GlobeGeo, GlobeMarkets, MacroLayer } from '../../types'
import styles from './GlobalMap.module.css'

const GEO_URL = topo as unknown as Record<string, unknown>
const signed = (v: number) => `${v >= 0 ? '+' : '−'}$${fmtCompact(Math.abs(v))}`

export default function WorldMap(
  { markets, geo, showGeo, metric, layer, portfolio = false, exposure = null, onSelect, onGeoHover, onExposureClick }:
  {
    markets: GlobeMarkets | null; geo: GlobeGeo | null; showGeo: boolean; metric: MapMetric; layer: MacroLayer | null
    portfolio?: boolean; exposure?: ExposureModel | null
    onSelect: (iso: string) => void; onGeoHover: (p: GeoPoint) => void; onExposureClick?: (iso: string) => void
  },
) {
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null)
  const byIso = new Map((markets?.countries ?? []).map((c) => [c.iso, c]))
  const layerVals = metric !== 'eq' && layer ? layer.metrics[metric] : undefined
  const nameOf = (iso: string) => byIso.get(iso)?.name ?? iso

  const valueFor = (iso: string | undefined, c: GlobeMarkets['countries'][number] | undefined): number | undefined => {
    if (!iso) return undefined
    if (metric === 'eq') return c?.pct
    return layerVals?.[iso]?.value
  }
  const macroTip = (c: GlobeMarkets['countries'][number], v: number | undefined) =>
    metric === 'eq'
      ? `${c.name} · ${c.index} ${c.pct >= 0 ? '+' : ''}${c.pct}%`
      : `${c.name} · ${METRIC_META[metric].label} ${v != null ? `${v}${METRIC_META[metric].unit}` : '—'}`
  const expoTip = (iso: string) => {
    const e = exposure!.perCountry[iso]
    return `${nameOf(iso)} · $${fmtCompact(e.notional)} · P&L ${signed(e.latent)} · real ${signed(e.realized)} · ${e.count} pos`
  }
  const heldNotional = (iso: string | undefined): number =>
    portfolio && exposure && iso ? (exposure.perCountry[iso]?.notional ?? 0) : 0

  const fillFor = (iso: string | undefined, v: number | undefined) => {
    if (portfolio && exposure) {
      const n = heldNotional(iso)
      return n > 0 ? expoFill(n / exposure.maxNotional) : '#141b23'
    }
    return metricFill(metric, v)
  }

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
                const held = heldNotional(iso) > 0
                const interactive = portfolio ? held : !!c
                const fill = fillFor(iso, v)
                return (
                  <Geography
                    key={g.rsmKey}
                    geography={g}
                    fill={fill}
                    stroke="#0a0e13"
                    strokeWidth={0.4}
                    style={{
                      default: { outline: 'none' },
                      hover: { outline: 'none', fill: interactive ? '#8fa3b3' : fill, cursor: interactive ? 'pointer' : 'default' },
                      pressed: { outline: 'none' },
                    }}
                    onMouseEnter={(e: React.MouseEvent) => {
                      if (portfolio) { if (held && iso) setTip({ x: e.clientX, y: e.clientY, text: expoTip(iso) }) }
                      else if (c) setTip({ x: e.clientX, y: e.clientY, text: macroTip(c, v) })
                    }}
                    onMouseMove={(e: React.MouseEvent) => setTip((t) => (t ? { ...t, x: e.clientX, y: e.clientY } : t))}
                    onMouseLeave={() => setTip(null)}
                    onClick={() => { if (portfolio) { if (held && iso) onExposureClick?.(iso) } else if (c) onSelect(c.iso) }}
                  />
                )
              })
            }
          </Geographies>

          {portfolio && exposure && Object.values(exposure.perCountry).filter((e) => e.notional > 0).map((e) => {
            const ctr = COUNTRY_CENTROID[e.iso]
            if (!ctr) return null
            const r = Math.min(6 + Math.sqrt(e.notional / exposure.maxNotional) * 18, 26)
            const col = e.latent >= 0 ? '#00E676' : '#FF1744'
            return (
              <Marker key={e.iso} coordinates={ctr}
                style={{ default: { cursor: 'pointer' }, hover: { cursor: 'pointer' }, pressed: {} }}
                onMouseEnter={(ev: React.MouseEvent) => setTip({ x: ev.clientX, y: ev.clientY, text: expoTip(e.iso) })}
                onMouseMove={(ev: React.MouseEvent) => setTip((t) => (t ? { ...t, x: ev.clientX, y: ev.clientY } : t))}
                onMouseLeave={() => setTip(null)}
                onClick={() => onExposureClick?.(e.iso)}>
                <circle r={r} fill={pnlFill(e.latent, exposure.maxAbsLatent)} fillOpacity={0.32} stroke={col} strokeWidth={1.2} />
                <circle r={3} fill={col} />
              </Marker>
            )
          })}

          {!portfolio && showGeo && (geo?.points ?? []).map((p) => (
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

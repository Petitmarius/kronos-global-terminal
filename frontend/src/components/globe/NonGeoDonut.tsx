import { useState } from 'react'

import { fmtCompact } from '../../format'
import type { NonGeoBucket } from '../../types'
import styles from './GlobalMap.module.css'

const CAT_COLOR: Record<string, string> = { FX: '#42A5F5', CRYPTO: '#7E57C2', CMD: '#FF9100', INDEX: '#26C6DA', EQ: '#5C6BC0', OTHER: '#607D8B' }
const catColor = (c: string) => CAT_COLOR[c] ?? '#607D8B'

const polar = (cx: number, cy: number, r: number, ang: number): [number, number] => [cx + r * Math.cos(ang), cy + r * Math.sin(ang)]
function arcPath(cx: number, cy: number, rO: number, rI: number, a0: number, a1: number): string {
  const large = a1 - a0 > Math.PI ? 1 : 0
  const [x0o, y0o] = polar(cx, cy, rO, a0)
  const [x1o, y1o] = polar(cx, cy, rO, a1)
  const [x1i, y1i] = polar(cx, cy, rI, a1)
  const [x0i, y0i] = polar(cx, cy, rI, a0)
  return `M ${x0o} ${y0o} A ${rO} ${rO} 0 ${large} 1 ${x1o} ${y1o} L ${x1i} ${y1i} A ${rI} ${rI} 0 ${large} 0 ${x0i} ${y0i} Z`
}

function Signed({ v }: { v: number }) {
  return <span className={`${styles.sVal} ${v >= 0 ? styles.pos : styles.neg}`}>{v >= 0 ? '+' : '−'}${fmtCompact(Math.abs(v))}</span>
}

export default function NonGeoDonut(
  { byCat, onPick }: { byCat: Record<string, NonGeoBucket>; onPick: (symbol: string) => void },
) {
  const [hover, setHover] = useState<string | null>(null)
  const cats = Object.entries(byCat)
    .map(([cat, b]) => ({ cat, ...b }))
    .filter((c) => c.notional > 0 || c.realized !== 0 || c.count > 0)
    .sort((a, b) => b.notional - a.notional)

  if (cats.length === 0) return <div className={styles.empty}>No non-geographic positions.</div>

  const total = cats.reduce((s, c) => s + c.notional, 0)
  const cx = 60, cy = 60, rO = 52, rI = 32
  let ang = -Math.PI / 2
  const slices = total > 0 ? cats.filter((c) => c.notional > 0).map((c) => {
    const a0 = ang; const a1 = ang + (c.notional / total) * Math.PI * 2; ang = a1
    return { cat: c.cat, path: arcPath(cx, cy, rO, rI, a0, a1) }
  }) : []

  const hoveredCat = hover ? cats.find((c) => c.cat === hover) ?? null : null
  const centerLabel = hoveredCat ? hoveredCat.cat : 'NON-GEO'
  const centerValue = hoveredCat ? `$${fmtCompact(hoveredCat.notional)}` : `$${fmtCompact(total)}`

  return (
    <div>
      {slices.length > 0 && (
        <div className={styles.donutWrap}>
          <svg viewBox="0 0 120 120" className={styles.donut}>
            {slices.map((s) => (
              <path key={s.cat} d={s.path} fill={catColor(s.cat)}
                opacity={hover && hover !== s.cat ? 0.35 : 1}
                onMouseEnter={() => setHover(s.cat)} onMouseLeave={() => setHover(null)} />
            ))}
          </svg>
          <div className={styles.donutCenter}>
            <span className={styles.donutLbl}>{centerLabel}</span>
            <span className={styles.donutVal}>{centerValue}</span>
          </div>
        </div>
      )}

      {hoveredCat ? (
        hoveredCat.items.length > 0 ? hoveredCat.items.map((it) => (
          <div key={it.symbol} className={styles.ngItem} onClick={() => onPick(it.symbol)}>
            <span className={styles.ngSym}>{it.symbol}</span>
            <Signed v={it.latent} />
            <Signed v={it.realized} />
          </div>
        )) : <div className={styles.empty}>No open {hoveredCat.cat} positions.</div>
      ) : (
        <>
          <div className={styles.ngHead}><span /><span /><span>EXP</span><span>LAT</span><span>REAL</span></div>
          {cats.map((c) => (
            <div key={c.cat} className={styles.ngRow}>
              <span className={styles.ngDot} style={{ background: catColor(c.cat) }} />
              <span className={styles.ngCat}>{c.cat}</span>
              <span className={styles.ngNum}>${fmtCompact(c.notional)}</span>
              <Signed v={c.latent} />
              <Signed v={c.realized} />
            </div>
          ))}
        </>
      )}
    </div>
  )
}

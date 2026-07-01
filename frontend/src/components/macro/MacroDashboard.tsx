import { useEffect, useState } from 'react'

import { fetchMacroBoard, fetchMacroCurve, fetchMacroEcon, fetchMacroReleases } from '../../api'
import type { MacroBoard, MacroCurve, MacroEcon, MacroReleases } from '../../types'
import Panel from './Panel'
import styles from './MacroDashboard.module.css'

export default function MacroDashboard() {
  const [board, setBoard] = useState<MacroBoard | null>(null)
  const [econ, setEcon] = useState<MacroEcon | null>(null)
  const [curve, setCurve] = useState<MacroCurve | null>(null)
  const [releases, setReleases] = useState<MacroReleases | null>(null)

  useEffect(() => {
    let alive = true
    const pullBoard = () => { void fetchMacroBoard().then((b) => alive && b && setBoard(b)) }
    const pullFred = () => {
      void fetchMacroEcon().then((e) => alive && e && setEcon(e))
      void fetchMacroCurve().then((c) => alive && c && setCurve(c))
      void fetchMacroReleases().then((r) => alive && r && setReleases(r))
    }
    pullBoard(); pullFred()
    const b = setInterval(pullBoard, 20_000)
    const f = setInterval(pullFred, 30 * 60_000)
    return () => { alive = false; clearInterval(b); clearInterval(f) }
  }, [])

  return (
    <div className={styles.dash}>
      <div className={styles.grid}>
        <Panel title="Yield Curve" source="FRED" span={2}>{curve ? `${curve.points.length} pts` : '…'}</Panel>
        <Panel title="Rates & Central Bank" source="LIVE">{board ? `10Y ${board.rates.y10 ?? '—'}` : '…'}</Panel>
        <Panel title="Cross-Asset" source="LIVE" span={2}>{board ? `${board.crossAsset.length} classes` : '…'}</Panel>
        <Panel title="Volatility / Risk" source="LIVE">{board ? board.vix.regime : '…'}</Panel>
        <Panel title="Sector Rotation" source="LIVE" span={2}>{board ? `${board.sectors.length} sectors` : '…'}</Panel>
        <Panel title="US Dollar (DXY)" source="LIVE">{board ? board.dxy.level ?? '—' : '…'}</Panel>
        <Panel title="Economic Indicators" source="FRED" span={2}>{econ ? (econ.available ? `${econ.series.length} series` : 'add FRED key') : '…'}</Panel>
        <Panel title="Latest Releases" source="FRED">{releases ? (releases.available ? `${releases.items.length}` : 'add FRED key') : '…'}</Panel>
      </div>
      <footer className={styles.disclaimer}>
        Market macro (rates, VIX, DXY, sectors, cross-asset) via Yahoo Finance ·
        economic data via FRED. No values are simulated.
      </footer>
    </div>
  )
}

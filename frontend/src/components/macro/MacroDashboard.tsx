import { useEffect, useState } from 'react'

import { fetchMacroBoard, fetchMacroCurve, fetchMacroEcon, fetchMacroReleases } from '../../api'
import type { MacroBoard, MacroCurve, MacroEcon, MacroReleases } from '../../types'
import Panel from './Panel'
import CrossAssetPanel from './panels/CrossAssetPanel'
import DollarPanel from './panels/DollarPanel'
import EconIndicatorsPanel from './panels/EconIndicatorsPanel'
import RatesPanel from './panels/RatesPanel'
import ReleasesPanel from './panels/ReleasesPanel'
import SectorRotationPanel from './panels/SectorRotationPanel'
import VolatilityPanel from './panels/VolatilityPanel'
import YieldCurvePanel from './panels/YieldCurvePanel'
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

  const loading = <span className={styles.empty}>loading…</span>

  return (
    <div className={styles.dash}>
      <div className={styles.grid}>
        <Panel title="Yield Curve" source="FRED" span={2}>
          <YieldCurvePanel curve={curve} />
        </Panel>
        <Panel title="Rates & Central Bank" source="LIVE">
          {board ? <RatesPanel board={board} curve={curve} econ={econ} /> : loading}
        </Panel>
        <Panel title="Cross-Asset" source="LIVE" span={2}>
          {board ? <CrossAssetPanel buckets={board.crossAsset} /> : loading}
        </Panel>
        <Panel title="Volatility / Risk" source="LIVE">
          {board ? <VolatilityPanel vix={board.vix} /> : loading}
        </Panel>
        <Panel title="Sector Rotation" source="LIVE" span={2}>
          {board ? <SectorRotationPanel sectors={board.sectors} /> : loading}
        </Panel>
        <Panel title="US Dollar (DXY)" source="LIVE">
          {board ? <DollarPanel dxy={board.dxy} /> : loading}
        </Panel>
        <Panel title="Economic Indicators" source="FRED" span={2}>
          <EconIndicatorsPanel econ={econ} />
        </Panel>
        <Panel title="Latest Releases" source="FRED">
          <ReleasesPanel releases={releases} />
        </Panel>
      </div>
      <footer className={styles.disclaimer}>
        Market macro (rates, VIX, DXY, sectors, cross-asset) via Yahoo Finance ·
        economic data via FRED. No values are simulated.
      </footer>
    </div>
  )
}

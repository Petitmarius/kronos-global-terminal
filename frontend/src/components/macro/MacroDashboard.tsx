import { useEffect, useState } from 'react'

import {
  fetchMacroBoard, fetchMacroCalendar, fetchMacroCurve, fetchMacroEcon, fetchMacroNews,
} from '../../api'
import type {
  MacroBoard, MacroCalendar, MacroCurve, MacroEcon, MacroNews,
} from '../../types'
import LiveWireCenter from './LiveWireCenter'
import Panel from './Panel'
import CrossAssetPanel from './panels/CrossAssetPanel'
import DollarPanel from './panels/DollarPanel'
import EconIndicatorsPanel from './panels/EconIndicatorsPanel'
import RatesPanel from './panels/RatesPanel'
import SectorRotationPanel from './panels/SectorRotationPanel'
import VolatilityPanel from './panels/VolatilityPanel'
import YieldCurvePanel from './panels/YieldCurvePanel'
import styles from './MacroDashboard.module.css'

export default function MacroDashboard() {
  const [board, setBoard] = useState<MacroBoard | null>(null)
  const [econ, setEcon] = useState<MacroEcon | null>(null)
  const [curve, setCurve] = useState<MacroCurve | null>(null)
  const [news, setNews] = useState<MacroNews | null>(null)
  const [calendar, setCalendar] = useState<MacroCalendar | null>(null)

  useEffect(() => {
    let alive = true
    const pullBoard = () => { void fetchMacroBoard().then((b) => alive && b && setBoard(b)) }
    const pullNews = () => { void fetchMacroNews().then((n) => alive && n && setNews(n)) }
    const pullSlow = () => {
      void fetchMacroEcon().then((e) => alive && e && setEcon(e))
      void fetchMacroCurve().then((c) => alive && c && setCurve(c))
      void fetchMacroCalendar().then((c) => alive && c && setCalendar(c))
    }
    pullBoard(); pullNews(); pullSlow()
    const b = setInterval(pullBoard, 20_000)
    const n = setInterval(pullNews, 5 * 60_000)
    const s = setInterval(pullSlow, 30 * 60_000)
    return () => { alive = false; clearInterval(b); clearInterval(n); clearInterval(s) }
  }, [])

  const loading = <span className={styles.empty}>loading…</span>

  return (
    <div className={styles.dash}>
      <div className={styles.grid}>
        {/* Row 1 */}
        <Panel title="Yield Curve" source="FRED">
          <YieldCurvePanel curve={curve} />
        </Panel>
        <Panel title="Volatility / Risk" source="LIVE">
          {board ? <VolatilityPanel vix={board.vix} /> : loading}
        </Panel>
        <Panel title="Rates & Central Bank" source="LIVE">
          {board ? <RatesPanel board={board} curve={curve} econ={econ} /> : loading}
        </Panel>

        {/* Row 2 */}
        <Panel title="Cross-Asset" source="LIVE" span={2}>
          {board ? <CrossAssetPanel buckets={board.crossAsset} /> : loading}
        </Panel>
        <Panel title="US Dollar (DXY)" source="LIVE">
          {board ? <DollarPanel dxy={board.dxy} /> : loading}
        </Panel>

        {/* Row 3 — left column stacks Sector Rotation + Economic Indicators,
            right column is the tall Live Wire Center */}
        <Panel title="Sector Rotation" source="LIVE" span={2}>
          {board ? <SectorRotationPanel sectors={board.sectors} /> : loading}
        </Panel>
        <Panel title="Live Wire Center" source="NEWS · FRED" rowSpan={2} noPad>
          <LiveWireCenter news={news} calendar={calendar} />
        </Panel>
        <Panel title="Economic Indicators" source="FRED" span={2}>
          <EconIndicatorsPanel econ={econ} />
        </Panel>
      </div>
      <footer className={styles.disclaimer}>
        Market macro (rates, VIX, DXY, sectors, cross-asset) via Yahoo Finance ·
        economics via FRED · news via Finnhub / Yahoo. No values are simulated.
      </footer>
    </div>
  )
}

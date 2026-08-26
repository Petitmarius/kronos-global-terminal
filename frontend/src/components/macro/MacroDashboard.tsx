import { useEffect, useState } from 'react'

import {
  fetchMacroBoard, fetchMacroCalendar, fetchMacroCorrelations, fetchMacroCurve, fetchMacroEcon,
  fetchMacroNews, fetchMacroRrg,
} from '../../api'
import type {
  MacroBoard, MacroCalendar, MacroCorrelations, MacroCurve, MacroEcon, MacroNews, MacroRrg,
} from '../../types'
import LiveWireCenter from './LiveWireCenter'
import Panel from './Panel'
import CorrelationMatrixPanel from './panels/CorrelationMatrixPanel'
import CrossAssetPanel from './panels/CrossAssetPanel'
import DollarPanel from './panels/DollarPanel'
import EconIndicatorsPanel from './panels/EconIndicatorsPanel'
import RatesPanel from './panels/RatesPanel'
import RiskBarometer from './panels/RiskBarometer'
import RrgPanel from './panels/RrgPanel'
import VolatilityPanel from './panels/VolatilityPanel'
import YieldCurvePanel from './panels/YieldCurvePanel'
import styles from './MacroDashboard.module.css'

export default function MacroDashboard() {
  const [board, setBoard] = useState<MacroBoard | null>(null)
  const [econ, setEcon] = useState<MacroEcon | null>(null)
  const [curve, setCurve] = useState<MacroCurve | null>(null)
  const [news, setNews] = useState<MacroNews | null>(null)
  const [calendar, setCalendar] = useState<MacroCalendar | null>(null)
  const [corr, setCorr] = useState<MacroCorrelations | null>(null)
  const [rrg, setRrg] = useState<MacroRrg | null>(null)

  useEffect(() => {
    let alive = true
    const pullBoard = () => { void fetchMacroBoard().then((b) => alive && b && setBoard(b)) }
    const pullNews = () => { void fetchMacroNews().then((n) => alive && n && setNews(n)) }
    const pullSlow = () => {
      void fetchMacroEcon().then((e) => alive && e && setEcon(e))
      void fetchMacroCurve().then((c) => alive && c && setCurve(c))
      void fetchMacroCalendar().then((c) => alive && c && setCalendar(c))
      void fetchMacroCorrelations().then((c) => alive && c && setCorr(c))
      void fetchMacroRrg().then((r) => alive && r && setRrg(r))
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
        {/* Hero */}
        <Panel title="Risk Barometer" source="COMPOSITE" span={3}>
          <RiskBarometer risk={board?.risk ?? null} />
        </Panel>

        {/* Row 1 */}
        <Panel title="Yield Curve" source={curve?.source ?? 'US TREASURY'}>
          <YieldCurvePanel curve={curve} />
        </Panel>
        <Panel title="Volatility / Risk" source="LIVE">
          {board ? <VolatilityPanel vix={board.vix} /> : loading}
        </Panel>
        {/* MIXED, not LIVE: see the per-tile date notes in RatesPanel */}
        <Panel title="Rates & Central Bank" source="MIXED">
          {board ? <RatesPanel board={board} curve={curve} econ={econ} /> : loading}
        </Panel>

        {/* Row 2 */}
        <Panel title="Cross-Asset" source="LIVE" span={2}>
          {board ? <CrossAssetPanel buckets={board.crossAsset} /> : loading}
        </Panel>
        <Panel title="US Dollar (DXY)" source="LIVE">
          {board ? <DollarPanel dxy={board.dxy} /> : loading}
        </Panel>

        {/* Rows 3–4 — RRG then Correlations on the left, tall Live Wire on the right */}
        <Panel title="Sector Rotation · RRG" source="LIVE" span={2}>
          <RrgPanel rrg={rrg} />
        </Panel>
        <Panel title="Live Wire Center" source="NEWS · FRED" rowSpan={2} noPad>
          <LiveWireCenter news={news} calendar={calendar} />
        </Panel>
        <Panel title="Cross-Asset Correlations" source="LIVE" span={2}>
          <CorrelationMatrixPanel corr={corr} />
        </Panel>

        {/* Row 5 */}
        <Panel title="Economic Indicators" source="FRED" span={3}>
          <EconIndicatorsPanel econ={econ} />
        </Panel>
      </div>
      <footer className={styles.disclaimer}>
        Market macro (risk, rates, VIX, DXY, sectors, cross-asset, correlations, RRG) via Yahoo
        Finance · economics via FRED · news via Finnhub / Yahoo. No values are simulated.
      </footer>
    </div>
  )
}

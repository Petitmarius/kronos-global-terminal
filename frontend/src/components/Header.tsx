import { useState } from 'react'

import { computeAccount, useStore } from '../store'
import { arrow, fmt, fmtPct, fmtUsd, signClass } from '../format'
import SettingsModal from './SettingsModal'
import styles from './Header.module.css'

const TICKER = ['XAUUSD', 'USDJPY', 'NVDA', 'TSLA', 'BTCUSD', 'EURUSD',
  'NAS100', 'SPX500', 'ETHUSD', 'WTI', 'AAPL', 'GER40']

function Metric({ k, v, cls = '' }: { k: string; v: string; cls?: string }) {
  return (
    <div className={styles.metric}>
      <span className={styles.k}>{k}</span>
      <span className={`${styles.v} ${cls}`}>{v}</span>
    </div>
  )
}

export default function Header() {
  const assets = useStore((s) => s.assets)
  const positions = useStore((s) => s.positions)
  const history = useStore((s) => s.history)
  const connected = useStore((s) => s.connected)
  const live = useStore((s) => s.live)
  const view = useStore((s) => s.view)
  const setView = useStore((s) => s.setView)
  const capital = useStore((s) => s.capital)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const acct = computeAccount(positions, assets, history, capital)
  const ticker = TICKER.map((s) => assets[s]).filter(Boolean)

  return (
    <>
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.logo}>AP<b>E</b>X</span>
          <span className={styles.tag}>PROP&nbsp;TERMINAL</span>
        </div>

        <nav className={styles.nav}>
          {(['TERMINAL', 'MACRO', 'GLOBAL'] as const).map((v) => (
            <button
              key={v}
              className={`${styles.navBtn} ${view === v ? styles.navOn : ''}`}
              onClick={() => setView(v)}
            >
              {v}
            </button>
          ))}
        </nav>

        <div className={styles.metrics}>
          <Metric k="Balance" v={fmtUsd(acct.balance)} />
          <Metric k="Equity" v={fmtUsd(acct.equity)} />
          <Metric k="P&L Today" v={fmtUsd(acct.pnl)} cls={signClass(acct.pnl)} />
          <Metric k="Margin" v={fmtUsd(acct.margin)} />
          <Metric k="Free Margin" v={fmtUsd(acct.free)} />
        </div>

        <div className={styles.net}>
          <span className={`${styles.feed} ${live ? styles.feedLive : styles.feedSim}`}>
            {live ? 'LIVE DATA' : 'SIMULATED'}
          </span>
          <span className={styles.status}>
            <span className={`${styles.dot} ${connected ? styles.dotOn : styles.dotOff}`} />
            {connected ? 'CONNECTED' : 'OFFLINE'}
          </span>
          <button className={styles.gear} onClick={() => setSettingsOpen(true)} title="Settings">⚙</button>
        </div>
      </header>

      <div className={styles.ticker}>
        <div className={styles.track}>
          {[...ticker, ...ticker].map((a, i) => (
            <span className={styles.tk} key={`${a.symbol}-${i}`}>
              <b>{a.symbol}</b>
              <span className={`${styles.px} ${signClass(a.pct)}`}>
                {fmt(a.price, a.digits)} {arrow(a.pct)}{fmtPct(a.pct).replace('+', '')}
              </span>
            </span>
          ))}
        </div>
      </div>

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </>
  )
}

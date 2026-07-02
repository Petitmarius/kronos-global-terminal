import { useEffect } from 'react'

import { addAsset, connectPrices } from './api'
import CenterPanel from './components/CenterPanel'
import Header from './components/Header'
import OrderPanel from './components/OrderPanel'
import Toasts from './components/Toasts'
import Watchlist from './components/Watchlist'
import MacroDashboard from './components/macro/MacroDashboard'
import GlobalMap from './components/globe/GlobalMap'
import { useStore } from './store'

export default function App() {
  const setSnapshot = useStore((s) => s.setSnapshot)
  const applyQuotes = useStore((s) => s.applyQuotes)
  const registerAsset = useStore((s) => s.registerAsset)
  const setConnected = useStore((s) => s.setConnected)
  const view = useStore((s) => s.view)

  useEffect(() => {
    return connectPrices({
      onSnapshot: setSnapshot,
      onQuotes: applyQuotes,
      onAsset: registerAsset,
      onStatus: setConnected,
    })
  }, [setSnapshot, applyQuotes, registerAsset, setConnected])

  // Re-register any custom symbols the user saved previously (the backend loses
  // them on restart) so they stream and show up again.
  useEffect(() => {
    const customs = useStore.getState().customs
    for (const c of Object.values(customs)) {
      addAsset(c.yahoo ?? c.symbol, c.name, c.cat).then((a) => a && registerAsset(a))
    }
  }, [registerAsset])

  return (
    <div className="app">
      <Header />
      {view === 'TERMINAL' && (
        <div className="body">
          <Watchlist />
          <CenterPanel />
          <OrderPanel />
        </div>
      )}
      {view === 'MACRO' && <MacroDashboard />}
      {view === 'GLOBAL' && <GlobalMap />}
      <Toasts />
    </div>
  )
}

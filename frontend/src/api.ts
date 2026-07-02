import type {
  Asset, Candles, CountryDetail, GlobeGeo, GlobeMarkets, MacroBoard, MacroCalendar,
  MacroCorrelations, MacroCurve, MacroEcon, MacroLayer, MacroNews, MacroReleases, MacroRrg,
  OrderBook, Quote,
} from './types'

export interface SearchResult {
  symbol: string
  name: string
  cat: string
  exch: string
}

export async function fetchAssets(): Promise<Asset[]> {
  const r = await fetch('/api/assets')
  if (!r.ok) throw new Error('assets fetch failed')
  return r.json()
}

export async function searchSymbols(q: string): Promise<SearchResult[]> {
  const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`)
  if (!r.ok) return []
  return r.json()
}

export async function addAsset(symbol: string, name: string, cat: string): Promise<Asset | null> {
  const r = await fetch(
    `/api/assets/add?symbol=${encodeURIComponent(symbol)}&name=${encodeURIComponent(name)}&cat=${encodeURIComponent(cat)}`,
    { method: 'POST' },
  )
  return r.ok ? r.json() : null
}

export async function removeAsset(symbol: string): Promise<void> {
  await fetch(`/api/assets/${encodeURIComponent(symbol)}`, { method: 'DELETE' }).catch(() => {})
}

export async function fetchCandles(symbol: string, tf: string): Promise<Candles> {
  const r = await fetch(`/api/assets/${symbol}/candles?tf=${tf}`)
  if (!r.ok) throw new Error('candles fetch failed')
  return r.json()
}

export async function fetchOrderBook(symbol: string): Promise<OrderBook> {
  const r = await fetch(`/api/orderbook/${symbol}`)
  if (!r.ok) throw new Error('orderbook fetch failed')
  return r.json()
}

export async function fetchMacroBoard(): Promise<MacroBoard | null> {
  const r = await fetch('/api/macro/board')
  return r.ok ? r.json() : null
}
export async function fetchMacroEcon(): Promise<MacroEcon | null> {
  const r = await fetch('/api/macro/econ')
  return r.ok ? r.json() : null
}
export async function fetchMacroCurve(): Promise<MacroCurve | null> {
  const r = await fetch('/api/macro/curve')
  return r.ok ? r.json() : null
}
export async function fetchMacroReleases(): Promise<MacroReleases | null> {
  const r = await fetch('/api/macro/releases')
  return r.ok ? r.json() : null
}
export async function fetchMacroCandles(symbol: string, tf: string): Promise<Candles | null> {
  const r = await fetch(`/api/macro/candles?symbol=${encodeURIComponent(symbol)}&tf=${encodeURIComponent(tf)}`)
  return r.ok ? r.json() : null
}
export async function fetchMacroNews(): Promise<MacroNews | null> {
  const r = await fetch('/api/macro/news')
  return r.ok ? r.json() : null
}
export async function fetchMacroCalendar(): Promise<MacroCalendar | null> {
  const r = await fetch('/api/macro/calendar')
  return r.ok ? r.json() : null
}
export async function fetchMacroCorrelations(): Promise<MacroCorrelations | null> {
  const r = await fetch('/api/macro/correlations')
  return r.ok ? r.json() : null
}
export async function fetchMacroRrg(): Promise<MacroRrg | null> {
  const r = await fetch('/api/macro/rrg')
  return r.ok ? r.json() : null
}
export async function fetchGlobeMarkets(): Promise<GlobeMarkets | null> {
  const r = await fetch('/api/globe/markets')
  return r.ok ? r.json() : null
}
export async function fetchGlobeGeo(): Promise<GlobeGeo | null> {
  const r = await fetch('/api/globe/geo')
  return r.ok ? r.json() : null
}
export async function fetchGlobeCountry(iso: string): Promise<CountryDetail | null> {
  const r = await fetch(`/api/globe/country/${encodeURIComponent(iso)}`)
  return r.ok ? r.json() : null
}
export async function fetchGlobeMacroLayer(): Promise<MacroLayer | null> {
  const r = await fetch('/api/globe/macro-layer')
  return r.ok ? r.json() : null
}

export interface PriceHandlers {
  onSnapshot: (assets: Asset[], live: boolean) => void
  onQuotes: (quotes: Quote[]) => void
  onAsset: (asset: Asset) => void
  onStatus: (connected: boolean) => void
}

/** Connect to the backend price stream with auto-reconnect. Returns a disposer. */
export function connectPrices(h: PriceHandlers): () => void {
  let ws: WebSocket | null = null
  let closed = false
  let retry = 1000

  const open = () => {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    ws = new WebSocket(`${proto}://${location.host}/ws/prices`)
    ws.onopen = () => {
      retry = 1000
      h.onStatus(true)
    }
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data)
      if (msg.type === 'snapshot') h.onSnapshot(msg.data, msg.live)
      else if (msg.type === 'quotes') h.onQuotes(msg.data)
      else if (msg.type === 'asset') h.onAsset(msg.data)
    }
    ws.onclose = () => {
      h.onStatus(false)
      if (!closed) {
        setTimeout(open, retry)
        retry = Math.min(retry * 2, 15000)
      }
    }
    ws.onerror = () => ws?.close()
  }

  open()
  return () => {
    closed = true
    ws?.close()
  }
}

export type Source = 'sim' | 'live'

export interface Stats {
  open: number
  high: number
  low: number
  prevClose: number
  w52High: number
  w52Low: number
  volume: number
  spread: number
}

export interface Asset {
  symbol: string
  name: string
  cat: string
  digits: number
  contract: number
  price: number
  change: number
  pct: number
  source: Source
  ts: number
  stats: Stats
}

export interface Quote {
  symbol: string
  price: number
  change: number
  pct: number
  source: Source
  ts: number
}

export interface CandlePoint {
  time: number
  value: number
}

export interface Candles {
  symbol: string
  tf: string
  points: CandlePoint[]
}

export interface BookLevel {
  price: number
  size: number
  total: number
}

export interface OrderBook {
  symbol: string
  bid: number
  ask: number
  spread: number
  asks: BookLevel[]
  bids: BookLevel[]
  maxSize: number
  digits: number
}

export interface Position {
  id: string
  symbol: string
  dir: 'BUY' | 'SELL'
  sign: 1 | -1
  lots: number
  entry: number
  sl: number | null
  tp: number | null
  margin: number
  openedAt: number
}

export type OrderType = 'MARKET' | 'LIMIT' | 'STOP'

export interface PendingOrder {
  id: string
  symbol: string
  dir: 'BUY' | 'SELL'
  sign: 1 | -1
  type: 'LIMIT' | 'STOP'
  price: number
  lots: number
  sl: number | null
  tp: number | null
  margin: number
  createdAt: number
}

export type CloseReason = 'manual' | 'SL' | 'TP'

export interface ClosedTrade {
  id: string
  symbol: string
  dir: 'BUY' | 'SELL'
  sign: 1 | -1
  lots: number
  entry: number
  exit: number
  pnl: number
  pnlPct: number
  openedAt: number
  closedAt: number
  reason: CloseReason
}

export interface OrderRecord {
  id: string
  time: number
  symbol: string
  side: 'BUY' | 'SELL'
  action: 'OPEN' | 'CLOSE'
  lots: number
  price: number
}

export interface Alert {
  id: string
  symbol: string
  price: number
  cond: 'above' | 'below'
  active: boolean
  createdAt: number
  triggeredAt?: number
}

export interface Notice {
  id: string
  kind: 'SL' | 'TP' | 'ALERT' | 'TRADE'
  text: string
  ts: number
}

export interface Account {
  balance: number
  equity: number
  pnl: number
  margin: number
  free: number
}

// --- Macro Dashboard --------------------------------------------------------

export interface SectorPerf { symbol: string; label: string; pct: number }
export interface CrossAssetCell { symbol: string; label: string; pct: number; local: string | null }
export interface CrossAssetBucket { key: string; label: string; items: CrossAssetCell[] }
export interface MacroBoard {
  ts: number
  rates: {
    m3: number | null; y5: number | null; y10: number | null; y30: number | null
    chgM3: number | null; chgY10: number | null; chgY30: number | null
  }
  vix: { level: number | null; pct: number | null; regime: string }
  dxy: { level: number | null; pct: number | null }
  sectors: SectorPerf[]
  crossAsset: CrossAssetBucket[]
}
export interface EconSeries {
  key: string; label: string; value: number | null; prior: number | null; unit: string; spark: number[]
}
export interface MacroEcon { available: boolean; series: EconSeries[] }
export interface CurvePoint { label: string; months: number; yield: number }
export interface MacroCurve {
  available: boolean; points: CurvePoint[]; spread2s10s: number | null; inverted: boolean
}
export interface Release {
  series: string; label: string; value: number | null; unit: string; period: string; updated: string
}
export interface MacroReleases { available: boolean; items: Release[] }
export interface NewsItem {
  headline: string; url: string; source: string; datetime: number; impact: string; summary: string
}
export interface MacroNews { available: boolean; source: string; items: NewsItem[] }
export interface CalendarItem { date: string; event: string }
export interface MacroCalendar { available: boolean; source: string | null; items: CalendarItem[] }

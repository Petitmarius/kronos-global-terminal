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

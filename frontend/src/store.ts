import { create } from 'zustand'

import { BALANCE } from './constants'
import { isToday, uid } from './format'
import type {
  Account, Alert, Asset, ClosedTrade, CloseReason, Notice, OrderRecord, PendingOrder, Position, Quote,
} from './types'

const LS_WL = 'apex.watchlist'
const LS_CUSTOM = 'apex.customs'
const LS_SIM = 'apex.sim'
const LS_VIEW = 'apex.view'

interface CustomMeta {
  symbol: string
  yahoo: string
  name: string
  cat: string
}
interface SimState {
  positions: Position[]
  history: ClosedTrade[]
  orders: OrderRecord[]
  alerts: Alert[]
  pending: PendingOrder[]
}

function loadLS<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v ? (JSON.parse(v) as T) : fallback
  } catch {
    return fallback
  }
}
function saveLS(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* ignore */
  }
}
function persistSim(s: SimState): void {
  saveLS(LS_SIM, s)
}

const persistedWatchlist = loadLS<string[] | null>(LS_WL, null)
const persistedCustoms = loadLS<Record<string, CustomMeta>>(LS_CUSTOM, {})
const persistedSim = loadLS<SimState>(LS_SIM, { positions: [], history: [], orders: [], alerts: [], pending: [] })

function buildClosed(p: Position, exit: number, reason: CloseReason, contract: number): ClosedTrade {
  const pnl = (exit - p.entry) * p.sign * p.lots * contract
  return {
    id: uid(), symbol: p.symbol, dir: p.dir, sign: p.sign, lots: p.lots,
    entry: p.entry, exit, pnl, pnlPct: p.margin ? (pnl / p.margin) * 100 : 0,
    openedAt: p.openedAt, closedAt: Date.now(), reason,
  }
}
const orderRec = (symbol: string, side: 'BUY' | 'SELL', action: 'OPEN' | 'CLOSE', lots: number, price: number): OrderRecord =>
  ({ id: uid(), time: Date.now(), symbol, side, action, lots, price })

interface Store {
  assets: Record<string, Asset>
  order: string[]
  baseSymbols: Set<string>
  live: boolean
  connected: boolean

  view: 'TERMINAL' | 'MACRO'
  setView: (v: 'TERMINAL' | 'MACRO') => void

  selected: string
  timeframe: string
  indicators: Set<string>
  category: string

  watchlist: string[]
  wlInitialized: boolean
  customs: Record<string, CustomMeta>

  positions: Position[]
  pending: PendingOrder[]
  history: ClosedTrade[]
  orders: OrderRecord[]
  alerts: Alert[]
  notices: Notice[]

  setSnapshot: (assets: Asset[], live: boolean) => void
  applyQuotes: (quotes: Quote[]) => void
  registerAsset: (asset: Asset) => void
  setConnected: (c: boolean) => void
  select: (symbol: string) => void
  setTimeframe: (tf: string) => void
  toggleIndicator: (name: string) => void
  setCategory: (cat: string) => void
  addToWatchlist: (asset: Asset, yahoo?: string) => void
  removeFromWatchlist: (symbol: string) => void

  openPosition: (p: Position) => void
  placePending: (o: PendingOrder) => void
  cancelPending: (id: string) => void
  closePosition: (id: string, reason?: CloseReason) => void
  closeAll: () => void
  addAlert: (symbol: string, price: number, cond: 'above' | 'below') => void
  removeAlert: (id: string) => void
  clearHistory: () => void
  dismissNotice: (id: string) => void
}

export const useStore = create<Store>((set) => ({
  assets: {},
  order: [],
  baseSymbols: new Set<string>(),
  live: false,
  connected: false,

  view: loadLS<'TERMINAL' | 'MACRO'>(LS_VIEW, 'TERMINAL'),

  selected: 'NAS100',
  timeframe: '1D',
  indicators: new Set<string>(),
  category: 'ALL',

  watchlist: persistedWatchlist ?? [],
  wlInitialized: persistedWatchlist !== null,
  customs: persistedCustoms,

  positions: persistedSim.positions ?? [],
  pending: persistedSim.pending ?? [],
  history: persistedSim.history ?? [],
  orders: persistedSim.orders ?? [],
  alerts: persistedSim.alerts ?? [],
  notices: [],

  setSnapshot: (assets, live) =>
    set((s) => {
      const map: Record<string, Asset> = { ...s.assets }
      for (const a of assets) map[a.symbol] = a
      const order = assets.map((a) => a.symbol)
      const baseSymbols = new Set(order)
      let watchlist = s.watchlist
      let wlInitialized = s.wlInitialized
      if (!wlInitialized) {
        watchlist = order.slice()
        wlInitialized = true
        saveLS(LS_WL, watchlist)
      }
      const selected = map[s.selected] ? s.selected : watchlist[0] ?? order[0] ?? s.selected
      return { assets: map, order, baseSymbols, live, watchlist, wlInitialized, selected }
    }),

  applyQuotes: (quotes) =>
    set((s) => {
      const assets = { ...s.assets }
      for (const q of quotes) {
        const cur = assets[q.symbol]
        if (cur) assets[q.symbol] = { ...cur, price: q.price, change: q.change, pct: q.pct, source: q.source, ts: q.ts }
      }

      const notices: Notice[] = []
      let history = s.history
      let orders = s.orders
      let changed = false

      // 1) stop-loss / take-profit on open positions
      const survivors: Position[] = []
      for (const p of s.positions) {
        const a = assets[p.symbol]
        if (!a) {
          survivors.push(p)
          continue
        }
        const price = a.price
        let hit: CloseReason | null = null
        if (p.sign > 0) {
          if (p.sl != null && price <= p.sl) hit = 'SL'
          else if (p.tp != null && price >= p.tp) hit = 'TP'
        } else {
          if (p.sl != null && price >= p.sl) hit = 'SL'
          else if (p.tp != null && price <= p.tp) hit = 'TP'
        }
        if (hit) {
          const exit = hit === 'SL' ? (p.sl as number) : (p.tp as number)
          const ct = buildClosed(p, exit, hit, a.contract)
          history = [ct, ...history]
          orders = [orderRec(p.symbol, p.dir, 'CLOSE', p.lots, exit), ...orders]
          notices.push({ id: uid(), kind: hit, text: `${hit} hit · ${p.symbol} ${p.dir} → ${ct.pnl >= 0 ? '+' : ''}$${ct.pnl.toFixed(2)}`, ts: Date.now() })
          changed = true
        } else survivors.push(p)
      }

      // 2) pending LIMIT / STOP fills
      const stillPending: PendingOrder[] = []
      const filled: Position[] = []
      for (const o of s.pending) {
        const a = assets[o.symbol]
        if (!a) {
          stillPending.push(o)
          continue
        }
        const price = a.price
        const fill = o.type === 'LIMIT'
          ? (o.sign > 0 ? price <= o.price : price >= o.price)
          : (o.sign > 0 ? price >= o.price : price <= o.price)
        if (fill) {
          filled.push({ id: uid(), symbol: o.symbol, dir: o.dir, sign: o.sign, lots: o.lots, entry: o.price, sl: o.sl, tp: o.tp, margin: o.margin, openedAt: Date.now() })
          orders = [orderRec(o.symbol, o.dir, 'OPEN', o.lots, o.price), ...orders]
          notices.push({ id: uid(), kind: 'TRADE', text: `${o.type} filled · ${o.symbol} ${o.dir} @ ${o.price}`, ts: Date.now() })
          changed = true
        } else stillPending.push(o)
      }

      // 3) price alerts
      let alerts = s.alerts
      if (alerts.some((al) => al.active)) {
        alerts = alerts.map((al) => {
          if (!al.active) return al
          const a = assets[al.symbol]
          if (!a) return al
          const crossed = al.cond === 'above' ? a.price >= al.price : a.price <= al.price
          if (crossed) {
            notices.push({ id: uid(), kind: 'ALERT', text: `${al.symbol} ${al.cond} ${al.price}`, ts: Date.now() })
            changed = true
            return { ...al, active: false, triggeredAt: Date.now() }
          }
          return al
        })
      }

      if (!changed) return { assets }
      const positions = filled.length ? [...survivors, ...filled] : survivors
      persistSim({ positions, history, orders, alerts, pending: stillPending })
      return { assets, positions, pending: stillPending, history, orders, alerts, notices: [...notices, ...s.notices].slice(0, 6) }
    }),

  registerAsset: (asset) => set((s) => ({ assets: { ...s.assets, [asset.symbol]: asset } })),
  setConnected: (connected) => set({ connected }),
  setView: (view) => { saveLS(LS_VIEW, view); set({ view }) },
  select: (selected) => set({ selected }),
  setTimeframe: (timeframe) => set({ timeframe }),
  toggleIndicator: (name) =>
    set((s) => {
      const next = new Set(s.indicators)
      next.has(name) ? next.delete(name) : next.add(name)
      return { indicators: next }
    }),
  setCategory: (category) => set({ category }),

  addToWatchlist: (asset, yahoo) =>
    set((s) => {
      const assets = { ...s.assets, [asset.symbol]: asset }
      const watchlist = s.watchlist.includes(asset.symbol) ? s.watchlist : [...s.watchlist, asset.symbol]
      let customs = s.customs
      if (!s.baseSymbols.has(asset.symbol) && !customs[asset.symbol]) {
        customs = { ...s.customs, [asset.symbol]: { symbol: asset.symbol, yahoo: yahoo ?? asset.symbol, name: asset.name, cat: asset.cat } }
        saveLS(LS_CUSTOM, customs)
      }
      saveLS(LS_WL, watchlist)
      return { assets, watchlist, customs, selected: asset.symbol }
    }),

  removeFromWatchlist: (symbol) =>
    set((s) => {
      const watchlist = s.watchlist.filter((x) => x !== symbol)
      let customs = s.customs
      if (customs[symbol]) {
        customs = { ...s.customs }
        delete customs[symbol]
        saveLS(LS_CUSTOM, customs)
      }
      saveLS(LS_WL, watchlist)
      const selected = s.selected === symbol ? watchlist[0] ?? s.selected : s.selected
      return { watchlist, customs, selected }
    }),

  openPosition: (p) =>
    set((s) => {
      const positions = [...s.positions, p]
      const orders = [orderRec(p.symbol, p.dir, 'OPEN', p.lots, p.entry), ...s.orders]
      persistSim({ positions, history: s.history, orders, alerts: s.alerts, pending: s.pending })
      return { positions, orders }
    }),

  placePending: (o) =>
    set((s) => {
      const pending = [o, ...s.pending]
      persistSim({ positions: s.positions, history: s.history, orders: s.orders, alerts: s.alerts, pending })
      const notices = [{ id: uid(), kind: 'TRADE' as const, text: `${o.type} ${o.dir} ${o.symbol} @ ${o.price} placed`, ts: Date.now() }, ...s.notices].slice(0, 6)
      return { pending, notices }
    }),

  cancelPending: (id) =>
    set((s) => {
      const pending = s.pending.filter((o) => o.id !== id)
      persistSim({ positions: s.positions, history: s.history, orders: s.orders, alerts: s.alerts, pending })
      return { pending }
    }),

  closePosition: (id, reason: CloseReason = 'manual') =>
    set((s) => {
      const p = s.positions.find((x) => x.id === id)
      if (!p) return {}
      const a = s.assets[p.symbol]
      const exit = a ? a.price : p.entry
      const ct = buildClosed(p, exit, reason, a?.contract ?? 1)
      const positions = s.positions.filter((x) => x.id !== id)
      const history = [ct, ...s.history]
      const orders = [orderRec(p.symbol, p.dir, 'CLOSE', p.lots, exit), ...s.orders]
      persistSim({ positions, history, orders, alerts: s.alerts, pending: s.pending })
      const notices = [{ id: uid(), kind: 'TRADE' as const, text: `Closed ${p.symbol} ${p.dir} → ${ct.pnl >= 0 ? '+' : ''}$${ct.pnl.toFixed(2)}`, ts: Date.now() }, ...s.notices].slice(0, 6)
      return { positions, history, orders, notices }
    }),

  closeAll: () =>
    set((s) => {
      if (s.positions.length === 0) return {}
      let history = s.history
      let orders = s.orders
      for (const p of s.positions) {
        const a = s.assets[p.symbol]
        const exit = a ? a.price : p.entry
        history = [buildClosed(p, exit, 'manual', a?.contract ?? 1), ...history]
        orders = [orderRec(p.symbol, p.dir, 'CLOSE', p.lots, exit), ...orders]
      }
      persistSim({ positions: [], history, orders, alerts: s.alerts, pending: s.pending })
      return { positions: [], history, orders }
    }),

  addAlert: (symbol, price, cond) =>
    set((s) => {
      const alerts = [{ id: uid(), symbol, price, cond, active: true, createdAt: Date.now() }, ...s.alerts]
      persistSim({ positions: s.positions, history: s.history, orders: s.orders, alerts, pending: s.pending })
      return { alerts }
    }),

  removeAlert: (id) =>
    set((s) => {
      const alerts = s.alerts.filter((a) => a.id !== id)
      persistSim({ positions: s.positions, history: s.history, orders: s.orders, alerts, pending: s.pending })
      return { alerts }
    }),

  clearHistory: () =>
    set((s) => {
      persistSim({ positions: s.positions, history: [], orders: [], alerts: s.alerts, pending: s.pending })
      return { history: [], orders: [] }
    }),

  dismissNotice: (id) => set((s) => ({ notices: s.notices.filter((n) => n.id !== id) })),
}))

export function computeAccount(positions: Position[], assets: Record<string, Asset>, history: ClosedTrade[]): Account {
  let unrealized = 0
  let margin = 0
  for (const p of positions) {
    const a = assets[p.symbol]
    margin += p.margin
    if (a) unrealized += (a.price - p.entry) * p.sign * p.lots * a.contract
  }
  let realizedAll = 0
  let realizedToday = 0
  for (const t of history) {
    realizedAll += t.pnl
    if (isToday(t.closedAt)) realizedToday += t.pnl
  }
  const balance = BALANCE + realizedAll
  const equity = balance + unrealized
  return { balance, equity, pnl: realizedToday + unrealized, margin, free: equity - margin }
}

export function positionPnl(p: Position, assets: Record<string, Asset>): { pnl: number; pct: number; current: number } {
  const a = assets[p.symbol]
  const current = a ? a.price : p.entry
  const pnl = (current - p.entry) * p.sign * p.lots * (a?.contract ?? 1)
  const pct = p.margin ? (pnl / p.margin) * 100 : 0
  return { pnl, pct, current }
}

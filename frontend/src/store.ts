import { create } from 'zustand'

import { BALANCE } from './constants'
import { fmtUsd, isToday, uid } from './format'
import type {
  Account, Alert, Asset, ClosedTrade, CloseReason, Notice, OrderRecord, PendingOrder, Position, Quote,
} from './types'

const LS_WL = 'apex.watchlist'
const LS_CUSTOM = 'apex.customs'
const LS_SIM = 'apex.sim'
const LS_VIEW = 'apex.view'
const LS_CAPITAL = 'apex.capital'
const LS_CHARTTYPE = 'apex.charttype'

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
const persistedCapital = loadLS<number>(LS_CAPITAL, BALANCE)
const persistedChartType = loadLS<'line' | 'candles'>(LS_CHARTTYPE, 'line')

// A position is FX-converted only if it carries entryRate (opened after the FX
// change). Pre-existing positions use rate 1 on both sides -> behave as before.
function fxRates(p: Position, a: Asset | undefined): { curRate: number; entRate: number } {
  const hasRate = p.entryRate != null
  return { curRate: hasRate ? (a?.usdRate ?? 1) : 1, entRate: p.entryRate ?? 1 }
}

// An asset with no provider price must never move money: no stop, no limit fill,
// no alert. `price` is null until Yahoo/Finnhub deliver a real one -- nothing in
// the app substitutes a placeholder. Also narrows price to non-null for callers.
type Priced = Asset & { price: number }
function isLive(a: Asset | undefined): a is Priced {
  return !!a && a.source === 'live' && a.price != null
}

// P&L % is a return on the position's NOTIONAL at entry, not on the margin --
// so the column always matches the ENTRY -> CURRENT move (a +1% price move on a
// long reads +1%, whatever the leverage). Same units as pnl: USD when the
// position carries entryRate, local currency for legacy ones.
function entryNotional(p: Position, contract: number, entRate: number): number {
  return Math.abs(p.entry * entRate * p.lots * contract)
}

function buildClosed(p: Position, exit: number, reason: CloseReason, contract: number, exitRate: number): ClosedTrade {
  const hasRate = p.entryRate != null
  const er = hasRate ? exitRate : 1
  const entRate = hasRate ? (p.entryRate ?? 1) : 1
  const pnl = (exit * er - p.entry * entRate) * p.sign * p.lots * contract
  const notional = entryNotional(p, contract, entRate)
  return {
    id: uid(), symbol: p.symbol, dir: p.dir, sign: p.sign, lots: p.lots,
    entry: p.entry, exit, pnl, pnlPct: notional ? (pnl / notional) * 100 : 0,
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

  view: 'TERMINAL' | 'MACRO' | 'GLOBAL'
  setView: (v: 'TERMINAL' | 'MACRO' | 'GLOBAL') => void
  chartType: 'line' | 'candles'
  setChartType: (t: 'line' | 'candles') => void

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
  capital: number

  setSnapshot: (assets: Asset[], live: boolean) => void
  applyQuotes: (quotes: Quote[]) => void
  registerAsset: (asset: Asset) => void
  setConnected: (c: boolean) => void
  select: (symbol: string) => void
  selectAndWatch: (symbol: string) => void
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
  deposit: (amount: number) => void
  withdraw: (amount: number) => void
  resetAccount: () => void
}

export const useStore = create<Store>((set) => ({
  assets: {},
  order: [],
  baseSymbols: new Set<string>(),
  live: false,
  connected: false,

  view: loadLS<'TERMINAL' | 'MACRO' | 'GLOBAL'>(LS_VIEW, 'TERMINAL'),
  chartType: persistedChartType,

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
  capital: persistedCapital,

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
        if (cur) assets[q.symbol] = { ...cur, price: q.price, change: q.change, pct: q.pct, source: q.source, ts: q.ts, usdRate: q.usdRate ?? cur.usdRate, stats: { ...cur.stats, w52High: q.w52High ?? cur.stats.w52High, w52Low: q.w52Low ?? cur.stats.w52Low, volume: q.volume ?? cur.stats.volume, open: q.open ?? cur.stats.open, high: q.high ?? cur.stats.high, low: q.low ?? cur.stats.low, prevClose: q.prevClose ?? cur.stats.prevClose, spread: q.spread ?? cur.stats.spread } }
      }

      const notices: Notice[] = []
      let history = s.history
      let orders = s.orders
      let changed = false

      // 1) stop-loss / take-profit on open positions
      const survivors: Position[] = []
      for (const p of s.positions) {
        const a = assets[p.symbol]
        // Only ever act on a REAL price. An instrument carries price = null until
        // a provider delivers one, and the backend no longer invents a stand-in
        // (it used to seed a hardcoded 2024 mark, which stopped out longs and
        // filled buy limits at levels the market never traded).
        if (!isLive(a)) {
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
          const ct = buildClosed(p, exit, hit, a.contract, a.usdRate ?? 1)
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
        if (!isLive(a)) {   // a simulated tick must never trigger a fill
          stillPending.push(o)
          continue
        }
        const price = a.price
        const fill = o.type === 'LIMIT'
          ? (o.sign > 0 ? price <= o.price : price >= o.price)
          : (o.sign > 0 ? price >= o.price : price <= o.price)
        if (fill) {
          filled.push({ id: uid(), symbol: o.symbol, dir: o.dir, sign: o.sign, lots: o.lots, entry: o.price, sl: o.sl, tp: o.tp, margin: o.margin, openedAt: Date.now(), entryRate: a.usdRate ?? 1 })
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
          if (!isLive(a)) return al
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
  setChartType: (chartType) => { saveLS(LS_CHARTTYPE, chartType); set({ chartType }) },
  select: (selected) => set({ selected }),

  // Click-through from POSITIONS / PENDING / the Global Map. The symbol may have
  // been dropped from the watchlist since the trade was opened, which would leave
  // the Terminal blank -- put it back so the chart always has something to draw.
  selectAndWatch: (symbol) =>
    set((s) => {
      if (s.watchlist.includes(symbol)) return { selected: symbol }
      const watchlist = [...s.watchlist, symbol]
      saveLS(LS_WL, watchlist)
      return { selected: symbol, watchlist }
    }),

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
      // Keep the custom meta while the symbol is still held: it is the only thing
      // that lets App re-register (and re-stream) it after a reload, so clicking
      // the position back open in the Terminal still resolves to a live asset.
      const held = s.positions.some((p) => p.symbol === symbol) || s.pending.some((o) => o.symbol === symbol)
      if (customs[symbol] && !held) {
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
      const free = computeAccount(s.positions, s.assets, s.history, s.capital).free
      if (p.margin > free) {
        const notices = [{ id: uid(), kind: 'ERROR' as const, text: `Order blocked — margin ${fmtUsd(p.margin)} exceeds free margin ${fmtUsd(free)}`, ts: Date.now() }, ...s.notices].slice(0, 6)
        return { notices }
      }
      const positions = [...s.positions, p]
      const orders = [orderRec(p.symbol, p.dir, 'OPEN', p.lots, p.entry), ...s.orders]
      persistSim({ positions, history: s.history, orders, alerts: s.alerts, pending: s.pending })
      return { positions, orders }
    }),

  placePending: (o) =>
    set((s) => {
      const free = computeAccount(s.positions, s.assets, s.history, s.capital).free
      if (o.margin > free) {
        const notices = [{ id: uid(), kind: 'ERROR' as const, text: `Order blocked — margin ${fmtUsd(o.margin)} exceeds free margin ${fmtUsd(free)}`, ts: Date.now() }, ...s.notices].slice(0, 6)
        return { notices }
      }
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
      // No price -> close flat, never at a guess. That has to hold for the FX
      // leg too: closing at `entry` while marking the exit at TODAY's usdRate
      // books a pure-FX P&L on a position that was never marked, and reports a
      // number the CLOSE ALL preview (which counts it as 0) never predicted.
      const live = isLive(a)
      const exit = live ? a.price : p.entry
      const exitRate = live ? (a?.usdRate ?? 1) : (p.entryRate ?? 1)
      const ct = buildClosed(p, exit, reason, a?.contract ?? 1, exitRate)
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
        const live = isLive(a)                       // see closePosition
        const exit = live ? a.price : p.entry
        const exitRate = live ? (a?.usdRate ?? 1) : (p.entryRate ?? 1)
        history = [buildClosed(p, exit, 'manual', a?.contract ?? 1, exitRate), ...history]
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

  deposit: (amount) =>
    set((s) => {
      const add = Math.max(0, amount)
      if (!add) return {}
      const capital = s.capital + add
      saveLS(LS_CAPITAL, capital)
      return { capital }
    }),

  withdraw: (amount) =>
    set((s) => {
      const free = computeAccount(s.positions, s.assets, s.history, s.capital).free
      const w = Math.min(Math.max(0, amount), Math.max(0, free))
      if (!w) return {}
      const capital = s.capital - w
      saveLS(LS_CAPITAL, capital)
      return { capital }
    }),

  resetAccount: () =>
    set(() => {
      persistSim({ positions: [], history: [], orders: [], alerts: [], pending: [] })
      return { positions: [], pending: [], history: [], orders: [], alerts: [], notices: [] }
    }),
}))

export function computeAccount(positions: Position[], assets: Record<string, Asset>, history: ClosedTrade[], capital = BALANCE): Account {
  let unrealized = 0
  let margin = 0
  for (const p of positions) {
    const a = assets[p.symbol]
    margin += p.margin
    // No live price -> the position simply cannot be marked; counting it as
    // flat is honest, inventing a mark is not.
    if (isLive(a)) {
      const { curRate, entRate } = fxRates(p, a)
      unrealized += (a.price * curRate - p.entry * entRate) * p.sign * p.lots * a.contract
    }
  }
  let realizedAll = 0
  let realizedToday = 0
  for (const t of history) {
    realizedAll += t.pnl
    if (isToday(t.closedAt)) realizedToday += t.pnl
  }
  const balance = capital + realizedAll
  const equity = balance + unrealized
  return { balance, equity, pnl: realizedToday + unrealized, margin, free: equity - margin }
}

/** `current` is null when the instrument has no live price; P&L is then 0 rather
 *  than a number marked-to-nothing, and the UI renders the position as "no data". */
export function positionPnl(p: Position, assets: Record<string, Asset>): { pnl: number; pct: number; current: number | null } {
  const a = assets[p.symbol]
  const { curRate, entRate } = fxRates(p, a)
  const contract = a?.contract ?? 1
  if (!isLive(a)) return { pnl: 0, pct: 0, current: null }
  const current = a.price
  const pnl = (current * curRate - p.entry * entRate) * p.sign * p.lots * contract
  const notional = entryNotional(p, contract, entRate)
  const pct = notional ? (pnl / notional) * 100 : 0
  return { pnl, pct, current }
}

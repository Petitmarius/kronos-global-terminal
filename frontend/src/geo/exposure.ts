import type { Asset, ClosedTrade, CountryExposure, ExposureModel, NonGeo, NonGeoBucket, NonGeoItem, Position } from '../types'

interface CustomMeta { symbol: string; yahoo: string; name: string; cat: string }

// Base tradable symbols -> ISO. Equities & indices only; FX/crypto/CMD are
// deliberately absent so they fall through to the non-geographic bucket.
const SYMBOL_ISO: Record<string, string> = {
  NAS100: 'US', US30: 'US', SPX500: 'US', AAPL: 'US', NVDA: 'US', TSLA: 'US', MSFT: 'US', AMZN: 'US',
  GER40: 'DE', UK100: 'GB',
}

// Yahoo exchange suffix -> ISO, aligned to the 42 mapped countries.
// Quirks: .CA = Cairo/Egypt (Canada is .TO/.V); .SA = Sao Paulo/Brazil (Saudi is .SR);
// .AT = Athens/Greece (Austria is .VI); .BR = Brussels/Belgium (Brazil is .SA).
const YF_SUFFIX_ISO: Record<string, string> = {
  PA: 'FR', L: 'GB', DE: 'DE', F: 'DE', MI: 'IT', AS: 'NL', MC: 'ES', SW: 'CH', VX: 'CH', ST: 'SE',
  OL: 'NO', CO: 'DK', HE: 'FI', VI: 'AT', BR: 'BE', LS: 'PT', AT: 'GR', IR: 'IE', WA: 'PL', IS: 'TR',
  JO: 'ZA', TA: 'IL', SR: 'SA', CA: 'EG', ME: 'RU', T: 'JP', SS: 'CN', SZ: 'CN', HK: 'HK', NS: 'IN',
  BO: 'IN', KS: 'KR', KQ: 'KR', TW: 'TW', TWO: 'TW', AX: 'AU', NZ: 'NZ', SI: 'SG', JK: 'ID', BK: 'TH',
  KL: 'MY', PS: 'PH', SA: 'BR', MX: 'MX', BA: 'AR', SN: 'CL', TO: 'CA', V: 'CA', NE: 'CA',
}

export function resolveIso(
  symbol: string,
  customs: Record<string, CustomMeta>,
  indexMap: Record<string, string>,
  assets: Record<string, Asset>,
): string | null {
  const base = SYMBOL_ISO[symbol]
  if (base) return base
  const yf = customs[symbol]?.yahoo ?? symbol
  if (indexMap[yf]) return indexMap[yf]              // known index from the markets board
  const dot = yf.lastIndexOf('.')
  if (dot >= 0) {
    const suf = yf.slice(dot + 1).toUpperCase()
    return YF_SUFFIX_ISO[suf] ?? null                 // unmapped exchange -> non-geographic
  }
  if (/^[A-Za-z]+$/.test(yf) && assets[symbol]?.cat === 'EQ') return 'US'  // plain US equity
  return null
}

const bucket = (): NonGeoBucket => ({ notional: 0, latent: 0, realized: 0, count: 0, items: [] })

export function buildExposure(
  positions: Position[],
  history: ClosedTrade[],
  assets: Record<string, Asset>,
  customs: Record<string, CustomMeta>,
  indexMap: Record<string, string>,
): ExposureModel {
  const perCountry: Record<string, CountryExposure> = {}
  const nonGeo: NonGeo = { ...bucket(), byCat: {}, topSymbol: '' }
  const topNotional: Record<string, number> = {}
  const catItems: Record<string, Record<string, NonGeoItem>> = {}
  let nonGeoTop = 0

  const ensure = (iso: string): CountryExposure => {
    let c = perCountry[iso]
    if (!c) { c = { iso, notional: 0, latent: 0, realized: 0, count: 0, topSymbol: '' }; perCountry[iso] = c }
    return c
  }
  const catBucket = (cat: string): NonGeoBucket => nonGeo.byCat[cat] ?? (nonGeo.byCat[cat] = bucket())
  const itemFor = (cat: string, symbol: string): NonGeoItem => {
    const m = catItems[cat] ?? (catItems[cat] = {})
    return m[symbol] ?? (m[symbol] = { symbol, notional: 0, latent: 0, realized: 0 })
  }

  for (const p of positions) {
    const a = assets[p.symbol]
    const hasRate = p.entryRate != null
    const curRate = hasRate ? (a?.usdRate ?? 1) : 1
    const entRate = p.entryRate ?? 1
    // With no live price the position still has exposure (valued at entry) but
    // cannot be marked -- latent P&L stays 0 rather than becoming a guess.
    const priced = a && a.price != null ? a.price : null
    const notional = (priced ?? p.entry) * p.lots * (a?.contract ?? 1) * curRate
    const latent = priced != null && a ? (priced * curRate - p.entry * entRate) * p.sign * p.lots * a.contract : 0
    const iso = resolveIso(p.symbol, customs, indexMap, assets)
    if (iso) {
      const c = ensure(iso)
      c.notional += notional; c.latent += latent; c.count += 1
      if (notional > (topNotional[iso] ?? 0)) { topNotional[iso] = notional; c.topSymbol = p.symbol }
    } else {
      nonGeo.notional += notional; nonGeo.latent += latent; nonGeo.count += 1
      const cat = a?.cat ?? 'OTHER'
      const b = catBucket(cat)
      b.notional += notional; b.latent += latent; b.count += 1
      const it = itemFor(cat, p.symbol); it.notional += notional; it.latent += latent
      if (notional > nonGeoTop) { nonGeoTop = notional; nonGeo.topSymbol = p.symbol }
    }
  }

  for (const t of history) {
    const iso = resolveIso(t.symbol, customs, indexMap, assets)
    if (iso) ensure(iso).realized += t.pnl
    else {
      nonGeo.realized += t.pnl
      const cat = assets[t.symbol]?.cat ?? 'OTHER'
      catBucket(cat).realized += t.pnl
      itemFor(cat, t.symbol).realized += t.pnl
    }
  }

  for (const [cat, m] of Object.entries(catItems)) {
    catBucket(cat).items = Object.values(m).sort((a, b) => b.notional - a.notional)
  }

  let notionalTot = 0, latentTot = 0, realizedTot = 0, maxNotional = 0, maxAbsLatent = 0
  for (const c of Object.values(perCountry)) {
    notionalTot += c.notional; latentTot += c.latent; realizedTot += c.realized
    if (c.notional > maxNotional) maxNotional = c.notional
    if (Math.abs(c.latent) > maxAbsLatent) maxAbsLatent = Math.abs(c.latent)
  }
  notionalTot += nonGeo.notional; latentTot += nonGeo.latent; realizedTot += nonGeo.realized

  return {
    perCountry, nonGeo,
    totals: { notional: notionalTot, latent: latentTot, realized: realizedTot, positions: positions.length },
    maxNotional: Math.max(maxNotional, 1),
    maxAbsLatent: Math.max(maxAbsLatent, 1),
  }
}

const DAY_MS = 86_400_000

/** Midnight minus `days`: the first point of an equity window. Exported so the
 *  panel indexes candles against exactly the grid the curve walks. */
export function curveStart(days: number): number {
  const midnight = new Date()
  midnight.setHours(0, 0, 0, 0)
  return midnight.getTime() - days * DAY_MS
}

/** Real daily closes bucketed onto the window's day grid and forward-filled, so
 *  a weekend or a holiday reuses the last session's close instead of punching a
 *  hole in the mark. `null` means "no bar yet at that day" — the position is
 *  left unmarked rather than marked at a guess. */
export function closesByDay(
  points: { time: number; value: number }[],
  start: number,
  days: number,
): (number | null)[] {
  const out: (number | null)[] = new Array(days + 1).fill(null)
  for (const p of points) {
    const di = Math.floor((p.time * 1000 - start) / DAY_MS)
    if (di >= 0 && di <= days) out[di] = p.value
    // A bar older than the window still sets the opening level once forward-filled.
    else if (di < 0) out[0] = out[0] ?? p.value
  }
  let last: number | null = null
  for (let i = 0; i <= days; i++) {
    if (out[i] == null) out[i] = last
    else last = out[i]
  }
  return out
}

/** Account equity over a trailing window (default 30 days), in USD — a real
 *  mark-to-market, not a realized-only staircase.
 *
 *  For every day in the window: `capital`, plus P&L realized on or before that
 *  day, plus every lot that was *open* on that day marked against the symbol's
 *  **real daily close** (`closes`, fetched from the same Yahoo history the chart
 *  draws). Closed trades are marked over the span they were open and switch to
 *  realized on their close day, so the curve stays continuous through a close
 *  instead of jumping.
 *
 *  Only reconstructing realized P&L — the first version of this — drew a flat
 *  line for 30 days and a cliff on the last point, because unrealized P&L only
 *  existed on the live point. A position losing money for a week now shows that
 *  week.
 *
 *  Historical FX uses the position's frozen `entryRate`: daily FX history is not
 *  fetched, so the reconstruction carries the price move, not the currency move
 *  (it is exactly 1 for FX, crypto, commodities and indices). The last point is
 *  overridden with `equityNow` so the curve ends on the same number the Terminal
 *  header shows.
 *
 *  Always returns `days + 1` points: an account that never traded draws a flat
 *  line at its capital rather than an empty box.
 */
export function equityCurve(
  positions: Position[],
  history: ClosedTrade[],
  assets: Record<string, Asset>,
  capital: number,
  equityNow: number,
  closes: Record<string, (number | null)[]>,
  days = 30,
): { time: number; value: number }[] {
  const start = curveStart(days)
  const dayOf = (ms: number) => Math.floor((ms - start) / DAY_MS)

  const realizedByDay = new Array(days + 1).fill(0)
  let before = 0 // realized before the window -> part of the opening equity
  for (const t of history) {
    const di = dayOf(t.closedAt)
    if (di < 0) before += t.pnl
    // A `closedAt` past midnight tonight can only be clock skew; clamp it onto
    // today rather than dropping P&L the live equity already counts.
    else realizedByDay[Math.min(di, days)] += t.pnl
  }

  // (symbol, entry, sign, lots, rate, firstDay, lastDay) — one row per lot that
  // was open at some point in the window. `lastDay` is exclusive.
  const legs = [
    ...positions.map((p) => ({
      symbol: p.symbol, entry: p.entry, sign: p.sign, lots: p.lots,
      rate: p.entryRate ?? 1, from: dayOf(p.openedAt), to: days + 1,
    })),
    ...history.map((t) => ({
      symbol: t.symbol, entry: t.entry, sign: t.sign, lots: t.lots,
      rate: 1, from: dayOf(t.openedAt), to: dayOf(t.closedAt),
    })),
  ].filter((l) => l.to > 0 && l.from <= days)

  const out: { time: number; value: number }[] = []
  let realized = capital + before
  for (let i = 0; i <= days; i++) {
    realized += realizedByDay[i]
    let mark = 0
    for (const l of legs) {
      if (i < l.from || i >= l.to) continue
      const close = closes[l.symbol]?.[i]
      if (close == null) continue // no bar -> unmarked, never marked at a guess
      mark += (close - l.entry) * l.rate * l.sign * l.lots * (assets[l.symbol]?.contract ?? 1)
    }
    out.push({ time: Math.floor((start + i * DAY_MS) / 1000), value: realized + mark })
  }
  out[days] = { time: out[days].time, value: equityNow }
  return out
}

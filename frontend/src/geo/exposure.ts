import type { Asset, ClosedTrade, CountryExposure, ExposureModel, NonGeo, NonGeoBucket, Position } from '../types'

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

const bucket = (): NonGeoBucket => ({ notional: 0, latent: 0, realized: 0, count: 0 })

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
  let nonGeoTop = 0

  const ensure = (iso: string): CountryExposure => {
    let c = perCountry[iso]
    if (!c) { c = { iso, notional: 0, latent: 0, realized: 0, count: 0, topSymbol: '' }; perCountry[iso] = c }
    return c
  }
  const catBucket = (cat: string): NonGeoBucket => nonGeo.byCat[cat] ?? (nonGeo.byCat[cat] = bucket())

  for (const p of positions) {
    const a = assets[p.symbol]
    const notional = (a?.price ?? p.entry) * p.lots * (a?.contract ?? 1)
    const latent = a ? (a.price - p.entry) * p.sign * p.lots * a.contract : 0
    const iso = resolveIso(p.symbol, customs, indexMap, assets)
    if (iso) {
      const c = ensure(iso)
      c.notional += notional; c.latent += latent; c.count += 1
      if (notional > (topNotional[iso] ?? 0)) { topNotional[iso] = notional; c.topSymbol = p.symbol }
    } else {
      nonGeo.notional += notional; nonGeo.latent += latent; nonGeo.count += 1
      const b = catBucket(a?.cat ?? 'OTHER')
      b.notional += notional; b.latent += latent; b.count += 1
      if (notional > nonGeoTop) { nonGeoTop = notional; nonGeo.topSymbol = p.symbol }
    }
  }

  for (const t of history) {
    const iso = resolveIso(t.symbol, customs, indexMap, assets)
    if (iso) ensure(iso).realized += t.pnl
    else { nonGeo.realized += t.pnl; catBucket(assets[t.symbol]?.cat ?? 'OTHER').realized += t.pnl }
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

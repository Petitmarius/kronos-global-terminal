export const fmt = (v: number | null | undefined, digits = 2): string =>
  v == null || Number.isNaN(v)
    ? '—'
    : v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })

export const fmtUsd = (v: number): string => `$${fmt(v, 2)}`

export const fmtCompact = (v: number): string =>
  v >= 1e9 ? `${(v / 1e9).toFixed(1)}B`
    : v >= 1e6 ? `${(v / 1e6).toFixed(1)}M`
      : v >= 1e3 ? `${(v / 1e3).toFixed(0)}K`
        : `${Math.round(v)}`

// Null means "no data" everywhere in the app -- an unpriced instrument is shown
// neutral and dashed, never green/red around a fabricated zero.
export const signClass = (v: number | null | undefined): 'pos' | 'neg' | 'mut' =>
  v == null || Number.isNaN(v) ? 'mut' : v >= 0 ? 'pos' : 'neg'
export const arrow = (v: number | null | undefined): string =>
  v == null || Number.isNaN(v) ? '' : v >= 0 ? '▲' : '▼'
export const fmtPct = (v: number | null | undefined): string =>
  v == null || Number.isNaN(v) ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`

export const formatTime = (ms: number): string => new Date(ms).toLocaleTimeString('en-GB')
export const formatStamp = (ms: number): string =>
  new Date(ms).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
export const isToday = (ms: number): boolean => {
  const d = new Date(ms)
  const n = new Date()
  return d.getDate() === n.getDate() && d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear()
}
export const uid = (): string =>
  typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
/** ISO day -> '21 AUG 2026'. Parsed by hand on purpose: `new Date('2026-08-21')`
 *  is UTC midnight and renders as the 20th anywhere west of Greenwich. */
export const fmtIsoDate = (iso: string | null | undefined): string => {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-').map(Number)
  return m >= 1 && m <= 12 ? `${d} ${MONTHS[m - 1]} ${y}` : iso
}
/** ISO day -> 'JUL 2026', for series whose observation is a whole month. */
export const fmtIsoMonth = (iso: string | null | undefined): string => {
  if (!iso) return '—'
  const [y, m] = iso.split('-').map(Number)
  return m >= 1 && m <= 12 ? `${MONTHS[m - 1]} ${y}` : iso
}

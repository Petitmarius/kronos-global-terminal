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

export const signClass = (v: number): 'pos' | 'neg' => (v >= 0 ? 'pos' : 'neg')
export const arrow = (v: number): string => (v >= 0 ? '▲' : '▼')
export const fmtPct = (v: number): string => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`

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

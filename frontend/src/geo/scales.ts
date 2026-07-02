import type { MacroMetric } from '../types'

export type MapMetric = 'eq' | MacroMetric

const RED = [255, 23, 68], GREEN = [0, 230, 118], AMBER = [255, 145, 0], DARK = [20, 27, 35]
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const mix = (c1: number[], c2: number[], t: number) => {
  const k = Math.max(0, Math.min(1, t))
  return `rgb(${Math.round(lerp(c1[0], c2[0], k))},${Math.round(lerp(c1[1], c2[1], k))},${Math.round(lerp(c1[2], c2[2], k))})`
}

const diverging = (v: number, bound: number) => {
  const t = Math.max(-1, Math.min(1, v / bound))
  return t >= 0 ? mix(DARK, GREEN, t * 0.85 + 0.12) : mix(DARK, RED, -t * 0.85 + 0.12)
}
const seq3 = (v: number, lo: number, hi: number) => {
  const t = Math.max(0, Math.min(1, (v - lo) / (hi - lo)))
  return t < 0.5 ? mix(GREEN, AMBER, t * 2) : mix(AMBER, RED, (t - 0.5) * 2)
}
const seq2 = (v: number, lo: number, hi: number) => mix(GREEN, RED, (v - lo) / (hi - lo))

export function metricFill(metric: MapMetric, value: number | undefined | null): string {
  if (value == null) return '#141b23'
  switch (metric) {
    case 'eq': return diverging(value, 3)
    case 'gdp': return diverging(value, 6)
    case 'inflation': return seq3(value, 1, 10)
    case 'unemployment': return seq2(value, 3, 15)
  }
}

export const METRIC_META: Record<MapMetric, { label: string; short: string; unit: string; lo: string; hi: string; gradient: string }> = {
  eq: { label: 'Equities', short: 'EQ', unit: '%', lo: '−3%', hi: '+3%', gradient: 'linear-gradient(90deg,#FF1744,#141b23 50%,#00E676)' },
  gdp: { label: 'GDP growth', short: 'GDP', unit: '%', lo: '−6%', hi: '+6%', gradient: 'linear-gradient(90deg,#FF1744,#141b23 50%,#00E676)' },
  inflation: { label: 'Inflation', short: 'CPI', unit: '%', lo: 'low', hi: 'high', gradient: 'linear-gradient(90deg,#00E676,#FF9100 50%,#FF1744)' },
  unemployment: { label: 'Unemployment', short: 'JOBS', unit: '%', lo: 'low', hi: 'high', gradient: 'linear-gradient(90deg,#00E676,#FF1744)' },
}

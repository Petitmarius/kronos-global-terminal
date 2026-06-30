import type { CandlePoint } from './types'

export interface LineData {
  time: number
  value: number
}
export interface HistData {
  time: number
  value: number
  color: string
}

export function sma(pts: CandlePoint[], n: number): LineData[] {
  const out: LineData[] = []
  let sum = 0
  for (let i = 0; i < pts.length; i++) {
    sum += pts[i].value
    if (i >= n) sum -= pts[i - n].value
    if (i >= n - 1) out.push({ time: pts[i].time, value: sum / n })
  }
  return out
}

function emaSeries(values: number[], n: number): number[] {
  const k = 2 / (n + 1)
  const out: number[] = []
  let prev = values[0] ?? 0
  for (let i = 0; i < values.length; i++) {
    prev = i === 0 ? values[0] : values[i] * k + prev * (1 - k)
    out.push(prev)
  }
  return out
}

export function bollinger(pts: CandlePoint[], n = 20, mult = 2) {
  const upper: LineData[] = []
  const lower: LineData[] = []
  const mid: LineData[] = []
  for (let i = n - 1; i < pts.length; i++) {
    const slice = pts.slice(i - n + 1, i + 1)
    const mean = slice.reduce((s, p) => s + p.value, 0) / n
    const variance = slice.reduce((s, p) => s + (p.value - mean) ** 2, 0) / n
    const sd = Math.sqrt(variance)
    mid.push({ time: pts[i].time, value: mean })
    upper.push({ time: pts[i].time, value: mean + mult * sd })
    lower.push({ time: pts[i].time, value: mean - mult * sd })
  }
  return { upper, lower, mid }
}

export function rsi(pts: CandlePoint[], n = 14): LineData[] {
  const out: LineData[] = []
  let avgGain = 0
  let avgLoss = 0
  for (let i = 1; i < pts.length; i++) {
    const diff = pts[i].value - pts[i - 1].value
    const gain = Math.max(diff, 0)
    const loss = Math.max(-diff, 0)
    if (i <= n) {
      avgGain += gain / n
      avgLoss += loss / n
    } else {
      avgGain = (avgGain * (n - 1) + gain) / n
      avgLoss = (avgLoss * (n - 1) + loss) / n
    }
    if (i >= n) {
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss
      out.push({ time: pts[i].time, value: 100 - 100 / (1 + rs) })
    }
  }
  return out
}

export function macd(pts: CandlePoint[], fast = 12, slow = 26, signalN = 9, up = '#00E676', down = '#FF1744') {
  const values = pts.map((p) => p.value)
  const emaFast = emaSeries(values, fast)
  const emaSlow = emaSeries(values, slow)
  const macdArr = values.map((_, i) => emaFast[i] - emaSlow[i])
  const signalArr = emaSeries(macdArr, signalN)
  const macdLine: LineData[] = []
  const signalLine: LineData[] = []
  const hist: HistData[] = []
  for (let i = slow - 1; i < pts.length; i++) {
    macdLine.push({ time: pts[i].time, value: macdArr[i] })
    signalLine.push({ time: pts[i].time, value: signalArr[i] })
    const h = macdArr[i] - signalArr[i]
    hist.push({ time: pts[i].time, value: h, color: h >= 0 ? up : down })
  }
  return { macdLine, signalLine, hist }
}

// synthetic volume bars derived from bar-to-bar movement
export function volume(pts: CandlePoint[], up = '#00E676', down = '#FF1744'): HistData[] {
  return pts.map((p, i) => {
    const prev = i > 0 ? pts[i - 1].value : p.value
    const move = Math.abs(p.value - prev)
    return {
      time: p.time,
      value: move * 800 + 40 + (i % 7) * 12,
      color: p.value >= prev ? up : down,
    }
  })
}

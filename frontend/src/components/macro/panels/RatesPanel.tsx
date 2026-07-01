import type { MacroBoard, MacroCurve, MacroEcon } from '../../../types'
import styles from '../MacroDashboard.module.css'

function bp(v: number | null): { txt: string; cls: string } {
  if (v == null) return { txt: '', cls: '' }
  // yields up = tightening = red, down = easing = green
  return { txt: `${v > 0 ? '+' : ''}${v}bp`, cls: v >= 0 ? styles.neg : styles.pos }
}

export default function RatesPanel(
  { board, curve, econ }: { board: MacroBoard; curve: MacroCurve | null; econ: MacroEcon | null },
) {
  const y2 = curve?.points.find((p) => p.label === '2Y')?.yield ?? null
  const fed = econ?.series.find((s) => s.key === 'FEDFUNDS')?.value ?? null
  const c10 = bp(board.rates.chgY10)
  const c30 = bp(board.rates.chgY30)
  const tile = (k: string, v: number | null, sub?: { txt: string; cls: string }) => (
    <div className={styles.tile}>
      <div className={styles.tileK}>{k}</div>
      <div className={styles.tileV}>{v != null ? `${v.toFixed(2)}%` : '—'}</div>
      {sub && <div className={`${styles.tileSub} ${sub.cls}`}>{sub.txt}</div>}
    </div>
  )
  return (
    <div className={styles.tiles}>
      {tile('FED FUNDS', fed)}
      {tile('2Y', y2)}
      {tile('10Y', board.rates.y10, c10)}
      {tile('30Y', board.rates.y30, c30)}
    </div>
  )
}

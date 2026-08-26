import { fmtIsoDate, fmtIsoMonth } from '../../../format'
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
  // These four tiles do NOT share a vintage: 10Y/30Y are live Yahoo indices,
  // the 2Y is the Treasury close (no Yahoo 2Y index exists) and FED FUNDS is a
  // FRED monthly average. Each one carries its own date rather than letting the
  // panel imply they are all "now".
  const fedS = econ?.series.find((s) => s.key === 'FEDFUNDS')
  const y2 = curve?.points.find((p) => p.label === '2Y')?.yield ?? null
  const c10 = bp(board.rates.chgY10)
  const c30 = bp(board.rates.chgY30)
  const tile = (
    k: string, v: number | null,
    sub?: { txt: string; cls: string }, note?: string,
  ) => (
    <div className={styles.tile}>
      <div className={styles.tileK}>{k}</div>
      <div className={styles.tileV}>{v != null ? `${v.toFixed(2)}%` : '—'}</div>
      {sub && <div className={`${styles.tileSub} ${sub.cls}`}>{sub.txt}</div>}
      {note && <div className={styles.tileNote}>{note}</div>}
    </div>
  )
  return (
    <div className={styles.tiles}>
      {tile('FED FUNDS', fedS?.value ?? null, undefined,
            fedS?.value != null ? `${fmtIsoMonth(fedS.period)} AVG` : undefined)}
      {tile('2Y', y2, undefined, y2 != null ? `${fmtIsoDate(curve?.asOf)} CLOSE` : undefined)}
      {tile('10Y', board.rates.y10, c10, 'LIVE')}
      {tile('30Y', board.rates.y30, c30, 'LIVE')}
    </div>
  )
}

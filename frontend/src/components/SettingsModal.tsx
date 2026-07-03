import { useState } from 'react'

import { fmtUsd } from '../format'
import { computeAccount, useStore } from '../store'
import styles from './SettingsModal.module.css'

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const capital = useStore((s) => s.capital)
  const positions = useStore((s) => s.positions)
  const assets = useStore((s) => s.assets)
  const history = useStore((s) => s.history)
  const deposit = useStore((s) => s.deposit)
  const withdraw = useStore((s) => s.withdraw)
  const resetAccount = useStore((s) => s.resetAccount)

  const [amountStr, setAmountStr] = useState('')
  const [confirm, setConfirm] = useState(false)

  const free = computeAccount(positions, assets, history, capital).free
  const amount = parseFloat(amountStr) || 0

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.head}>
          <span className={styles.title}>SETTINGS</span>
          <button className={styles.close} onClick={onClose}>✕</button>
        </div>

        <div className={styles.section}>
          <div className={styles.sLabel}>ACCOUNT CAPITAL</div>
          <div className={styles.capRow}><span className={styles.capK}>Current</span><span className={styles.capV}>{fmtUsd(capital)}</span></div>
          <div className={styles.capRow}><span className={styles.capK}>Free margin</span><span className={styles.capV}>{fmtUsd(free)}</span></div>
          <input className={styles.input} type="number" min="0" step="100" placeholder="Amount ($)" value={amountStr} onChange={(e) => setAmountStr(e.target.value)} />
          <div className={styles.btnRow}>
            <button className={styles.deposit} disabled={amount <= 0} onClick={() => { deposit(amount); setAmountStr('') }}>+ DEPOSIT</button>
            <button className={styles.withdraw} disabled={amount <= 0 || free <= 0} onClick={() => { withdraw(amount); setAmountStr('') }}>− WITHDRAW</button>
          </div>
          <div className={styles.hint}>Withdrawals are capped at your free margin ({fmtUsd(free)}).</div>
        </div>

        <div className={styles.section}>
          <div className={styles.sLabel}>RESET</div>
          {!confirm ? (
            <button className={styles.reset} onClick={() => setConfirm(true)}>Reset account</button>
          ) : (
            <div className={styles.confirmRow}>
              <button className={styles.confirmReset} onClick={() => { resetAccount(); onClose() }}>Confirm reset</button>
              <button className={styles.cancel} onClick={() => setConfirm(false)}>Cancel</button>
            </div>
          )}
          <div className={styles.hint}>Clears all positions, pending orders, trade log, order history and alerts. Capital is kept.</div>
        </div>
      </div>
    </div>
  )
}

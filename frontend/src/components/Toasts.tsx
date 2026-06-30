import { useEffect } from 'react'

import { useStore } from '../store'
import styles from './Toasts.module.css'

export default function Toasts() {
  const notices = useStore((s) => s.notices)
  const dismiss = useStore((s) => s.dismissNotice)

  useEffect(() => {
    const timers = notices.map((n) => window.setTimeout(() => dismiss(n.id), 5500))
    return () => timers.forEach(clearTimeout)
  }, [notices, dismiss])

  if (notices.length === 0) return null
  return (
    <div className={styles.wrap}>
      {notices.map((n) => (
        <div key={n.id} className={`${styles.toast} ${styles[`k${n.kind}`] ?? ''}`} onClick={() => dismiss(n.id)}>
          <span className={styles.kind}>{n.kind}</span>
          <span className={styles.text}>{n.text}</span>
        </div>
      ))}
    </div>
  )
}

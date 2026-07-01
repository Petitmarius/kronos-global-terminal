import type { ReactNode } from 'react'
import styles from './MacroDashboard.module.css'

export default function Panel(
  { title, source, span = 1, rowSpan = 1, noPad = false, children }:
  { title: string; source?: string; span?: number; rowSpan?: number; noPad?: boolean; children: ReactNode },
) {
  return (
    <section className={styles.panel} style={{ gridColumn: `span ${span}`, gridRow: `span ${rowSpan}` }}>
      <header className={styles.panelHead}>
        <span className={styles.panelTitle}>{title}</span>
        {source && <span className={styles.panelSrc}>{source}</span>}
      </header>
      <div className={noPad ? styles.panelBodyFlush : styles.panelBody}>{children}</div>
    </section>
  )
}

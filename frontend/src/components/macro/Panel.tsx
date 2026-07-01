import type { ReactNode } from 'react'
import styles from './MacroDashboard.module.css'

export default function Panel(
  { title, source, span = 1, children }:
  { title: string; source?: string; span?: number; children: ReactNode },
) {
  return (
    <section className={styles.panel} style={{ gridColumn: `span ${span}` }}>
      <header className={styles.panelHead}>
        <span className={styles.panelTitle}>{title}</span>
        {source && <span className={styles.panelSrc}>{source}</span>}
      </header>
      <div className={styles.panelBody}>{children}</div>
    </section>
  )
}

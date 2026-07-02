import styles from './GlobalMap.module.css'

export default function MapLegend({ showGeo, onToggleGeo }: { showGeo: boolean; onToggleGeo: (v: boolean) => void }) {
  return (
    <div className={styles.legend}>
      <div className={styles.legendScale}>
        <span className={styles.neg}>−3%</span>
        <span className={styles.legendBar} />
        <span className={styles.pos}>+3%</span>
      </div>
      <button className={`${styles.legendToggle} ${showGeo ? styles.legendToggleOn : ''}`} onClick={() => onToggleGeo(!showGeo)}>
        ◉ Geopolitical
      </button>
    </div>
  )
}

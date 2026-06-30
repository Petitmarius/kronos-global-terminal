import { type MouseEvent, useEffect, useState } from 'react'

import { addAsset, removeAsset, searchSymbols, type SearchResult } from '../api'
import { CATEGORIES, CAT_LABELS } from '../constants'
import { arrow, fmt, signClass } from '../format'
import { useStore } from '../store'
import styles from './Watchlist.module.css'

export default function Watchlist() {
  const assets = useStore((s) => s.assets)
  const watchlist = useStore((s) => s.watchlist)
  const selected = useStore((s) => s.selected)
  const category = useStore((s) => s.category)
  const select = useStore((s) => s.select)
  const setCategory = useStore((s) => s.setCategory)
  const addToWatchlist = useStore((s) => s.addToWatchlist)
  const removeFromWatchlist = useStore((s) => s.removeFromWatchlist)

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setResults([])
      return
    }
    let alive = true
    setBusy(true)
    const t = setTimeout(async () => {
      const r = await searchSymbols(q)
      if (alive) {
        setResults(r)
        setBusy(false)
      }
    }, 250)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [query])

  const rows = watchlist
    .map((sym) => assets[sym])
    .filter((a) => a && (category === 'ALL' || a.cat === category))

  const onAdd = async (r: SearchResult) => {
    setQuery('')
    setResults([])
    const a = await addAsset(r.symbol, r.name, r.cat)
    if (a) addToWatchlist(a, r.symbol)
  }

  const onRemove = (e: MouseEvent, sym: string) => {
    e.stopPropagation()
    removeFromWatchlist(sym)
    removeAsset(sym) // backend only drops it if it was a custom symbol
  }

  return (
    <section className="col">
      <div className={`panel ${styles.wrap}`}>
        <div className="panel-title">
          MARKETS<span className="sub">WATCHLIST</span>
        </div>

        <div className={styles.searchBox}>
          <input
            className={styles.search}
            placeholder="Search & add markets…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {(busy || results.length > 0) && (
            <div className={styles.dropdown}>
              {busy && results.length === 0 && <div className={styles.drInfo}>Searching…</div>}
              {results.map((r) => (
                <button key={r.symbol} className={styles.drRow} onClick={() => onAdd(r)}>
                  <span className={styles.drMain}>
                    <span className={styles.drSym}>{r.symbol}</span>
                    <span className={styles.drCat}>{r.cat}</span>
                  </span>
                  <span className={styles.drName}>{r.name}{r.exch ? ` · ${r.exch}` : ''}</span>
                  <span className={styles.drAdd}>+</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className={`seg ${styles.cats}`}>
          {CATEGORIES.map((c) => (
            <button key={c} className={category === c ? 'on' : ''} onClick={() => setCategory(c)}>
              {CAT_LABELS[c]}
            </button>
          ))}
        </div>

        <div className={`scroll ${styles.list}`}>
          {rows.length === 0 && <div className={styles.empty}>NO MARKETS — SEARCH TO ADD</div>}
          {rows.map((a) => (
            <div
              key={a.symbol}
              className={`${styles.row} ${a.symbol === selected ? styles.on : ''}`}
              onClick={() => select(a.symbol)}
            >
              <span className={styles.left}>
                <span className={styles.sym}>
                  {a.symbol}
                  {a.source === 'live' && <i className={styles.live} title="live" />}
                </span>
                <span className={styles.nm}>{a.name}</span>
              </span>
              <span className={styles.right}>
                <span className={styles.rprice}>{fmt(a.price, a.digits)}</span>
                <span className={`${styles.rchg} ${signClass(a.pct)}`}>
                  {arrow(a.pct)} {Math.abs(a.pct).toFixed(2)}%
                </span>
              </span>
              <button className={styles.remove} title="Remove" onClick={(e) => onRemove(e, a.symbol)}>
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

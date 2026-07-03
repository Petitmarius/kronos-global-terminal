import { useEffect, useMemo, useState } from 'react'

import { LEVERAGE } from '../constants'
import { fmt, fmtCompact, fmtUsd, uid } from '../format'
import { useStore } from '../store'
import type { BookLevel, OrderType } from '../types'
import styles from './OrderPanel.module.css'

const ORDER_TYPES = ['MARKET', 'LIMIT', 'STOP'] as const

interface Book {
  bid: number
  ask: number
  spread: number
  asks: BookLevel[]
  bids: BookLevel[]
  maxSize: number
}

// The book is simulated (no free L2 feed exists). It derives its bid/ask from
// the SAME spread shown in the market-data grid so the two never disagree.
function genBook(price: number, digits: number, spread: number): Book {
  const sp = spread > 0 ? spread : Math.max(10 ** -digits, price * 1e-4)
  const bid = price - sp / 2
  const ask = price + sp / 2
  const step = sp
  const asks: BookLevel[] = []
  const bids: BookLevel[] = []
  let cum = 0
  for (let i = 0; i < 6; i++) {
    const size = 60 + Math.floor(Math.random() * 420)
    cum += size
    const p = ask + step * i
    asks.push({ price: p, size, total: cum * p })
  }
  cum = 0
  for (let i = 0; i < 6; i++) {
    const size = 60 + Math.floor(Math.random() * 420)
    cum += size
    const p = bid - step * i
    bids.push({ price: p, size, total: cum * p })
  }
  const maxSize = Math.max(...asks.map((a) => a.size), ...bids.map((b) => b.size), 1)
  return { bid, ask, spread: ask - bid, asks, bids, maxSize }
}

export default function OrderPanel() {
  const asset = useStore((s) => s.assets[s.selected])
  const selected = useStore((s) => s.selected)
  const openPosition = useStore((s) => s.openPosition)
  const placePending = useStore((s) => s.placePending)

  const [otype, setOtype] = useState<OrderType>('MARKET')
  const [lotsStr, setLotsStr] = useState('0.10')
  const [slStr, setSlStr] = useState('')
  const [tpStr, setTpStr] = useState('')
  const [priceStr, setPriceStr] = useState('')
  const [book, setBook] = useState<Book | null>(null)

  const price = asset?.price
  const digits = asset?.digits ?? 2
  const spread = asset?.stats.spread ?? 0
  const rate = asset?.usdRate ?? 1

  // depth-of-market follows the streaming price; sizes jitter each tick
  useEffect(() => {
    if (price == null) return
    setBook(genBook(price, digits, spread))
  }, [price, digits, selected, spread])

  // seed the limit/stop price when switching to a pending order type or symbol
  useEffect(() => {
    if (otype === 'MARKET') setPriceStr('')
    else if (price != null) setPriceStr(price.toFixed(digits))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otype, selected])

  const lots = parseFloat(lotsStr) || 0
  const sl = parseFloat(slStr)
  const tp = parseFloat(tpStr)
  const slVal = Number.isNaN(sl) ? null : sl
  const tpVal = Number.isNaN(tp) ? null : tp
  const limit = parseFloat(priceStr)
  const orderPrice = otype === 'MARKET' || Number.isNaN(limit) ? price ?? 0 : limit

  const { value, margin, risk } = useMemo(() => {
    if (!asset) return { value: 0, margin: 0, risk: 0 }
    const v = lots * orderPrice * asset.contract * rate
    const m = v / LEVERAGE
    const r = slVal != null ? Math.abs(orderPrice - slVal) * lots * asset.contract * rate : v * 0.0022
    return { value: v, margin: m, risk: r }
  }, [asset, orderPrice, lots, slVal, rate])

  if (!asset || !book || price == null) {
    return (
      <section className="col">
        <div className={`panel ${styles.placeholder}`}>…</div>
      </section>
    )
  }

  const submit = (side: 'BUY' | 'SELL') => {
    const sign: 1 | -1 = side === 'BUY' ? 1 : -1
    if (otype === 'MARKET') {
      openPosition({
        id: uid(), symbol: selected, dir: side, sign, lots,
        entry: side === 'BUY' ? book.ask : book.bid,
        sl: slVal, tp: tpVal, margin, openedAt: Date.now(), entryRate: rate,
      })
    } else {
      placePending({
        id: uid(), symbol: selected, dir: side, sign, type: otype,
        price: orderPrice, lots, sl: slVal, tp: tpVal, margin, createdAt: Date.now(),
      })
    }
  }

  const row = (lvl: BookLevel, side: 'ask' | 'bid') => {
    const w = (lvl.size / book.maxSize) * 100
    return (
      <div className={`${styles.domRow} ${side === 'ask' ? styles.ask : styles.bid}`} key={`${side}-${lvl.price}`}>
        <div className={styles.bar} style={{ width: `${w.toFixed(0)}%` }} />
        <span className={styles.dprice}>{fmt(lvl.price, digits)}</span>
        <span className={styles.dsize}>{lvl.size}</span>
        <span className={styles.dtotal}>{fmtCompact(lvl.total)}</span>
      </div>
    )
  }

  return (
    <section className="col">
      {/* depth of market */}
      <div className={`panel ${styles.dom}`}>
        <div className="panel-title">DEPTH OF MARKET<span className="sub">L2</span></div>
        <div className={styles.domHead}>
          <span>PRICE</span><span>SIZE</span><span>TOTAL</span>
        </div>
        {[...book.asks].reverse().map((l) => row(l, 'ask'))}
        <div className={styles.spread}>
          <span>SPREAD <b>{book.spread.toFixed(Math.max(2, digits))}</b></span>
          <span>BID <b>{fmt(book.bid, digits)}</b></span>
          <span>ASK <b>{fmt(book.ask, digits)}</b></span>
        </div>
        {book.bids.map((l) => row(l, 'bid'))}
      </div>

      {/* order ticket */}
      <div className={`panel ${styles.ticket}`}>
        <div className="panel-title">DEMO ORDER ENTRY<span className="sub">{selected}</span></div>

        <div className={`seg ${styles.types}`}>
          {ORDER_TYPES.map((t) => (
            <button key={t} className={otype === t ? 'on' : ''} onClick={() => setOtype(t)}>{t}</button>
          ))}
        </div>

        {otype !== 'MARKET' && (
          <>
            <label className={styles.fieldLabel}>{otype === 'LIMIT' ? 'Limit price' : 'Stop price'}</label>
            <input
              className={styles.input}
              data-testid="order-price"
              type="number"
              step="any"
              placeholder={fmt(asset.price, digits)}
              value={priceStr}
              onChange={(e) => setPriceStr(e.target.value)}
            />
            <div className={styles.hint}>
              {otype === 'LIMIT' ? 'Buy fills at ≤ price · Sell at ≥ price' : 'Buy fills at ≥ price · Sell at ≤ price'}
            </div>
          </>
        )}

        <label className={styles.fieldLabel}>Lots</label>
        <input className={styles.input} type="number" min="0.01" step="0.01" value={lotsStr}
          onChange={(e) => setLotsStr(e.target.value)} />

        <div className={styles.fieldRow}>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Stop Loss</label>
            <input className={styles.input} placeholder="Optional" value={slStr} onChange={(e) => setSlStr(e.target.value)} />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Take Profit</label>
            <input className={styles.input} placeholder="Optional" value={tpStr} onChange={(e) => setTpStr(e.target.value)} />
          </div>
        </div>

        <div className={styles.risk}>
          <div className={styles.riskCell}><span className={styles.riskK}>VALUE</span><span className={styles.riskV}>{fmtUsd(value)}</span></div>
          <div className={styles.riskCell}><span className={styles.riskK}>MARGIN</span><span className={styles.riskV}>{fmtUsd(margin)}</span></div>
          <div className={styles.riskCell}><span className={styles.riskK}>RISK</span><span className={`${styles.riskV} neg`}>{fmtUsd(risk)}</span></div>
        </div>

        {asset.currency !== 'USD' && (
          <div className={styles.fxHint}>≈ converted at {asset.currency}/USD {rate.toFixed(4)}</div>
        )}

        <div className={styles.actions}>
          <button className={styles.buy} onClick={() => submit('BUY')}>▲ BUY</button>
          <button className={styles.sell} onClick={() => submit('SELL')}>▼ SELL</button>
        </div>
      </div>
    </section>
  )
}

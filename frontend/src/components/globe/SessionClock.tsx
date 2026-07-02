import { useEffect, useState } from 'react'

import styles from './GlobalMap.module.css'

const EXCHANGES = [
  { city: 'Tokyo', tz: 'Asia/Tokyo', open: 9 * 60, close: 15 * 60 },
  { city: 'Hong Kong', tz: 'Asia/Hong_Kong', open: 9 * 60 + 30, close: 16 * 60 },
  { city: 'Frankfurt', tz: 'Europe/Berlin', open: 9 * 60, close: 17 * 60 + 30 },
  { city: 'London', tz: 'Europe/London', open: 8 * 60, close: 16 * 60 + 30 },
  { city: 'New York', tz: 'America/New_York', open: 9 * 60 + 30, close: 16 * 60 },
  { city: 'Sydney', tz: 'Australia/Sydney', open: 10 * 60, close: 16 * 60 },
]

function localState(tz: string, open: number, close: number) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date())
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  const hh = Number(get('hour')) % 24
  const mm = Number(get('minute'))
  const wd = get('weekday')
  const mins = hh * 60 + mm
  const weekday = !['Sat', 'Sun'].includes(wd)
  return { open: weekday && mins >= open && mins < close, time: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}` }
}

export default function SessionClock() {
  const [, tick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 60_000)
    return () => clearInterval(id)
  }, [])
  return (
    <div className={styles.sessions}>
      {EXCHANGES.map((e) => {
        const s = localState(e.tz, e.open, e.close)
        return (
          <span className={styles.session} key={e.city}>
            <span className={`${styles.sessionDot} ${s.open ? styles.sessionOn : ''}`} />
            <b>{e.city}</b> <span className={styles.sessionTime}>{s.time}</span>
          </span>
        )
      })}
    </div>
  )
}

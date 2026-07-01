import { useState } from 'react'

import type { CalendarItem, MacroCalendar, MacroNews } from '../../types'
import styles from './MacroDashboard.module.css'

const IMPACT_CLASS: Record<string, string> = {
  high: styles.dotHigh, med: styles.dotMed, low: styles.dotLow,
}

function timeAgo(ms: number): string {
  if (!ms) return ''
  const s = (Date.now() - ms) / 1000
  if (s < 60) return 'now'
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

function Feed({ news }: { news: MacroNews | null }) {
  if (!news) return <div className={styles.empty}>loading…</div>
  if (!news.available || news.items.length === 0) return <div className={styles.empty}>No news feed available.</div>
  return (
    <div className={styles.feed}>
      {news.items.map((n, i) => (
        <a key={i} className={styles.feedRow} href={n.url} target="_blank" rel="noopener noreferrer">
          <span className={`${styles.dot} ${IMPACT_CLASS[n.impact] ?? styles.dotLow}`} />
          <span className={styles.feedText}>
            <span className={styles.feedTop}>
              <span className={styles.feedSrc}>{n.source}</span>
              <span className={styles.feedTime}>{timeAgo(n.datetime)}</span>
            </span>
            <span className={styles.feedHead}>{n.headline}</span>
          </span>
        </a>
      ))}
    </div>
  )
}

// group upcoming releases by day for an agenda-style calendar
function groupByDate(items: CalendarItem[]): [string, string[]][] {
  const map = new Map<string, string[]>()
  for (const it of items) {
    const arr = map.get(it.date) ?? []
    arr.push(it.event)
    map.set(it.date, arr)
  }
  return [...map.entries()]
}

function fmtDay(iso: string): { dow: string; day: string; mon: string } {
  const d = new Date(`${iso}T00:00:00`)
  return {
    dow: d.toLocaleDateString('en-US', { weekday: 'short' }),
    day: d.toLocaleDateString('en-US', { day: '2-digit' }),
    mon: d.toLocaleDateString('en-US', { month: 'short' }),
  }
}

function Calendar({ calendar }: { calendar: MacroCalendar | null }) {
  if (!calendar) return <div className={styles.empty}>loading…</div>
  if (!calendar.available || calendar.items.length === 0) {
    return <div className={styles.empty}>Add a free FRED key to backend/.env (FRED_API_KEY=…) for the upcoming release calendar.</div>
  }
  return (
    <div className={styles.agenda}>
      {groupByDate(calendar.items).map(([date, events]) => {
        const d = fmtDay(date)
        return (
          <div className={styles.agendaRow} key={date}>
            <div className={styles.agendaDate}>
              <span className={styles.agendaDow}>{d.dow}</span>
              <span className={styles.agendaDay}>{d.day}</span>
              <span className={styles.agendaMon}>{d.mon}</span>
            </div>
            <div className={styles.agendaEvents}>
              {events.map((e) => <span className={styles.agendaEvent} key={e}>{e}</span>)}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function LiveWireCenter(
  { news, calendar }: { news: MacroNews | null; calendar: MacroCalendar | null },
) {
  const [tab, setTab] = useState<'feed' | 'cal'>('feed')
  return (
    <div className={styles.lw}>
      <div className={styles.lwTabs}>
        <button className={`${styles.lwTab} ${tab === 'feed' ? styles.lwTabOn : ''}`} onClick={() => setTab('feed')}>📰 Live Feed</button>
        <button className={`${styles.lwTab} ${tab === 'cal' ? styles.lwTabOn : ''}`} onClick={() => setTab('cal')}>📅 Eco Calendar</button>
      </div>
      <div className={styles.lwBody}>
        {tab === 'feed' ? <Feed news={news} /> : <Calendar calendar={calendar} />}
      </div>
    </div>
  )
}

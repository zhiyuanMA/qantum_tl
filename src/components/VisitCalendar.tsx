'use client';

import Link from 'next/link';
import { matchesFilter, type VisitCalendar as Calendar, type VisitFilter } from '@/application/overview';
import { formatDate, formatDayNumber, formatWeekday } from '@/application/readiness-service';
import { escalationText, STATE_ICONS, stateClass } from './StateBadge';

export function VisitCalendar({ calendar, filter }: { calendar: Calendar; filter: VisitFilter }) {
  const firstWeek = calendar.weeks[0]?.days ?? [];
  return (
    <div className={`calendar ${calendar.showWeekends ? 'calendar-seven' : 'calendar-five'}`}>
      <div className="calendar-head" aria-hidden="true">
        {firstWeek.map((day) => (
          <span key={day.date}>{formatWeekday(day.date)}</span>
        ))}
      </div>
      {calendar.weeks.map((week) => (
        <div key={week.start} className="calendar-week">
          {week.days.map((day) => {
            const rows = day.rows.filter((row) => matchesFilter(row, filter));
            const classes = [
              'calendar-day',
              day.isToday ? 'calendar-today' : '',
              day.inHorizon ? '' : 'calendar-outside',
              rows.length === 0 && !day.isToday ? 'calendar-empty' : '',
            ];
            return (
              <section
                key={day.date}
                className={classes.filter(Boolean).join(' ')}
                aria-label={`${formatDate(day.date)}${day.isToday ? ', today' : ''}`}
              >
                <h3 className="calendar-date">
                  <span className="calendar-date-long">{formatDate(day.date)}</span>
                  <span className="calendar-date-short">{formatDayNumber(day.date)}</span>
                  {day.isToday && <span className="today-tag">Today</span>}
                </h3>
                {rows.map((row) => (
                  <Link
                    key={row.id}
                    href={`/visits/${row.id}/`}
                    className={`calendar-chip chip-${stateClass(row.state)}`}
                    title={row.headline}
                    aria-label={`${row.id}, ${row.siteName}, ${row.teamName}: ${row.headline}${row.escalation ? `. ${escalationText(row.escalation.level)}` : ''}`}
                  >
                    <span className="chip-state">
                      <span aria-hidden="true">{STATE_ICONS[row.state]}</span> {row.stateLabel}
                    </span>
                    <span className="chip-site">{row.siteName}</span>
                    <span className="chip-id">
                      {row.id}
                      {row.escalation && <span className="chip-escalated"> · ✉ {escalationText(row.escalation.level)}</span>}
                    </span>
                  </Link>
                ))}
              </section>
            );
          })}
        </div>
      ))}
    </div>
  );
}

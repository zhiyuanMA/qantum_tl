'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { matchesFilter, type VisitFilter } from '@/application/overview';
import { formatDate, type ReadinessSnapshot } from '@/application/readiness-service';
import { useApp } from './AppProvider';
import { LoadBoundary } from './LoadBoundary';
import { OverviewPanel } from './OverviewPanel';
import { TodayPanel } from './TodayPanel';
import { EscalatedTag, StateBadge } from './StateBadge';
import { VisitCalendar } from './VisitCalendar';

type View = 'CALENDAR' | 'LIST';

function VisitDashboard({ snapshot }: { snapshot: ReadinessSnapshot }) {
  const { leaderId, escalations } = useApp();
  const [filter, setFilter] = useState<VisitFilter>(null);
  const [view, setView] = useState<View>('CALENDAR');
  useEffect(() => setFilter(null), [leaderId]);

  const list = snapshot.visitList(leaderId, escalations);
  const rows = list.rows.filter((row) => matchesFilter(row, filter));

  return (
    <>
      <TodayPanel today={list.todayVisits} date={list.today} />

      <section className="period" aria-labelledby="period-heading">
        <div className="period-head">
          <h2 id="period-heading">Next {list.horizonDays} days</h2>
          <p className="period-summary">{list.overview.summary}</p>
        </div>
        <p className="muted period-note">Includes stock needed by other teams.</p>

        <OverviewPanel list={list} filter={filter} onFilter={setFilter} />

        <div className="view-head">
          <h3>Upcoming visits</h3>
          <div className="view-switch" role="group" aria-label="Choose a view">
            <button type="button" aria-pressed={view === 'CALENDAR'} onClick={() => setView('CALENDAR')}>
              Calendar
            </button>
            <button type="button" aria-pressed={view === 'LIST'} onClick={() => setView('LIST')}>
              List
            </button>
          </div>
        </div>

      {list.rows.length === 0 ? (
        <p className="notice">No visits are planned for your teams in the next {list.horizonDays} days.</p>
      ) : rows.length === 0 ? (
        <p className="notice">
          No visits match this filter.{' '}
          <button type="button" className="link-button" onClick={() => setFilter(null)}>
            Show all visits
          </button>
        </p>
      ) : view === 'CALENDAR' ? (
        <VisitCalendar calendar={list.calendar} filter={filter} />
      ) : (
        <ul className="visit-list">
          {rows.map((row) => (
            <li key={row.id}>
              <Link href={`/visits/${row.id}/`} className="visit-row">
                <span className="visit-date">{formatDate(row.plannedDate)}</span>
                <span className="visit-main">
                  <span className="visit-site">{row.siteName}</span>
                  <span className="visit-reason">{row.headline}</span>
                  <span className="muted small">
                    {row.id} · {row.teamName}
                  </span>
                </span>
                <span className="badges">
                  <StateBadge state={row.state} />
                  {row.escalation && <EscalatedTag level={row.escalation.level} />}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      </section>
    </>
  );
}

export function VisitListView() {
  return <LoadBoundary>{(snapshot) => <VisitDashboard snapshot={snapshot} />}</LoadBoundary>;
}

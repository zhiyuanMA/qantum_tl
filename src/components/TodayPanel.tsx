import Link from 'next/link';
import type { TodayView } from '@/application/overview';
import { formatDate, type VisitRow } from '@/application/readiness-service';
import { EscalatedTag, StateBadge } from './StateBadge';

function TodayRows({ rows }: { rows: VisitRow[] }) {
  return (
    <ul className="today-list">
      {rows.map((row) => (
        <li key={row.id}>
          <Link href={`/visits/${row.id}/`} className="today-row" aria-label={`${row.id}, ${row.siteName}: ${row.headline}`}>
            <span className="badges">
              <StateBadge state={row.state} />
              {row.escalation && <EscalatedTag level={row.escalation.level} />}
            </span>
            <span className="today-main">
              <span className="visit-site">{row.siteName}</span>
              <span className="visit-reason">{row.headline}</span>
            </span>
            <span className="muted small">
              {row.id} · {row.teamName}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function TodayPanel({ today, date }: { today: TodayView; date: string }) {
  return (
    <section className="today-panel" aria-labelledby="today-heading">
      <div className="today-head">
        <h1 id="today-heading">Today, {formatDate(date)}</h1>
        <p className="today-summary">{today.summary}</p>
      </div>
      {today.rows.length > 0 ? (
        <TodayRows rows={today.rows} />
      ) : today.next ? (
        <>
          <h3 className="today-next">
            Next: {today.next.when}, {formatDate(today.next.date)}
          </h3>
          <TodayRows rows={today.next.rows} />
        </>
      ) : (
        <p className="muted">Nothing is planned in the next two weeks.</p>
      )}
    </section>
  );
}

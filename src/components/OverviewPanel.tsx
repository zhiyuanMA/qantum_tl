'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { AttentionBucket, VisitFilter, VisitOverview } from '@/application/overview';
import { formatDate, STATE_LABELS, type VisitList } from '@/application/readiness-service';
import type { ReadinessState } from '@/domain/types';
import { STATE_ICONS, stateClass } from './StateBadge';

const BUCKET_ICONS: Record<AttentionBucket, string> = { ACTION: '!', WATCH: '◷', READY: '✓' };

const isBucket = (filter: VisitFilter, bucket: AttentionBucket) => filter?.kind === 'BUCKET' && filter.bucket === bucket;
const isState = (filter: VisitFilter, state: ReadinessState) => filter?.kind === 'STATE' && filter.state === state;

interface FilterProps {
  filter: VisitFilter;
  onFilter: (filter: VisitFilter) => void;
}

function StatTiles({ overview, filter, onFilter }: FilterProps & { overview: VisitOverview }) {
  const toggle = (bucket: AttentionBucket) => onFilter(isBucket(filter, bucket) ? null : { kind: 'BUCKET', bucket });
  return (
    <div className="stat-tiles">
      {overview.buckets.map(({ bucket, label, count, detail }) => (
        <button
          key={bucket}
          type="button"
          className={`stat-tile stat-${bucket.toLowerCase()}${count > 0 ? ' stat-alert' : ''}`}
          aria-pressed={isBucket(filter, bucket)}
          onClick={() => toggle(bucket)}
        >
          <span className="stat-label">
            <span aria-hidden="true" className="stat-icon">
              {BUCKET_ICONS[bucket]}
            </span>
            {label}
          </span>
          <span className="stat-value">{count}</span>
          <span className="stat-detail">{detail || 'None in this period'}</span>
        </button>
      ))}
      <NextAction overview={overview} />
    </div>
  );
}

function NextAction({ overview }: { overview: VisitOverview }) {
  const next = overview.nextAction;
  if (!next) {
    return (
      <div className="stat-tile stat-next">
        <span className="stat-label">Act on next</span>
        <span className="stat-next-site">
          {overview.allEscalated ? 'All escalated' : 'Nothing to act on'}
        </span>
        {overview.allEscalated && <span className="stat-detail">Waiting for replies</span>}
      </div>
    );
  }
  return (
    <Link href={`/visits/${next.id}/`} className="stat-tile stat-next">
      <span className="stat-label">Act on next</span>
      <span className="stat-next-when">{next.when}</span>
      <span className="stat-next-site">{next.siteName}</span>
      <span className="stat-detail">
        {formatDate(next.plannedDate)} · {next.stateLabel} · {next.id}
      </span>
    </Link>
  );
}

function ReadinessBreakdown({ list, filter, onFilter }: FilterProps & { list: VisitList }) {
  const { overview, counts } = list;
  return (
    <section className="chart-panel" aria-labelledby="breakdown-heading">
      <h3 id="breakdown-heading">Readiness of {overview.total} visits</h3>
      <div className="segment-bar" aria-hidden="true">
        {overview.segments.map(({ state, count, share }) => (
          <span
            key={state}
            className={`segment fill-${stateClass(state)}`}
            style={{ flexGrow: count }}
            title={`${STATE_LABELS[state]}: ${count} of ${overview.total} visits (${share}%)`}
          >
            {share >= 12 ? `${share}%` : ''}
          </span>
        ))}
      </div>
      <div className="filters legend" role="group" aria-label="Filter visits by state">
        <button type="button" aria-pressed={filter === null} onClick={() => onFilter(null)}>
          <span aria-hidden="true" className="swatch fill-all" />
          All <span className="count">{list.rows.length}</span>
        </button>
        {counts.map(({ state, label, count }) => (
          <button
            key={state}
            type="button"
            aria-pressed={isState(filter, state)}
            onClick={() => onFilter(isState(filter, state) ? null : { kind: 'STATE', state })}
          >
            <span aria-hidden="true" className={`swatch fill-${stateClass(state)}`}>
              {STATE_ICONS[state]}
            </span>
            {label} <span className="count">{count}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function MaterialsToChase({ overview }: { overview: VisitOverview }) {
  const top = overview.materials.slice(0, 5);
  const hidden = overview.materials.length - top.length;
  return (
    <section className="chart-panel" aria-labelledby="materials-chart-heading">
      <h3 id="materials-chart-heading">Materials to chase</h3>
      {top.length === 0 ? (
        <p className="muted">No shortages on your visits.</p>
      ) : (
        <>
          <p className="muted small chart-note">Earliest affected visit first. Each bar shows how much of your demand is short.</p>
          <ol className="pressure-list">
            {top.map((item) => (
              <li key={item.productId}>
                <span className="pressure-head">
                  <span className="pressure-name">{item.productName}</span>
                  <Link
                    href={`/materials/${item.productId}/`}
                    className="pressure-action small"
                    aria-label={`Escalate ${item.productName}`}
                  >
                    Escalate
                  </Link>
                </span>
                <span className="pressure-track" aria-hidden="true">
                  <span className="pressure-bar" style={{ width: `${item.shortShare}%` }} />
                </span>
                <span className="small">
                  Short {item.shortage} of {item.required} {item.unit} ·{' '}
                  {item.visits === 1
                    ? `for your visit on ${formatDate(item.firstNeeded)}`
                    : `for ${item.visits} visits, the first on ${formatDate(item.firstNeeded)}`}
                </span>
              </li>
            ))}
          </ol>
          {hidden > 0 && <p className="muted small">And {hidden} more on your visits.</p>}
        </>
      )}
    </section>
  );
}

export function OverviewPanel({ list, filter, onFilter }: FilterProps & { list: VisitList }) {
  const [chartsOpen, setChartsOpen] = useState(false);
  return (
    <>
      <StatTiles overview={list.overview} filter={filter} onFilter={onFilter} />
      <button
        type="button"
        className="charts-toggle secondary"
        aria-expanded={chartsOpen}
        aria-controls="chart-panels"
        onClick={() => setChartsOpen((open) => !open)}
      >
        {chartsOpen ? 'Hide breakdown and materials' : 'Show breakdown and materials'}
      </button>
      <div id="chart-panels" className="chart-panels" data-open={chartsOpen}>
        <ReadinessBreakdown list={list} filter={filter} onFilter={onFilter} />
        <MaterialsToChase overview={list.overview} />
      </div>
    </>
  );
}

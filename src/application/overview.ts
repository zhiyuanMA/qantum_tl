import { addDays, daysBetween, isWeekend, startOfWeek } from '@/domain/dates';
import { severity } from '@/domain/readiness';
import type { ISODate, MaterialLine, ReadinessState } from '@/domain/types';
import type { VisitRow } from './readiness-service';

export type AttentionBucket = 'ACTION' | 'WATCH' | 'READY';

export type VisitFilter =
  | { kind: 'BUCKET'; bucket: AttentionBucket }
  | { kind: 'STATE'; state: ReadinessState }
  | null;

const BUCKET_LABELS: Record<AttentionBucket, string> = {
  ACTION: 'Needs action',
  WATCH: 'Keep an eye on',
  READY: 'Ready to go',
};

const STATE_NOUNS: Record<ReadinessState, string> = {
  SHORT: 'short',
  STOCK_CONFLICT: 'stock conflict',
  NEEDS_DATA_REVIEW: 'data review',
  DEPENDS_ON_DELIVERY: 'on delivery',
  NO_PRODUCTS_LISTED: 'no products listed',
  READY: 'covered on the current plan',
};

const SEGMENT_ORDER: ReadinessState[] = [
  'SHORT',
  'STOCK_CONFLICT',
  'NEEDS_DATA_REVIEW',
  'DEPENDS_ON_DELIVERY',
  'NO_PRODUCTS_LISTED',
  'READY',
];

/** No products listed is unconfirmed, so it is watched rather than counted as ready. */
export function bucketOf(state: ReadinessState): AttentionBucket {
  if (state === 'READY') return 'READY';
  return state === 'DEPENDS_ON_DELIVERY' || state === 'NO_PRODUCTS_LISTED' ? 'WATCH' : 'ACTION';
}

export function matchesFilter(row: VisitRow, filter: VisitFilter): boolean {
  if (!filter) return true;
  return filter.kind === 'BUCKET' ? bucketOf(row.state) === filter.bucket : row.state === filter.state;
}

export function relativeDay(date: ISODate, today: ISODate): string {
  const days = daysBetween(today, date);
  if (days === 0) return 'Today';
  return days === 1 ? 'Tomorrow' : `In ${days} days`;
}

export interface MaterialPressure {
  productId: string;
  productName: string;
  visits: number;
  required: number;
  shortage: number;
  /** Share of this leader's demand that is short. Comparable across products with different units. */
  shortShare: number;
  unit: string | null;
  firstNeeded: ISODate;
}

export interface VisitLines {
  plannedDate: ISODate;
  lines: MaterialLine[];
}

export interface VisitOverview {
  total: number;
  summary: string;
  buckets: { bucket: AttentionBucket; label: string; count: number; detail: string }[];
  segments: { state: ReadinessState; count: number; share: number }[];
  nextAction: (VisitRow & { when: string }) | null;
  allEscalated: boolean;
  materials: MaterialPressure[];
}

function summaryOf(total: number, action: number): string {
  if (total === 0) return 'No visits in this period';
  if (action === 0) return 'Nothing needs action in this period';
  return `${action} of ${total} visits ${action === 1 ? 'needs' : 'need'} action`;
}

function materialPressure(visits: VisitLines[]): MaterialPressure[] {
  const byProduct = new Map<string, MaterialPressure>();
  const countedConflicts = new Set<string>();
  const lines = visits.flatMap(({ plannedDate, lines: items }) => items.map((line) => ({ line, plannedDate })));

  for (const { line, plannedDate } of lines) {
    if (line.status !== 'SHORT' && line.status !== 'CONFLICT') continue;
    const entry = byProduct.get(line.productId) ?? {
      productId: line.productId,
      productName: line.productName,
      visits: 0,
      required: 0,
      shortage: 0,
      shortShare: 0,
      unit: line.unit,
      firstNeeded: plannedDate,
    };
    entry.visits += 1;
    entry.required += line.required ?? 0;
    if (plannedDate < entry.firstNeeded) entry.firstNeeded = plannedDate;

    // Every visit in a conflict reports the same shared shortfall, so it is added once.
    const conflictKey = line.conflict ? `${line.productId}|${line.conflict.visitIds.join()}` : null;
    if (!conflictKey || !countedConflicts.has(conflictKey)) entry.shortage += line.shortage;
    if (conflictKey) countedConflicts.add(conflictKey);

    byProduct.set(line.productId, entry);
  }

  return [...byProduct.values()]
    .map((item) => ({ ...item, shortShare: Math.min(Math.round((item.shortage / item.required) * 100), 100) }))
    .sort(
      (a, b) =>
        a.firstNeeded.localeCompare(b.firstNeeded) ||
        b.shortShare - a.shortShare ||
        a.productId.localeCompare(b.productId),
    );
}

export function buildOverview(rows: VisitRow[], visits: VisitLines[], today: ISODate): VisitOverview {
  const countOf = (state: ReadinessState) => rows.filter((row) => row.state === state).length;
  const escalated = rows.filter((row) => row.escalation?.level === 'FULL').length;
  const escalatedIn = (bucket: AttentionBucket, level: 'FULL' | 'PARTIAL') =>
    rows.filter((row) => bucketOf(row.state) === bucket && row.escalation?.level === level).length;

  const buckets = (Object.keys(BUCKET_LABELS) as AttentionBucket[]).map((bucket) => ({
    bucket,
    label: BUCKET_LABELS[bucket],
    count: rows.filter((row) => bucketOf(row.state) === bucket).length,
    detail: [
      ...SEGMENT_ORDER.filter((state) => bucketOf(state) === bucket && countOf(state) > 0).map(
        (state) => `${countOf(state)} ${STATE_NOUNS[state]}`,
      ),
      ...(bucket !== 'READY' && escalatedIn(bucket, 'FULL') > 0 ? [`${escalatedIn(bucket, 'FULL')} escalated`] : []),
      ...(bucket !== 'READY' && escalatedIn(bucket, 'PARTIAL') > 0
        ? [`${escalatedIn(bucket, 'PARTIAL')} partly escalated`]
        : []),
    ].join(', '),
  }));

  // A fully escalated visit still needs action, but the leader has already raised everything on it.
  const next = rows.find((row) => bucketOf(row.state) === 'ACTION' && row.escalation?.level !== 'FULL');

  return {
    total: rows.length,
    summary: summaryOf(rows.length, buckets[0]?.count ?? 0),
    buckets,
    segments: SEGMENT_ORDER.filter((state) => countOf(state) > 0).map((state) => ({
      state,
      count: countOf(state),
      share: Math.round((countOf(state) / rows.length) * 100),
    })),
    nextAction: next ? { ...next, when: relativeDay(next.plannedDate, today) } : null,
    allEscalated: escalated > 0 && !next,
    materials: materialPressure(visits),
  };
}

export interface TodayView {
  summary: string;
  rows: VisitRow[];
  /** The next day with visits, shown when there are none today. */
  next: { date: ISODate; when: string; rows: VisitRow[] } | null;
}

const bySeverity = (a: VisitRow, b: VisitRow) => severity(a.state) - severity(b.state) || a.id.localeCompare(b.id);

function todaySummary(rows: VisitRow[]): string {
  if (rows.length === 0) return 'No visits today';
  const visits = `${rows.length} ${rows.length === 1 ? 'visit' : 'visits'} today`;
  const action = rows.filter((row) => bucketOf(row.state) === 'ACTION').length;
  if (action > 0) return `${visits}, ${action} ${action === 1 ? 'needs' : 'need'} action`;
  if (rows.every((row) => row.state === 'READY')) return `${visits}, ${rows.length === 1 ? 'ready' : 'all ready'}`;
  return `${visits}, none needs action`;
}

export function buildToday(rows: VisitRow[], today: ISODate): TodayView {
  const todays = rows.filter((row) => row.plannedDate === today).sort(bySeverity);
  const nextDate = todays.length === 0 ? rows.map((row) => row.plannedDate).filter((date) => date > today).sort()[0] : undefined;
  return {
    summary: todaySummary(todays),
    rows: todays,
    next: nextDate
      ? {
          date: nextDate,
          when: relativeDay(nextDate, today),
          rows: rows.filter((row) => row.plannedDate === nextDate).sort(bySeverity),
        }
      : null,
  };
}

export interface CalendarDay {
  date: ISODate;
  isToday: boolean;
  inHorizon: boolean;
  rows: VisitRow[];
}

export interface VisitCalendar {
  showWeekends: boolean;
  weeks: { start: ISODate; days: CalendarDay[] }[];
}

export function buildCalendar(rows: VisitRow[], today: ISODate, horizonDays: number): VisitCalendar {
  const lastDay = addDays(today, horizonDays);
  const showWeekends = isWeekend(today) || rows.some((row) => isWeekend(row.plannedDate));
  const weeks: VisitCalendar['weeks'] = [];

  for (let start = startOfWeek(today); start <= lastDay; start = addDays(start, 7)) {
    const days = Array.from({ length: 7 }, (_, index) => addDays(start, index))
      .filter((date) => showWeekends || !isWeekend(date))
      .map((date) => ({
        date,
        isToday: date === today,
        inHorizon: date >= today && date <= lastDay,
        rows: rows.filter((row) => row.plannedDate === date),
      }));
    weeks.push({ start, days });
  }

  return { showWeekends, weeks };
}

import { describe, expect, it } from 'vitest';
import type { MaterialLine, ReadinessState } from '@/domain/types';
import { bucketOf, buildCalendar, buildOverview, buildToday, matchesFilter, relativeDay } from './overview';
import type { VisitRow } from './readiness-service';

const row = (id: string, plannedDate: string, state: ReadinessState): VisitRow => ({
  id,
  plannedDate,
  siteName: `Site ${id}`,
  teamName: 'Team North',
  state,
  stateLabel: state,
  headline: `Headline ${id}`,
  escalation: null,
});

const escalated = (item: VisitRow, level: 'FULL' | 'PARTIAL' = 'FULL'): VisitRow => ({
  ...item,
  escalation: { level, escalated: level === 'FULL' ? 2 : 1, total: 2 },
});

const line = (overrides: Partial<MaterialLine>): MaterialLine => ({
  status: 'SHORT',
  required: 10,
  reserved: 0,
  fromStock: 0,
  fromInbound: 0,
  shortage: 5,
  takenBy: [],
  conflict: null,
  reviewReasons: [],
  productId: 'p',
  productName: 'Product P',
  unit: 'each',
  stockAsOf: null,
  affectedScenarioIds: [],
  countedDeliveries: [],
  uncountedDeliveries: [],
  ...overrides,
});

describe('bucketOf', () => {
  it.each<[ReadinessState, string]>([
    ['SHORT', 'ACTION'],
    ['STOCK_CONFLICT', 'ACTION'],
    ['NEEDS_DATA_REVIEW', 'ACTION'],
    ['DEPENDS_ON_DELIVERY', 'WATCH'],
    ['NO_PRODUCTS_LISTED', 'WATCH'],
    ['READY', 'READY'],
  ])('%s is %s', (state, bucket) => {
    expect(bucketOf(state)).toBe(bucket);
  });
});

describe('buildOverview', () => {
  const rows = [
    row('A', '2026-11-09', 'READY'),
    row('B', '2026-11-11', 'SHORT'),
    row('C', '2026-11-11', 'STOCK_CONFLICT'),
    row('D', '2026-11-12', 'DEPENDS_ON_DELIVERY'),
  ];

  it('AC15: counts every visit in exactly one bucket', () => {
    const { buckets, total } = buildOverview(rows, [], '2026-11-09');
    expect(total).toBe(4);
    expect(buckets.map((item) => [item.bucket, item.count])).toEqual([['ACTION', 2], ['WATCH', 1], ['READY', 1]]);
    expect(buckets.reduce((sum, item) => sum + item.count, 0)).toBe(total);
  });

  it('explains what makes up a bucket, leaving out empty states', () => {
    const { buckets } = buildOverview(rows, [], '2026-11-09');
    expect(buckets[0]?.detail).toBe('1 short, 1 stock conflict');
  });

  it('AC15: gives the earliest visit needing action', () => {
    expect(buildOverview(rows, [], '2026-11-09').nextAction).toMatchObject({ id: 'B', when: 'In 2 days' });
  });

  it('AC18: skips escalated visits for the next action and counts them', () => {
    const overview = buildOverview([escalated(rows[1]!), ...rows.filter((item) => item.id !== 'B')], [], '2026-11-09');
    expect(overview.nextAction?.id).toBe('C');
    expect(overview.buckets[0]).toMatchObject({ count: 2, detail: '1 short, 1 stock conflict, 1 escalated' });
  });

  it('AC18: a partly escalated visit stays next, and is counted separately', () => {
    const overview = buildOverview([escalated(rows[1]!, 'PARTIAL'), ...rows.filter((item) => item.id !== 'B')], [], '2026-11-09');
    expect(overview.nextAction?.id).toBe('B');
    expect(overview.buckets[0]?.detail).toBe('1 short, 1 stock conflict, 1 partly escalated');
  });

  it('AC18: says when every visit needing action is escalated', () => {
    const overview = buildOverview([escalated(rows[1]!)], [], '2026-11-09');
    expect(overview.nextAction).toBeNull();
    expect(overview.allEscalated).toBe(true);
  });

  it('says plainly when nothing needs action', () => {
    const overview = buildOverview([row('A', '2026-11-09', 'READY')], [], '2026-11-09');
    expect(overview.nextAction).toBeNull();
    expect(overview.summary).toBe('Nothing needs action in this period');
  });

  it('summarises the number needing action', () => {
    expect(buildOverview(rows, [], '2026-11-09').summary).toBe('2 of 4 visits need action');
    expect(buildOverview(rows.slice(0, 2), [], '2026-11-09').summary).toBe('1 of 2 visits needs action');
  });

  it('gives shares that omit empty states', () => {
    const { segments } = buildOverview(rows, [], '2026-11-09');
    expect(segments.map((item) => [item.state, item.share])).toEqual([
      ['SHORT', 25],
      ['STOCK_CONFLICT', 25],
      ['DEPENDS_ON_DELIVERY', 25],
      ['READY', 25],
    ]);
  });

  it('has no segments or shares when there are no visits', () => {
    const overview = buildOverview([], [], '2026-11-09');
    expect(overview.segments).toEqual([]);
    expect(overview.summary).toBe('No visits in this period');
  });

  const visit = (plannedDate: string, ...lines: MaterialLine[]) => ({ plannedDate, lines });

  it('ranks materials by the soonest need and adds their shortages', () => {
    const { materials } = buildOverview([], [
      visit('2026-11-12', line({ productId: 'x', productName: 'X', required: 100, shortage: 50 })),
      visit('2026-11-10', line({ productId: 'y', productName: 'Y', required: 10, shortage: 2 })),
      visit('2026-11-13', line({ productId: 'y', productName: 'Y', required: 10, shortage: 3 })),
    ], '2026-11-09');
    expect(materials).toEqual([
      { productId: 'y', productName: 'Y', visits: 2, required: 20, shortage: 5, shortShare: 25, unit: 'each', firstNeeded: '2026-11-10' },
      { productId: 'x', productName: 'X', visits: 1, required: 100, shortage: 50, shortShare: 50, unit: 'each', firstNeeded: '2026-11-12' },
    ]);
  });

  it('breaks a tie on date by the larger share short, across different units', () => {
    const { materials } = buildOverview([], [
      visit('2026-11-10', line({ productId: 'a', required: 100, shortage: 10, unit: 'each' })),
      visit('2026-11-10', line({ productId: 'b', required: 4, shortage: 2, unit: 'rolls' })),
    ], '2026-11-09');
    expect(materials.map((item) => item.productId)).toEqual(['b', 'a']);
  });

  it('ignores covered lines and lines needing review', () => {
    const { materials } = buildOverview([], [visit('2026-11-10', line({ status: 'COVERED', shortage: 0 }), line({ status: 'REVIEW', shortage: 0 }))], '2026-11-09');
    expect(materials).toEqual([]);
  });

  it('never reports more than all of the demand as short', () => {
    const contested = line({ status: 'CONFLICT', required: 5, shortage: 10, conflict: { visitIds: ['A', 'B'], totalRequired: 30, supply: 20 } });
    expect(buildOverview([], [visit('2026-11-10', contested)], '2026-11-09').materials[0]?.shortShare).toBe(100);
  });

  it('counts a shared conflict shortage once across the leader\'s visits', () => {
    const conflict = { visitIds: ['A', 'B'], totalRequired: 30, supply: 20 };
    const contested = line({ status: 'CONFLICT', shortage: 10, conflict });
    expect(
      buildOverview([], [visit('2026-11-10', contested), visit('2026-11-10', contested)], '2026-11-09').materials[0],
    ).toMatchObject({ visits: 2, shortage: 10 });
  });
});

describe('buildToday', () => {
  const rows = [
    row('A', '2026-11-09', 'READY'),
    row('B', '2026-11-09', 'SHORT'),
    row('C', '2026-11-11', 'DEPENDS_ON_DELIVERY'),
    row('D', '2026-11-11', 'READY'),
  ];

  it('AC22: lists today\'s visits, most severe first, and counts those needing action', () => {
    const today = buildToday(rows, '2026-11-09');
    expect(today.rows.map((item) => item.id)).toEqual(['B', 'A']);
    expect(today.summary).toBe('2 visits today, 1 needs action');
    expect(today.next).toBeNull();
  });

  it('AC22: with no visits today, shows the next day with visits', () => {
    const today = buildToday(rows, '2026-11-10');
    expect(today.rows).toEqual([]);
    expect(today.summary).toBe('No visits today');
    expect(today.next).toMatchObject({ date: '2026-11-11', when: 'Tomorrow' });
    expect(today.next?.rows.map((item) => item.id)).toEqual(['C', 'D']);
  });

  it('says when today is clear', () => {
    expect(buildToday([row('A', '2026-11-09', 'READY')], '2026-11-09').summary).toBe('1 visit today, ready');
    expect(buildToday([row('A', '2026-11-09', 'DEPENDS_ON_DELIVERY')], '2026-11-09').summary).toBe('1 visit today, none needs action');
  });

  it('has nothing next when no visits are planned', () => {
    expect(buildToday([], '2026-11-09')).toMatchObject({ rows: [], next: null, summary: 'No visits today' });
  });
});

describe('relativeDay', () => {
  it.each([
    ['2026-11-09', 'Today'],
    ['2026-11-10', 'Tomorrow'],
    ['2026-11-12', 'In 3 days'],
  ])('%s is %s', (date, label) => {
    expect(relativeDay(date, '2026-11-09')).toBe(label);
  });
});

describe('matchesFilter', () => {
  it('matches all, a bucket or a state', () => {
    const short = row('A', '2026-11-09', 'SHORT');
    expect(matchesFilter(short, null)).toBe(true);
    expect(matchesFilter(short, { kind: 'BUCKET', bucket: 'ACTION' })).toBe(true);
    expect(matchesFilter(short, { kind: 'BUCKET', bucket: 'READY' })).toBe(false);
    expect(matchesFilter(short, { kind: 'STATE', state: 'SHORT' })).toBe(true);
    expect(matchesFilter(short, { kind: 'STATE', state: 'READY' })).toBe(false);
  });
});

describe('buildCalendar', () => {
  it('AC16: covers the horizon in Monday-first weeks and places visits on their day', () => {
    const { weeks } = buildCalendar([row('A', '2026-11-11', 'SHORT')], '2026-11-09', 14);
    expect(weeks[0]?.days[0]?.date).toBe('2026-11-09');
    expect(weeks).toHaveLength(3);
    const day = weeks.flatMap((week) => week.days).find((item) => item.date === '2026-11-11');
    expect(day?.rows.map((item) => item.id)).toEqual(['A']);
  });

  it('marks today, and days outside the horizon', () => {
    const days = buildCalendar([], '2026-11-11', 14).weeks.flatMap((week) => week.days);
    expect(days.find((item) => item.date === '2026-11-11')?.isToday).toBe(true);
    expect(days.find((item) => item.date === '2026-11-10')?.inHorizon).toBe(false);
    expect(days.find((item) => item.date === '2026-11-25')?.inHorizon).toBe(true);
    expect(days.find((item) => item.date === '2026-11-26')?.inHorizon).toBe(false);
  });

  it('hides weekends with no visits on a working day', () => {
    const calendar = buildCalendar([], '2026-11-09', 14);
    expect(calendar.showWeekends).toBe(false);
    expect(calendar.weeks[0]?.days).toHaveLength(5);
  });

  it('AC16: always shows today, even on a weekend with no visits', () => {
    const calendar = buildCalendar([], '2026-11-07', 14); // Saturday
    expect(calendar.showWeekends).toBe(true);
    expect(calendar.weeks.flatMap((week) => week.days).find((day) => day.isToday)?.date).toBe('2026-11-07');
  });

  it('AC16: never hides a weekend visit', () => {
    const calendar = buildCalendar([row('A', '2026-11-14', 'READY')], '2026-11-09', 14);
    expect(calendar.showWeekends).toBe(true);
    expect(calendar.weeks[0]?.days).toHaveLength(7);
    expect(calendar.weeks[0]?.days[5]?.rows).toHaveLength(1);
  });
});

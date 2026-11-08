import { beforeAll, describe, expect, it } from 'vitest';
import { createSampleProviders } from '@/adapters/sample-providers';
import { DEFAULT_CONFIG, type ReadinessState } from '@/domain/types';
import { createReadinessService, type ReadinessSnapshot } from './readiness-service';

const clock = { now: () => '2026-11-08T21:00:00Z' }; // Monday 9 Nov in Auckland
let snapshot: ReadinessSnapshot;

beforeAll(async () => {
  snapshot = await createReadinessService(createSampleProviders(clock, DEFAULT_CONFIG), DEFAULT_CONFIG).load();
});

const found = (leaderId: string, visitId: string) => {
  const result = snapshot.visitDetail(leaderId, visitId);
  if (result.status !== 'FOUND') throw new Error(result.status);
  return result.detail;
};

describe('sample scenarios', () => {
  it.each<[string, string, ReadinessState]>([
    ['leader-north', 'V-101', 'READY'],
    ['leader-north', 'V-102', 'READY'],
    ['leader-south', 'V-103', 'SHORT'],
    ['leader-north', 'V-104', 'STOCK_CONFLICT'],
    ['leader-south', 'V-105', 'STOCK_CONFLICT'],
    ['leader-north', 'V-106', 'READY'],
    ['leader-south', 'V-107', 'SHORT'],
    ['leader-south', 'V-108', 'DEPENDS_ON_DELIVERY'],
    ['leader-north', 'V-109', 'SHORT'],
    ['leader-north', 'V-110', 'SHORT'],
    ['leader-north', 'V-111', 'SHORT'],
    ['leader-east', 'V-112', 'NEEDS_DATA_REVIEW'],
    ['leader-east', 'V-113', 'NEEDS_DATA_REVIEW'],
    ['leader-east', 'V-114', 'READY'],
    ['leader-north', 'V-115', 'NO_PRODUCTS_LISTED'],
    ['leader-south', 'V-116', 'SHORT'],
  ])('%s sees %s as %s', (leaderId, visitId, state) => {
    expect(found(leaderId, visitId).state).toBe(state);
  });
});

describe('visit list', () => {
  it('shows only the selected leader\'s teams', () => {
    const { rows } = snapshot.visitList('leader-south');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.teamName === 'Team South')).toBe(true);
  });

  it('sorts by date, then severity, then ID', () => {
    const ids = snapshot.visitList('leader-south').rows.map((row) => row.id);
    expect(ids).toEqual(['V-105', 'V-103', 'V-107', 'V-108', 'V-116']);
  });

  it('counts each state', () => {
    const { counts } = snapshot.visitList('leader-east');
    expect(counts.find((item) => item.state === 'NEEDS_DATA_REVIEW')?.count).toBe(2);
    expect(counts.find((item) => item.state === 'READY')?.count).toBe(1);
    expect(counts).toHaveLength(6);
  });

  it('is empty for an unknown leader', () => {
    expect(snapshot.visitList('nobody').rows).toEqual([]);
  });
});

describe('visit detail', () => {
  it('AC1: names the other team visit that took the stock', () => {
    const line = found('leader-south', 'V-103').lines.find((item) => item.status === 'SHORT');
    expect(line?.shortage).toBe(10);
    expect(line?.takenBy[0]?.label).toContain('Team North');
  });

  it('AC3: shows stock reserved for the other team', () => {
    const line = found('leader-south', 'V-107').lines.find((item) => item.status === 'SHORT');
    expect(line?.takenBy).toContainEqual(expect.objectContaining({ kind: 'Reserved', quantity: 15 }));
  });

  it('AC4: shows all four lines when one product is short', () => {
    const detail = found('leader-north', 'V-111');
    expect(detail.lines).toHaveLength(4);
    expect(detail.lines.filter((item) => item.status === 'SHORT')).toHaveLength(1);
  });

  it('names a product that depends on delivery on a short visit', () => {
    expect(found('leader-north', 'V-111').otherRisks).toEqual([expect.stringMatching(/SERVOWRAP.*depends on delivery$/)]);
  });

  it('AC6: an unconfirmed delivery is shown and not counted', () => {
    const line = found('leader-north', 'V-109').lines.find((item) => item.status === 'SHORT');
    expect(line?.uncountedDeliveries).toHaveLength(1);
    expect(line?.uncountedDeliveries[0]?.confirmed).toBe(false);
  });

  it('AC7: stale stock raises a warning', () => {
    expect(found('leader-east', 'V-112').warnings.join()).toContain('30 hours');
  });

  it('AC9: the deliberate usage gap leaves the quantity unknown', () => {
    expect(found('leader-east', 'V-113').lines.some((item) => item.required === null)).toBe(true);
  });

  it('AC10: a mixed visit keeps the zero-product scenario without an error', () => {
    const detail = found('leader-north', 'V-101');
    expect(detail.scenarios.map((item) => item.impact)).toContain('NO_PRODUCTS');
    expect(detail.warnings).toEqual([]);
  });

  it('offers the approved sample alternative with stock checked', () => {
    expect(found('leader-north', 'V-110').alternatives).toContainEqual(
      expect.objectContaining({ kind: 'APPROVED_SAMPLE', stockSufficient: true }),
    );
  });

  it('AC11: shows an unapproved match as a candidate and keeps the visit short', () => {
    const detail = found('leader-south', 'V-116');
    expect(detail.alternatives).toContainEqual(expect.objectContaining({ kind: 'CATALOGUE_CANDIDATE', approval: null }));
    expect(detail.state).toBe('SHORT');
  });

  it('allows escalation only when there is a problem to raise', () => {
    expect(found('leader-south', 'V-103').canEscalate).toBe(true);
    expect(found('leader-north', 'V-101').canEscalate).toBe(false);
    expect(found('leader-south', 'V-108').canEscalate).toBe(true);
    expect(found('leader-north', 'V-115').canEscalate).toBe(false);
  });

  it('refuses another team\'s visit and an unknown visit', () => {
    expect(snapshot.visitDetail('leader-east', 'V-101')).toEqual({ status: 'OTHER_TEAM', teamName: 'Team North' });
    expect(snapshot.visitDetail('leader-east', 'V-999')).toEqual({ status: 'NOT_FOUND' });
  });
});

describe('today', () => {
  it('AC22: shows today\'s visits for the leader', () => {
    expect(snapshot.visitList('leader-north').todayVisits.rows.map((row) => row.id)).toEqual(['V-101']);
    expect(snapshot.visitList('leader-east').todayVisits.summary).toBe('1 visit today, 1 needs action');
  });

  it('AC22: points to the next visits when there are none today', () => {
    const { todayVisits } = snapshot.visitList('leader-south');
    expect(todayVisits.rows).toEqual([]);
    expect(todayVisits.next?.rows.map((row) => row.id)).toEqual(['V-105']);
  });
});

describe('overview', () => {
  it('AC15: buckets the sample visits', () => {
    const { overview } = snapshot.visitList('leader-north');
    expect(overview.buckets.map((item) => item.count)).toEqual([4, 1, 3]);
    expect(overview.nextAction?.id).toBe('V-104');
  });

  it('names the materials behind the shortages', () => {
    const { overview } = snapshot.visitList('leader-south');
    expect(overview.materials[0]?.productName).toContain('110mm');
    const collar = overview.materials.find((item) => item.productName.includes('55mm'));
    expect(collar).toMatchObject({ visits: 2, required: 21, shortage: 16 });
  });

  it('AC16: places every visit on the calendar', () => {
    const { calendar, rows } = snapshot.visitList('leader-north');
    expect(calendar.weeks.flatMap((week) => week.days).flatMap((day) => day.rows)).toHaveLength(rows.length);
  });
});

describe('escalation composer', () => {
  const composer = (leaderId: string, visitId: string, escalations = {}) => {
    const result = snapshot.composer(leaderId, { kind: 'VISIT', visitId }, escalations);
    if (!result) throw new Error('No composer');
    return result;
  };

  it('lists each problem product with the requests that fit it', () => {
    const result = composer('leader-north', 'V-111');
    expect(result.items.map((item) => [item.context, item.requests])).toEqual([
      ['Short by 2 rolls', ['EXPEDITE_SUPPLY']],
      ['Needs 2 rolls from a delivery', ['CONFIRM_DELIVERY']],
    ]);
    expect(result.requests.map((item) => item.value)).toEqual(['EXPEDITE_SUPPLY', 'CONFIRM_DELIVERY']);
    expect(result.defaultRequest).toBe('EXPEDITE_SUPPLY');
  });

  it('offers an alternative review where an alternative exists', () => {
    expect(composer('leader-north', 'V-110').requests.map((item) => item.value)).toContain('REVIEW_ALTERNATIVE');
  });

  it('defaults to confirm delivery on a visit that depends on one', () => {
    expect(composer('leader-south', 'V-108').defaultRequest).toBe('CONFIRM_DELIVERY');
  });

  it('has nothing to escalate on a ready visit, or on another team\'s visit', () => {
    expect(snapshot.composer('leader-north', { kind: 'VISIT', visitId: 'V-101' })).toBeNull();
    expect(snapshot.composer('leader-north', { kind: 'VISIT', visitId: 'V-103' })).toBeNull();
  });

  it('AC19: gathers one product across the leader\'s visits', () => {
    const productId = found('leader-south', 'V-103').lines.find((line) => line.status === 'SHORT')!.productId;
    const result = snapshot.composer('leader-south', { kind: 'PRODUCT', productId });
    expect(result?.title).toContain('55mm');
    expect(result?.items.map((item) => item.label.slice(0, 5))).toEqual(['V-103', 'V-116']);
    const { subject, body } = snapshot.escalation('leader-south', result!.items.map((item) => item.key), 'EXPEDITE_SUPPLY', '');
    expect(subject).toMatch(/^Expedite supply: FIRECO SL COLLAR 55mm Retrofit Collar for 2 visits$/);
    expect(body.match(/Please get/g)).toHaveLength(2);
  });

  it('has nothing to escalate for a product with no problems on the leader\'s visits', () => {
    expect(snapshot.composer('leader-east', { kind: 'PRODUCT', productId: 'nothing' })).toBeNull();
  });
});

describe('escalation marks', () => {
  const keysOf = (leaderId: string, visitId: string) =>
    snapshot.composer(leaderId, { kind: 'VISIT', visitId })!.items.map((item) => item.key);
  const mark = (key: string) => {
    const [visitId = '', productId = ''] = key.split('|');
    return { visitId, productId: productId === '*' ? null : productId, markedAt: '2026-11-09T01:00:00Z', request: 'EXPEDITE_SUPPLY' };
  };
  const marksFor = (keys: string[]) => Object.fromEntries(keys.map((key) => [key, mark(key)]));

  it('AC18: a visit is partly escalated until every problem product is marked', () => {
    const [short, delivery] = keysOf('leader-north', 'V-111');
    const row = (marks: Record<string, ReturnType<typeof mark>>) =>
      snapshot.visitList('leader-north', marks).rows.find((item) => item.id === 'V-111')?.escalation;
    expect(row(marksFor([short!]))).toEqual({ level: 'PARTIAL', escalated: 1, total: 2 });
    expect(row(marksFor([short!, delivery!]))).toEqual({ level: 'FULL', escalated: 2, total: 2 });
  });

  it('AC18: shows each mark on its material line', () => {
    const [short] = keysOf('leader-north', 'V-111');
    const detail = snapshot.visitDetail('leader-north', 'V-111', marksFor([short!]));
    if (detail.status !== 'FOUND') throw new Error();
    expect(detail.detail.lines.find((line) => line.status === 'SHORT')?.escalation).toEqual({
      markedAt: '2026-11-09T01:00:00Z',
      requestLabel: 'Expedite supply',
    });
    expect(detail.detail.lines.find((line) => line.status === 'DELIVERY')?.escalation).toBeNull();
  });

  it('AC18: ignores marks once the visit no longer needs escalation', () => {
    const marks = { 'V-102|x': mark('V-102|x') };
    expect(snapshot.visitList('leader-north', marks).rows.find((item) => item.id === 'V-102')?.escalation).toBeNull();
  });
});

describe('coverage', () => {
  it('splits a short line into covered and short parts', () => {
    const line = found('leader-south', 'V-103').lines.find((item) => item.status === 'SHORT');
    expect(line?.coverage.map((item) => [item.kind, item.quantity])).toEqual([['STOCK', 5], ['SHORT', 10]]);
  });

  it('shows a same-day conflict as contested, not covered', () => {
    const line = found('leader-north', 'V-104').lines.find((item) => item.status === 'CONFLICT');
    expect(line?.coverage.map((item) => item.kind)).toEqual(['CONTESTED']);
  });

  it('shows no bar when the quantity is unknown', () => {
    const line = found('leader-east', 'V-113').lines.find((item) => item.required === null);
    expect(line?.coverage).toEqual([]);
  });
});

describe('escalation', () => {
  it('AC12: matches what the screen shows', () => {
    const detail = found('leader-south', 'V-103');
    const keys = snapshot.composer('leader-south', { kind: 'VISIT', visitId: 'V-103' })!.items.map((item) => item.key);
    const { body } = snapshot.escalation('leader-south', keys, 'EXPEDITE_SUPPLY', '');
    expect(body).toContain(detail.siteName);
    expect(body).toContain(detail.headline);
    expect(body).toContain('South team leader');
    expect(body).toContain('stock as of 9 Nov 2026, 8:00 am');
    expect(body).toContain('to Central yard (shared by North and South) before Fri 13 Nov for V-103');
  });

  it('never includes another leader\'s visit, or an item that does not fit the request', () => {
    const keys = snapshot.composer('leader-north', { kind: 'VISIT', visitId: 'V-111' })!.items.map((item) => item.key);
    expect(snapshot.escalation('leader-south', keys, 'EXPEDITE_SUPPLY', '').body).toBe('Select at least one item to include.');
    expect(snapshot.escalation('leader-north', keys, 'CONFIRM_DELIVERY', '').body).not.toContain('Please get');
  });

});

describe('service failures', () => {
  it('fails to load when a source is invalid', async () => {
    const providers = createSampleProviders(clock, DEFAULT_CONFIG);
    providers.stock.getStock = () => Promise.reject(new Error('unavailable'));
    await expect(createReadinessService(providers, DEFAULT_CONFIG).load()).rejects.toThrow('unavailable');
  });
});

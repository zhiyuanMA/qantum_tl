import { describe, expect, it } from 'vitest';
import { assessPlan, severity, type PlanData } from './readiness';
import { baseData, NOW_CONFIG, solution } from './test-fixtures';
import type { ReadinessState } from './types';

const visit = (data: PlanData, id: string) => {
  const found = assessPlan(data, NOW_CONFIG).visits.find((item) => item.visit.id === id);
  if (!found) throw new Error(`No visit ${id}`);
  return found;
};

describe('assessPlan across teams', () => {
  it('AC1: a different team on an earlier date takes the stock', () => {
    const data = baseData();
    expect(visit(data, 'V1').state).toBe('READY');
    const south = visit(data, 'V2');
    expect(south.state).toBe('SHORT');
    expect(south.lines[0]).toMatchObject({ shortage: 10, takenBy: [{ visitId: 'V1', quantity: 15, kind: 'PLANNED' }] });
  });

  it('AC2: same-day visits conflict, and neither is ready', () => {
    const data = baseData();
    data.visits = data.visits.map((item) => ({ ...item, plannedDate: '2026-11-10' }));
    expect(visit(data, 'V1').state).toBe('STOCK_CONFLICT');
    expect(visit(data, 'V2').state).toBe('STOCK_CONFLICT');
    expect(visit(data, 'V1').headline).toContain('30');
    expect(visit(data, 'V1').headline).toContain('20');
  });

  it('AC3: reserved stock is unavailable to the other team', () => {
    const data = baseData({ reservations: [{ visitId: 'V2', stockPoolId: 'P1', productId: 'a', quantity: 15 }] });
    expect(visit(data, 'V1').state).toBe('SHORT');
    expect(visit(data, 'V2').state).toBe('READY');
  });

  it('keeps separate stock pools independent', () => {
    const data = baseData();
    data.visits[1] = { ...data.visits[1]!, stockPoolId: 'P2' };
    data.stock.push({ stockPoolId: 'P2', productId: 'a', quantity: 15, unit: 'each', asOf: data.stock[0]!.asOf });
    expect(visit(data, 'V2').state).toBe('READY');
  });

  it('recalculates from changed input with no retained state', () => {
    const data = baseData();
    expect(visit(data, 'V2').state).toBe('SHORT');
    expect(visit({ ...data, visits: data.visits.filter((item) => item.id !== 'V1') }, 'V2').state).toBe('READY');
  });

  it('ignores visits outside the horizon when allocating', () => {
    const data = baseData();
    data.visits[0] = { ...data.visits[0]!, plannedDate: '2026-11-01' };
    expect(assessPlan(data, NOW_CONFIG).visits.map((item) => item.visit.id)).toEqual(['V2']);
    expect(visit(data, 'V2').state).toBe('READY');
  });
});

describe('product requirements', () => {
  it('AC4: one short product among four makes the visit short and shows every line', () => {
    const data = baseData({
      visits: [baseData().visits[0]!],
      scenarios: [{ id: 'SC1', visitId: 'V1', solutionId: 'S2', penetrations: 5, location: 'Level 1' }],
    });
    data.stock[1] = { ...data.stock[1]!, quantity: 1 };
    const result = visit(data, 'V1');
    expect(result.state).toBe('SHORT');
    expect(result.lines).toHaveLength(4);
    expect(result.lines.filter((line) => line.status === 'SHORT').map((line) => line.productId)).toEqual(['b']);
  });

  it('adds usage across scenarios and rounds up once per visit', () => {
    const data = baseData({
      visits: [baseData().visits[0]!],
      usageRules: [{ solutionId: 'S1', productId: 'a', perPenetration: 0.1, unit: 'each' }],
      scenarios: [
        { id: 'SC1', visitId: 'V1', solutionId: 'S1', penetrations: 3, location: 'L1' },
        { id: 'SC2', visitId: 'V1', solutionId: 'S1', penetrations: 3, location: 'L2' },
        { id: 'SC3', visitId: 'V1', solutionId: 'S1', penetrations: 4, location: 'L3' },
      ],
    });
    expect(visit(data, 'V1').lines[0]?.required).toBe(1);
  });

  it('rounds a part unit up', () => {
    const data = baseData({
      visits: [baseData().visits[0]!],
      usageRules: [{ solutionId: 'S1', productId: 'a', perPenetration: 0.25, unit: 'each' }],
      scenarios: [{ id: 'SC1', visitId: 'V1', solutionId: 'S1', penetrations: 5, location: 'L1' }],
    });
    expect(visit(data, 'V1').lines[0]?.required).toBe(2);
  });

  it('marks only scenarios that use a short product as affected', () => {
    const data = baseData({
      visits: [baseData().visits[0]!],
      solutions: [solution('S1', ['a']), solution('S3', ['b'])],
      usageRules: [
        { solutionId: 'S1', productId: 'a', perPenetration: 30, unit: 'each' },
        { solutionId: 'S3', productId: 'b', perPenetration: 1, unit: 'each' },
      ],
      scenarios: [
        { id: 'SC1', visitId: 'V1', solutionId: 'S1', penetrations: 1, location: 'L1' },
        { id: 'SC2', visitId: 'V1', solutionId: 'S3', penetrations: 1, location: 'L2' },
      ],
    });
    expect(visit(data, 'V1').scenarios.map((item) => item.impact)).toEqual(['AFFECTED', 'CLEAR']);
  });
});

describe('zero products', () => {
  it('AC10: a zero-product solution is not an error and adds no demand', () => {
    const data = baseData({
      visits: [baseData().visits[0]!],
      scenarios: [{ id: 'SC1', visitId: 'V1', solutionId: 'S0', penetrations: 4, location: 'L1' }],
    });
    const result = visit(data, 'V1');
    expect(result.state).toBe('NO_PRODUCTS_LISTED');
    expect(result.headline).toBe('No products listed in catalogue');
    expect(result.lines).toEqual([]);
    expect(result.scenarios[0]?.impact).toBe('NO_PRODUCTS');
  });

  it('a mix uses the state of the scenarios with products', () => {
    const data = baseData({
      visits: [baseData().visits[0]!],
      scenarios: [
        { id: 'SC1', visitId: 'V1', solutionId: 'S0', penetrations: 4, location: 'L1' },
        { id: 'SC2', visitId: 'V1', solutionId: 'S1', penetrations: 1, location: 'L2' },
      ],
    });
    expect(visit(data, 'V1').state).toBe('READY');
  });
});

describe('uncertain data never gives Ready', () => {
  const single = (overrides: Partial<PlanData> = {}) => baseData({ visits: [baseData().visits[0]!], ...overrides });

  it('AC7: exactly at the stale limit is still usable', () => {
    const data = single();
    data.stock[0] = { ...data.stock[0]!, asOf: '2026-11-08T09:00:00+13:00' };
    expect(visit(data, 'V1').state).toBe('READY');
  });

  it('AC7: just past the stale limit needs review', () => {
    const data = single();
    data.stock[0] = { ...data.stock[0]!, asOf: '2026-11-08T08:59:00+13:00' };
    expect(visit(data, 'V1').state).toBe('NEEDS_DATA_REVIEW');
    expect(visit(data, 'V1').warnings[0]).toContain('Product A');
  });

  it('AC7: absent stock needs review', () => {
    const data = single({ stock: [] });
    expect(visit(data, 'V1').state).toBe('NEEDS_DATA_REVIEW');
  });

  it('AC9: a missing usage rule needs review and invents no quantity', () => {
    const data = single({ usageRules: [] });
    const result = visit(data, 'V1');
    expect(result.state).toBe('NEEDS_DATA_REVIEW');
    expect(result.lines[0]?.required).toBeNull();
  });

  it('AC9: a usage unit that differs from the stock unit needs review', () => {
    const data = single({ usageRules: [{ solutionId: 'S1', productId: 'a', perPenetration: 1, unit: 'ml' }] });
    expect(visit(data, 'V1').state).toBe('NEEDS_DATA_REVIEW');
    expect(visit(data, 'V1').lines[0]?.required).toBeNull();
  });

  it('AC9: usage units that differ between scenarios need review', () => {
    const data = single({
      solutions: [solution('S1', ['a']), solution('S3', ['a'])],
      usageRules: [
        { solutionId: 'S1', productId: 'a', perPenetration: 1, unit: 'each' },
        { solutionId: 'S3', productId: 'a', perPenetration: 1, unit: 'ml' },
      ],
      scenarios: [
        { id: 'SC1', visitId: 'V1', solutionId: 'S1', penetrations: 1, location: 'L1' },
        { id: 'SC2', visitId: 'V1', solutionId: 'S3', penetrations: 1, location: 'L2' },
      ],
    });
    expect(visit(data, 'V1').state).toBe('NEEDS_DATA_REVIEW');
  });

  it('an unknown solution needs review', () => {
    const data = single({ scenarios: [{ id: 'SC1', visitId: 'V1', solutionId: 'nope', penetrations: 1, location: 'L1' }] });
    expect(visit(data, 'V1').state).toBe('NEEDS_DATA_REVIEW');
  });

  it('a visit with no scenarios needs review, recorded as a visit problem', () => {
    const data = single({ scenarios: [] });
    expect(visit(data, 'V1').state).toBe('NEEDS_DATA_REVIEW');
    expect(visit(data, 'V1').visitProblems).toEqual(['No scenarios are planned for this visit']);
  });

  it('AC8: a known shortage outranks stale data, and the warning remains', () => {
    const data = single({
      solutions: [solution('S2', ['a', 'b'])],
      usageRules: [
        { solutionId: 'S2', productId: 'a', perPenetration: 30, unit: 'each' },
        { solutionId: 'S2', productId: 'b', perPenetration: 1, unit: 'each' },
      ],
      scenarios: [{ id: 'SC1', visitId: 'V1', solutionId: 'S2', penetrations: 1, location: 'L1' }],
    });
    data.stock[1] = { ...data.stock[1]!, asOf: '2026-11-01T00:00:00+13:00' };
    const result = visit(data, 'V1');
    expect(result.state).toBe('SHORT');
    expect(result.warnings.some((item) => item.includes('Product B'))).toBe(true);
  });
});

describe('other risks on a visit', () => {
  it('names products with a less severe problem than the visit state', () => {
    const data = baseData({
      visits: [baseData().visits[0]!],
      solutions: [solution('S2', ['a', 'b', 'c'])],
      usageRules: [
        { solutionId: 'S2', productId: 'a', perPenetration: 30, unit: 'each' },
        { solutionId: 'S2', productId: 'b', perPenetration: 25, unit: 'each' },
        { solutionId: 'S2', productId: 'c', perPenetration: 1, unit: 'each' },
      ],
      scenarios: [{ id: 'SC1', visitId: 'V1', solutionId: 'S2', penetrations: 1, location: 'L1' }],
      deliveries: [{ id: 'D1', stockPoolId: 'P1', productId: 'b', quantity: 10, expectedDate: '2026-11-09', confirmed: true }],
    });
    const result = visit(data, 'V1');
    expect(result.state).toBe('SHORT');
    expect(result.otherRisks).toEqual(['Product B depends on delivery']);
  });

  it('lists nothing when every other product is covered', () => {
    expect(visit(baseData(), 'V2').otherRisks).toEqual([]);
  });
});

describe('deliveries on a visit', () => {
  it('AC5: shows the delivery the visit depends on', () => {
    const data = baseData({
      visits: [baseData().visits[0]!],
      usageRules: [{ solutionId: 'S1', productId: 'a', perPenetration: 2, unit: 'each' }],
      deliveries: [{ id: 'D1', stockPoolId: 'P1', productId: 'a', quantity: 10, expectedDate: '2026-11-09', confirmed: true }],
    });
    const result = visit(data, 'V1');
    expect(result.state).toBe('DEPENDS_ON_DELIVERY');
    expect(result.headline).toContain('2026-11-09');
    expect(result.lines[0]?.countedDeliveries.map((item) => item.id)).toEqual(['D1']);
  });

  it('AC20: uses the configured delivery lead time for counted deliveries', () => {
    const data = baseData({
      visits: [baseData().visits[0]!],
      usageRules: [{ solutionId: 'S1', productId: 'a', perPenetration: 2, unit: 'each' }],
      deliveries: [{ id: 'D1', stockPoolId: 'P1', productId: 'a', quantity: 10, expectedDate: '2026-11-09', confirmed: true }],
    });
    const options = { ...NOW_CONFIG, config: { ...NOW_CONFIG.config, deliveryLeadDays: 2 } };
    const result = assessPlan(data, options).visits[0]!;
    expect(result.state).toBe('SHORT');
    expect(result.lines[0]?.uncountedDeliveries.map((item) => item.id)).toEqual(['D1']);
  });

  it('AC6: lists a delivery that does not count, without using it', () => {
    const data = baseData({
      visits: [baseData().visits[0]!],
      usageRules: [{ solutionId: 'S1', productId: 'a', perPenetration: 2, unit: 'each' }],
      deliveries: [{ id: 'D1', stockPoolId: 'P1', productId: 'a', quantity: 10, expectedDate: '2026-11-10', confirmed: true }],
    });
    const result = visit(data, 'V1');
    expect(result.state).toBe('SHORT');
    expect(result.lines[0]?.uncountedDeliveries.map((item) => item.id)).toEqual(['D1']);
  });
});

describe('severity', () => {
  it('orders states from most to least severe', () => {
    const order: ReadinessState[] = ['SHORT', 'STOCK_CONFLICT', 'NEEDS_DATA_REVIEW', 'DEPENDS_ON_DELIVERY', 'READY', 'NO_PRODUCTS_LISTED'];
    expect([...order].sort((a, b) => severity(b) - severity(a))).toEqual([...order].reverse());
    expect(order.map(severity)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

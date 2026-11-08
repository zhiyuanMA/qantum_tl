import { describe, expect, it } from 'vitest';
import catalogue from '@data/generated/catalogue.json';
import { findAlternatives, isCatalogueCandidate } from './alternatives';
import { assessPlan } from './readiness';
import { baseData, NOW_CONFIG, solution } from './test-fixtures';
import type { AlternativeApproval, Solution } from './types';

const real = (id: string) => catalogue.solutions.find((item) => item.id === id) as Solution;

describe('isCatalogueCandidate on supplied data', () => {
  it.each([['451', '464'], ['707', '708'], ['722', '724']])('accepts %s and %s', (a, b) => {
    expect(isCatalogueCandidate(real(a), real(b))).toBe(true);
  });

  it('rejects a pair with the same products, which gives no stock benefit', () => {
    expect(isCatalogueCandidate(real('733'), real('736'))).toBe(false);
  });

  it('rejects a pair with incomplete substrate detail', () => {
    expect(isCatalogueCandidate(real('944'), real('946'))).toBe(false);
  });
});

describe('isCatalogueCandidate rules', () => {
  const base = solution('A', ['a']);
  it.each([
    ['orientation', { orientation: 'Floor' }],
    ['substrate', { substrate: 'Concrete, wall' }],
    ['service type', { serviceType: 'PEX Pipe' }],
    ['size', { serviceSize: 'Ø40mm' }],
    ['integrity', { integrity: 120 }],
    ['insulation', { insulation: null }],
  ])('rejects a different %s', (_name, overrides) => {
    expect(isCatalogueCandidate(base, solution('B', ['b'], overrides))).toBe(false);
  });

  it('never matches a solution with itself', () => {
    expect(isCatalogueCandidate(base, base)).toBe(false);
  });
});

describe('findAlternatives', () => {
  const data = () => {
    const plan = baseData({
      visits: [baseData().visits[0]!],
      solutions: [solution('S1', ['a', 'c']), solution('ALT', ['b', 'c'])],
      usageRules: [
        { solutionId: 'S1', productId: 'a', perPenetration: 30, unit: 'each' },
        { solutionId: 'S1', productId: 'c', perPenetration: 1, unit: 'each' },
        { solutionId: 'ALT', productId: 'b', perPenetration: 1, unit: 'each' },
        { solutionId: 'ALT', productId: 'c', perPenetration: 1, unit: 'each' },
      ],
      scenarios: [{ id: 'SC1', visitId: 'V1', solutionId: 'S1', penetrations: 1, location: 'L1' }],
    });
    return plan;
  };
  const approval = (overrides: Partial<AlternativeApproval> = {}): AlternativeApproval => ({
    id: 'AP1',
    solutionId: 'S1',
    alternativeSolutionId: 'ALT',
    siteId: 'site-1',
    approver: 'Sample Fire Engineer',
    evidenceRef: 'SAMPLE-1',
    validUntil: '2026-12-31',
    ...overrides,
  });
  const options = (plan = data(), approvals: AlternativeApproval[] = [approval()]) => {
    const assessed = assessPlan(plan, NOW_CONFIG);
    return findAlternatives({
      assessment: assessed.visits[0]!,
      solutions: plan.solutions,
      products: plan.products,
      usageRules: plan.usageRules,
      approvals,
      freeSupply: assessed.freeSupply,
    });
  };

  it('offers an approved alternative with enough stock', () => {
    expect(options()).toMatchObject([{ kind: 'APPROVED_SAMPLE', stockSufficient: true, approval: { id: 'AP1' } }]);
  });

  it('AC11: without an approval, a match is only a candidate and the visit stays short', () => {
    const plan = data();
    expect(options(plan, [])[0]).toMatchObject({ kind: 'CATALOGUE_CANDIDATE', approval: null });
    expect(assessPlan(plan, NOW_CONFIG).visits[0]?.state).toBe('SHORT');
  });

  it('an approval for another site does not count', () => {
    expect(options(data(), [approval({ siteId: 'elsewhere' })])[0]?.kind).toBe('CATALOGUE_CANDIDATE');
  });

  it('an expired approval does not count', () => {
    expect(options(data(), [approval({ validUntil: '2026-11-09' })])[0]?.kind).toBe('CATALOGUE_CANDIDATE');
  });

  it('flags an approved alternative with too little stock', () => {
    const plan = data();
    plan.stock[1] = { ...plan.stock[1]!, quantity: 0 };
    expect(options(plan)[0]).toMatchObject({ kind: 'APPROVED_SAMPLE', stockSufficient: false });
  });

  it('counts only extra use of a product the original already uses', () => {
    const plan = data();
    plan.stock[2] = { ...plan.stock[2]!, quantity: 1 }; // product c is fully used by the original
    expect(options(plan)[0]?.stockSufficient).toBe(true);
  });

  it('does not offer stock from a product that is itself short on this visit', () => {
    const plan = data();
    plan.solutions[1] = solution('ALT', ['a']);
    plan.usageRules.push({ solutionId: 'ALT', productId: 'a', perPenetration: 1, unit: 'each' });
    expect(options(plan)[0]?.stockSufficient).toBe(false);
  });

  it('reports unknown sufficiency when the alternative has no usage rule', () => {
    const plan = data();
    plan.usageRules = plan.usageRules.filter((item) => !(item.solutionId === 'ALT' && item.productId === 'b'));
    expect(options(plan)[0]?.stockSufficient).toBeNull();
  });

  it('offers nothing for a scenario that is not affected', () => {
    const plan = data();
    plan.usageRules[0] = { ...plan.usageRules[0]!, perPenetration: 1 };
    expect(options(plan)).toEqual([]);
  });
});

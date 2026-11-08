import { describe, expect, it } from 'vitest';
import {
  buildEscalation,
  canEscalate,
  defaultRequest,
  itemKey,
  problemItems,
  requestsFor,
  type EscalationItem,
  type EscalationRequest,
} from './escalation';
import { assessPlan, type PlanData } from './readiness';
import { baseData, NOW_CONFIG, solution } from './test-fixtures';
import type { AlternativeOption, VisitAssessment } from './types';

const labels = {
  raisedBy: 'South team leader',
  visitLabel: (visitId: string) => (visitId === 'V1' ? 'V1 (Team North, 2026-11-10)' : visitId),
  formatInstant: (instant: string) => `at ${instant}`,
  formatDate: (date: string) => `on ${date}`,
};

const assess = (data: PlanData, id: string) => {
  const found = assessPlan(data, NOW_CONFIG).visits.find((item) => item.visit.id === id);
  if (!found) throw new Error(id);
  return found;
};

const items = (assessment: VisitAssessment, alternatives: AlternativeOption[] = []): EscalationItem[] =>
  problemItems(assessment).map(({ line }) => ({
    assessment,
    line,
    alternatives,
    siteName: 'Harbour Tower',
    teamName: 'Team South',
    stockPoolName: 'Central yard',
  }));

const message = (list: EscalationItem[], request: EscalationRequest, note = '') =>
  buildEscalation({ items: list.filter((item) => requestsFor(item).includes(request)), request, note, ...labels });

/** V1 is short of product A and depends on a delivery for product B. */
const mixed = () =>
  baseData({
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

const conflict = () => {
  const data = baseData();
  data.visits = data.visits.map((item) => ({ ...item, plannedDate: '2026-11-10' }));
  return data;
};

describe('canEscalate', () => {
  it.each([
    ['SHORT', true],
    ['STOCK_CONFLICT', true],
    ['NEEDS_DATA_REVIEW', true],
    ['DEPENDS_ON_DELIVERY', true],
    ['READY', false],
    ['NO_PRODUCTS_LISTED', false],
  ] as const)('%s gives %s', (state, expected) => {
    expect(canEscalate(state)).toBe(expected);
  });
});

describe('defaultRequest', () => {
  it('matches the problem', () => {
    expect(defaultRequest('SHORT')).toBe('EXPEDITE_SUPPLY');
    expect(defaultRequest('STOCK_CONFLICT')).toBe('CONFIRM_PRIORITY');
    expect(defaultRequest('NEEDS_DATA_REVIEW')).toBe('CORRECT_DATA');
    expect(defaultRequest('DEPENDS_ON_DELIVERY')).toBe('CONFIRM_DELIVERY');
  });
});

describe('problemItems', () => {
  it('lists one item per product with a problem, and none for covered products', () => {
    expect(problemItems(assess(mixed(), 'V1')).map((item) => [item.line?.productId, item.line?.status])).toEqual([
      ['a', 'SHORT'],
      ['b', 'DELIVERY'],
    ]);
  });

  it('adds a visit-level item for a problem with no product', () => {
    const assessment = assess(baseData({ scenarios: [] }), 'V1');
    expect(problemItems(assessment)).toEqual([{ line: null }]);
  });

  it('builds stable keys', () => {
    expect(itemKey('V1', 'a')).toBe('V1|a');
    expect(itemKey('V1', null)).toBe('V1|*');
  });
});

describe('requestsFor', () => {
  it('offers only requests that fit each product', () => {
    const [short, delivery] = items(assess(mixed(), 'V1'));
    expect(requestsFor(short!)).toEqual(['EXPEDITE_SUPPLY']);
    expect(requestsFor(delivery!)).toEqual(['CONFIRM_DELIVERY']);
    expect(requestsFor(items(assess(conflict(), 'V1'))[0]!)).toEqual(['CONFIRM_PRIORITY', 'EXPEDITE_SUPPLY']);
    expect(requestsFor(items(assess(baseData({ stock: [] }), 'V1'))[0]!)).toEqual(['CORRECT_DATA']);
  });

  it('offers an alternative review only when an alternative covers an affected scenario', () => {
    const assessment = assess(mixed(), 'V1');
    const option = (scenarioId: string) => ({ scenarioId }) as AlternativeOption;
    expect(requestsFor(items(assessment, [option('SC1')])[0]!)).toContain('REVIEW_ALTERNATIVE');
    expect(requestsFor(items(assessment, [option('other')])[0]!)).not.toContain('REVIEW_ALTERNATIVE');
  });
});

describe('buildEscalation', () => {
  it('AC21: expedite asks for the shortage, by the visit date, at the stock pool', () => {
    const { subject, body } = message(items(assess(mixed(), 'V1')), 'EXPEDITE_SUPPLY');
    expect(subject).toBe('Expedite supply: V1, Harbour Tower, on 2026-11-10');
    expect(body).toContain('What I need:\n- Please get 10 each of Product A to Central yard before on 2026-11-10 for V1 at Harbour Tower, or tell me when it can arrive.');
    expect(body).toContain('- Short: Product A: need 30, short by 10 each (stock as of at 2026-11-09T08:00:00+13:00)');
    expect(body).not.toContain('- Depends on delivery: Product B');
    expect(body).toContain('Also: Product B depends on delivery');
  });

  it('AC21: confirm delivery names the delivery and how much the visit relies on it', () => {
    const { body } = message(items(assess(mixed(), 'V1')), 'CONFIRM_DELIVERY');
    expect(body).toContain('Please confirm that 10 each of Product B due on 2026-11-09 will arrive before on 2026-11-10. V1 relies on 5 each from it.');
    expect(body).toContain('- Depends on delivery: Product B: need 25, 20 from stock and 5 from deliveries');
    expect(body).not.toContain('- Short: Product A');
  });

  it('AC21: confirm priority names every competing visit once', () => {
    const { body } = message(items(assess(conflict(), 'V1')), 'CONFIRM_PRIORITY');
    expect(body).toContain('- V1 (Team North, 2026-11-10) and V2 both need Product A on 2026-11-10: 30 needed, 20 available. Please decide which visit gets the stock.');
  });

  it('AC21: correct data lists the reasons', () => {
    const { body } = message(items(assess(baseData({ stock: [] }), 'V1')), 'CORRECT_DATA');
    expect(body).toContain('- Please correct the data for Product A on V1: No stock record.');
    expect(body).toContain('Data warnings:\n- Product A: No stock record');
  });

  it('AC21: correct data covers a visit-level problem', () => {
    const { body } = message(items(assess(baseData({ scenarios: [] }), 'V1')), 'CORRECT_DATA');
    expect(body).toContain('- Please correct the data for V1: No scenarios are planned for this visit.');
  });

  it('AC21: review alternative names each alternative, its approval and its stock', () => {
    const assessment = assess(mixed(), 'V1');
    const approved = {
      scenarioId: 'SC1',
      kind: 'APPROVED_SAMPLE',
      solution: solution('ALT', ['x']),
      approval: { id: 'AP', solutionId: 'S2', alternativeSolutionId: 'ALT', siteId: 's', approver: 'Sample engineer', evidenceRef: 'EV-1', validUntil: '2026-12-01' },
      materials: [],
      stockSufficient: true,
    } as AlternativeOption;
    const candidate = { ...approved, kind: 'CATALOGUE_CANDIDATE', approval: null, solution: solution('CAND', ['y']), stockSufficient: false } as AlternativeOption;
    const { body } = message(items(assessment, [approved, candidate]), 'REVIEW_ALTERNATIVE');
    expect(body).toContain('- Please review whether solution ALT can replace solution S2 for SC1 (L1) at Harbour Tower: approved for this site by Sample engineer until on 2026-12-01, evidence EV-1 (sample record); enough stock.');
    expect(body).toContain('- Please review whether solution CAND can replace solution S2 for SC1 (L1) at Harbour Tower: catalogue match only, not approved; not enough stock.');
  });

  it('AC19: one product across several visits gives one message with a section per visit', () => {
    const data = baseData();
    data.stock[0] = { ...data.stock[0]!, quantity: 5 };
    const list = ['V1', 'V2'].flatMap((id) => items(assess(data, id)));
    const { subject, body } = message(list, 'EXPEDITE_SUPPLY');
    expect(subject).toBe('Expedite supply: Product A for 2 visits');
    expect(body).toContain('Visit V1 (Team North, 2026-11-10)');
    expect(body).toContain('Visit V2');
    expect(body.match(/Please get/g)).toHaveLength(2);
  });

  it('AC12: includes scenarios, takers, deliveries and the sample data notice', () => {
    const { body } = message(items(assess(baseData(), 'V2')), 'EXPEDITE_SUPPLY');
    for (const text of ['Request: Expedite supply', 'Raised by: South team leader', 'SC2, Level 2: solution S1, 15 penetrations', 'Used first by V1 (Team North, 2026-11-10): 15 planned']) {
      expect(body).toContain(text);
    }
  });

  it('ends with the evidence or the note, with no sample data footer', () => {
    const { body } = message(items(assess(baseData(), 'V2')), 'EXPEDITE_SUPPLY');
    expect(body).not.toMatch(/sample data/i);
    expect(message(items(assess(baseData(), 'V2')), 'EXPEDITE_SUPPLY', 'Crew booked').body.endsWith('Note: Crew booked')).toBe(true);
  });

  it('includes the note only when one is given', () => {
    const list = items(assess(baseData(), 'V2'));
    expect(message(list, 'EXPEDITE_SUPPLY', 'Crew booked').body).toContain('Note: Crew booked');
    expect(message(list, 'EXPEDITE_SUPPLY', '  ').body).not.toContain('Note:');
  });

  it('asks for a selection when nothing is selected', () => {
    expect(buildEscalation({ items: [], request: 'EXPEDITE_SUPPLY', note: '', ...labels }).body).toBe(
      'Select at least one item to include.',
    );
  });
});

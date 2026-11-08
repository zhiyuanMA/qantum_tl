import type { PlanData } from './readiness';
import type { Solution } from './types';

export const NOW = '2026-11-09T09:00:00+13:00';
export const NOW_CONFIG = { now: NOW, config: { horizonDays: 14, staleAfterHours: 24, deliveryLeadDays: 1, timeZone: 'Pacific/Auckland' } };

export const solution = (id: string, productIds: string[], overrides: Partial<Solution> = {}): Solution => ({
  id,
  supplierRef: `REF-${id}`,
  supplier: 'FireCo',
  orientation: 'Wall',
  substrate: 'FR plasterboard, wall',
  substrateComplete: true,
  serviceClassification: 'Combustible Pipe',
  serviceType: 'PVC Pipe',
  serviceSize: 'Ø50mm',
  integrity: 60,
  insulation: 60,
  productIds,
  rawProducts: productIds.join(','),
  ...overrides,
});

const fresh = '2026-11-09T08:00:00+13:00';

/** Team North and Team South share pool P1. One product, A, with 20 in stock. */
export const baseData = (overrides: Partial<PlanData> = {}): PlanData => ({
  products: [
    { id: 'a', name: 'Product A' },
    { id: 'b', name: 'Product B' },
    { id: 'c', name: 'Product C' },
    { id: 'd', name: 'Product D' },
  ],
  solutions: [solution('S1', ['a']), solution('S2', ['a', 'b', 'c', 'd']), solution('S0', [])],
  visits: [
    { id: 'V1', siteId: 'site-1', teamId: 'north', stockPoolId: 'P1', plannedDate: '2026-11-10' },
    { id: 'V2', siteId: 'site-2', teamId: 'south', stockPoolId: 'P1', plannedDate: '2026-11-12' },
  ],
  scenarios: [
    { id: 'SC1', visitId: 'V1', solutionId: 'S1', penetrations: 15, location: 'Level 1' },
    { id: 'SC2', visitId: 'V2', solutionId: 'S1', penetrations: 15, location: 'Level 2' },
  ],
  usageRules: [
    { solutionId: 'S1', productId: 'a', perPenetration: 1, unit: 'each' },
    { solutionId: 'S2', productId: 'a', perPenetration: 1, unit: 'each' },
    { solutionId: 'S2', productId: 'b', perPenetration: 1, unit: 'each' },
    { solutionId: 'S2', productId: 'c', perPenetration: 1, unit: 'each' },
    { solutionId: 'S2', productId: 'd', perPenetration: 1, unit: 'each' },
  ],
  stock: ['a', 'b', 'c', 'd'].map((productId) => ({
    stockPoolId: 'P1',
    productId,
    quantity: 20,
    unit: 'each',
    asOf: fresh,
  })),
  deliveries: [],
  reservations: [],
  ...overrides,
});

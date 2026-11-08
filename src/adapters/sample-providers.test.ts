import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '@/domain/types';
import { bundledSources, createSampleProviders } from './sample-providers';

const clock = { now: () => '2026-11-06T21:00:00Z' }; // Saturday 7 Nov in Auckland
const providers = createSampleProviders(clock, DEFAULT_CONFIG);

describe('sample adapters', () => {
  it('every sample file declares itself as sample data', () => {
    for (const source of [bundledSources.plan, bundledSources.usage, bundledSources.stock, bundledSources.approvals]) {
      expect((source as { _notice: string })._notice).toMatch(/^SAMPLE DATA/);
    }
  });

  it('resolves offset 0 to today, and later offsets to working days', async () => {
    const { visits } = await providers.plan.getPlan();
    expect(visits.find((item) => item.id === 'V-101')?.plannedDate).toBe('2026-11-07');
    expect(visits.find((item) => item.id === 'V-102')?.plannedDate).toBe('2026-11-10');
    const later = visits.filter((item) => item.plannedDate !== '2026-11-07');
    expect(later.every((item) => ![0, 6].includes(new Date(`${item.plannedDate}T00:00:00Z`).getUTCDay()))).toBe(true);
  });

  it('resolves stock timestamps relative to the clock', async () => {
    const { balances } = await providers.stock.getStock();
    expect(balances[0]?.asOf).toBe('2026-11-06T19:00:00.000Z');
  });

  it('rejects malformed plan data', async () => {
    const bad = createSampleProviders(clock, DEFAULT_CONFIG, { ...bundledSources, plan: { visits: 'nope' } });
    await expect(bad.plan.getPlan()).rejects.toThrow();
  });

  it('rejects negative stock', async () => {
    const bad = createSampleProviders(clock, DEFAULT_CONFIG, {
      ...bundledSources,
      stock: { balances: [{ stockPoolId: 'p', productId: 'x', quantity: -1, unit: 'each', asOfHoursAgo: 1 }], deliveries: [], reservations: [] },
    });
    await expect(bad.stock.getStock()).rejects.toThrow();
  });

  it('sample data references only real catalogue records', async () => {
    const { solutions, products } = await providers.catalogue.getCatalogue();
    const solutionIds = new Set(solutions.map((item) => item.id));
    const productIds = new Set(products.map((item) => item.id));
    const plan = await providers.plan.getPlan();
    const usage = await providers.usage.getUsageRules();
    const stock = await providers.stock.getStock();
    const approvals = await providers.approvals.getApprovals();

    expect(plan.scenarios.every((item) => solutionIds.has(item.solutionId))).toBe(true);
    expect(usage.every((item) => solutionIds.has(item.solutionId) && productIds.has(item.productId))).toBe(true);
    expect(stock.balances.every((item) => productIds.has(item.productId))).toBe(true);
    expect(stock.deliveries.every((item) => productIds.has(item.productId))).toBe(true);
    expect(approvals.every((item) => solutionIds.has(item.solutionId) && solutionIds.has(item.alternativeSolutionId))).toBe(true);
    for (const rule of usage) {
      const solution = solutions.find((item) => item.id === rule.solutionId);
      expect(solution?.productIds).toContain(rule.productId);
    }
  });
});

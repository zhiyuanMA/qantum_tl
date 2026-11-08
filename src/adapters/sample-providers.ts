import { z } from 'zod';
import catalogueJson from '@data/generated/catalogue.json';
import approvalsJson from '@data/sample/approvals.json';
import planJson from '@data/sample/plan.json';
import stockJson from '@data/sample/stock.json';
import usageJson from '@data/sample/usage.json';
import { addBusinessDays, addDays, dateInZone } from '@/domain/dates';
import type { DomainConfig } from '@/domain/types';
import type { Clock, Providers } from '@/ports';

/**
 * SAMPLE DATA ADAPTERS. Everything except the catalogue is invented for this exercise.
 * Dates are stored as offsets from today so the public demo never goes stale.
 */
const id = z.string().min(1);

const namedSchema = z.object({ id, name: id });

export const planSchema = z.object({
  teams: z.array(namedSchema),
  leaders: z.array(namedSchema.extend({ teamIds: z.array(id).min(1) })),
  sites: z.array(namedSchema),
  stockPools: z.array(namedSchema),
  visits: z.array(
    z.object({ id, siteId: id, teamId: id, stockPoolId: id, plannedOffset: z.number().int().nonnegative() }),
  ),
  scenarios: z.array(
    z.object({ id, visitId: id, solutionId: id, penetrations: z.number().int().positive(), location: id }),
  ),
});

export const usageSchema = z.object({
  usageRules: z.array(
    z.object({ solutionId: id, productId: id, perPenetration: z.number().positive(), unit: id }),
  ),
});

export const stockSchema = z.object({
  balances: z.array(
    z.object({
      stockPoolId: id,
      productId: id,
      quantity: z.number().int().nonnegative(),
      unit: id,
      asOfHoursAgo: z.number().nonnegative(),
    }),
  ),
  deliveries: z.array(
    z.object({
      id,
      stockPoolId: id,
      productId: id,
      quantity: z.number().int().positive(),
      expectedOffset: z.number().int().nonnegative(),
      confirmed: z.boolean(),
    }),
  ),
  reservations: z.array(
    z.object({ visitId: id, stockPoolId: id, productId: id, quantity: z.number().int().positive() }),
  ),
});

export const approvalsSchema = z.object({
  approvals: z.array(
    z.object({
      id,
      solutionId: id,
      alternativeSolutionId: id,
      siteId: id,
      approver: id,
      evidenceRef: id,
      validForDays: z.number().int().positive(),
    }),
  ),
});

export const catalogueSchema = z.object({
  solutions: z.array(
    z.object({
      id,
      supplierRef: id,
      supplier: id,
      orientation: id,
      substrate: id,
      substrateComplete: z.boolean(),
      serviceClassification: id,
      serviceType: id,
      serviceSize: id,
      integrity: z.number().nullable(),
      insulation: z.number().nullable(),
      productIds: z.array(id),
      rawProducts: z.string(),
    }),
  ),
  products: z.array(namedSchema),
});

export interface SampleSources {
  plan: unknown;
  usage: unknown;
  stock: unknown;
  approvals: unknown;
  catalogue: unknown;
}

export const bundledSources: SampleSources = {
  plan: planJson,
  usage: usageJson,
  stock: stockJson,
  approvals: approvalsJson,
  catalogue: catalogueJson,
};

export function createSampleProviders(
  clock: Clock,
  config: DomainConfig,
  sources: SampleSources = bundledSources,
): Providers {
  const today = () => dateInZone(clock.now(), config.timeZone);
  const hoursAgo = (hours: number) => new Date(Date.parse(clock.now()) - hours * 3_600_000).toISOString();

  return {
    clock,
    catalogue: { getCatalogue: async () => catalogueSchema.parse(sources.catalogue) },
    usage: { getUsageRules: async () => usageSchema.parse(sources.usage).usageRules },
    plan: {
      getPlan: async () => {
        const { visits, ...rest } = planSchema.parse(sources.plan);
        return {
          ...rest,
          visits: visits.map(({ plannedOffset, ...visit }) => ({
            ...visit,
            plannedDate: addBusinessDays(today(), plannedOffset),
          })),
        };
      },
    },
    stock: {
      getStock: async () => {
        const { balances, deliveries, reservations } = stockSchema.parse(sources.stock);
        return {
          reservations,
          balances: balances.map(({ asOfHoursAgo, ...balance }) => ({ ...balance, asOf: hoursAgo(asOfHoursAgo) })),
          deliveries: deliveries.map(({ expectedOffset, ...delivery }) => ({
            ...delivery,
            expectedDate: addBusinessDays(today(), expectedOffset),
          })),
        };
      },
    },
    approvals: {
      getApprovals: async () =>
        approvalsSchema.parse(sources.approvals).approvals.map(({ validForDays, ...approval }) => ({
          ...approval,
          validUntil: addDays(today(), validForDays),
        })),
    },
  };
}

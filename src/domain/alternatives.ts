import { roundUp, type FreeSupply } from './readiness';
import type {
  AlternativeApproval,
  AlternativeMaterial,
  AlternativeOption,
  Product,
  Scenario,
  Solution,
  UsageRule,
  VisitAssessment,
} from './types';

const sameProducts = (a: Solution, b: Solution) =>
  a.productIds.length === b.productIds.length && a.productIds.every((id) => b.productIds.includes(id));

/**
 * A lead for a person to review, not evidence of suitability. Solutions 707 and 708 match on every
 * field here, come from one report, and still list different products.
 */
export function isCatalogueCandidate(original: Solution, other: Solution): boolean {
  return (
    original.id !== other.id &&
    original.substrateComplete &&
    other.substrateComplete &&
    original.orientation === other.orientation &&
    original.substrate === other.substrate &&
    original.serviceType === other.serviceType &&
    original.serviceSize === other.serviceSize &&
    original.integrity === other.integrity &&
    original.insulation === other.insulation &&
    !sameProducts(original, other)
  );
}

export interface FindAlternativesInput {
  assessment: VisitAssessment;
  solutions: Solution[];
  products: Product[];
  usageRules: UsageRule[];
  approvals: AlternativeApproval[];
  freeSupply: FreeSupply;
}

export function findAlternatives(input: FindAlternativesInput): AlternativeOption[] {
  const { assessment, solutions, products, usageRules, approvals, freeSupply } = input;
  const { visit } = assessment;
  const shortProducts = new Set(
    assessment.lines.filter((line) => line.status === 'SHORT' || line.status === 'CONFLICT').map((line) => line.productId),
  );
  const usage = (solutionId: string, productId: string) =>
    usageRules.find((item) => item.solutionId === solutionId && item.productId === productId);

  const materialsFor = (scenario: Scenario, original: Solution, alternative: Solution): AlternativeMaterial[] =>
    alternative.productIds.map((productId) => {
      const productName = products.find((item) => item.id === productId)?.name ?? productId;
      const rule = usage(alternative.id, productId);
      if (!rule) return { productId, productName, extraRequired: null, freeSupply: null, sufficient: null };

      const alreadyUsed = original.productIds.includes(productId)
        ? (usage(original.id, productId)?.perPenetration ?? 0) * scenario.penetrations
        : 0;
      const extraRequired = roundUp(Math.max(rule.perPenetration * scenario.penetrations - alreadyUsed, 0));
      const free = freeSupply(visit.stockPoolId, productId, visit.plannedDate);
      const sufficient = shortProducts.has(productId) ? false : free === null ? null : free >= extraRequired;
      return { productId, productName, extraRequired, freeSupply: free, sufficient };
    });

  const option = (
    scenario: Scenario,
    original: Solution,
    alternative: Solution,
    approval: AlternativeApproval | null,
  ): AlternativeOption => {
    const materials = materialsFor(scenario, original, alternative);
    return {
      scenarioId: scenario.id,
      kind: approval ? 'APPROVED_SAMPLE' : 'CATALOGUE_CANDIDATE',
      solution: alternative,
      approval,
      materials,
      stockSufficient: materials.some((item) => item.sufficient === false)
        ? false
        : materials.some((item) => item.sufficient === null)
          ? null
          : true,
    };
  };

  return assessment.scenarios
    .filter((item) => item.impact === 'AFFECTED' && item.solution)
    .flatMap(({ scenario, solution }) => {
      const original = solution as Solution;
      const valid = approvals.filter(
        (item) =>
          item.solutionId === original.id && item.siteId === visit.siteId && item.validUntil >= visit.plannedDate,
      );
      const approved = valid.flatMap((approval) => {
        const alternative = solutions.find((item) => item.id === approval.alternativeSolutionId);
        return alternative ? [option(scenario, original, alternative, approval)] : [];
      });
      const approvedIds = new Set(valid.map((item) => item.alternativeSolutionId));
      const candidates = solutions
        .filter((item) => isCatalogueCandidate(original, item) && !approvedIds.has(item.id))
        .map((item) => option(scenario, original, item, null));
      return [...approved, ...candidates];
    });
}

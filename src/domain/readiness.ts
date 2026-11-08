import { allocateProduct, freeSupplyOn, type AllocationInput, type Demand } from './allocation';
import { addDays, dateInZone, hoursBetween, isWithinHorizon } from './dates';
import type {
  Delivery,
  DomainConfig,
  Instant,
  ISODate,
  LineAllocation,
  LineStatus,
  MaterialLine,
  Product,
  ReadinessState,
  Reservation,
  Scenario,
  ScenarioAssessment,
  ScenarioImpact,
  Solution,
  StockBalance,
  UsageRule,
  Visit,
  VisitAssessment,
} from './types';

export interface PlanData {
  products: Product[];
  solutions: Solution[];
  visits: Visit[];
  scenarios: Scenario[];
  usageRules: UsageRule[];
  stock: StockBalance[];
  deliveries: Delivery[];
  reservations: Reservation[];
}

export interface AssessmentOptions {
  now: Instant;
  config: DomainConfig;
}

export type FreeSupply = (stockPoolId: string, productId: string, date: ISODate) => number | null;

export interface PlanAssessment {
  today: ISODate;
  visits: VisitAssessment[];
  freeSupply: FreeSupply;
}

const SEVERITY: Record<ReadinessState, number> = {
  SHORT: 1,
  STOCK_CONFLICT: 2,
  NEEDS_DATA_REVIEW: 3,
  DEPENDS_ON_DELIVERY: 4,
  READY: 5,
  NO_PRODUCTS_LISTED: 6,
};

export const severity = (state: ReadinessState) => SEVERITY[state];

const LINE_STATE: Record<LineStatus, ReadinessState> = {
  SHORT: 'SHORT',
  CONFLICT: 'STOCK_CONFLICT',
  REVIEW: 'NEEDS_DATA_REVIEW',
  DELIVERY: 'DEPENDS_ON_DELIVERY',
  COVERED: 'READY',
};

const RISK_PHRASES: Partial<Record<LineStatus, string>> = {
  SHORT: 'is short',
  CONFLICT: 'has a stock conflict',
  REVIEW: 'needs data review',
  DELIVERY: 'depends on delivery',
};

const key = (stockPoolId: string, productId: string) => `${stockPoolId}|${productId}`;

/** Removes floating-point noise such as 0.1 * 3, then rounds up to whole stock units. */
export const roundUp = (quantity: number) => Math.ceil(Number(quantity.toFixed(6)));

interface VisitDemand {
  required: number | null;
  unit: string | null;
  unknownReason?: string;
  scenarioIds: string[];
}

function demandFor(
  scenarios: { scenario: Scenario; solution: Solution }[],
  productId: string,
  usageRules: UsageRule[],
  stockUnit: string | undefined,
): VisitDemand {
  const using = scenarios.filter(({ solution }) => solution.productIds.includes(productId));
  const scenarioIds = using.map(({ scenario }) => scenario.id);
  const uses = using.map(({ scenario, solution }) => ({
    solution,
    penetrations: scenario.penetrations,
    rule: usageRules.find((item) => item.solutionId === solution.id && item.productId === productId),
  }));

  const missing = uses.find((item) => !item.rule);
  if (missing) {
    return { required: null, unit: stockUnit ?? null, unknownReason: `No usage rule for solution ${missing.solution.id}`, scenarioIds };
  }

  const units = new Set(uses.map((item) => item.rule?.unit));
  if (units.size > 1) {
    return { required: null, unit: stockUnit ?? null, unknownReason: 'Usage units differ between scenarios', scenarioIds };
  }

  const unit = [...units][0] ?? null;
  if (stockUnit && unit !== stockUnit) {
    return { required: null, unit: stockUnit, unknownReason: `Usage is in ${unit} but stock is in ${stockUnit}`, scenarioIds };
  }

  const total = uses.reduce((sum, item) => sum + item.penetrations * (item.rule?.perPenetration ?? 0), 0);
  return { required: roundUp(total), unit, scenarioIds };
}

function impactOf(solution: Solution | null, lines: MaterialLine[], scenarioId: string): ScenarioImpact {
  if (!solution) return 'AT_RISK';
  if (solution.productIds.length === 0) return 'NO_PRODUCTS';
  const statuses = lines.filter((line) => line.affectedScenarioIds.includes(scenarioId)).map((line) => line.status);
  if (statuses.some((status) => status === 'SHORT' || status === 'CONFLICT')) return 'AFFECTED';
  if (statuses.some((status) => status === 'REVIEW' || status === 'DELIVERY')) return 'AT_RISK';
  return 'CLEAR';
}

function headlineFor(state: ReadinessState, lines: MaterialLine[]): string {
  const matching = lines.filter((line) => LINE_STATE[line.status] === state);
  const first = matching[0];
  const more = matching.length > 1 ? ` and ${matching.length - 1} more` : '';
  switch (state) {
    case 'SHORT':
      return `Short by ${first?.shortage} ${first?.unit}: ${first?.productName}${more}`;
    case 'STOCK_CONFLICT':
      return `Stock conflict: ${first?.conflict?.totalRequired} needed, ${first?.conflict?.supply} available of ${first?.productName}${more}`;
    case 'NEEDS_DATA_REVIEW':
      return first ? `Needs data review: ${first.productName}${more}` : 'Needs data review';
    case 'DEPENDS_ON_DELIVERY':
      return `Depends on delivery: ${first?.productName} due ${first?.countedDeliveries.at(-1)?.expectedDate}${more}`;
    case 'READY':
      return 'All materials covered on the current plan';
    case 'NO_PRODUCTS_LISTED':
      return 'No products listed in catalogue';
  }
}

export function assessPlan(data: PlanData, { now, config }: AssessmentOptions): PlanAssessment {
  const today = dateInZone(now, config.timeZone);
  const solutions = new Map(data.solutions.map((item) => [item.id, item]));
  const productName = (id: string) => data.products.find((item) => item.id === id)?.name ?? id;
  const stockOf = (poolId: string, productId: string) =>
    data.stock.find((item) => item.stockPoolId === poolId && item.productId === productId);

  const visits = data.visits.filter((visit) => isWithinHorizon(visit.plannedDate, today, config.horizonDays));

  const scenariosOf = (visitId: string) =>
    data.scenarios
      .filter((scenario) => scenario.visitId === visitId)
      .map((scenario) => ({ scenario, solution: solutions.get(scenario.solutionId) ?? null }));

  const visitDemands = new Map<string, Map<string, VisitDemand>>();
  const poolDemands = new Map<string, Demand[]>();

  for (const visit of visits) {
    const known = scenariosOf(visit.id).filter(
      (item): item is { scenario: Scenario; solution: Solution } => item.solution !== null,
    );
    const productIds = [...new Set(known.flatMap(({ solution }) => solution.productIds))];
    const demands = new Map<string, VisitDemand>();
    for (const productId of productIds) {
      const demand = demandFor(known, productId, data.usageRules, stockOf(visit.stockPoolId, productId)?.unit);
      demands.set(productId, demand);
      const poolKey = key(visit.stockPoolId, productId);
      poolDemands.set(poolKey, [
        ...(poolDemands.get(poolKey) ?? []),
        { visitId: visit.id, plannedDate: visit.plannedDate, required: demand.required, unknownReason: demand.unknownReason },
      ]);
    }
    visitDemands.set(visit.id, demands);
  }

  const inputFor = (stockPoolId: string, productId: string): AllocationInput => {
    const balance = stockOf(stockPoolId, productId);
    const age = balance ? hoursBetween(balance.asOf, now) : 0;
    const stale = age > config.staleAfterHours;
    return {
      today,
      deliveryLeadDays: config.deliveryLeadDays,
      stock: balance && !stale ? balance.quantity : null,
      stockUnknownReason: !balance
        ? 'No stock record'
        : stale
          ? `Stock record is ${Math.round(age)} hours old (limit ${config.staleAfterHours})`
          : null,
      demands: poolDemands.get(key(stockPoolId, productId)) ?? [],
      reservations: data.reservations.filter((item) => item.stockPoolId === stockPoolId && item.productId === productId),
      deliveries: data.deliveries.filter((item) => item.stockPoolId === stockPoolId && item.productId === productId),
    };
  };

  const allocations = new Map<string, Map<string, LineAllocation>>();
  for (const poolKey of poolDemands.keys()) {
    const [poolId = '', productId = ''] = poolKey.split('|');
    allocations.set(poolKey, allocateProduct(inputFor(poolId, productId)).lines);
  }

  const assessed = visits.map((visit): VisitAssessment => {
    const scenarios = scenariosOf(visit.id);
    const demands = visitDemands.get(visit.id) as Map<string, VisitDemand>;

    const lines = [...demands.entries()].map(([productId, demand]): MaterialLine => {
      const allocation = allocations.get(key(visit.stockPoolId, productId))?.get(visit.id) as LineAllocation;
      const upcoming = data.deliveries.filter(
        (item) => item.stockPoolId === visit.stockPoolId && item.productId === productId && item.expectedDate >= today,
      );
      const counts = (item: Delivery) =>
        item.confirmed && item.expectedDate <= addDays(visit.plannedDate, -config.deliveryLeadDays);
      return {
        ...allocation,
        productId,
        productName: productName(productId),
        unit: stockOf(visit.stockPoolId, productId)?.unit ?? demand.unit,
        stockAsOf: stockOf(visit.stockPoolId, productId)?.asOf ?? null,
        affectedScenarioIds: demand.scenarioIds,
        countedDeliveries: upcoming.filter(counts).sort((a, b) => a.expectedDate.localeCompare(b.expectedDate)),
        uncountedDeliveries: upcoming.filter((item) => !counts(item)),
      };
    });

    const visitProblems = [
      ...(scenarios.length === 0 ? ['No scenarios are planned for this visit'] : []),
      ...scenarios
        .filter((item) => item.solution === null)
        .map((item) => `Solution ${item.scenario.solutionId} is not in the catalogue`),
    ];
    const warnings = [
      ...visitProblems,
      ...lines.flatMap((line) => line.reviewReasons.map((reason) => `${line.productName}: ${reason}`)),
    ];

    const states = lines.map((line) => LINE_STATE[line.status]);
    if (visitProblems.length > 0) states.push('NEEDS_DATA_REVIEW');
    const state = states.length
      ? states.reduce((worst, item) => (severity(item) < severity(worst) ? item : worst))
      : 'NO_PRODUCTS_LISTED';

    const scenarioResults: ScenarioAssessment[] = scenarios.map(({ scenario, solution }) => ({
      scenario,
      solution,
      impact: impactOf(solution, lines, scenario.id),
    }));

    const otherRisks = lines
      .filter((line) => line.status !== 'COVERED' && LINE_STATE[line.status] !== state)
      .sort((a, b) => severity(LINE_STATE[a.status]) - severity(LINE_STATE[b.status]))
      .map((line) => `${line.productName} ${RISK_PHRASES[line.status]}`);

    return {
      visit,
      state,
      headline: headlineFor(state, lines),
      otherRisks,
      visitProblems,
      warnings,
      lines,
      scenarios: scenarioResults,
    };
  });

  assessed.sort(
    (a, b) =>
      a.visit.plannedDate.localeCompare(b.visit.plannedDate) ||
      severity(a.state) - severity(b.state) ||
      a.visit.id.localeCompare(b.visit.id),
  );

  return {
    today,
    visits: assessed,
    freeSupply: (stockPoolId, productId, date) => freeSupplyOn(inputFor(stockPoolId, productId), date),
  };
}

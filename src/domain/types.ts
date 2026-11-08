export type ISODate = string; // YYYY-MM-DD in the configured time zone
export type Instant = string; // ISO 8601 timestamp with offset

export interface DomainConfig {
  horizonDays: number;
  staleAfterHours: number;
  /** A delivery counts only if it is expected at least this many days before the visit. */
  deliveryLeadDays: number;
  timeZone: string;
}

export const DEFAULT_CONFIG: DomainConfig = {
  horizonDays: 14,
  staleAfterHours: 24,
  deliveryLeadDays: 1,
  timeZone: 'Pacific/Auckland',
};

export interface Product {
  id: string;
  name: string;
}

export interface Solution {
  id: string;
  supplierRef: string;
  supplier: string;
  orientation: string;
  substrate: string;
  substrateComplete: boolean;
  serviceClassification: string;
  serviceType: string;
  serviceSize: string;
  integrity: number | null;
  insulation: number | null;
  productIds: string[];
  rawProducts: string;
}

export interface Team {
  id: string;
  name: string;
}

export interface Leader {
  id: string;
  name: string;
  teamIds: string[];
}

export interface Site {
  id: string;
  name: string;
}

export interface StockPool {
  id: string;
  name: string;
}

export interface Visit {
  id: string;
  siteId: string;
  teamId: string;
  stockPoolId: string;
  plannedDate: ISODate;
}

export interface Scenario {
  id: string;
  visitId: string;
  solutionId: string;
  penetrations: number;
  location: string;
}

/** Usage belongs to the solution and product pair: one product varies by solution. */
export interface UsageRule {
  solutionId: string;
  productId: string;
  perPenetration: number;
  unit: string;
}

export interface StockBalance {
  stockPoolId: string;
  productId: string;
  quantity: number;
  unit: string;
  asOf: Instant;
}

/** Quantities are in the product's stock unit. */
export interface Delivery {
  id: string;
  stockPoolId: string;
  productId: string;
  quantity: number;
  expectedDate: ISODate;
  confirmed: boolean;
}

/** Quantities are in the product's stock unit. */
export interface Reservation {
  visitId: string;
  stockPoolId: string;
  productId: string;
  quantity: number;
}

export interface AlternativeApproval {
  id: string;
  solutionId: string;
  alternativeSolutionId: string;
  siteId: string;
  approver: string;
  evidenceRef: string;
  validUntil: ISODate;
}

export type ReadinessState =
  | 'SHORT'
  | 'STOCK_CONFLICT'
  | 'NEEDS_DATA_REVIEW'
  | 'DEPENDS_ON_DELIVERY'
  | 'READY'
  | 'NO_PRODUCTS_LISTED';

export type LineStatus = 'COVERED' | 'DELIVERY' | 'SHORT' | 'CONFLICT' | 'REVIEW';

export interface StockTaker {
  visitId: string;
  quantity: number;
  kind: 'RESERVED' | 'PLANNED';
}

export interface ConflictDetail {
  visitIds: string[];
  totalRequired: number;
  supply: number;
}

export interface LineAllocation {
  status: LineStatus;
  required: number | null;
  reserved: number;
  fromStock: number;
  fromInbound: number;
  shortage: number;
  takenBy: StockTaker[];
  conflict: ConflictDetail | null;
  reviewReasons: string[];
}

export interface MaterialLine extends LineAllocation {
  productId: string;
  productName: string;
  unit: string | null;
  stockAsOf: Instant | null;
  affectedScenarioIds: string[];
  countedDeliveries: Delivery[];
  uncountedDeliveries: Delivery[];
}

export type ScenarioImpact = 'AFFECTED' | 'AT_RISK' | 'CLEAR' | 'NO_PRODUCTS';

export interface ScenarioAssessment {
  scenario: Scenario;
  solution: Solution | null;
  impact: ScenarioImpact;
}

export interface VisitAssessment {
  visit: Visit;
  state: ReadinessState;
  headline: string;
  /** Products with a less severe problem than the visit state, such as one that depends on delivery. */
  otherRisks: string[];
  /** Problems with the visit itself rather than a product, such as an unknown solution. */
  visitProblems: string[];
  warnings: string[];
  lines: MaterialLine[];
  scenarios: ScenarioAssessment[];
}

export type AlternativeKind = 'APPROVED_SAMPLE' | 'CATALOGUE_CANDIDATE';

export interface AlternativeMaterial {
  productId: string;
  productName: string;
  extraRequired: number | null;
  freeSupply: number | null;
  sufficient: boolean | null;
}

export interface AlternativeOption {
  scenarioId: string;
  kind: AlternativeKind;
  solution: Solution;
  approval: AlternativeApproval | null;
  materials: AlternativeMaterial[];
  stockSufficient: boolean | null;
}

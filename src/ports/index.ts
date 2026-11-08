import type {
  AlternativeApproval,
  Delivery,
  Instant,
  Leader,
  Product,
  Reservation,
  Scenario,
  Site,
  Solution,
  StockBalance,
  StockPool,
  Team,
  UsageRule,
  Visit,
} from '@/domain/types';

/** Application abstractions only. These are not QAntum APIs. */
export interface PlanSnapshot {
  teams: Team[];
  leaders: Leader[];
  sites: Site[];
  stockPools: StockPool[];
  visits: Visit[];
  scenarios: Scenario[];
}

export interface PlanProvider {
  getPlan(): Promise<PlanSnapshot>;
}

export interface CatalogueProvider {
  getCatalogue(): Promise<{ solutions: Solution[]; products: Product[] }>;
}

export interface UsageProvider {
  getUsageRules(): Promise<UsageRule[]>;
}

export interface StockSnapshot {
  balances: StockBalance[];
  deliveries: Delivery[];
  reservations: Reservation[];
}

export interface StockProvider {
  getStock(): Promise<StockSnapshot>;
}

export interface ApprovalProvider {
  getApprovals(): Promise<AlternativeApproval[]>;
}

export interface Clock {
  now(): Instant;
}

/** One escalated problem: a product on a visit, or the visit itself when productId is null. */
export interface EscalationMark {
  visitId: string;
  productId: string | null;
  markedAt: Instant;
  request: string;
}

/** A per-device convenience. Iteration 2 replaces it with a tracked, shared record. */
export interface EscalationMarks {
  list(): EscalationMark[];
  /** Replaces any mark for the same visit and product. Returns false when it could not be saved. */
  save(marks: EscalationMark[]): boolean;
  /** Returns false when the change could not be saved. */
  remove(visitId: string, productId: string | null): boolean;
}

export interface Providers {
  plan: PlanProvider;
  catalogue: CatalogueProvider;
  usage: UsageProvider;
  stock: StockProvider;
  approvals: ApprovalProvider;
  clock: Clock;
}

import type { AlternativeOption, ISODate, MaterialLine, ReadinessState, VisitAssessment } from './types';

export type EscalationRequest =
  | 'EXPEDITE_SUPPLY'
  | 'CONFIRM_PRIORITY'
  | 'CONFIRM_DELIVERY'
  | 'REVIEW_ALTERNATIVE'
  | 'CORRECT_DATA';

export const REQUEST_LABELS: Record<EscalationRequest, string> = {
  EXPEDITE_SUPPLY: 'Expedite supply',
  CONFIRM_PRIORITY: 'Confirm priority',
  CONFIRM_DELIVERY: 'Confirm delivery',
  REVIEW_ALTERNATIVE: 'Review an alternative solution',
  CORRECT_DATA: 'Correct the data',
};

export const REQUEST_ORDER = Object.keys(REQUEST_LABELS) as EscalationRequest[];

const ESCALATABLE: ReadinessState[] = ['SHORT', 'STOCK_CONFLICT', 'NEEDS_DATA_REVIEW', 'DEPENDS_ON_DELIVERY'];

export const canEscalate = (state: ReadinessState) => ESCALATABLE.includes(state);

const DEFAULT_REQUEST: Partial<Record<ReadinessState, EscalationRequest>> = {
  STOCK_CONFLICT: 'CONFIRM_PRIORITY',
  NEEDS_DATA_REVIEW: 'CORRECT_DATA',
  DEPENDS_ON_DELIVERY: 'CONFIRM_DELIVERY',
};

export const defaultRequest = (state: ReadinessState): EscalationRequest => DEFAULT_REQUEST[state] ?? 'EXPEDITE_SUPPLY';

/** One escalatable problem: a product on a visit, or the visit itself when no product is at fault. */
export interface ProblemItem {
  line: MaterialLine | null;
}

export const itemKey = (visitId: string, productId: string | null) => `${visitId}|${productId ?? '*'}`;

export function problemItems(assessment: VisitAssessment): ProblemItem[] {
  return [
    ...assessment.lines.filter((line) => line.status !== 'COVERED').map((line) => ({ line })),
    ...(assessment.visitProblems.length > 0 ? [{ line: null }] : []),
  ];
}

export interface EscalationItem extends ProblemItem {
  assessment: VisitAssessment;
  alternatives: AlternativeOption[];
  siteName: string;
  teamName: string;
  stockPoolName: string;
}

const alternativesFor = (item: EscalationItem) =>
  item.line ? item.alternatives.filter((option) => item.line?.affectedScenarioIds.includes(option.scenarioId)) : [];

export function requestsFor(item: EscalationItem): EscalationRequest[] {
  const review: EscalationRequest[] = alternativesFor(item).length > 0 ? ['REVIEW_ALTERNATIVE'] : [];
  switch (item.line?.status) {
    case 'SHORT':
      return ['EXPEDITE_SUPPLY', ...review];
    case 'CONFLICT':
      return ['CONFIRM_PRIORITY', 'EXPEDITE_SUPPLY', ...review];
    case 'DELIVERY':
      return ['CONFIRM_DELIVERY'];
    default:
      return ['CORRECT_DATA'];
  }
}

export interface EscalationInput {
  items: EscalationItem[];
  request: EscalationRequest;
  note: string;
  raisedBy: string;
  visitLabel: (visitId: string) => string;
  formatInstant: (instant: string) => string;
  formatDate: (date: ISODate) => string;
}

export interface EscalationMessage {
  subject: string;
  body: string;
}

const STATUS_LABELS: Record<MaterialLine['status'], string> = {
  SHORT: 'Short',
  CONFLICT: 'Stock conflict',
  DELIVERY: 'Depends on delivery',
  REVIEW: 'Needs data review',
  COVERED: 'Covered',
};

function outcomeOf(line: MaterialLine): string {
  switch (line.status) {
    case 'SHORT':
    case 'CONFLICT':
      return `short by ${line.shortage} ${line.unit}`;
    case 'DELIVERY':
      return `${line.reserved + line.fromStock} from stock and ${line.fromInbound} from deliveries`;
    case 'REVIEW':
      return 'cannot be confirmed';
    case 'COVERED':
      return 'covered';
  }
}

function asksFor(item: EscalationItem, request: EscalationRequest, input: EscalationInput): string[] {
  const { assessment, line, siteName, stockPoolName } = item;
  const { visit } = assessment;
  const { visitLabel, formatDate } = input;

  if (!line) {
    return [`Please correct the data for ${visit.id}: ${assessment.visitProblems.join('; ')}.`];
  }

  switch (request) {
    case 'EXPEDITE_SUPPLY':
      return [
        `Please get ${line.shortage} ${line.unit} of ${line.productName} to ${stockPoolName} before ${formatDate(visit.plannedDate)} for ${visit.id} at ${siteName}, or tell me when it can arrive.`,
      ];
    case 'CONFIRM_PRIORITY': {
      const conflict = line.conflict;
      if (!conflict) return [];
      return [
        `${conflict.visitIds.map(visitLabel).join(' and ')} both need ${line.productName} on ${visit.plannedDate}: ${conflict.totalRequired} needed, ${conflict.supply} available. Please decide which visit gets the stock.`,
      ];
    }
    case 'CONFIRM_DELIVERY':
      return line.countedDeliveries.map(
        (delivery) =>
          `Please confirm that ${delivery.quantity} ${line.unit} of ${line.productName} due ${formatDate(delivery.expectedDate)} will arrive before ${formatDate(visit.plannedDate)}. ${visit.id} relies on ${line.fromInbound} ${line.unit} from it.`,
      );
    case 'REVIEW_ALTERNATIVE':
      return alternativesFor(item).map((option) => {
        const scenario = assessment.scenarios.find((entry) => entry.scenario.id === option.scenarioId)?.scenario;
        const approval = option.approval
          ? `approved for this site by ${option.approval.approver} until ${formatDate(option.approval.validUntil)}, evidence ${option.approval.evidenceRef} (sample record)`
          : 'catalogue match only, not approved';
        const stock =
          option.stockSufficient === true
            ? 'enough stock'
            : option.stockSufficient === false
              ? 'not enough stock'
              : 'stock cannot be confirmed';
        return `Please review whether solution ${option.solution.id} can replace solution ${scenario?.solutionId} for ${option.scenarioId} (${scenario?.location}) at ${siteName}: ${approval}; ${stock}.`;
      });
    case 'CORRECT_DATA':
      return [`Please correct the data for ${line.productName} on ${visit.id}: ${line.reviewReasons.join('; ')}.`];
  }
}

function materialLines(line: MaterialLine, input: EscalationInput): string[] {
  const required = line.required === null ? 'need unknown' : `need ${line.required}`;
  const stockAsOf = line.stockAsOf ? input.formatInstant(line.stockAsOf) : 'unknown';
  const output = [`- ${STATUS_LABELS[line.status]}: ${line.productName}: ${required}, ${outcomeOf(line)} (stock as of ${stockAsOf})`];
  for (const taker of line.takenBy) {
    output.push(`  Used first by ${input.visitLabel(taker.visitId)}: ${taker.quantity} ${taker.kind.toLowerCase()}`);
  }
  for (const delivery of [...line.countedDeliveries, ...line.uncountedDeliveries]) {
    const status = delivery.confirmed ? 'confirmed' : 'unconfirmed';
    output.push(`  Delivery ${delivery.expectedDate}: ${delivery.quantity} ${line.unit} (${status})`);
  }
  return output;
}

function visitSection(items: EscalationItem[], input: EscalationInput): string[] {
  const { assessment, siteName, teamName } = items[0] as EscalationItem;
  const lines = items.flatMap((item) => (item.line ? [item.line] : []));
  const scenarioIds = new Set(lines.flatMap((line) => line.affectedScenarioIds));
  const scenarios = assessment.scenarios.filter(({ scenario }) => scenarioIds.has(scenario.id));
  const showWarnings = input.request === 'CORRECT_DATA' && assessment.warnings.length > 0;

  return [
    '',
    `Visit ${input.visitLabel(assessment.visit.id)}`,
    `Site: ${siteName} · Date: ${assessment.visit.plannedDate} · Team: ${teamName}`,
    `Status: ${assessment.headline}`,
    ...(assessment.otherRisks.length ? [`Also: ${assessment.otherRisks.join('; ')}`] : []),
    ...lines.flatMap((line) => materialLines(line, input)),
    ...(scenarios.length
      ? [
          'Affected scenarios:',
          ...scenarios.map(
            ({ scenario }) =>
              `- ${scenario.id}, ${scenario.location}: solution ${scenario.solutionId}, ${scenario.penetrations} penetrations`,
          ),
        ]
      : []),
    ...(showWarnings ? ['Data warnings:', ...assessment.warnings.map((item) => `- ${item}`)] : []),
  ];
}

function subjectFor(items: EscalationItem[], request: EscalationRequest, formatDate: EscalationInput['formatDate']) {
  const visits = [...new Set(items.map((item) => item.assessment.visit.id))];
  const products = [...new Set(items.map((item) => item.line?.productName ?? 'visit data'))];
  const label = REQUEST_LABELS[request];
  if (visits.length === 1) {
    const { assessment, siteName } = items[0] as EscalationItem;
    return `${label}: ${assessment.visit.id}, ${siteName}, ${formatDate(assessment.visit.plannedDate)}`;
  }
  return products.length === 1 ? `${label}: ${products[0]} for ${visits.length} visits` : `${label}: ${visits.length} visits`;
}

/** Builds one message for the chosen request, with a specific ask for each selected item. */
export function buildEscalation(input: EscalationInput): EscalationMessage {
  const { items, request, note, raisedBy } = input;
  if (items.length === 0) return { subject: '', body: 'Select at least one item to include.' };

  const asks = [...new Set(items.flatMap((item) => asksFor(item, request, input)))];
  const visitIds = [...new Set(items.map((item) => item.assessment.visit.id))];

  const body = [
    `Request: ${REQUEST_LABELS[request]}`,
    `Raised by: ${raisedBy}`,
    '',
    'What I need:',
    ...asks.map((ask) => `- ${ask}`),
    ...visitIds.flatMap((visitId) => visitSection(items.filter((item) => item.assessment.visit.id === visitId), input)),
    ...(note.trim() ? ['', `Note: ${note.trim()}`] : []),
  ].join('\n');

  return { subject: subjectFor(items, request, input.formatDate), body };
}

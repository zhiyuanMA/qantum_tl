import { findAlternatives } from '@/domain/alternatives';
import {
  buildEscalation,
  canEscalate,
  defaultRequest,
  itemKey,
  problemItems,
  REQUEST_LABELS,
  REQUEST_ORDER,
  requestsFor,
  type EscalationItem,
  type EscalationMessage,
  type EscalationRequest,
} from '@/domain/escalation';
import { assessPlan } from '@/domain/readiness';
import type {
  AlternativeOption,
  DomainConfig,
  Instant,
  ISODate,
  Leader,
  MaterialLine,
  ReadinessState,
  ScenarioAssessment,
  VisitAssessment,
} from '@/domain/types';
import type { EscalationMark, Providers } from '@/ports';
import { buildCalendar, buildOverview, buildToday, type TodayView, type VisitCalendar, type VisitOverview } from './overview';

export const STATE_LABELS: Record<ReadinessState, string> = {
  SHORT: 'Short',
  STOCK_CONFLICT: 'Stock conflict',
  NEEDS_DATA_REVIEW: 'Needs data review',
  DEPENDS_ON_DELIVERY: 'Depends on delivery',
  READY: 'Ready',
  NO_PRODUCTS_LISTED: 'No products listed',
};

export const STATE_GUIDANCE: Record<ReadinessState, string> = {
  SHORT: 'This visit cannot go ahead as planned. Escalate the shortage, and check which scenarios are unaffected.',
  STOCK_CONFLICT: 'Same-day visits want more than is available. A person must decide who gets the stock.',
  NEEDS_DATA_REVIEW: 'Readiness cannot be confirmed from this data. Have it corrected before relying on this visit.',
  DEPENDS_ON_DELIVERY: 'This is covered only if the delivery arrives on time. Check again before the crew leaves.',
  READY: 'Covered on the current plan. This is a projection, not a reservation, so stock could still change.',
  NO_PRODUCTS_LISTED: 'The catalogue lists no products for these solutions. Check the specification if this looks wrong.',
};

export const STATE_ORDER: ReadinessState[] = [
  'SHORT',
  'STOCK_CONFLICT',
  'NEEDS_DATA_REVIEW',
  'DEPENDS_ON_DELIVERY',
  'READY',
  'NO_PRODUCTS_LISTED',
];

export interface VisitRow {
  id: string;
  plannedDate: ISODate;
  siteName: string;
  teamName: string;
  state: ReadinessState;
  stateLabel: string;
  headline: string;
  /** How many of the visit's current problems are marked as escalated. Null when none are. */
  escalation: { level: 'FULL' | 'PARTIAL'; escalated: number; total: number } | null;
}

/** Escalation marks keyed by itemKey(visitId, productId). */
export type Escalations = Record<string, EscalationMark>;

export interface MarkView {
  markedAt: Instant;
  requestLabel: string;
}

export interface VisitList {
  today: ISODate;
  horizonDays: number;
  rows: VisitRow[];
  todayVisits: TodayView;
  overview: VisitOverview;
  calendar: VisitCalendar;
  counts: { state: ReadinessState; label: string; count: number }[];
}

export interface TakerView {
  label: string;
  quantity: number;
  kind: 'Reserved' | 'Planned';
}

export type CoverageKind = 'RESERVED' | 'STOCK' | 'INBOUND' | 'CONTESTED' | 'SHORT';

export interface LineView extends Omit<MaterialLine, 'takenBy' | 'conflict'> {
  coverage: { kind: CoverageKind; quantity: number; share: number }[];
  takenBy: TakerView[];
  conflict: { visits: string[]; totalRequired: number; supply: number } | null;
  escalation: MarkView | null;
}

export interface VisitDetail extends VisitRow {
  stockPoolName: string;
  otherRisks: string[];
  warnings: string[];
  lines: LineView[];
  scenarios: ScenarioAssessment[];
  alternatives: AlternativeOption[];
  canEscalate: boolean;
}

export type ComposerScope = { kind: 'VISIT'; visitId: string } | { kind: 'PRODUCT'; productId: string };

export interface ComposerItem {
  key: string;
  label: string;
  context: string;
  requests: EscalationRequest[];
  escalation: MarkView | null;
}

export interface Composer {
  title: string;
  items: ComposerItem[];
  requests: { value: EscalationRequest; label: string }[];
  defaultRequest: EscalationRequest;
}

export type VisitDetailResult =
  | { status: 'FOUND'; detail: VisitDetail }
  | { status: 'NOT_FOUND' }
  | { status: 'OTHER_TEAM'; teamName: string };

export interface ReadinessSnapshot {
  calculatedAt: Instant;
  leaders: Leader[];
  visitList(leaderId: string, escalations?: Escalations): VisitList;
  visitDetail(leaderId: string, visitId: string, escalations?: Escalations): VisitDetailResult;
  /** Null when the scope has nothing this leader can escalate. */
  composer(leaderId: string, scope: ComposerScope, escalations?: Escalations): Composer | null;
  escalation(leaderId: string, keys: string[], request: EscalationRequest, note: string): EscalationMessage;
}

export interface ReadinessService {
  load(): Promise<ReadinessSnapshot>;
}

const DATE_FORMAT = new Intl.DateTimeFormat('en-NZ', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

const utc = (date: ISODate) => new Date(`${date}T00:00:00Z`);

export const formatDate = (date: ISODate) => DATE_FORMAT.format(utc(date)).replace(',', '');
export const formatWeekday = (date: ISODate) => utc(date).toLocaleDateString('en-NZ', { weekday: 'short', timeZone: 'UTC' });
export const formatDayNumber = (date: ISODate) => utc(date).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** Parts of the required quantity, for the coverage bar. Empty when the quantity is unknown. */
function coverageOf(line: Pick<MaterialLine, 'required' | 'reserved' | 'fromStock' | 'fromInbound' | 'shortage'>, contested: boolean) {
  const { required, reserved, fromStock, fromInbound, shortage } = line;
  if (!required) return [];
  const parts: [CoverageKind, number][] = contested
    ? [['RESERVED', reserved], ['CONTESTED', required - reserved]]
    : [['RESERVED', reserved], ['STOCK', fromStock], ['INBOUND', fromInbound], ['SHORT', shortage]];
  return parts
    .filter(([, quantity]) => quantity > 0)
    .map(([kind, quantity]) => ({ kind, quantity, share: (quantity / required) * 100 }));
}

export function createReadinessService(providers: Providers, config: DomainConfig): ReadinessService {
  return {
    async load() {
      const now = providers.clock.now();
      const [plan, catalogue, usageRules, stock, approvals] = await Promise.all([
        providers.plan.getPlan(),
        providers.catalogue.getCatalogue(),
        providers.usage.getUsageRules(),
        providers.stock.getStock(),
        providers.approvals.getApprovals(),
      ]);

      const assessed = assessPlan(
        {
          products: catalogue.products,
          solutions: catalogue.solutions,
          visits: plan.visits,
          scenarios: plan.scenarios,
          usageRules,
          stock: stock.balances,
          deliveries: stock.deliveries,
          reservations: stock.reservations,
        },
        { now, config },
      );

      const siteName = (id: string) => plan.sites.find((item) => item.id === id)?.name ?? id;
      const teamName = (id: string) => plan.teams.find((item) => item.id === id)?.name ?? id;
      const leader = (id: string) => plan.leaders.find((item) => item.id === id);

      const markView = (mark: EscalationMark | undefined): MarkView | null =>
        mark ? { markedAt: mark.markedAt, requestLabel: REQUEST_LABELS[mark.request as EscalationRequest] ?? mark.request } : null;

      /** Marks for problems that no longer exist are out of date, so they are not counted. */
      const escalationOf = (item: VisitAssessment, escalations: Escalations): VisitRow['escalation'] => {
        if (!canEscalate(item.state)) return null;
        const keys = problemItems(item).map(({ line }) => itemKey(item.visit.id, line?.productId ?? null));
        const escalated = keys.filter((key) => escalations[key]).length;
        if (escalated === 0) return null;
        return { level: escalated === keys.length ? 'FULL' : 'PARTIAL', escalated, total: keys.length };
      };

      /** All teams' results stay inside the snapshot; views only expose the leader's teams. */
      const toRow = (item: VisitAssessment, escalations: Escalations): VisitRow => {
        return {
          id: item.visit.id,
          plannedDate: item.visit.plannedDate,
          siteName: siteName(item.visit.siteId),
          teamName: teamName(item.visit.teamId),
          state: item.state,
          stateLabel: STATE_LABELS[item.state],
          headline: item.headline,
          escalation: escalationOf(item, escalations),
        };
      };

      const visitLabel = (visitId: string) => {
        const visit = plan.visits.find((item) => item.id === visitId);
        return visit ? `${visitId} (${teamName(visit.teamId)}, ${visit.plannedDate})` : visitId;
      };

      const toLineView = (visitId: string, escalations: Escalations) => ({ takenBy, conflict, ...line }: MaterialLine): LineView => ({
        ...line,
        escalation: line.status === 'COVERED' ? null : markView(escalations[itemKey(visitId, line.productId)]),
        coverage: coverageOf(line, conflict !== null),
        takenBy: takenBy.map((item) => ({
          label: visitLabel(item.visitId),
          quantity: item.quantity,
          kind: item.kind === 'RESERVED' ? 'Reserved' : 'Planned',
        })),
        conflict: conflict
          ? { visits: conflict.visitIds.map(visitLabel), totalRequired: conflict.totalRequired, supply: conflict.supply }
          : null,
      });

      const owned = (leaderId: string) => {
        const teamIds = leader(leaderId)?.teamIds ?? [];
        return assessed.visits.filter((item) => teamIds.includes(item.visit.teamId));
      };

      const find = (visitId: string) => assessed.visits.find((item) => item.visit.id === visitId);
      const poolName = (id: string) => plan.stockPools.find((item) => item.id === id)?.name ?? id;

      const alternatives = new Map<string, AlternativeOption[]>();
      const alternativesOf = (assessment: VisitAssessment) => {
        const cached = alternatives.get(assessment.visit.id);
        if (cached) return cached;
        const options = findAlternatives({
          assessment,
          solutions: catalogue.solutions,
          products: catalogue.products,
          usageRules,
          approvals,
          freeSupply: assessed.freeSupply,
        });
        alternatives.set(assessment.visit.id, options);
        return options;
      };

      const STATUS_TEXT: Record<MaterialLine['status'], (line: MaterialLine) => string> = {
        SHORT: (line) => `Short by ${line.shortage} ${line.unit}`,
        CONFLICT: (line) => `Stock conflict, short by ${line.shortage} ${line.unit}`,
        DELIVERY: (line) => `Needs ${line.fromInbound} ${line.unit} from a delivery`,
        REVIEW: () => 'Needs data review',
        COVERED: () => 'Covered',
      };

      /** Every escalatable item for this leader, keyed for marks and message building. */
      const itemsOf = (assessment: VisitAssessment): (EscalationItem & { key: string })[] =>
        problemItems(assessment).map(({ line }) => ({
          key: itemKey(assessment.visit.id, line?.productId ?? null),
          assessment,
          line,
          alternatives: alternativesOf(assessment),
          siteName: siteName(assessment.visit.siteId),
          teamName: teamName(assessment.visit.teamId),
          stockPoolName: poolName(assessment.visit.stockPoolId),
        }));

      const toComposer = (
        title: string,
        entries: { item: EscalationItem & { key: string }; label: string; context: string }[],
        preferred: EscalationRequest,
        escalations: Escalations,
      ): Composer | null => {
        if (entries.length === 0) return null;
        const available = REQUEST_ORDER.filter((request) => entries.some(({ item }) => requestsFor(item).includes(request)));
        return {
          title,
          items: entries.map(({ item, label, context }) => ({
            key: item.key,
            label,
            context,
            requests: requestsFor(item),
            escalation: markView(escalations[item.key]),
          })),
          requests: available.map((value) => ({ value, label: REQUEST_LABELS[value] })),
          defaultRequest: available.includes(preferred) ? preferred : (available[0] as EscalationRequest),
        };
      };

      return {
        calculatedAt: now,
        leaders: plan.leaders,

        visitList(leaderId, escalations = {}) {
          const assessments = owned(leaderId);
          const rows = assessments.map((item) => toRow(item, escalations));
          return {
            today: assessed.today,
            horizonDays: config.horizonDays,
            rows,
            todayVisits: buildToday(rows, assessed.today),
            overview: buildOverview(
              rows,
              assessments.map((item) => ({ plannedDate: item.visit.plannedDate, lines: item.lines })),
              assessed.today,
            ),
            calendar: buildCalendar(rows, assessed.today, config.horizonDays),
            counts: STATE_ORDER.map((state) => ({
              state,
              label: STATE_LABELS[state],
              count: rows.filter((row) => row.state === state).length,
            })),
          };
        },

        visitDetail(leaderId, visitId, escalations = {}) {
          const assessment = find(visitId);
          if (!assessment) return { status: 'NOT_FOUND' };
          if (!owned(leaderId).includes(assessment)) {
            return { status: 'OTHER_TEAM', teamName: teamName(assessment.visit.teamId) };
          }
          return {
            status: 'FOUND',
            detail: {
              ...toRow(assessment, escalations),
              stockPoolName: poolName(assessment.visit.stockPoolId),
              otherRisks: assessment.otherRisks,
              warnings: assessment.warnings,
              lines: assessment.lines.map(toLineView(assessment.visit.id, escalations)),
              scenarios: assessment.scenarios,
              alternatives: alternativesOf(assessment),
              canEscalate: canEscalate(assessment.state),
            },
          };
        },

        composer(leaderId, scope, escalations = {}) {
          if (scope.kind === 'VISIT') {
            const assessment = owned(leaderId).find((item) => item.visit.id === scope.visitId);
            if (!assessment || !canEscalate(assessment.state)) return null;
            const entries = itemsOf(assessment).map((item) => ({
              item,
              label: item.line?.productName ?? 'Visit data',
              context: item.line ? STATUS_TEXT[item.line.status](item.line) : assessment.visitProblems.join('; '),
            }));
            return toComposer(`Escalate ${assessment.visit.id}`, entries, defaultRequest(assessment.state), escalations);
          }

          const entries = owned(leaderId).flatMap((assessment) =>
            itemsOf(assessment)
              .filter((item) => item.line?.productId === scope.productId)
              .map((item) => ({
                item,
                label: `${assessment.visit.id} · ${siteName(assessment.visit.siteId)} · ${formatDate(assessment.visit.plannedDate)}`,
                context: STATUS_TEXT[(item.line as MaterialLine).status](item.line as MaterialLine),
              })),
          );
          const name = catalogue.products.find((item) => item.id === scope.productId)?.name ?? scope.productId;
          return toComposer(name, entries, 'EXPEDITE_SUPPLY', escalations);
        },

        escalation(leaderId, keys, request, note) {
          const items = owned(leaderId)
            .flatMap(itemsOf)
            .filter((item) => keys.includes(item.key) && requestsFor(item).includes(request));
          return buildEscalation({
            items,
            request,
            note,
            raisedBy: leader(leaderId)?.name ?? 'Team leader',
            visitLabel,
            formatDate,
            formatInstant: (instant) =>
              new Intl.DateTimeFormat('en-NZ', { dateStyle: 'medium', timeStyle: 'short', timeZone: config.timeZone }).format(
                new Date(instant),
              ),
          });
        },
      };
    },
  };
}

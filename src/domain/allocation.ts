import { addDays } from './dates';
import type { ISODate, LineAllocation, StockTaker } from './types';

export interface Demand {
  visitId: string;
  plannedDate: ISODate;
  required: number | null;
  unknownReason?: string;
}

export interface AllocationInput {
  today: ISODate;
  deliveryLeadDays: number;
  stock: number | null;
  stockUnknownReason: string | null;
  demands: Demand[];
  reservations: { visitId: string; quantity: number }[];
  deliveries: { expectedDate: ISODate; confirmed: boolean; quantity: number }[];
}

export interface AllocationResult {
  lines: Map<string, LineAllocation>;
}

interface Ledger {
  date: ISODate;
  freeAfter: number;
}

/**
 * Projection order. "Earliest first" is an assumption about how stock is used. It does not set
 * task priority, which the planning system owns. Change the rule here and nowhere else.
 */
export const byPlannedOrder = (a: Demand, b: Demand) =>
  a.plannedDate.localeCompare(b.plannedDate) || a.visitId.localeCompare(b.visitId);

const emptyLine = (required: number | null): LineAllocation => ({
  status: 'REVIEW',
  required,
  reserved: 0,
  fromStock: 0,
  fromInbound: 0,
  shortage: 0,
  takenBy: [],
  conflict: null,
  reviewReasons: [],
});

function run(
  { today, deliveryLeadDays, stock, stockUnknownReason, demands, reservations, deliveries }: AllocationInput,
  extraDates: ISODate[],
) {
  const lines = new Map<string, LineAllocation>();
  const ledger: Ledger[] = [];
  const ordered = [...demands].sort(byPlannedOrder);

  const reservedTotal = reservations.reduce((sum, item) => sum + item.quantity, 0);
  const unknownReason =
    stock === null
      ? (stockUnknownReason ?? 'Stock balance is unavailable')
      : reservedTotal > stock
        ? 'Reservations exceed the recorded stock balance'
        : null;

  if (stock === null || unknownReason) {
    for (const demand of ordered) {
      const reasons = [unknownReason, demand.unknownReason].filter((item): item is string => Boolean(item));
      lines.set(demand.visitId, { ...emptyLine(demand.required), reviewReasons: reasons });
    }
    return { lines, ledger, known: false };
  }

  let freeStock = stock - reservedTotal;
  let freeInbound = 0;
  const pending = deliveries.filter((item) => item.confirmed && item.expectedDate >= today);
  const taken: StockTaker[] = [];
  const unknownVisits: string[] = [];
  const reservedFor = (visitId: string) =>
    reservations.filter((item) => item.visitId === visitId).reduce((sum, item) => sum + item.quantity, 0);
  const heldByOthers = (visitId: string): StockTaker[] =>
    reservations
      .filter((item) => item.visitId !== visitId && item.quantity > 0)
      .map((item) => ({ visitId: item.visitId, quantity: item.quantity, kind: 'RESERVED' as const }))
      .sort((a, b) => a.visitId.localeCompare(b.visitId));

  const dates = [...new Set([...ordered.map((item) => item.plannedDate), ...extraDates])].sort();

  for (const date of dates) {
    for (const delivery of pending.filter((item) => item.expectedDate <= addDays(date, -deliveryLeadDays))) {
      freeInbound += delivery.quantity;
      pending.splice(pending.indexOf(delivery), 1);
    }

    const group = ordered.filter((item) => item.plannedDate === date);
    unknownVisits.push(...group.filter((item) => item.required === null).map((item) => item.visitId));

    const remaining = new Map<string, number>();
    for (const demand of group) {
      if (demand.required === null) {
        lines.set(demand.visitId, { ...emptyLine(null), reviewReasons: demand.unknownReason ? [demand.unknownReason] : [] });
        continue;
      }
      const reserved = Math.min(reservedFor(demand.visitId), demand.required);
      lines.set(demand.visitId, { ...emptyLine(demand.required), reserved });
      remaining.set(demand.visitId, demand.required - reserved);
    }

    const contenders = [...remaining.entries()].filter(([, quantity]) => quantity > 0).map(([visitId]) => visitId);
    const groupDemand = contenders.reduce((sum, visitId) => sum + (remaining.get(visitId) ?? 0), 0);
    const supply = freeStock + freeInbound;
    const isConflict = contenders.length > 1 && groupDemand > supply;
    const usesInbound = groupDemand > freeStock;
    const priorTakers = [...taken];

    for (const visitId of remaining.keys()) {
      const line = lines.get(visitId) as LineAllocation;
      const need = remaining.get(visitId) ?? 0;

      if (isConflict && need > 0) {
        line.status = 'CONFLICT';
        line.shortage = groupDemand - supply;
        line.conflict = { visitIds: contenders, totalRequired: groupDemand, supply };
        line.takenBy = [...heldByOthers(visitId), ...priorTakers];
        continue;
      }

      line.fromStock = Math.min(freeStock, need);
      line.fromInbound = Math.min(freeInbound, need - line.fromStock);
      line.shortage = need - line.fromStock - line.fromInbound;
      freeStock -= line.fromStock;
      freeInbound -= line.fromInbound;

      if (line.fromStock + line.fromInbound > 0) {
        taken.push({ visitId, quantity: line.fromStock + line.fromInbound, kind: 'PLANNED' });
      }

      if (line.shortage > 0) {
        line.status = 'SHORT';
        line.takenBy = [...heldByOthers(visitId), ...priorTakers];
      } else {
        // Same-day visits share the outcome, so ID order cannot decide who relies on a delivery.
        line.status = need > 0 && usesInbound ? 'DELIVERY' : 'COVERED';
      }

      const otherUnknown = unknownVisits.filter((item) => item !== visitId);
      if (otherUnknown.length > 0 && line.status !== 'SHORT') {
        line.status = 'REVIEW';
        line.reviewReasons = [`Demand is unknown for ${otherUnknown.join(', ')}, which may use this stock first`];
      }
    }

    if (isConflict) {
      freeStock = 0;
      freeInbound = 0;
    }
    ledger.push({ date, freeAfter: freeStock + freeInbound });
  }

  return { lines, ledger, known: unknownVisits.length === 0 };
}

export function allocateProduct(input: AllocationInput): AllocationResult {
  return { lines: run(input, []).lines };
}

/** Supply that can be used on a date without taking stock from any planned visit. Null when unknown. */
export function freeSupplyOn(input: AllocationInput, date: ISODate): number | null {
  const { ledger, known } = run(input, [date]);
  if (!known) return null;
  return Math.min(...ledger.filter((item) => item.date >= date).map((item) => item.freeAfter));
}

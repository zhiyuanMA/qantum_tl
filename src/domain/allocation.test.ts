import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { allocateProduct, freeSupplyOn, type AllocationInput, type Demand } from './allocation';

const TUE = '2026-11-10';
const WED = '2026-11-11';
const THU = '2026-11-12';

const demand = (visitId: string, plannedDate: string, required: number | null, unknownReason?: string): Demand => ({
  visitId,
  plannedDate,
  required,
  unknownReason,
});

const input = (overrides: Partial<AllocationInput>): AllocationInput => ({
  today: '2026-11-09',
  deliveryLeadDays: 1,
  stock: 20,
  stockUnknownReason: null,
  demands: [],
  reservations: [],
  deliveries: [],
  ...overrides,
});

const line = (result: ReturnType<typeof allocateProduct>, visitId: string) => {
  const found = result.lines.get(visitId);
  if (!found) throw new Error(`No line for ${visitId}`);
  return found;
};

describe('allocateProduct', () => {
  it('AC1: the earlier visit is covered and the later one is short, naming who took the stock', () => {
    const result = allocateProduct(input({ demands: [demand('north', TUE, 15), demand('south', THU, 15)] }));
    expect(line(result, 'north')).toMatchObject({ status: 'COVERED', fromStock: 15, shortage: 0 });
    expect(line(result, 'south')).toMatchObject({ status: 'SHORT', fromStock: 5, shortage: 10 });
    expect(line(result, 'south').takenBy).toEqual([{ visitId: 'north', quantity: 15, kind: 'PLANNED' }]);
  });

  it('AC2: same-day contention is a conflict on both visits, and neither is covered', () => {
    const result = allocateProduct(input({ demands: [demand('north', TUE, 15), demand('south', TUE, 15)] }));
    for (const visitId of ['north', 'south']) {
      expect(line(result, visitId)).toMatchObject({
        status: 'CONFLICT',
        shortage: 10,
        conflict: { visitIds: ['north', 'south'], totalRequired: 30, supply: 20 },
      });
    }
  });

  it('AC2: a conflict takes all supply, so later visits are short', () => {
    const result = allocateProduct(
      input({ demands: [demand('a', TUE, 15), demand('b', TUE, 15), demand('c', THU, 1)] }),
    );
    expect(line(result, 'c')).toMatchObject({ status: 'SHORT', shortage: 1 });
  });

  it('same-day visits that fit together are both covered', () => {
    const result = allocateProduct(input({ demands: [demand('a', TUE, 10), demand('b', TUE, 10)] }));
    expect(line(result, 'a').status).toBe('COVERED');
    expect(line(result, 'b').status).toBe('COVERED');
  });

  it('AC3: a reservation holds stock for its own visit and is named on the other', () => {
    const result = allocateProduct(
      input({
        demands: [demand('north', THU, 15), demand('south', TUE, 15)],
        reservations: [{ visitId: 'north', quantity: 15 }],
      }),
    );
    expect(line(result, 'north')).toMatchObject({ status: 'COVERED', reserved: 15, fromStock: 0 });
    expect(line(result, 'south')).toMatchObject({ status: 'SHORT', shortage: 10 });
    expect(line(result, 'south').takenBy).toContainEqual({ visitId: 'north', quantity: 15, kind: 'RESERVED' });
  });

  it('a reservation covers only its own visit, and any remainder competes as normal', () => {
    const result = allocateProduct(
      input({ stock: 10, demands: [demand('a', TUE, 8)], reservations: [{ visitId: 'a', quantity: 5 }] }),
    );
    expect(line(result, 'a')).toMatchObject({ status: 'COVERED', reserved: 5, fromStock: 3 });
  });

  it('reservations above stock need review rather than negative supply', () => {
    const result = allocateProduct(input({ stock: 5, demands: [demand('a', TUE, 1)], reservations: [{ visitId: 'z', quantity: 9 }] }));
    expect(line(result, 'a').status).toBe('REVIEW');
  });

  it('exactly matching demand leaves no shortage', () => {
    const result = allocateProduct(input({ demands: [demand('a', TUE, 20)] }));
    expect(line(result, 'a')).toMatchObject({ status: 'COVERED', shortage: 0 });
  });

  it('zero stock with demand is short, not unknown', () => {
    const result = allocateProduct(input({ stock: 0, demands: [demand('a', TUE, 1)] }));
    expect(line(result, 'a')).toMatchObject({ status: 'SHORT', shortage: 1 });
  });

  describe('deliveries', () => {
    const delivery = (expectedDate: string, confirmed = true, quantity = 10) => ({ expectedDate, confirmed, quantity });

    it('AC5: a confirmed delivery before the visit means it depends on delivery', () => {
      const result = allocateProduct(input({ demands: [demand('a', THU, 25)], deliveries: [delivery(WED)] }));
      expect(line(result, 'a')).toMatchObject({ status: 'DELIVERY', fromStock: 20, fromInbound: 5, shortage: 0 });
    });

    it('AC6: a delivery on the visit date does not count', () => {
      const result = allocateProduct(input({ demands: [demand('a', THU, 25)], deliveries: [delivery(THU)] }));
      expect(line(result, 'a')).toMatchObject({ status: 'SHORT', shortage: 5 });
    });

    it('AC20: a longer lead time needs the delivery earlier', () => {
      const value = { demands: [demand('a', THU, 25)], deliveries: [delivery(WED)] };
      expect(line(allocateProduct(input({ ...value, deliveryLeadDays: 2 })), 'a').status).toBe('SHORT');
      expect(line(allocateProduct(input({ ...value, deliveries: [delivery(TUE)], deliveryLeadDays: 2 })), 'a').status).toBe('DELIVERY');
    });

    it('AC6: an unconfirmed delivery does not count', () => {
      const result = allocateProduct(input({ demands: [demand('a', THU, 25)], deliveries: [delivery(WED, false)] }));
      expect(line(result, 'a')).toMatchObject({ status: 'SHORT', shortage: 5 });
    });

    it('a delivery already past its expected date does not count', () => {
      const result = allocateProduct(input({ demands: [demand('a', THU, 25)], deliveries: [delivery('2026-11-08')] }));
      expect(line(result, 'a')).toMatchObject({ status: 'SHORT', shortage: 5 });
    });

    it('a delivery is not consumed twice', () => {
      const result = allocateProduct(
        input({
          stock: 0,
          demands: [demand('a', WED, 8), demand('b', THU, 8)],
          deliveries: [delivery(TUE)],
        }),
      );
      expect(line(result, 'a')).toMatchObject({ status: 'DELIVERY', fromInbound: 8 });
      expect(line(result, 'b')).toMatchObject({ fromInbound: 2, shortage: 6, status: 'SHORT' });
    });

    it('same-day visits that need inbound all depend on delivery, whatever their order', () => {
      const result = allocateProduct(
        input({ stock: 10, demands: [demand('a', THU, 10), demand('b', THU, 10)], deliveries: [delivery(WED)] }),
      );
      expect(line(result, 'a').status).toBe('DELIVERY');
      expect(line(result, 'b').status).toBe('DELIVERY');
    });

    it('a delivery can settle what would otherwise be a same-day conflict', () => {
      const result = allocateProduct(
        input({ demands: [demand('a', THU, 15), demand('b', THU, 15)], deliveries: [delivery(WED)] }),
      );
      expect(line(result, 'a').status).toBe('DELIVERY');
    });
  });

  describe('uncertain data', () => {
    it('AC7: unknown stock needs review on every visit', () => {
      const result = allocateProduct(
        input({ stock: null, stockUnknownReason: 'Stock is stale', demands: [demand('a', TUE, 1)] }),
      );
      expect(line(result, 'a')).toMatchObject({ status: 'REVIEW', reviewReasons: ['Stock is stale'] });
    });

    it('AC9: unknown demand needs review on that visit', () => {
      const result = allocateProduct(input({ demands: [demand('a', TUE, null, 'No usage rule')] }));
      expect(line(result, 'a')).toMatchObject({ status: 'REVIEW', required: null, reviewReasons: ['No usage rule'] });
    });

    it('unknown demand on an earlier visit prevents a covered result on a later one', () => {
      const result = allocateProduct(input({ demands: [demand('a', TUE, null, 'No usage rule'), demand('b', THU, 1)] }));
      expect(line(result, 'b').status).toBe('REVIEW');
      expect(line(result, 'b').reviewReasons[0]).toContain('a');
    });

    it('unknown demand on the same day prevents a covered result', () => {
      const result = allocateProduct(input({ demands: [demand('a', TUE, null, 'No usage rule'), demand('b', TUE, 1)] }));
      expect(line(result, 'b').status).toBe('REVIEW');
    });

    it('a shortage stays short even with other unknown demand', () => {
      const result = allocateProduct(input({ demands: [demand('a', TUE, null, 'No usage rule'), demand('b', THU, 21)] }));
      expect(line(result, 'b').status).toBe('SHORT');
    });
  });

  it('property: results do not depend on input order', () => {
    const arbitrary = fc.record({
      stock: fc.integer({ min: 0, max: 50 }),
      demands: fc.uniqueArray(
        fc.record({ visitId: fc.constantFrom('a', 'b', 'c', 'd', 'e'), day: fc.integer({ min: 10, max: 13 }), required: fc.integer({ min: 0, max: 30 }) }),
        { selector: (item) => item.visitId, minLength: 1 },
      ),
    });
    fc.assert(
      fc.property(arbitrary, ({ stock, demands }) => {
        const mapped = demands.map((item) => demand(item.visitId, `2026-11-${item.day}`, item.required));
        const forward = allocateProduct(input({ stock, demands: mapped }));
        const reverse = allocateProduct(input({ stock, demands: [...mapped].reverse() }));
        expect(Object.fromEntries(reverse.lines)).toEqual(Object.fromEntries(forward.lines));
      }),
    );
  });

  it('property: allocation never exceeds supply and every unit is accounted for', () => {
    const arbitrary = fc.record({
      stock: fc.integer({ min: 0, max: 50 }),
      inbound: fc.integer({ min: 0, max: 20 }),
      reserved: fc.integer({ min: 0, max: 10 }),
      demands: fc.array(fc.record({ day: fc.integer({ min: 11, max: 14 }), required: fc.integer({ min: 0, max: 30 }) }), { minLength: 1, maxLength: 6 }),
    });
    fc.assert(
      fc.property(arbitrary, ({ stock, inbound, reserved, demands }) => {
        const mapped = demands.map((item, index) => demand(`v${index}`, `2026-11-${item.day}`, item.required));
        const held = Math.min(reserved, stock);
        const result = allocateProduct(
          input({
            stock,
            demands: mapped,
            reservations: [{ visitId: 'v0', quantity: held }],
            deliveries: [{ expectedDate: TUE, confirmed: true, quantity: inbound }],
          }),
        );
        const lines = [...result.lines.values()];
        const used = lines.reduce((sum, item) => sum + item.reserved + item.fromStock + item.fromInbound, 0);
        expect(used).toBeLessThanOrEqual(stock + inbound);
        for (const item of lines) {
          if (item.status === 'CONFLICT') continue;
          expect(item.reserved + item.fromStock + item.fromInbound + item.shortage).toBe(item.required);
        }
      }),
    );
  });
});

describe('freeSupplyOn', () => {
  it('returns what is left after planned visits, including later ones', () => {
    const value = input({ demands: [demand('a', TUE, 5), demand('b', THU, 10)] });
    expect(freeSupplyOn(value, WED)).toBe(5);
  });

  it('returns null when stock or earlier demand is unknown', () => {
    expect(freeSupplyOn(input({ stock: null, stockUnknownReason: 'x' }), WED)).toBeNull();
    expect(freeSupplyOn(input({ demands: [demand('a', TUE, null, 'x')] }), WED)).toBeNull();
  });

  it('does not count a delivery arriving after the date', () => {
    const value = input({ stock: 2, deliveries: [{ expectedDate: THU, confirmed: true, quantity: 10 }] });
    expect(freeSupplyOn(value, WED)).toBe(2);
  });
});

import { describe, expect, it } from 'vitest';
import {
  addBusinessDays,
  addDays,
  dateInZone,
  daysBetween,
  hoursBetween,
  isWeekend,
  isWithinHorizon,
  startOfWeek,
} from './dates';

describe('dateInZone', () => {
  it('uses the configured zone, not UTC, at a day boundary', () => {
    expect(dateInZone('2026-11-08T11:30:00Z', 'Pacific/Auckland')).toBe('2026-11-09');
    expect(dateInZone('2026-11-08T10:30:00Z', 'Pacific/Auckland')).toBe('2026-11-08');
  });
});

describe('addDays', () => {
  it('crosses a month end', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
  });
});

describe('addBusinessDays', () => {
  it('skips weekends', () => {
    expect(addBusinessDays('2026-11-06', 1)).toBe('2026-11-09'); // Friday to Monday
    expect(addBusinessDays('2026-11-07', 1)).toBe('2026-11-09'); // Saturday to Monday
    expect(addBusinessDays('2026-11-09', 5)).toBe('2026-11-16');
  });
  it('returns the same date for an offset of zero', () => {
    expect(addBusinessDays('2026-11-09', 0)).toBe('2026-11-09');
  });
});

describe('isWithinHorizon', () => {
  it('includes today and the last day, and excludes either side', () => {
    expect(isWithinHorizon('2026-11-10', '2026-11-10', 14)).toBe(true);
    expect(isWithinHorizon('2026-11-24', '2026-11-10', 14)).toBe(true);
    expect(isWithinHorizon('2026-11-25', '2026-11-10', 14)).toBe(false);
    expect(isWithinHorizon('2026-11-09', '2026-11-10', 14)).toBe(false);
  });
});

describe('hoursBetween', () => {
  it('measures elapsed hours across offsets', () => {
    expect(hoursBetween('2026-11-08T00:00:00+13:00', '2026-11-08T01:00:00Z')).toBe(14);
  });
});

describe('calendar helpers', () => {
  it('finds the Monday of a week', () => {
    expect(startOfWeek('2026-11-11')).toBe('2026-11-09');
    expect(startOfWeek('2026-11-09')).toBe('2026-11-09');
    expect(startOfWeek('2026-11-08')).toBe('2026-11-02'); // Sunday
  });
  it('counts calendar days between dates', () => {
    expect(daysBetween('2026-11-30', '2026-12-02')).toBe(2);
  });
  it('recognises weekends', () => {
    expect(isWeekend('2026-11-07')).toBe(true);
    expect(isWeekend('2026-11-09')).toBe(false);
  });
});

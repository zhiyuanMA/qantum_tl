import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCatalogue, productId, splitProducts } from './catalogue-parser';

const csv = readFileSync(
  path.resolve(__dirname, '../data/source/solutions-excerpt-with-products-supplier-fireco.csv'),
  'utf8',
);
const catalogue = parseCatalogue(csv);
const solution = (id: string) => {
  const found = catalogue.solutions.find((item) => item.id === id);
  if (!found) throw new Error(`No solution ${id}`);
  return found;
};

describe('splitProducts', () => {
  it('keeps the comma inside the brush-grade product name', () => {
    const name = 'FIRECO MASTIC (BRUSH GRADE) 5Kg tub FR sealant for FireCo 502, 401 & 802';
    expect(splitProducts(`A,${name},B`)).toEqual(['A', name, 'B']);
  });

  it.each(['', '  ', '0'])('treats %j as zero products', (raw) => {
    expect(splitProducts(raw)).toEqual([]);
  });

  it('tolerates a space before a separator and collapses inner spacing', () => {
    expect(splitProducts('FIRECO SL COLLAR  55mm Retrofit Collar ,MASTIC')).toEqual([
      'FIRECO SL COLLAR 55mm Retrofit Collar',
      'MASTIC',
    ]);
  });
});

describe('productId', () => {
  it('is stable across spacing differences', () => {
    expect(productId('A  B ')).toBe(productId('A B'));
  });
});

describe('supplied catalogue', () => {
  it('has 148 unique solutions and 36 products', () => {
    expect(catalogue.solutions).toHaveLength(148);
    expect(new Set(catalogue.solutions.map((item) => item.id)).size).toBe(148);
    expect(catalogue.products).toHaveLength(36);
  });

  it('matches the observed 0..N product distribution', () => {
    const distribution: Record<number, number> = {};
    for (const item of catalogue.solutions) {
      distribution[item.productIds.length] = (distribution[item.productIds.length] ?? 0) + 1;
    }
    expect(distribution).toEqual({ 0: 4, 1: 8, 2: 57, 3: 54, 4: 23, 5: 2 });
  });

  it('reads 0 and blank as zero products and keeps the raw value', () => {
    expect(solution('525').productIds).toEqual([]);
    expect(solution('525').rawProducts).toBe('0');
    expect(solution('393').productIds).toEqual([]);
    expect(solution('393').rawProducts).toBe('');
  });

  it('keeps insulation "-" as not stated, never 0', () => {
    expect(solution('334').insulation).toBeNull();
    expect(catalogue.solutions.filter((item) => item.insulation === null)).toHaveLength(8);
  });

  it('flags the six rows with incomplete substrate detail', () => {
    const incomplete = catalogue.solutions.filter((item) => !item.substrateComplete).map((item) => item.id);
    expect(incomplete).toEqual(['853', '943', '944', '946', '952', '955']);
  });

  it('never produces a fragment of a split product name', () => {
    expect(catalogue.products.map((item) => item.name)).not.toContain('401 & 802');
  });
});

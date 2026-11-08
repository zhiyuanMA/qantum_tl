import { parse } from 'csv-parse/sync';

export interface CatalogueProduct {
  id: string;
  name: string;
}

export interface CatalogueSolution {
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

export interface Catalogue {
  solutions: CatalogueSolution[];
  products: CatalogueProduct[];
}

const collapse = (value: string) => value.replace(/\s+/g, ' ').trim();

/** One product name contains ", ", so only a comma with no following space separates products. */
export function splitProducts(raw: string): string[] {
  const value = raw.trim();
  if (value === '' || value === '0') return [];
  return value.split(/,(?! )/).map(collapse).filter(Boolean);
}

export const productId = (name: string) =>
  collapse(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const minutes = (value: string): number | null => {
  const parsed = Number(value.trim());
  return value.trim() === '' || Number.isNaN(parsed) ? null : parsed;
};

/** "FR plasterboard," has a category but no detail after the comma. */
const isSubstrateComplete = (substrate: string) => {
  const [, ...detail] = substrate.split(',');
  return detail.join(',').trim() !== '';
};

export function parseCatalogue(csv: string): Catalogue {
  const rows = parse(csv, { columns: true, bom: true, skip_empty_lines: true }) as Record<string, string>[];
  const products = new Map<string, CatalogueProduct>();

  const solutions = rows.map((row): CatalogueSolution => {
    const field = (name: string) => {
      const value = row[name];
      if (value === undefined) throw new Error(`Missing CSV column: ${name}`);
      return value;
    };
    const names = splitProducts(field('Products'));
    const ids = names.map((name) => {
      const id = productId(name);
      products.set(id, { id, name });
      return id;
    });
    return {
      id: field('Internal Code'),
      supplierRef: field('Supplier Ref. Code'),
      supplier: field('Supplier'),
      orientation: field('Orientation'),
      substrate: field('Substrate'),
      substrateComplete: isSubstrateComplete(field('Substrate')),
      serviceClassification: field('Service Classification'),
      serviceType: collapse(field('Service Type')),
      serviceSize: field('Service Size'),
      integrity: minutes(field('Integrity')),
      insulation: minutes(field('Insulation')),
      productIds: ids,
      rawProducts: field('Products'),
    };
  });

  return {
    solutions,
    products: [...products.values()].sort((a, b) => a.id.localeCompare(b.id)),
  };
}

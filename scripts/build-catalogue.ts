import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseCatalogue } from './catalogue-parser';

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'data/source/solutions-excerpt-with-products-supplier-fireco.csv');
const target = path.join(root, 'data/generated/catalogue.json');

const output = `${JSON.stringify(parseCatalogue(readFileSync(source, 'utf8')), null, 2)}\n`;

if (process.argv.includes('--check')) {
  if (readFileSync(target, 'utf8') !== output) {
    console.error('data/generated/catalogue.json is out of date. Run npm run catalogue.');
    process.exit(1);
  }
  console.log('Catalogue is up to date.');
} else {
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, output);
  console.log(`Wrote ${path.relative(root, target)}`);
}

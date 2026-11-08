# Data notes

## Supplied catalogue

`data/source/solutions-excerpt-with-products-supplier-fireco.csv` is the unmodified supplied file: 148 rows and 13 columns. `Internal Code` and `Supplier Ref. Code` are both unique, and `Internal Code` is the solution ID.

Products per solution:

| Products | 0 | 1 | 2 | 3 | 4 | 5 |
|---|---:|---:|---:|---:|---:|---:|
| Solutions | 4 | 8 | 57 | 54 | 23 | 2 |

There are 36 distinct products. The most shared, FIRECO MASTIC 600ml, appears in 134 of 148 solutions, which is why demand must be pooled across visits.

## Mappings

| Issue | Handling |
|---|---|
| Products are comma-separated, and one product name contains ", " | Split only on commas not followed by a space, then assert 36 products |
| Inconsistent spacing in names | Collapse whitespace for the ID and keep the original for provenance |
| No product ID | Derive a slug from the normalised name. It changes if the name changes, so production needs a stable product ID from the specification or supplier source |
| Zero products is written as `0` (521, 525, 533) or blank (393) | Both mean zero products; keep the raw value |
| Insulation of `-` (8 rows) | Stored as not stated; never treated as 0 |

## Observations, kept as supplied

We do not correct source data.

- The brief names the supplier as Ryanfire. The file says FireCo, while several product names begin RYAN.
- Collar size looks inconsistent with service size on some rows, such as 552 (Ø50 with 160mm collar) and 708 (Ø50 with 25mm collar). Others may be explained by insulation thickness.
- Zero products looks surprising on some rows, such as 525 (Ø225mm PVC, 120/120).
- Solution 393 has a service size of `60` with no unit.
- Six rows have incomplete substrate detail: 853, 943, 944, 946, 952 and 955.

## Technically identical solutions

These five pairs match on orientation, substrate, service type, size, integrity and insulation.

| Pair | Product lists | Candidate? |
|---|---|---|
| 451, 464 | Different | Yes |
| 707, 708 | Different | Yes, but 708's collar size is questionable |
| 722, 724 | Different | Yes |
| 733, 736 | Same | No: it gives no stock benefit |
| 944, 946 | Different | No: substrate detail is incomplete |

## Sample data

Everything below is invented for this exercise, stored under `data/sample/`, and labelled in the UI. None of it describes real usage, stock or approvals.

| Data | Purpose |
|---|---|
| Teams, leaders, sites, visits, scenarios | Plans across two teams and two stock pools |
| Usage rules | Quantity per penetration for each solution and product pair used in the demo. The brief requires this sample data, as the catalogue has no quantities. One gap is deliberate, to show Needs data review |
| Stock, deliveries, reservations | Shortage, conflict, delivery and stale cases |
| Alternative approvals | One approved and scoped sample, using a real catalogue pair |

Scenarios use real solution codes, so product lists are supplied data while all quantities are sample data.

The JSON files stand in for what source systems would return through the ports. They are not a database schema: this slice stores nothing outside the browser, and the contract is the domain types in `src/domain/types.ts`. A real integration adds an adapter that maps its source to those types. Dates are stored as offsets from today, such as `plannedOffset`, `asOfHoursAgo` and `validForDays`, and the adapter turns them into dates, so the public demo never goes stale. IDs are readable strings, such as `pool-central`, which keeps tests and the demonstration legible. The domain treats every ID as opaque, so UUIDs or source system codes would work unchanged.

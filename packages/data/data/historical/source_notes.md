# M5 historical source notes — eight 1900 polities

Status: **provisional authored sample**. This is the initial M5 historical-data
pipeline and sample content, not a complete historical reconstruction of
1900–2000 and not a world-total dataset.

## Files

| File | Content |
|---|---|
| `scenarios/m5_eight_polities.json` | Scenario metadata, source registry, provisional age profile, and file/definition references |
| `historical/countries_1900.json` | Eight polities, currency identity, border policy, fiscal settings, treasury opening cash |
| `historical/regions_1900.json` | Sixteen authored regions |
| `historical/markets_1900.json` | Five markets and their region membership |
| `historical/pops_1900.json` | Region × profession population blocks with literacy, wealth, savings, and militancy |
| `historical/buildings_1900.json` | Authored building instances |
| `historical/employment_1900.json` | Initial employment assignments (empty; the first tick performs the validated assignment) |
| `historical/calibration_targets_1900.json` | Population and occupation-structure targets with source, tolerance, confidence, and status |

The loader in `packages/data/src/historical.ts` validates these tables, expands
population totals to five-year age/sex inputs, allocates deterministic account and
instance ids, and produces an `EconomyScenarioDef`. No country-specific historical
exception is embedded in simulation code.

## Sample polities

United States, United Kingdom (including Ireland), German Empire, France, Russian
Empire, Empire of Japan, British India, and Brazil. The sample spans
industrialized, agrarian, resource-rich, and dependent/colonial conditions. It
excludes most of the world: the eight polities total roughly 648 million people
against the M2 1900 world estimate of about 1.62 billion.

## Sources

- **Population totals** — Our World in Data long-run population series and the
  Maddison Project Database 2023, accessed 2026-10-26 (CC BY 4.0). Values are
  rounded national estimates for 1900. Russia, India, and Brazil use wider
  tolerances because imperial/colonial boundaries and early census coverage are
  uncertain. The sample does not reconcile to the M2 world aggregate and must not
  be read as a world total.
- **Occupation structure** — broad historical agricultural-employment
  reconstructions as summarised by Our World in Data's employment-by-sector
  material, accessed 2026-10-26 (CC BY 4.0). These are wide, low-confidence ranges,
  not measurements. The authored metric is the **share of population living in
  peasant/agricultural households**, a household-composition proxy. It is *not*
  the GDD's employed-worker agricultural share. The simulation has no
  profession-promotion/demotion mechanic in M5, so this checks the authored
  baseline only; it does not validate a century-scale occupation trend.
- **Age structure** — the provisional 1900 world five-year age profile already
  used by the M2 campaign (`scenarios/m2_world_aggregate.json`). The same profile
  is applied to every country because no country-specific 1900 age structure is
  authored. This is a documented provisional transformation; it is not a
  historical age observation and cannot support age-structure validation.
- **Market membership, region boundaries, building levels, fiscal settings,
  border policy** — authored for this sample (`project-authored-sample`). The
  North Atlantic, Continental European, Asian, Russian, and Brazilian market
  groupings are a simulation simplification, not historical trade agreements.
- **Currencies and valuations** — each country issues its own currency for
  identity purposes. All valuations are explicitly `unavailable`; M5 performs no
  FX conversion and SUSD remains the accounting unit. No 1900 exchange rates are
  invented.

## Transformations and assumptions

1. Population totals are rounded national estimates; the split across regions and
   professions is an authored provisional allocation, not observed data.
2. Each block total is expanded to 17 five-year male and female bands by
   proportional largest-remainder allocation from the shared age profile. Sums are
   exact; within-band single-year expansion remains the documented M2 assumption.
3. Initial household savings are `population × savingsPerCapitaSUSD`; the
   per-capita values are provisional structural inputs, not measured wealth.
4. Building levels are authored to provide substantial employment capacity for
   the authored population. The M3 recipes and needs baskets are provisional
   synthetic parameters; they are **not** calibrated to actual 1900 subsistence,
   wages, or output. The sample is therefore a structural/invariant test world,
   not a historical welfare model.
5. Initial employment is empty and the simulation's deterministic assignment
   runs on the first tick. Cross-region labor is domestic; cross-country labor
   requires the destination country's provisional open-border flag.
6. Market membership is authored. Each country's regions are in one market; the
   shared markets exercise cross-country pooled clearing. Initial market prices
   use the goods definitions' `basePrice1900SUSD`; no market-specific 1900 price
   data is claimed.
7. Fiscal settings are illustrative flat income-tax rates and zero welfare
   budgets. They are not historical tax schedules and the model is not a
   historical public-finance reconstruction.

## M5a profit-allocation content

The scenario metadata enables `profitDistribution` with a provisional 0.5 private
payout rate and a 1.0 state remittance rate. The authored historical buildings are
private, so this exercises private distributions only; state-enterprise ownership
and remittance are supported by the engine and covered by focused fixtures, not by
this eight-polity sample. The rates are provisional structural policy inputs, not
historical dividend or state-enterprise observations.

## M5b debt content

The authored historical sample does not enable public debt: its countries default to a
disabled debt policy and no contracts. M5b contract issuance, interest, maturity,
refinancing, arrears, and default are exercised by focused simulation fixtures, not
by this sample. No historical debt stocks, coupons, or creditor identities are
claimed.

## Known limitations

- No century-scale historical population/occupation trend validation is claimed.
  The M3 production/needs parameters are not historically calibrated, and M5
  implements migration and labor mobility but not profession promotion/demotion.
- Country-specific 1900 age structures, regional populations, urbanization,
  literacy, wealth, and output are provisional authored inputs.
- No FX conversion, inflation, GDP, or government-services data is included;
  those systems belong to other milestones or remain future work.
- The eight-polity sample is not a world total and its market groupings are not
  historical trade blocs.

## Updating the data

Keep the tables editable independently of simulation code. Every population,
region, market, and country entry must reference a registered source id. Every
country must have one `totalPopulation` target and one provisional
`peasantPopulationShare` target; the validator rejects authored values outside
the declared tolerances. When adding a source, record its title, URL, access
date, license, and limitations here and in the scenario source registry.

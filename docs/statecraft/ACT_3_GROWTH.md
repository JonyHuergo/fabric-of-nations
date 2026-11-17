# Act III — Growth (S9 to S12)

The peacetime economy gets its engine: transport that makes places differ, firms that invest and
fail, banks that lend and panic, and knowledge that changes how things are made. This act carries
the Prosperity Program's P8 to P13 (program §5.2) and the technology rework (program §10).

Each stage begins with a stage plan approved by the designer (handbook §5). The briefs below fix
the design, the data model and the traps; the plan settles formulas and coefficients.

Read first: `HANDBOOK.md`, `CONTRACTS.md` (all), program §5 and §10,
`docs/PROSPERITY_PROGRAM.md` (P8 to P13), `docs/COMPANIES_AND_CAPITAL_MARKETS_PROPOSAL.md`.

**For every stage of this act:** the definition of done of handbook §8 applies in full. Each
system ships its Desk cards, lens, Gazette events, AI use, indicators and forecasts.

---

## S9 — Infrastructure, market access, merchant shipping

**Goal.** Where a place is, and how it is connected, decides what things cost there. Building a
railway visibly changes a province. (Prosperity P8.)

### Model

- **Stock.** Per province: railway (capacity in tonne-kilometres a day), roads (a level), a port
  (capacity) if coastal. Built by construction projects from steel, timber, construction materials
  and labour; depreciates; needs upkeep. Typed columns.
- **Network.** The province adjacency graph already exists. An edge is served by rail when both
  provinces have rail. The cost of moving a tonne from each province to its territory's hub (a
  cheapest path over rail, road and sea) is recomputed only when infrastructure changes.
- **The wedge.** Each customs territory still clears at one price. A province pays a transport
  wedge on what it buys from the pool and loses one on what it sells to it. The wedge is the
  freight cost, by the good's bulk class (data: bulk, general, light). Trade inside a province
  pays none.
- **Freight is a real service.** The wedge is paid to the transport providers (railway and
  shipping buildings, which employ people and burn coal). It is income for them, not value lost.
- **Cohorts and access.** Prices now differ by province, which would break the cohorts of
  `CONTRACTS.md` §2. Group the provinces of a territory into a few **access bands** by freight
  cost and add the band to the cohort key. Do not clear per province.
- **Merchant shipping.** Tonnage by flag is real capital stock built in shipyards. Sea routes buy
  carriage at a freight rate that rises when tonnage is scarce; carriage can be bought from
  foreign flags. S21 will sink this tonnage.
- **1900 data.** Railway length by country from a cited source, distributed over provinces by
  sourced lines where available and otherwise by the people and activity there, never by
  potential (handbook §9). Merchant tonnage by flag from a cited register. Check
  `docs/MAP_DATA.md` for railway geometry already in the map bundle.
- **Hooks for later stages.** Expose as indicators: the rail capacity of a province and of a path.
  S18 uses them for mobilisation speed and S20 for supply. Write no military code here.

### Play

| Hook | Content |
|---|---|
| Decisions | Where to build (long press on a province); a railway programme with a budget; subsidy or state construction |
| Cards | "Province X is cut off: bread costs 30 % more than at the hub"; "The line to Y is finished" |
| Lenses | Market access (freight cost to the hub); railways; port traffic |
| Gazette | Great lines completed; a port overtakes another |
| AI | The economy ministry builds where the gain (price gap × volume) per cost is highest |

### Acceptance

- Building a railway in a fixture raises the farm-gate price and the commercial output of that
  province (the Prosperity criterion).
- Freight money is conserved: what buyers and sellers pay as wedge equals what transport providers
  receive.
- Railway length by country in 1900 matches its source within the tolerance of the plan.
- Steel demand moves toward the 1900 output (it is at a quarter of it today for lack of
  construction demand); report the ratio.
- The number of cohorts and the cost of the market round stay inside the budget.

### Traps

Clearing each province separately. A wedge that destroys value. Recomputing paths every day.
Placing 1900 railways by where they "should" be. Military rules.

---

## S10 — Firms, investment and ownership

**Goal.** Buildings belong to firms that keep accounts, invest where returns are high, shrink,
close and go bankrupt. The state can own, buy and sell. (Prosperity P9, P10 and P12 in one stage.)

### Model

- **Firm**: id, name, territory, industry, owner (private owners' blocks, the state, a foreign
  country's owners), buildings, a cash account, debt, retained earnings. Columnar. Small-scale
  production (peasants, farmers, shopkeepers, crafts) stays owner-operated and has no firm.
- **1900 firms.** A generator groups the existing buildings into firms per territory and industry
  with a documented size distribution. Known houses of 1900 are named from a sourced list; the
  rest get generated names. Aim for at most about 5,000 firms worldwide.
- **Investment** (monthly). A firm compares the expected return of expanding in the provinces it
  knows with its cost of funds (a provisional required return by territory until S11 supplies an
  interest rate). It finances from retained earnings, orders construction through the existing
  construction system and so buys real steel, machinery, materials and labour. This replaces the
  investment closure of S1; delete that code.
- **Contraction.** Sustained losses → lower staffing (the ceilings exist) → mothballing → closure.
  A firm with no cash and no credit is bankrupt: its assets are sold at a discount or scrapped,
  its workers are laid off, its owners lose their equity. No money is created or destroyed.
- **Entry.** Owners with capital found a firm where returns are high and no incumbent expands.
- **Dividends** go to the owners' blocks (the profit distribution of M5a). Foreign-owned firms pay
  them across the border.
- **The state.** State firms get targets and a budget. Nationalisation is a law with compensation
  in real money or bonds (or without it, at a diplomatic cost from S16). Privatisation is a sale
  for real money.

### Play

| Hook | Content |
|---|---|
| The player's role | Sets conditions (taxes, tariffs, subsidies, infrastructure, schooling, concessions); does not run private firms |
| Cards | "Krupp asks for a tariff on rails"; "The Putilov works will close: 12,000 jobs"; "A foreign house offers to build the tramways" |
| Screens | Industry lists the largest firms with their state; the place sheet lists the firms of a province |
| Lenses | Investment; profitability |
| Gazette | Foundings, bankruptcies, great expansions, nationalisations |
| AI | Sets the same conditions; manages its state firms |

### Acceptance

- In a growing fixture, profit is reinvested where the return is highest (cause-isolating test).
- A loss-making firm closes; a bankruptcy conserves money and goods exactly.
- Nationalisation and privatisation conserve; compensation is a real payment.
- In the 1900 world, investment as a share of product is reported against a provisional band of
  5 to 15 %; machinery and steel demand rise.
- Firm decisions run monthly, inside the budget.

### Traps

An "investment" pool or points. One firm per building, or one per country. Firms that see the
future. Investment that buys no goods. Nationalisation that creates money. Letting the player
micromanage private firms.

---

## S11 — Banks, credit, bonds, gold; panics

**Goal.** Saving is lent, the interest rate is a result, and credit can boom and break. Designed
for drama and for the player's understanding, not for completeness. (Prosperity P11 and a reduced
P13.)

### Stop first

The monetary accounting must be designed before any code: what counts as base money (coin, notes,
gold), what a deposit is (a claim on a bank), how the existing designated-cash invariant is
restated, and how lending is recorded. Read `packages/sim/src/economy/monetary.ts`, `mint.ts`,
`debt.ts`, the D-140, D-149 and D-152 entries and `docs/P5B_GOLD_SILVER_PLAN.md` first. Put the
design in the stage plan and **stop for approval**. Integrate with the existing currency, mint and
exchange-rate code; do not build a second monetary system beside it.

### Model

- **Banks.** A few named banks per major country, one aggregate elsewhere. Balance sheet:
  deposits; reserves; loans to firms; government bonds; equity.
- **Credit.** Banks lend up to a reserve ratio. Firms borrow when the return of S10 beats the
  rate. The rate of a territory results from loan demand, lendable funds, the central bank's
  discount rate (the monetary policy action exists) and gold flows.
- **The gold standard.** A trade deficit drains gold, lowers reserves and raises the rate. The
  monetary demand for gold and silver of D-152 lands here: free coinage, mints buying at a fixed
  price, token silver, India's coinage and hoarding.
- **Bonds.** The debt contracts of M5b gain holders (banks, upper-stratum households, foreign
  investors) and a yield from demand. Default is a crisis and, from S16, a diplomatic one.
- **Failure and panic.** A bank fails when losses exceed its equity. A run is a keyed draw whose
  hazard rises with low reserves and failures nearby. Failures destroy deposits, credit contracts,
  demand falls. Levers: the discount rate, a bank holiday, a bailout with real money, a lender of
  last resort where the institution exists, leaving gold.
- **Shares, reduced.** A listed firm has a share price from expected earnings and the interest
  rate, with margin loans from banks so that a fall in prices stresses banks. An index per
  exchange. Mergers into trusts where the law allows. No order book.

### Play

| Hook | Content |
|---|---|
| Cards | A run on a bank; "The central bank asks to raise its rate to defend gold"; a bond issue is undersubscribed; a bailout request |
| Screens | Money: the interest rate with its "why", the banks' health, bond yields, the share index |
| Lenses | Credit growth; bank stress |
| Gazette | Panics, failures, crashes, defaults |
| AI | Finance manages debt; the central bank follows a rule by regime (defend the parity, or support activity) |

### Acceptance

- The restated money invariants hold in every run; no negative deposits; no money from nowhere.
- A boom-and-bust fixture: rising leverage, a shock, failures, contraction, recovery.
- A gold-standard fixture: a deficit country loses gold and its rate rises.
- A 30-year Observatory run shows at least one financial crisis in a share of seeds agreed in the
  plan and no permanent collapse; core-country interest rates stay in a band of 2 to 8 %.

### Traps

Runs and crashes as pure random events without causes, or by date. An interest rate that is a
free scalar. Duplicating the existing currency and exchange-rate code. Money created by a loan
without its counterpart entry.

---

## S12 — Knowledge: fields, inventions, diffusion, production methods

**Goal.** Technology stops being a tree of bonuses. Knowledge is discovered by people, spreads
between countries and changes nothing until someone invests in using it (program §10). This stage
replaces `packages/data/data/technology.json` and `packages/sim/src/economy/technology.ts`.

### Model

- **Data.** Twelve fields. About 180 inventions, each with: field, prerequisites, an earliest
  plausible year, the work it takes, and what it enables (production methods, goods, building
  types, equipment types reserved for S19, health and schooling effects, institutions). For 1900:
  what the world has already invented and each country's know-how per invention (a rule by country
  group plus sourced exceptions, marked provisional).
- **State.** For each invention: whether and where it was first made. Per country and invention: a
  know-how level from 0 to 1. Per country: research staff by field; programmes.
- **Frontier** (monthly). The chance that a country makes an invention rises with the qualified
  work of its academics and engineers in the field (real, paid people in universities, firms'
  laboratories and arsenals) and with its know-how of the prerequisites. A keyed draw decides. The
  earliest year is a soft ramp on the hazard, documented as a prior for everything not modelled;
  it is not a date on which something unlocks.
- **Diffusion** (monthly). Know-how grows toward 1 through named channels: reading (openness,
  universities), imports of the goods that embody it, licences (a payment), foreign experts and
  students abroad (actions with costs), foreign-owned plants (S10), later espionage (S16) and
  capture (S20). The speed depends on the country's engineers and schools.
- **Use.** Each building type has a ladder of production methods in data, each with inputs, labour
  by profession, output and capital. A firm adopts a method when it pays, has the know-how and
  buys the machinery; retooling takes time. The state adopts for its own buildings and can
  mandate or subsidise.
- **New goods** enter household demand through the Engel system. The need gate by technology
  already exists (`needGate` in `economy/day.ts`, D-147); reuse it.
- **Health and schooling effects** apply in proportion to know-how and to what was actually
  deployed (staff, waterworks, programmes), not on discovery.

### Migration of the old content

List the 125 old technologies in the plan and map each to an invention, a method or deletion.

### Play

| Hook | Content |
|---|---|
| Levers | Weights of research staff between fields; funding; the education of engineers; patent and openness laws; licences, experts and missions; state programmes for one invention or project |
| Cards | "Chemists report progress on fixing nitrogen: fund a programme?"; "A firm asks to license the open-hearth process"; "Send a mission abroad?" |
| Screen | The knowledge map: fields as rows, time as columns, the world frontier, the country's position, who leads, the cheapest way to close each gap. Dates are shown as ranges |
| Lens | Method in use, by industry |
| Gazette | Inventions, first uses, adoptions |
| AI | The education ministry sets field weights from the strategic weights and buys know-how when it pays |

### Acceptance

- No flat productivity bonus remains anywhere in data or code (test).
- Know-how alone changes nothing: a fixture with full know-how and no investment has unchanged
  output.
- Adoption changes inputs, labour and output as the method's data says.
- Diffusion is faster with more engineers and more openness (cause-isolating tests).
- A hundred-year Observatory run reports the adoption order and dates of key inventions and the
  growth of productivity against provisional bands; nothing appears absurdly early or never.
- Determinism; monthly cost inside the budget.

### Traps

A modifier under a new name. A pool of research points detached from people and fields. A hard
date that unlocks. Every country inventing everything alone. An invention with no visible effect
on jobs, goods or prices. A tree of buttons as the interface. Evaluating methods per building per
day.

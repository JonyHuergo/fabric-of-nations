# Companies and capital markets — feasibility and architecture proposal

**Status:** proposal for designer review (D-123). Nothing in this document is
implemented. Implementation is staged as P9–P13 of the Prosperity Program
(`docs/PROSPERITY_PROGRAM.md`) and begins only after P1–P8 are accepted, because
company decisions need wages, prices, land, infrastructure and the labour market to be
meaningful.

## 1. Feasibility verdict

Feasible and compatible with the existing architecture, provided that:

1. A company is an **owner and decision-maker**, not a producer. Buildings keep doing
   the production; a company owns buildings and holds the balance sheet. This reuses
   every existing production, market, settlement and tax path unchanged.
2. Companies are **aggregated representative firms**, not every historical business.
   Expected count: one company per (owner group, sector, customs territory) at start,
   splitting and merging as the game runs; a bounded ceiling of 4,096 live companies.
3. Share prices are **derived from fundamentals plus bounded deterministic flows**, not
   an order book. Trades happen in monthly batch auctions.
4. The player is **the state**. "Player investments" are government investments made
   with treasury cash through validated actions. The player has no private fortune
   (no gameplay pool, GDD §2).

## 2. Entities

```
Company {
  id, key, name, homeCountryId, sector,
  legalForm: "proprietorship" | "partnership" | "joint-stock" | "state-enterprise",
  listedExchangeId | null,
  buildingIds[]                // establishments it owns
  sharesOutstanding            // integer
  shareholdings[]              // { holderKind: popBlock | country | company, holderId, shares }
  foundedOnDay, status: "active" | "insolvent" | "dissolved"
}
Exchange { id, countryId, openedOnDay, listedCompanyIds[], lastAuctionDay, indexLevel }
```

Accounts (new subtypes on the existing double-entry ledger):
`company-cash`, `company-equity`, `company-retained-earnings`, `company-debt`,
`dividend-payable`, plus holder-side `equity-holdings` and `dividend-income`. The
existing building `operating-cash` remains as working capital; the company sweeps
surplus cash up and funds deficits down through balanced internal transfers.

## 3. Integration with existing systems

| System | Integration |
|---|---|
| Production / markets / settlement | Unchanged. Buildings still buy, produce, sell and pay wages. |
| M5a profit distribution | Replaced for company-owned buildings: building results roll up to the company; the company pays dividends to shareholders pro rata to shares. |
| E2 business-profit tax | Assessed on the company's consolidated result instead of per building. |
| E3/E4 public construction and support | A completed state project creates or joins a state enterprise company. |
| P10 investment | The company is the investing agent: compares expected returns across building types and provinces in its customs territory; finances from retained earnings, then debt (P11), then new shares (P13). |
| P7 labour market | Unchanged; companies employ through their buildings. |
| E6a trade | The shipping building stays the consignor; the company funds freight/duty shortfalls instead of the household owner. |
| M8 politics | Capitalist and aristocrat interest-group influence uses their actual equity holdings; nationalisation and privatisation become law-gated actions. |
| E6b money | Dividends, share purchases and bank flows are RUSD postings; display is local currency (P3). |

## 4. Stages

### P9 — Companies and company finance (C1)
- Every existing building is assigned to a company at scenario load: private buildings
  to private companies grouped by (owning block, sector, customs territory); state
  buildings to one state enterprise per (country, sector).
- Consolidated company accounts; cash sweep; monthly dividends replacing M5a; tax on the
  consolidated result; company screen (list, detail: buildings, employees, revenue,
  costs, profit, cash, owners).
- Tests: consolidation equals the sum of building results; dividends conserve cash; no
  building belongs to two companies; save/load; determinism.

### P10 — Private investment, expansion, contraction, bankruptcy (C2)
- Monthly: each company ranks candidate projects (new building, level expansion) by
  expected return over cost against a hurdle rate; builds with real labour and
  materials; reduces levels or closes loss-making establishments after a sustained loss
  window; insolvency when cash and credit cannot meet wages and debts → assets sold or
  transferred to creditors, workers released.
- Tests: tariff-protection fixture increases protected-sector investment; sustained loss
  leads to closure; bankruptcy conserves assets and cash.

### P11 — Banks, credit and bonds (C3)
- Banks are companies with deposit liabilities and loan assets; households deposit
  savings; companies and governments borrow; the interest rate clears loan demand
  against deposit supply each month within reserve rules; defaults are explicit. This
  resolves GDD §17A.16 banking/credit and lets E6b gain a policy rate.
- Tests: deposits + bank equity = loans + reserves; interest conservation; default path.

### P12 — State and mixed ownership (C4)
- Player actions: buy a stake, nationalise (with compensation set by law: market price,
  book value or none), privatise (sell shares to households/companies), found a state
  enterprise. Each is law-gated and cash-backed.
- Tests: compensation postings balance; ownership shares always sum to outstanding
  shares; confiscation without compensation raises the expected political effects only
  through M8 interest groups.

### P13 — Stock exchanges and share trading, mergers (C5)
- Exchanges exist where historically present (London, New York, Paris, Berlin,
  Amsterdam, Vienna, St Petersburg, Tokyo, Buenos Aires, Bombay, ... with founding
  dates as data) or when a country enacts the enabling law later.
- Listing requires joint-stock form and a size threshold. Monthly batch auction per
  exchange: households (by class) and companies submit demand derived from savings
  allocation rules; price moves toward a fundamental value (discounted expected
  dividends at the P11 rate) with bounded deterministic adjustment from net order flow.
  No random noise beyond keyed draws with stable purposes.
- Market capitalisation, index, dividend yield; IPOs and secondary issues finance P10
  investment; mergers and acquisitions as company actions when a buyer values a target
  above its market price.
- Tests: shares conserved; cash conserved; price bounded and finite; same inputs → same
  prices; a dividend cut lowers price in expectation.

## 5. Historical accuracy

- 1900 legal forms and depth differ: deep joint-stock markets in Britain and the United
  States; bank-centred finance in Germany and Austria-Hungary; family and holding groups
  in Japan (zaibatsu); heavy foreign ownership and state enterprise in Russia, the
  Ottoman Empire and Latin America (railways, mines). These are data: per-country share
  of joint-stock ownership, foreign holdings, exchange presence.
- Foreign direct investment (a British company owning Argentine railways) requires
  cross-territory company ownership; it is planned in P10 as investment into another
  customs territory, subject to the target country's law.
- Twentieth-century arc to support: nationalisation waves (USSR 1917–18, Mexico oil
  1938, post-1945 Western Europe, decolonisation), privatisation (1980s), crashes (1929)
  as emergent outcomes, not scripts.

## 6. Performance

| Cost | Bound |
|---|---|
| Companies | ≤ 4,096 live; typed-array balances |
| Daily work | none beyond existing building settlement (company roll-up is monthly) |
| Monthly investment | O(companies × candidate types × provinces in territory), capped by evaluating top-k provinces per type from a cached return map |
| Monthly auction | O(listed companies × holder classes); ≤ ~2,000 listings |
| Shareholdings | sparse; capped per company (aggregated holders by class and province) |

Expected cost is dominated by P10 investment evaluation; it runs monthly and is
benchmarked at full scale in P10.

## 7. Open questions for the designer

1. Should the player be able to direct state enterprises' investment, or only set their
   mandate (profit, employment, regional development)?
2. Should foreign direct investment be allowed by default or gated by law from the start?
3. Should the 1929-style crash be possible only through emergent dynamics (proposed), or
   also through scripted historical events?

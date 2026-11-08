# P5b — Demand for gold and silver in 1900 (plan for D-152)

**Status:** decided by the designer on 2026-11-08 (D-152). Jewellery (§4.3) is
implemented in P5b as a good made by a jeweller's workshop from gold, silver and labour
(the designer's choice over a direct need for the metal, so that jewellery demand is also
demand for the jewellers' work). Free coinage (§4.1), the circulation need (§4.2) and gaps
4–6 are deferred to P11. §4–§8 below are kept as the proposal that was reviewed.
**Settles:** D-146 A7 (the gold and silver production model, after D-140) on measured
numbers. **Builds on:** D-149 (metal standards, the mint window), D-150 (currency actions).
**Scope asked by the designer:** items 1–3 of the gap list below: free coinage, money that
grows with the economy, jewellery and industrial demand.

## 1. What absorbed the metal in 1900 (sourced)

Source: *Annual Report of the Director of the Mint for the fiscal year ended June 30, 1901*
(cached as `.cache-p5b/ia-pdf/mint1901.pdf`; PDF page = book page + 6). Every figure below
was read from the page image.

| Item | Gold | Silver | Locator |
|---|---|---|---|
| World production 1900 | 385,103 kg | 5,681,363 kg | *Mineral Industry* vol. IX (already in `sources_1900.json`) |
| World industrial consumption 1900 (jewellery, plate, watch cases, gilding, dentistry, photography, …), 18 countries + "other" | 112,696 kg (29.3 %) | 1,277,146 kg (22.5 %) | p. 50 (PDF 56). Silver rows sum to the printed total; gold rows sum to 112,693, 3 kg below it. |
| Coinage of all mints, 1900 (includes recoinage of old coin, so not new metal) | $354,936,497 | $177,011,902 (coining value) | p. 53 (PDF 59) |
| Change in monetary gold stocks during 1900 | United States +$90.6 M, Great Britain +$24.3 M, Germany +$23.1 M, India +$21.2 M; Russia −$67.4 M, Austria-Hungary −$14.9 M, Japan −$19.3 M | India +$80.4 M ($389.3 M → $469.7 M) | p. 44 (PDF 50) |
| India's rupee coinage 1900 | – | £11.43 M sterling ≈ 171 M rupees × 10.69 g fine ≈ 1,830 t (32 % of world output), bought by the Government of India and paid for by exporting gold | p. 44 (PDF 50) |

So of the 1900 output roughly 29 % of the gold and 22 % of the silver went into the
industrial arts. Most of the rest of the gold went into coin and bank reserves (the
monetary stocks of the gold countries grew while Russia, Austria-Hungary and Japan drew on
theirs). The largest single destination of silver was India's new rupee coinage. The
remainder went to China and the East as money, hoards and ornaments, and to subsidiary
(token) coinage in the gold countries.

The industrial figures are gross: they include remelted old jewellery and coin. In the
United States in 1900 the private refiners' gold for the arts was about 44 % old material
and the Philadelphia mint and New York assay office about 4–16 % (p. 46–47). The share of
new metal must therefore be estimated (§4.3).

## 2. What the game does today (measured, D-149)

- **No household or industry buys gold or silver.** No need item and no recipe uses either
  metal.
- **The only buyers are 23 mints** (20 gold, 3 silver). A mint pays from a reserve-cash fund
  set once at world creation: one year of its country's own 1900 output, at most 25 % of the
  P5 treasury. Purchases are an asset swap (plan §13.8), so the fund is a stock, not a flow.
  - Eight mints start with no cash: Belgium, Switzerland, Denmark, Romania, Bulgaria, Cuba,
    China and Siam.
  - The US mint is capped at 659 M RUSD (63 t a year against 118 t of US output); Canada,
    Russia, the Transvaal and Mexico are capped too.
- **The mines are sized to one year of that cash.** Once it is spent, the mint can no longer
  bid. The price then moves freely and the mines lose their buyer.
- **Dependencies are not activated.** India (rupee), Egypt, the Straits, Australasia, the
  Cape and Finland have no mint. The paper currencies (Spain, Portugal, Greece, Servia,
  Haiti) have none either.
- **The circulation is fixed at its 1 January 1901 level.** It changes only by revaluation
  and the currency actions.
- **Result:** modelled ÷ sourced 1900 output, gold 0.27 and silver 0.005. Most silver
  territories get no mine.

## 3. The gaps

| # | Gap | Effect | Proposed stage |
|---|---|---|---|
| 1 | No free coinage: a mint buys only from a fixed cash fund | Demand stops after a year; gold has no price floor once the fund is spent | P5b (this plan) |
| 2 | The circulation does not grow with the economy | No lasting demand for coin, token coins or reserves; no rupee coinage | P5b, minimal form (this plan); full money demand stays P11 |
| 3 | No jewellery and industrial demand | 29 % of gold and 22 % of silver have no buyer | P5b (this plan) |
| 4 | No token silver coinage in gold countries | Part of the $177 M silver coinage has no buyer | follows from 2 |
| 5 | India and China not modelled as money users | The largest silver sink is missing | after this plan (needs India's currency and a hoarding model) |
| 6 | Silver's price has nothing to stand on | With 1–4 only, silver demand ≈ industry + Mexico + token coinage | reported after 1–4 are measured |

## 4. Proposed mechanisms

### 4.1 Free coinage (gap 1)

**Rule.** An authority with `freeCoinage: true` buys at its buy point all the metal offered
in its home market, without a cash limit. It pays by issuing currency, which is how the
1900 mints and central banks did it: the Royal Mint and the US mints coined any gold
brought to them; the Bank of England, the Reichsbank and the Bank of France bought gold at
a fixed price against notes.

**Accounting (a new transaction kind, `mint-coinage`, six equal-amount legs):**

| Account | Side |
|---|---|
| authority `monetary-metal-reserve` | debit (metal at the buy price) |
| authority `currency-liability` | credit (new circulation, units = amount ÷ valuation) |
| external `external-currency-holding` | debit (the outside holder of the circulation receives it) |
| external `external-cash` | credit (and pays its RUSD equivalent) |
| seller building `operating-cash` | debit |
| seller building `sales-revenue` | credit |

This is the E6b `fx-issuance` pattern joined to the D-149 purchase. In this world all
domestic payments are in RUSD and a national currency's circulation is the external
counterparty's claim (D-080, D-149). Free coinage therefore adds RUSD to the domestic
economy, in the amount of new metal coined. That is a new, documented money source: the
cash-conservation tests list it beside the other external flows.

**Price formation.** `mintStandingOffers` gives a free-coinage mint an unbounded buy
capacity at its buy point, so the metal's price cannot fall below it. Sales at the export
point stay limited by the reserve (D-149).

**Data.** `freeCoinage` per authority comes from the Mint report's country answers
("coinage of gold free / on government account"), tabulated in `sources_1900.json`.
Expected: free for gold in the 20 gold authorities (by mint or central bank); free for
silver only in Mexico (and China, standing in for private sycee casting); not free for
silver in the gold countries.

**Consequences.**
- Gold mines face an infinitely elastic buyer at the mint price. Their 1900 level can no
  longer come from "modelled demand". Proposal: the 1900 level of each gold or silver mine
  follows the sourced 1900 output (D-146 A5 exception for monetary metals), and the
  simulation then lets mines expand or close on their own costs against the mint price.
- The D-149 treasury funding of mint cash is no longer needed to buy metal. It is still
  needed to sell metal (the export point pays the mint in the dealer's cash). Proposal:
  keep it, uncapped by own output, at a sourced reserve ratio. Alternatively drop it: then
  the opening reserve is the sourced metal stock only.
- Money supply grows with mining. Valuation stays at the metal's price, so a metal currency
  does not inflate against its metal; prices in RUSD are unaffected unless 4.2 is built.

### 4.2 Circulation that grows with the economy (gap 2, minimal form)

**Rule.** Each month an authority computes the circulation its economy needs:

```
needed circulation (units) = k × nominal national income in the currency (units per year)
k = the sourced 1 January 1901 circulation ÷ the 1900 national income (calibrated per country)
```

- When the actual circulation is below the need, the authority buys metal at the market
  price for coin. A metal standard buys gold. A gold country with token silver buys silver
  for its limited-tender coins at the sourced token share of its circulation (the Mint
  table's "silver limited" column, e.g. US 86.9 of 2,195 $ M). A token coin's legal value
  exceeds its metal, and the difference is seigniorage to the treasury.
- When it is above the need, nothing happens (coin is not withdrawn). Free coinage (4.1) can
  still raise the circulation above the need.
- **Not in this form:** the price-level effect of money (P11 money demand, banks and credit).
  This is the minimal causal link that gives the mints a recurring demand tied to growth.
  It is the part most likely to overlap P11.

**Data.** The money stocks of 1 January 1901 (already in `monetaryStocks1901`) and the P2b
1900 GDP per territory.

**Note.** For gold, 4.1 alone already gives a recurring buyer. 4.2 matters chiefly for
silver (token coinage, and later India's rupees) and for gold countries without free
coinage.

### 4.3 Jewellery and industrial demand (gap 3)

**Rule.** Gold and silver become luxury-tier need items (ornaments, plate and watch cases),
like the other luxury goods: wanted by blocks whose wealth activates the luxury tier and
bought in the market. A small industrial share (photography, gilding, dentistry) is folded
in, because the Mint table does not separate it.

**Calibration.** The per-capita quantity of each country's luxury-tier population
reproduces the Mint's 1900 table: 18 countries, and "other countries" spread by luxury-tier
population.
- The table is gross, so the need item takes only the new-metal share. Proposal: use the US
  aggregate (Philadelphia, New York and the private refiners, p. 47, to be transcribed) as
  the new-metal share for every country, provisional.
- Without it, gold demand would be overstated by roughly a fifth to two fifths.

**Other designs considered.**
- A goldsmith works turning metal and labour into a "jewellery" good. This adds a 58th good
  and a building. The demand would be the same; it is more faithful but larger.
- Silver in the chemicals recipe (photography). It is too small to separate in 1900.

**Phone.** The Markets screen already lists gold and silver. The Country screen's
consumption list shows them under luxury goods with no new control.

## 5. What it should give (to be measured, not claimed)

- **Gold:** jewellery (net of old material) plus free coinage should absorb the whole 1900
  output at the mint price. The A7 report then shows the split between industry and coinage
  against the sourced 29 % / 71 %.
- **Silver:** industry (22 %) plus Mexico's and China's free coinage plus token coinage. The
  rest (India's rupees, hoards in the East) stays uncovered until gap 5. The report states
  the uncovered share.

## 6. Tests

- **Free coinage:** with metal offered below the buy point, the mint buys all of it.
  - Metal: reserve kg = bought kg.
  - Circulation: the liability rises by the RUSD paid ÷ valuation.
  - Seller and outside: the seller's cash and the external accounts move by the same amount.
  - Goods are conserved, and the price stays at the buy point.
- A mint without free coinage behaves exactly as in D-149 (regression digest).
- The money source is listed in the cash-conservation invariant, and the invariant passes
  over 92 days of the 1900 world.
- **Circulation need:** a growing economy raises the need; the authority buys metal at the
  market price; token seigniorage reaches the treasury. Deterministic, and survives a save
  round trip.
- **Jewellery:** demand follows the luxury-tier population; the opening world reproduces the
  calibrated 1900 table within the documented tolerance.
- The 1900 world hash is re-pinned by design, and legacy digests stay encoding-only.

## 7. Decisions for the designer

1. **Free coinage by new issue** (§4.1) instead of D-149's asset swap, for authorities whose
   1900 mint or central bank bought at a fixed price.
2. **Gold and silver mines at sourced 1900 output** (a D-146 A5 exception for metals with an
   unlimited monetary buyer).
3. **Mint cash after free coinage:** keep the treasury funding (for sales at the export
   point) or drop it.
4. **Minimal circulation need in P5b** (§4.2), or defer all of it to P11.
5. **Jewellery as a direct luxury need item** (§4.3), or as a goldsmith works and a new good.
6. **New-metal share** from the US 1900 aggregate, applied to every country (provisional).

## 8. Steps once approved

1. Transcribe the Mint report's free-coinage answers by country, the US aggregate
   new/old-material table (p. 47) and the world industrial table into `sources_1900.json`.
2. Sim: the `freeCoinage` field (schema 33 is still unreleased, so an optional field as
   with the hydro potential); `mint-coinage`; unbounded standing offers. Add 4.2 if chosen.
3. Generator: luxury need items; gold and silver mines at sourced output; the A7 report.
4. Tests (§6), `pnpm test`, `pnpm typecheck`, the playtest, `app:export`; D-152 accepted
   and implemented, with the measured split.

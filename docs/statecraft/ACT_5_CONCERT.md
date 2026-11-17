# Act V — The Concert (S16 to S18)

States get interests, treaties and quarrels; quarrels become crises with clocks; and the structure
of 1900 pushes the great powers toward a general war that the player can foresee, avert, exploit
or start. This act carries program §8.

Each stage begins with a stage plan approved by the designer (handbook §5). The definition of done
of handbook §8 applies in full.

Read first: `HANDBOOK.md`, `CONTRACTS.md` (all), program §8 and §11, the S13 claims and the S14
governments. Today's diplomacy is the war, truce and peace-offer state of
`packages/sim/src/economy/military.ts` and nothing else.

**The idea to protect.** There is no opinion number, no influence to spend and no scripted war. A
state's attitude is the sum of things that exist in the world: stakes, treaties, debts, kin, fear
and a record of promises kept. A war happens because governments, each for stated reasons, chose
steps on a ladder.

---

## S16 — Diplomacy: interests, treaties, negotiation, subjects, embassies

### Data model

| Object | Content | Authored or derived |
|---|---|---|
| Interest | A country's declared stake in a region, strait, route or state; its kind (sphere, protection, access, integrity) | Declared by an action; its **credibility** is derived from real stakes there (trade, investment and debt held, kin, adjacency, forces) |
| Dispute | Parties, the contested object, kind (territory, status, access, debt, treatment of kin) | Created from state: S13 claims, overlapping interests, a default (S11), persecution of kin (S15). Intensity is derived |
| Treaty | Parties, a list of terms, dates, secret terms, status | Signed by actions; 1900 treaties from sourced data |
| Record | Each term kept or broken, each crisis and war outcome, with dates and witnesses | Stored facts |
| Trust | How far B believes A will keep a term | Derived from A's record |
| Threat | What A fears from B | Derived: B's forces that can reach A, B's claims on A, B's alliances, B's recent aggression |
| Prestige, rank | Others' estimate of a state's resolve and capability; great-power rank | Derived yearly from indicators and the record |

**Terms** are a discriminated union. Each kind defines what it obliges, how a breach is detected
from simulated state, and what a breach does (the record, the treaty's status):

alliance (with its casus foederis: against whom, where, defensive or offensive) · guarantee ·
entente · neutrality · non-aggression · military convention · commercial treaty and customs union
(plug into the customs territories and the trade policy of E6a) · loan (creates a debt contract) ·
concession (railway, port, mine; extraterritorial rights) · subject relation (colony,
protectorate, dominion, mandate; who sets tariffs, who conducts foreign policy, garrisons,
tribute) · arms limitation · arbitration · transit and base rights · cession.

A term with no detectable obligation is decoration; do not add it.

### Negotiation

- A deal is two lists of terms: what each side gives.
- The other government values each term on its five scales (`CONTRACTS.md` §9) with `firstOrder`,
  indicators and its trust in the proposer, and accepts when the net value clears a threshold.
- Its answer carries its reasons and **the cheapest change that would turn a refusal into
  acceptance**, found by trying a small set of variations (dropping each request, adding each of a
  short menu of sweeteners).
- The player builds the deal on a table of terms; the forecast of each term is shown before
  sending.

### Embassies and information

A foreign service is an institution with posts per partner, staffed by Bureaucrats and funded. Its
quality changes **what the player knows**, never what happens: the figures of a foreign country
are shown as ranges that narrow with a good embassy; reasons are shown in full or in part; a
secret treaty may be reported (a keyed chance by quality). The AI is bound by the same rule
through its own embassies.

### Subjects

1900 subject relations come from data and connect to what exists: the customs territories (who
sets the tariff), the province registry, garrisons and money flows. A subject cannot sign what its
terms forbid. Changing a subject's status is a treaty.

### Actions (the AI uses every one)

Declare or withdraw an interest · open or close an embassy · propose, accept or refuse a deal ·
denounce a treaty · guarantee a state · recognise a state · embargo a state (through trade
policy) · send a demand (S17).

### 1900 data

The treaties in force on 1 January 1900, the declared interests and the subject relations, each
from a cited source: the Triple Alliance, the Franco-Russian alliance, the protectorates and
colonies, the extraterritorial regimes in the Ottoman Empire and China, the declared American
interest in the western hemisphere. Nothing signed after that date is data.

### Play

| Hook | Content |
|---|---|
| Cards | An offer received; a treaty about to expire; a partner broke a term; a neighbour asks for a guarantee; a debtor defaults |
| Screens | World gains Diplomacy: a country page (the components of its attitude, its treaties, disputes, trade and debt ties), the deal table, the web of alliances |
| Lenses | Attitude toward the player; treaties; interests; disputes |
| Gazette | Public treaties, denunciations, recognitions |
| AI | The foreign ministry seeks security against threats, growth through commerce and credit, and prestige, in keeping with its ideology |

### Acceptance

- A deal is accepted exactly when the valuation says so, and the reasons shown reproduce the
  valuation (test).
- A breach test per term kind. Trust follows the record (test).
- Subject terms control tariff authority (integration test with the customs territories).
- Embassy quality changes information only: an AI decision is identical whatever the player's
  embassy (test).
- AI coverage of every action. The 1900 treaties load and validate.
- The Observatory reports how the alliance network evolves. An alignment of Britain with France or
  Japan in a share of seeds is reported, not required.
- Attitudes are computed for the pairs that matter (neighbours, great powers, partners), yearly
  or on change; no daily loop over all pairs.

### Traps

An opinion score with a list of plus and minus modifiers. Influence or favours to spend. An AI
that accepts anything above a score. Decorative terms. Secrets leaking to the AI. Declaring war
without a dispute at no cost (the record must count it).

---

## S17 — Crises, congresses, prestige; the strategic AI

### The crisis

A crisis begins when a state **moves** on a dispute: an ultimatum, an occupation, an annexation, a
mobilisation, or the choice to escalate an incident (an assassination or border clash produced by
a radical movement in S15, with a hazard from the state of that province).

| Part | Content |
|---|---|
| Object | The dispute, the initiator, the target, the demands (a list of terms), a deadline, the sides and their backing |
| The target's choices | Accept · reject · counter-offer · appeal to the powers |
| Third parties with an interest or a treaty | Declare backing: none, diplomatic, partial mobilisation, general mobilisation. An alliance whose casus foederis is met obliges |
| The initiator's choices | Press · reduce the demands · withdraw · accept a conference |
| Endings | Demands accepted (a treaty) · withdrawal · a compromise at a congress · war |

- **Backing down is recorded.** It lowers derived prestige and the trust of the nationalist groups
  at home (S14). A state's recent backdowns raise its resolve in the next crisis. That is how a
  series of crises hardens, and each step of it can be explained from the record.
- **Mobilisation as backing** is declared here; its military and economic substance arrives with
  S19 and the timetables with part 2 of S18.

### The congress

The great powers and the parties meet on a crisis or after a war. The agenda is the list of terms.
Each participant takes a position per term. A compromise passes when the weighted support (power
× stake) is sufficient and no party both rejects it and is willing to fight. A state that rejects
may comply or defy; defiance continues the crisis. The interface is a table: terms as rows, powers
as columns.

### The strategic AI

- **Assessment.** Threat (S16) drives the search for allies and arms. Opportunity (a favourable
  balance, rivals occupied elsewhere) drives pressing a claim.
- **Resolve** in a crisis is a documented function of the stake, the balance of forces with
  backers, the record ("never again"), pressure at home, and the leader's traits.
- **Bluff.** A government may press beyond its resolve, with a keyed draw weighted by its traits.
  The player sees other governments' resolve as an estimate with a range, as good as the embassy.
- The reasons for every step are stored and shown.

### Play

| Hook | Content |
|---|---|
| Cards | A crisis is importance 3 and pauses the game |
| Screen | The crisis: the dispute, the demands, the ladder with the current rung, each power's position and reasons, the clock, and the player's choices with forecasts ("If you reject, Austria presses: likely 60 to 80 %") |
| Lens | Disputes and crises; backing |
| Gazette | Each step of a crisis among powers (magnitude 70 and above) |

### Acceptance

- A fixture for each ending. An alliance's casus foederis is invoked exactly when its conditions
  are met.
- A backdown lowers derived prestige and raises the state's next resolve (tests on the record).
- The AI's resolve rises with the stake and with a better balance (monotonicity tests).
- Congress arithmetic is tested.
- The Observatory reports crises among great powers per decade against a provisional band of
  three to ten for 1900 to 1914. No war is required at this stage.

### Traps

A tension meter that ticks. Crises from dice alone. An AI that always or never backs down. A
crisis without a clock or without the others' reasons. War as the only exit. Certainty shown where
the game is uncertain.

---

## S18 — The road to war

Done in **two parts**. Part 1 belongs to this act. Part 2 needs real forces and fronts and is done
after S20 (Act VI), before S23.

### Part 1 — pressures and data

- **History settings.** "Faithful", "Plausible" (default) and "Open". They are tables of
  dispositions (affinities between pairs, the weight of historical alignments) that enter the AI's
  valuation as documented inputs. "Open" reads none. No setting contains a declaration of war, a
  date or a forced alliance.
- **Engines**, each built from systems that exist:

  | Engine | Mechanism |
  |---|---|
  | Security dilemma | A war ministry's spending answers the neighbours' capability, which raises their threat in turn |
  | Naval race | Tonnage ratios as multi-year plans; the dreadnought (an invention of S12) devalues older ships and restarts the race |
  | Tightening alliances | Threat makes states pay more for allies and accept wider casus foederis |
  | Imperial decay | Instability in a multi-national empire (S15) opens disputes over what follows it |
  | Nationalism | Radical movements produce the incidents that S17 turns into crises |
  | Windows | A government that forecasts its own relative decline from growth rates accepts more risk |

- **Brakes:** the value at risk in trade with the likely enemy; creditors; labour movements that
  withhold consent to mobilisation; arbitration treaties; the record of costly wars.
- **Visibility.** A Tension lens (derived per region from disputes, the powers involved and their
  backing), the web of alliances, and Gazette templates whose tone follows it.
- **Calibration of part 1** with the Observatory: the incidence and severity of crises from 1900
  to 1914, and the formation of two blocs in most seeds.

### Part 2 — timetables and the general war (after S20)

- **Mobilisation timetables.** A country's plan is computed from its reserves (S19) and its
  railway capacity toward each front (S9): how many divisions stand where on each day after the
  order. Plans are prepared in advance against a named enemy and are slow to change. When a
  neighbour mobilises, the cost of waiting is a figure: "they will have 30 divisions on your
  border on day 12; you will have 18 if you start today and 9 if you wait a week". The player sees
  it and the AI uses it. This is what turns a crisis into a war.
- **The bidding for neutrals.** Blocs at war make offers to neutrals whose entry matters:
  territory promised at the peace (S23), loans, guarantees. A neutral player receives both bids as
  cards.
- **The calibration target** (program §8.6, setting "Plausible", AI-only, at least 50 seeds): a
  war among four or more great powers begins between 1908 and 1920 in at least 75 % of seeds; the
  median start is between 1912 and 1916; the line-up differs from history in at least a quarter of
  them.
- **How to calibrate.** Change structural parameters (sensitivity to threat, the weights of
  resolve, the dispositions), one at a time, and record the distribution before and after each
  change. Never calibrate on one seed.
- **Agency check.** Re-run the seeds with one great power following a scripted policy of détente
  (a test variant of its AI): the incidence, the timing or the shape of the war must change. If it
  does not, the war is railroaded and the calibration is wrong.

### Acceptance

- Part 1: the engines and brakes each have a cause-isolating test; the settings are data; "Open"
  reads no disposition (test); the part-1 bands hold.
- Part 2: the target distribution holds over 50 or more seeds; the agency check shows a shift; a
  neutral player receives bids in a playtest; the timetable figures on screen match the
  simulation's.

### Traps

A script. A hidden director that bends draws to hit a date. Fitting the exact historical line-up.
A war that happens whatever any player does. A war nobody could see coming: the lens, the web and
the Gazette must show it building.

# Act IV — Nations (S13 to S15)

People get an identity, politics becomes a contest of real groups, and governments can fall. This
act carries program §6 (heritage and faith) and §7 (politics). It is independent of Act III and
can run before or beside it.

Each stage begins with a stage plan approved by the designer (handbook §5). The definition of done
of handbook §8 applies in full.

Read first: `HANDBOOK.md`, `CONTRACTS.md` (all), program §6 and §7. Today's politics:
`packages/sim/src/economy/politics.ts`, `politicsActions.ts`, `packages/data/data/politics.json`
(three regime templates, seven interest groups, twenty laws, three scripted events).

**Tone.** This act models discrimination, persecution, revolution and civil war because the
twentieth century cannot be told without them. The game reports them soberly, as harm done to
people, and never rewards them with a bonus.

---

## S13 — Heritage and faith

**Goal.** Every population block knows who its people are, and that shapes schooling, rights,
migration, loyalty and the claims states make on each other.

### Three rules that cannot be bent

1. **No group has a trait.** No code path may branch on a particular heritage or faith. Group ids
   appear only in data and in laws. An architecture test enforces it.
2. **Composition, not keys.** A block stays province × profession × settlement. It gains counts of
   people by heritage and by faith. Blocks are never split by identity.
3. **The interface says "heritage" and "faith".** Group names are neutral and respectful; the
   taxonomy is approved by the designer before any data is built.

### Data model

- **Definitions.** Heritage: about 300 groups in a tree (family, branch, group). Faith: about 30 in
  a tree. Per country for 1900: its core heritages and its established faith, if any.
- **State per block.** A fixed number of slots (propose six for heritage and four for faith), each
  a group id and a count of people, plus an "other" slot. The counts add up to the block's
  population exactly. When a block holds more groups than slots, the smallest merge into "other";
  report how much of the world sits in "other".
- **Not by age.** The composition is per block, not per age cell. Births, deaths and ageing apply
  proportionally. State this simplification in the codex.
- **Every operation that moves people carries composition**: mobility and migration
  (`economy/reclassify.ts` `moveBlockPeople`), births, deaths, recruitment, province transfer.
  Movers are drawn proportionally with largest-remainder rounding and keyed ties, except where the
  cause is specific to a group (persecution-driven emigration draws from that group first).

### 1900 data

A generator with provenance and `--check`, like P4 and P7. In the stage plan, list every source
with its licence and the taxonomy of groups, and **stop for approval**.

| Tier | Coverage | Method |
|---|---|---|
| 1 | Austria-Hungary, Russia, Germany, the Ottoman Empire, the Balkans, British India, the United Kingdom and Ireland, the United States, Switzerland, Belgium | Sub-national census figures nearest 1900, mapped to provinces |
| 2 | Other countries with a national source | National shares placed by known regional concentration, with the rule recorded |
| 3 | The rest | Later ethnographic data, marked provisional in data and interface |

Where a census cross-tabulates occupation with language or religion, use it for the skew between
professions; otherwise the composition of a province is the same across its professions
(provisional).

### Mechanics (all monthly)

| Mechanic | Model |
|---|---|
| Legal status | New law areas through the existing law path: citizenship and franchise; language of schools and offices; church and state; access to land, residence and professions. Laws name categories (core, tolerated, restricted, subject), never traits |
| Schooling | Literacy gain is lower for children taught in a language that is not theirs. This is a condition of the school, not of the child |
| Access | A restricted group cannot enter the professions the law closes to it (the "law" gate of professions already exists) |
| Assimilation | A flow from a minority to the dominant group of the place, driven by school language, town life and a small minority share, and resisted where the group is nationally mobilised or coerced |
| Conversion and secularisation | The same form; "no faith" is a category |
| National mobilisation | A derived indicator per province and group: its literacy there, its exclusion, a kin state, its middle class, repression. Used by S14, S15 and S16 |
| Homelands | Provinces where a group has a majority in 1900, plus a short authored list for groups without one |
| Claims | Computed yearly, never authored: a state claims provinces abroad where its core heritage is a majority; a group without a state aspires to its homeland. The list feeds S16 |
| Institutions of faith | The Clergy staff an institution per country and faith, paid by tithes, endowments or the state according to the church-and-state law. It provides schooling and relief (real services) and is a pillar in S14 |
| Migration | Destinations are weighted by the share of kin already there |

### Play

| Hook | Content |
|---|---|
| Cards | "Czech associations petition for schools in Czech" with options and forecasts for literacy, loyalty and the reaction of others |
| Screens | People gains a fourth tab, Identity: the country's composition; the place sheet shows a province's |
| Lenses | Heritage (majority and share); faith; legal status; national mobilisation; claims by and against the country. Colour by family with shades; the legend lists the largest groups in view |
| Gazette | Language and church laws, petitions, emigration waves |
| AI | The interior ministry chooses status laws from its ideology and the pressure it faces |

### Acceptance

- After every operation, each block's counts add up to its population; world totals by group
  change only through assimilation, conversion and proportional births and deaths.
- The 1900 shares of each tier-1 country match their sources within the tolerance of the plan
  (table in the report).
- Cause-isolating tests: school language changes literacy gain; assimilation runs in the stated
  direction and slows with mobilisation.
- The computed 1900 claims are reported and checked by eye against well-known ones
  (Alsace-Lorraine, Trentino and Trieste). They are not hard-coded.
- The architecture test finds no branch on a group id in `packages/sim`.

### Traps

Hard-coding a group in logic. Blocks keyed by identity. Composition per age cell. Double counting
in migration. An "other" slot that swallows the map. Three hundred colours on one map.

---

## S14 — Politics: beliefs, movements, parties, institutions, cabinet, laws

**Goal.** Laws pass because real groups consent, for reasons the player can read. The government
is a cabinet of people with a mandate. This stage replaces `politics.ts` and `politics.json`.

### Build order

1. **Beliefs.** Per block: support shares for liberalism, traditionalism, communism and fascism
   (adding to 1), radicalism and organisation. Each month the shares move with inertia toward a
   target computed from indicators through a documented driver table (data): unemployment and real
   wages of the block, literacy, town life, practice of faith, age, casualties, lost provinces
   with kin, loss of savings, repression. Fascism starts near zero. 1900 priors: election results
   where there were elections (map parties to ideologies in data), structure elsewhere.
2. **Stances from simulated interest.** A group's stance on a proposal is
   `ideological fit + interest`. The fit is authored (a table: law option × ideology). The
   interest is **computed**: the `firstOrder` effect of the proposal (`CONTRACTS.md` §5) on that
   group's real income, security and status. Extend `firstOrder` to report effects by group. The
   stance carries its reasons, so the interface can say "Laborers oppose the grain tariff: bread
   +8 %". Stances are computed on demand per proposal, not daily.
3. **Organisations.** Interest groups (keep the seven keys). Movements around an issue, with
   members, radicalism and, for unions, a cash account fed by dues. Parties: for the major
   countries of 1900 from data (name, ideology, the class, faith or heritage they stand on);
   generated elsewhere; at most seven per country. Where parties do not exist, factions.
4. **The constitution as rules** (data per country for 1900): how the executive is chosen; whose
   consent a law needs and with what threshold (legislature, upper chamber, crown, a pillar, a
   party congress); the franchise; the term; rights of press, assembly and association. The
   regime's label is derived from these rules by a table.
5. **Pillars.** Crown, army, church, landowners, bureaucracy, party. A pillar's consent comes from
   its members' stance on the proposal and its loyalty to the government (pay, appointments,
   promises kept).
6. **Elections.** Votes are the enfranchised adults (by the franchise law) × turnout (from
   organisation) × choice (closeness of party to voter in ideology, identity and interest). Seats
   follow the electoral system (a documented proportionality exponent). The result is the expected
   value; it is not a dice roll. Results exist by province.
7. **Government and cabinet** (`CONTRACTS.md` §10). A coalition that commands the consent the
   constitution requires; ministers drawn from it. A minister's competence enters the quality of
   the institution he or she heads through the existing administration-quality formula.
8. **The law process.** Proposal → consent path → enactment time → implementation. The tools:
   a concession (a tracked promise of another measure or budget line), patronage (appointments and
   money), dissolution, decree where the constitution allows, a funded press (moves belief targets
   slowly), repression (police staffing: lower organisation now, higher radicalism later).
9. **Promises and the mandate.** A promise records to whom, what, when made and when due. The
   mandate of a government is the set of promises of its coalition. This replaces S7's first
   version.
10. **The law catalogue.** About fourteen areas (program §7.10). Every option must change a
    simulated mechanism. An option whose mechanism arrives in a later stage is not shown yet.
11. **Succession.** When the government falls, the player continues as the successor with its
    cabinet and mandate; the Gazette and the chronicle record the fall.
12. **Delete** the old politics code and the three scripted events.

### Play

| Hook | Content |
|---|---|
| Cards | A coalition partner's demand; a minister resigns over a broken promise; a vote is three seats short (options: concession, patronage, withdraw); an election is due |
| Screens | Government: Cabinet (ministers, mandate), Laws (each option with who is for and against and their top three reasons), the chamber and the pillars |
| Lenses | Election result; ideology; party strength; franchise |
| Gazette | Elections, governments formed and fallen, laws, resignations |
| AI | Governments form coalitions, keep or break promises and pass laws through the same process |

### Acceptance

- Derived stances: on a grain tariff, landowners are for and urban laborers against, with the
  price of bread as the stated reason. Nothing in data says so directly (test).
- Cause-isolating tests for the driver table (for example: higher unemployment among laborers
  raises their support for communism).
- Votes never exceed the enfranchised; seats add up; a law cannot pass without the consent its
  constitution requires.
- The 1900 chambers of five countries reported against their historical seat shares, inside the
  tolerance of the plan.
- A promise broken lowers the trust of the group it was made to; the cabinet changes accordingly.
- AI coverage of every new action. Monthly and on-demand cost inside the budget.

### Traps

Political points under any name. Authored stance tables for interests. Politics by random event.
Parties hard-coded in code. One stability meter that ticks. Elections decided by dice. A law
screen that lists twenty reasons instead of three.

---

## S15 — Stability and regime change; new polities

**Goal.** Discontent has a visible path from petition to revolution, the player can answer at
every step, and when a state breaks, the pieces are valid states.

### The ladder

Each rung is an action of an organised movement, possible only when its preconditions hold in the
simulated state. A keyed draw may resolve an uncertain outcome only after the preconditions are
met (GDD v2.19 §9.4).

| Rung | Preconditions (derived) | Effect | The government's answers |
|---|---|---|---|
| Petition | An organised movement with a grievance | A Desk card; nothing else | Concede, negotiate, ignore |
| Strike | Union members employed in named buildings; strike funds (the union's real cash) | Output of those buildings stops for the duration | Mediate, concede a wage, wait, repress |
| Riot | Radicalism high where legal channels are closed | Disruption in a province | Police, concession |
| General strike, mutiny | Several movements aligned; for mutiny, unpaid or defeated units | National disruption | Concessions, a new cabinet, force |
| Coup | Officers whose beliefs oppose the government; arrears of pay or a lost war; a general | A new government | Loyal units, concessions to the army |
| Revolution | A movement whose organisation and radicalism exceed the regime's capacity in the capital and key provinces | The regime falls, or the country splits | Reform before it; force |
| Civil war or secession | Provinces side by their support and their garrisons | Two polities at war | — |

- Legal channels matter: where strikes and parties are legal, discontent takes the lower rungs.
- A peaceful answer exists at every rung. Concessions lower radicalism; repression lowers
  organisation now and raises radicalism later.
- Every rung is visible ahead in a Stability lens with its causes, and raises a card.

### Splitting a state

- **Instantiate a polity** from the registry's future polities (or a rebel government) as a full
  country: provinces, treasury, debt, institutions, forces, a currency (the adopt and found
  actions exist). This removes the restriction that provinces cannot pass to a polity that is not
  instantiated (Prosperity §7).
- **Division rules**, documented and conserving: cash and state assets by the provinces held; debt
  by share or by an explicit repudiation; firms by location; forces by the loyalty of each unit.
  Use `economy/provinceTransfer.ts` for the provinces.
- Rebels get no free army: their forces are units that defected and people recruited, with the
  equipment those units held.
- After the split the world validates: every province owned, every account balanced, people,
  goods and money conserved.

### Persecution and communal violence

They can occur, as actions of a radical movement or of a state, against a group named by law or by
the movement. Their effects are those the model already has: deaths, flight (S13), lost workers,
unrest, and from S16 the reaction of other states. Nothing about them is beneficial by rule. The
Gazette reports them plainly.

### Play

| Hook | Content |
|---|---|
| Cards | One per rung, with the answers above and their forecasts |
| Lens | Stability: the rung each province is on and the trend |
| Gazette | Strikes, risings, coups, revolutions, new states |
| AI | Governments concede or repress by ideology and capacity; rebel governments are AI governments |

### Acceptance

- A fixture per rung: it occurs when and only when its preconditions hold.
- A strike stops the output of the named buildings and ends by one of the listed ways; the union's
  funds are real money.
- A revolution fixture yields a successor government; a civil-war fixture yields two valid
  polities; a secession fixture instantiates a registry polity. Conservation holds in each.
- The Observatory reports regime changes per decade against a provisional band. A Russian crisis
  around 1905 may arise; it is not scripted.

### Traps

A revolution on a timer or by dice alone. A flip with no visible build-up. Money or people lost in
a split. Orphaned provinces or accounts. Free rebel armies. A fall of the government that ends the
player's campaign without choice.

---

## Release 2 — Nations: what must be true

- A player can hold together, reform or lose a multi-national state, and can see why at each step.
- Laws pass or fail for reasons shown on screen, and the reasons come from the simulated interests
  of real groups.
- Governments, including the player's, change by election and by force, and the campaign goes on.
- An AI-only 25-year run stays inside its envelopes with all of Acts I to IV running.

# Act VI — Total war (S19 to S23)

War is the same world under strain. The soldiers are people from provinces, the shells are goods
from firms, the money is taxes, bonds and the printing press, and the home front is the politics
of Act IV. This act carries program §9 and replaces the M10 code
(`packages/sim/src/economy/military.ts`, `militaryState.ts`).

Order: S19 → S20 → **part 2 of S18** (`ACT_5_CONCERT.md`) → S21 → S22 → S23.

Each stage begins with a stage plan approved by the designer (handbook §5). The definition of done
of handbook §8 applies in full.

Read first: `HANDBOOK.md`, `CONTRACTS.md` (all), program §9, GDD v2.19 §17H (archived; what M10 does today), the
briefs of S9 (railways, shipping), S12 (inventions and methods), S13 (composition), S14 and S15
(support, mutiny), S16 and S17 (treaties, crises).

**The ideas to protect.**

1. **Operational, not tactical.** The player gives few orders and each one matters: where the
   main effort goes, when an offensive starts, who is exempt from the call-up, what to buy. No
   unit is moved by hand below an army.
2. **The character of war comes from equipment and supply.** One combat rule serves 1914 and 1944.
   Trench stalemate and armoured breakthrough must both come out of it from different inputs.
   There is no era flag.
3. **Nothing is conjured.** Men come from birth cohorts of provinces, equipment from production or
   purchase, supply from stocks moved over real capacity.
4. **No stored meters.** War support, exhaustion, leverage at the peace: all derived, all with a
   "why".

---

## S19 — Forces: classes, reserves, patterns, equipment, mobilisation

### Model

| Part | Design |
|---|---|
| Service law | The military-service law area becomes real: none, volunteers, selective, universal; length of service; the share of each 20-year-old class taken, limited by fitness (from the health and nutrition indicators) and exemptions |
| Classes | Per province and single year of age (men 17 to 50): how many are trained. Kept per province, not per block; trained men are assumed spread evenly over the province's blocks of that age (a stated simplification). Migration carries them proportionally |
| In service | Conscripts and mobilised reservists stay members of their home blocks but are flagged in service. `labourEligibleWorkforce` (`economy/labourMarket.ts`) subtracts them. Their pay goes to their home block's account |
| Standing forces | The Servicemen and Officers professions hold posts in the armed-forces institution, by branch |
| Formations | Armies and corps (and fleets and wings from S21): country, branch, place, parent, pattern and number of divisions, equipment stocks, supply, organisation (0 to 1), commander. At most about 1,500 worldwide. Each keeps a small table of its people by home province and age class, so casualties return to the right pyramid |
| Patterns | A division's establishment table: men, officers, equipment by type, horses, daily supply by good. The player edits patterns on one sheet; defaults for 1900 by country from data |
| Equipment | Types in data: rifles, machine guns, field and heavy guns, munitions, horses and wagons, later trucks, tanks and aircraft. A **model** of a type is the result of a design project (S12): its figures follow from the inventions the country holds. Equipment is a good, made by state arsenals and private firms from steel, machinery, chemicals and labour, traded between states, and stocked by the state |
| The M10 supplier | The non-simulated equipment supplier and its account are deleted. A test proves no posting leaves the simulated economy |
| Officers | A division needs officers; they come from the Officers profession through academies of limited capacity. A shortage lowers the organisation of new units. Divisions cannot be conjured by money alone |
| Doctrine | A few levels per country (entrenchment, artillery coordination, combined arms, mobile warfare, and naval and air ones later). Each is a stock with flows: gained from the combat experience of officers who survive, from exercises that cost money and shells, and from attachés observing other wars; lost as veterans retire. It cannot be spent |
| Mobilisation | An order names the classes. Reservists report over days set by the railway capacity (S9). Units fill to war strength if the equipment exists; otherwise they form short. Labour leaves the home blocks, and output falls for that reason alone. Demobilisation reverses it |
| Exemptions | By occupation. The trade-off is shown as figures: "Exempting miners keeps 80,000 men at work and costs three divisions" |

Until S20 lands, keep M10's combat and occupation rules running on the new formations.

### Play

| Hook | Content |
|---|---|
| Cards | The yearly class report (how many to take); an equipment shortfall; an arms firm offers a new model; a shortage of officers |
| Screens | War: Forces. The order of battle; the pyramid of trained men by class; equipment stock against need; the pattern sheet; the mobilisation panel with its forecast (labour removed by sector and province, days to readiness) |
| Lenses | Recruitment by province; garrisons |
| Gazette | Army bills, arms deals, mobilisations |
| AI | The war ministry sizes forces to threat and budget, buys equipment and mobilises in a crisis |

### Acceptance

- People are conserved through service, mobilisation, casualties and return (test over a war in a
  fixture).
- Mobilising a class lowers the labour force of the right blocks by that number and lowers output
  (integration test).
- Equipment exists only if produced or bought; a unit never holds more than was delivered.
- A shortage of officers lowers the organisation of new divisions (test).
- The 1900 peace strengths, reserves and guns of the major countries match a cited source within
  the tolerance of the plan.
- AI coverage; monthly and yearly jobs inside the budget.

### Traps

A manpower number. Conjured equipment. Divisions without home provinces. Conscripts still counted
as workers. Simulating battalions or single soldiers. Doctrine as experience points to spend.

---

## S20 — Land war: fronts, operations, supply, occupation

### Data needed first

Terrain per province (plain, hills, mountains, forest, marsh, desert, urban), rivers on province
borders, fortresses (buildings). A generator with provenance; sources and licences in the plan
(HydroSHEDS is already used by P5b).

### Model

- **Front.** For each pair of enemies, the borders between provinces each controls
  (`controllerPolityId` exists), grouped into sectors of a few provinces with stable ids.
- **Armies** hold a sector or stand in reserve. Posture: hold, probe, attack, withdraw.
- **Supply, daily, for active armies.** An army draws food, fodder, munitions and fuel from its
  depot. The depot is fed from the railhead; the railhead from home or a port, limited by the
  railway capacity along the path (S9). Beyond the railhead, the distance and the army's transport
  (horses, later trucks, from the pattern) limit what arrives. The goods are real: taken from the
  state's stocks, moved, consumed. A cut line means an army that starves.
- **Combat, daily, on active sectors.** One documented rule:

  | Factor | From |
  |---|---|
  | Men present | The formation tables |
  | Firepower | Equipment held, **munitions actually delivered**, doctrine |
  | Organisation | Training, officers, rest, recent losses |
  | Supply | The supply levels of the day |
  | The defender's position | Terrain, rivers, fortresses, and entrenchment, which grows with days in place and doctrine and is lost on moving |
  | Mobility | The share of cavalry, trucks, tanks; decides how far a break is exploited before reserves close it |
  | Information | Reconnaissance (cavalry, later air) and surprise |
  | Leadership | The commander and the officers |

  The result of a day: casualties on both sides, munitions consumed, and ground when the
  defenders of a province break. The expected value is deterministic; a keyed draw adds a bounded,
  documented variation. The rule is an indicator, so its "why" is the battle sheet.
- **Losses.** Split into dead, wounded and prisoners by a documented rule. The dead leave the
  pyramid of their home province that day. The wounded return after a time; some are disabled.
  Prisoners are people held by the captor until exchanged or released. Equipment is lost with
  units.
- **Operations.** An objective, forces, a start day and preparation: concentration and a stock of
  shells per gun. Preparation takes weeks and can be seen by the enemy's reconnaissance. Before
  ordering, the player sees a forecast as ranges (ground, casualties, shells), computed by the
  same rule.
- **Movement** along the province graph at a speed set by infrastructure and mobility; strategic
  moves by rail use railway capacity.
- **Occupation.** A policy from lenient to extractive; a garrison sized by the population and its
  resistance (heritage status and treatment, S13); requisition as real transfers of goods and
  money; plants working for the occupier. How an occupied province trades is an open question for
  the plan: propose and ask.
- **Civilians.** Fighting destroys buildings and infrastructure (real capital), drives flight
  (migration) and loses the harvest of the provinces fought over.
- **The general staff AI** allocates armies to sectors by threat and aims, keeps reserves, picks a
  main effort, prepares operations where concentration can give local superiority, and withdraws
  from positions it cannot supply. The player delegates a front to it with a directive: hold,
  press, or main effort.

### Why stalemate and breakthrough must both emerge

With the equipment of 1914 (machine guns, quick-firing artillery, men on foot, horses beyond the
railhead), entrenched defence beats attack and a break cannot be exploited before reserves arrive
by rail. With trucks, tanks, aircraft and radio, exploitation outruns the reserves. The same rule
must give both. A test runs one fixture twice, changing only the equipment and doctrine, and
expects a stalemate in one and a breakthrough in the other.

### The War Room

At war the interface changes mode. One map runtime on every platform (`pnpm map:atlas`): a layer
for front lines, railheads, depots and army badges with strength and supply. Tapping a sector
shows force ratio, supply, entrenchment and the forecast of an attack. An operation is drawn by
dragging from an army to an objective. The Timeline shows its phases. Losses are reported by home
province ("The class of 1894 of Brandenburg has lost 11 %").

### Acceptance

- Conservation through battles: people (alive, dead, wounded, prisoners), equipment, munitions,
  money.
- An encirclement fixture: a cut supply line lowers strength within days.
- The two-era fixture above.
- Forecast honesty: over many seeds of a fixture, the outcome falls inside the forecast range at
  least 80 % of the time.
- AI against AI: wars end. The Observatory reports war lengths and casualty rates against
  provisional bands.
- War costs at most 35 ms a day in a world war (program §4.5).
- A War Room playtest at 844 × 390, including delegation. Then delete the M10 combat code.

### Traps

A tactical mini-game. Moving divisions by hand. An era flag. A war score. Armies that teleport.
Supply as a percentage with no goods behind it. Pathfinding for every division every day. A map
layer that exists on the web only.

**After S20: do part 2 of S18** (mobilisation timetables and the calibration of the general war).

---

## S21 — Sea and air

### Sea

- **Sea zones.** About 120 zones with adjacency, the ports of each, and the straits and canals as
  edges with a controller. New map data from a licensed source named in the plan; it must reach
  the phone map through the same runtime.
- **Ships.** Capital ships are individual and named; smaller ones are counted by squadron. A ship
  is a project of years in a shipyard that consumes steel, machinery, guns and labour. Crews are
  Servicemen. Coal or oil limits range from bases (a base right is a treaty term of S16).
- **Fleets and missions** in zones: battle fleet, close or distant blockade, convoy escort,
  commerce raiding, transport of an army (using merchant tonnage), shore bombardment.
- **Engagement** depends on the size of the zone, scouting and the missions; the battle on
  gunnery (guns, fire control, training), armour, speed and numbers. Ships are sunk or damaged and
  repaired in yards. Crews are people.
- **Blockade cuts the real trade routes** of S9 through the blockaded zones. Shortages follow
  through the trade system. Stopping neutral ships is a dispute with the neutral (S16).
- **Submarines** sink merchant tonnage, which is real stock: freight rates rise and imports fall.
  Convoy is a doctrine.

### Air

Wings are formations attached to a front sector or a sea zone, available once the inventions
exist. Missions: reconnaissance (improves artillery, reveals preparations and **narrows the
player's forecast ranges**), air superiority, later ground attack and strategic bombing, which
destroys real buildings and infrastructure. Aircraft are equipment; pilots are trained people.

### Play

| Hook | Content |
|---|---|
| Cards | A building programme (ratios against a rival); a blockade's effect at home; a neutral protests seizures |
| Screens | The naval balance (tonnage by class against rivals, programmes on the Timeline); missions by dragging a fleet to a zone; wings on the sector card |
| Lenses | Sea control; blockade; trade routes at risk |
| Gazette | Launches, battles, sinkings, blockade |
| AI | A naval staff: programmes by threat and ratio; blockade when superior, raiding and a fleet in being when inferior |

### Acceptance

- A blockade fixture: imports fall, prices rise and shortages appear at home, through the trade
  system and nothing else.
- Sinking tonnage lowers trade capacity. Ships and crews are conserved through battles. A ship
  consumes real goods over its years of building.
- Reconnaissance narrows forecast ranges and raises artillery effect (tests).
- The 1900 navies match a cited source within the tolerance of the plan.

### Traps

Ships from nowhere. A blockade as a flat penalty. Sea zones on one platform only. Every small
craft as an object. Aircraft before their inventions.

---

## S22 — War economy and home front

### War economy

| Part | Design |
|---|---|
| Mobilisation law | Peace, partial, total. Each level permits more: priority for state orders, mandated conversion, direction of labour, rationing, price controls, requisition |
| Procurement | Contracts between the state and firms (S10): good, quantity, price (fixed or cost-plus), delivery. Firms expand or convert to deliver. Late delivery and high margins are visible figures and political issues |
| Conversion | A plant switches to a military method (S12): retooling takes time and its civilian output is lost |
| Munitions | Consumption comes from operations (S20), supply from production and stock. A shell shortage is the difference, not an event. Explosives need nitrates: imports, or the synthetic process once invented and built |
| Labour | Mobilised men leave. Replacements: women directed into industry (a law; part of the change persists after the war), the old and the young, prisoners. Skill gates slow it |
| Food | The army takes men and horses from farms and nitrates from fertiliser; the harvest falls; imports may be blocked. Rationing is a law that caps purchases per person at an official price, with a black market whose size depends on enforcement. Hunger raises mortality through the existing food link |
| Finance | Taxes; war loans bought by banks, households and foreign lenders (S11, S16); advances from the central bank, which raise prices through the existing monetary system and erode wages and savings |

### Home front

**War support** is derived per group, with a "why": the dead and wounded of its own province,
food, real wages, the news as the press law lets it through, the war aims (defence or conquest),
ideology, legal status (S13), and how long it has lasted. Where official news departs from what
families experience, trust in the government falls.

Low support takes the rungs of S15: strikes in war plants, desertion and mutiny in units from the
provinces concerned, risings, a change of government, revolution and a separate peace. The enemy's
home front is a target through blockade, bombing and, by diplomatic action, support for its
opposition.

### Play

| Hook | Content |
|---|---|
| Cards | A shell shortage (convert, buy abroad, slow the offensive); bread queues (ration, import, requisition); a profiteering scandal; a mutiny; a peace offer |
| Screens | War: three balances, each with its "why" and levers: munitions, manpower, food |
| Lenses | War support; rationing and hunger |
| Gazette | Shortages, loans, strikes, mutinies |
| AI | Sets the mobilisation level, contracts and rationing; seeks peace when collapse nears |

### Acceptance

- Cause-isolating fixtures: calling up farm labour and horses lowers the harvest; a blockade with
  no synthetic nitrates lowers munitions; financing by the central bank raises the price level;
  support falls with the casualties of a group's own province and with hunger.
- A mutiny occurs only when its preconditions hold.
- Rationing conserves goods; a war loan is a real purchase by a real holder.
- The Observatory reports how long great-power wars last and how they end, including by
  exhaustion and revolution.

### Traps

A stored exhaustion meter. War production as a special factory with its own magic. Loans as free
money. Rationing as a flat penalty. Morale decided by dice.

---

## S23 — Peace

### Model

- **War aims** are declared at entry and can be revised: provinces by claim, reparations, changes
  of status, a change of regime, disarmament, guarantees. Each aim is a promise to groups at home
  and to allies (the promises of S14). Aims not obtained cost their trust. Larger aims stiffen the
  enemy.
- **No war score.** A side accepts a set of terms when continuing the war is worse for it than
  the terms: the same valuation as a deal (S16), with the forecast of more war as the
  alternative. Its leverage is displayed with its components: territory held, forces and supply
  left, the state of each home front, allies, money.
- **The conference** reuses the congress of S17. The victors settle the division among themselves
  by contribution and stake.
- **Terms** (extending S16's list), each with a mechanism:

  | Term | Mechanism |
  |---|---|
  | Cession, by province | `provinceTransfer`; optional plebiscite whose expected result comes from the composition and mobilisation of S13, shown with its uncertainty |
  | New state | Instantiated as in S15; the tool proposes a border from homelands |
  | Reparations | A debt contract with a schedule (S11). A default is a dispute, then a crisis |
  | Disarmament | Caps on formations, equipment and zones. Forces above the cap are a breach; evasion can be hidden and found by inspection |
  | Colonies and mandates | A change of subject relation |
  | Regime terms, occupation until fulfilled | Constitution change (S14); garrison rights |
  | Minority protection | Obligations on legal status (S13), with breach detection |
  | Guarantee | S16 |

- **Demobilisation** returns men to the labour market, creates veterans (a driver in S14) and
  leaves war debts.

### What must follow without a script

The next quarrel comes from the terms through systems that exist: ceded provinces with kin become
claims (S13); a lost war raises the humiliation driver (S14); reparations strain finance (S11);
new states with minorities create disputes (S16). Tests check each link.

### Play

| Hook | Content |
|---|---|
| Screens | The conference: the map with claimed provinces by claimant, the table of terms, each party's acceptance with its reasons, the plebiscite forecast per province |
| Cards | An armistice offer; an ally's demand at the table; a term the country cannot accept |
| Gazette | The armistice and the treaty with its terms (magnitude 90); new states |
| AI | Chooses aims from interests and claims; negotiates by the same valuation |

### Acceptance

- A decisive victory obtains harsher terms than a stalemate (monotonicity test).
- A plebiscite follows the composition of the province.
- Reparations create a debt contract; its default creates a dispute.
- Cession and new states conserve and validate.
- Unmet aims lower the trust of those promised.
- The integration test across S13 and S14: a ceded province with kin raises the claim and the
  humiliation driver of the loser.
- A white peace is always possible.

### Traps

A war score. Terms bought with points. Terms with no mechanism. Total annexation as the only
outcome. A plebiscite by dice. Forgetting demobilisation.

---

## Release 3 — The Great War (1900 to 1925): what must be true

- In AI-only runs, the calibration target of part 2 of S18 holds.
- A player can see a general war coming, and can avert, exploit, join or start it.
- A world war runs inside the day budget.
- The home front decides wars as much as the front does, and the player can read why.
- The peace leaves a world whose next quarrels follow from its terms.
- The designer has played a war on a phone.

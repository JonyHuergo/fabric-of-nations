/**
 * P5b stage B (D-146 A5, plan §8, D-148): placement and calibration of the 1900 production
 * of the 57-good catalogue. Called by `build-goods-1900.mjs` with the definitions, needs and
 * goods it built and the P2b/P5 province world.
 *
 * Method:
 *  1. Demand by (market, territory, good): households (population x the quantities of the
 *     need tiers the block's wealth activates; a gated item only where the country knows
 *     its technology), plus every placed building's recipe inputs, maintenance goods and,
 *     where fertiliser can be made in the market, its optional fertiliser.
 *  2. A good's world level is its modelled demand (D-146 A5). Its territory shares are
 *     the sourced 1900 output shares where they exist (aggregate rows left out and the
 *     rest renormalised; Central America split by population); kerosene follows the crude
 *     oil shares (1900 refining sat on the oil fields). Otherwise each territory makes its
 *     own demand; demand a territory cannot make (no deposit, no land in the crop band)
 *     goes to the other territories of its market and then to every territory that can
 *     make it, by province weight (provisional until the export tables are transcribed).
 *  3. Inside a territory the output goes to at most four provinces (one per level needed) by discovered deposit
 *     stock x quality (extraction, the largest deposit worked), cropland or grazing land
 *     inside the crop band (farms) or urban population (everything else); one building per
 *     province and definition, owned by the province's capitalists, else its largest block.
 *  4. The eight P2b goods keep their producers, whose output scales with the good's new
 *     demand in the market (D-148); cotton moves from the commercial farms to cotton farms
 *     (C-8); markets with demand and no producer get the P2b basic producer.
 *  5. Steps 1-4 are iterated (Jacobi) until the capacities settle, because recipes and
 *     maintenance link every good (machinery is bought by the mines that feed it).
 *  6. Level and technique per building follow D-135 A3 at the market's prices and the
 *     territory's wages; the workforce cap (95 %) follows P2b 11b; operating cash is 30 days
 *     of costs. Farms that can buy fertiliser on day 0 keep their technique; the others
 *     divide it by (1 - e), so the day-0 harvest is unchanged (C-9).
 *
 * Gold and silver mines are sized by the D-140 mints' purchases (D-149, plan §13.7);
 * arsenals are not placed (A2); hydro stations wait for the Hoes et al. potential (A8).
 */

const AGGREGATE_KEYS = new Set(["other", "other-europe"]);
const CENTRAL_AMERICA = ["gua-home", "hon-home", "sal-home", "nic-home", "cos-home"];
/** Building definitions not placed in the 1900 world, with the reason (report). */
export const NOT_PLACED_1900 = {
  "hydro-station": "hydro potential (Hoes et al. 2017, D-146 A8) not yet extracted",
  "synthetic-rubber-plant": "gated by petrochemicals",
  "petrochemical-plant": "gated by petrochemicals",
  "nitrogen-fixation-plant": "gated by nitrogen fixation",
  "food-and-drink-works": "1900 processed food is made by the P2b food-processing building",
  arsenal: "armaments stay money-only in M10 (D-146 A2)",
};
/** The P2b basic producer of an existing good, for a market with demand and no producer (P2b 10b). */
const BASIC_PRODUCER = { "food-products": "food-processing", clothing: "workshop-peasant", textiles: "textile-mill" };
/**
 * Existing goods whose P2b producers scale with the market's new demand (D-148: plan §8.5
 * keeps the P2b need quantities of grain, meat and fish; their producers follow modelled
 * demand like every other good, A5). Wool is a joint product of the ranch.
 */
const SCALED_P2B_GOODS = new Set(["food-products", "textiles", "clothing", "grain", "livestock", "fish"]);
const FIXED_P2B_OUTPUT = new Set(["wool"]);
/** Goods placed at the shares of another good (provisional, D-148). */
const SHARE_PROXY = {
  // 1900 refining sat on the oil fields, smelting near the copper mines, and machine
  // building in the steel countries (provisional proxies, D-148).
  kerosene: "crude-oil",
  copper: "copper-ore",
  machinery: "steel",
};
/** Most provinces one territory spreads a new producer over (D-148, provisional). */
const MAX_PROVINCES_PER_TERRITORY = 4;
/** Smallest territory target of a tradeable good, in levels (D-148, provisional). */
const MIN_LEVELS = 1;
const ITERATIONS = 60;
const CONVERGENCE = 1e-10;

export function placeCatalogue(ctx) {
  const {
    goods, definitions, oldDefinitions, needs, oldNeeds, professions, provinces, pops, countries, oldCountries,
    markets, buildings, deposits, sources, technology, rows, workingAgeShare, fertiliser, round, territoryCoverage,
    extraDemand = new Map(),
  } = ctx;
  const goodById = new Map(goods.map((good) => [good.id, good]));
  const goodByKey = new Map(goods.map((good) => [good.key, good]));
  const gid = (key) => {
    const good = goodByKey.get(key);
    if (good === undefined) throw new Error(`unknown good ${key}`);
    return good.id;
  };
  const defByKey = new Map(definitions.map((definition) => [definition.key, definition]));
  const oldDefByKey = new Map(oldDefinitions.map((definition) => [definition.key, definition]));
  const professionById = new Map(professions.map((profession) => [profession.id, profession]));
  const professionByKey = new Map(professions.map((profession) => [profession.key, profession]));
  const provinceById = new Map(provinces.map((province) => [province.id, province]));
  const marketOfProvince = new Map();
  for (const market of markets) for (const id of market.provinceIds) marketOfProvince.set(id, market);
  const countryOf = new Map();
  for (const country of countries) for (const id of country.provinceIds) countryOf.set(id, country);
  const oldCountryOf = new Map();
  for (const country of oldCountries) for (const id of country.provinceIds) oldCountryOf.set(id, country);
  const territoryOf = (provinceId) => provinceById.get(provinceId).territoryKey;
  const techByKey = new Map(technology.technologies.map((entry) => [entry.key, entry]));
  const techKeyById = new Map(technology.technologies.map((entry) => [entry.id, entry.key]));
  const knows = (country, key) => key === null || key === undefined || (country?.technology?.researchedTechnologyKeys ?? []).includes(key);
  const techFactor = (country, sector) => {
    let bonus = 0;
    for (const key of country?.technology?.researchedTechnologyKeys ?? []) {
      for (const effect of techByKey.get(key)?.effects ?? []) if (effect.kind === "sector-productivity" && effect.sector === sector) bonus += effect.bonus;
    }
    return 1 + Math.min(Math.max(bonus, 0), 2);
  };
  const price = (market, goodId) => goodById.get(goodId).basePrice1900RUSD * market.initialPriceMultiplier;
  const prodMod = (definition) => {
    const total = definition.jobs.reduce((acc, job) => acc + job.workersPerThroughputUnit, 0);
    return definition.jobs.reduce((acc, job) => acc + job.workersPerThroughputUnit * professionById.get(job.professionId).laborProductivityModifier, 0) / total;
  };
  const laborShare = (definition) => (definition.sector === "agriculture" ? rows.laborShareAgriculture : rows.laborShareManufacturing);
  const wageBillLevelDay = (definition, province) =>
    definition.jobs.reduce((acc, job) => acc + job.workersPerThroughputUnit * definition.referenceThroughputPerDayAtLevelOne * province.wageRUSDPerYearByProfession[professionById.get(job.professionId).key], 0) / 365;
  const maintenanceValueLevelDay = (definition, market) =>
    (definition.maintenanceInputs ?? []).reduce((acc, item) => acc + item.quantityPerLevelPerDay * price(market, item.goodId), 0);
  const targetLevelDay = (definition, province, market) =>
    wageBillLevelDay(definition, province) / laborShare(definition) + definition.dailyUpkeepRUSDAtLevelOne + maintenanceValueLevelDay(definition, market);
  const vaPerCapacityTU = (definition, market, tf) =>
    definition.outputs.reduce((acc, output) => acc + output.quantityPerThroughputUnit * tf * price(market, output.goodId), 0) -
    definition.inputs.reduce((acc, input) => acc + input.quantityPerThroughputUnit * price(market, input.goodId), 0);

  // Province facts.
  const popsByProvince = new Map();
  for (const pop of pops) {
    const list = popsByProvince.get(pop.provinceId) ?? [];
    list.push(pop);
    popsByProvince.set(pop.provinceId, list);
  }
  const ownerOf = (provinceId) => {
    const list = popsByProvince.get(provinceId) ?? [];
    if (list.some((pop) => pop.professionKey === "capitalists" && pop.population > 0)) return "capitalists";
    const largest = [...list].filter((pop) => pop.population > 0).sort((left, right) => right.population - left.population || left.professionKey.localeCompare(right.professionKey))[0];
    return largest?.professionKey ?? null;
  };
  const urbanPopulation = new Map();
  const territoryPopulation = new Map();
  for (const pop of pops) {
    const province = provinceById.get(pop.provinceId);
    urbanPopulation.set(pop.provinceId, (urbanPopulation.get(pop.provinceId) ?? 0) + pop.population * (province?.urbanShare ?? 0));
    territoryPopulation.set(province.territoryKey, (territoryPopulation.get(province.territoryKey) ?? 0) + pop.population);
  }
  const territoryProvinces = new Map();
  for (const province of [...provinces].sort((left, right) => left.id - right.id)) {
    const list = territoryProvinces.get(province.territoryKey) ?? [];
    list.push(province);
    territoryProvinces.set(province.territoryKey, list);
  }
  const territories = [...territoryProvinces.keys()].sort();
  const depositsByProvince = new Map();
  for (const deposit of deposits) {
    if (!deposit.discovered) continue;
    const list = depositsByProvince.get(deposit.provinceId) ?? [];
    list.push(deposit);
    depositsByProvince.set(deposit.provinceId, list);
  }
  const bestDeposit = (provinceId, resource) =>
    (depositsByProvince.get(provinceId) ?? [])
      .filter((deposit) => deposit.resource === resource)
      .sort((left, right) => right.initialStock - left.initialStock || left.id - right.id)[0];
  const inBand = (definition, province) =>
    definition.maxAbsLatitudeDeg === undefined || province.absLatitudeDeg === undefined || province.absLatitudeDeg <= definition.maxAbsLatitudeDeg;

  /** Candidate provinces of a definition in a territory, heaviest first. */
  const weightCache = new Map();
  const provinceWeights = (territory, definition) => {
    const cacheKey = `${territory}|${definition.key}`;
    if (weightCache.has(cacheKey)) return weightCache.get(cacheKey);
    const weights = [];
    for (const province of territoryProvinces.get(territory) ?? []) {
      if (marketOfProvince.get(province.id) === undefined || ownerOf(province.id) === null) continue;
      if (!inBand(definition, province)) continue;
      let weight;
      let deposit;
      if (definition.extracts !== undefined) {
        deposit = bestDeposit(province.id, definition.extracts);
        if (deposit === undefined) continue;
        weight = deposit.initialStock * deposit.quality;
      } else if (definition.landUse !== undefined) {
        weight = definition.landUse === "cropland" ? province.arableLandHa : province.pastureHa;
      } else if (definition.maxAbsLatitudeDeg !== undefined) {
        weight = province.arableLandHa + 1;
      } else {
        weight = (urbanPopulation.get(province.id) ?? 0) + 1;
      }
      if (weight > 0) weights.push({ province, weight, deposit });
    }
    weights.sort((left, right) => right.weight - left.weight || left.province.id - right.province.id);
    const chosen = weights.slice(0, MAX_PROVINCES_PER_TERRITORY);
    weightCache.set(cacheKey, chosen);
    return chosen;
  };
  /**
   * New producer definitions of a good, in catalogue order (the P2b definitions keep their
   * own buildings, step 3a; cotton has its own farm, C-8).
   */
  const firstNewDefinitionId = Math.min(...definitions.filter((definition) => !oldDefByKey.has(definition.key)).map((definition) => definition.id));
  const producersOf = (goodId) =>
    definitions.filter((definition) => definition.jobs.length > 0 && definition.outputs[0]?.goodId === goodId && NOT_PLACED_1900[definition.key] === undefined && definition.id >= firstNewDefinitionId);
  const definitionFor = (territory, goodId) => {
    const province = territoryProvinces.get(territory)?.[0];
    const country = province === undefined ? undefined : countryOf.get(province.id);
    for (const definition of producersOf(goodId)) {
      const gate = definition.requiredTechnologyId === null ? null : techKeyById.get(definition.requiredTechnologyId);
      if (!knows(country, gate)) continue;
      if (provinceWeights(territory, definition).length > 0) return definition;
    }
    return undefined;
  };
  const fertiliserKnownInMarket = new Map(markets.map((market) => [market.key, market.provinceIds.some((id) => knows(countryOf.get(id), fertiliser.gateKey))]));
  /**
   * Optional demand that is modelled (and stocked on day 0): fertiliser only where a
   * country of the market knows how to make it; minor materials everywhere.
   */
  const optionalCounted = (market, goodId) => goodId !== gid("fertiliser") || fertiliserKnownInMarket.get(market.key);

  // 1. Household demand (new and P2b needs), by market|territory and good.
  const demandKey = (market, territory) => `${market.key}|${territory}`;
  const householdDemand = (tiers) => {
    const demand = new Map();
    for (const pop of pops) {
      const market = marketOfProvince.get(pop.provinceId);
      if (market === undefined || !(pop.population > 0)) continue;
      const country = countryOf.get(pop.provinceId);
      const key = demandKey(market, territoryOf(pop.provinceId));
      const row = demand.get(key) ?? new Map();
      demand.set(key, row);
      for (const tier of tiers) {
        if (pop.wealthLevel < tier.activationWealthMin) continue;
        for (const item of tier.items) {
          if (item.requiredTechnologyKey !== undefined && !knows(country, item.requiredTechnologyKey)) continue;
          const id = gid(item.goodKey);
          row.set(id, (row.get(id) ?? 0) + pop.population * item.quantityPerCapitaPerDay);
        }
      }
    }
    return demand;
  };
  // Households, plus D-149 mint purchases (one year of each mint's cash, in its home
  // market): the modelled demand of the gold and silver mines (plan §13.7).
  const newHouseholds = householdDemand(needs);
  for (const [key, goodsDemand] of extraDemand) {
    const row = newHouseholds.get(key) ?? new Map();
    newHouseholds.set(key, row);
    for (const [goodId, quantity] of goodsDemand) row.set(goodId, (row.get(goodId) ?? 0) + quantity);
  }
  const oldHouseholds = householdDemand(oldNeeds);

  // 2. The P2b producers: their 1900 output by good (old definitions, old countries).
  const oldProducers = [];
  const warehouses = [];
  const removedCotton = new Map();
  for (const row of buildings) {
    const oldDefinition = oldDefByKey.get(row.definitionKey);
    const definition = defByKey.get(row.definitionKey);
    if (oldDefinition === undefined || definition === undefined) throw new Error(`unknown definition ${row.definitionKey}`);
    if (definition.jobs.length === 0) {
      warehouses.push(row);
      continue;
    }
    const province = provinceById.get(row.provinceId);
    const tfOld = techFactor(oldCountryOf.get(row.provinceId), oldDefinition.sector);
    const capacityOld = row.level * oldDefinition.referenceThroughputPerDayAtLevelOne * prodMod(oldDefinition) * (row.technique ?? 1);
    const outputs = new Map(oldDefinition.outputs.map((output) => [output.goodId, capacityOld * output.quantityPerThroughputUnit * tfOld]));
    const cotton = definition.outputs.some((output) => output.goodId === gid("cotton")) ? 0 : outputs.get(gid("cotton")) ?? 0;
    if (cotton > 0) removedCotton.set(province.territoryKey, (removedCotton.get(province.territoryKey) ?? 0) + cotton);
    oldProducers.push({ row, province, oldDefinition, definition, capacityOld, outputs, mainGood: definition.outputs[0].goodId });
  }
  const oldIntermediate = new Map();
  for (const producer of oldProducers) {
    const market = marketOfProvince.get(producer.row.provinceId);
    const key = demandKey(market, producer.province.territoryKey);
    const row = oldIntermediate.get(key) ?? new Map();
    oldIntermediate.set(key, row);
    for (const input of producer.oldDefinition.inputs) row.set(input.goodId, (row.get(input.goodId) ?? 0) + producer.capacityOld * input.quantityPerThroughputUnit);
  }
  const marketTotals = (...maps) => {
    const totals = new Map();
    for (const map of maps) {
      for (const [key, row] of map) {
        const marketKey = key.slice(0, key.indexOf("|"));
        const total = totals.get(marketKey) ?? new Map();
        totals.set(marketKey, total);
        for (const [goodId, quantity] of row) total.set(goodId, (total.get(goodId) ?? 0) + quantity);
      }
    }
    return totals;
  };
  const oldMarketDemand = marketTotals(oldHouseholds, oldIntermediate);

  // 3. Iterate placement to a fixed point.
  /** entries: key -> { province, definition, market, capacityTU, deposit, origin } */
  let entries = new Map();
  const report = { goods: {}, iterations: 0 };
  const entryKey = (provinceId, definitionKey, suffix = "") => `${provinceId}|${definitionKey}${suffix}`;
  const levelContinuous = (entry) => {
    const tf = techFactor(countryOf.get(entry.province.id), entry.definition.sector);
    const va = vaPerCapacityTU(entry.definition, entry.market, tf);
    return va > 0 ? (entry.capacityTU * va) / targetLevelDay(entry.definition, entry.province, entry.market) : 0;
  };
  const producerDemand = (current) => {
    const demand = new Map();
    for (const entry of current.values()) {
      const key = demandKey(entry.market, entry.province.territoryKey);
      const row = demand.get(key) ?? new Map();
      demand.set(key, row);
      for (const input of entry.definition.inputs) row.set(input.goodId, (row.get(input.goodId) ?? 0) + entry.capacityTU * input.quantityPerThroughputUnit);
      const level = levelContinuous(entry);
      for (const item of entry.definition.maintenanceInputs ?? []) row.set(item.goodId, (row.get(item.goodId) ?? 0) + level * item.quantityPerLevelPerDay);
      for (const item of entry.definition.optionalInputs ?? []) {
        if (!optionalCounted(entry.market, item.goodId)) continue;
        row.set(item.goodId, (row.get(item.goodId) ?? 0) + entry.capacityTU * item.quantityPerThroughputUnit);
      }
    }
    // Warehouses buy maintenance too (their levels are kept from P2b).
    for (const row of warehouses) {
      const definition = defByKey.get(row.definitionKey);
      const market = marketOfProvince.get(row.provinceId);
      const key = demandKey(market, territoryOf(row.provinceId));
      const demandRow = demand.get(key) ?? new Map();
      demand.set(key, demandRow);
      for (const item of definition.maintenanceInputs ?? []) demandRow.set(item.goodId, (demandRow.get(item.goodId) ?? 0) + row.level * item.quantityPerLevelPerDay);
    }
    return demand;
  };
  const sumRows = (left, right) => {
    const out = new Map();
    for (const map of [left, right]) {
      for (const [key, row] of map) {
        const target = out.get(key) ?? new Map();
        out.set(key, target);
        for (const [goodId, quantity] of row) target.set(goodId, (target.get(goodId) ?? 0) + quantity);
      }
    }
    return out;
  };
  for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
    const demand = sumRows(newHouseholds, producerDemand(entries));
    const marketDemand = marketTotals(demand);
    const next = new Map();
    const goodReport = {};
    const addEntry = (province, definition, outputQuantity, deposit, origin, suffix = "") => {
      if (!(outputQuantity > 0)) return;
      const market = marketOfProvince.get(province.id);
      const tf = techFactor(countryOf.get(province.id), definition.sector);
      const capacity = outputQuantity / (definition.outputs[0].quantityPerThroughputUnit * tf);
      const key = entryKey(province.id, definition.key, suffix);
      const existing = next.get(key);
      if (existing !== undefined) existing.capacityTU += capacity;
      else next.set(key, { key, province, definition, market, capacityTU: capacity, deposit, origin });
    };
    /** Levels a territory needs for `quantity` of its producer's main output (estimate at its heaviest province). */
    const levelsFor = (territory, definition, quantity) => {
      const { province } = provinceWeights(territory, definition)[0];
      const market = marketOfProvince.get(province.id);
      const tf = techFactor(countryOf.get(province.id), definition.sector);
      const va = vaPerCapacityTU(definition, market, tf);
      if (!(va > 0)) return Number.POSITIVE_INFINITY;
      return ((quantity / (definition.outputs[0].quantityPerThroughputUnit * tf)) * va) / targetLevelDay(definition, province, market);
    };
    /** A territory gets one province per level it needs, at most four, heaviest first. */
    const placeInTerritory = (territory, definition, quantity) => {
      const count = Math.min(MAX_PROVINCES_PER_TERRITORY, Math.max(1, Math.floor(levelsFor(territory, definition, quantity))));
      const weights = provinceWeights(territory, definition).slice(0, count);
      const sum = weights.reduce((acc, entry) => acc + entry.weight, 0);
      for (const entry of weights) addEntry(entry.province, definition, (quantity * entry.weight) / sum, entry.deposit, "p5b");
    };
    /**
     * Minimum size (D-148): a tradeable good's territory target below MIN_LEVELS levels
     * goes to the targets of at least that size in the same market, else to those
     * worldwide, in proportion to their quantity; with none, to the largest target.
     */
    const consolidate = (good, targets, entryReport) => {
      if (good.storable === false || good.tradeable === false) return targets;
      const list = [...targets].sort((left, right) => left[0].localeCompare(right[0])).map(([territory, quantity]) => ({ territory, quantity, levels: levelsFor(territory, definitionFor(territory, good.id), quantity) }));
      const big = list.filter((entry) => entry.levels >= MIN_LEVELS);
      const small = list.filter((entry) => entry.levels < MIN_LEVELS);
      if (small.length === 0) return targets;
      const out = new Map(big.map((entry) => [entry.territory, entry.quantity]));
      if (big.length === 0) {
        const largest = [...list].sort((left, right) => right.levels - left.levels || left.territory.localeCompare(right.territory))[0];
        out.set(largest.territory, list.reduce((acc, entry) => acc + entry.quantity, 0));
      } else {
        const marketOfTerritory = (territory) => marketOfProvince.get(territoryProvinces.get(territory)[0].id).key;
        for (const entry of small) {
          const sameMarket = big.filter((candidate) => marketOfTerritory(candidate.territory) === marketOfTerritory(entry.territory));
          const receivers = sameMarket.length > 0 ? sameMarket : big;
          const sum = receivers.reduce((acc, candidate) => acc + candidate.quantity, 0);
          for (const candidate of receivers) out.set(candidate.territory, out.get(candidate.territory) + (entry.quantity * candidate.quantity) / sum);
        }
      }
      entryReport.consolidatedTerritories = small.length;
      return out;
    };

    // 3a. The P2b producers.
    for (const producer of oldProducers) {
      const market = marketOfProvince.get(producer.row.provinceId);
      const goodKey = goodById.get(producer.mainGood).key;
      let output = producer.outputs.get(producer.mainGood);
      if (SCALED_P2B_GOODS.has(goodKey)) {
        const before = oldMarketDemand.get(market.key)?.get(producer.mainGood) ?? 0;
        const after = marketDemand.get(market.key)?.get(producer.mainGood) ?? 0;
        if (before > 0) output *= after / before;
      } else if (!FIXED_P2B_OUTPUT.has(goodKey)) {
        throw new Error(`P2b producer of ${goodKey} has no placement rule`);
      }
      const tf = techFactor(countryOf.get(producer.row.provinceId), producer.definition.sector);
      const capacity = Math.max(output, 0) / (producer.definition.outputs[0].quantityPerThroughputUnit * tf);
      next.set(entryKey(producer.row.provinceId, producer.row.definitionKey), {
        key: entryKey(producer.row.provinceId, producer.row.definitionKey), province: producer.province, definition: producer.definition, market, capacityTU: capacity, origin: "p2b", row: producer.row,
      });
    }
    // Markets with demand for a scaled P2b good and no producer get the basic producer.
    for (const [goodKey, definitionKey] of Object.entries(BASIC_PRODUCER)) {
      const goodId = gid(goodKey);
      const definition = defByKey.get(definitionKey);
      for (const market of markets) {
        const wanted = marketDemand.get(market.key)?.get(goodId) ?? 0;
        if (!(wanted > 0)) continue;
        if (oldProducers.some((producer) => producer.mainGood === goodId && marketOfProvince.get(producer.row.provinceId) === market)) continue;
        const ranked = [...demand].filter(([key]) => key.startsWith(`${market.key}|`)).map(([key, row]) => [key.slice(market.key.length + 1), row.get(goodId) ?? 0]).filter(([, quantity]) => quantity > 0).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
        const territory = ranked[0]?.[0];
        if (territory === undefined) continue;
        const weights = provinceWeights(territory, definition);
        if (weights.length === 0) continue;
        addEntry(weights[0].province, definition, wanted, undefined, "p5b-basic", "-p5b");
      }
    }

    // 3b. Cotton and the new goods.
    const newGoods = goods.filter((good) => good.id === gid("cotton") || good.id >= 8);
    for (const good of newGoods) {
      const total = [...marketDemand.values()].reduce((acc, row) => acc + (row.get(good.id) ?? 0), 0);
      const entryReport = { worldDemandPerDay: total, placedPerDay: 0, unplaced: [] };
      goodReport[good.key] = entryReport;
      if (!(total > 0) || producersOf(good.id).length === 0) {
        if (total > 0) entryReport.unplaced.push({ quantity: total, reason: "no producer placed in 1900" });
        continue;
      }
      const shareKey = SHARE_PROXY[good.key] ?? good.key;
      let shares = sources.outputs1900[shareKey];
      let basis = shares === undefined ? null : `sourced shares${shareKey === good.key ? "" : ` of ${shareKey}`} (${shares.locator})`;
      if (shares === undefined && good.key === "cotton") {
        // Provisional until the USDA Yearbook 1901 cotton table is transcribed: the P2b
        // joint cotton of each territory, kept where a cotton farm can stand.
        const entries1900 = [...removedCotton].filter(([territory]) => definitionFor(territory, good.id) !== undefined).sort((left, right) => left[0].localeCompare(right[0]));
        shares = { entries: entries1900.map(([territory, value]) => [territory, value]) };
        basis = "provisional: P2b joint-cotton territories inside the cotton band";
      }
      const targets = new Map();
      if (shares !== undefined) {
        const list = [];
        for (const [territory, value] of shares.entries) {
          if (AGGREGATE_KEYS.has(territory) || !(value > 0)) continue;
          if (territory === "central-america") {
            const weight = CENTRAL_AMERICA.reduce((acc, key) => acc + (territoryPopulation.get(key) ?? 0), 0);
            for (const member of CENTRAL_AMERICA) list.push([member, (value * (territoryPopulation.get(member) ?? 0)) / weight]);
          } else list.push([territory, value]);
        }
        const feasible = list.filter(([territory]) => definitionFor(territory, good.id) !== undefined);
        for (const [territory, value] of list) {
          if (!feasible.some(([key]) => key === territory)) entryReport.unplaced.push({ territory, sourcedShare: value, reason: territoryProvinces.has(territory) ? "no province can host the producer (deposit, land or technology)" : "territory not in the 1900 world" });
        }
        const sum = feasible.reduce((acc, [, value]) => acc + value, 0);
        for (const [territory, value] of feasible) targets.set(territory, (targets.get(territory) ?? 0) + (total * value) / sum);
      } else {
        basis = "local demand (no sourced shares)";
        const pooledByMarket = new Map();
        for (const [key, row] of [...demand].sort((left, right) => left[0].localeCompare(right[0]))) {
          const quantity = row.get(good.id) ?? 0;
          if (!(quantity > 0)) continue;
          const [marketKey, territory] = key.split("|");
          if (definitionFor(territory, good.id) !== undefined) targets.set(territory, (targets.get(territory) ?? 0) + quantity);
          else pooledByMarket.set(marketKey, (pooledByMarket.get(marketKey) ?? 0) + quantity);
        }
        let worldPool = 0;
        for (const [marketKey, quantity] of [...pooledByMarket].sort((left, right) => left[0].localeCompare(right[0]))) {
          const market = markets.find((entry) => entry.key === marketKey);
          const local = [...new Set(market.provinceIds.map(territoryOf))].sort().filter((territory) => definitionFor(territory, good.id) !== undefined);
          if (local.length === 0) {
            worldPool += quantity;
            continue;
          }
          const weightOf = (territory) => provinceWeights(territory, definitionFor(territory, good.id)).reduce((acc, entry) => acc + entry.weight, 0);
          const sum = local.reduce((acc, territory) => acc + weightOf(territory), 0);
          for (const territory of local) targets.set(territory, (targets.get(territory) ?? 0) + (quantity * weightOf(territory)) / sum);
        }
        if (worldPool > 0) {
          const able = territories.filter((territory) => definitionFor(territory, good.id) !== undefined);
          const weightOf = (territory) => provinceWeights(territory, definitionFor(territory, good.id)).reduce((acc, entry) => acc + entry.weight, 0);
          const sum = able.reduce((acc, territory) => acc + weightOf(territory), 0);
          if (able.length === 0 || !(sum > 0)) entryReport.unplaced.push({ quantity: worldPool, reason: "no territory can host the producer" });
          else {
            for (const territory of able) targets.set(territory, (targets.get(territory) ?? 0) + (worldPool * weightOf(territory)) / sum);
            entryReport.pooledWorldwidePerDay = worldPool;
            basis += "; demand without a local producer placed worldwide by province weight (provisional)";
          }
        }
      }
      entryReport.basis = basis;
      const placedTargets = consolidate(good, targets, entryReport);
      for (const [territory, quantity] of [...placedTargets].sort((left, right) => left[0].localeCompare(right[0]))) {
        const definition = definitionFor(territory, good.id);
        placeInTerritory(territory, definition, quantity);
        entryReport.placedPerDay += quantity;
      }
    }

    // Joint outputs (refinery petrol and fuel oil) are counted as supply of their goods
    // in the report; their level follows the main output.
    let change = 0;
    let scale = 0;
    const keys = new Set([...entries.keys(), ...next.keys()]);
    for (const key of keys) {
      const before = entries.get(key)?.capacityTU ?? 0;
      const after = next.get(key)?.capacityTU ?? 0;
      change = Math.max(change, Math.abs(after - before));
      scale = Math.max(scale, Math.abs(after));
    }
    entries = next;
    report.goods = goodReport;
    report.iterations = iteration + 1;
    if (change <= CONVERGENCE * Math.max(1, scale)) break;
  }
  report.converged = report.iterations < ITERATIONS;

  // 4. Levels and techniques.
  const solved = [];
  for (const entry of [...entries.values()].sort((left, right) => left.province.id - right.province.id || left.key.localeCompare(right.key))) {
    const { definition, province, market } = entry;
    const country = countryOf.get(province.id);
    const tf = techFactor(country, definition.sector);
    const va = vaPerCapacityTU(definition, market, tf);
    if (!(va > 0)) throw new Error(`${entry.key}: non-positive value added per throughput unit in ${market.key}`);
    const target = targetLevelDay(definition, province, market);
    const quality = definition.extracts !== undefined ? entry.deposit.quality : 1;
    const level = Math.max(1, Math.round((entry.capacityTU * va) / target));
    let technique = entry.capacityTU / (quality * level * definition.referenceThroughputPerDayAtLevelOne * prodMod(definition));
    // C-9: an optional input the market does not stock on day 0 (fertiliser where no
    // country of the market can make it) leaves (1 - e) of the output; the technique is
    // divided by that factor so the day-0 output is the solved one. Counted optional
    // demand is stocked on day 0 (local producers or merchant stock, step 7).
    let fertiliserFactor = 1;
    for (const item of definition.optionalInputs ?? []) if (!optionalCounted(market, item.goodId)) fertiliserFactor *= 1 - item.outputElasticity;
    technique /= fertiliserFactor;
    if (!(technique > 0) || !Number.isFinite(technique)) throw new Error(`${entry.key}: invalid technique`);
    solved.push({ ...entry, tf, va, target, quality, level, technique, fertiliserFactor });
  }

  // 4b. Plan §8 residual rule: where P2b coverage was already at least
  // `residualCapCoverage` of GDP, the new sectors are capped at the residual (GDP - value
  // added of the P2b sectors); the overshoot is reported, not reallocated.
  const valueAddedOf = (building) => {
    const capacity = building.quality * building.level * building.definition.referenceThroughputPerDayAtLevelOne * prodMod(building.definition) * building.technique * building.fertiliserFactor;
    return capacity * building.va * 365;
  };
  report.residualCap = {};
  for (const [territory, coverage] of [...territoryCoverage].sort((left, right) => left[0].localeCompare(right[0]))) {
    if (!(coverage.shareBefore >= rows.residualCapCoverage)) continue;
    const inTerritory = solved.filter((building) => building.province.territoryKey === territory);
    const p2bValue = inTerritory.filter((building) => building.origin === "p2b").reduce((acc, building) => acc + valueAddedOf(building), 0);
    const added = inTerritory.filter((building) => building.origin !== "p2b");
    const newValue = added.reduce((acc, building) => acc + valueAddedOf(building), 0);
    const residual = Math.max(0, coverage.gdp - p2bValue);
    if (!(newValue > residual)) continue;
    const factor = residual / newValue;
    const lostByGood = {};
    for (const building of added) {
      const capacity = building.capacityTU * factor;
      const mainGood = goodById.get(building.definition.outputs[0].goodId).key;
      lostByGood[mainGood] = (lostByGood[mainGood] ?? 0) + (building.capacityTU - capacity) * building.definition.outputs[0].quantityPerThroughputUnit * building.tf;
      building.capacityTU = capacity;
      building.level = Math.max(1, Math.round(building.level * factor));
      building.technique = capacity / (building.quality * building.level * building.definition.referenceThroughputPerDayAtLevelOne * prodMod(building.definition) * building.fertiliserFactor);
    }
    report.residualCap[territory] = { shareBefore: coverage.shareBefore, gdp: coverage.gdp, p2bValueAdded: p2bValue, newValueAddedUncapped: newValue, residual, factor, outputLostPerDay: lostByGood };
  }
  // A building capped to nothing is not built.
  for (let index = solved.length - 1; index >= 0; index -= 1) if (!(solved[index].capacityTU > 0)) solved.splice(index, 1);

  // 5. Workforce cap (P2b 11b): solved jobs of a profession above the cap share of the
  // territory workforce raise the technique and lower the level of the territory's
  // buildings employing it; output and value added are unchanged.
  const workforce = new Map();
  for (const pop of pops) {
    const key = `${territoryOf(pop.provinceId)}:${pop.professionKey}`;
    workforce.set(key, (workforce.get(key) ?? 0) + Math.floor(pop.population * workingAgeShare * professionByKey.get(pop.professionKey).participationRate));
  }
  const jobsOf = new Map();
  for (const building of solved) {
    for (const job of building.definition.jobs) {
      const key = `${building.province.territoryKey}:${professionById.get(job.professionId).key}`;
      jobsOf.set(key, (jobsOf.get(key) ?? 0) + job.workersPerThroughputUnit * building.definition.referenceThroughputPerDayAtLevelOne * building.level);
    }
  }
  const capFactor = new Map();
  for (const [key, jobs] of jobsOf) {
    const allowed = rows.maxInitialEmploymentShare * (workforce.get(key) ?? 0);
    if (jobs > allowed) capFactor.set(key, allowed > 0 ? jobs / allowed : Number.POSITIVE_INFINITY);
  }
  const capped = {};
  for (const building of solved) {
    const territory = building.province.territoryKey;
    const factor = Math.max(1, ...building.definition.jobs.map((job) => capFactor.get(`${territory}:${professionById.get(job.professionId).key}`) ?? 1));
    if (factor === 1 || !Number.isFinite(factor)) continue;
    const level = Math.max(1, Math.round(building.level / factor));
    building.technique = (building.technique * building.level) / level;
    building.level = level;
    capped[territory] = Math.max(capped[territory] ?? 1, factor);
  }

  // 6. Rows, value added, costs.
  const buildingRows = [];
  const valueAdded = new Map();
  for (const building of solved) {
    const { definition, province, market } = building;
    const capacityTU = building.quality * building.level * definition.referenceThroughputPerDayAtLevelOne * prodMod(definition) * building.technique * building.fertiliserFactor;
    building.capacityOut = capacityTU;
    const wageBill = wageBillLevelDay(definition, province) * building.level;
    const inputCost = definition.inputs.reduce((acc, input) => acc + capacityTU * input.quantityPerThroughputUnit * price(market, input.goodId), 0);
    const upkeep = (definition.dailyUpkeepRUSDAtLevelOne + maintenanceValueLevelDay(definition, market)) * building.level;
    building.vaPerYear = capacityTU * building.va * 365;
    valueAdded.set(building.key, building.vaPerYear);
    const row = {
      key: building.row?.key ?? `${province.key}-${definition.key}${building.key.endsWith("-p5b") ? "-p5b" : ""}`,
      provinceId: province.id,
      definitionKey: definition.key,
      level: building.level,
      ownerProfessionKey: building.row?.ownerProfessionKey ?? ownerOf(province.id),
      operatingCashRUSD: Math.max(1, Math.round(rows.workingCapitalDays * (wageBill + inputCost + upkeep))),
      technique: Number(building.technique.toPrecision(7)),
      ...(building.deposit === undefined ? {} : { depositId: building.deposit.id }),
      status: "provisional",
    };
    building.outRow = row;
    buildingRows.push(row);
  }
  for (const row of warehouses) {
    const definition = defByKey.get(row.definitionKey);
    const market = marketOfProvince.get(row.provinceId);
    const upkeep = (definition.dailyUpkeepRUSDAtLevelOne + maintenanceValueLevelDay(definition, market)) * row.level;
    buildingRows.push({ ...row, operatingCashRUSD: Math.round(rows.workingCapitalDays * upkeep) });
  }
  const keys = new Set();
  for (const row of buildingRows) {
    if (keys.has(row.key)) throw new Error(`duplicate building key ${row.key}`);
    keys.add(row.key);
  }
  buildingRows.sort((left, right) => left.provinceId - right.provinceId || left.definitionKey.localeCompare(right.definitionKey) || left.key.localeCompare(right.key));

  // 7. Output and producer demand by market (final levels), lots and warehouses.
  const outputByMarket = new Map(markets.map((market) => [market.key, new Map()]));
  const inputByMarket = new Map(markets.map((market) => [market.key, new Map()]));
  const add = (map, marketKey, goodId, quantity) => {
    const row = map.get(marketKey);
    row.set(goodId, (row.get(goodId) ?? 0) + quantity);
  };
  for (const building of solved) {
    const marketKey = building.market.key;
    for (const output of building.definition.outputs) add(outputByMarket, marketKey, output.goodId, building.capacityOut * output.quantityPerThroughputUnit * building.tf);
    for (const input of building.definition.inputs) add(inputByMarket, marketKey, input.goodId, building.capacityOut * input.quantityPerThroughputUnit);
    for (const item of building.definition.maintenanceInputs ?? []) add(inputByMarket, marketKey, item.goodId, building.level * item.quantityPerLevelPerDay);
    for (const item of building.definition.optionalInputs ?? []) if (optionalCounted(building.market, item.goodId)) add(inputByMarket, marketKey, item.goodId, building.capacityOut * item.quantityPerThroughputUnit);
  }
  for (const row of warehouses) {
    const definition = defByKey.get(row.definitionKey);
    for (const item of definition.maintenanceInputs ?? []) add(inputByMarket, marketOfProvince.get(row.provinceId).key, item.goodId, row.level * item.quantityPerLevelPerDay);
  }
  // Merchant stock (D-148): a market that makes none of a storable good its producers or
  // households buy opens with opening-stock-days of that demand, held by its largest
  // warehouse, until trade brings more (the D-136 rule assumed local producers).
  const householdByMarket = marketTotals(newHouseholds);
  const merchantOf = new Map();
  for (const row of warehouses) {
    const key = marketOfProvince.get(row.provinceId).key;
    const current = merchantOf.get(key);
    if (current === undefined || row.level > current.level || (row.level === current.level && row.key < current.key)) merchantOf.set(key, row);
  }
  const merchantByMarket = new Map(markets.map((market) => [market.key, new Map()]));
  const lotsByMarket = new Map();
  for (const market of markets) {
    const lots = [];
    const producers = solved.filter((building) => building.market === market);
    for (const good of goods) {
      if (good.storable === false) continue;
      const total = outputByMarket.get(market.key).get(good.id) ?? 0;
      if (!(total > 0)) {
        const imported = ((inputByMarket.get(market.key).get(good.id) ?? 0) + (householdByMarket.get(market.key)?.get(good.id) ?? 0)) * rows.openingStockDays;
        const merchant = merchantOf.get(market.key);
        const quantity = round(imported, 3);
        if (quantity > 0 && merchant !== undefined) {
          lots.push({ goodKey: good.key, ownerBuildingKey: merchant.key, quantity });
          merchantByMarket.get(market.key).set(good.id, quantity);
        }
        continue;
      }
      const wanted = (inputByMarket.get(market.key).get(good.id) ?? 0) * rows.openingStockDays;
      if (!(wanted > 0)) continue;
      for (const building of producers) {
        const output = building.definition.outputs.find((entry) => entry.goodId === good.id);
        if (output === undefined) continue;
        const quantity = round((wanted * building.capacityOut * output.quantityPerThroughputUnit * building.tf) / total, 3);
        if (quantity > 0) lots.push({ goodKey: good.key, ownerBuildingKey: building.outRow.key, quantity });
      }
    }
    lots.sort((left, right) => left.ownerBuildingKey.localeCompare(right.ownerBuildingKey) || left.goodKey.localeCompare(right.goodKey));
    lotsByMarket.set(market.key, lots);
  }
  // Warehouse capacity per level and good (C-19): the largest, over markets, of
  // storage-headroom-days of the market's output or producer demand, per warehouse level.
  const warehouseLevels = new Map();
  for (const row of warehouses) {
    const key = marketOfProvince.get(row.provinceId).key;
    warehouseLevels.set(key, (warehouseLevels.get(key) ?? 0) + row.level);
  }
  const warehouseCapacity = new Map();
  for (const good of goods) {
    if (good.storable === false) continue;
    let capacity = 0;
    for (const market of markets) {
      const levels = warehouseLevels.get(market.key) ?? 0;
      if (!(levels > 0)) continue;
      const flow = Math.max(outputByMarket.get(market.key).get(good.id) ?? 0, inputByMarket.get(market.key).get(good.id) ?? 0, merchantByMarket.get(market.key).get(good.id) ?? 0);
      capacity = Math.max(capacity, (rows.storageHeadroomDays * flow) / levels);
    }
    warehouseCapacity.set(good.id, capacity);
  }

  // 8. Coverage and balances.
  const coveredByTerritory = new Map();
  const coveredByMarket = new Map();
  const coveredByCountry = new Map();
  for (const building of solved) {
    const territory = building.province.territoryKey;
    coveredByTerritory.set(territory, (coveredByTerritory.get(territory) ?? 0) + building.vaPerYear);
    coveredByMarket.set(building.market.key, (coveredByMarket.get(building.market.key) ?? 0) + building.vaPerYear);
    const tag = countryOf.get(building.province.id).tag;
    coveredByCountry.set(tag, (coveredByCountry.get(tag) ?? 0) + building.vaPerYear);
  }
  const finalDemand = sumRows(newHouseholds, producerDemand(new Map(solved.map((building) => [building.key, { ...building, capacityTU: building.capacityOut }]))));
  const worldDemand = new Map();
  for (const row of finalDemand.values()) for (const [goodId, quantity] of row) worldDemand.set(goodId, (worldDemand.get(goodId) ?? 0) + quantity);
  const worldOutput = new Map();
  for (const row of outputByMarket.values()) for (const [goodId, quantity] of row) worldOutput.set(goodId, (worldOutput.get(goodId) ?? 0) + quantity);
  const balance = {};
  for (const good of goods) {
    const demand = worldDemand.get(good.id) ?? 0;
    const output = worldOutput.get(good.id) ?? 0;
    if (demand > 0 || output > 0) balance[good.key] = { demandPerDay: demand, outputPerDay: output, outputOverDemand: demand > 0 ? output / demand : null };
  }
  report.worldBalance = balance;
  report.workforceCapFactorByTerritory = capped;
  report.fertiliserMarkets = markets.filter((market) => fertiliserKnownInMarket.get(market.key)).map((market) => market.key).sort();
  report.buildingsByDefinition = {};
  for (const row of buildingRows) {
    const entry = report.buildingsByDefinition[row.definitionKey] ?? { buildings: 0, levels: 0 };
    entry.buildings += 1;
    entry.levels += row.level;
    report.buildingsByDefinition[row.definitionKey] = entry;
  }
  const jobsByTerritory = {};
  for (const building of solved) {
    const territory = building.province.territoryKey;
    const row = jobsByTerritory[territory] ?? {};
    for (const job of building.definition.jobs) {
      const key = professionById.get(job.professionId).key;
      row[key] = (row[key] ?? 0) + job.workersPerThroughputUnit * building.definition.referenceThroughputPerDayAtLevelOne * building.level;
    }
    jobsByTerritory[territory] = row;
  }
  return {
    buildingRows,
    lotsByMarket,
    warehouseCapacity,
    coveredByTerritory,
    coveredByMarket,
    coveredByCountry,
    worldOutput,
    jobsByTerritory,
    workforce,
    report,
  };
}

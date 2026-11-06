/**
 * P5b (D-146 A5, plan §8): placement and calibration of the 1900 production of the new
 * goods. Called by `build-goods-1900.mjs` with the definitions, needs and goods it built.
 *
 * Method:
 *  1. Household demand per market and good: population x the quantities of the tiers its
 *     wealth level activates (P2b), a gated item only where the country knows its
 *     technology.
 *  2. Goods are placed from final goods back to raw materials. A good's world level is
 *     its modelled demand (households, the inputs of buildings already placed, and the
 *     maintenance of every building); D-146 A5. Its country shares are the sourced 1900
 *     output shares where they exist (aggregate rows are left out and the rest
 *     renormalised; recorded), otherwise each market makes its own demand.
 *  3. Inside a territory the output goes to provinces by discovered deposit stock x
 *     quality (extraction), by cropland within the crop band (crops) or by urban
 *     population (everything else); one building per province and definition.
 *  4. Level and technique per building follow D-135 A3 at the market's prices and the
 *     territory's wages; operating cash is 30 days of costs (P2b row).
 *
 * Gold and silver are not placed: their production model waits for D-140 (D-146 A7).
 */

const FINAL_TO_RAW = [
  "personal-services", "finance-services", "communication", "commerce", "transport-services",
  "pharmaceuticals", "household-goods", "dairy", "produce", "sugar", "coffee-tea-cocoa", "tobacco",
  "paper", "kerosene", "electricity", "ships", "electrical-equipment", "machinery", "construction-materials",
  "fertiliser", "aluminium", "copper", "steel", "chemicals", "rubber", "timber",
  "coal", "crude-oil", "natural-gas", "iron-ore", "copper-ore", "bauxite", "nitrates", "tin",
];
const AGGREGATE_KEYS = new Set(["other", "other-europe"]);
const CENTRAL_AMERICA = ["gua-home", "hon-home", "sal-home", "nic-home", "cos-home"];

export function placeCatalogue(context) {
  const {
    goods, definitions, needs, professions, provinces, pops, countries, markets, buildings,
    deposits, sources, wagesByTerritory, laborShare, technologyKeys, round, workingCapitalDays,
  } = context;
  const goodByKey = new Map(goods.map((good) => [good.key, good]));
  const goodById = new Map(goods.map((good) => [good.id, good]));
  const definitionByKey = new Map(definitions.map((definition) => [definition.key, definition]));
  const professionById = new Map(professions.map((profession) => [profession.id, profession]));
  const provinceById = new Map(provinces.map((province) => [province.id, province]));
  const countryOfProvince = new Map();
  for (const country of countries) for (const id of country.provinceIds) countryOfProvince.set(id, country);
  const marketOfProvince = new Map();
  for (const market of markets) for (const id of market.provinceIds) marketOfProvince.set(id, market);
  const knows = (country, key) => key === null || (country?.technology?.researchedTechnologyKeys ?? []).includes(key);
  const price = (market, goodId) => goodById.get(goodId).basePrice1900RUSD * market.initialPriceMultiplier;

  // 1. Household demand by market and good.
  const demand = new Map(markets.map((market) => [market.key, new Map()]));
  const add = (marketKey, goodId, quantity) => {
    const row = demand.get(marketKey);
    row.set(goodId, (row.get(goodId) ?? 0) + quantity);
  };
  for (const pop of pops) {
    const market = marketOfProvince.get(pop.provinceId);
    if (market === undefined || !(pop.population > 0)) continue;
    const country = countryOfProvince.get(pop.provinceId);
    for (const tier of needs) {
      if (pop.wealthLevel < tier.activationWealthMin) continue;
      for (const item of tier.items) {
        if (item.requiredTechnologyKey !== undefined && !knows(country, item.requiredTechnologyKey)) continue;
        add(market.key, goodByKey.get(item.goodKey).id, pop.population * item.quantityPerCapitaPerDay);
      }
    }
  }

  // Inputs and maintenance of the existing (P2b) buildings, at their solved throughput.
  const placed = [];
  const tuOf = (building) => {
    const definition = definitionByKey.get(building.definitionKey);
    return building.level * definition.referenceThroughputPerDayAtLevelOne * (building.technique ?? 1);
  };
  const addBuildingDemand = (building, tu) => {
    const definition = definitionByKey.get(building.definitionKey);
    const market = marketOfProvince.get(building.provinceId);
    if (market === undefined) return;
    for (const input of definition.inputs) add(market.key, input.goodId, input.quantityPerThroughputUnit * tu);
    for (const item of definition.maintenanceInputs ?? []) add(market.key, item.goodId, item.quantityPerLevelPerDay * building.level);
  };
  for (const building of buildings) {
    const definition = definitionByKey.get(building.definitionKey);
    if (definition.jobs.length === 0) continue;
    for (const item of definition.maintenanceInputs ?? []) {
      const market = marketOfProvince.get(building.provinceId);
      if (market !== undefined) add(market.key, item.goodId, item.quantityPerLevelPerDay * building.level);
    }
  }

  // 2-4. Place goods from final to raw.
  const producerDefinitions = (goodId) =>
    definitions.filter((definition) => definition.outputs[0]?.goodId === goodId && definition.jobs.length > 0);
  const report = { goods: {} };
  const popsByProvince = new Map();
  for (const pop of pops) {
    const list = popsByProvince.get(pop.provinceId) ?? [];
    list.push(pop);
    popsByProvince.set(pop.provinceId, list);
  }
  const ownerOf = (provinceId) => {
    const list = popsByProvince.get(provinceId) ?? [];
    const capitalists = list.find((pop) => pop.professionKey === "capitalists" && pop.population > 0);
    if (capitalists !== undefined) return "capitalists";
    const largest = [...list].sort((left, right) => right.population - left.population || left.professionKey.localeCompare(right.professionKey))[0];
    return largest?.professionKey ?? null;
  };
  const territoryProvinces = new Map();
  for (const province of provinces) {
    const list = territoryProvinces.get(province.territoryKey) ?? [];
    list.push(province);
    territoryProvinces.set(province.territoryKey, list);
  }
  const urbanPopulation = new Map();
  for (const pop of pops) {
    const province = provinceById.get(pop.provinceId);
    urbanPopulation.set(pop.provinceId, (urbanPopulation.get(pop.provinceId) ?? 0) + pop.population * (province?.urbanShare ?? 0));
  }

  for (const key of FINAL_TO_RAW) {
    const good = goodByKey.get(key);
    const total = [...demand.values()].reduce((sum, row) => sum + (row.get(good.id) ?? 0), 0);
    if (!(total > 0)) {
      report.goods[key] = { worldDemandPerDay: 0, placed: 0 };
      continue;
    }
    // Country (territory) targets.
    const targets = new Map();
    const outputs = sources.outputs1900[key];
    if (outputs !== undefined) {
      const entries = [];
      for (const [territory, value] of outputs.entries) {
        if (AGGREGATE_KEYS.has(territory)) continue;
        if (territory === "central-america") {
          for (const member of CENTRAL_AMERICA) entries.push([member, value / CENTRAL_AMERICA.length]);
        } else entries.push([territory, value]);
      }
      const sum = entries.reduce((acc, [, value]) => acc + value, 0);
      for (const [territory, value] of entries) targets.set(territory, (targets.get(territory) ?? 0) + (total * value) / sum);
    } else {
      for (const market of markets) {
        const quantity = demand.get(market.key).get(good.id) ?? 0;
        if (!(quantity > 0)) continue;
        // The market's largest-population territory makes its demand.
        const byTerritory = new Map();
        for (const id of market.provinceIds) {
          const province = provinceById.get(id);
          byTerritory.set(province.territoryKey, (byTerritory.get(province.territoryKey) ?? 0) + (urbanPopulation.get(id) ?? 0) + 1);
        }
        const territory = [...byTerritory].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0][0];
        targets.set(territory, (targets.get(territory) ?? 0) + quantity);
      }
    }
    let placedQuantity = 0;
    const unplaced = [];
    for (const [territory, quantity] of [...targets].sort((left, right) => left[0].localeCompare(right[0]))) {
      const candidates = territoryProvinces.get(territory) ?? [];
      const country = countryOfProvince.get(candidates[0]?.id);
      // The definition used: the first producer of the good this country can build.
      const definition = producerDefinitions(good.id).find((entry) => {
        const gate = entry.requiredTechnologyId === null ? null : technologyKeys.get(entry.requiredTechnologyId);
        if (!knows(country, gate)) return false;
        if (entry.key === "hydro-station" || entry.key === "synthetic-rubber-plant" || entry.key === "petrochemical-plant") return false;
        return true;
      });
      if (definition === undefined) {
        unplaced.push({ territory, quantity, reason: "no producer this country can build" });
        continue;
      }
      // Province weights.
      const weights = [];
      for (const province of candidates) {
        if (marketOfProvince.get(province.id) === undefined || ownerOf(province.id) === null) continue;
        let weight = 0;
        let depositId;
        if (definition.extracts !== undefined) {
          const best = deposits
            .filter((deposit) => deposit.provinceId === province.id && deposit.resource === definition.extracts && deposit.discovered)
            .sort((left, right) => right.initialStock - left.initialStock || left.id - right.id)[0];
          if (best === undefined) continue;
          weight = best.initialStock * best.quality;
          depositId = best.id;
        } else if (definition.landUse !== undefined) {
          if (definition.maxAbsLatitudeDeg !== undefined && province.absLatitudeDeg !== undefined && province.absLatitudeDeg > definition.maxAbsLatitudeDeg) continue;
          weight = definition.landUse === "cropland" ? province.arableLandHa : province.pastureHa;
        } else if (definition.maxAbsLatitudeDeg !== undefined) {
          if (province.absLatitudeDeg !== undefined && province.absLatitudeDeg > definition.maxAbsLatitudeDeg) continue;
          weight = province.arableLandHa + 1;
        } else {
          weight = (urbanPopulation.get(province.id) ?? 0) + 1;
        }
        if (weight > 0) weights.push({ province, weight, depositId });
      }
      if (weights.length === 0) {
        unplaced.push({ territory, quantity, reason: definition.extracts !== undefined ? `no discovered ${definition.extracts} deposit` : "no suitable province" });
        continue;
      }
      // At most the eight heaviest provinces, so small shares do not scatter one-level plants.
      weights.sort((left, right) => right.weight - left.weight || left.province.id - right.province.id);
      const chosen = weights.slice(0, 8);
      const weightSum = chosen.reduce((acc, entry) => acc + entry.weight, 0);
      for (const entry of chosen) {
        const share = (quantity * entry.weight) / weightSum;
        const market = marketOfProvince.get(entry.province.id);
        const wages = wagesByTerritory(entry.province);
        const tf = context.techFactor(countryOfProvince.get(entry.province.id), definition.sector);
        const outputPerTU = definition.outputs[0].quantityPerThroughputUnit * tf;
        const tu = share / outputPerTU;
        const vaPerTU =
          definition.outputs.reduce((acc, output) => acc + output.quantityPerThroughputUnit * tf * price(market, output.goodId), 0) -
          definition.inputs.reduce((acc, input) => acc + input.quantityPerThroughputUnit * price(market, input.goodId), 0);
        if (!(vaPerTU > 0)) {
          unplaced.push({ territory, quantity: share, reason: `non-positive value added in ${market.key}` });
          continue;
        }
        const wageBillLevelDay = definition.jobs.reduce((acc, job) => acc + job.workersPerThroughputUnit * definition.referenceThroughputPerDayAtLevelOne * wages[professionById.get(job.professionId).key], 0) / 365;
        const upkeepDay = definition.dailyUpkeepRUSDAtLevelOne +
          (definition.maintenanceInputs ?? []).reduce((acc, item) => acc + item.quantityPerLevelPerDay * price(market, item.goodId), 0);
        const targetLevelDay = wageBillLevelDay / laborShare(definition.sector) + upkeepDay;
        const technique = targetLevelDay / (definition.referenceThroughputPerDayAtLevelOne * vaPerTU);
        const level = Math.max(1, Math.round((tu * vaPerTU) / targetLevelDay));
        const tuDay = level * definition.referenceThroughputPerDayAtLevelOne * technique;
        const inputCostDay = definition.inputs.reduce((acc, input) => acc + tuDay * input.quantityPerThroughputUnit * price(market, input.goodId), 0);
        const building = {
          key: `${entry.province.key}-${definition.key}-p5b`,
          provinceId: entry.province.id,
          definitionKey: definition.key,
          level,
          ownerProfessionKey: ownerOf(entry.province.id),
          operatingCashRUSD: Math.max(1, Math.round(workingCapitalDays * (wageBillLevelDay * level + inputCostDay + upkeepDay * level))),
          technique: round(technique, 6),
          ...(entry.depositId === undefined ? {} : { depositId: entry.depositId }),
          status: "provisional",
        };
        placed.push(building);
        placedQuantity += tuDay * outputPerTU;
        addBuildingDemand(building, tuDay);
        for (const output of definition.outputs.slice(1)) {
          // Joint outputs (refinery) count against their own goods' demand.
          add(market.key, output.goodId, -tuDay * output.quantityPerThroughputUnit * tf);
        }
      }
    }
    report.goods[key] = {
      worldDemandPerDay: total,
      placedOutputPerDay: placedQuantity,
      modelledOverSourcedBasis: outputs === undefined ? "local demand (no sourced shares)" : `sourced shares (${outputs.locator})`,
      unplaced,
    };
  }
  return { buildings: placed, demand, report };
}

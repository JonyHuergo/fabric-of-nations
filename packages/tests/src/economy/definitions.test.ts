import { loadM3SmallEconomy } from "../fixtures/smallWorlds.js";
import {
  assertValidEconomyDefinitions,
  type EconomyDefinitions,
} from "@century/sim";

function cloneDefinitions(): EconomyDefinitions {
  return JSON.parse(JSON.stringify(loadM3SmallEconomy().definitions)) as EconomyDefinitions;
}

describe("M3a static economy definitions", () => {
  test("loads the approved eight-good, eight-building catalog", () => {
    const scenario = loadM3SmallEconomy();
    const { goods, professions, buildings } = scenario.definitions;

    expect(goods.map((good) => good.key)).toEqual([
      "grain",
      "livestock",
      "fish",
      "cotton",
      "wool",
      "textiles",
      "clothing",
      "food-products",
    ]);
    expect(goods.some((good) => good.key === "services")).toBe(false);
    expect(professions.map((profession) => profession.key)).toEqual([
      "peasants",
      "laborers",
      "clerks",
      "capitalists",
    ]);
    expect(buildings).toHaveLength(8);
    expect(buildings.every((building) => building.resourceRequirements.length === 0)).toBe(true);
    expect(buildings.every((building) => building.requiredTechnologyId === null)).toBe(true);
    expect(buildings.every((building) => building.ownershipAllowed.includes("private"))).toBe(true);

    const workshop = buildings.find((building) => building.key === "workshop");
    expect(workshop?.inputs.map((input) => input.goodId)).toEqual([5]);
    expect(workshop?.outputs.map((output) => output.goodId)).toEqual([6]);
    expect(
      scenario.population.definitions.needs.flatMap((tier) => tier.items.map((item) => item.goodKey)),
    ).not.toContain("services");

    expect(() => assertValidEconomyDefinitions(scenario.definitions)).not.toThrow();
  });

  test("rejects duplicate or malformed goods", () => {
    const duplicate = cloneDefinitions();
    duplicate.goods[1]!.id = duplicate.goods[0]!.id;
    expect(() => assertValidEconomyDefinitions(duplicate)).toThrow(/duplicate|id/i);

    const duplicateKey = cloneDefinitions();
    duplicateKey.goods[1]!.key = duplicateKey.goods[0]!.key;
    expect(() => assertValidEconomyDefinitions(duplicateKey)).toThrow(/duplicate|key/i);

    const badPrice = cloneDefinitions();
    badPrice.goods[0]!.basePrice1900RUSD = -1;
    expect(() => assertValidEconomyDefinitions(badPrice)).toThrow(/basePrice/i);

    const nanPrice = cloneDefinitions();
    nanPrice.goods[0]!.basePrice1900RUSD = Number.NaN;
    expect(() => assertValidEconomyDefinitions(nanPrice)).toThrow(/basePrice|finite/i);

    const badCategory = cloneDefinitions();
    (badCategory.goods[0] as unknown as { category: string }).category = "magic";
    expect(() => assertValidEconomyDefinitions(badCategory)).toThrow(/category/i);
  });

  test("rejects services in the M3 catalog", () => {
    const definitions = cloneDefinitions();
    definitions.goods.push({
      id: definitions.goods.length,
      key: "services",
      name: "Services",
      category: "service",
      basePrice1900RUSD: 1,
      transportCostPerUnit: 0,
      priceElasticity: 1,
      spoilageRateAnnual: 0,
      unitLabel: "unit",
    });
    expect(() => assertValidEconomyDefinitions(definitions)).toThrow(/services|defer/i);
  });

  test("rejects unknown recipe references and invalid coefficients", () => {
    const unknownInput = cloneDefinitions();
    unknownInput.buildings[0]!.inputs = [
      { goodId: 99, quantityPerThroughputUnit: 1 },
    ];
    expect(() => assertValidEconomyDefinitions(unknownInput)).toThrow(/good|input/i);

    const unknownProfession = cloneDefinitions();
    unknownProfession.buildings[0]!.jobs = [
      { professionId: 99, workersPerThroughputUnit: 1 },
    ];
    expect(() => assertValidEconomyDefinitions(unknownProfession)).toThrow(/profession|job/i);

    const negativeCoefficient = cloneDefinitions();
    negativeCoefficient.buildings[0]!.outputs[0]!.quantityPerThroughputUnit = -1;
    expect(() => assertValidEconomyDefinitions(negativeCoefficient)).toThrow(/output|quantity/i);

    const selfInput = cloneDefinitions();
    selfInput.buildings[4]!.inputs = [
      { goodId: selfInput.buildings[4]!.outputs[0]!.goodId, quantityPerThroughputUnit: 1 },
    ];
    expect(() => assertValidEconomyDefinitions(selfInput)).toThrow(/self|input|output/i);

    const noPurpose = cloneDefinitions();
    noPurpose.buildings[7]!.storageCapacityByGood = [];
    expect(() => assertValidEconomyDefinitions(noPurpose)).toThrow(/output|storage/i);
  });

  test("rejects resource-limited recipes in M3", () => {
    const definitions = cloneDefinitions();
    definitions.buildings[0]!.resourceRequirements = [
      { goodId: 0, quantityPerThroughputUnit: 1 },
    ];
    expect(() => assertValidEconomyDefinitions(definitions)).toThrow(/resource/i);
  });
});

import {
  applyCountryAction,
  createEconomyWorld,
  deserializeWorld,
  hashWorld,
  runTicks,
  serializeWorld,
  type CountryAction,
  type TickContext,
} from "@century/sim";
import { loadM5EightPolities } from "@century/data";

function contextFor(scenario: ReturnType<typeof loadM5EightPolities>): TickContext {
  return {
    population: { definitions: scenario.population.definitions },
    economy: { definitions: scenario.definitions },
  };
}

describe("M6 designated player country", () => {
  test("identifies the player country and preserves its fiscal policy across AI evaluations", () => {
    const scenario = loadM5EightPolities();
    const world = createEconomyWorld(scenario, { seed: 20_261_023 });
    expect(world.playerCountryId).not.toBeNull();
    const player = world.countries.find((country) => country.id === world.playerCountryId);
    expect(player?.tag).toBe("USA");

    const action: CountryAction = {
      kind: "set-fiscal-policy",
      countryId: player!.id,
      dayIndex: world.dayIndex,
      source: "player",
      incomeTaxRate: 0.12,
      incomeTaxAllowanceSUSDPerYear: 0,
      welfareBudgetSUSDPerYear: 2_000_000,
      welfareMaxWealthLevel: 99,
      businessProfitTaxRate: 0,
      reserveTargetSUSD: 0,
    };
    applyCountryAction(world, action);
    expect(world.countries.find((country) => country.id === player!.id)?.fiscal).toEqual({
      incomeTaxRate: 0.12,
      incomeTaxAllowanceSUSDPerYear: 0,
      welfareBudgetSUSDPerYear: 2_000_000,
      welfareMaxWealthLevel: 99,
      businessProfitTaxRate: 0,
      reserveTargetSUSD: 0,
    });

    // Every country is AI-enabled in the historical sample. Run past the
    // player's first scheduled evaluation day (at most start+7). The player
    // country must not be evaluated or rewritten, while AI-controlled countries
    // continue to receive their scheduled evaluation.
    runTicks(world, 8, contextFor(scenario));
    const playerAfter = world.countries.find((country) => country.id === player!.id);
    expect(playerAfter?.fiscal).toEqual({
      incomeTaxRate: 0.12,
      incomeTaxAllowanceSUSDPerYear: 0,
      welfareBudgetSUSDPerYear: 2_000_000,
      welfareMaxWealthLevel: 99,
      businessProfitTaxRate: 0,
      reserveTargetSUSD: 0,
    });
    expect(playerAfter?.ai.lastDecisionDay).toBeNull();
    const evaluatedAiCountries = world.countries.filter(
      (country) => country.id !== player!.id && country.ai.lastDecisionDay !== null,
    );
    expect(evaluatedAiCountries.length).toBeGreaterThan(0);
  });

  test("save/load and deterministic replay preserve the player-country configuration", () => {
    const scenario = loadM5EightPolities();
    const context = contextFor(scenario);
    const first = createEconomyWorld(scenario, { seed: 20_261_023 });
    const second = createEconomyWorld(scenario, { seed: 20_261_023 });
    const action: CountryAction = {
      kind: "set-fiscal-policy",
      countryId: first.playerCountryId!,
      dayIndex: 0,
      source: "player",
      incomeTaxRate: 0.1,
      incomeTaxAllowanceSUSDPerYear: 0,
      welfareBudgetSUSDPerYear: 1_000_000,
      welfareMaxWealthLevel: 99,
      businessProfitTaxRate: 0,
      reserveTargetSUSD: 0,
    };
    applyCountryAction(first, action);
    applyCountryAction(second, action);
    runTicks(first, 8, context);
    runTicks(second, 8, context);
    expect(hashWorld(first)).toBe(hashWorld(second));

    const restored = deserializeWorld(serializeWorld(first));
    expect(restored.playerCountryId).toBe(first.playerCountryId);
    expect(hashWorld(restored)).toBe(hashWorld(first));
    runTicks(restored, 8, context);
    runTicks(second, 8, context);
    expect(hashWorld(restored)).toBe(hashWorld(second));
  });
});

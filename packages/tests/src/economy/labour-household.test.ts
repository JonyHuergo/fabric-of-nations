/**
 * P7 (D-154, docs/P7_EMPLOYERS_PROPOSAL.md §4.1): households employing domestic servants.
 *
 * - Hiring: after firms and institutions; servants are unemployed workers of ungated
 *   wage-labour professions in the employer's province; employers are middle and upper
 *   blocks with income; one eligibility per person (servants + jobs ≤ eligible).
 * - Payment: the employer's household cash pays the servant's household cash (consumption of
 *   the employer, wage income of the servant); money is conserved.
 * - Determinism and save round trip with household assignments.
 */
import { createEconomyWorld, deserializeWorld, encodeWorld, labourEligibleWorkforce, refreshEmployment, serializeWorld, tick, type World } from "@century/sim";

import { economyTickContext, totalCash } from "../fixtures/m3e.js";
import { M5_LABORERS, M5_REGION_A1 } from "../fixtures/m5.js";
import { P7_CLERK_BLOCK, p7Scenario } from "../fixtures/p7.js";

function scenarioWithServants(share = 0.2) {
  const scenario = p7Scenario();
  scenario.definitions = {
    ...scenario.definitions,
    labourMarket: { ...(scenario.definitions.labourMarket ?? { domesticServiceBuildingKeys: [] }), domesticServiceShares: [{ provinceId: M5_REGION_A1, share }] },
  };
  return scenario;
}

function worldWithServants(): { world: World; scenario: ReturnType<typeof scenarioWithServants> } {
  const scenario = scenarioWithServants();
  const world = createEconomyWorld(scenario);
  // The clerks (a middle stratum) earn an income; the laborers have unemployed people.
  for (const block of world.popBlocks) if (block.id === P7_CLERK_BLOCK) block.incomeSmoothedRUSDPerCapitaDay = 5;
  const building = world.buildings[0];
  if (building !== undefined) building.level = 1;
  refreshEmployment(world, scenario.definitions, world.dayIndex, { force: true });
  return { world, scenario };
}

describe("P7 households as employers (§4.1)", () => {
  test("servants are hired from the province's unemployed wage workers by its middle and upper blocks", () => {
    const { world, scenario } = worldWithServants();
    const assignments = world.labourMarket.householdEmployment;
    expect(assignments.length).toBeGreaterThan(0);
    const blockById = new Map(world.popBlocks.map((block) => [block.id, block]));
    const professionById = new Map(scenario.definitions.professions.map((profession) => [profession.id, profession]));
    for (const assignment of assignments) {
      const servant = blockById.get(assignment.popBlockId);
      const employer = blockById.get(assignment.employerBlockId);
      expect(servant?.provinceId).toBe(M5_REGION_A1);
      expect(employer?.provinceId).toBe(M5_REGION_A1);
      expect(employer?.id).toBe(P7_CLERK_BLOCK);
      expect(servant?.professionId).toBe(M5_LABORERS);
    }
    // One eligibility per person: building + institution + household work ≤ eligible.
    for (const block of world.popBlocks) {
      const profession = professionById.get(block.professionId);
      if (profession === undefined) continue;
      const working =
        world.employment.filter((entry) => entry.popBlockId === block.id).reduce((sum, entry) => sum + entry.workers, 0) +
        world.labourMarket.institutionEmployment.filter((entry) => entry.popBlockId === block.id).reduce((sum, entry) => sum + entry.workers, 0) +
        assignments.filter((entry) => entry.popBlockId === block.id).reduce((sum, entry) => sum + entry.workers, 0);
      expect(working).toBeLessThanOrEqual(labourEligibleWorkforce(block, profession));
    }
    // The households want floor(share × eligible non-owner workers) at most.
    const hired = assignments.reduce((sum, entry) => sum + entry.workers, 0);
    const workforce = world.popBlocks
      .filter((block) => block.provinceId === M5_REGION_A1)
      .reduce((sum, block) => {
        const profession = professionById.get(block.professionId);
        return sum + (profession === undefined ? 0 : labourEligibleWorkforce(block, profession));
      }, 0);
    expect(hired).toBeLessThanOrEqual(Math.floor(0.2 * workforce));
  });

  test("without shares nobody is hired by households", () => {
    const scenario = p7Scenario();
    const world = createEconomyWorld(scenario);
    for (const block of world.popBlocks) if (block.id === P7_CLERK_BLOCK) block.incomeSmoothedRUSDPerCapitaDay = 5;
    refreshEmployment(world, scenario.definitions, world.dayIndex, { force: true });
    expect(world.labourMarket.householdEmployment).toEqual([]);
  });

  test("servants are paid by their employers day by day; money is conserved", () => {
    const { world, scenario } = worldWithServants();
    const context = economyTickContext(scenario);
    const employerCash = (w: World): number =>
      w.finance.accounts.find((account) => account.ownerKind === "popBlock" && account.ownerId === P7_CLERK_BLOCK && account.subtype === "household-cash")?.balanceRUSD ?? 0;
    expect(world.labourMarket.householdEmployment.length).toBeGreaterThan(0);
    expect(employerCash(world)).toBeGreaterThan(0);
    const cashBefore = totalCash(world);
    tick(world, context);
    expect(totalCash(world)).toBeCloseTo(cashBefore, 4);
    const posted = world.finance.postings.filter((posting) => posting.transactionKind === "domestic-service");
    expect(posted.length).toBeGreaterThan(0);
  });

  test("a world with household servants is deterministic and survives a save round trip", () => {
    const first = worldWithServants().world;
    const second = worldWithServants().world;
    expect(encodeWorld(first)).toEqual(encodeWorld(second));
    const restored = deserializeWorld(serializeWorld(first));
    expect(encodeWorld(restored)).toEqual(encodeWorld(first));
    expect(restored.labourMarket.householdEmployment).toEqual(first.labourMarket.householdEmployment);
  });
});

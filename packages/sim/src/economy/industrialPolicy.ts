/**
 * E4 industrial-policy and public-enterprise actions (D-075).
 *
 * These helpers are deliberately small and explicit:
 * - `set-industrial-policy` changes only validated sector subsidy rates;
 * - `support-public-enterprise` makes a capital contribution from the treasury to
 *   an existing state-owned building's operating cash and owner equity. It is not
 *   an expense, a loan, a guarantee, or a promise of future profitability.
 *
 * Both actions validate the complete candidate world and publish only on success.
 */

import { assertValidDayIndex } from "../calendar.js";
import { MONEY_TOLERANCE_SUSD } from "../population/constants.js";
import { requireFiniteNumber } from "../validation.js";
import type { DayIndex, Id } from "../types.js";
import { assertValidWorld, type World } from "../world.js";
import { postJournalBatch } from "./accounting.js";
import {
  assertAccountingIdentity,
  buildFinanceIndex,
  cloneFinanceState,
  designatedCashTotal,
} from "./accounts.js";
import { accumulateBudgetMemo } from "./budget.js";
import {
  MAX_PUBLIC_ENTERPRISE_SUPPORT_SUSD,
} from "./constants.js";
import { assertValidIndustrialPolicy } from "./country.js";
import { assertValidFinanceState } from "./validation.js";
import type { BuildingInstance, Country, IndustrialPolicy } from "./types.js";

function toleranceMoney(...values: number[]): number {
  let scale = 1;
  for (const value of values) scale = Math.max(scale, Math.abs(value));
  return MONEY_TOLERANCE_SUSD * scale;
}

function countryFor(world: World, countryId: Id): Country {
  const country = world.countries.find((entry) => entry.id === countryId);
  if (country === undefined) throw new RangeError(`unknown country ${String(countryId)}`);
  return country;
}

/** Validate and return the normalized industrial policy input. */
export function validateIndustrialPolicyInput(
  rates: unknown,
  path = "action.sectorSubsidyRates",
): IndustrialPolicy {
  if (!Array.isArray(rates)) {
    throw new TypeError(`${path} must be an array`);
  }
  return assertValidIndustrialPolicy({ sectorSubsidyRates: rates }, path);
}

/** Apply one validated industrial policy atomically. */
export function setIndustrialPolicy(
  world: World,
  countryId: Id,
  rates: readonly number[],
): Country {
  const country = countryFor(world, countryId);
  const industrial = validateIndustrialPolicyInput(rates);
  const candidateCountry: Country = { ...country, industrial };
  const candidate: World = {
    ...world,
    countries: world.countries.map((entry) =>
      entry.id === countryId ? candidateCountry : entry,
    ),
  };
  assertValidWorld(candidate);
  world.countries = world.countries.map((entry) =>
    entry.id === countryId ? candidateCountry : entry,
  );
  return candidateCountry;
}

export interface PublicEnterpriseSupportInput {
  readonly countryId: Id;
  readonly buildingId: Id;
  readonly amountSUSD: number;
}

/** Validate a public-enterprise capital contribution without mutating. */
export function validatePublicEnterpriseSupport(
  world: World,
  input: PublicEnterpriseSupportInput,
): BuildingInstance {
  const country = countryFor(world, input.countryId);
  const building = world.buildings.find((entry) => entry.id === input.buildingId);
  if (building === undefined) {
    throw new RangeError(`unknown building ${String(input.buildingId)}`);
  }
  if (building.ownerKind !== "state") {
    throw new RangeError("public-enterprise support requires a state-owned building");
  }
  if (!country.regionIds.includes(building.regionId)) {
    throw new RangeError("the state-owned building must be in the country's regions");
  }
  if (building.ownerAccountId !== country.treasuryAccountId) {
    throw new RangeError("the state-owned building must be owned by this country treasury");
  }
  const amount = requireFiniteNumber(input.amountSUSD, "action.amountSUSD");
  if (!(amount > 0)) {
    throw new RangeError("public-enterprise support amount must be positive");
  }
  if (amount > MAX_PUBLIC_ENTERPRISE_SUPPORT_SUSD) {
    throw new RangeError(
      `public-enterprise support amount must not exceed ${String(MAX_PUBLIC_ENTERPRISE_SUPPORT_SUSD)}`,
    );
  }
  const index = buildFinanceIndex(world.finance);
  const treasury = index.get("country", country.id, "treasury-cash");
  if (treasury.balanceSUSD + toleranceMoney(treasury.balanceSUSD, amount) < amount) {
    throw new RangeError("treasury cash does not cover the public-enterprise support");
  }
  return building;
}

/** Apply a public-enterprise capital contribution atomically. */
export function supportPublicEnterprise(
  world: World,
  input: PublicEnterpriseSupportInput,
  dayIndex: DayIndex,
): { building: BuildingInstance; amountSUSD: number; postingIds: readonly number[] } {
  assertValidDayIndex(dayIndex);
  if (world.dayIndex !== dayIndex) {
    throw new RangeError("public-enterprise support day must match the world day");
  }
  const building = validatePublicEnterpriseSupport(world, input);
  const country = countryFor(world, input.countryId);
  const stagedFinance = cloneFinanceState(world.finance);
  const index = buildFinanceIndex(stagedFinance);
  const treasury = index.get("country", country.id, "treasury-cash");
  const countryEquity = index.get("country", country.id, "owner-equity");
  const buildingCash = index.get("building", building.id, "operating-cash");
  const buildingEquity = index.get("building", building.id, "owner-equity");
  const postings = postJournalBatch(stagedFinance, dayIndex, [
    {
      transactionKind: "public-enterprise-capital-contribution",
      lines: [
        { accountId: treasury.id, side: "credit", amountSUSD: input.amountSUSD },
        { accountId: countryEquity.id, side: "debit", amountSUSD: input.amountSUSD },
        { accountId: buildingCash.id, side: "debit", amountSUSD: input.amountSUSD },
        { accountId: buildingEquity.id, side: "credit", amountSUSD: input.amountSUSD },
      ],
      sourceEntityId: country.id,
      targetEntityId: building.id,
    },
  ]);
  accumulateBudgetMemo(stagedFinance, country.id, {
    publicEnterpriseSupportSUSD: input.amountSUSD,
  });
  assertValidFinanceState(stagedFinance);
  assertAccountingIdentity(stagedFinance);
  const openingCash = designatedCashTotal(world.finance);
  const closingCash = designatedCashTotal(stagedFinance);
  if (Math.abs(openingCash - closingCash) > toleranceMoney(openingCash, closingCash)) {
    throw new RangeError("public-enterprise support did not conserve designated cash");
  }
  const candidate: World = { ...world, finance: stagedFinance };
  assertValidWorld(candidate);
  world.finance = stagedFinance;
  return {
    building,
    amountSUSD: input.amountSUSD,
    postingIds: postings.map((posting) => posting.id),
  };
}

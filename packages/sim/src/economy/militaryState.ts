/**
 * M10 military state construction, lookups, and structural validation.
 *
 * This module sits below `military.ts`: it never imports the world initializer
 * or the whole-world validator, so `world.ts` and `economy/validation.ts` can
 * validate military state without depending on the runtime military phase. The
 * phase module re-exports these symbols for the public economy surface.
 */

import { assertValidDayIndex } from "../calendar.js";
import type { Id } from "../types.js";
import type { World } from "../world.js";
import {
  MAX_ARMIES,
  MAX_MILITARY_RELATIONS,
  MAX_PEACE_OFFERS,
  MAX_WARS,
} from "./constants.js";
import { CASUS_BELLI, PEACE_TERMS } from "./types.js";
import type { MilitaryState, WarState } from "./types.js";
import { requireInteger } from "../validation.js";

export function emptyMilitaryState(): MilitaryState {
  return {
    enabled: false,
    armies: [],
    wars: [],
    relations: [],
    peaceOffers: [],
    casualties: [],
    nextArmyId: 1,
    nextWarId: 1,
    nextOfferId: 1,
    lastPhaseDay: null,
  };
}

export function countryById(world: World, countryId: Id) {
  return world.countries.find((country) => country.id === countryId);
}

export function regionById(world: World, regionId: Id) {
  return world.regions.find((region) => region.id === regionId);
}

/** The sovereign country that owns the region, or null for an unowned region. */
export function regionSovereignCountryId(world: World, regionId: Id): Id | null {
  for (const country of world.countries) {
    if (country.regionIds.includes(regionId)) return country.id;
  }
  return null;
}

/** The country exercising military control: the occupier, else the sovereign. */
export function regionControllerCountryId(world: World, regionId: Id): Id | null {
  const region = regionById(world, regionId);
  if (region === undefined) return null;
  return region.controllerCountryId ?? regionSovereignCountryId(world, regionId);
}

export function activeWarBetween(
  world: World,
  firstCountryId: Id,
  secondCountryId: Id,
): WarState | null {
  for (const war of world.military.wars) {
    if (war.endedDay !== null) continue;
    if (
      (war.attackerCountryId === firstCountryId && war.defenderCountryId === secondCountryId) ||
      (war.attackerCountryId === secondCountryId && war.defenderCountryId === firstCountryId)
    ) {
      return war;
    }
  }
  return null;
}

export function isWarPair(war: WarState, firstCountryId: Id, secondCountryId: Id): boolean {
  return (
    (firstCountryId === war.attackerCountryId && secondCountryId === war.defenderCountryId) ||
    (firstCountryId === war.defenderCountryId && secondCountryId === war.attackerCountryId)
  );
}

function assertMilitaryAccounts(world: World, path: string): void {
  const countryIds = new Set<Id>(world.countries.map((country) => country.id));
  const blockIds = new Set<Id>(world.popBlocks.map((block) => block.id));
  const expenseCounts = new Map<Id, number>();
  const incomeCounts = new Map<Id, number>();
  for (const account of world.finance.accounts) {
    if (account.subtype === "military-expense") {
      if (account.ownerKind !== "country" || account.ownerId === null) {
        throw new RangeError(`${path} military-expense account must be owned by a country`);
      }
      if (!countryIds.has(account.ownerId)) {
        throw new RangeError(`${path} military-expense account references an unknown country`);
      }
      if (account.category !== "expense") {
        throw new RangeError(`${path} military-expense account must be an expense account`);
      }
      expenseCounts.set(account.ownerId, (expenseCounts.get(account.ownerId) ?? 0) + 1);
    } else if (account.subtype === "military-income") {
      if (account.ownerKind !== "popBlock" || account.ownerId === null) {
        throw new RangeError(`${path} military-income account must be owned by a pop block`);
      }
      if (!blockIds.has(account.ownerId)) {
        throw new RangeError(`${path} military-income account references an unknown pop block`);
      }
      if (account.category !== "revenue") {
        throw new RangeError(`${path} military-income account must be a revenue account`);
      }
      incomeCounts.set(account.ownerId, (incomeCounts.get(account.ownerId) ?? 0) + 1);
    }
  }
  for (const country of world.countries) {
    if ((expenseCounts.get(country.id) ?? 0) !== 1) {
      throw new RangeError(
        `${path} requires exactly one military-expense account for country ${String(country.id)}`,
      );
    }
  }
  for (const block of world.popBlocks) {
    if ((incomeCounts.get(block.id) ?? 0) !== 1) {
      throw new RangeError(
        `${path} requires exactly one military-income account for pop block ${String(block.id)}`,
      );
    }
  }
}

export function assertValidMilitaryState(world: World, path = "world.military"): void {
  const state = world.military;
  if (typeof state !== "object" || state === null) {
    throw new TypeError(`${path} must be an object`);
  }
  if (typeof state.enabled !== "boolean") {
    throw new TypeError(`${path}.enabled must be a boolean`);
  }
  if (!Array.isArray(state.armies)) throw new TypeError(`${path}.armies must be an array`);
  if (!Array.isArray(state.wars)) throw new TypeError(`${path}.wars must be an array`);
  if (!Array.isArray(state.relations)) {
    throw new TypeError(`${path}.relations must be an array`);
  }
  if (!Array.isArray(state.peaceOffers)) {
    throw new TypeError(`${path}.peaceOffers must be an array`);
  }
  if (!Array.isArray(state.casualties)) {
    throw new TypeError(`${path}.casualties must be an array`);
  }
  if (state.armies.length > MAX_ARMIES) {
    throw new RangeError(`${path}.armies exceeds ${String(MAX_ARMIES)}`);
  }
  if (state.wars.length > MAX_WARS) throw new RangeError(`${path}.wars exceeds ${String(MAX_WARS)}`);
  if (state.relations.length > MAX_MILITARY_RELATIONS) {
    throw new RangeError(`${path}.relations exceeds ${String(MAX_MILITARY_RELATIONS)}`);
  }
  if (state.peaceOffers.length > MAX_PEACE_OFFERS) {
    throw new RangeError(`${path}.peaceOffers exceeds ${String(MAX_PEACE_OFFERS)}`);
  }
  const countryIds = new Set<Id>(world.countries.map((country) => country.id));
  const regionIds = new Set<Id>(world.regions.map((region) => region.id));
  assertValidDayIndex(world.dayIndex);
  if (
    state.lastPhaseDay !== null &&
    (!Number.isInteger(state.lastPhaseDay) ||
      state.lastPhaseDay < 0 ||
      state.lastPhaseDay > world.dayIndex)
  ) {
    throw new RangeError(`${path}.lastPhaseDay must be a past day or null`);
  }
  if (!state.enabled) {
    if (
      state.armies.length > 0 ||
      state.wars.length > 0 ||
      state.relations.length > 0 ||
      state.peaceOffers.length > 0 ||
      state.casualties.length > 0
    ) {
      throw new RangeError(
        `${path} is disabled but contains active military state`,
      );
    }
    if (state.lastPhaseDay !== null) {
      throw new RangeError(`${path} is disabled but has a last phase day`);
    }
  } else {
    assertMilitaryAccounts(world, path);
  }
  for (const id of [state.nextArmyId, state.nextWarId, state.nextOfferId]) {
    requireInteger(id, `${path}.nextId`, 1, 0xffff_ffff);
  }
  const armyIds = new Set<Id>();
  let previousArmyId = -1;
  for (const army of state.armies) {
    if (armyIds.has(army.id)) throw new RangeError(`${path}.armies duplicates an id`);
    if (army.id <= previousArmyId) throw new RangeError(`${path}.armies must be ascending`);
    previousArmyId = army.id;
    armyIds.add(army.id);
    if (!countryIds.has(army.countryId)) {
      throw new RangeError(`${path}.armies references an unknown country`);
    }
    if (!regionIds.has(army.regionId) || !regionIds.has(army.homeRegionId)) {
      throw new RangeError(`${path}.armies references an unknown region`);
    }
    for (const value of [army.personnel, army.wounded, army.deaths, army.captured]) {
      requireInteger(value, `${path}.armies count`, 0, 0xffff_ffff);
    }
    requireInteger(army.equipmentUnits, `${path}.armies.equipmentUnits`, 0, 0xffff_ffff);
    if (!(army.organization >= 0 && army.organization <= 1)) {
      throw new RangeError(`${path}.armies.organization must be in 0..1`);
    }
    if (!(army.supply >= 0 && army.supply <= 1)) {
      throw new RangeError(`${path}.armies.supply must be in 0..1`);
    }
    requireInteger(army.readyDay, `${path}.armies.readyDay`, 0, world.dayIndex + 1_000_000);
    if ((army.destinationRegionId === null) !== (army.arrivalDay === null)) {
      throw new RangeError(`${path}.armies movement fields must agree`);
    }
    if (army.destinationRegionId !== null && !regionIds.has(army.destinationRegionId)) {
      throw new RangeError(`${path}.armies destination is not a region`);
    }
    if (army.arrivalDay !== null) {
      requireInteger(army.arrivalDay, `${path}.armies.arrivalDay`, 0, world.dayIndex + 1_000_000);
    }
    if (army.wounded > 0 && army.woundedReturnDay === null) {
      throw new RangeError(`${path}.armies wounded requires a return day`);
    }
    if (army.wounded === 0 && army.woundedReturnDay !== null) {
      throw new RangeError(`${path}.armies return day requires wounded`);
    }
  }
  const warIds = new Set<Id>();
  let previousWarId = -1;
  for (const war of state.wars) {
    if (warIds.has(war.id)) throw new RangeError(`${path}.wars duplicates an id`);
    if (war.id <= previousWarId) throw new RangeError(`${path}.wars must be ascending`);
    previousWarId = war.id;
    warIds.add(war.id);
    if (!countryIds.has(war.attackerCountryId) || !countryIds.has(war.defenderCountryId)) {
      throw new RangeError(`${path}.wars references an unknown country`);
    }
    if (war.attackerCountryId === war.defenderCountryId) {
      throw new RangeError(`${path}.wars requires two distinct countries`);
    }
    if (!(CASUS_BELLI as readonly string[]).includes(war.casusBelli)) {
      throw new RangeError(`${path}.wars.casusBelli is invalid`);
    }
    requireInteger(war.startedDay, `${path}.wars.startedDay`, 0, world.dayIndex);
    if (war.endedDay !== null) {
      requireInteger(war.endedDay, `${path}.wars.endedDay`, war.startedDay, world.dayIndex);
    }
    if (war.truceUntilDay !== null) {
      requireInteger(war.truceUntilDay, `${path}.wars.truceUntilDay`, 0, 0xffff_ffff);
    }
    if (war.endedDay === null) {
      for (const other of state.wars) {
        if (other.id === war.id || other.endedDay !== null) continue;
        const samePair =
          (other.attackerCountryId === war.attackerCountryId &&
            other.defenderCountryId === war.defenderCountryId) ||
          (other.attackerCountryId === war.defenderCountryId &&
            other.defenderCountryId === war.attackerCountryId);
        if (samePair) throw new RangeError(`${path}.wars has two active wars for one pair`);
      }
    }
  }
  let previousRelation = -1;
  for (const relation of state.relations) {
    if (relation.countryA >= relation.countryB) {
      throw new RangeError(`${path}.relations must be canonical`);
    }
    const key = relation.countryA * 100_000 + relation.countryB;
    if (key <= previousRelation) throw new RangeError(`${path}.relations must be ascending`);
    previousRelation = key;
    if (!countryIds.has(relation.countryA) || !countryIds.has(relation.countryB)) {
      throw new RangeError(`${path}.relations references an unknown country`);
    }
    if (!(relation.score >= -100 && relation.score <= 100)) {
      throw new RangeError(`${path}.relations.score must be in -100..100`);
    }
    if (relation.truceUntilDay !== null) {
      requireInteger(
        relation.truceUntilDay,
        `${path}.relations.truceUntilDay`,
        0,
        0xffff_ffff,
      );
    }
  }
  const warById = new Map<Id, WarState>(
    state.wars.map((war) => [war.id, war] as const),
  );
  const offerIds = new Set<Id>();
  for (const offer of state.peaceOffers) {
    if (offerIds.has(offer.id)) throw new RangeError(`${path}.peaceOffers duplicates an id`);
    offerIds.add(offer.id);
    const war = warById.get(offer.warId);
    if (war === undefined) {
      throw new RangeError(`${path}.peaceOffers references an unknown war`);
    }
    if (war.endedDay !== null) {
      throw new RangeError(`${path}.peaceOffers references a war that has ended`);
    }
    if (!countryIds.has(offer.fromCountryId) || !countryIds.has(offer.toCountryId)) {
      throw new RangeError(`${path}.peaceOffers references an unknown country`);
    }
    if (offer.fromCountryId === offer.toCountryId) {
      throw new RangeError(`${path}.peaceOffers requires two distinct countries`);
    }
    if (!isWarPair(war, offer.fromCountryId, offer.toCountryId)) {
      throw new RangeError(
        `${path}.peaceOffers parties do not match the associated war's belligerents`,
      );
    }
    if (!(PEACE_TERMS as readonly string[]).includes(offer.terms)) {
      throw new RangeError(`${path}.peaceOffers.terms is invalid`);
    }
    requireInteger(offer.proposedDay, `${path}.peaceOffers.proposedDay`, 0, world.dayIndex);
  }
  const maxArmyId = state.armies.reduce((max, army) => Math.max(max, army.id), 0);
  const maxWarId = state.wars.reduce((max, war) => Math.max(max, war.id), 0);
  const maxOfferId = state.peaceOffers.reduce((max, offer) => Math.max(max, offer.id), 0);
  if (state.nextArmyId <= maxArmyId) {
    throw new RangeError(`${path}.nextArmyId must be after every retained army`);
  }
  if (state.nextWarId <= maxWarId) {
    throw new RangeError(`${path}.nextWarId must be after every retained war`);
  }
  if (state.nextOfferId <= maxOfferId) {
    throw new RangeError(`${path}.nextOfferId must be after every retained offer`);
  }
  let previousCasualty = -1;
  for (const record of state.casualties) {
    if (!countryIds.has(record.countryId)) {
      throw new RangeError(`${path}.casualties references an unknown country`);
    }
    if (record.countryId <= previousCasualty) {
      throw new RangeError(`${path}.casualties must be ascending`);
    }
    previousCasualty = record.countryId;
    for (const value of [record.deaths, record.woundedReturned, record.captured]) {
      requireInteger(value, `${path}.casualties count`, 0, 0xffff_ffff);
    }
  }
  for (const region of world.regions) {
    if (region.controllerCountryId === null) {
      if (region.occupiedSinceDay !== null) {
        throw new RangeError(`region ${String(region.id)} has no controller but an occupation day`);
      }
      continue;
    }
    if (!countryIds.has(region.controllerCountryId)) {
      throw new RangeError(`region ${String(region.id)} has an unknown controller`);
    }
    const sovereign = regionSovereignCountryId(world, region.id);
    if (sovereign === null) {
      throw new RangeError(`region ${String(region.id)} is occupied but unowned`);
    }
    if (region.controllerCountryId === sovereign) {
      throw new RangeError(`region ${String(region.id)} controller is its sovereign`);
    }
    if (region.occupiedSinceDay === null) {
      throw new RangeError(`region ${String(region.id)} is occupied without a start day`);
    }
    requireInteger(
      region.occupiedSinceDay,
      `region ${String(region.id)}.occupiedSinceDay`,
      0,
      world.dayIndex,
    );
    const war = activeWarBetween(world, region.controllerCountryId, sovereign);
    if (war === null) {
      throw new RangeError(`region ${String(region.id)} is occupied without an active war`);
    }
  }
}

/**
 * M12a provincial geography contracts.
 *
 * Provinces are the sole geographical subdivision beneath a polity. They are
 * permanent: their geometry and stable id never change when political ownership
 * changes. A province records four distinct political facts explicitly:
 *
 * - legal ownership (`ownerPolityId`), the sovereign title;
 * - effective control (`controllerPolityId`), which may differ while occupied;
 * - disputed claims (`claimantPolityIds`), which never imply ownership;
 * - a special administrative status (autonomy, condominium, free city, ...).
 *
 * Since P2 (D-118) the province is also the unit of population, buildings,
 * construction, unrest, land and infrastructure: its `ProvinceEconomy` record
 * lives in `World.provinceEconomies` under the same permanent id, and a legal
 * transfer moves that economy into the new owner's customs territory.
 *
 * Polity ids in this module refer to the 1900 catalog / future-polity registry
 * ids. For the 1900 starting world a province in a sovereign state is owned by
 * that state's simulation country id; a province in a dependent territory is
 * owned by its sovereign country id and carries the territorial administration
 * in `historicalAdminAffiliation`. Future successor polities have their own
 * registry ids and never appear as playable 1900 countries.
 */

import type { Day, Id } from "../types.js";
import type { CountryStatus } from "../economy/types.js";

/** Confidence classification for a province's historical geometry and metadata. */
export const PROVINCE_CONFIDENCE_LEVELS = ["low", "medium", "high"] as const;
export type ProvinceConfidence = (typeof PROVINCE_CONFIDENCE_LEVELS)[number];

/**
 * Special administrative or constitutional status of a province.
 *
 * `ordinary` is the default. The other values are informational political
 * facts: they do not create an additional geographical entity and do not
 * transfer ownership by themselves.
 */
export const PROVINCE_SPECIAL_STATUSES = [
  "ordinary",
  "autonomous",
  "joint-administration",
  "condominium",
  "free-city",
  "neutral",
  "mandate",
  "occupied",
] as const;
export type ProvinceSpecialStatus = (typeof PROVINCE_SPECIAL_STATUSES)[number];

/** How a province changed hands. */
export const PROVINCE_TRANSFER_KINDS = [
  "cession",
  "annexation",
  "accession",
  "independence",
  "union",
  "dissolution",
  "occupation",
  "liberation",
  "transfer",
] as const;
export type ProvinceTransferKind = (typeof PROVINCE_TRANSFER_KINDS)[number];

/**
 * One permanent province definition.
 *
 * Definitions are scenario content, never serialized into the world. The stable
 * `provinceId` and `key` are the only identifiers: display names are never
 * identifiers. `historicalName` is the name on 1 January 1900 and
 * `displayName` is the player-facing label used by the map.
 */
export interface ProvinceDefinition {
  readonly provinceId: Id;
  readonly key: string;
  /** Historical name on 1 January 1900. */
  readonly historicalName: string;
  /** Player-facing name; may differ from the historical name for readability. */
  readonly displayName: string;
  /** Optional historical aliases (other contemporary or modern names). */
  readonly aliases: readonly string[];
  /** Polity id of the legal owner on 1 January 1900. */
  readonly initialOwnerPolityId: Id;
  /** Historical administrative affiliation, e.g. "Austrian Crown Land". */
  readonly historicalAdminAffiliation: string;
  /** Optional informational historical grouping, e.g. "Kingdom of Hungary". */
  readonly historicalGrouping: string | null;
  /** Initial special administrative status. */
  readonly initialSpecialStatus: ProvinceSpecialStatus;
  /** Historical boundary provenance source ids. */
  readonly sourceIds: readonly string[];
  readonly confidence: ProvinceConfidence;
  readonly notes: string;
}

/**
 * A registered polity that can own provinces.
 *
 * The registry extends the 1900 country catalog with successor polities that
 * did not exist on 1 January 1900 (Poland, Czechoslovakia, Finland, the Baltic
 * states, the two German republics, ...). Registry records are static scenario
 * content. A future polity is never added to the 1900 selectable-country list;
 * it can receive provinces through an ownership transfer and is then a legal
 * owner/controller even before a playable simulation country is instantiated.
 */
export interface PolityDef {
  readonly polityId: Id;
  readonly tag: string;
  readonly historicalName: string;
  readonly commonName: string;
  /**
   * Catalog kind. `future-state` is used for polities not yet independent;
   * `historical` is a registry-only polity that did not exist in 1900 (a
   * breakaway republic, a short-lived state or a predecessor union). A
   * historical entry never owns a province at the 1900 start and is never
   * selectable; it exists so an alternate-history or breakaway scenario can
   * transfer provinces to it.
   */
  readonly kind: "state" | "territory" | "future-state" | "historical";
  readonly status: CountryStatus;
  /** Sovereign polity id, or null for a sovereign state. */
  readonly sovereignPolityId: Id | null;
  /** First day the polity exists in the simulation. 0 for 1900 polities. */
  readonly activeFromDay: Day;
  /** Last day the polity exists, or null while still active. */
  readonly activeToDay: Day | null;
  /** True only for polities selectable on 1 January 1900. */
  readonly selectable1900: boolean;
  readonly capitalName: string;
  /** Flag registry key where a curated flag exists; null when none. */
  readonly flagKey: string | null;
  readonly sourceIds: readonly string[];
  readonly confidence: ProvinceConfidence;
  readonly notes: string;
}

/** Scenario input for one province's initial mutable ownership. */
export interface ProvinceOwnershipInput {
  readonly provinceId: Id;
  readonly ownerPolityId: Id;
  readonly controllerPolityId?: Id;
  readonly controlledSinceDay?: Day | null;
  readonly claimantPolityIds?: readonly Id[];
  readonly specialStatus?: ProvinceSpecialStatus;
}

/**
 * Authoritative mutable political state of one province.
 *
 * `controllerPolityId` equals `ownerPolityId` when the owner controls the
 * province. An occupation changes only the controller; legal ownership remains
 * untouched until an explicit ownership transfer is applied.
 */
export interface ProvinceOwnership {
  readonly provinceId: Id;
  ownerPolityId: Id;
  controllerPolityId: Id;
  /** Day effective control began when it differs from ownership; null otherwise. */
  controlledSinceDay: Day | null;
  /** Claimants, ascending, unique; never includes the current owner. */
  claimantPolityIds: Id[];
  specialStatus: ProvinceSpecialStatus;
}

/** Bounded audit record of one provincial change. */
export interface ProvinceTransferRecord {
  readonly id: Id;
  readonly day: Day;
  readonly provinceIds: readonly Id[];
  /** Previous legal owner(s); null when the provinces had no single owner. */
  readonly fromPolityId: Id | null;
  readonly toPolityId: Id;
  readonly kind: ProvinceTransferKind;
  readonly note: string;
}

/** Authoritative provincial state. */
export interface ProvinceState {
  /** False for legacy fixtures and scenarios that predate M12a. */
  enabled: boolean;
  /** One record per province, ascending by `provinceId`. */
  ownership: ProvinceOwnership[];
  /** Bounded most-recent-first audit history, ascending by id in storage. */
  transfers: ProvinceTransferRecord[];
  nextTransferId: number;
}

/** Scenario-provided provincial content. */
export interface ProvinceScenarioInput {
  readonly definitions: readonly ProvinceDefinition[];
  readonly polityRegistry?: readonly PolityDef[];
  /** Initial ownership; defaults to the definition owner for every province. */
  readonly ownership?: readonly ProvinceOwnershipInput[];
}

/** Request for a legal ownership change of one or more provinces. */
export interface ProvinceOwnershipTransferRequest {
  readonly provinceIds: readonly Id[];
  readonly toPolityId: Id;
  readonly kind: ProvinceTransferKind;
  readonly day: Day;
  readonly note: string;
  /**
   * When true the controller is left unchanged (a legal settlement that has not
   * yet been enforced on the ground). Defaults to false: the recipient also
   * takes effective control.
   */
  readonly preserveController?: boolean;
  /** Remove the recipient from the claimant list; defaults to true. */
  readonly clearRecipientClaim?: boolean;
}

/** Request for an effective-control change that does not alter ownership. */
export interface ProvinceControlRequest {
  readonly provinceIds: readonly Id[];
  /** Null or the current owner restores owner control. */
  readonly controllerPolityId: Id | null;
  readonly day: Day;
  readonly note: string;
  readonly kind: "occupation" | "liberation";
}

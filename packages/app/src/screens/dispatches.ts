/**
 * Dispatches: the news of the campaign, told in the era's medium.
 *
 * Every headline is derived from a change between two worker snapshots, or from a
 * confirmed player action. Nothing is invented: if the simulation has no event
 * source for something, there is no dispatch about it. This is display state. It
 * is not saved, it never reaches the worker, and it reads no clock or random
 * source, so identical snapshots always yield identical dispatches.
 */

import type { SimulationSnapshot } from "@century/sim-worker";

import { RUSD_FORMAT, type MoneyFormat } from "../format/money";

export type DispatchKind =
  | "war"
  | "peace"
  | "territory"
  | "occupation"
  | "treasury"
  | "technology"
  | "construction"
  | "campaign";

export interface Dispatch {
  /** Stable identity of the event, so one event is never told twice. */
  readonly id: string;
  readonly kind: DispatchKind;
  readonly dateLabel: string;
  /** The headline in RUSD; `dispatchHeadline` renders it in the display currency. */
  readonly headline: string;
  /**
   * P3 (D-141): an amount the headline names, kept in RUSD with the closed month it belongs
   * to, so the display formats it when shown (`{amount}` in `template`).
   */
  readonly amount?: { readonly rusd: number; readonly periodEndDay: number; readonly template: string };
}

/** The headline in the display currency (P3): amounts are formatted when shown. */
export function dispatchHeadline(dispatch: Dispatch, money: MoneyFormat): string {
  if (dispatch.amount === undefined) return dispatch.headline;
  return dispatch.amount.template.replace(
    "{amount}",
    money.atPeriod(dispatch.amount.periodEndDay).format(Math.abs(dispatch.amount.rusd)),
  );
}

/** The parts of a snapshot dispatches are derived from. */
export type DispatchSource = Pick<
  SimulationSnapshot,
  | "dayIndex"
  | "date"
  | "playerCountryId"
  | "campaignComplete"
  | "countrySummaries"
  | "countries"
  | "provinces"
  | "military"
  | "technologyCatalog"
>;

export interface DispatchNames {
  readonly province: (provinceId: number) => string;
  readonly polity: (polityId: number) => string;
}

function countryName(snapshot: DispatchSource, countryId: number): string {
  return snapshot.countrySummaries.find((country) => country.id === countryId)?.name ?? `Country ${String(countryId)}`;
}


/**
 * What happened between two snapshots, oldest first. The first snapshot of a
 * campaign has nothing to compare with, so a loaded game opens quietly.
 */
export function deriveDispatches(
  previous: DispatchSource | null,
  current: DispatchSource,
  names: DispatchNames,
): readonly Dispatch[] {
  if (previous === null || current.dayIndex <= previous.dayIndex) return [];
  const dateLabel = current.date.label;
  const dispatches: Dispatch[] = [];
  const push = (id: string, kind: DispatchKind, headline: string, amount?: Dispatch["amount"]): void => {
    dispatches.push({ id, kind, dateLabel, headline, ...(amount === undefined ? {} : { amount }) });
  };

  const warsBefore = new Map(previous.military.wars.map((war) => [war.id, war] as const));
  for (const war of current.military.wars) {
    const before = warsBefore.get(war.id);
    const attacker = countryName(current, war.attackerCountryId);
    const defender = countryName(current, war.defenderCountryId);
    if (before === undefined) {
      push(`war-${String(war.id)}`, "war", `${attacker} declares war on ${defender}`);
    } else if (before.endedDay === null && war.endedDay !== null) {
      push(`peace-${String(war.id)}`, "peace", `War between ${attacker} and ${defender} ends`);
    }
  }

  const offersBefore = new Set(previous.military.peaceOffers.map((offer) => offer.id));
  for (const offer of current.military.peaceOffers) {
    if (offersBefore.has(offer.id)) continue;
    push(
      `offer-${String(offer.id)}`,
      "peace",
      `${countryName(current, offer.fromCountryId)} offers peace to ${countryName(current, offer.toCountryId)}`,
    );
  }

  const provincesBefore = new Map(previous.provinces.map((entry) => [entry.provinceId, entry] as const));
  for (const entry of current.provinces) {
    const before = provincesBefore.get(entry.provinceId);
    if (before === undefined) continue;
    const place = names.province(entry.provinceId);
    if (before.ownerPolityId !== entry.ownerPolityId) {
      push(
        `transfer-${String(entry.provinceId)}-${String(current.dayIndex)}`,
        "territory",
        `${place} passes to ${names.polity(entry.ownerPolityId)}`,
      );
    } else if (before.controllerPolityId !== entry.controllerPolityId) {
      push(
        `control-${String(entry.provinceId)}-${String(current.dayIndex)}`,
        "occupation",
        entry.controllerPolityId === entry.ownerPolityId
          ? `${names.polity(entry.ownerPolityId)} retakes ${place}`
          : `${names.polity(entry.controllerPolityId)} occupies ${place}`,
      );
    }
  }

  const playerId = current.playerCountryId;
  if (playerId !== null) {
    const playerNow = current.countries.find((country) => country.id === playerId);
    const playerBefore = previous.countries.find((country) => country.id === playerId);
    if (playerNow !== undefined && playerBefore !== undefined) {
      const researchedBefore = new Set(
        playerBefore.technology.statuses.filter((entry) => entry.status === "researched").map((entry) => entry.technologyId),
      );
      for (const entry of playerNow.technology.statuses) {
        if (entry.status !== "researched" || researchedBefore.has(entry.technologyId)) continue;
        const technology = current.technologyCatalog.find((candidate) => candidate.technologyId === entry.technologyId);
        if (technology !== undefined) {
          push(`tech-${String(entry.technologyId)}`, "technology", `Research complete: ${technology.name}`);
        }
      }
      const completedBefore = new Set(
        playerBefore.constructionProjects.filter((project) => project.status === "completed").map((project) => project.id),
      );
      for (const project of playerNow.constructionProjects) {
        if (project.status !== "completed" || completedBefore.has(project.id)) continue;
        push(
          `built-${String(project.id)}`,
          "construction",
          `${project.definitionName} completed in ${project.provinceName}`,
        );
      }
      // The player's own closed months, not the country summaries: a summary's result
      // stays null until the worker compacts that month, long after it closed.
      const closed = playerNow.financeHistory[playerNow.financeHistory.length - 1];
      const closedBefore = playerBefore.financeHistory[playerBefore.financeHistory.length - 1];
      if (closed !== undefined && closed.periodEndDay !== closedBefore?.periodEndDay) {
        const result = closed.netFiscalResultRUSD;
        const template =
          result >= 0
            ? "Treasury closes the month {amount} in surplus"
            : "Treasury closes the month {amount} in deficit";
        const amount = { rusd: result, periodEndDay: closed.periodEndDay, template };
        push(
          `month-${String(closed.periodEndDay)}`,
          "treasury",
          dispatchHeadline({ id: "", kind: "treasury", dateLabel, headline: "", amount }, RUSD_FORMAT),
          amount,
        );
      }
    }
  }

  if (current.campaignComplete && !previous.campaignComplete) {
    push("campaign-complete", "campaign", "The century closes: the campaign is complete");
  }
  return dispatches;
}

/** Most recent dispatches kept for the campaign sheet. */
export const DISPATCH_HISTORY_LIMIT = 30;

export function appendDispatches(history: readonly Dispatch[], added: readonly Dispatch[]): readonly Dispatch[] {
  if (added.length === 0) return history;
  const seen = new Set(history.map((dispatch) => dispatch.id));
  const fresh = added.filter((dispatch) => !seen.has(dispatch.id));
  return [...history, ...fresh].slice(-DISPATCH_HISTORY_LIMIT);
}

/**
 * The four domains and the thirteen screens inside them. The map is not a tab: it
 * is always the screen, and every domain opens as a sheet over it.
 */

export type ScreenId =
  | "overview"
  | "politics"
  | "budget"
  | "markets"
  | "industry"
  | "construction"
  | "trade"
  | "labor"
  | "money"
  | "population"
  | "technology"
  | "war"
  | "ledger";

export type DomainId = "realm" | "economy" | "society" | "world";

export interface NavItem {
  readonly id: ScreenId;
  readonly label: string;
}

export interface NavDomain {
  readonly id: DomainId;
  readonly label: string;
  readonly items: readonly NavItem[];
}

export const DOMAINS: readonly NavDomain[] = [
  {
    id: "realm",
    label: "Realm",
    items: [
      { id: "overview", label: "Overview" },
      { id: "politics", label: "Politics" },
    ],
  },
  {
    id: "economy",
    label: "Economy",
    items: [
      { id: "budget", label: "Budget" },
      { id: "markets", label: "Markets" },
      { id: "industry", label: "Industry" },
      { id: "construction", label: "Construction" },
      { id: "trade", label: "Trade" },
      { id: "labor", label: "Labor & health" },
      { id: "money", label: "Money" },
    ],
  },
  {
    id: "society",
    label: "Society",
    items: [
      { id: "population", label: "Population" },
      { id: "technology", label: "Technology" },
    ],
  },
  {
    id: "world",
    label: "World",
    items: [
      { id: "war", label: "War & diplomacy" },
      { id: "ledger", label: "Ledger" },
    ],
  },
];

export function domainOf(screen: ScreenId): NavDomain {
  const domain = DOMAINS.find((candidate) => candidate.items.some((item) => item.id === screen));
  if (domain === undefined) throw new Error(`screen ${screen} belongs to no domain`);
  return domain;
}

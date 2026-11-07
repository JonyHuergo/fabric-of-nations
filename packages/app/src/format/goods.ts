/**
 * P5b (plan §11): the goods catalogue as the screens present it — the eight catalogue
 * headings, search, and what makes a good (its building and the technology that
 * unlocks it). Presentation only; reads the snapshot.
 */

import type { CountrySnapshot, GoodSnapshot, SimulationSnapshot } from "@century/sim-worker";

/** The catalogue headings, in catalogue order (docs/P5B_PLAN.md §1). */
export const GOOD_GROUPS: readonly { readonly key: string; readonly label: string }[] = [
  { key: "food-agriculture", label: "Food and agriculture" },
  { key: "fibres-forest", label: "Fibres and forest" },
  { key: "mining", label: "Mining" },
  { key: "energy", label: "Energy" },
  { key: "industrial-materials", label: "Industrial materials" },
  { key: "capital-equipment", label: "Capital and transport equipment" },
  { key: "consumer-manufactures", label: "Consumer manufactures" },
  { key: "services", label: "Services" },
];

const OTHER_GROUP = { key: "other", label: "Other goods" };

/** The heading of a good (legacy definitions have none). */
export function groupOf(good: GoodSnapshot): { readonly key: string; readonly label: string } {
  return GOOD_GROUPS.find((group) => group.key === good.group) ?? OTHER_GROUP;
}

/** Goods grouped under their headings, in catalogue order, each group in id order. */
export function goodsByGroup(goods: readonly GoodSnapshot[]): { readonly key: string; readonly label: string; readonly goods: readonly GoodSnapshot[] }[] {
  const groups = [...GOOD_GROUPS, OTHER_GROUP].map((group) => ({ ...group, goods: [] as GoodSnapshot[] }));
  for (const good of [...goods].sort((left, right) => left.id - right.id)) {
    groups.find((group) => group.key === groupOf(good).key)?.goods.push(good);
  }
  return groups.filter((group) => group.goods.length > 0);
}

/** True when the good matches a search (name, key or unit; case-insensitive). */
export function matchesSearch(good: GoodSnapshot, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return true;
  return good.name.toLowerCase().includes(needle) || good.key.includes(needle) || good.unitLabel.toLowerCase().includes(needle);
}

/** What makes a good, and whether the country can build it ("made by … · needs …"). */
export function makersOf(snapshot: SimulationSnapshot, country: CountrySnapshot | null, goodId: number): string {
  const makers = snapshot.projectTypes.filter((type) => type.outputs[0]?.goodId === goodId);
  if (makers.length === 0) return "No building makes it.";
  const researched = new Set(
    (country?.technology.statuses ?? []).filter((status) => status.status === "researched").map((status) => status.technologyId),
  );
  const parts = makers.map((maker) => {
    const technology = snapshot.technologyCatalog.find((entry) => entry.unlockedBuildingKeys.includes(maker.key));
    if (technology === undefined) return maker.name;
    return researched.has(technology.technologyId) ? `${maker.name} (${technology.name}, known)` : `${maker.name} (needs ${technology.name})`;
  });
  return `Made by: ${parts.join(" · ")}.`;
}

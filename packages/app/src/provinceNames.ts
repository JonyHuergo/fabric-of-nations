/**
 * Player-facing province names. They are static content of the committed province
 * catalog, so the worker snapshot does not carry them (P2, D-134).
 */
import { PROVINCE_CATALOG } from "./generated/provinceCatalog";

const NAME_BY_ID = new Map(PROVINCE_CATALOG.provinces.map((province) => [province.id, province.displayName] as const));

/** The display name of a province, or a neutral label for an unknown id. */
export function provinceDisplayName(provinceId: number): string {
  return NAME_BY_ID.get(provinceId) ?? `Province ${String(provinceId)}`;
}

/**
 * The catalogue the map runtime needs, with no geometry and no prose.
 *
 * `scripts/map/build-atlas.mjs` writes this into the atlas page as inline JSON, so
 * the runtime can name, colour and pick provinces without any province rings: the
 * render bundle already holds the shapes it draws.
 */

import type { WorldCatalogEntry, WorldCatalogMarket } from "../worldCatalogTypes";
import type { MapProvince } from "./mapModes";

export type RuntimeEntry = Pick<
  WorldCatalogEntry,
  "id" | "tag" | "kind" | "status" | "sovereignTag" | "commonName" | "capital" | "population1900" | "market"
>;

export interface RuntimeFuturePolity {
  readonly polityId: number;
  readonly tag: string;
  readonly commonName: string;
}

export interface MapRuntimeCatalog {
  readonly provinces: readonly MapProvince[];
  readonly entries: readonly RuntimeEntry[];
  readonly markets: readonly Pick<WorldCatalogMarket, "id" | "key">[];
  readonly futurePolities: readonly RuntimeFuturePolity[];
}

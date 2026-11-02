/**
 * Political colours of the Living Atlas.
 *
 * Colours are matte and dark, so paper-coloured borders and labels read on them,
 * and they are authored per polity tag: never derived from array order or from a
 * runtime random source, so adding a polity cannot change any other colour. The
 * great powers keep period atlas conventions (British red, French blue, German
 * grey, Russian green, Habsburg yellow); the rest were chosen so that neighbours
 * differ in lightness as well as hue, which keeps them apart for red-green colour
 * blind players. `m15-map-style.test.ts` measures neighbouring polities under
 * normal and simulated deuteranopic vision.
 *
 * A dependent territory takes its sovereign's hue lifted toward paper by status,
 * so an empire reads as one family across continents. The era themes then take
 * saturation from the land as a whole, in the renderer, so these values never
 * change with the date and a colour always belongs to one tag.
 */

import { ERA_THEMES, hexToRgb, mixRgb, rgbToCss, type Rgb } from "../design/tokens";
import type { CatalogStatus, WorldCatalogEntry } from "../worldCatalogTypes";

export { hexToRgb, mixRgb, rgbToCss, type Rgb };

export const STATE_COLORS: Readonly<Record<string, string>> = {
  // Great powers
  USA: "#5f9490",
  GBR: "#9c5a5e",
  DEU: "#6d7075",
  FRA: "#4a6c9c",
  RUS: "#56775f",
  JPN: "#a35877",
  AUT: "#ad9650",
  ITA: "#4b8a76",
  OTT: "#9a7550",
  CHN: "#a38c4e",
  // British settler dominions keep the imperial red family
  CAN: "#af837f",
  AUS: "#a56a68",
  NZL: "#ad7470",
  // Europe
  ESP: "#a88a48",
  PRT: "#6f8f5c",
  NLD: "#b0774a",
  BEL: "#7f6796",
  CHE: "#a2595a",
  LUX: "#66a0a3",
  SWE: "#5f86ab",
  NOR: "#6f6aa0",
  DNK: "#a8745f",
  GRC: "#5a90b8",
  SRB: "#8c6282",
  MNT: "#6a9579",
  ROM: "#5e8f98",
  BGR: "#7f9c66",
  CRT: "#8082a5",
  MCO: "#a05857",
  SMR: "#5986a2",
  AND: "#9f7d3d",
  LIE: "#6475a4",
  // Asia and the Pacific
  KOR: "#6f90a1",
  PER: "#8f9658",
  AFG: "#837496",
  NPL: "#9e6158",
  THA: "#7e9762",
  OMN: "#937e9d",
  SHM: "#a08560",
  TON: "#927695",
  // Africa
  ETH: "#798d55",
  LBR: "#7d8e51",
  MAR: "#9d6850",
  ZAR: "#918155",
  ORF: "#68a394",
  SOK: "#9c7e4c",
  WAD: "#82607f",
  DAR: "#648a7f",
  // The Americas
  MEX: "#477965",
  GUA: "#856840",
  HON: "#678a9b",
  SAL: "#9c8b53",
  NIC: "#82769d",
  COS: "#6f956b",
  COL: "#a48b49",
  VEN: "#637ca2",
  ECU: "#899e6c",
  PRU: "#a16e64",
  BOL: "#80a18a",
  CHL: "#9a85af",
  ARG: "#427e8a",
  URY: "#9f895e",
  PRY: "#8e6e62",
  BRA: "#598547",
  HTI: "#9d7186",
  DOM: "#6b84a3",
  CUB: "#a5835f",
};

/**
 * Polities that do not exist on 1 January 1900 but can receive provinces later.
 * Authored here in the same matte band so no successor state falls back to a
 * derived colour.
 */
export const FUTURE_COLORS: Readonly<Record<string, string>> = {
  POL: "#915d6d", CZE: "#678c5a", YUG: "#8790b8", FIN: "#83583d", EST: "#1e7e7a", LVA: "#947493",
  LTU: "#989562", DDR: "#326890", FRG: "#8e6160", IRL: "#5c8d70", HUN: "#9688c1", DAN: "#785e3c",
  ALB: "#367a85", UKR: "#a66b89", BLR: "#8a9971", MDA: "#4e638c", TUR: "#995d48", HEJ: "#578c80",
  SAU: "#a385b0", IRQ: "#746222", SYR: "#48758b", LBN: "#a56f78", JOR: "#71a072", ISR: "#5e5f85",
  YEM: "#8d6544", KWT: "#349092", ARE: "#aa85a1", QAT: "#646737", BHR: "#47729e", IND: "#a1736c",
  PAK: "#68a088", BGD: "#6d578b", LKA: "#816b46", MMR: "#4b8b9c", MYS: "#bc7c95", SGP: "#566b47",
  IDN: "#5f6d98", PHL: "#aa7053", VNM: "#679f97", LAO: "#77567b", KHM: "#7a7030", PRK: "#5e86a0",
  ROK: "#b98184", MNG: "#39714b", TIB: "#6e6990", ROC: "#9c7852", PRC: "#49a1ab", MAN: "#7c566c",
  KAZ: "#697546", UZB: "#6082b3", TKM: "#b48679", TJK: "#33705f", KGZ: "#7e6093", GEO: "#8f7e56",
  ARM: "#619cb3", AZE: "#8b4e5f", TLS: "#5c7856", BRN: "#767caa", MDV: "#bb845f", BHU: "#356e6d",
  PSE: "#866082", EGY: "#858445", SDN: "#7496b5", SSD: "#875350", LBY: "#3c7e5e", TUN: "#8479a0",
  DZA: "#ab8d61", ERI: "#0b6f80", SOM: "#8a6073", SOL: "#74885b", KEN: "#7991c7", UGA: "#815847",
  TZA: "#3a7c71", TAN: "#9670a1", ZAN: "#9d9268", RWA: "#366a85", BDI: "#995963", ZMB: "#688a6c",
  ZWE: "#8e8cbc", MWI: "#85582b", NAM: "#41797d", ZAF: "#9c708f", BWA: "#90995b", LSO: "#4b6585",
  SWZ: "#935f56", NGA: "#479177", GHA: "#9b89b0", SLE: "#776032", GMB: "#277a91", MRT: "#9e7180",
  MLI: "#7f9c71", SEN: "#535f94", GIN: "#8b654f", CIV: "#4a8e88", BFA: "#ad80af", BEN: "#69653c",
  NER: "#487494", TCD: "#ad6b6d", CAF: "#759e83", COG: "#655c88", GAB: "#8e6633", COD: "#538b93",
  CMR: "#b2819b", TGO: "#5a6b31", MDG: "#5b6f92", COM: "#a57262", DJI: "#53a390", AGO: "#6f597c",
  MOZ: "#7e6d3d", GNB: "#428aa8", CPV: "#b3838d", STP: "#4b6e49", GNQ: "#66699f", SADR: "#9c785c",
  MUS: "#5ba0a0", SYC: "#805078", RHO: "#707249", ZRW: "#5f84a8", NFD: "#c17e77", PAN: "#416e5a",
  JAM: "#756591", TTO: "#9c7a42", BRB: "#669caa", GUY: "#835266", BHS: "#5d7943", GRD: "#717fa5",
  SUR: "#b7856e", DMA: "#107368", LCA: "#7f6384", VCT: "#8b814f", ATG: "#5c9abf", BLZ: "#825559",
  KNA: "#4f7a5a", ANT: "#7e78b0", ARU: "#ac8b6b", TEX: "#286f75", RGR: "#905a7d", JUL: "#7c865c",
  RRG: "#7694bd", YUC: "#8d5043", CAL: "#497a6a", DES: "#8c75a1", CSA: "#a98f53", HAW: "#3a6b7d",
  ACR: "#915d6c", AIA: "#668d5b", WIF: "#8890b7", CNU: "#83583c", WFL: "#1e7e7b", FLR: "#957492",
  INS: "#979562", MDW: "#346890", RCN: "#8f615f", RLC: "#5b8d71", SON: "#9788c1", LBC: "#785e3c",
  EQT: "#377a86", BAH: "#a66b88", PEM: "#899971", GCO: "#4f638c", UPR: "#985d47", ACF: "#578c81",
  SBA: "#a385af", PBC: "#736222", ERY: "#49758c", PNG: "#a56f78", WSM: "#6fa073", NRU: "#5f5f85",
  TUV: "#8c6543", SLB: "#349093", KIR: "#aa85a0", VUT: "#636837", MHL: "#48729f", FSM: "#a1736c",
  PLW: "#67a089", COK: "#6e578b", NIU: "#816b46", TKL: "#4c8a9d", FJI: "#bc7c93", MNP: "#556b48",
  NZD: "#606c98", RHI: "#aa7152", TAH: "#669e98", FIJ: "#77557a", RNS: "#797031", TAF: "#5e86a0",
  VEM: "#b98183", MIN: "#38714d", HUT: "#6f698f",
};

/** Share of paper mixed into a sovereign colour, by dependent status. */
const TERRITORY_LIFT: Partial<Readonly<Record<CatalogStatus, number>>> = {
  dominion: 0.12,
  "self-governing-colony": 0.14,
  "autonomous-province": 0.2,
  colony: 0.14,
  dependency: 0.26,
  protectorate: 0.32,
};
const DEFAULT_TERRITORY_LIFT = 0.14;
/** The lift is always toward the Imperial paper, so it never moves with the date. */
const TERRITORY_PAPER: Rgb = hexToRgb(ERA_THEMES.imperial.paper);

/** Neutral land: Antarctica and anything no authored polity claims. */
export const UNCLAIMED_LAND: Rgb = [84, 90, 94];

/** Stable FNV-1a over a tag. */
function hashTag(tag: string): number {
  let hash = 2166136261;
  for (let index = 0; index < tag.length; index += 1) {
    hash ^= tag.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Colour for a tag nobody authored. Every polity in the catalogue and the future
 * registry has an authored colour, and a test keeps it that way; this exists so a
 * data error draws a stable matte tone rather than failing the frame.
 */
function derivedColor(tag: string): Rgb {
  const hue = (hashTag(tag) % 360) / 60;
  const chroma = 62;
  const secondary = chroma * (1 - Math.abs((hue % 2) - 1));
  const base = 84;
  const sextants: readonly Rgb[] = [
    [chroma, secondary, 0],
    [secondary, chroma, 0],
    [0, chroma, secondary],
    [0, secondary, chroma],
    [secondary, 0, chroma],
    [chroma, 0, secondary],
  ];
  const [r, g, b] = sextants[Math.floor(hue) % 6] ?? [chroma, 0, 0];
  return [Math.round(r + base), Math.round(g + base), Math.round(b + base)];
}

/** Base colour of a tag: authored, else the data-error tone. */
export function stateColor(tag: string): Rgb {
  const authored = STATE_COLORS[tag] ?? FUTURE_COLORS[tag];
  return authored === undefined ? derivedColor(tag) : hexToRgb(authored);
}

/** Political colour of a catalogue entry, in the sovereign's family if dependent. */
export function politicalColor(
  tag: string,
  entryByTag: ReadonlyMap<string, Pick<WorldCatalogEntry, "kind" | "sovereignTag" | "status">>,
): Rgb {
  const entry = entryByTag.get(tag);
  if (entry === undefined || entry.kind === "state" || entry.sovereignTag === null) {
    return stateColor(tag);
  }
  const lift = TERRITORY_LIFT[entry.status] ?? DEFAULT_TERRITORY_LIFT;
  return mixRgb(stateColor(entry.sovereignTag), TERRITORY_PAPER, lift);
}

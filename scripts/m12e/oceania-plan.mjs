/**
 * Authored M12e Oceania and global land-gap province plan (1 January 1900).
 *
 * This module is data, not simulation logic. It mirrors the M12a European,
 * M12b Asian, M12c African and M12d American plans: the 1900 M11c map feature
 * supplies the outer boundary, modern Natural Earth 1:10m admin-1 units are only
 * internal geometry blocks, and each province is a permanent geographical unit
 * with a stable numeric id. Oceania ids live in a disjoint block (400001+) and
 * every key is prefixed with `oc-`, so they cannot collide with a European
 * (<= 66001), Asian (100001-100239), African (200001-200260) or American
 * (300001-300469) province.
 *
 * Grouping policy:
 * - Australia uses one permanent province per 1900 colony (New South Wales,
 *   Victoria, Queensland, South Australia, Western Australia, Tasmania). The
 *   Northern Territory was part of South Australia and the Federal Capital
 *   Territory (and Jervis Bay) part of New South Wales, so they are separate
 *   permanent provinces and the 1911 transfers are ordinary ownership changes.
 *   The 1901 federation is an ownership transfer to the future Commonwealth of
 *   Australia polity (tag AUS, id 1400) so the country tag and palette colour are
 *   unchanged.
 * - New Zealand uses the modern regional-council areas as the permanent
 *   subdivision (the 1876 provincial districts were abolished, and the regional
 *   councils are the closest modern proxy). Stewart Island, the Chatham Islands
 *   and the outlying island groups are separate provinces.
 * - German New Guinea and British New Guinea (Papua) are separate 1900 province
 *   groups built from the modern PNG first-level units assigned by the M11c
 *   `german-new-guinea-papua` map patch. The 1906 Australian administration, the
 *   1914 occupation, the 1920 mandate, the 1949 union and 1975 independence are
 *   ordinary control/ownership changes.
 * - Melanesia, Micronesia and Polynesia use one province per colonial island
 *   group / modern first-level unit. Every colony or island group that became a
 *   separate state or self-governing entity is its own permanent province group.
 * - Remote islands that the coarse 1900 feature omits (Pitcairn, Easter Island,
 *   Juan Fernandez, Revillagigedo, Clipperton, Wake/Midway/Johnston/Palmyra,
 *   Tokelau, Kermadec, the New Zealand subantarctic islands, Heard/McDonald,
 *   Chagos) are detached provinces whose geometry is the modern admin-1 island
 *   (or an authored island clip when the map has no other geometry). They are
 *   never rectangular *frontier* corrections; an island clip isolates a
 *   coastline and is labelled as such.
 * - The M12e bundle also closes the remaining global land gaps (Svalbard, the
 *   Isle of Man, the Kvarner islands, and the residual slivers of features whose
 *   continental builds left an inland gap) so the global land audit can prove
 *   that every non-Antarctic M11c land ring belongs to a province.
 */

/** First id of the Oceania block. The Americas block ends at 300469. */
export const OCEANIA_PROVINCE_ID_BASE = 400000;

/** Reserved block for one residual province per 1900 map feature. */
export const FEATURE_RESIDUAL_ID_BASE = 405000;

/** Reserved block for the automatic land-ring closure (one id per land ring). */
export const LAND_GAP_ID_BASE = 406000;

/** Historical and geospatial sources referenced by province entries. */
export const OCEANIA_SOURCES = [
  {
    id: "natural-earth-10m-admin1",
    title: "Natural Earth 1:10m admin-1 states and provinces",
    url: "https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-1-states-provinces/",
    license: "Public domain",
    date: "2024",
    notes:
      "Modern first-level units used only as internal geometry blocks. Every non-detached province is clipped to the authored M11c 1900 polity polygon.",
  },
  {
    id: "natural-earth-50m-admin0",
    title: "Natural Earth 1:50m cultural vectors (admin-0 and selected admin-1)",
    url: "https://www.naturalearthdata.com/downloads/50m-cultural-vectors/",
    license: "Public domain",
    date: "2024",
    notes: "Modern outlines used for coastlines and small-island geometry.",
  },
  {
    id: "eb1911-oceania",
    title: "Encyclopaedia Britannica (1911), Oceania and the Pacific islands",
    url: "https://en.wikisource.org/wiki/1911_Encyclop%C3%A6dia_Britannica",
    license: "Public domain",
    date: "1911",
    notes:
      "The 1900 political map of Oceania: the Australian colonies, New Zealand, the German, British, French and American island possessions, and the independent Kingdom of Tonga.",
  },
  {
    id: "anglo-german-convention-1885",
    title: "Anglo-German Convention (1885) and the New Guinea partition",
    url: "https://en.wikisource.org/wiki/Anglo-German_Convention",
    license: "Public domain",
    date: "1885",
    notes:
      "The 1885-86 Anglo-German boundary between German New Guinea (Kaiser-Wilhelmsland and the Bismarck Archipelago) and British New Guinea (Papua). The modern PNG first-level units are the map proxy for the central-range line.",
  },
  {
    id: "samoa-tripartite-1899",
    title: "Tripartite Convention (1899) and the Samoa partition",
    url: "https://en.wikisource.org/wiki/Tripartite_Convention",
    license: "Public domain",
    date: "1899",
    notes:
      "The 1899 partition of Samoa: Germany took Western Samoa (Upolu and Savai'i), the United States took the eastern islands (Tutuila and Manu'a) in 1900.",
  },
  {
    id: "berlin-act-1885",
    title: "Berlin Act (1885) and the Pacific spheres of influence",
    url: "https://en.wikisource.org/wiki/Berlin_Conference",
    license: "Public domain",
    date: "1885",
    notes:
      "The British/German sphere declarations that created the 1900 Pacific island possessions.",
  },
  {
    id: "versailles-1919",
    title: "Treaty of Versailles (1919), Article 119 and the Pacific mandates",
    url: "https://en.wikisource.org/wiki/Treaty_of_Versailles",
    license: "Public domain",
    date: "1919",
    notes:
      "The German renunciation of overseas sovereignty and the League of Nations mandates over German New Guinea, German Samoa and the German Pacific islands.",
  },
  {
    id: "un-trusteeship-pacific",
    title: "United Nations Trusteeship Agreements (1947) for the Pacific islands",
    url: "https://www.un.org/en/about-us/trusteeship-council",
    license: "Public domain",
    date: "1947",
    notes:
      "The United States Trust Territory of the Pacific Islands and the Australian trusteeship of New Guinea.",
  },
  {
    id: "compact-of-free-association",
    title: "Compacts of Free Association (1986) and the Palau compact (1994)",
    url: "https://www.doi.gov/oia/compacts-of-free-association",
    license: "Public domain",
    date: "1986",
    notes:
      "The 1986 compacts with the Marshall Islands and the Federated States of Micronesia and the 1994 compact with Palau.",
  },
  {
    id: "project-authored-1900",
    title: "Fabric of Nations M11c authored 1900 boundary reconstruction",
    url: "internal:packages/data/data/map/world_map_1900.json",
    license: "Project data",
    date: "2026",
    notes: "The M11c world-map bundle supplies every 1900 outer boundary and land ring.",
  },
  {
    id: "project-authored-m12",
    title: "Fabric of Nations M12a-M12e authored provincial partition",
    url: "internal:scripts/m12e/oceania-plan.mjs",
    license: "Project data",
    date: "2026",
    notes: "The authored grouping of modern first-level units and islands into historical provinces.",
  },
  {
    id: "m12e-land-mask",
    title: "Fabric of Nations M11c land mask",
    url: "internal:packages/data/data/map/world_map_1900.json#land",
    license: "Project data",
    date: "2026",
    notes:
      "The 795 encoded land rings used by the global land audit. A land ring outside every authored province is attached to the 1900 polity that contains it.",
  },
];

/**
 * Polity registry for Oceania: post-1900 successors, 1900-active registry
 * territories and historical/breakaway entries.
 *
 * Ids 1400-1499 are reserved for Oceania and never overlap the M12a Europe
 * range (1000-1016), the M12b Asia range (1100-1144), the M12c Africa range
 * (1200-1256) or the M12d Americas range (1300-1346). None of the future entries
 * is selectable in 1900.
 *
 * The Commonwealth of Australia (`AUS`, 1400) deliberately reuses the 1900
 * catalog tag AUS: the federation is a new polity id but the same country for
 * palette and derived-border purposes, so Australia does not change colour on
 * 1 January 1901. The same reasoning applies to Fiji (`FJI`), following the
 * M12d Newfoundland precedent (a future polity tag may equal a 1900 map feature
 * tag).
 */
export const OCEANIA_FUTURE_POLITIES = [
  {
    polityId: 1400,
    tag: "AUS",
    historicalName: "Commonwealth of Australia",
    commonName: "Australia",
    kind: "state",
    status: "dominion",
    activeFrom: "1901-01-01",
    activeTo: null,
    capitalName: "Melbourne",
    flagKey: null,
    selectable1900: false,
    confidence: "high",
    notes:
      "The six Australian colonies federated on 1 January 1901. The permanent colonial provinces transfer to this polity, so federation is an ordinary ownership change and the external border does not move. The tag is shared with the 1900 catalog polity so the country palette colour is unchanged.",
  },
  {
    polityId: 1401,
    tag: "PNG",
    historicalName: "Independent State of Papua New Guinea",
    commonName: "Papua New Guinea",
    status: "independent",
    activeFrom: "1975-09-16",
    activeTo: null,
    capitalName: "Port Moresby",
    flagKey: null,
    selectable1900: false,
    confidence: "high",
    notes:
      "Independent from Australia on 16 September 1975. The German New Guinea and British Papua provinces are permanently separate and unite under this polity.",
  },
  {
    polityId: 1402,
    tag: "WSM",
    historicalName: "Independent State of Samoa (Western Samoa)",
    commonName: "Samoa",
    status: "independent",
    activeFrom: "1962-01-01",
    activeTo: null,
    capitalName: "Apia",
    flagKey: null,
    selectable1900: false,
    confidence: "high",
    notes:
      "Western Samoa became independent on 1 January 1962 after the 1920 New Zealand mandate and the 1946 trusteeship.",
  },
  {
    polityId: 1403,
    tag: "NRU",
    historicalName: "Republic of Nauru",
    commonName: "Nauru",
    status: "independent",
    activeFrom: "1968-01-31",
    activeTo: null,
    capitalName: "Yaren",
    flagKey: null,
    selectable1900: false,
    confidence: "high",
    notes:
      "Independent on 31 January 1968 after the German, Australian mandate and United Nations trusteeship periods.",
  },
  {
    polityId: 1404,
    tag: "TUV",
    historicalName: "Tuvalu",
    commonName: "Tuvalu",
    status: "independent",
    activeFrom: "1978-10-01",
    activeTo: null,
    capitalName: "Funafuti",
    flagKey: null,
    selectable1900: false,
    confidence: "high",
    notes:
      "The Ellice Islands separated from the Gilbert Islands in 1975 and became independent on 1 October 1978.",
  },
  {
    polityId: 1405,
    tag: "SLB",
    historicalName: "Solomon Islands",
    commonName: "Solomon Islands",
    status: "independent",
    activeFrom: "1978-07-07",
    activeTo: null,
    capitalName: "Honiara",
    flagKey: null,
    selectable1900: false,
    confidence: "high",
    notes:
      "Independent from the United Kingdom on 7 July 1978. The northern Solomons (Bougainville) were German until 1899 and are part of Papua New Guinea, not this polity.",
  },
  {
    polityId: 1406,
    tag: "KIR",
    historicalName: "Republic of Kiribati",
    commonName: "Kiribati",
    status: "independent",
    activeFrom: "1979-07-12",
    activeTo: null,
    capitalName: "South Tarawa",
    flagKey: null,
    selectable1900: false,
    confidence: "high",
    notes:
      "The Gilbert Islands became independent on 12 July 1979; the Phoenix and Line island groups are part of Kiribati.",
  },
  {
    polityId: 1407,
    tag: "VUT",
    historicalName: "Republic of Vanuatu",
    commonName: "Vanuatu",
    status: "independent",
    activeFrom: "1980-07-30",
    activeTo: null,
    capitalName: "Port Vila",
    flagKey: null,
    selectable1900: false,
    confidence: "high",
    notes:
      "The Anglo-French condominium of the New Hebrides became independent on 30 July 1980.",
  },
  {
    polityId: 1408,
    tag: "MHL",
    historicalName: "Republic of the Marshall Islands",
    commonName: "Marshall Islands",
    status: "independent",
    activeFrom: "1986-10-21",
    activeTo: null,
    capitalName: "Majuro",
    flagKey: null,
    selectable1900: false,
    confidence: "high",
    notes:
      "The Compact of Free Association with the United States took effect on 21 October 1986 after the Japanese mandate and the United States Trust Territory.",
  },
  {
    polityId: 1409,
    tag: "FSM",
    historicalName: "Federated States of Micronesia",
    commonName: "Micronesia",
    status: "independent",
    activeFrom: "1986-11-03",
    activeTo: null,
    capitalName: "Palikir",
    flagKey: null,
    selectable1900: false,
    confidence: "high",
    notes:
      "The Compact of Free Association took effect on 3 November 1986. Kosrae, Pohnpei, Chuuk and Yap are permanent provinces.",
  },
  {
    polityId: 1410,
    tag: "PLW",
    historicalName: "Republic of Palau",
    commonName: "Palau",
    status: "independent",
    activeFrom: "1994-10-01",
    activeTo: null,
    capitalName: "Ngerulmud",
    flagKey: null,
    selectable1900: false,
    confidence: "high",
    notes:
      "The Palau Compact of Free Association took effect on 1 October 1994 after the Japanese mandate and the United States Trust Territory.",
  },
  {
    polityId: 1411,
    tag: "COK",
    historicalName: "Cook Islands",
    commonName: "Cook Islands",
    status: "self-governing-colony",
    activeFrom: "1965-08-04",
    activeTo: null,
    capitalName: "Avarua",
    flagKey: null,
    selectable1900: false,
    confidence: "high",
    notes:
      "A self-governing state in free association with New Zealand from 4 August 1965. The islands were a British protectorate in 1900 and were annexed to New Zealand in 1901.",
  },
  {
    polityId: 1412,
    tag: "NIU",
    historicalName: "Niue",
    commonName: "Niue",
    status: "self-governing-colony",
    activeFrom: "1974-10-19",
    activeTo: null,
    capitalName: "Alofi",
    flagKey: null,
    selectable1900: false,
    confidence: "high",
    notes:
      "Self-government in free association with New Zealand from 19 October 1974. Niue was a British protectorate in 1900 and was annexed to New Zealand in 1901.",
  },
  {
    polityId: 1413,
    tag: "TKL",
    historicalName: "Tokelau",
    commonName: "Tokelau",
    kind: "territory",
    status: "dependency",
    activeFrom: "1900-01-01",
    activeTo: null,
    capitalName: "Atafu",
    flagKey: null,
    selectable1900: false,
    confidence: "medium",
    notes:
      "A British protectorate on 1 January 1900, administered with the Gilbert and Ellice Islands from 1916 and transferred to New Zealand in 1926. It remains a New Zealand territory. Registered as a non-selectable 1900 territory so its permanent provinces are distinct.",
  },
  {
    polityId: 1414,
    tag: "FJI",
    historicalName: "Dominion of Fiji",
    commonName: "Fiji",
    status: "independent",
    activeFrom: "1970-10-10",
    activeTo: null,
    capitalName: "Suva",
    flagKey: null,
    selectable1900: false,
    confidence: "high",
    notes:
      "Independent from the United Kingdom on 10 October 1970. The tag matches the 1900 map feature tag, following the M12d Newfoundland precedent.",
  },
  {
    polityId: 1415,
    tag: "MNP",
    historicalName: "Commonwealth of the Northern Mariana Islands",
    commonName: "Northern Mariana Islands",
    kind: "territory",
    status: "dependency",
    activeFrom: "1978-01-09",
    activeTo: null,
    capitalName: "Saipan",
    flagKey: null,
    selectable1900: false,
    confidence: "high",
    notes:
      "A United States commonwealth from 9 January 1978. The islands were German in 1900, a Japanese mandate from 1920 and part of the United States Trust Territory from 1947.",
  },
  {
    polityId: 1416,
    tag: "NZD",
    historicalName: "Dominion of New Zealand",
    commonName: "New Zealand",
    kind: "state",
    status: "dominion",
    activeFrom: "1907-09-26",
    activeTo: null,
    capitalName: "Wellington",
    flagKey: null,
    selectable1900: false,
    confidence: "high",
    notes:
      "New Zealand became a Dominion on 26 September 1907. This is a status change, not an ownership change: the New Zealand provinces remain owned by the 1900 colony polity (NZL, id 58), so this registry entry owns no province and exists for the twentieth-century state audit.",
  },
  {
    polityId: 1417,
    tag: "RHI",
    historicalName: "Republic of Hawaii",
    commonName: "Republic of Hawaii",
    kind: "historical",
    status: "independent",
    activeFrom: "1900-01-01",
    activeTo: "1900-01-01",
    capitalName: "Honolulu",
    flagKey: null,
    selectable1900: false,
    confidence: "medium",
    notes:
      "The Republic of Hawaii existed from 1894 until annexation by the United States in 1898. Registry activation is clamped to 1900-01-01; it owns nothing in 1900.",
  },
  {
    polityId: 1419,
    tag: "TAH",
    historicalName: "Kingdom of Tahiti",
    commonName: "Tahiti",
    kind: "historical",
    status: "independent",
    activeFrom: "1900-01-01",
    activeTo: "1900-01-01",
    capitalName: "Papeete",
    flagKey: null,
    selectable1900: false,
    confidence: "medium",
    notes:
      "The Kingdom of Tahiti existed from 1788 until the 1880 French annexation. Registry activation is clamped to 1900-01-01; it owns nothing in 1900.",
  },
  {
    polityId: 1420,
    tag: "FIJ",
    historicalName: "Kingdom of Fiji",
    commonName: "Fiji",
    kind: "historical",
    status: "independent",
    activeFrom: "1900-01-01",
    activeTo: "1900-01-01",
    capitalName: "Levuka",
    flagKey: null,
    selectable1900: false,
    confidence: "medium",
    notes:
      "The Kingdom of Fiji existed from 1871 until cession to the United Kingdom in 1874. Registry activation is clamped to 1900-01-01; it owns nothing in 1900.",
  },
  {
    polityId: 1421,
    tag: "RNS",
    historicalName: "Republic of the North Solomons",
    commonName: "Bougainville",
    kind: "historical",
    status: "independent",
    activeFrom: "1975-09-01",
    activeTo: "1976-08-01",
    capitalName: "Arawa",
    flagKey: null,
    selectable1900: false,
    confidence: "medium",
    notes:
      "Bougainville declared independence on 1 September 1975, shortly before Papua New Guinea's own independence, and was reintegrated in 1976. A short-lived breakaway available for alternate history.",
  },
  {
    polityId: 1422,
    tag: "TAF",
    historicalName: "Tafea Nation",
    commonName: "Tafea",
    kind: "historical",
    status: "independent",
    activeFrom: "1980-01-01",
    activeTo: "1980-06-01",
    capitalName: "Isangel",
    flagKey: null,
    selectable1900: false,
    confidence: "low",
    notes:
      "The Tafea islands (Tanna, Aniwa, Futuna, Erromango, Aneityum) declared independence in January 1980 during the Vanuatu transition; the movement was suppressed by the end of the year. Semihistorical; low confidence.",
  },
  {
    polityId: 1423,
    tag: "VEM",
    historicalName: "Republic of Vemerana",
    commonName: "Vemerana",
    kind: "historical",
    status: "independent",
    activeFrom: "1980-05-28",
    activeTo: "1980-07-30",
    capitalName: "Luganville",
    flagKey: null,
    selectable1900: false,
    confidence: "low",
    notes:
      "Santo and the northern New Hebrides declared the Republic of Vemerana in May 1980 during the independence transition; it was dissolved when Vanuatu became independent. Semihistorical; low confidence.",
  },
  {
    polityId: 1424,
    tag: "MIN",
    historicalName: "Republic of Minerva",
    commonName: "Minerva",
    kind: "historical",
    status: "independent",
    activeFrom: "1972-01-19",
    activeTo: "1972-02-01",
    capitalName: "Minerva Reef",
    flagKey: null,
    selectable1900: false,
    confidence: "low",
    notes:
      "A short-lived 1972 libertarian micronation on the Minerva Reefs south of Fiji, removed by Tonga. Semihistorical; low confidence. It has no drawable province.",
  },
  {
    polityId: 1425,
    tag: "HUT",
    historicalName: "Principality of Hutt River",
    commonName: "Hutt River",
    kind: "historical",
    status: "independent",
    activeFrom: "1970-04-21",
    activeTo: "2000-01-01",
    capitalName: "Nain",
    flagKey: null,
    selectable1900: false,
    confidence: "low",
    notes:
      "A 1970-2020 Australian secessionist micronation in Western Australia. Its historical end (2020) is outside the 1900-2000 calendar, so the registry end is clamped to 2000-01-01. Semihistorical; low confidence.",
  },
];

/** Polity id for each 1900 owner tag used by the Oceania provinces. */
const OWNER_ID = {
  AUS: 57,
  NZL: 58,
  TON: 61,
  GBR: 1,
  DEU: 2,
  FRA: 3,
  USA: 0,
  CHL: 49,
  MEX: 38,
  NOR: 13,
  AUT: 60,
  ITA: 6,
  PRT: 8,
  MAR: 35,
  OTT: 20,
  GRC: 15,
  RUS: 4,
  ROM: 18,
  CHN: 26,
  ARG: 50,
  CAN: 56,
};

/** Simulation-region id for each 1900 map feature. Region ids equal polity ids. */
export const REGION_ID = {
  AUS: 57,
  NZL: 58,
  TON: 61,
  FJI: 116,
  BPO: 117,
  FPO: 129,
  GNG: 134,
  GSA: 135,
  GPN: 136,
  GUM: 152,
  ASM: 153,
  USA: 0,
  CHL: 49,
  MEX: 38,
  FRA: 3,
  BSA: 109,
  GBR: 1,
  NOR: 13,
  AUT: 60,
  MAR: 35,
  FEA: 124,
  OTT: 20,
  GRC: 15,
  RUS: 4,
  ROM: 18,
  DEU: 2,
  ALG: 121,
  CHN: 26,
  BEA: 111,
  ITS: 144,
  PAI: 140,
  ARG: 50,
  CAN: 56,
  PHL: 150,
};

/** Admin-1 countries that the Oceania plan consumes. */
export const OCEANIA_COUNTRIES = new Set([
  "AUS", "NZL", "PNG", "SLB", "VUT", "NCL", "FJI", "WSM", "ASM", "TON",
  "KIR", "TUV", "COK", "NIU", "PYF", "WLF", "NRU", "MHL", "FSM", "PLW",
  "MNP", "GUM", "PCN", "UMI", "HMD", "IOT", "NFK",
]);

/**
 * Features whose continental build left an inland coverage gap. The M12e build
 * adds one residual province per listed feature, computed as the feature polygon
 * minus every province of every bundle. A feature whose residual is below the
 * area threshold emits nothing (the entry stays reserved for a stable id).
 *
 * `ownerTag` may differ from the feature's 1900 sovereign: the German New Guinea
 * feature retains pre-1885 coastal islets that belong to British Papua, so that
 * residual is owned by GBR.
 */
const FEATURE_RESIDUALS = [
  { tag: "MAR", ownerTag: "MAR", name: "Moroccan southern coast residual" },
  { tag: "FEA", ownerTag: "FRA", name: "French Equatorial Africa residual" },
  { tag: "OTT", ownerTag: "OTT", name: "Ottoman residual" },
  { tag: "GRC", ownerTag: "GRC", name: "Greek residual" },
  { tag: "AUT", ownerTag: "AUT", name: "Austro-Hungarian residual" },
  { tag: "GBR", ownerTag: "GBR", name: "British Isles residual" },
  { tag: "RUS", ownerTag: "RUS", name: "Russian residual" },
  { tag: "ROM", ownerTag: "ROM", name: "Romanian residual" },
  { tag: "DEU", ownerTag: "DEU", name: "German residual" },
  { tag: "ALG", ownerTag: "FRA", name: "Algerian residual" },
  { tag: "CHN", ownerTag: "CHN", name: "Qing residual" },
  { tag: "BEA", ownerTag: "GBR", name: "British East Africa residual" },
  { tag: "ITS", ownerTag: "ITA", name: "Italian Somaliland residual" },
  { tag: "PAI", ownerTag: "PRT", name: "Portuguese island residual" },
  { tag: "ARG", ownerTag: "ARG", name: "Argentine residual" },
  { tag: "CAN", ownerTag: "CAN", name: "Canadian residual" },
  { tag: "PHL", ownerTag: "USA", name: "Philippine residual" },
  { tag: "GNG", ownerTag: "GBR", name: "Papuan coastal islets" },
  { tag: "BPO", ownerTag: "GBR", name: "British Pacific residual" },
  { tag: "FPO", ownerTag: "FRA", name: "French Pacific residual" },
  { tag: "AUS", ownerTag: "AUS", name: "Australian residual" },
  { tag: "NZL", ownerTag: "NZL", name: "New Zealand residual" },
  { tag: "FJI", ownerTag: "GBR", name: "Fijian residual" },
  { tag: "TON", ownerTag: "TON", name: "Tongan residual" },
  { tag: "GSA", ownerTag: "DEU", name: "German Samoa residual" },
  { tag: "GPN", ownerTag: "DEU", name: "German Pacific residual" },
  { tag: "GUM", ownerTag: "USA", name: "Guam residual" },
  { tag: "ASM", ownerTag: "USA", name: "American Samoa residual" },
];

function slug(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

/**
 * Build the complete Oceania and land-gap province plan.
 *
 * @param {readonly {code: string, name: string, nameLocal: string, country: string,
 *   region: string, type: string, lat: number, lon: number,
 *   polities?: readonly string[], label?: readonly number[]}[]} units
 */
export function buildOceaniaProvincePlan(units) {
  const byCode = new Map(units.map((unit) => [unit.code, unit]));
  const provinces = [];
  const gapProvinces = [];
  const missingCodes = new Set();
  const duplicateKeys = new Set();
  const duplicateClaims = [];
  const keys = new Set();
  const usedCodes = new Set();

  function add({
    key,
    name,
    display,
    aliases = [],
    mapTag,
    ownerTag,
    grouping,
    affiliation,
    confidence = "medium",
    notes,
    special = "ordinary",
    codes = [],
    claimOnly = [],
    clip = null,
    exclude = null,
    detached = false,
    minArea = null,
    tolerance = null,
    measureCoverage = true,
    shareCode = false,
    sources = ["natural-earth-10m-admin1", "project-authored-1900", "project-authored-m12"],
  }) {
    if (!key.startsWith("oc-")) throw new Error(`Oceania province key must start with oc-: ${key}`);
    if (keys.has(key)) {
      duplicateKeys.add(key);
      return;
    }
    keys.add(key);
    const ownerPolityId = OWNER_ID[ownerTag];
    if (ownerPolityId === undefined) throw new Error(`unknown owner tag ${ownerTag}`);
    const regionId = REGION_ID[mapTag];
    if (regionId === undefined) throw new Error(`unknown map tag ${mapTag}`);
    const resolved = [];
    for (const code of [...new Set(codes)]) {
      if (!byCode.has(code)) {
        missingCodes.add(code);
        continue;
      }
      if (!shareCode) {
        if (usedCodes.has(code)) {
          duplicateClaims.push(`${key}:${code}`);
          continue;
        }
        usedCodes.add(code);
      }
      resolved.push(code);
    }
    for (const code of claimOnly) {
      if (!byCode.has(code)) {
        missingCodes.add(code);
        continue;
      }
      // Metadata-only claim: the province geometry comes from a clip (the
      // Kerguelen/Crozet/Saint-Paul/Amsterdam island group), but the modern unit
      // must still be consumed so the plan audit does not report a false gap.
      if (!usedCodes.has(code)) usedCodes.add(code);
    }
    if (resolved.length === 0 && clip === null && !detached) {
      throw new Error(`Oceania province ${key} has no geometry source`);
    }
    if (resolved.length === 0 && clip === null && detached) {
      throw new Error(`detached Oceania province ${key} has no geometry source`);
    }
    provinces.push({
      key,
      historicalName: name,
      displayName: display ?? name,
      aliases,
      ownerTag,
      ownerPolityId,
      mapTag,
      simulationRegionId: regionId,
      historicalAdminAffiliation: affiliation,
      historicalGrouping: grouping ?? null,
      initialSpecialStatus: special,
      sourceIds: [...sources],
      confidence,
      notes,
      units: resolved.sort(),
      clip,
      exclude,
      detached,
      minArea: minArea ?? (detached ? 0.00002 : null),
      measureCoverage,
      tolerance: tolerance ?? (detached ? 0.004 : null),
    });
  }

  function addGap({
    key,
    name,
    display,
    aliases = [],
    mapTag,
    ownerTag,
    grouping,
    affiliation,
    confidence = "low",
    notes,
    special = "ordinary",
    geometry,
    minArea,
    measureCoverage = true,
    sources = ["project-authored-1900", "project-authored-m12", "m12e-land-mask"],
  }) {
    if (!key.startsWith("oc-")) throw new Error(`Oceania gap key must start with oc-: ${key}`);
    if (keys.has(key)) {
      duplicateKeys.add(key);
      return;
    }
    keys.add(key);
    const ownerPolityId = OWNER_ID[ownerTag];
    if (ownerPolityId === undefined) throw new Error(`unknown gap owner tag ${ownerTag}`);
    const regionId = REGION_ID[mapTag];
    if (regionId === undefined) throw new Error(`unknown gap map tag ${mapTag}`);
    gapProvinces.push({
      key,
      historicalName: name,
      displayName: display ?? name,
      aliases,
      ownerTag,
      ownerPolityId,
      mapTag,
      simulationRegionId: regionId,
      historicalAdminAffiliation: affiliation,
      historicalGrouping: grouping ?? null,
      initialSpecialStatus: special,
      sourceIds: [...sources],
      confidence,
      notes,
      units: [],
      clip: null,
      exclude: null,
      detached: true,
      residual: true,
      geometry,
      minArea,
      measureCoverage,
    });
  }

  const box = (west, south, east, north) => [
    [west, south],
    [east, south],
    [east, north],
    [west, north],
  ];

  // ---------------------------------------------------------------------------
  // Australia: the six 1900 colonies plus the two future territories
  // ---------------------------------------------------------------------------
  const AUSTRALIA = [
    ["AU-NSW", "New South Wales", "oc-aus-new-south-wales", "Australian colony"],
    ["AU-VIC", "Victoria", "oc-aus-victoria", "Australian colony"],
    ["AU-QLD", "Queensland", "oc-aus-queensland", "Australian colony"],
    ["AU-SA", "South Australia", "oc-aus-south-australia", "Australian colony"],
    ["AU-WA", "Western Australia", "oc-aus-western-australia", "Australian colony"],
    ["AU-TAS", "Tasmania", "oc-aus-tasmania", "Australian colony"],
  ];
  for (const [code, name, key, affiliation] of AUSTRALIA) {
    add({
      key,
      name,
      mapTag: "AUS",
      ownerTag: "AUS",
      grouping: "Australian colonies",
      affiliation,
      confidence: "high",
      notes: `One of the six Australian colonies on 1 January 1900. The modern state outline is the permanent province; federation on 1 January 1901 transfers it to the Commonwealth of Australia.`,
      codes: [code],
    });
  }
  add({
    key: "oc-aus-northern-territory",
    name: "Northern Territory",
    mapTag: "AUS",
    ownerTag: "AUS",
    grouping: "Australian colonies",
    affiliation: "Territory of South Australia",
    confidence: "high",
    notes:
      "The Northern Territory was administered as part of South Australia on 1 January 1900 and was transferred to the Commonwealth on 1 January 1911. It is a separate permanent province so the transfer is an ordinary ownership change.",
    codes: ["AU-NT"],
  });
  add({
    key: "oc-aus-federal-capital-territory",
    name: "Federal Capital Territory",
    display: "Australian Capital Territory",
    mapTag: "AUS",
    ownerTag: "AUS",
    grouping: "Australian colonies",
    affiliation: "Territory of New South Wales",
    confidence: "high",
    notes:
      "The seat-of-government area was part of New South Wales on 1 January 1900; the Federal Capital Territory was created in 1911 (renamed the Australian Capital Territory in 1938). It is a separate permanent province so the 1911 transfer is an ordinary ownership change.",
    codes: ["AU-ACT"],
  });
  add({
    key: "oc-aus-jervis-bay-territory",
    name: "Jervis Bay Territory",
    mapTag: "AUS",
    ownerTag: "AUS",
    grouping: "Australian colonies",
    affiliation: "Territory of New South Wales",
    confidence: "medium",
    notes:
      "Jervis Bay was part of New South Wales in 1900 and was transferred to the Commonwealth in 1915 as the port of the federal capital. It is a separate permanent province.",
    codes: ["AU-X02~"],
  });
  add({
    key: "oc-aus-macquarie-island",
    name: "Macquarie Island",
    mapTag: "AUS",
    ownerTag: "AUS",
    grouping: "Australian colonies",
    affiliation: "Tasmanian dependency",
    confidence: "medium",
    notes:
      "Macquarie Island was administered from Tasmania and was part of the colony of Tasmania in 1900. It is a detached province because the M11c land mask carries it as its own ring outside the Tasmanian unit geometry.",
    codes: ["AU-X03~"],
    detached: true,
  });
  // Lord Howe Island is a second polygon part of the AU-NSW admin-1 unit (the
  // 1900 colony of New South Wales), so it is already part of the New South Wales
  // province. No separate province is created; this is recorded in the docs.
  add({
    key: "oc-bpo-norfolk-island",
    name: "Norfolk Island",
    mapTag: "BPO",
    ownerTag: "GBR",
    grouping: "British Pacific islands",
    affiliation: "British dependency administered with New South Wales",
    confidence: "high",
    notes:
      "Norfolk Island was a separate British dependency on 1 January 1900 and was transferred to Australia in 1914. It is a permanent province owned by the United Kingdom until that transfer.",
    codes: ["NF-X01~"],
    detached: true,
  });

  // ---------------------------------------------------------------------------
  // New Zealand: regional subdivisions, Stewart Island, Chatham and outlying isles
  // ---------------------------------------------------------------------------
  const NEW_ZEALAND = [
    ["NZ-NTL", "Northland"],
    ["NZ-AUK", "Auckland"],
    ["NZ-WKO", "Waikato"],
    ["NZ-BOP", "Bay of Plenty"],
    ["NZ-GIS", "Gisborne"],
    ["NZ-HKB", "Hawke's Bay"],
    ["NZ-TKI", "Taranaki"],
    ["NZ-MWT", "Manawatu-Wanganui"],
    ["NZ-WGN", "Wellington"],
    ["NZ-TAS", "Tasman"],
    ["NZ-NSN", "Nelson"],
    ["NZ-MBH", "Marlborough"],
    ["NZ-WTC", "West Coast"],
    ["NZ-CAN", "Canterbury"],
    ["NZ-OTA", "Otago"],
    ["NZ-STL", "Southland"],
  ];
  for (const [code, name] of NEW_ZEALAND) {
    add({
      key: `oc-nzl-${slug(name)}`,
      name,
      mapTag: "NZL",
      ownerTag: "NZL",
      grouping: "Colony of New Zealand",
      affiliation: "New Zealand regional district",
      confidence: "medium",
      notes:
        "A New Zealand regional-council area used as the permanent proxy for the 1900 provincial-district subdivision (the provinces were abolished in 1876). The modern outline is the permanent province.",
      codes: [code],
    });
  }
  add({
    key: "oc-nzl-stewart-island",
    name: "Stewart Island",
    display: "Stewart Island / Rakiura",
    mapTag: "NZL",
    ownerTag: "NZL",
    grouping: "Colony of New Zealand",
    affiliation: "New Zealand provincial district",
    confidence: "high",
    notes:
      "Stewart Island is a separate island south of the South Island and was part of the 1900 colony. It is a separate permanent province; the modern Southland unit excludes it, and the island is clipped from the authored M11c New Zealand feature.",
    clip: [{ polygon: box(167.3, -47.35, 168.45, -46.68) }],
  });
  add({
    key: "oc-nzl-chatham-islands",
    name: "Chatham Islands",
    mapTag: "NZL",
    ownerTag: "NZL",
    grouping: "Colony of New Zealand",
    affiliation: "New Zealand island territory",
    confidence: "high",
    notes:
      "The Chatham Islands were annexed to New Zealand in 1842 and were part of the 1900 colony. They are a separate permanent province.",
    codes: ["NZ-CIT"],
  });
  for (const [code, key, name, note] of [
    ["NZ-X01~", "oc-nzl-kermadec-islands", "Kermadec Islands", "Annexed by New Zealand in 1887."],
    ["NZ-X03~", "oc-nzl-three-kings-islands", "Three Kings Islands", "A New Zealand island group north of Northland."],
    ["NZ-X04~", "oc-nzl-antipodes-islands", "Antipodes Islands", "A New Zealand subantarctic island group."],
    ["NZ-X05~", "oc-nzl-campbell-island", "Campbell Island", "A New Zealand subantarctic island."],
    ["NZ-X06~", "oc-nzl-auckland-islands", "Auckland Islands", "A New Zealand subantarctic island group."],
    ["NZ-X07~", "oc-nzl-snares-islands", "The Snares", "A New Zealand subantarctic island group."],
  ]) {
    add({
      key,
      name,
      mapTag: "NZL",
      ownerTag: "NZL",
      grouping: "Colony of New Zealand",
      affiliation: "New Zealand island territory",
      confidence: "medium",
      notes: `${note} Detached province: the modern admin-1 geometry is the island outline because the coarse 1900 feature does not resolve it.`,
      codes: [code],
      detached: true,
    });
  }
  add({
    key: "oc-nzl-tokelau",
    name: "Tokelau",
    mapTag: "NZL",
    ownerTag: "GBR",
    grouping: "British Pacific islands",
    affiliation: "British protectorate",
    confidence: "medium",
    notes:
      "Tokelau was a British protectorate on 1 January 1900 (from 1889), administered with the Gilbert and Ellice Islands from 1916 and transferred to New Zealand in 1926. It is a detached permanent province; the M11c New Zealand feature contains the atolls because of the modern association, but the 1900 owner is the United Kingdom.",
    codes: ["TK-X01~"],
    detached: true,
  });

  // ---------------------------------------------------------------------------
  // Papua New Guinea: German New Guinea and British New Guinea (Papua)
  // ---------------------------------------------------------------------------
  // The M11c map patch `german-new-guinea-papua` assigns the southern mainland
  // first-level units (Western, Gulf, Central, NCD, Northern, Milne Bay) to the
  // British Pacific feature and leaves the rest with German New Guinea. The
  // modern province boundaries are the proxy for the 1885 central-range line.
  const GERMAN_NEW_GUINEA = [
    ["PG-SAN", "Sandaun (West Sepik)", "Kaiser-Wilhelmsland"],
    ["PG-ESW", "East Sepik", "Kaiser-Wilhelmsland"],
    ["PG-MPM", "Madang", "Kaiser-Wilhelmsland"],
    ["PG-MPL", "Morobe", "Kaiser-Wilhelmsland"],
    ["PG-EHG", "Eastern Highlands", "Kaiser-Wilhelmsland"],
    ["PG-SHM", "Southern Highlands", "Kaiser-Wilhelmsland"],
    ["PG-WHM", "Western Highlands", "Kaiser-Wilhelmsland"],
    ["PG-CPK", "Chimbu", "Kaiser-Wilhelmsland"],
    ["PG-EPW", "Enga", "Kaiser-Wilhelmsland"],
    ["PG-MRL", "Manus", "Bismarck Archipelago"],
    ["PG-NIK", "New Ireland", "Bismarck Archipelago"],
    ["PG-EBR", "East New Britain", "Bismarck Archipelago"],
    ["PG-WBK", "West New Britain", "Bismarck Archipelago"],
    ["PG-NSB", "Bougainville", "North Solomons"],
  ];
  for (const [code, name, affiliation] of GERMAN_NEW_GUINEA) {
    add({
      key: `oc-gng-${slug(name)}`,
      name,
      mapTag: "GNG",
      ownerTag: "DEU",
      grouping: "German New Guinea",
      affiliation: `German protectorate (${affiliation})`,
      confidence: "medium",
      notes:
        "Part of German New Guinea on 1 January 1900. The modern PNG first-level outline is the permanent province and the proxy for the 1885-86 Anglo-German boundary. Australia occupied the colony in 1914, held the League mandate from 1920 and the United Nations trusteeship from 1947.",
      codes: [code],
      detached: true,
    });
  }
  const BRITISH_NEW_GUINEA = [
    ["PG-WPD", "Western"],
    ["PG-GPK", "Gulf"],
    ["PG-CPM", "Central"],
    ["PG-NCD", "National Capital District"],
    ["PG-NPP", "Northern (Oro)"],
    ["PG-MBA", "Milne Bay"],
  ];
  for (const [code, name] of BRITISH_NEW_GUINEA) {
    add({
      key: `oc-bpo-papua-${slug(name)}`,
      name: `Papua: ${name}`,
      display: `Papua (${name})`,
      mapTag: "BPO",
      ownerTag: "GBR",
      grouping: "British New Guinea (Papua)",
      affiliation: "British protectorate",
      confidence: "medium",
      notes:
        "Part of British New Guinea (Papua) on 1 January 1900, administered by the United Kingdom and from 1906 by Australia. The modern PNG first-level outline is the permanent province and the proxy for the 1885-86 Anglo-German boundary.",
      codes: [code],
      detached: true,
    });
  }

  // ---------------------------------------------------------------------------
  // Melanesia: Fiji, Solomon Islands, New Hebrides, New Caledonia
  // ---------------------------------------------------------------------------
  for (const [code, name] of [
    ["FJ-C", "Central Division"],
    ["FJ-W", "Western Division"],
    ["FJ-N", "Northern Division"],
    ["FJ-E", "Eastern Division (Lau)"],
    ["FJ-R", "Rotuma"],
  ]) {
    add({
      key: `oc-fji-${slug(name)}`,
      name,
      mapTag: "FJI",
      ownerTag: "GBR",
      grouping: "Colony of Fiji",
      affiliation: "Fijian colonial division",
      confidence: "high",
      notes:
        "A division of the Crown Colony of Fiji in 1900. Viti Levu is divided between the Central and Western divisions as in the colonial administration; Vanua Levu is in the Northern division and the Lau group in the Eastern division. Fiji became independent on 10 October 1970.",
      codes: [code],
    });
  }
  for (const [code, name] of [
    ["SB-CT", "Honiara"],
    ["SB-GU", "Guadalcanal"],
    ["SB-CE", "Central"],
    ["SB-CH", "Choiseul and Western"],
    ["SB-IS", "Isabel"],
    ["SB-ML", "Malaita"],
    ["SB-MK", "Makira"],
    ["SB-RB", "Rennell and Bellona"],
    ["SB-TE", "Temotu"],
  ]) {
    add({
      key: `oc-bpo-solomon-${slug(name)}`,
      name: `Solomon Islands: ${name}`,
      display: `Solomons (${name})`,
      mapTag: "BPO",
      ownerTag: "GBR",
      grouping: "British Solomon Islands Protectorate",
      affiliation: "British protectorate",
      confidence: "medium",
      notes:
        "Part of the British Solomon Islands Protectorate in 1900. The northern Solomons (Bougainville and Buka) were German until the 1899 convention and are part of German New Guinea. The modern provincial outline is the permanent province; the island province is detached from the coarse British Pacific feature.",
      codes: [code],
      detached: true,
    });
  }
  for (const [code, name] of [
    ["VU-SAM", "Sanma"],
    ["VU-MAP", "Malampa"],
    ["VU-PAM", "Penama"],
    ["VU-SEE", "Shefa"],
    ["VU-TAE", "Tafea"],
    ["VU-TOB", "Torba"],
  ]) {
    add({
      key: `oc-bpo-new-hebrides-${slug(name)}`,
      name: `New Hebrides: ${name}`,
      display: `Vanuatu (${name})`,
      mapTag: "BPO",
      ownerTag: "GBR",
      grouping: "Anglo-French New Hebrides condominium",
      affiliation: "Anglo-French condominium",
      confidence: "medium",
      notes:
        "The New Hebrides were an Anglo-French condominium (joint naval commission from 1887, formal condominium from 1906) on 1 January 1900. The province carries the condominium special status and is owned by the United Kingdom because the M11c feature is the British Pacific one; France is the co-administrator. Vanuatu became independent on 30 July 1980.",
      codes: [code],
      special: "condominium",
    });
  }
  for (const [code, name] of [
    ["NC-X03~", "North Province"],
    ["NC-X02~", "South Province"],
    ["NC-X01~", "Loyalty Islands Province"],
  ]) {
    add({
      key: `oc-fpo-new-caledonia-${slug(name)}`,
      name: `New Caledonia: ${name}`,
      display: `New Caledonia (${name})`,
      mapTag: "FPO",
      ownerTag: "FRA",
      grouping: "French New Caledonia",
      affiliation: "French colony",
      confidence: "high",
      notes:
        "New Caledonia was a French colony in 1900 (annexed 1853). The modern provincial outline is the permanent province; the territory remains French and no sovereignty transfer is modelled.",
      codes: [code],
    });
  }

  // ---------------------------------------------------------------------------
  // Micronesia: Nauru, Marshall, Caroline, Marianas, Guam, Kiribati, Tuvalu
  // ---------------------------------------------------------------------------
  add({
    key: "oc-gpn-nauru",
    name: "Nauru",
    mapTag: "GPN",
    ownerTag: "DEU",
    grouping: "German Pacific islands",
    affiliation: "German protectorate",
    confidence: "high",
    notes:
      "Nauru was part of the German Pacific possessions in 1900. Australia occupied it in 1914, administered the League mandate from 1920 and the United Nations trust from 1947; it became independent on 31 January 1968. The modern district units are one permanent province.",
    codes: units.filter((unit) => unit.country === "NRU").map((unit) => unit.code),
  });
  for (const [code, name] of [
    ["MH-T", "Ratak Chain"],
    ["MH-L", "Ralik Chain"],
  ]) {
    add({
      key: `oc-gpn-marshall-${slug(name)}`,
      name: `Marshall Islands: ${name}`,
      display: `Marshall Islands (${name})`,
      mapTag: "GPN",
      ownerTag: "DEU",
      grouping: "German Pacific islands",
      affiliation: "German protectorate",
      confidence: "high",
      notes:
        "Part of the German Marshall Islands protectorate in 1900. Japan occupied the islands in 1914 and held the League mandate from 1920; the United States administered the Trust Territory from 1947 and the Compact of Free Association took effect in 1986.",
      codes: [code],
    });
  }
  for (const [code, name] of [
    ["FM-KSA", "Kosrae"],
    ["FM-PNI", "Pohnpei"],
    ["FM-TRK", "Chuuk"],
    ["FM-YAP", "Yap"],
  ]) {
    add({
      key: `oc-gpn-caroline-${slug(name)}`,
      name: `Caroline Islands: ${name}`,
      display: `Micronesia (${name})`,
      mapTag: "GPN",
      ownerTag: "DEU",
      grouping: "German Pacific islands",
      affiliation: "German protectorate",
      confidence: "high",
      notes:
        "Part of the German Caroline Islands in 1900 (purchased from Spain in 1899). Japan occupied the islands in 1914 and held the League mandate from 1920; the United States administered the Trust Territory from 1947 and the Compact of Free Association took effect in 1986.",
      codes: [code],
    });
  }
  add({
    key: "oc-gpn-palau",
    name: "Palau",
    mapTag: "GPN",
    ownerTag: "DEU",
    grouping: "German Pacific islands",
    affiliation: "German protectorate",
    confidence: "high",
    notes:
      "Palau was part of the German Caroline Islands in 1900 (purchased from Spain in 1899). Japan occupied it in 1914 and held the League mandate from 1920; the United States administered the Trust Territory from 1947 and the Palau Compact took effect in 1994.",
    codes: units.filter((unit) => unit.country === "PLW").map((unit) => unit.code),
  });
  for (const [code, name] of [
    ["MP-X04~", "Northern Islands"],
    ["MP-X03~", "Saipan"],
    ["MP-X02~", "Tinian"],
    ["MP-X01~", "Rota"],
  ]) {
    add({
      key: `oc-gpn-northern-marianas-${slug(name)}`,
      name: `Northern Mariana Islands: ${name}`,
      display: `Northern Marianas (${name})`,
      mapTag: "GPN",
      ownerTag: "DEU",
      grouping: "German Pacific islands",
      affiliation: "German protectorate",
      confidence: "medium",
      notes:
        "Part of the German Northern Mariana Islands in 1900 (purchased from Spain in 1899). Japan occupied the islands in 1914 and held the League mandate from 1920; the United States administered the Trust Territory from 1947 and the commonwealth was established in 1978.",
      codes: [code],
    });
  }
  add({
    key: "oc-gum-guam",
    name: "Guam",
    mapTag: "GUM",
    ownerTag: "USA",
    grouping: "Guam",
    affiliation: "United States naval station",
    confidence: "high",
    notes:
      "Guam was ceded by Spain to the United States in 1898 and was a United States naval station on 1 January 1900. It is one permanent province.",
    codes: ["GU-X01~"],
  });
  for (const [key, name, note, clip] of [
    [
      "oc-bpo-gilbert-islands",
      "Gilbert Islands",
      "The Gilbert Islands were a British protectorate from 1892 and part of the Gilbert and Ellice Islands Colony from 1916. Banaba (Ocean Island) is grouped with the Gilberts.",
      box(169.0, -2.0, 176.0, 4.0),
    ],
    [
      "oc-bpo-line-islands",
      "Line Islands",
      "The Line Islands (Kiritimati, Tabuaeran, Teraina, Malden, Starbuck, Caroline, Vostok) were British claims from 1888 and were administered with the Gilbert and Ellice Islands from 1916. They are a separate permanent province.",
      box(-162.5, -6.0, -150.0, 6.0),
    ],
    [
      "oc-bpo-phoenix-islands",
      "Phoenix Islands",
      "The Phoenix Islands (Birnie, Enderbury, Kanton, Manra, McKean, Nikumaroro, Rawaki, Orona) were British claims from 1889 and are part of Kiribati today. They are a separate permanent province.",
      box(-176.0, -6.0, -170.0, -2.0),
    ],
  ]) {
    add({
      key,
      name,
      mapTag: "BPO",
      ownerTag: "GBR",
      grouping: "British Pacific islands",
      affiliation: "British protectorate",
      confidence: "medium",
      notes: `${note} Detached province built from the modern Kiribati first-level geometry clipped to the island-group audit boundary; the clip isolates a coastline, not a political frontier.`,
      codes: key === "oc-bpo-phoenix-islands" ? ["KI-X02~"] : ["KI-X01~"],
      clip: [{ polygon: clip }],
      detached: true,
      // KI-X01~ is the modern Kiribati unit that spans several island groups.
      // The Gilbert and Line provinces share it and each keeps its own clip; the
      // island-group boundary is the clip, not the unit, so this is intentional.
      shareCode: key === "oc-bpo-line-islands",
    });
  }
  add({
    key: "oc-bpo-ellice-islands",
    name: "Ellice Islands",
    display: "Tuvalu",
    mapTag: "BPO",
    ownerTag: "GBR",
    grouping: "British Pacific islands",
    affiliation: "British protectorate",
    confidence: "high",
    notes:
      "The Ellice Islands were a British protectorate from 1892 and part of the Gilbert and Ellice Islands Colony from 1916. They became the independent state of Tuvalu on 1 October 1978. The modern atoll units are one permanent province.",
    codes: ["TV-X01~"],
    detached: true,
  });

  // ---------------------------------------------------------------------------
  // Polynesia: Tonga, Samoa, Cook, Niue, Tokelau, French Polynesia, Wallis
  // ---------------------------------------------------------------------------
  for (const [code, name] of [
    ["TO-04", "Tongatapu"],
    ["TO-02", "Ha'apai"],
    ["TO-05", "Vava'u"],
    ["TO-01", "'Eua"],
    ["TO-03", "Niuas"],
  ]) {
    add({
      key: `oc-ton-${slug(name)}`,
      name,
      mapTag: "TON",
      ownerTag: "TON",
      grouping: "Kingdom of Tonga",
      affiliation: "Tongan island group",
      confidence: "high",
      notes:
        "The Kingdom of Tonga was a British-protected but internally self-governing kingdom in 1900. The modern division outline is the permanent province; the 1970 end of British protection is a status change, not an ownership change.",
      codes: [code],
    });
  }
  add({
    key: "oc-gsa-german-samoa",
    name: "German Samoa",
    display: "Samoa (Upolu and Savai'i)",
    mapTag: "GSA",
    ownerTag: "DEU",
    grouping: "German Samoa",
    affiliation: "German protectorate",
    confidence: "high",
    notes:
      "Western Samoa (Upolu and Savai'i) became a German protectorate under the 1899 Tripartite Convention. New Zealand occupied it in 1914, held the League mandate from 1920 and the United Nations trusteeship from 1946; it became independent on 1 January 1962. The modern district units are one permanent province.",
    codes: units.filter((unit) => unit.country === "WSM").map((unit) => unit.code),
  });
  add({
    key: "oc-asm-american-samoa",
    name: "American Samoa",
    mapTag: "ASM",
    ownerTag: "USA",
    grouping: "American Samoa",
    affiliation: "United States naval station",
    confidence: "medium",
    notes:
      "Tutuila was ceded to the United States in 1900 and Manu'a in 1904; the islands were a United States naval station on 1 January 1900. Tutuila, Manu'a, Rose Atoll and Swain's Island are one permanent province built from the modern district units.",
    codes: units.filter((unit) => unit.country === "ASM").map((unit) => unit.code),
    detached: true,
  });
  for (const [key, name, codes, note] of [
    [
      "oc-bpo-cook-islands-southern",
      "Cook Islands: Southern Group",
      ["CK-X01~", "CK-X02~", "CK-X03~", "CK-X04~", "CK-X05~", "CK-X06~", "CK-X07~"],
      "Rarotonga, Aitutaki, Atiu, Mangaia, Mauke, Mitiaro and Palmerston were a British protectorate in 1900 (from 1888) and were annexed to New Zealand in 1901.",
    ],
    [
      "oc-bpo-cook-islands-northern",
      "Cook Islands: Northern Group",
      ["CK-X08~", "CK-X09~", "CK-X10~", "CK-X11~"],
      "Pukapuka, Rakahanga, Manihiki and Penrhyn were part of the British Cook Islands protectorate in 1900 and were annexed to New Zealand in 1901.",
    ],
  ]) {
    add({
      key,
      name,
      mapTag: "BPO",
      ownerTag: "GBR",
      grouping: "British Pacific islands",
      affiliation: "British protectorate",
      confidence: "medium",
      notes: `${note} The Cook Islands became self-governing in free association with New Zealand on 4 August 1965.`,
      codes,
      detached: true,
    });
  }
  add({
    key: "oc-bpo-niue",
    name: "Niue",
    mapTag: "BPO",
    ownerTag: "GBR",
    grouping: "British Pacific islands",
    affiliation: "British protectorate",
    confidence: "high",
    notes:
      "Niue was a British protectorate in 1900 and was annexed to New Zealand in 1901. It became self-governing in free association with New Zealand on 19 October 1974.",
    codes: ["NU-X01~"],
    detached: true,
  });
  for (const [code, name] of [
    ["PF-X01~", "Windward Islands"],
    ["PF-X02~", "Leeward Islands"],
    ["PF-X03~", "Tuamotu and Gambier Islands"],
    ["PF-X04~", "Austral Islands"],
    ["PF-X05~", "Marquesas Islands"],
  ]) {
    add({
      key: `oc-fpo-${slug(name)}`,
      name: `French Polynesia: ${name}`,
      display: `French Polynesia (${name})`,
      mapTag: "FPO",
      ownerTag: "FRA",
      grouping: "French Establishments in Oceania",
      affiliation: "French colony",
      confidence: "high",
      notes:
        "Part of the French Establishments in Oceania (French Polynesia) in 1900. The modern administrative subdivision is the permanent province; the territory remains French and no sovereignty transfer is modelled.",
      codes: [code],
    });
  }
  add({
    key: "oc-fpo-french-southern-lands",
    name: "French Southern and Antarctic Lands",
    display: "Kerguelen, Crozet, Saint-Paul and Amsterdam",
    mapTag: "FPO",
    ownerTag: "FRA",
    grouping: "French Southern and Antarctic Lands",
    affiliation: "French colonial dependency",
    confidence: "medium",
    notes:
      "Kerguelen, the Crozet Islands, Saint-Paul and Amsterdam were French dependencies in 1900 (the M11c `french-southern-territories` patch assigns them to the French Pacific feature). The island group is one permanent province; the clip is an island/coastline boundary, not a political frontier.",
    clip: [{ polygon: box(50, -50, 78, -37) }],
    // The French Southern and Antarctic Lands admin-1 units are consumed for
    // bookkeeping; the geometry comes from the authored M11c feature clip.
    claimOnly: ["TF-X01~", "TF-X02~", "TF-X1~"],
  });
  add({
    key: "oc-fpo-wallis-island",
    name: "Wallis (Uvea)",
    mapTag: "FPO",
    ownerTag: "FRA",
    grouping: "Wallis and Futuna",
    affiliation: "French protectorate",
    confidence: "medium",
    notes:
      "Wallis (Uvea) was a French protectorate from 1887 and part of the Wallis and Futuna territory in 1900. It is a separate permanent province.",
    codes: ["WF-UV"],
  });
  add({
    key: "oc-fpo-futuna-and-alofi",
    name: "Futuna and Alofi",
    mapTag: "FPO",
    ownerTag: "FRA",
    grouping: "Wallis and Futuna",
    affiliation: "French protectorate",
    confidence: "medium",
    notes:
      "Futuna and Alofi were French protectorates from 1888 and part of the Wallis and Futuna territory in 1900. The two kingdoms (Sigave and Alo) are one permanent province.",
    codes: ["WF-AL", "WF-SG"],
  });

  // ---------------------------------------------------------------------------
  // Remote and shared-feature islands (the global land-gap core)
  // ---------------------------------------------------------------------------
  add({
    key: "oc-bsa-pitcairn-islands",
    name: "Pitcairn Islands",
    mapTag: "BSA",
    ownerTag: "GBR",
    grouping: "British South Atlantic and Pacific islands",
    affiliation: "British colony",
    confidence: "high",
    notes:
      "Pitcairn, Henderson, Oeno and Ducie were a British colony in 1900 and remain a British Overseas Territory. The modern admin-1 unit is the island outline; the M11c 50m feature only resolves Henderson, so the province is detached from the feature.",
    codes: ["PN-X01~"],
    detached: true,
  });
  add({
    key: "oc-bsa-chagos-archipelago",
    name: "Chagos Archipelago",
    display: "Chagos (Diego Garcia)",
    mapTag: "BSA",
    ownerTag: "GBR",
    grouping: "British South Atlantic and Pacific islands",
    affiliation: "British dependency",
    confidence: "medium",
    notes:
      "The Chagos Archipelago was administered with Mauritius in 1900 and remained British when Mauritius became independent in 1968 (British Indian Ocean Territory). It is a detached permanent province; the atoll is below the M11c land-mask threshold but is present in the modern admin-1 layer.",
    codes: ["IO-X01~"],
    detached: true,
  });
  add({
    key: "oc-bpo-heard-and-mcdonald-islands",
    name: "Heard and McDonald Islands",
    mapTag: "BPO",
    ownerTag: "GBR",
    grouping: "British Pacific islands",
    affiliation: "Unclaimed subantarctic dependency",
    confidence: "low",
    notes:
      "Heard and McDonald were uninhabited and unclaimed on 1 January 1900. They are attached to the British Pacific islands province group so the M11c land ring has a permanent owner and a drawable province; the United Kingdom annexed them in 1910 and transferred them to Australia in 1947. Low confidence for the 1900 ownership.",
    codes: ["HM-X01~"],
    detached: true,
  });
  add({
    key: "oc-chl-easter-island",
    name: "Easter Island",
    display: "Easter Island (Rapa Nui)",
    mapTag: "CHL",
    ownerTag: "CHL",
    grouping: "Republic of Chile",
    affiliation: "Chilean island territory",
    confidence: "high",
    notes:
      "Easter Island (Rapa Nui) was annexed by Chile in 1888 and was Chilean on 1 January 1900. It is a separate permanent province. The island clip isolates the M11c Chilean coastline ring; it is not a political frontier.",
    clip: [{ polygon: box(-109.6, -27.4, -108.9, -26.9) }],
  });
  add({
    key: "oc-chl-juan-fernandez-islands",
    name: "Juan Fernandez Islands",
    mapTag: "CHL",
    ownerTag: "CHL",
    grouping: "Republic of Chile",
    affiliation: "Chilean island territory",
    confidence: "high",
    notes:
      "The Juan Fernandez Islands (Robinson Crusoe, Alejandro Selkirk and Santa Clara) were Chilean in 1900. They are a separate permanent province; the island clip isolates the M11c Chilean coastline ring.",
    clip: [{ polygon: box(-79.2, -33.9, -78.6, -33.4) }],
  });
  add({
    key: "oc-mex-revillagigedo-islands",
    name: "Revillagigedo Islands",
    mapTag: "MEX",
    ownerTag: "MEX",
    grouping: "United Mexican States",
    affiliation: "Mexican federal territory",
    confidence: "medium",
    notes:
      "The Revillagigedo Islands (Socorro, Clarion, San Benedicto and Roca Partida) were Mexican in 1900. They are a separate permanent province; the island clip isolates the M11c Mexican coastline ring.",
    clip: [{ polygon: box(-111.3, 18.6, -110.7, 19.0) }],
  });
  add({
    key: "oc-usa-pacific-remote-islands",
    name: "United States Pacific remote islands",
    display: "Wake, Midway, Johnston and Palmyra",
    mapTag: "USA",
    ownerTag: "USA",
    grouping: "United States of America",
    affiliation: "United States insular territory",
    confidence: "medium",
    notes:
      "Wake, Midway, Johnston, Palmyra, Baker, Howland and Jarvis were United States possessions or claimed guano islands on 1 January 1900. They are one permanent province built from the modern United States Minor Outlying Islands admin-1 units; the M11c 1900 feature does not resolve them, so the province is detached.",
    codes: [
      "UM-67",
      "UM-71",
      "UM-79",
      "UM-81",
      "UM-84",
      "UM-86",
      "UM-95",
    ],
    detached: true,
  });
  add({
    key: "oc-usa-navassa-island",
    name: "Navassa Island",
    mapTag: "USA",
    ownerTag: "USA",
    grouping: "United States of America",
    affiliation: "United States insular territory",
    confidence: "low",
    notes:
      "Navassa was claimed by the United States in 1857 and was a United States possession in 1900; Haiti also claims it. It is a detached province built from the modern admin-1 unit. Low confidence for the 1900 administration.",
    codes: ["UM-76"],
    detached: true,
  });

  // ---------------------------------------------------------------------------
  // Remaining global land gaps
  // ---------------------------------------------------------------------------
  add({
    key: "oc-gbr-isle-of-man",
    name: "Isle of Man",
    mapTag: "GBR",
    ownerTag: "GBR",
    grouping: "British Isles",
    affiliation: "British Crown dependency",
    confidence: "high",
    notes:
      "The Isle of Man was a self-governing British Crown dependency in 1900, not part of the United Kingdom. It is a separate permanent province with the autonomous special status; the island clip isolates the M11c British coastline ring.",
    clip: [{ polygon: box(-5.0, 53.9, -4.2, 54.5) }],
    special: "autonomous",
  });
  add({
    key: "oc-nor-svalbard",
    name: "Svalbard",
    display: "Svalbard and Bear Island",
    mapTag: "NOR",
    ownerTag: "NOR",
    grouping: "Kingdom of Norway",
    affiliation: "Arctic island territory",
    confidence: "low",
    notes:
      "Svalbard was terra nullius on 1 January 1900; Norwegian sovereignty dates from the 1920 Svalbard Treaty and 1925. The M11c Norwegian feature contains the archipelago, so it is attached to Norway with low confidence as a separate permanent province. The island clip is an audit/coastline boundary.",
    clip: [{ polygon: box(10, 74, 34, 81) }],
  });
  add({
    key: "oc-aut-krk-island",
    name: "Krk",
    mapTag: "AUT",
    ownerTag: "AUT",
    grouping: "Austro-Hungarian Monarchy",
    affiliation: "Austrian Littoral",
    confidence: "medium",
    notes:
      "Krk was part of the Austrian Littoral of Austria-Hungary in 1900. It is a separate permanent province; the island clip isolates the M11c Austrian coastline ring.",
    clip: [{ polygon: box(14.4, 44.95, 14.85, 45.3) }],
  });
  add({
    key: "oc-aut-cres-and-losinj",
    name: "Cres and Losinj",
    mapTag: "AUT",
    ownerTag: "AUT",
    grouping: "Austro-Hungarian Monarchy",
    affiliation: "Austrian Littoral",
    confidence: "medium",
    notes:
      "Cres and Losinj were part of the Austrian Littoral of Austria-Hungary in 1900. They are one permanent province; the island clip isolates the M11c Austrian coastline ring and excludes the Istrian mainland.",
    clip: [{ polygon: box(14.25, 44.6, 14.6, 45.2) }],
  });
  addGap({
    key: "oc-fra-clipperton-island",
    name: "Clipperton Island",
    mapTag: "FRA",
    ownerTag: "FRA",
    grouping: "French Pacific",
    affiliation: "French dependency",
    confidence: "low",
    notes:
      "Clipperton was claimed by France in 1858 and was French in 1900, although it was uninhabited and unadministered. The M11c map does not expose the atoll (it is below the land-mask area threshold and absent from the 1900 French feature and the admin-1 layer), so it is built from a small authored island polygon labelled as a coastline approximation, not a political frontier.",
    geometry: {
      kind: "authored",
      polygons: [box(-109.26, 10.27, -109.18, 10.33)],
    },
    minArea: 0.00001,
    measureCoverage: false,
  });

  // One residual province per feature whose continental build left an inland gap.
  // These entries are built after every plan province exists, so each source is
  // exactly "feature - every province"; a feature with no residual emits nothing.
  FEATURE_RESIDUALS.forEach((entry, index) => {
    const oceaniaFeature = [
      "GNG",
      "BPO",
      "FPO",
      "AUS",
      "NZL",
      "FJI",
      "TON",
      "GSA",
      "GPN",
      "GUM",
      "ASM",
    ].includes(entry.tag);
    addGap({
      key: `oc-gap-${entry.tag.toLowerCase()}-residual`,
      name: entry.name,
      mapTag: entry.tag,
      ownerTag: entry.ownerTag,
      grouping: null,
      affiliation: "Coverage residual",
      confidence: "low",
      notes:
        "M12e coverage residual: the authored 1900 feature polygon is not completely covered by the continental provinces. This province is the remaining area, owned by the feature's 1900 sovereign so the residual stays the correct underlay colour. It is coverage geometry, not a reviewed frontier.",
      geometry: { kind: "feature-residual" },
      minArea: 0.01,
      measureCoverage: oceaniaFeature,
      provinceId: FEATURE_RESIDUAL_ID_BASE + index + 1,
    });
  });

  // ---------------------------------------------------------------------------
  // Validation and stable ids
  // ---------------------------------------------------------------------------
  //
  // Island-group provinces are detached from their coarse 1900 feature: the
  // feature is a single aggregate polygon for a whole colony, and clipping an
  // atoll's modern admin-1 outline to it loses outer islands or coastal slivers.
  // The island's own coastline is the correct 1900 boundary; the colonial
  // partition (German/British, German/American, British/French) is already
  // encoded by which modern units belong to which province group.
  const DETACHED_FEATURES = new Set(["BPO", "FPO", "GPN", "GUM", "ASM", "GSA", "FJI", "TON"]);
  for (const province of provinces) {
    if (DETACHED_FEATURES.has(province.mapTag) && province.clip === null) {
      province.detached = true;
      if (province.tolerance === null) province.tolerance = 0.004;
      if (province.minArea === null) province.minArea = 0.00002;
    }
  }
  // Stewart Island is part of the modern Southland admin-1 unit. The Southland
  // province excludes the island box so the separate Stewart Island province is
  // not double-covered and the two provinces meet the audit without overlap.
  const southland = provinces.find((province) => province.key === "oc-nzl-southland");
  if (southland !== undefined) {
    southland.exclude = [{ polygon: box(167.3, -47.35, 168.45, -46.68) }];
  }
  if (missingCodes.size > 0) {
    throw new Error(
      `Oceania province plan references unknown admin-1 codes: ${[...missingCodes].sort().join(", ")}`,
    );
  }
  if (duplicateKeys.size > 0) {
    throw new Error(`Oceania province plan has duplicate keys: ${[...duplicateKeys].join(", ")}`);
  }
  if (duplicateClaims.length > 0) {
    throw new Error(`Oceania province plan reuses admin-1 codes: ${duplicateClaims.join(", ")}`);
  }
  if (provinces.length > 4800) {
    throw new Error(`Oceania province plan exceeds its 4800-province budget (${provinces.length})`);
  }
  for (const province of provinces) {
    if (province.units.length === 0 && province.clip === null) {
      throw new Error(`Oceania province ${province.key} has no geometry source`);
    }
  }

  const seenIds = new Set();
  for (let index = 0; index < provinces.length; index += 1) {
    const id = OCEANIA_PROVINCE_ID_BASE + index + 1;
    if (seenIds.has(id)) throw new Error(`duplicate province id ${id}`);
    seenIds.add(id);
    provinces[index].provinceId = id;
  }
  // Authored gap provinces that are not feature residuals take the next ids in
  // the Oceania block, before the reserved residual and land-gap blocks.
  let nextGapId = OCEANIA_PROVINCE_ID_BASE + provinces.length + 1;
  for (const gap of gapProvinces) {
    if (gap.provinceId === undefined) {
      while (seenIds.has(nextGapId)) nextGapId += 1;
      gap.provinceId = nextGapId;
      nextGapId += 1;
    }
    if (seenIds.has(gap.provinceId)) throw new Error(`duplicate gap province id ${gap.provinceId}`);
    seenIds.add(gap.provinceId);
  }

  // ---------------------------------------------------------------------------
  // Admin-1 unit audit
  // ---------------------------------------------------------------------------
  //
  // Every modern unit whose label point lies in an Oceanian 1900 feature must be
  // consumed by a province or documented as belonging to another bundle (the
  // Indian Ocean part of the British Pacific feature, St Helena/Ascension in the
  // British South Atlantic feature, and the Falklands). The Pacific filter below
  // is the same audit scope used by the coverage clips.
  const OCEANIA_UNIT_FEATURES = new Set([
    "AUS",
    "NZL",
    "FJI",
    "TON",
    "BPO",
    "FPO",
    "GNG",
    "GSA",
    "GPN",
    "GUM",
    "ASM",
    "BSA",
  ]);
  const unassigned = [];
  for (const unit of units) {
    if (usedCodes.has(unit.code)) continue;
    const tags = (unit.polities ?? []).filter((tag) => OCEANIA_UNIT_FEATURES.has(tag));
    if (tags.length === 0) continue;
    const inPacific =
      unit.lon >= 130 ||
      unit.lon <= -140 ||
      (unit.lon >= 70 && unit.lon <= 74) ||
      (unit.lon >= -135 && unit.lon <= -120);
    const inScope = tags.some(
      (tag) => tag !== "BPO" && tag !== "BSA" ? true : inPacific,
    );
    if (inScope) unassigned.push(`${unit.code}(${tags.join("+")})`);
  }

  return {
    sources: OCEANIA_SOURCES,
    futurePolities: OCEANIA_FUTURE_POLITIES,
    provinces,
    gapProvinces,
    usedCodes: [...usedCodes].sort(),
    unassigned: [...new Set(unassigned)].sort(),
    claimedElsewhere: [],
    duplicateClaims: [],
    idBase: OCEANIA_PROVINCE_ID_BASE,
    featureResidualIdBase: FEATURE_RESIDUAL_ID_BASE,
    landGapIdBase: LAND_GAP_ID_BASE,
  };
}

export { OWNER_ID, FEATURE_RESIDUALS };

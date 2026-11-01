/**
 * Authored M12d Americas province plan (1 January 1900).
 *
 * This module is data, not simulation logic. It mirrors the M12a European,
 * M12b Asian and M12c African plans: the 1900 M11c map polity supplies the outer
 * boundary, modern Natural Earth 1:10m admin-1 units are only internal geometry
 * blocks, and each province is a permanent geographical unit with a stable
 * numeric id. Americas ids live in a disjoint block (300001+) and every key is
 * prefixed with `am-`, so they can never collide with a European (66001 and
 * below), Asian (100001-100239) or African (200001-200260) province.
 *
 * Grouping policy:
 * - The United States uses one permanent province per 1900 state or territory
 *   (the future Oklahoma, Arizona and New Mexico states are 1900 territories;
 *   Alaska and Hawaii are separate territories; Puerto Rico is a separate map
 *   feature and a separate province).
 * - Canada uses the seven 1900 provinces, Yukon, the Northwest Territories
 *   (including modern Nunavut), and Alberta/Saskatchewan as the 1900 districts
 *   of the Northwest Territories that became provinces in 1905. Newfoundland and
 *   Labrador are a separate 1900 dominion and a separate permanent province.
 * - Mexico uses the Porfiriato states and territories; Baja California remains a
 *   single 1900 territory (modern Baja California and Baja California Sur).
 * - Central and South America use the modern first-level unit as a proxy for the
 *   1900 department/province where no exact historical unit exists; Acre is
 *   Bolivian in 1900, Tacna is Chilean-occupied in 1900, and the Brazilian
 *   territories that became states later are grouped into their 1900 parents.
 * - The Caribbean follows the colony/island-group scale. Every colony that
 *   became a separate sovereign state is a separate permanent province group so
 *   its independence is an ordinary ownership transfer. Guadeloupe,
 *   Martinique, French Guiana, Curaçao, Aruba and the smaller islands stay with
 *   their metropolitan owners but remain separate provinces so a later status
 *   change is representable.
 * - One 1900 administrative area is represented by more than one permanent
 *   province wherever a later successor frontier runs through it. The mandatory
 *   cases are Colombia/Panama, Canada/Newfoundland, the Danish West Indies /
 *   United States Virgin Islands, and every British Caribbean independence.
 */

/** First id of the Americas block. Africa ends at 200260. */
export const AMERICAS_PROVINCE_ID_BASE = 300000;

/** Historical and geospatial sources referenced by province entries. */
export const AMERICAS_SOURCES = [
  {
    id: "natural-earth-10m-admin1",
    title: "Natural Earth 1:10m admin-1 states and provinces",
    url: "https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-1-states-provinces/",
    license: "Public domain",
    date: "2024",
    notes:
      "Modern first-level units used only as internal geometry blocks. Every province is clipped to the authored M11c 1900 polity polygon.",
  },
  {
    id: "natural-earth-50m-admin0",
    title: "Natural Earth 1:50m admin-0 countries",
    url: "https://www.naturalearthdata.com/downloads/50m-cultural-vectors/50m-admin-0-countries/",
    license: "Public domain",
    date: "2024",
    notes: "Modern country outlines used for coastlines and small-island clipping.",
  },
  {
    id: "eb1911-americas",
    title: "Encyclopaedia Britannica (1911), American states and colonies",
    url: "https://en.wikisource.org/wiki/1911_Encyclop%C3%A6dia_Britannica",
    license: "Public domain",
    date: "1911",
    notes:
      "The 1900 political map of the Americas: the United States, Canada, Newfoundland, Mexico, the Central and South American republics, and the European colonies in the Caribbean and the Guianas.",
  },
  {
    id: "treaty-paris-1898",
    title: "Treaty of Paris (1898)",
    url: "https://en.wikisource.org/wiki/Treaty_of_Paris_(1898)",
    license: "Public domain",
    date: "1898",
    notes:
      "The Spanish cession of Puerto Rico, Guam and the Philippines and the US occupation of Cuba.",
  },
  {
    id: "treaty-hay-herran-1903",
    title: "Hay-Herrán Treaty (1903) and the separation of Panama",
    url: "https://en.wikisource.org/wiki/Hay%E2%80%93Herr%C3%A1n_Treaty",
    license: "Public domain",
    date: "1903",
    notes:
      "The failed canal treaty and the 1903 separation of Panama from Colombia; the permanent Colombia/Panama province split.",
  },
  {
    id: "treaty-danish-west-indies-1916",
    title: "Treaty of the Danish West Indies (1916)",
    url: "https://en.wikisource.org/wiki/Treaty_of_the_Danish_West_Indies",
    license: "Public domain",
    date: "1916",
    notes:
      "The 1917 transfer of Saint Croix, Saint Thomas and Saint John from Denmark to the United States.",
  },
  {
    id: "british-north-america-act-1949",
    title: "British North America Act, 1949 (Newfoundland)",
    url: "https://en.wikisource.org/wiki/British_North_America_Act,_1949",
    license: "Public domain",
    date: "1949",
    notes: "The union of Newfoundland and Labrador with Canada on 31 March 1949.",
  },
  {
    id: "westminster-1931",
    title: "Statute of Westminster (1931)",
    url: "https://en.wikisource.org/wiki/Statute_of_Westminster,_1931",
    license: "Public domain",
    date: "1931",
    notes:
      "The legislative independence of the Dominions; used only as constitutional context for Canada and Newfoundland.",
  },
  {
    id: "project-authored-1900",
    title: "Fabric of Nations M11c authored 1900 boundary reconstruction",
    url: "internal:packages/data/data/map/world_map_1900.json",
    license: "Project data",
    date: "2026",
    notes: "The M11c world-map bundle supplies every 1900 outer boundary.",
  },
  {
    id: "project-authored-m12",
    title: "Fabric of Nations M12a/M12b/M12c/M12d authored provincial partition",
    url: "internal:scripts/m12d/americas-plan.mjs",
    license: "Project data",
    date: "2026",
    notes: "The authored grouping of modern first-level units into historical provinces.",
  },
];

/**
 * Polity registry for the Americas: post-1900 successors plus historical and
 * breakaway entries.
 *
 * Ids 1300-1399 are reserved for the Americas and never overlap the M12a Europe
 * range (1000-1016), the M12b Asia range (1100-1144) or the M12c Africa range
 * (1200-1256). None is selectable in 1900.
 *
 * Newfoundland is the one 1900-active entry: it was a self-governing Dominion on
 * 1 January 1900 but is absent from the 67-polity M11c selectable catalog. It is
 * registered as a non-selectable 1900 state so its provinces are permanently
 * distinct and the 1949 union with Canada is an ordinary transfer. It is not a
 * future state (its activation is 1900-01-01); the loader records its kind
 * explicitly. See DECISIONS D-106.
 *
 * The trailing entries are the `kind: "historical"` breakaway/predecessor
 * registry added by D-107. They own nothing in 1900; pre-1900 activation dates
 * are clamped to 1900-01-01 and the real dates are recorded in notes.
 */
export const AMERICAS_FUTURE_POLITIES = [
  {
    polityId: 1300,
    tag: "NFD",
    historicalName: "Dominion of Newfoundland",
    commonName: "Newfoundland",
    kind: "state",
    status: "dominion",
    activeFrom: "1900-01-01",
    activeTo: "1949-03-31",
    capitalName: "St. John's",
    flagKey: null,
    selectable1900: false,
    confidence: "high",
    notes:
      "A self-governing Dominion including Labrador on 1 January 1900. Absent from the M11c selectable catalog, so it is registered as a non-selectable 1900 polity; it joined Canada on 31 March 1949.",
  },
  {
    polityId: 1301,
    tag: "PAN",
    historicalName: "Republic of Panama",
    commonName: "Panama",
    status: "independent",
    activeFrom: "1903-11-03",
    activeTo: null,
    capitalName: "Panama City",
    flagKey: null,
    confidence: "high",
    notes:
      "Separated from Colombia on 3 November 1903. The Panama provinces are permanently separate from the Colombian departments, so the separation is an ordinary transfer.",
  },
  {
    polityId: 1302,
    tag: "JAM",
    historicalName: "Jamaica",
    commonName: "Jamaica",
    status: "independent",
    activeFrom: "1962-08-06",
    activeTo: null,
    capitalName: "Kingston",
    flagKey: null,
    confidence: "high",
    notes: "Independent from the United Kingdom on 6 August 1962.",
  },
  {
    polityId: 1303,
    tag: "TTO",
    historicalName: "Trinidad and Tobago",
    commonName: "Trinidad and Tobago",
    status: "independent",
    activeFrom: "1962-08-31",
    activeTo: null,
    capitalName: "Port of Spain",
    flagKey: null,
    confidence: "high",
    notes:
      "Independent from the United Kingdom on 31 August 1962. Trinidad and Tobago are separate permanent provinces.",
  },
  {
    polityId: 1304,
    tag: "BRB",
    historicalName: "Barbados",
    commonName: "Barbados",
    status: "independent",
    activeFrom: "1966-11-30",
    activeTo: null,
    capitalName: "Bridgetown",
    flagKey: null,
    confidence: "high",
    notes: "Independent from the United Kingdom on 30 November 1966.",
  },
  {
    polityId: 1305,
    tag: "GUY",
    historicalName: "Guyana",
    commonName: "Guyana",
    status: "independent",
    activeFrom: "1966-05-26",
    activeTo: null,
    capitalName: "Georgetown",
    flagKey: null,
    confidence: "high",
    notes:
      "The former British Guiana became independent on 26 May 1966. Its Essequibo, Demerara and Berbice provinces are separate permanent units.",
  },
  {
    polityId: 1306,
    tag: "BHS",
    historicalName: "Commonwealth of the Bahamas",
    commonName: "The Bahamas",
    status: "independent",
    activeFrom: "1973-07-10",
    activeTo: null,
    capitalName: "Nassau",
    flagKey: null,
    confidence: "high",
    notes: "Independent from the United Kingdom on 10 July 1973.",
  },
  {
    polityId: 1307,
    tag: "GRD",
    historicalName: "Grenada",
    commonName: "Grenada",
    status: "independent",
    activeFrom: "1974-02-07",
    activeTo: null,
    capitalName: "St. George's",
    flagKey: null,
    confidence: "high",
    notes:
      "Independent from the United Kingdom on 7 February 1974. Carriacou and Petite Martinique remain a separate province with Grenada.",
  },
  {
    polityId: 1308,
    tag: "SUR",
    historicalName: "Republic of Suriname",
    commonName: "Suriname",
    status: "independent",
    activeFrom: "1975-11-25",
    activeTo: null,
    capitalName: "Paramaribo",
    flagKey: null,
    confidence: "high",
    notes:
      "The former Dutch Guiana became independent on 25 November 1975. Its districts are separate permanent provinces owned by the Netherlands in 1900.",
  },
  {
    polityId: 1309,
    tag: "DMA",
    historicalName: "Commonwealth of Dominica",
    commonName: "Dominica",
    status: "independent",
    activeFrom: "1978-11-03",
    activeTo: null,
    capitalName: "Roseau",
    flagKey: null,
    confidence: "high",
    notes: "Independent from the United Kingdom on 3 November 1978.",
  },
  {
    polityId: 1310,
    tag: "LCA",
    historicalName: "Saint Lucia",
    commonName: "Saint Lucia",
    status: "independent",
    activeFrom: "1979-02-22",
    activeTo: null,
    capitalName: "Castries",
    flagKey: null,
    confidence: "high",
    notes: "Independent from the United Kingdom on 22 February 1979.",
  },
  {
    polityId: 1311,
    tag: "VCT",
    historicalName: "Saint Vincent and the Grenadines",
    commonName: "Saint Vincent and the Grenadines",
    status: "independent",
    activeFrom: "1979-10-27",
    activeTo: null,
    capitalName: "Kingstown",
    flagKey: null,
    confidence: "high",
    notes:
      "Independent from the United Kingdom on 27 October 1979. Saint Vincent and the Grenadines are separate permanent provinces.",
  },
  {
    polityId: 1312,
    tag: "ATG",
    historicalName: "Antigua and Barbuda",
    commonName: "Antigua and Barbuda",
    status: "independent",
    activeFrom: "1981-11-01",
    activeTo: null,
    capitalName: "St. John's",
    flagKey: null,
    confidence: "high",
    notes:
      "Independent from the United Kingdom on 1 November 1981. Antigua and Barbuda are separate permanent provinces; Anguilla remains a separate British territory.",
  },
  {
    polityId: 1313,
    tag: "BLZ",
    historicalName: "Belize",
    commonName: "Belize",
    status: "independent",
    activeFrom: "1981-09-21",
    activeTo: null,
    capitalName: "Belmopan",
    flagKey: null,
    confidence: "high",
    notes:
      "The former British Honduras became independent on 21 September 1981. The Guatemala/Belize frontier is a province seam so the derived border is drawable.",
  },
  {
    polityId: 1314,
    tag: "KNA",
    historicalName: "Saint Kitts and Nevis",
    commonName: "Saint Kitts and Nevis",
    status: "independent",
    activeFrom: "1983-09-19",
    activeTo: null,
    capitalName: "Basseterre",
    flagKey: null,
    confidence: "high",
    notes:
      "Independent from the United Kingdom on 19 September 1983. Saint Kitts and Nevis are separate permanent provinces; Anguilla is a separate British territory.",
  },
  {
    polityId: 1315,
    tag: "ANT",
    historicalName: "Netherlands Antilles",
    commonName: "Netherlands Antilles",
    status: "autonomous-province",
    activeFrom: "1954-12-15",
    activeTo: null,
    capitalName: "Willemstad",
    flagKey: null,
    confidence: "medium",
    notes:
      "The Dutch Caribbean became a constituent country of the Kingdom of the Netherlands on 15 December 1954. Registered so the 1954 status change is representable; the islands remain NLD-owned in 1900.",
  },
  {
    polityId: 1316,
    tag: "ARU",
    historicalName: "Aruba",
    commonName: "Aruba",
    status: "autonomous-province",
    activeFrom: "1986-01-01",
    activeTo: null,
    capitalName: "Oranjestad",
    flagKey: null,
    confidence: "medium",
    notes:
      "Aruba became a separate constituent country of the Kingdom of the Netherlands on 1 January 1986; it is a separate permanent province.",
  },

  // ---- Historical and breakaway polities -----------------------------------
  //
  // Registry-only entries. A pre-1900 state cannot use its real activation date
  // inside the 1900-2000 campaign calendar, so activeFrom/activeTo are clamped to
  // the campaign start (or to the real end where it falls inside the window). The
  // real dates are recorded in notes. A historical entry owns nothing in 1900, is
  // never selectable, and exists so an alternate-history or breakaway scenario can
  // transfer permanent provinces to it.
  {
    polityId: 1317,
    tag: "TEX",
    historicalName: "Republic of Texas",
    commonName: "Texas",
    kind: "historical",
    status: "independent",
    activeFrom: "1900-01-01",
    activeTo: "1900-01-01",
    capitalName: "Austin",
    flagKey: null,
    selectable1900: false,
    confidence: "high",
    notes:
      "Real existence 2 March 1836 - 19 February 1845, before the simulated calendar. Registry activation is clamped to 1900-01-01 so an alternate-history or breakaway scenario can transfer Texas provinces to it; it owns nothing in 1900 and is never selectable.",
  },
  {
    polityId: 1318,
    tag: "RGR",
    historicalName: "Riograndense Republic",
    commonName: "Riograndense Republic",
    kind: "historical",
    status: "independent",
    activeFrom: "1900-01-01",
    activeTo: "1900-01-01",
    capitalName: "Piratini",
    flagKey: null,
    selectable1900: false,
    confidence: "medium",
    notes:
      "The Republic of Piratini (Riograndense Republic) existed 11 September 1836 - 1 March 1845, before the simulated calendar. Registry activation is clamped to 1900-01-01; it owns nothing in 1900 and is never selectable.",
  },
  {
    polityId: 1319,
    tag: "JUL",
    historicalName: "Juliana Republic",
    commonName: "Juliana Republic",
    kind: "historical",
    status: "independent",
    activeFrom: "1900-01-01",
    activeTo: "1900-01-01",
    capitalName: "Laguna",
    flagKey: null,
    selectable1900: false,
    confidence: "medium",
    notes:
      "The Juliana Republic (Santa Catarina) existed 24 July - 15 November 1839, before the simulated calendar. Registry activation is clamped to 1900-01-01; it owns nothing in 1900 and is never selectable.",
  },
  {
    polityId: 1320,
    tag: "RRG",
    historicalName: "Republic of the Rio Grande",
    commonName: "Rio Grande Republic",
    kind: "historical",
    status: "independent",
    activeFrom: "1900-01-01",
    activeTo: "1900-01-01",
    capitalName: "Laredo",
    flagKey: null,
    selectable1900: false,
    confidence: "medium",
    notes:
      "The Republic of the Rio Grande existed 17 January - 6 November 1840, before the simulated calendar. Registry activation is clamped to 1900-01-01; it owns nothing in 1900 and is never selectable.",
  },
  {
    polityId: 1321,
    tag: "YUC",
    historicalName: "Republic of Yucatán",
    commonName: "Yucatán",
    kind: "historical",
    status: "independent",
    activeFrom: "1900-01-01",
    activeTo: "1900-01-01",
    capitalName: "Mérida",
    flagKey: null,
    selectable1900: false,
    confidence: "medium",
    notes:
      "The Republic of Yucatán declared independence in 1841 and rejoined Mexico in 1848, before the simulated calendar. Registry activation is clamped to 1900-01-01; it owns nothing in 1900 and is never selectable.",
  },
  {
    polityId: 1322,
    tag: "CAL",
    historicalName: "California Republic",
    commonName: "California",
    kind: "historical",
    status: "independent",
    activeFrom: "1900-01-01",
    activeTo: "1900-01-01",
    capitalName: "Sonoma",
    flagKey: null,
    selectable1900: false,
    confidence: "high",
    notes:
      "The California Republic existed 14 June - 9 July 1846, before the simulated calendar. Registry activation is clamped to 1900-01-01; it owns nothing in 1900 and is never selectable.",
  },
  {
    polityId: 1323,
    tag: "DES",
    historicalName: "State of Deseret",
    commonName: "Deseret",
    kind: "historical",
    status: "independent",
    activeFrom: "1900-01-01",
    activeTo: "1900-01-01",
    capitalName: "Salt Lake City",
    flagKey: null,
    selectable1900: false,
    confidence: "low",
    notes:
      "The provisional State of Deseret existed 1849-1850, before the simulated calendar; it was never recognized as a sovereign state. Registry activation is clamped to 1900-01-01; it owns nothing in 1900 and is never selectable.",
  },
  {
    polityId: 1324,
    tag: "CSA",
    historicalName: "Confederate States of America",
    commonName: "Confederate States",
    kind: "historical",
    status: "independent",
    activeFrom: "1900-01-01",
    activeTo: "1900-01-01",
    capitalName: "Richmond",
    flagKey: null,
    selectable1900: false,
    confidence: "high",
    notes:
      "The Confederate States of America existed 8 February 1861 - 5 May 1865, before the simulated calendar. Registry activation is clamped to 1900-01-01; it owns nothing in 1900 and is never selectable.",
  },
  {
    polityId: 1325,
    tag: "HAW",
    historicalName: "Republic of Hawaii",
    commonName: "Hawaii",
    kind: "historical",
    status: "independent",
    activeFrom: "1900-01-01",
    activeTo: "1900-01-01",
    capitalName: "Honolulu",
    flagKey: null,
    selectable1900: false,
    confidence: "high",
    notes:
      "The Republic of Hawaii existed 4 July 1894 - 12 August 1898, before the simulated calendar; it was annexed by the United States in 1898. Registry activation is clamped to 1900-01-01; it owns nothing in 1900 and is never selectable.",
  },
  {
    polityId: 1326,
    tag: "ACR",
    historicalName: "Republic of Acre",
    commonName: "Acre",
    kind: "historical",
    status: "independent",
    activeFrom: "1900-01-01",
    activeTo: "1903-11-17",
    capitalName: "Porto Acre",
    flagKey: null,
    selectable1900: false,
    confidence: "medium",
    notes:
      "The Acre breakaway was proclaimed on 14 July 1899, before the simulated calendar; the start is clamped to 1900-01-01 and the end is the 17 November 1903 Treaty of Petrópolis transfer to Brazil. Registered so the Acre episode can be represented; it owns nothing in 1900 and is never selectable.",
  },
  {
    polityId: 1327,
    tag: "AIA",
    historicalName: "Republic of Anguilla",
    commonName: "Anguilla",
    kind: "historical",
    status: "independent",
    activeFrom: "1967-07-12",
    activeTo: "1969-03-19",
    capitalName: "The Valley",
    flagKey: null,
    selectable1900: false,
    confidence: "medium",
    notes:
      "Anguilla unilaterally declared independence on 12 July 1967 and returned to British administration on 19 March 1969. Registered so the breakaway episode is representable; the permanent Anguilla province is GBR-owned in 1900.",
  },
  {
    polityId: 1328,
    tag: "WIF",
    historicalName: "West Indies Federation",
    commonName: "West Indies Federation",
    kind: "historical",
    status: "dominion",
    activeFrom: "1958-01-03",
    activeTo: "1962-05-31",
    capitalName: "Port of Spain",
    flagKey: null,
    selectable1900: false,
    confidence: "high",
    notes:
      "A federation of British Crown colonies, 3 January 1958 - 31 May 1962. It never held sovereign ownership of the islands, but it is registered as a historical entry so a scenario can represent the federation episode as an ownership layer; the constituent islands are permanent provinces.",
  },
  {
    polityId: 1329,
    tag: "CNU",
    historicalName: "Republic of Counani",
    commonName: "Counani",
    kind: "historical",
    status: "independent",
    activeFrom: "1900-01-01",
    activeTo: "1900-01-01",
    capitalName: "Counani",
    flagKey: null,
    selectable1900: false,
    confidence: "low",
    notes:
      "A semihistorical republic in the contested Brazil/France Guiana borderland, declared in 1886, suppressed in 1891, and revived in 1904. Registry activation is clamped to 1900-01-01; it owns nothing in 1900 and is never selectable.",
  },
  {
    polityId: 1330,
    tag: "WFL",
    historicalName: "Republic of West Florida",
    commonName: "West Florida",
    kind: "historical",
    status: "independent",
    activeFrom: "1900-01-01",
    activeTo: "1900-01-01",
    capitalName: "Pensacola",
    flagKey: null,
    selectable1900: false,
    confidence: "medium",
    notes:
      "The Republic of West Florida existed 23 September - 10 December 1810, before the simulated calendar. Registry activation is clamped to 1900-01-01; it owns nothing in 1900 and is never selectable.",
  },
  {
    polityId: 1331,
    tag: "FLR",
    historicalName: "Republic of the Floridas",
    commonName: "The Floridas",
    kind: "historical",
    status: "independent",
    activeFrom: "1900-01-01",
    activeTo: "1900-01-01",
    capitalName: "Fernandina",
    flagKey: null,
    selectable1900: false,
    confidence: "low",
    notes:
      "Gregor MacGregor's short-lived Republic of the Floridas was proclaimed in 1817, before the simulated calendar. Registry activation is clamped to 1900-01-01; it owns nothing in 1900 and is never selectable.",
  },
  {
    polityId: 1332,
    tag: "INS",
    historicalName: "Republic of Indian Stream",
    commonName: "Indian Stream",
    kind: "historical",
    status: "independent",
    activeFrom: "1900-01-01",
    activeTo: "1900-01-01",
    capitalName: "Indian Stream",
    flagKey: null,
    selectable1900: false,
    confidence: "low",
    notes:
      "The Republic of Indian Stream existed 1832-1835 in the disputed New Hampshire/Canada borderland, before the simulated calendar. Registry activation is clamped to 1900-01-01; it owns nothing in 1900 and is never selectable.",
  },
  {
    polityId: 1333,
    tag: "MDW",
    historicalName: "Republic of Madawaska",
    commonName: "Madawaska",
    kind: "historical",
    status: "independent",
    activeFrom: "1900-01-01",
    activeTo: "1900-01-01",
    capitalName: "Madawaska",
    flagKey: null,
    selectable1900: false,
    confidence: "low",
    notes:
      "The semihistorical Republic of Madawaska was declared in 1827 in the disputed Maine/New Brunswick borderland, before the simulated calendar. Registry activation is clamped to 1900-01-01; it owns nothing in 1900 and is never selectable.",
  },
  {
    polityId: 1334,
    tag: "RCN",
    historicalName: "Republic of Canada",
    commonName: "Republic of Canada",
    kind: "historical",
    status: "independent",
    activeFrom: "1900-01-01",
    activeTo: "1900-01-01",
    capitalName: "Toronto",
    flagKey: null,
    selectable1900: false,
    confidence: "low",
    notes:
      "The short-lived Republic of Canada was proclaimed during the 1837-1838 Upper Canada rebellion, before the simulated calendar. Registry activation is clamped to 1900-01-01; it owns nothing in 1900 and is never selectable.",
  },
  {
    polityId: 1335,
    tag: "RLC",
    historicalName: "Republic of Lower Canada",
    commonName: "Lower Canada",
    kind: "historical",
    status: "independent",
    activeFrom: "1900-01-01",
    activeTo: "1900-01-01",
    capitalName: "Montreal",
    flagKey: null,
    selectable1900: false,
    confidence: "low",
    notes:
      "The Republic of Lower Canada was proclaimed during the 1837-1838 Lower Canada rebellion, before the simulated calendar. Registry activation is clamped to 1900-01-01; it owns nothing in 1900 and is never selectable.",
  },
  {
    polityId: 1336,
    tag: "SON",
    historicalName: "Republic of Sonora",
    commonName: "Sonora",
    kind: "historical",
    status: "independent",
    activeFrom: "1900-01-01",
    activeTo: "1900-01-01",
    capitalName: "La Paz",
    flagKey: null,
    selectable1900: false,
    confidence: "low",
    notes:
      "William Walker's filibuster Republic of Sonora existed 1853-1854, before the simulated calendar. Registry activation is clamped to 1900-01-01; it owns nothing in 1900 and is never selectable.",
  },
  {
    polityId: 1337,
    tag: "LBC",
    historicalName: "Republic of Lower California",
    commonName: "Lower California",
    kind: "historical",
    status: "independent",
    activeFrom: "1900-01-01",
    activeTo: "1900-01-01",
    capitalName: "Ensenada",
    flagKey: null,
    selectable1900: false,
    confidence: "low",
    notes:
      "William Walker's filibuster Republic of Lower California existed 1853-1854, before the simulated calendar. Registry activation is clamped to 1900-01-01; it owns nothing in 1900 and is never selectable.",
  },
  {
    polityId: 1338,
    tag: "EQT",
    historicalName: "Republic of the Equator",
    commonName: "Republic of the Equator",
    kind: "historical",
    status: "independent",
    activeFrom: "1900-01-01",
    activeTo: "1900-01-01",
    capitalName: "Belém",
    flagKey: null,
    selectable1900: false,
    confidence: "low",
    notes:
      "The Republic of the Equator was a short-lived 1837-1839 breakaway in northern Brazil, before the simulated calendar. Registry activation is clamped to 1900-01-01; it owns nothing in 1900 and is never selectable.",
  },
  {
    polityId: 1339,
    tag: "BAH",
    historicalName: "Republic of Bahia",
    commonName: "Bahia",
    kind: "historical",
    status: "independent",
    activeFrom: "1900-01-01",
    activeTo: "1900-01-01",
    capitalName: "Salvador",
    flagKey: null,
    selectable1900: false,
    confidence: "low",
    notes:
      "The Sabinada Republic of Bahia existed 1837-1838, before the simulated calendar. Registry activation is clamped to 1900-01-01; it owns nothing in 1900 and is never selectable.",
  },
  {
    polityId: 1340,
    tag: "PEM",
    historicalName: "Republic of Pernambuco",
    commonName: "Pernambuco",
    kind: "historical",
    status: "independent",
    activeFrom: "1900-01-01",
    activeTo: "1900-01-01",
    capitalName: "Recife",
    flagKey: null,
    selectable1900: false,
    confidence: "low",
    notes:
      "The 1817 and 1824 Pernambuco republics predate the simulated calendar. Registry activation is clamped to 1900-01-01; it owns nothing in 1900 and is never selectable.",
  },
  {
    polityId: 1341,
    tag: "GCO",
    historicalName: "Gran Colombia",
    commonName: "Gran Colombia",
    kind: "historical",
    status: "independent",
    activeFrom: "1900-01-01",
    activeTo: "1900-01-01",
    capitalName: "Bogotá",
    flagKey: null,
    selectable1900: false,
    confidence: "medium",
    notes:
      "Gran Colombia existed 1819-1831, before the simulated calendar. It is registered as a historical predecessor union so an alternate-history scenario can restore it; it owns nothing in 1900 and is never selectable.",
  },
  {
    polityId: 1342,
    tag: "UPR",
    historicalName: "United Provinces of the Río de la Plata",
    commonName: "United Provinces",
    kind: "historical",
    status: "independent",
    activeFrom: "1900-01-01",
    activeTo: "1900-01-01",
    capitalName: "Buenos Aires",
    flagKey: null,
    selectable1900: false,
    confidence: "medium",
    notes:
      "The United Provinces of the Río de la Plata existed 1810-1831, before the simulated calendar. It is registered as a historical predecessor union; it owns nothing in 1900 and is never selectable.",
  },
  {
    polityId: 1343,
    tag: "ACF",
    historicalName: "Argentine Confederation",
    commonName: "Argentine Confederation",
    kind: "historical",
    status: "independent",
    activeFrom: "1900-01-01",
    activeTo: "1900-01-01",
    capitalName: "Paraná",
    flagKey: null,
    selectable1900: false,
    confidence: "medium",
    notes:
      "The Argentine Confederation existed 1831-1861, before the simulated calendar. It is registered as a historical predecessor union; it owns nothing in 1900 and is never selectable.",
  },
  {
    polityId: 1344,
    tag: "SBA",
    historicalName: "State of Buenos Aires",
    commonName: "Buenos Aires State",
    kind: "historical",
    status: "independent",
    activeFrom: "1900-01-01",
    activeTo: "1900-01-01",
    capitalName: "Buenos Aires",
    flagKey: null,
    selectable1900: false,
    confidence: "medium",
    notes:
      "The State of Buenos Aires existed 1852-1861, before the simulated calendar. It is registered as a historical breakaway; it owns nothing in 1900 and is never selectable.",
  },
  {
    polityId: 1345,
    tag: "PBC",
    historicalName: "Peru-Bolivian Confederation",
    commonName: "Peru-Bolivian Confederation",
    kind: "historical",
    status: "independent",
    activeFrom: "1900-01-01",
    activeTo: "1900-01-01",
    capitalName: "Tacna",
    flagKey: null,
    selectable1900: false,
    confidence: "medium",
    notes:
      "The Peru-Bolivian Confederation existed 1836-1839, before the simulated calendar. It is registered as a historical predecessor union; it owns nothing in 1900 and is never selectable.",
  },
  {
    polityId: 1346,
    tag: "ERY",
    historicalName: "Republic of Entre Ríos",
    commonName: "Entre Ríos",
    kind: "historical",
    status: "independent",
    activeFrom: "1900-01-01",
    activeTo: "1900-01-01",
    capitalName: "Concepción del Uruguay",
    flagKey: null,
    selectable1900: false,
    confidence: "low",
    notes:
      "The Republic of Entre Ríos existed 1820-1821, before the simulated calendar. Registry activation is clamped to 1900-01-01; it owns nothing in 1900 and is never selectable.",
  },
];

/**
 * Polity id for each 1900 owner tag. NFD is the one registry-owned 1900 polity;
 * all other owners are 1900 catalog countries.
 */
const OWNER_ID = {
  USA: 0,
  GBR: 1,
  FRA: 3,
  NLD: 9,
  DNK: 14,
  MEX: 38,
  GUA: 39,
  HON: 40,
  SAL: 41,
  NIC: 42,
  COS: 43,
  COL: 44,
  VEN: 45,
  ECU: 46,
  PRU: 47,
  BOL: 48,
  CHL: 49,
  ARG: 50,
  URY: 51,
  PRY: 52,
  BRA: 53,
  HTI: 54,
  DOM: 55,
  CAN: 56,
  CUB: 59,
  NFD: 1300,
};

/**
 * Simulation-region id for each 1900 map feature.
 *
 * French Guiana has no separate simulation region in the M11 scenario; its
 * population is part of the French home aggregate (region 3), so the province
 * metadata records the difference.
 */
const REGION_ID = {
  USA: 0,
  CAN: 56,
  NFD: 120,
  MEX: 38,
  GUA: 39,
  HON: 40,
  SAL: 41,
  NIC: 42,
  COS: 43,
  COL: 44,
  VEN: 45,
  ECU: 46,
  PRU: 47,
  BOL: 48,
  CHL: 49,
  ARG: 50,
  URY: 51,
  PRY: 52,
  BRA: 53,
  HTI: 54,
  DOM: 55,
  CUB: 59,
  PRI: 151,
  BWI: 108,
  BSA: 109,
  FCA: 128,
  DGC: 147,
  DWI: 157,
  SUR: 146,
  GRL: 155,
  FRA: 3,
};

/** Admin-1 countries that the Americas plan is expected to consume. */
export const AMERICAS_COUNTRIES = new Set([
  "USA", "CAN", "MEX", "GTM", "BLZ", "HND", "SLV", "NIC", "CRI", "PAN",
  "COL", "VEN", "ECU", "PER", "BOL", "CHL", "ARG", "URY", "PRY", "BRA",
  "HTI", "DOM", "CUB", "PRI", "JAM", "TTO", "BRB", "BHS", "BMU", "LCA",
  "VCT", "GRD", "DMA", "ATG", "KNA", "VGB", "VIR", "CYM", "TCA", "MSR",
  "AIA", "ABW", "CUW", "SXM", "SUR", "GUY", "GRL", "FLK", "SGS", "BLM",
  "MAF", "SPM",
]);

/** Map features inside the Americas work package. */
export const AMERICAS_TAGS = new Set([
  "USA", "CAN", "NFD", "MEX", "GUA", "HON", "SAL", "NIC", "COS", "COL",
  "VEN", "ECU", "PRU", "BOL", "CHL", "ARG", "URY", "PRY", "BRA", "HTI",
  "DOM", "CUB", "PRI", "BWI", "BSA", "FCA", "DGC", "DWI", "SUR", "GRL",
  "FRA",
]);

function slug(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

/**
 * Build the complete Americas province plan.
 *
 * @param {readonly {code: string, name: string, nameLocal: string, country: string,
 *   region: string, type: string, lat: number, lon: number,
 *   polities?: readonly string[], label?: readonly number[]}[]} units
 */
export function buildAmericasProvincePlan(units) {
  const byCode = new Map(units.map((unit) => [unit.code, unit]));
  const byCountry = new Map();
  for (const unit of units) {
    if (!byCountry.has(unit.country)) byCountry.set(unit.country, []);
    byCountry.get(unit.country).push(unit.code);
  }
  const provinces = [];
  const claimedByTag = new Map();
  const missingCodes = new Set();
  const duplicateKeys = new Set();
  const duplicateClaims = [];
  const claimedElsewhere = [];
  const keys = new Set();
  const usedCodes = new Set();

  function claimsFor(mapTag) {
    if (!claimedByTag.has(mapTag)) claimedByTag.set(mapTag, new Set());
    return claimedByTag.get(mapTag);
  }

  function claim(mapTag, code) {
    const claims = claimsFor(mapTag);
    if (claims.has(code)) return false;
    claims.add(code);
    return true;
  }

  /** Every admin-1 code of a modern country, whether or not the label is in a feature. */
  function allCodes(country) {
    return (byCountry.get(country) ?? []).slice().sort();
  }

  function codes(country, exclude = []) {
    const skip = new Set(exclude);
    return allCodes(country).filter((code) => !skip.has(code));
  }

  /** Units of one modern country whose label point falls inside the map feature. */
  function codesIn(mapTag, country) {
    return units
      .filter(
        (unit) =>
          unit.country === country &&
          (unit.polities ?? []).includes(mapTag) &&
          !usedCodes.has(unit.code),
      )
      .map((unit) => unit.code)
      .sort();
  }

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
    codes: requestedCodes = [],
    claimOnly = [],
    clip = null,
    exclude = null,
    sources = ["natural-earth-10m-admin1", "project-authored-1900", "project-authored-m12"],
  }) {
    if (!key.startsWith("am-")) throw new Error(`Americas province key must start with am-: ${key}`);
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
    for (const code of [...new Set(requestedCodes)]) {
      if (!byCode.has(code)) {
        missingCodes.add(code);
        continue;
      }
      if (usedCodes.has(code)) {
        duplicateClaims.push(`${key}:${code}`);
        continue;
      }
      const unit = byCode.get(code);
      if (unit.polities !== undefined && !unit.polities.includes(mapTag)) {
        claimedElsewhere.push(`${key}:${code}(${unit.polities.join("+")})`);
      }
      if (!claim(mapTag, code)) {
        duplicateClaims.push(`${key}:${code}`);
        continue;
      }
      resolved.push(code);
      usedCodes.add(code);
    }
    for (const code of claimOnly) {
      if (!byCode.has(code)) {
        missingCodes.add(code);
        continue;
      }
      // Metadata-only claim: the province geometry comes from the whole 1900 map
      // polygon (an island whose admin-1 block is degenerate or outside the
      // authored 1900 outline), but the unit must still be consumed so the plan
      // audit does not report a false gap.
      claim(mapTag, code);
      usedCodes.add(code);
    }
    if (resolved.length === 0 && clip === null) {
      throw new Error(`Americas province ${key} has no geometry source`);
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
    });
  }

  function addGroup({
    mapTag,
    ownerTag,
    grouping,
    affiliation,
    confidence,
    notes,
    name,
    codes: groupCodes,
    key,
    special,
    aliases,
    sources,
  }) {
    add({
      key,
      name,
      mapTag,
      ownerTag,
      grouping,
      affiliation,
      confidence,
      notes,
      codes: groupCodes,
      special,
      aliases,
      sources,
    });
  }

  function addGroups(mapTag, ownerTag, grouping, affiliation, confidence, notes, groups) {
    for (const [name, groupCodes, overrides = {}] of groups) {
      add({
        key: overrides.key ?? `am-${mapTag.toLowerCase()}-${slug(name)}`,
        name,
        mapTag,
        ownerTag,
        grouping: overrides.grouping ?? grouping,
        affiliation: overrides.affiliation ?? affiliation,
        confidence: overrides.confidence ?? confidence,
        notes: overrides.notes ?? notes,
        codes: groupCodes,
        special: overrides.special,
        aliases: overrides.aliases,
        sources: overrides.sources,
      });
    }
  }

  /**
   * Add one province per modern first-level unit of a country.
   *
   * `unitCodes` should normally be the complete country list (including units
   * whose label point lies just outside the 1900 polygon) so no geometry block is
   * silently dropped; the build clips each province to its 1900 feature anyway.
   */
  function addUnitProvinces({
    mapTag,
    ownerTag,
    country,
    prefix,
    grouping,
    affiliation,
    confidence = "medium",
    notes,
    unitCodes = null,
    skip = [],
    overrides = {},
  }) {
    const skipSet = new Set(skip);
    const list = (unitCodes ?? allCodes(country)).filter((code) => !skipSet.has(code));
    for (const code of list) {
      const unit = byCode.get(code);
      if (unit === undefined) {
        missingCodes.add(code);
        continue;
      }
      const override = overrides[code] ?? {};
      const name = override.name ?? unit.name;
      const key =
        override.key ??
        `${prefix}${slug(unit.name)}${keys.has(`${prefix}${slug(unit.name)}`) ? `-${slug(code)}` : ""}`;
      add({
        key,
        name,
        mapTag,
        ownerTag,
        grouping: override.grouping ?? grouping,
        affiliation: override.affiliation ?? affiliation,
        confidence: override.confidence ?? confidence,
        notes: override.notes ?? notes,
        special: override.special ?? "ordinary",
        codes: [code],
        clip: override.clip ?? null,
        exclude: override.exclude ?? null,
        aliases: override.aliases,
        sources: override.sources,
      });
    }
  }

  /**
   * Attach metadata/geometry codes to an already-authored province.
   *
   * Used for a modern unit whose admin-1 geometry lies outside the authored 1900
   * polygon (San Andrés, Carriacou): the unit is consumed so the plan is complete,
   * but it cannot form a drawable province on its own. The build clips the union
   * to the 1900 feature, so the attached sliver contributes no foreign geometry.
   */
  function attachCodes(mapTag, targetKey, codesToAttach) {
    const target = provinces.find((province) => province.key === targetKey);
    if (target === undefined) throw new Error(`unknown target province ${targetKey}`);
    for (const code of codesToAttach) {
      if (!byCode.has(code)) {
        missingCodes.add(code);
        continue;
      }
      if (usedCodes.has(code)) {
        duplicateClaims.push(`${targetKey}:${code}`);
        continue;
      }
      if (!claim(mapTag, code)) {
        duplicateClaims.push(`${targetKey}:${code}`);
        continue;
      }
      usedCodes.add(code);
      target.units.push(code);
    }
    target.units.sort();
  }

  const box = (west, south, east, north) => [
    [west, south],
    [east, south],
    [east, north],
    [west, north],
  ];

  // ---------------------------------------------------------------------------
  // United States
  // ---------------------------------------------------------------------------
  addUnitProvinces({
    mapTag: "USA",
    ownerTag: "USA",
    country: "USA",
    prefix: "am-usa-",
    grouping: "United States of America",
    affiliation: "U.S. state",
    confidence: "high",
    notes:
      "A 1900 U.S. state or territory. Oklahoma combines Oklahoma Territory and Indian Territory (statehood 1907); Arizona and New Mexico are territories until 1912; Alaska is a district and Hawaii an annexed territory.",
    overrides: {
      "US-OK": {
        key: "am-usa-oklahoma-territory-and-indian-territory",
        name: "Oklahoma Territory and Indian Territory",
        grouping: "Oklahoma and Indian Territory",
        affiliation: "U.S. territory",
        notes:
          "Oklahoma Territory and Indian Territory were separate 1900 territories; they were combined into the State of Oklahoma in 1907. The modern state outline is the permanent province.",
      },
      "US-AZ": {
        key: "am-usa-arizona-territory",
        name: "Arizona Territory",
        affiliation: "U.S. territory",
        notes: "Arizona was a U.S. territory on 1 January 1900 and became a state in 1912.",
      },
      "US-NM": {
        key: "am-usa-new-mexico-territory",
        name: "New Mexico Territory",
        affiliation: "U.S. territory",
        notes: "New Mexico was a U.S. territory on 1 January 1900 and became a state in 1912.",
      },
      "US-AK": {
        name: "Alaska",
        affiliation: "U.S. district",
        notes:
          "Purchased from Russia in 1867 and administered as the District of Alaska in 1900; a territory from 1912 and a state in 1959.",
      },
      "US-HI": {
        name: "Hawaii",
        affiliation: "U.S. annexed territory",
        notes:
          "Annexed by the United States in 1898 and organized as the Territory of Hawaii in 1900; a state in 1959.",
      },
      "US-DC": {
        name: "District of Columbia",
        affiliation: "U.S. federal district",
        notes: "The federal district was separate from Maryland in 1900.",
      },
    },
  });

  // ---------------------------------------------------------------------------
  // Canada, Newfoundland and Labrador
  // ---------------------------------------------------------------------------
  addGroups(
    "CAN",
    "CAN",
    "Dominion of Canada",
    "Canadian province or territory",
    "high",
    "A 1900 province or territory of the Dominion of Canada. Alberta and Saskatchewan were districts of the Northwest Territories until 1905; Nunavut was part of the Northwest Territories until 1999.",
    [
      ["Ontario", ["CA-ON"]],
      ["Quebec", ["CA-QC"]],
      ["Nova Scotia", ["CA-NS"]],
      ["New Brunswick", ["CA-NB"]],
      ["Manitoba", ["CA-MB"]],
      ["British Columbia", ["CA-BC"]],
      ["Prince Edward Island", ["CA-PE"]],
      ["Yukon", ["CA-YT"]],
      [
        "Northwest Territories",
        ["CA-NT", "CA-NU"],
        {
          confidence: "medium",
          notes:
            "The 1900 Northwest Territories included the modern Northwest Territories and Nunavut (created 1999). It is one permanent province.",
        },
      ],
      [
        "Alberta District",
        ["CA-AB"],
        {
          confidence: "medium",
          notes:
            "Alberta was the southern district of the Northwest Territories in 1900 and became a province in 1905. The modern provincial outline is the permanent province.",
        },
      ],
      [
        "Saskatchewan District",
        ["CA-SK"],
        {
          confidence: "medium",
          notes:
            "Saskatchewan was the central district of the Northwest Territories in 1900 and became a province in 1905. The modern provincial outline is the permanent province.",
        },
      ],
    ],
  );
  add({
    key: "am-nfd-newfoundland-and-labrador",
    name: "Newfoundland and Labrador",
    display: "Newfoundland and Labrador",
    mapTag: "NFD",
    ownerTag: "NFD",
    grouping: "Dominion of Newfoundland",
    affiliation: "Dominion of Newfoundland",
    confidence: "high",
    notes:
      "The Dominion of Newfoundland, including Labrador, was a separate self-governing polity on 1 January 1900. It joined Canada on 31 March 1949; the province is permanent so the union is an ordinary ownership transfer. The modern Newfoundland and Labrador admin-1 unit supplies the geometry, clipped to the authored M11c NFD polygon.",
    codes: ["CA-NL"],
  });

  // ---------------------------------------------------------------------------
  // Mexico
  // ---------------------------------------------------------------------------
  addUnitProvinces({
    mapTag: "MEX",
    ownerTag: "MEX",
    country: "MEX",
    prefix: "am-mex-",
    grouping: "United Mexican States",
    affiliation: "Mexican state or territory",
    confidence: "medium",
    notes:
      "A Porfiriato state or territory. Modern first-level units are used as proxies; Baja California is one 1900 territory and the Federal District is a separate 1900 unit.",
    skip: ["MX-X01~"],
    overrides: {
      "MX-BCN": {
        key: "am-mex-baja-california",
        name: "Baja California",
        affiliation: "Mexican federal territory",
        confidence: "high",
        notes:
          "Baja California was a single federal territory in 1900; it was divided into Norte and Sur in 1931. The two modern units are grouped into the permanent 1900 province.",
      },
      "MX-BCS": {
        key: "am-mex-baja-california-sur-part",
        name: "Baja California Sur",
        affiliation: "Mexican federal territory",
        confidence: "low",
        notes: "Placeholder companion of the grouped Baja California province; merged below.",
      },
      "MX-DIF": {
        name: "Distrito Federal",
        affiliation: "Mexican federal district",
        confidence: "high",
        notes: "The Federal District of Mexico in 1900.",
      },
      "MX-ROO": {
        name: "Quintana Roo",
        affiliation: "Mexican federal territory",
        confidence: "medium",
        notes:
          "Quintana Roo was a federal territory in 1900 (created 1902 from Yucatán); the modern state outline is the permanent province.",
      },
      "MX-YUC": {
        name: "Yucatán",
        affiliation: "Mexican state",
        confidence: "high",
        notes: "Yucatán was a state of the Porfiriato; Quintana Roo is separate.",
      },
    },
  });
  // Baja California Sur was authored as a second unit above only so the modern
  // geometry is not dropped. Merge it into the single 1900 Baja California
  // province by moving its code into the BCN province before the plan is frozen.
  {
    const bcn = provinces.find((province) => province.key === "am-mex-baja-california");
    const bcs = provinces.find(
      (province) => province.key === "am-mex-baja-california-sur-part",
    );
    if (bcn !== undefined && bcs !== undefined) {
      bcn.units.push(...bcs.units);
      bcn.units.sort();
      const index = provinces.indexOf(bcs);
      if (index >= 0) provinces.splice(index, 1);
      keys.delete(bcs.key);
    }
  }

  // ---------------------------------------------------------------------------
  // Central America
  // ---------------------------------------------------------------------------
  addUnitProvinces({
    mapTag: "GUA",
    ownerTag: "GUA",
    country: "GTM",
    prefix: "am-gua-",
    grouping: "Republic of Guatemala",
    affiliation: "Guatemalan department",
    confidence: "medium",
    notes:
      "A Guatemalan department in 1900, using the modern department outline as a proxy. Petén and Izabal form the frontier with British Honduras.",
  });
  addUnitProvinces({
    mapTag: "HON",
    ownerTag: "HON",
    country: "HND",
    prefix: "am-hon-",
    grouping: "Republic of Honduras",
    affiliation: "Honduran department",
    confidence: "medium",
    notes:
      "A Honduran department in 1900, using the modern department outline as a proxy. The Bay Islands are a separate department.",
  });
  addUnitProvinces({
    mapTag: "SAL",
    ownerTag: "SAL",
    country: "SLV",
    prefix: "am-sal-",
    grouping: "Republic of El Salvador",
    affiliation: "Salvadoran department",
    confidence: "medium",
    notes: "A Salvadoran department in 1900, using the modern department outline as a proxy.",
  });
  addUnitProvinces({
    mapTag: "NIC",
    ownerTag: "NIC",
    country: "NIC",
    prefix: "am-nic-",
    grouping: "Republic of Nicaragua",
    affiliation: "Nicaraguan department",
    confidence: "medium",
    notes:
      "A Nicaraguan department in 1900, using the modern department outline as a proxy. The Mosquito Coast departments were incorporated in 1894.",
  });
  addUnitProvinces({
    mapTag: "COS",
    ownerTag: "COS",
    country: "CRI",
    prefix: "am-cos-",
    grouping: "Republic of Costa Rica",
    affiliation: "Costa Rican province",
    confidence: "medium",
    notes: "A Costa Rican province in 1900, using the modern province outline as a proxy.",
  });

  // British Honduras (Belize): a separate BWI feature ring and a separate
  // colony, split into its 1900 districts.
  addGroups(
    "BWI",
    "GBR",
    "British Honduras",
    "British colonial district",
    "medium",
    "The 1900 districts of British Honduras (Belize). Separate permanent provinces so the 1981 independence of Belize is an ordinary transfer.",
    [
      ["Belize District", ["BZ-BZ"], { key: "am-bwi-blz-belize" }],
      ["Cayo", ["BZ-CY"], { key: "am-bwi-blz-cayo" }],
      ["Corozal", ["BZ-CZL"], { key: "am-bwi-blz-corozal" }],
      ["Orange Walk", ["BZ-OW"], { key: "am-bwi-blz-orange-walk" }],
      ["Stann Creek", ["BZ-SC"], { key: "am-bwi-blz-stann-creek" }],
      ["Toledo", ["BZ-TOL"], { key: "am-bwi-blz-toledo" }],
    ],
  );

  // Panama: part of Colombia in 1900, permanently separate provinces so the 1903
  // separation is an ordinary transfer. The modern Panamanian units are grouped
  // into the seven 1900 provinces.
  addGroups(
    "COL",
    "COL",
    "Panama",
    "Colombian department",
    "medium",
    "Panama was a department of Colombia in 1900. Its permanent provinces are separate from the Colombian departments so the 1903 separation is an ordinary transfer; the Panama Canal Zone is not a separate province (see D-106).",
    [
      ["Panama", ["PA-8"], { key: "am-pan-panama" }],
      ["Colón", ["PA-3"], { key: "am-pan-colon" }],
      [
        "Chiriquí and Bocas del Toro",
        ["PA-4", "PA-1"],
        { key: "am-pan-chiriqui-and-bocas-del-toro" },
      ],
      [
        "Veraguas, Herrera and Los Santos",
        ["PA-9", "PA-6", "PA-7"],
        { key: "am-pan-veraguas-and-azero" },
      ],
      ["Coclé", ["PA-2"], { key: "am-pan-cocle" }],
      [
        "Darién and the Comarcas",
        ["PA-5", "PA-EM", "PA-KY", "PA-NB"],
        { key: "am-pan-darien-and-the-comarcas", confidence: "medium" },
      ],
    ],
  );

  // ---------------------------------------------------------------------------
  // Colombia (mainland)
  // ---------------------------------------------------------------------------
  addUnitProvinces({
    mapTag: "COL",
    ownerTag: "COL",
    country: "COL",
    prefix: "am-col-",
    grouping: "Republic of Colombia",
    affiliation: "Colombian department",
    confidence: "medium",
    notes:
      "A Colombian department in 1900, using the modern department outline as a proxy. Panama is a separate province group; San Andrés and Providencia are attached to the Bolívar province because the M11c 1900 Colombian polygon does not expose the island.",
    skip: ["CO-X01~", "CO-SAP"],
    overrides: {
      "CO-CUN": {
        name: "Cundinamarca and Bogotá",
        notes:
          "The Natural Earth layer carries Bogotá and Cundinamarca under the same code; they are one 1900 province grouping.",
      },
    },
  });
  attachCodes("COL", "am-col-bolivar", ["CO-SAP"]);

  // ---------------------------------------------------------------------------
  // Venezuela
  // ---------------------------------------------------------------------------
  addUnitProvinces({
    mapTag: "VEN",
    ownerTag: "VEN",
    country: "VEN",
    prefix: "am-ven-",
    grouping: "United States of Venezuela",
    affiliation: "Venezuelan state or territory",
    confidence: "medium",
    notes:
      "A Venezuelan state or territory in 1900, using the modern first-level unit as a proxy. Nueva Esparta and the Federal Dependencies are islands and are explicit provinces.",
    skip: ["VE-X01~"],
    overrides: {
      "VE-O": {
        name: "Nueva Esparta",
        notes: "The island state of Margarita, Cubagua and Coche.",
      },
      "VE-W": {
        name: "Federal Dependencies",
        notes: "The Venezuelan Caribbean island dependencies.",
      },
    },
  });

  // ---------------------------------------------------------------------------
  // Ecuador (including the Galápagos)
  // ---------------------------------------------------------------------------
  addUnitProvinces({
    mapTag: "ECU",
    ownerTag: "ECU",
    country: "ECU",
    prefix: "am-ecu-",
    grouping: "Republic of Ecuador",
    affiliation: "Ecuadorian province",
    confidence: "medium",
    notes:
      "An Ecuadorian province in 1900, using the modern province outline as a proxy. The Galápagos are a separate province.",
    overrides: {
      "EC-W": {
        name: "Galápagos",
        affiliation: "Ecuadorian island territory",
        notes:
          "The Galápagos were annexed by Ecuador in 1832 and administered as a territory; they are a permanent province.",
      },
    },
  });

  // ---------------------------------------------------------------------------
  // Peru (Tacna is Chilean-occupied in 1900 and a separate province)
  // ---------------------------------------------------------------------------
  addUnitProvinces({
    mapTag: "PRU",
    ownerTag: "PRU",
    country: "PER",
    prefix: "am-pru-",
    grouping: "Republic of Peru",
    affiliation: "Peruvian department",
    confidence: "medium",
    notes:
      "A Peruvian department in 1900, using the modern department outline as a proxy. Tacna is a separate province under Chilean occupation until 1929.",
    skip: ["PE-TAC"],
    overrides: {
      "PE-LIM": {
        name: "Lima and Callao",
        notes:
          "The Natural Earth layer carries Lima and Lima Province under the same code; they are one province grouping.",
      },
    },
  });

  // ---------------------------------------------------------------------------
  // Bolivia (Acre is Bolivian in 1900)
  // ---------------------------------------------------------------------------
  addUnitProvinces({
    mapTag: "BOL",
    ownerTag: "BOL",
    country: "BOL",
    prefix: "am-bol-",
    grouping: "Republic of Bolivia",
    affiliation: "Bolivian department",
    confidence: "medium",
    notes:
      "A Bolivian department in 1900, using the modern department outline as a proxy.",
  });
  add({
    key: "am-bol-acre",
    name: "Acre",
    mapTag: "BOL",
    ownerTag: "BOL",
    grouping: "Republic of Bolivia",
    affiliation: "Bolivian territory",
    confidence: "medium",
    notes:
      "Acre was Bolivian in 1900 and was annexed by Brazil in 1903. It is a separate permanent province with the modern Acre unit as geometry, so the transfer is an ordinary ownership change.",
    codes: ["BR-AC"],
  });

  // ---------------------------------------------------------------------------
  // Chile (including Tacna, occupied until 1929)
  // ---------------------------------------------------------------------------
  addUnitProvinces({
    mapTag: "CHL",
    ownerTag: "CHL",
    country: "CHL",
    prefix: "am-chl-",
    grouping: "Republic of Chile",
    affiliation: "Chilean province",
    confidence: "medium",
    notes:
      "A Chilean province in 1900, using the modern region as a proxy. Magallanes is the southern province; Tacna is a separate occupied province.",
    overrides: {
      "CL-MA": {
        key: "am-chl-magallanes",
        name: "Magallanes",
        notes:
          "Magallanes and the Chilean Antarctic; the modern region outline is the permanent province. Its label point falls outside the authored M11c polygon, so the unit is claimed explicitly and clipped to the 1900 feature.",
      },
    },
  });
  add({
    key: "am-chl-tacna",
    name: "Tacna",
    mapTag: "CHL",
    ownerTag: "CHL",
    grouping: "Republic of Chile",
    affiliation: "Chilean-occupied Peruvian province",
    confidence: "medium",
    notes:
      "Tacna was under Chilean military occupation from 1880 and was returned to Peru in 1929. It is a separate permanent province created from the modern Tacna unit, clipped to the 1900 Chilean feature, so the 1929 return is an ordinary transfer.",
    codes: ["PE-TAC"],
    special: "occupied",
  });

  // ---------------------------------------------------------------------------
  // Argentina, Uruguay and Paraguay
  // ---------------------------------------------------------------------------
  addUnitProvinces({
    mapTag: "ARG",
    ownerTag: "ARG",
    country: "ARG",
    prefix: "am-arg-",
    grouping: "Argentine Republic",
    affiliation: "Argentine province or national territory",
    confidence: "medium",
    notes:
      "An Argentine province or national territory in 1900, using the modern province outline as a proxy. The Falkland Islands claim is not a province here; it is representable through the claims system.",
    overrides: {
      "AR-C": {
        name: "Buenos Aires (Federal Capital)",
        affiliation: "Argentine federal district",
        notes: "The Federal Capital was separate from Buenos Aires province in 1900.",
      },
      "AR-V": {
        name: "Tierra del Fuego",
        affiliation: "Argentine national territory",
        notes: "Tierra del Fuego was a national territory in 1900.",
      },
    },
  });
  addUnitProvinces({
    mapTag: "URY",
    ownerTag: "URY",
    country: "URY",
    prefix: "am-ury-",
    grouping: "Oriental Republic of Uruguay",
    affiliation: "Uruguayan department",
    confidence: "medium",
    notes: "A Uruguayan department in 1900, using the modern department outline as a proxy.",
  });
  addUnitProvinces({
    mapTag: "PRY",
    ownerTag: "PRY",
    country: "PRY",
    prefix: "am-pry-",
    grouping: "Republic of Paraguay",
    affiliation: "Paraguayan department",
    confidence: "medium",
    notes:
      "A Paraguayan department in 1900, using the modern department outline as a proxy. The Chaco departments are grouped only by the modern units.",
  });

  // ---------------------------------------------------------------------------
  // Brazil: the 1900 states, without the modern Federal District
  // ---------------------------------------------------------------------------
  // Roraima and Rondônia were parts of Amazonas; Amapá was part of Pará; Tocantins
  // was part of Goiás; Mato Grosso do Sul was part of Mato Grosso; Acre was
  // Bolivian. The modern Federal District was carved from Goiás in 1960, so it is
  // part of the Goiás province and is not a separate 1900 province.
  addGroups(
    "BRA",
    "BRA",
    "United States of Brazil",
    "Brazilian state",
    "medium",
    "A 1900 Brazilian state. The modern Federal District is included in Goiás; the territories that became states later are included in their 1900 parents; Acre is a separate Bolivian province until 1903.",
    [
      [
        "Amazonas",
        ["BR-AM", "BR-RR", "BR-RO"],
        {
          notes:
            "Amazonas in 1900 included the modern Roraima and Rondônia territories; they are one permanent province.",
        },
      ],
      ["Pará", ["BR-PA", "BR-AP"], { notes: "Pará included the modern Amapá territory in 1900." }],
      ["Maranhão", ["BR-MA"]],
      ["Piauí", ["BR-PI"]],
      ["Ceará", ["BR-CE"]],
      ["Rio Grande do Norte", ["BR-RN"]],
      ["Paraíba", ["BR-PB"]],
      ["Pernambuco", ["BR-PE"]],
      ["Alagoas", ["BR-AL"]],
      ["Sergipe", ["BR-SE"]],
      ["Bahia", ["BR-BA"]],
      ["Espírito Santo", ["BR-ES"]],
      ["Rio de Janeiro", ["BR-RJ"]],
      ["São Paulo", ["BR-SP"]],
      ["Minas Gerais", ["BR-MG"]],
      [
        "Goiás",
        ["BR-GO", "BR-DF", "BR-TO"],
        {
          notes:
            "Goiás in 1900 included the modern Tocantins territory and the area of the 1960 Federal District. The modern Federal District is not a separate 1900 province.",
        },
      ],
      [
        "Mato Grosso",
        ["BR-MT", "BR-MS"],
        { notes: "Mato Grosso included the modern Mato Grosso do Sul until 1977." },
      ],
      ["Paraná", ["BR-PR"]],
      ["Santa Catarina", ["BR-SC"]],
      ["Rio Grande do Sul", ["BR-RS"]],
    ],
  );

  // ---------------------------------------------------------------------------
  // The Guianas
  // ---------------------------------------------------------------------------
  addGroups(
    "BWI",
    "GBR",
    "British Guiana",
    "British colonial county",
    "medium",
    "The three counties of British Guiana in 1900. They are separate permanent provinces so the 1966 independence of Guyana is an ordinary transfer.",
    [
      [
        "Essequibo",
        ["GY-BA", "GY-CU", "GY-PT", "GY-UT"],
        { key: "am-bwi-guy-essequibo" },
      ],
      [
        "Demerara",
        ["GY-DE", "GY-MA", "GY-ES", "GY-UD", "GY-PM"],
        { key: "am-bwi-guy-demerara" },
      ],
      ["Berbice", ["GY-EB"], { key: "am-bwi-guy-berbice" }],
    ],
  );
  addGroups(
    "SUR",
    "NLD",
    "Dutch Guiana (Suriname)",
    "Dutch colonial district",
    "medium",
    "The districts of Dutch Guiana in 1900, grouped into four permanent provinces. The 1975 independence of Suriname is an ordinary transfer.",
    [
      [
        "Paramaribo and the coastal districts",
        ["SR-PM", "SR-WA", "SR-CM", "SR-SA", "SR-CR"],
        { key: "am-sur-paramaribo-and-the-coast" },
      ],
      ["Nickerie", ["SR-NI"], { key: "am-sur-nickerie" }],
      [
        "Suriname (interior)",
        ["SR-SI", "SR-BR", "SR-PR"],
        { key: "am-sur-suriname-interior", confidence: "low" },
      ],
      ["Marowijne", ["SR-MA"], { key: "am-sur-marowijne" }],
    ],
  );
  add({
    key: "am-fra-french-guiana",
    name: "French Guiana",
    mapTag: "FRA",
    ownerTag: "FRA",
    grouping: "French Guiana",
    affiliation: "French colony",
    confidence: "high",
    notes:
      "French Guiana was a French colony in 1900 and remains French. The modern FR-GF unit supplies the geometry clipped to the authored M11c French feature; the simulation region is the French home aggregate because no separate Guiana region exists.",
    codes: ["FR-GF"],
  });

  // ---------------------------------------------------------------------------
  // The Caribbean: Cuba, Haiti and the Dominican Republic
  // ---------------------------------------------------------------------------
  addGroups(
    "CUB",
    "USA",
    "Cuba",
    "United States military occupation",
    "medium",
    "Cuba was under United States military occupation in 1900. The six 1900 provinces and the Isle of Pines are permanent provinces owned by the United States until the 1902 transfer to the Republic of Cuba.",
    [
      ["Pinar del Río", ["CU-01"], { key: "am-cub-pinar-del-rio" }],
      [
        "La Habana",
        ["CU-03", "CU-15", "CU-16"],
        { key: "am-cub-la-habana", notes: "La Habana province included the modern Artemisa and Mayabeque." },
      ],
      ["Matanzas", ["CU-04"], { key: "am-cub-matanzas" }],
      [
        "Santa Clara",
        ["CU-05", "CU-06", "CU-07"],
        { key: "am-cub-santa-clara", notes: "Santa Clara included the modern Cienfuegos and Sancti Spíritus." },
      ],
      [
        "Camagüey",
        ["CU-09", "CU-08", "CU-10"],
        { key: "am-cub-camaguey", notes: "Camagüey included the modern Ciego de Ávila and Las Tunas." },
      ],
      [
        "Oriente",
        ["CU-11", "CU-12", "CU-13", "CU-14"],
        { key: "am-cub-oriente", notes: "Oriente included the modern Holguín, Granma, Santiago de Cuba and Guantánamo." },
      ],
      [
        "Isle of Pines",
        ["CU-99"],
        { key: "am-cub-isle-of-pines", notes: "The Isle of Pines (Isla de la Juventud) was a separate 1900 municipality." },
      ],
    ],
  );
  addUnitProvinces({
    mapTag: "HTI",
    ownerTag: "HTI",
    country: "HTI",
    prefix: "am-hti-",
    grouping: "Republic of Haiti",
    affiliation: "Haitian department",
    confidence: "medium",
    notes: "A Haitian department in 1900, using the modern department outline as a proxy.",
  });
  addGroups(
    "DOM",
    "DOM",
    "Dominican Republic",
    "Dominican province grouping",
    "low",
    "The Dominican Republic had six provinces in 1900; the modern provinces are grouped into five permanent provinces for a stable, drawable partition.",
    [
      [
        "Santo Domingo",
        ["DO-01", "DO-32", "DO-29", "DO-21", "DO-17", "DO-31"],
        { key: "am-dom-santo-domingo" },
      ],
      [
        "Santiago",
        ["DO-25", "DO-27", "DO-15", "DO-05", "DO-26", "DO-18", "DO-09"],
        { key: "am-dom-santiago" },
      ],
      [
        "La Vega",
        ["DO-13", "DO-28", "DO-24", "DO-06", "DO-19", "DO-20", "DO-14"],
        { key: "am-dom-la-vega" },
      ],
      [
        "Azua",
        ["DO-02", "DO-22", "DO-07", "DO-10", "DO-03", "DO-04", "DO-16"],
        { key: "am-dom-azua" },
      ],
      [
        "El Seibo",
        ["DO-08", "DO-30", "DO-11", "DO-12", "DO-23"],
        { key: "am-dom-el-seibo" },
      ],
    ],
  );

  // ---------------------------------------------------------------------------
  // The British Caribbean
  // ---------------------------------------------------------------------------
  addGroups(
    "BWI",
    "GBR",
    "Jamaica",
    "British colonial county",
    "medium",
    "The three counties of Jamaica in 1900. Jamaica became independent in 1962; the counties are permanent provinces.",
    [
      [
        "Cornwall County",
        ["JM-09", "JM-10", "JM-11", "JM-08", "JM-07"],
        { key: "am-bwi-jam-cornwall" },
      ],
      [
        "Middlesex County",
        ["JM-13", "JM-12", "JM-06", "JM-14", "JM-05"],
        { key: "am-bwi-jam-middlesex" },
      ],
      [
        "Surrey County",
        ["JM-01", "JM-02", "JM-03", "JM-04"],
        { key: "am-bwi-jam-surrey" },
      ],
    ],
  );
  addGroups(
    "BWI",
    "GBR",
    "Trinidad and Tobago",
    "British colonial island",
    "medium",
    "Trinidad and Tobago were a single British colony in 1900; the two islands are separate permanent provinces so the 1962 independence is an ordinary transfer.",
    [
      [
        "Trinidad",
        [
          "TT-ARI", "TT-CHA", "TT-CTT", "TT-DMN", "TT-PED", "TT-POS", "TT-PRT",
          "TT-PTF", "TT-RCM", "TT-SFO", "TT-SGE", "TT-SIP", "TT-SJL", "TT-TUP",
        ],
        { key: "am-bwi-tto-trinidad" },
      ],
      ["Tobago", ["TT-ETO", "TT-WTO"], { key: "am-bwi-tto-tobago" }],
    ],
  );
  addGroup({
    key: "am-bwi-brb-barbados",
    name: "Barbados",
    mapTag: "BWI",
    ownerTag: "GBR",
    grouping: "Barbados",
    affiliation: "British colony",
    confidence: "high",
    notes:
      "Barbados was a British colony in 1900 and became independent in 1966. The modern parish units are one permanent province.",
    codes: codes("BRB"),
  });
  addGroups(
    "BWI",
    "GBR",
    "The Bahamas",
    "British colonial district grouping",
    "medium",
    "The Bahamas were a British colony in 1900 and became independent in 1973. New Providence, Grand Bahama and the Out Islands are separate permanent provinces.",
    [
      ["New Providence", ["BS-X01~"], { key: "am-bwi-bhs-new-providence" }],
      [
        "Grand Bahama",
        ["BS-FP", "BS-WG", "BS-EG"],
        { key: "am-bwi-bhs-grand-bahama" },
      ],
      [
        "The Out Islands",
        codes("BHS", ["BS-X01~", "BS-FP", "BS-WG", "BS-EG"]),
        { key: "am-bwi-bhs-out-islands", confidence: "low" },
      ],
    ],
  );
  addGroup({
    key: "am-bwi-bmu-bermuda",
    name: "Bermuda",
    mapTag: "BWI",
    ownerTag: "GBR",
    grouping: "Bermuda",
    affiliation: "British colony",
    confidence: "high",
    notes:
      "Bermuda was a British colony in 1900 and remains a British Overseas Territory. The modern parishes are one permanent province.",
    codes: codes("BMU"),
  });
  addGroup({
    key: "am-bwi-tca-turks-and-caicos",
    name: "Turks and Caicos Islands",
    mapTag: "BWI",
    ownerTag: "GBR",
    grouping: "Turks and Caicos Islands",
    affiliation: "British colony",
    confidence: "medium",
    notes:
      "The Turks and Caicos Islands were administered with Jamaica in 1900 and remain a British Overseas Territory. The modern districts are one permanent province.",
    codes: codes("TCA"),
  });
  addGroup({
    key: "am-bwi-cym-cayman-islands",
    name: "Cayman Islands",
    mapTag: "BWI",
    ownerTag: "GBR",
    grouping: "Cayman Islands",
    affiliation: "British colony",
    confidence: "medium",
    notes:
      "The Cayman Islands were a dependency of Jamaica in 1900 and remain a British Overseas Territory. They are one permanent province.",
    codes: codes("CYM"),
  });
  addGroup({
    key: "am-bwi-vgb-british-virgin-islands",
    name: "British Virgin Islands",
    mapTag: "BWI",
    ownerTag: "GBR",
    grouping: "British Virgin Islands",
    affiliation: "British colony",
    confidence: "medium",
    notes:
      "The British Virgin Islands were part of the Leeward Islands colony in 1900 and remain a British Overseas Territory. They are one permanent province.",
    codes: codes("VGB"),
  });
  addGroup({
    key: "am-bwi-aia-anguilla",
    name: "Anguilla",
    mapTag: "BWI",
    ownerTag: "GBR",
    grouping: "Anguilla",
    affiliation: "British colony",
    confidence: "medium",
    notes:
      "Anguilla was administered with Saint Kitts and Nevis in 1900. It is a separate permanent province because it remained a British territory when Saint Kitts and Nevis became independent in 1983.",
    codes: codes("AIA"),
  });
  addGroups(
    "BWI",
    "GBR",
    "Antigua and Barbuda",
    "British colony",
    "medium",
    "Antigua and Barbuda were a single British colony in 1900. The two islands are separate permanent provinces so the 1981 independence is an ordinary transfer; Redonda is grouped with Antigua.",
    [
      [
        "Antigua",
        codes("ATG", ["AG-10"]),
        { key: "am-bwi-atg-antigua" },
      ],
      ["Barbuda", ["AG-10"], { key: "am-bwi-atg-barbuda" }],
    ],
  );
  addGroups(
    "BWI",
    "GBR",
    "Saint Kitts and Nevis",
    "British colony",
    "medium",
    "Saint Kitts and Nevis were a single British colony in 1900. The two islands are separate permanent provinces so the 1983 independence is an ordinary transfer; Anguilla is a separate territory.",
    [
      [
        "Saint Kitts",
        ["KN-01", "KN-02", "KN-03", "KN-06", "KN-08", "KN-09", "KN-11", "KN-13", "KN-14"],
        { key: "am-bwi-kna-saint-kitts" },
      ],
      [
        "Nevis",
        ["KN-04", "KN-05", "KN-07", "KN-10", "KN-12"],
        { key: "am-bwi-kna-nevis" },
      ],
    ],
  );
  addGroup({
    key: "am-bwi-msr-montserrat",
    name: "Montserrat",
    mapTag: "BWI",
    ownerTag: "GBR",
    grouping: "Montserrat",
    affiliation: "British colony",
    confidence: "medium",
    notes:
      "Montserrat was part of the Leeward Islands colony in 1900 and remains a British Overseas Territory. It is one permanent province.",
    codes: codes("MSR"),
  });
  addGroup({
    key: "am-bwi-dma-dominica",
    name: "Dominica",
    mapTag: "BWI",
    ownerTag: "GBR",
    grouping: "Dominica",
    affiliation: "British colony",
    confidence: "high",
    notes:
      "Dominica was a British colony in 1900 and became independent in 1978. It is one permanent province.",
    codes: codes("DMA"),
  });
  addGroup({
    key: "am-bwi-lca-saint-lucia",
    name: "Saint Lucia",
    mapTag: "BWI",
    ownerTag: "GBR",
    grouping: "Saint Lucia",
    affiliation: "British colony",
    confidence: "high",
    notes:
      "Saint Lucia was a British colony in 1900 and became independent in 1979. It is one permanent province.",
    codes: codes("LCA"),
  });
  addGroups(
    "BWI",
    "GBR",
    "Saint Vincent and the Grenadines",
    "British colony",
    "medium",
    "Saint Vincent and the Grenadines were a single British colony in 1900. The main island and the Grenadines are separate permanent provinces so the 1979 independence is an ordinary transfer.",
    [
      [
        "Saint Vincent",
        ["VC-01", "VC-02", "VC-03", "VC-04", "VC-05"],
        { key: "am-bwi-vct-saint-vincent" },
      ],
      ["The Grenadines", ["VC-06"], { key: "am-bwi-vct-grenadines" }],
    ],
  );
  addGroup({
    key: "am-bwi-grd-grenada",
    name: "Grenada",
    mapTag: "BWI",
    ownerTag: "GBR",
    grouping: "Grenada",
    affiliation: "British colony",
    confidence: "medium",
    notes:
      "Grenada was a British colony in 1900 and became independent in 1974. Carriacou and Petite Martinique are grouped with Grenada because the authored M11c BWI polygon does not expose the dependency as a separate ring; the modern dependency unit is consumed but contributes no drawable area.",
    codes: ["GD-01", "GD-02", "GD-03", "GD-04", "GD-05", "GD-06", "GD-10"],
  });

  // ---------------------------------------------------------------------------
  // The French Caribbean, the Dutch Caribbean and the Danish West Indies
  // ---------------------------------------------------------------------------
  addGroups(
    "FCA",
    "FRA",
    "French Caribbean",
    "French colony",
    "high",
    "The French Antilles and Saint-Pierre-et-Miquelon were French colonies in 1900. Each island is a separate permanent province so a later status change is representable. Guadeloupe and Martinique are in the shared French feature and are added below.",
    [
      ["Saint-Martin", ["MF-X00~"], { key: "am-fca-saint-martin" }],
      ["Saint-Barthélemy", ["BL-X00~"], { key: "am-fca-saint-barthelemy" }],
      ["Saint-Pierre", ["PM-X01~"], { key: "am-fca-saint-pierre" }],
      ["Miquelon", ["PM-X02~"], { key: "am-fca-miquelon" }],
    ],
  );
  add({
    key: "am-fca-guadeloupe-basse-terre",
    name: "Guadeloupe (Basse-Terre)",
    mapTag: "FRA",
    ownerTag: "FRA",
    grouping: "French Caribbean",
    affiliation: "French colony",
    confidence: "high",
    notes:
      "Basse-Terre, the western island of Guadeloupe, was part of the French colony in 1900. The M11c French feature ring is clipped to the island's coastline; the box is only an audit boundary.",
    codes: [],
    clip: [{ polygon: box(-61.85, 15.9, -61.5, 16.4) }],
  });
  add({
    key: "am-fca-guadeloupe-grande-terre",
    name: "Guadeloupe (Grande-Terre)",
    mapTag: "FRA",
    ownerTag: "FRA",
    grouping: "French Caribbean",
    affiliation: "French colony",
    confidence: "high",
    notes:
      "Grande-Terre and its dependencies were part of the French colony of Guadeloupe in 1900. The M11c French feature ring is clipped to the island's coastline.",
    codes: [],
    clip: [{ polygon: box(-61.6, 16.15, -61.1, 16.55) }],
  });
  add({
    key: "am-fca-marie-galante",
    name: "Marie-Galante",
    mapTag: "FRA",
    ownerTag: "FRA",
    grouping: "French Caribbean",
    affiliation: "French colony",
    confidence: "medium",
    notes:
      "Marie-Galante was a dependency of Guadeloupe in 1900. It is a separate permanent province so a later status change is representable.",
    codes: [],
    clip: [{ polygon: box(-61.35, 15.82, -61.15, 16.05) }],
  });
  add({
    key: "am-fca-martinique",
    name: "Martinique",
    mapTag: "FRA",
    ownerTag: "FRA",
    grouping: "French Caribbean",
    affiliation: "French colony",
    confidence: "high",
    notes:
      "Martinique was a French colony in 1900 and a department from 1946. The M11c French feature ring is clipped to the island's coastline.",
    codes: [],
    clip: [{ polygon: box(-61.3, 14.35, -60.8, 14.95) }],
  });
  addGroups(
    "DGC",
    "NLD",
    "Dutch Caribbean",
    "Dutch colonial territory",
    "high",
    "The Dutch Caribbean islands were part of the Kingdom of the Netherlands in 1900. Aruba, Curaçao and Sint Maarten are separate permanent provinces; Bonaire, Saba and Sint Eustatius are not separately exposed by the M11c map.",
    [
      ["Aruba", ["AW-X01~"], { key: "am-dgc-aruba" }],
      ["Curaçao", ["CW-X01~"], { key: "am-dgc-curacao" }],
    ],
  );
  add({
    key: "am-dgc-sint-maarten",
    name: "Sint Maarten",
    mapTag: "DGC",
    ownerTag: "NLD",
    grouping: "Dutch Caribbean",
    affiliation: "Dutch colonial territory",
    confidence: "low",
    notes:
      "The Dutch half of Saint Martin was part of the Dutch Caribbean in 1900. The admin-1 unit is degenerate at the world-map scale, so the province is built from the authored M11c DGC ring clipped to the island; the unit is consumed for bookkeeping. The French half is a separate FCA province.",
    codes: [],
    claimOnly: ["NL-SX"],
    clip: [{ polygon: box(-63.15, 18.0, -62.98, 18.09) }],
  });
  addGroups(
    "DWI",
    "DNK",
    "Danish West Indies",
    "Danish colonial territory",
    "high",
    "The Danish West Indies were a Danish colony in 1900. Saint Croix, Saint Thomas and Saint John are separate permanent provinces so the 1917 transfer to the United States is an ordinary ownership change.",
    [
      ["Saint Croix", ["VI-X01~"], { key: "am-dwi-saint-croix" }],
      ["Saint Thomas", ["VI-X02~"], { key: "am-dwi-saint-thomas" }],
      ["Saint John", ["VI-X03~"], { key: "am-dwi-saint-john" }],
    ],
  );

  // ---------------------------------------------------------------------------
  // South Atlantic dependencies and Greenland
  // ---------------------------------------------------------------------------
  addGroup({
    key: "am-bsa-falkland-islands",
    name: "Falkland Islands",
    mapTag: "BSA",
    ownerTag: "GBR",
    grouping: "British South Atlantic islands",
    affiliation: "British crown colony",
    confidence: "high",
    notes:
      "The Falkland Islands were a British crown colony in 1900. The Argentine claim is representable through the claims system and is not seeded as a 1900 ownership claim, consistent with the other M12 bundles.",
    codes: ["FK-X01~"],
  });
  addGroup({
    key: "am-bsa-south-georgia",
    name: "South Georgia and the South Sandwich Islands",
    mapTag: "BSA",
    ownerTag: "GBR",
    grouping: "British South Atlantic islands",
    affiliation: "British crown colony",
    confidence: "medium",
    notes:
      "South Georgia was a dependency of the Falkland Islands in 1900; the South Sandwich Islands are grouped with it. The Argentine claim is representable through the claims system.",
    codes: ["GS-X01~"],
  });
  addGroups(
    "GRL",
    "DNK",
    "Greenland",
    "Danish dependency",
    "medium",
    "Greenland was a Danish colony administered as the North and South Greenland inspectorates in 1900. The two inspectorates are separate permanent provinces; the modern municipality units are grouped into them.",
    [
      [
        "North Greenland",
        ["GL-QA", "GL-UO"],
        {
          key: "am-grl-north-greenland",
          confidence: "low",
          notes:
            "North Greenland (Nordgrønland) included the northwest and northeast coasts. The modern Qaasuitsup and Nationalparken/Pituffik units are grouped into it.",
        },
      ],
      [
        "South Greenland",
        ["GL-KU", "GL-QE", "GL-SM"],
        {
          key: "am-grl-south-greenland",
          confidence: "medium",
          notes:
            "South Greenland (Sydgrønland) included the inhabited southwest coast. The modern Kujalleq, Qeqqata and Sermersooq units are grouped into it.",
        },
      ],
    ],
  );

  // ---------------------------------------------------------------------------
  // Puerto Rico
  // ---------------------------------------------------------------------------
  addGroup({
    key: "am-pri-puerto-rico",
    name: "Puerto Rico",
    mapTag: "PRI",
    ownerTag: "USA",
    grouping: "Puerto Rico",
    affiliation: "United States military occupation",
    confidence: "high",
    notes:
      "Puerto Rico was ceded by Spain in 1898 and was under United States military government on 1 January 1900; the Foraker Act followed in April 1900. It is one permanent province owned by the United States.",
    codes: ["US-PR"],
  });

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------
  if (missingCodes.size > 0) {
    throw new Error(
      `Americas province plan references unknown admin-1 codes: ${[...missingCodes].sort().join(", ")}`,
    );
  }
  if (duplicateKeys.size > 0) {
    throw new Error(`Americas province plan has duplicate keys: ${[...duplicateKeys].join(", ")}`);
  }
  if (provinces.length > 2048) {
    throw new Error(`Americas province plan exceeds its 2048-province budget (${provinces.length})`);
  }
  for (const province of provinces) {
    if (province.units.length === 0 && province.clip === null) {
      throw new Error(`Americas province ${province.key} has no geometry source`);
    }
  }

  // Assign stable ids deterministically in authored order, in a block disjoint
  // from every M12a Europe (max 66001), M12b Asia (100001-100239) and M12c
  // Africa (200001-200260) id.
  const seenIds = new Set();
  for (let index = 0; index < provinces.length; index += 1) {
    const id = AMERICAS_PROVINCE_ID_BASE + index + 1;
    if (seenIds.has(id)) throw new Error(`duplicate province id ${id}`);
    seenIds.add(id);
    provinces[index].provinceId = id;
  }

  // Report units whose label point lies in an American 1900 map feature but which
  // no province consumed. This is the primary gap detector for the plan.
  const unassigned = [];
  for (const unit of units) {
    if (!AMERICAS_COUNTRIES.has(unit.country)) continue;
    if (usedCodes.has(unit.code)) continue;
    for (const tag of unit.polities ?? []) {
      if (!AMERICAS_TAGS.has(tag)) continue;
      if (!claimsFor(tag).has(unit.code)) unassigned.push(`${tag}:${unit.code}`);
    }
  }

  return {
    sources: AMERICAS_SOURCES,
    futurePolities: AMERICAS_FUTURE_POLITIES,
    provinces,
    usedCodes: [...usedCodes].sort(),
    unassigned: [...new Set(unassigned)].sort(),
    claimedElsewhere: [...new Set(claimedElsewhere)].sort(),
    duplicateClaims: [...new Set(duplicateClaims)].sort(),
  };
}

export { OWNER_ID, REGION_ID };

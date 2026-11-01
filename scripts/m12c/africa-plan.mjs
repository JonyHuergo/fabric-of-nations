/**
 * Authored M12c African province plan (1 January 1900).
 *
 * This module is data, not simulation logic. It mirrors the M12a European and
 * M12b Asian plans: the 1900 M11c map polity supplies the outer boundary, modern
 * Natural Earth 1:10m admin-1 units are only internal geometry blocks, and each
 * province is a permanent geographical unit with a stable numeric id. Africa ids
 * live in a disjoint block (200001+) and every key is prefixed with `af-`, so
 * they can never collide with a European (66001 and below) or Asian (100001)
 * province.
 *
 * Grouping policy:
 * - British, French, German, Portuguese, Italian, Spanish and Belgian
 *   dependencies follow the colonial administrative scale: a colony or
 *   protectorate is split into its historic provinces/districts, never into
 *   modern sovereign states directly.
 * - Independent African polities (Ethiopia, Liberia, Morocco, the South African
 *   Republic, the Orange Free State, Sokoto, Wadai, Darfur) follow their 1900
 *   provincial/emirate scale.
 * - One 1900 administrative area is represented by more than one permanent
 *   province wherever a later successor frontier runs through it (Sudan/South
 *   Sudan, German East Africa, Kamerun, Togoland, Nigeria, French West and
 *   Equatorial Africa, the Rhodesias, Libya, Morocco, Walvis Bay). The split
 *   lines follow modern first-level units or an authored historical line and are
 *   labelled low or medium confidence.
 * - Island colonies administered from Africa are included when the M11c map
 *   exposes them: Zanzibar, Pemba, Seychelles, Mauritius, Réunion, Mayotte,
 *   Comoros, Cape Verde, São Tomé and Príncipe, St Helena and Ascension.
 */

/** First id of the Africa block. Europe ends at 66001, Asia at 100239. */
export const AFRICA_PROVINCE_ID_BASE = 200000;

/** Historical and geospatial sources referenced by province entries. */
export const AFRICA_SOURCES = [
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
    notes: "Modern country outlines used for coastlines and small-unit clipping.",
  },
  {
    id: "eb1911-africa",
    title: "Encyclopaedia Britannica (1911), 'Africa'",
    url: "https://en.wikisource.org/wiki/1911_Encyclop%C3%A6dia_Britannica/Africa",
    license: "Public domain",
    date: "1911",
    notes:
      "The 1900 political partition of Africa: British, French, German, Portuguese, Italian, Spanish and Belgian possessions and the independent states.",
  },
  {
    id: "eb1911-egypt",
    title: "Encyclopaedia Britannica (1911), 'Egypt'",
    url: "https://en.wikisource.org/wiki/1911_Encyclop%C3%A6dia_Britannica/Egypt",
    license: "Public domain",
    date: "1911",
    notes:
      "The Egyptian mudiriyas and governorates, the British occupation of 1882 and the Anglo-Egyptian condominium of 1899.",
  },
  {
    id: "eb1911-sudan",
    title: "Encyclopaedia Britannica (1911), 'Sudan'",
    url: "https://en.wikisource.org/wiki/1911_Encyclop%C3%A6dia_Britannica/Sudan",
    license: "Public domain",
    date: "1911",
    notes:
      "The Anglo-Egyptian Sudan provinces, the 22nd-parallel frontier with Egypt and the 1899 condominium.",
  },
  {
    id: "eb1911-south-africa",
    title: "Encyclopaedia Britannica (1911), 'South Africa'",
    url: "https://en.wikisource.org/wiki/1911_Encyclop%C3%A6dia_Britannica/South_Africa",
    license: "Public domain",
    date: "1911",
    notes:
      "The Cape Colony, Natal, the South African Republic, the Orange Free State and the High Commission Territories.",
  },
  {
    id: "eb1911-morocco",
    title: "Encyclopaedia Britannica (1911), 'Morocco'",
    url: "https://en.wikisource.org/wiki/1911_Encyclop%C3%A6dia_Britannica/Morocco",
    license: "Public domain",
    date: "1911",
    notes:
      "The pre-protectorate sultanate, the Spanish presidios and the 1904/1912 French and Spanish zones.",
  },
  {
    id: "eb1911-german-africa",
    title: "Encyclopaedia Britannica (1911), German African colonies",
    url: "https://en.wikisource.org/wiki/1911_Encyclop%C3%A6dia_Britannica/German_East_Africa",
    license: "Public domain",
    date: "1911",
    notes:
      "German East Africa, Kamerun and Togoland and their internal administrative districts before the 1919 mandates.",
  },
  {
    id: "eb1911-congo",
    title: "Encyclopaedia Britannica (1911), 'Congo Free State'",
    url: "https://en.wikisource.org/wiki/1911_Encyclop%C3%A6dia_Britannica/Congo_Free_State",
    license: "Public domain",
    date: "1911",
    notes: "The Congo Free State districts and the 1908 annexation as the Belgian Congo.",
  },
  {
    id: "treaty-anglo-egyptian-1899",
    title: "Anglo-Egyptian Condominium Agreement (1899)",
    url: "https://en.wikisource.org/wiki/Anglo-Egyptian_Condominium_Agreement",
    license: "Public domain",
    date: "1899",
    notes: "The legal basis of the Anglo-Egyptian Sudan and its 22nd-parallel northern frontier.",
  },
  {
    id: "treaty-anglo-german-1890",
    title: "Heligoland-Zanzibar Treaty (1890)",
    url: "https://en.wikisource.org/wiki/Heligoland%E2%80%93Zanzibar_Treaty",
    license: "Public domain",
    date: "1890",
    notes:
      "The Anglo-German colonial frontiers in East Africa, South West Africa and Kamerun, and the British protectorate over Zanzibar.",
  },
  {
    id: "treaty-fashoda-1898",
    title: "Fashoda settlement (1898-1899) and the Anglo-French frontier",
    url: "https://en.wikisource.org/wiki/Fashoda_Incident",
    license: "Public domain",
    date: "1899",
    notes: "The Anglo-French frontier between the Sudan and French Equatorial Africa.",
  },
  {
    id: "treaty-versailles-1919",
    title: "Treaty of Versailles (1919), German colonies",
    url: "https://en.wikisource.org/wiki/Treaty_of_Versailles",
    license: "Public domain",
    date: "1919",
    notes: "The renunciation of the German African colonies and the mandate system.",
  },
  {
    id: "treaty-saint-germain-1919",
    title: "Treaty of Saint-Germain (1919), African clauses",
    url: "https://en.wikisource.org/wiki/Treaty_of_Saint-Germain-en-Laye",
    license: "Public domain",
    date: "1919",
    notes: "The partition of German East Africa and the Ruanda-Urundi mandate.",
  },
  {
    id: "treaty-lausanne-1923",
    title: "Treaty of Lausanne (1923), Libyan and Egyptian clauses",
    url: "https://en.wikisource.org/wiki/Treaty_of_Lausanne",
    license: "Public domain",
    date: "1923",
    notes:
      "The Italian acquisition of Libya and the recognition of the British position in Egypt and the Sudan.",
  },
  {
    id: "treaty-anglo-italian-1925",
    title: "Anglo-Italian Convention (1925), Jubaland",
    url: "https://en.wikisource.org/wiki/Anglo-Italian_Convention_of_1925",
    license: "Public domain",
    date: "1925",
    notes: "The cession of Jubaland from British East Africa to Italian Somaliland.",
  },
  {
    id: "treaty-anglo-egyptian-1953",
    title: "Anglo-Egyptian Agreement (1953) and the 1956 independence of the Sudan",
    url: "https://en.wikisource.org/wiki/Anglo-Egyptian_Agreement_of_1953",
    license: "Public domain",
    date: "1953",
    notes: "The transition from the condominium to the independent Republic of the Sudan.",
  },
  {
    id: "oau-1964-cairo",
    title: "Organisation of African Unity, Cairo Resolution (1964)",
    url: "https://en.wikisource.org/wiki/Organisation_of_African_Unity",
    license: "Public domain",
    date: "1964",
    notes:
      "The African successor states' acceptance of the colonial borders at independence; the decolonisation snapshots follow those lines.",
  },
  {
    id: "project-authored-1900",
    title: "Fabric of Nations M11c authored 1900 boundary reconstruction",
    url: "internal:packages/data/data/historical/m11/boundaries_1900.json",
    license: "Project data",
    date: "2026",
    notes: "The M11c world-map bundle supplies every 1900 outer boundary.",
  },
  {
    id: "project-authored-m12",
    title: "Fabric of Nations M12a/M12b/M12c authored provincial partition",
    url: "internal:scripts/m12c/africa-plan.mjs",
    license: "Project data",
    date: "2026",
    notes: "The authored grouping of modern first-level units into historical provinces.",
  },
];

/**
 * Future successor polities that can receive African provinces.
 *
 * Ids 1200-1299 are reserved for Africa and never overlap the M12a Europe range
 * (1000-1016) or the M12b Asia range (1100-1144). None is selectable in 1900.
 * The 1900 polities themselves (Ethiopia, Liberia, Morocco, the South African
 * Republic, the Orange Free State, Sokoto, Wadai, Darfur) are already catalog
 * countries and are not duplicated here.
 */
export const AFRICA_FUTURE_POLITIES = [
  {
    polityId: 1200,
    tag: "EGY",
    historicalName: "Kingdom of Egypt",
    commonName: "Egypt",
    status: "independent",
    activeFrom: "1922-02-28",
    activeTo: null,
    capitalName: "Cairo",
    flagKey: null,
    confidence: "high",
    notes:
      "The 1922 kingdom ended the British protectorate of 1914; the 1953 republic succeeded it. Egypt's provinces are British-administered in 1900.",
  },
  {
    polityId: 1201,
    tag: "SDN",
    historicalName: "Republic of the Sudan",
    commonName: "Sudan",
    status: "independent",
    activeFrom: "1956-01-01",
    activeTo: null,
    capitalName: "Khartoum",
    flagKey: null,
    confidence: "high",
    notes: "Independent on 1 January 1956 after the Anglo-Egyptian condominium.",
  },
  {
    polityId: 1202,
    tag: "SSD",
    historicalName: "Republic of South Sudan",
    commonName: "South Sudan",
    status: "independent",
    activeFrom: "2000-01-01",
    activeTo: null,
    capitalName: "Juba",
    flagKey: null,
    confidence: "medium",
    notes:
      "Historic independence 9 July 2011 lies outside the simulated calendar, which ends on 1 January 2000. The registry activation is therefore clamped to the terminal boundary so the permanently separate southern Sudanese provinces can still be transferred to the South Sudanese polity; see DECISIONS D-105.",
  },
  {
    polityId: 1203,
    tag: "LBY",
    historicalName: "United Kingdom of Libya",
    commonName: "Libya",
    status: "independent",
    activeFrom: "1951-12-24",
    activeTo: null,
    capitalName: "Tripoli",
    flagKey: null,
    confidence: "high",
    notes:
      "The 1951 federal kingdom united Tripolitania, Cyrenaica and Fezzan; the provinces of the three historic regions were Ottoman in 1900.",
  },
  {
    polityId: 1204,
    tag: "TUN",
    historicalName: "Kingdom of Tunisia",
    commonName: "Tunisia",
    status: "independent",
    activeFrom: "1956-03-20",
    activeTo: null,
    capitalName: "Tunis",
    flagKey: null,
    confidence: "high",
    notes: "Independent from the French protectorate in 1956; a republic from 1957.",
  },
  {
    polityId: 1205,
    tag: "DZA",
    historicalName: "People's Democratic Republic of Algeria",
    commonName: "Algeria",
    status: "independent",
    activeFrom: "1962-07-05",
    activeTo: null,
    capitalName: "Algiers",
    flagKey: null,
    confidence: "high",
    notes:
      "Independent in 1962. The Algerian provinces are French departments and territories in 1900.",
  },
  {
    polityId: 1206,
    tag: "ERI",
    historicalName: "State of Eritrea",
    commonName: "Eritrea",
    status: "independent",
    activeFrom: "1993-05-24",
    activeTo: null,
    capitalName: "Asmara",
    flagKey: null,
    confidence: "high",
    notes:
      "The Italian colony of Eritrea, federated with Ethiopia in 1952 and independent in 1993.",
  },
  {
    polityId: 1207,
    tag: "SOM",
    historicalName: "Somali Republic",
    commonName: "Somalia",
    status: "independent",
    activeFrom: "1960-07-01",
    activeTo: null,
    capitalName: "Mogadishu",
    flagKey: null,
    confidence: "high",
    notes:
      "The union of the Trust Territory of Somaliland and the State of Somaliland in 1960; British and Italian Somaliland and Jubaland are separate provinces from 1900.",
  },
  {
    polityId: 1208,
    tag: "SOL",
    historicalName: "State of Somaliland",
    commonName: "Somaliland",
    status: "independent",
    activeFrom: "1991-05-18",
    activeTo: null,
    capitalName: "Hargeisa",
    flagKey: null,
    confidence: "medium",
    notes:
      "The former British Somaliland protectorate declared independence in 1991; its 1960 independence is the same province set.",
  },
  {
    polityId: 1209,
    tag: "KEN",
    historicalName: "Kenya",
    commonName: "Kenya",
    status: "independent",
    activeFrom: "1963-12-12",
    activeTo: null,
    capitalName: "Nairobi",
    flagKey: null,
    confidence: "high",
    notes: "The East Africa Protectorate and Colony of Kenya became independent in 1963.",
  },
  {
    polityId: 1210,
    tag: "UGA",
    historicalName: "Uganda",
    commonName: "Uganda",
    status: "independent",
    activeFrom: "1962-10-09",
    activeTo: null,
    capitalName: "Kampala",
    flagKey: null,
    confidence: "high",
    notes: "The Uganda Protectorate became independent in 1962.",
  },
  {
    polityId: 1211,
    tag: "TZA",
    historicalName: "United Republic of Tanzania",
    commonName: "Tanzania",
    status: "independent",
    activeFrom: "1964-10-29",
    activeTo: null,
    capitalName: "Dodoma",
    flagKey: null,
    confidence: "high",
    notes: "The 1964 union of Tanganyika and Zanzibar.",
  },
  {
    polityId: 1212,
    tag: "TAN",
    historicalName: "Tanganyika",
    commonName: "Tanganyika",
    status: "independent",
    activeFrom: "1961-12-09",
    activeTo: "1964-10-29",
    capitalName: "Dar es Salaam",
    flagKey: null,
    confidence: "high",
    notes:
      "The former German East Africa mainland, a British mandate from 1920 and a trust territory from 1946; independent in 1961 and merged into Tanzania in 1964.",
  },
  {
    polityId: 1213,
    tag: "ZAN",
    historicalName: "Sultanate of Zanzibar",
    commonName: "Zanzibar",
    status: "independent",
    activeFrom: "1963-12-10",
    activeTo: "1964-04-26",
    capitalName: "Zanzibar City",
    flagKey: null,
    confidence: "high",
    notes:
      "A British protectorate in 1900, independent in December 1963 and merged with Tanganyika in April 1964.",
  },
  {
    polityId: 1214,
    tag: "RWA",
    historicalName: "Republic of Rwanda",
    commonName: "Rwanda",
    status: "independent",
    activeFrom: "1962-07-01",
    activeTo: null,
    capitalName: "Kigali",
    flagKey: null,
    confidence: "high",
    notes:
      "The western part of German East Africa, administered by Belgium as Ruanda-Urundi from 1922.",
  },
  {
    polityId: 1215,
    tag: "BDI",
    historicalName: "Kingdom of Burundi",
    commonName: "Burundi",
    status: "independent",
    activeFrom: "1962-07-01",
    activeTo: null,
    capitalName: "Bujumbura",
    flagKey: null,
    confidence: "high",
    notes:
      "The north-western part of German East Africa, administered by Belgium as Ruanda-Urundi from 1922.",
  },
  {
    polityId: 1216,
    tag: "ZMB",
    historicalName: "Republic of Zambia",
    commonName: "Zambia",
    status: "independent",
    activeFrom: "1964-10-24",
    activeTo: null,
    capitalName: "Lusaka",
    flagKey: null,
    confidence: "high",
    notes:
      "Northern Rhodesia, administered by the British South Africa Company until 1924 and independent in 1964.",
  },
  {
    polityId: 1217,
    tag: "ZWE",
    historicalName: "Republic of Zimbabwe",
    commonName: "Zimbabwe",
    status: "independent",
    activeFrom: "1980-04-18",
    activeTo: null,
    capitalName: "Harare",
    flagKey: null,
    confidence: "high",
    notes:
      "Southern Rhodesia, a self-governing colony from 1923 and independent as Zimbabwe in 1980.",
  },
  {
    polityId: 1218,
    tag: "MWI",
    historicalName: "Republic of Malawi",
    commonName: "Malawi",
    status: "independent",
    activeFrom: "1964-07-06",
    activeTo: null,
    capitalName: "Zomba",
    flagKey: null,
    confidence: "high",
    notes: "The Nyasaland Protectorate became independent as Malawi in 1964.",
  },
  {
    polityId: 1219,
    tag: "NAM",
    historicalName: "Republic of Namibia",
    commonName: "Namibia",
    status: "independent",
    activeFrom: "1990-03-21",
    activeTo: null,
    capitalName: "Windhoek",
    flagKey: null,
    confidence: "high",
    notes:
      "German South West Africa, a South African mandate from 1920 and independent in 1990; Walvis Bay is a separate Cape Colony province until its 1910 union transfer.",
  },
  {
    polityId: 1220,
    tag: "ZAF",
    historicalName: "Union of South Africa",
    commonName: "South Africa",
    status: "independent",
    activeFrom: "1910-05-31",
    activeTo: null,
    capitalName: "Pretoria",
    flagKey: null,
    confidence: "high",
    notes: "The 1910 union of the Cape Colony, Natal, the Transvaal and the Orange Free State.",
  },
  {
    polityId: 1221,
    tag: "BWA",
    historicalName: "Republic of Botswana",
    commonName: "Botswana",
    status: "independent",
    activeFrom: "1966-09-30",
    activeTo: null,
    capitalName: "Gaborone",
    flagKey: null,
    confidence: "high",
    notes: "The Bechuanaland Protectorate became independent as Botswana in 1966.",
  },
  {
    polityId: 1222,
    tag: "LSO",
    historicalName: "Kingdom of Lesotho",
    commonName: "Lesotho",
    status: "independent",
    activeFrom: "1966-10-04",
    activeTo: null,
    capitalName: "Maseru",
    flagKey: null,
    confidence: "high",
    notes: "Basutoland became independent as Lesotho in 1966.",
  },
  {
    polityId: 1223,
    tag: "SWZ",
    historicalName: "Kingdom of Swaziland",
    commonName: "Swaziland",
    status: "independent",
    activeFrom: "1968-09-06",
    activeTo: null,
    capitalName: "Mbabane",
    flagKey: null,
    confidence: "high",
    notes: "The Swaziland Protectorate became independent in 1968.",
  },
  {
    polityId: 1224,
    tag: "NGA",
    historicalName: "Federation of Nigeria",
    commonName: "Nigeria",
    status: "independent",
    activeFrom: "1960-10-01",
    activeTo: null,
    capitalName: "Lagos",
    flagKey: null,
    confidence: "high",
    notes:
      "The 1914 amalgamation of Northern Nigeria, Southern Nigeria and the Lagos Colony; independent in 1960.",
  },
  {
    polityId: 1225,
    tag: "GHA",
    historicalName: "Ghana",
    commonName: "Ghana",
    status: "independent",
    activeFrom: "1957-03-06",
    activeTo: null,
    capitalName: "Accra",
    flagKey: null,
    confidence: "high",
    notes: "The Gold Coast and British Togoland became independent as Ghana in 1957.",
  },
  {
    polityId: 1226,
    tag: "SLE",
    historicalName: "Sierra Leone",
    commonName: "Sierra Leone",
    status: "independent",
    activeFrom: "1961-04-27",
    activeTo: null,
    capitalName: "Freetown",
    flagKey: null,
    confidence: "high",
    notes: "The colony and protectorate became independent in 1961.",
  },
  {
    polityId: 1227,
    tag: "GMB",
    historicalName: "Republic of the Gambia",
    commonName: "Gambia",
    status: "independent",
    activeFrom: "1965-02-18",
    activeTo: null,
    capitalName: "Bathurst",
    flagKey: null,
    confidence: "high",
    notes: "The Gambia Colony and Protectorate became independent in 1965.",
  },
  {
    polityId: 1228,
    tag: "MRT",
    historicalName: "Islamic Republic of Mauritania",
    commonName: "Mauritania",
    status: "independent",
    activeFrom: "1960-11-28",
    activeTo: null,
    capitalName: "Nouakchott",
    flagKey: null,
    confidence: "high",
    notes: "The Mauritanian region of French West Africa became independent in 1960.",
  },
  {
    polityId: 1229,
    tag: "MLI",
    historicalName: "Republic of Mali",
    commonName: "Mali",
    status: "independent",
    activeFrom: "1960-09-22",
    activeTo: null,
    capitalName: "Bamako",
    flagKey: null,
    confidence: "high",
    notes: "French Sudan, briefly part of the Mali Federation in 1959-1960.",
  },
  {
    polityId: 1230,
    tag: "SEN",
    historicalName: "Republic of Senegal",
    commonName: "Senegal",
    status: "independent",
    activeFrom: "1960-04-04",
    activeTo: null,
    capitalName: "Dakar",
    flagKey: null,
    confidence: "high",
    notes: "The Senegal colony and protectorate, independent in 1960.",
  },
  {
    polityId: 1231,
    tag: "GIN",
    historicalName: "Republic of Guinea",
    commonName: "Guinea",
    status: "independent",
    activeFrom: "1958-10-02",
    activeTo: null,
    capitalName: "Conakry",
    flagKey: null,
    confidence: "high",
    notes:
      "The Rivières du Sud colony of French West Africa; voted for immediate independence in 1958.",
  },
  {
    polityId: 1232,
    tag: "CIV",
    historicalName: "Republic of Côte d'Ivoire",
    commonName: "Ivory Coast",
    status: "independent",
    activeFrom: "1960-08-07",
    activeTo: null,
    capitalName: "Abidjan",
    flagKey: null,
    confidence: "high",
    notes: "The Ivory Coast colony of French West Africa.",
  },
  {
    polityId: 1233,
    tag: "BFA",
    historicalName: "Republic of Upper Volta",
    commonName: "Upper Volta",
    status: "independent",
    activeFrom: "1960-08-05",
    activeTo: null,
    capitalName: "Ouagadougou",
    flagKey: null,
    confidence: "high",
    notes: "The Upper Volta colony of French West Africa.",
  },
  {
    polityId: 1234,
    tag: "BEN",
    historicalName: "Republic of Dahomey",
    commonName: "Dahomey",
    status: "independent",
    activeFrom: "1960-08-01",
    activeTo: null,
    capitalName: "Porto-Novo",
    flagKey: null,
    confidence: "high",
    notes: "The Dahomey colony of French West Africa.",
  },
  {
    polityId: 1235,
    tag: "NER",
    historicalName: "Republic of the Niger",
    commonName: "Niger",
    status: "independent",
    activeFrom: "1960-08-03",
    activeTo: null,
    capitalName: "Niamey",
    flagKey: null,
    confidence: "high",
    notes: "The Niger military territory of French West Africa.",
  },
  {
    polityId: 1236,
    tag: "TCD",
    historicalName: "Republic of Chad",
    commonName: "Chad",
    status: "independent",
    activeFrom: "1960-08-11",
    activeTo: null,
    capitalName: "Fort-Lamy",
    flagKey: null,
    confidence: "high",
    notes: "The Chad colony of French Equatorial Africa.",
  },
  {
    polityId: 1237,
    tag: "CAF",
    historicalName: "Central African Republic",
    commonName: "Central African Republic",
    status: "independent",
    activeFrom: "1960-08-13",
    activeTo: null,
    capitalName: "Bangui",
    flagKey: null,
    confidence: "high",
    notes: "Ubangi-Shari, the central territory of French Equatorial Africa.",
  },
  {
    polityId: 1238,
    tag: "COG",
    historicalName: "Republic of the Congo",
    commonName: "Congo",
    status: "independent",
    activeFrom: "1960-08-15",
    activeTo: null,
    capitalName: "Brazzaville",
    flagKey: null,
    confidence: "high",
    notes: "The Middle Congo colony of French Equatorial Africa.",
  },
  {
    polityId: 1239,
    tag: "GAB",
    historicalName: "Gabonese Republic",
    commonName: "Gabon",
    status: "independent",
    activeFrom: "1960-08-17",
    activeTo: null,
    capitalName: "Libreville",
    flagKey: null,
    confidence: "high",
    notes: "The Gabon colony of French Equatorial Africa.",
  },
  {
    polityId: 1240,
    tag: "COD",
    historicalName: "Republic of the Congo (Léopoldville)",
    commonName: "Democratic Republic of the Congo",
    status: "independent",
    activeFrom: "1960-06-30",
    activeTo: null,
    capitalName: "Léopoldville",
    flagKey: null,
    confidence: "high",
    notes:
      "The Congo Free State, annexed by Belgium in 1908 as the Belgian Congo and independent in 1960. Belgian ownership is continuous in the simulation model.",
  },
  {
    polityId: 1241,
    tag: "CMR",
    historicalName: "Republic of Cameroon",
    commonName: "Cameroon",
    status: "independent",
    activeFrom: "1960-01-01",
    activeTo: null,
    capitalName: "Yaoundé",
    flagKey: null,
    confidence: "high",
    notes:
      "French Cameroun became independent in 1960 and federated with the former British Southern Cameroons in 1961.",
  },
  {
    polityId: 1242,
    tag: "TGO",
    historicalName: "Togolese Republic",
    commonName: "Togo",
    status: "independent",
    activeFrom: "1960-04-27",
    activeTo: null,
    capitalName: "Lomé",
    flagKey: null,
    confidence: "high",
    notes: "French Togoland became independent in 1960; British Togoland joined Ghana in 1957.",
  },
  {
    polityId: 1243,
    tag: "MDG",
    historicalName: "Malagasy Republic",
    commonName: "Madagascar",
    status: "independent",
    activeFrom: "1960-06-26",
    activeTo: null,
    capitalName: "Tananarive",
    flagKey: null,
    confidence: "high",
    notes: "The French colony and dependencies became independent in 1960.",
  },
  {
    polityId: 1244,
    tag: "COM",
    historicalName: "Federal Islamic Republic of the Comoros",
    commonName: "Comoros",
    status: "independent",
    activeFrom: "1975-07-06",
    activeTo: null,
    capitalName: "Moroni",
    flagKey: null,
    confidence: "high",
    notes:
      "The three islands were French protectorates administered from Madagascar in 1900; Mayotte is a separate province and stayed French.",
  },
  {
    polityId: 1245,
    tag: "DJI",
    historicalName: "Republic of Djibouti",
    commonName: "Djibouti",
    status: "independent",
    activeFrom: "1977-06-27",
    activeTo: null,
    capitalName: "Djibouti",
    flagKey: null,
    confidence: "high",
    notes: "French Somaliland (the French Territory of the Afars and the Issas from 1967).",
  },
  {
    polityId: 1246,
    tag: "AGO",
    historicalName: "People's Republic of Angola",
    commonName: "Angola",
    status: "independent",
    activeFrom: "1975-11-11",
    activeTo: null,
    capitalName: "Luanda",
    flagKey: null,
    confidence: "high",
    notes: "Portuguese Angola, independent in 1975; Cabinda is a separate province.",
  },
  {
    polityId: 1247,
    tag: "MOZ",
    historicalName: "People's Republic of Mozambique",
    commonName: "Mozambique",
    status: "independent",
    activeFrom: "1975-06-25",
    activeTo: null,
    capitalName: "Maputo",
    flagKey: null,
    confidence: "high",
    notes: "Portuguese Mozambique, independent in 1975.",
  },
  {
    polityId: 1248,
    tag: "GNB",
    historicalName: "Republic of Guinea-Bissau",
    commonName: "Guinea-Bissau",
    status: "independent",
    activeFrom: "1973-09-24",
    activeTo: null,
    capitalName: "Bissau",
    flagKey: null,
    confidence: "high",
    notes: "Portuguese Guinea, independent in 1974-1975.",
  },
  {
    polityId: 1249,
    tag: "CPV",
    historicalName: "Republic of Cape Verde",
    commonName: "Cape Verde",
    status: "independent",
    activeFrom: "1975-07-05",
    activeTo: null,
    capitalName: "Praia",
    flagKey: null,
    confidence: "high",
    notes: "The Portuguese Cape Verde islands, independent in 1975.",
  },
  {
    polityId: 1250,
    tag: "STP",
    historicalName: "Democratic Republic of São Tomé and Príncipe",
    commonName: "São Tomé and Príncipe",
    status: "independent",
    activeFrom: "1975-07-12",
    activeTo: null,
    capitalName: "São Tomé",
    flagKey: null,
    confidence: "high",
    notes: "The Portuguese islands of São Tomé and Príncipe, independent in 1975.",
  },
  {
    polityId: 1251,
    tag: "GNQ",
    historicalName: "Republic of Equatorial Guinea",
    commonName: "Equatorial Guinea",
    status: "independent",
    activeFrom: "1968-10-12",
    activeTo: null,
    capitalName: "Santa Isabel",
    flagKey: null,
    confidence: "high",
    notes: "Spanish Guinea (Río Muni and Fernando Pó), independent in 1968.",
  },
  {
    polityId: 1252,
    tag: "SADR",
    historicalName: "Sahrawi Arab Democratic Republic",
    commonName: "Western Sahara",
    status: "independent",
    activeFrom: "1976-02-27",
    activeTo: null,
    capitalName: "Laayoune",
    flagKey: null,
    confidence: "medium",
    notes:
      "Spanish Sahara in 1900; proclaimed by the Polisario Front in 1976. Río de Oro and Saguia el-Hamra are separate provinces.",
  },
  {
    polityId: 1253,
    tag: "MUS",
    historicalName: "Mauritius",
    commonName: "Mauritius",
    status: "independent",
    activeFrom: "1968-03-12",
    activeTo: null,
    capitalName: "Port Louis",
    flagKey: null,
    confidence: "high",
    notes: "A British crown colony in 1900; independent in 1968.",
  },
  {
    polityId: 1254,
    tag: "SYC",
    historicalName: "Republic of Seychelles",
    commonName: "Seychelles",
    status: "independent",
    activeFrom: "1976-06-29",
    activeTo: null,
    capitalName: "Victoria",
    flagKey: null,
    confidence: "high",
    notes:
      "A British crown colony administered from Mauritius until 1903; independent in 1976.",
  },
  {
    polityId: 1255,
    tag: "RHO",
    historicalName: "Rhodesia",
    commonName: "Rhodesia",
    status: "independent",
    activeFrom: "1965-11-11",
    activeTo: "1979-06-01",
    capitalName: "Salisbury",
    flagKey: null,
    confidence: "medium",
    notes:
      "Southern Rhodesia's Unilateral Declaration of Independence. Not internationally recognised, but a real 20th-century state with its own government; sovereignty returns to Zimbabwe in 1980. Its provinces are the Southern Rhodesian ones.",
  },
  {
    polityId: 1256,
    tag: "ZRW",
    historicalName: "Zimbabwe Rhodesia",
    commonName: "Zimbabwe Rhodesia",
    status: "independent",
    activeFrom: "1979-06-01",
    activeTo: "1980-04-18",
    capitalName: "Salisbury",
    flagKey: null,
    confidence: "medium",
    notes:
      "The short-lived internal settlement that preceded Zimbabwe's independence. The Southern Rhodesian provinces transfer to it and then to Zimbabwe.",
  },
];

/** 1900 owner polity ids (catalog ids, never renumbered). */
const OWNER_ID = {
  GBR: 1,
  DEU: 2,
  FRA: 3,
  ITA: 6,
  ESP: 7,
  PRT: 8,
  BEL: 10,
  OTT: 20,
  ETH: 33,
  LBR: 34,
  MAR: 35,
  ZAR: 36,
  ORF: 37,
  SOK: 62,
  WAD: 63,
  DAR: 64,
};

/**
 * Simulation-region id for each 1900 map feature.
 *
 * Réunion and Mayotte use the French Indian Ocean aggregate (region 126, French
 * Madagascar) because no separate simulation region exists for them; the
 * province metadata records the difference.
 */
const REGION_ID = {
  EGY: 158,
  SUD: 112,
  BSO: 113,
  BEA: 111,
  BPO: 117,
  BSA: 109,
  BWA: 110,
  SOK: 62,
  CAP: 118,
  NAT: 119,
  HCT: 115,
  CRA: 114,
  ZAR: 36,
  ORF: 37,
  ALG: 121,
  TUN: 122,
  FWA: 123,
  FEA: 124,
  MAR: 35,
  FSO: 127,
  MAD: 126,
  FRA: 126,
  GEA: 130,
  GSW: 131,
  KAM: 132,
  TOG: 133,
  CFS: 137,
  ANG: 138,
  MOZ: 139,
  PAI: 140,
  ERI: 143,
  ITS: 144,
  SAH: 148,
  SGG: 149,
  ETH: 33,
  LBR: 34,
  WAD: 63,
  DAR: 64,
  OTT: 20,
};

/** Admin-1 countries that the Africa plan is expected to consume completely. */
export const AFRICA_COUNTRIES = new Set([
  "AGO", "BDI", "BEN", "BFA", "BWA", "CAF", "CIV", "CMR", "COD", "COG", "COM",
  "CPV", "DJI", "DZA", "EGY", "ERI", "ETH", "GAB", "GHA", "GIN", "GMB", "GNB",
  "GNQ", "KEN", "LBR", "LSO", "LBY", "MAR", "MDG", "MLI", "MOZ", "MRT", "MUS",
  "MWI", "NAM", "NER", "NGA", "RWA", "SAH", "SDS", "SDN", "SEN", "SHN", "SLE",
  "SOL", "SOM", "STP", "SWZ", "SYC", "TCD", "TGO", "TUN", "TZA", "UGA", "ZAF",
  "ZMB", "ZWE",
]);

/** Map features inside the Africa work package. */
export const AFRICA_TAGS = new Set([
  "EGY", "SUD", "BSO", "BEA", "BWA", "CAP", "NAT", "HCT", "CRA", "FWA", "FEA",
  "ALG", "TUN", "MAR", "FSO", "MAD", "GEA", "GSW", "KAM", "TOG", "CFS", "ANG",
  "MOZ", "PAI", "ERI", "ITS", "SAH", "SGG", "ETH", "LBR", "ZAR", "ORF", "SOK",
  "WAD", "DAR", "OTT", "BPO", "BSA", "FRA",
]);

/**
 * The Walvis Bay exclave of the Cape Colony on the Namibian coast.
 *
 * The 1900 M11c Cape Colony polygon carries Walvis Bay as a separate ring at
 * roughly 14.4-14.7 E, 22.8-23.1 S; Natural Earth has no modern admin-1 unit for
 * it because it is part of the modern Erongo region. The clip is only a bounding
 * box for that ring: the province outline itself follows the authored 1900 Cape
 * coastline, not the rectangle.
 */
export const WALVIS_BAY_CLIP = [
  [14.3, -23.2],
  [14.85, -23.2],
  [14.85, -22.7],
  [14.3, -22.7],
];

/**
 * The 26th-parallel boundary between Saguia el-Hamra and Río de Oro.
 *
 * Spanish Sahara was administered as two regions: Saguia el-Hamra north of Cape
 * Bojador and Río de Oro to the south. The M11c polygon is the 1900 outer
 * boundary, so the internal line is an authored historical approximation.
 */
export const SAHARA_SPLIT_LATITUDE = 26.0;

function slug(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

/**
 * Build the complete Africa province plan.
 *
 * @param {readonly {code: string, name: string, nameLocal: string, country: string,
 *   region: string, type: string, lat: number, lon: number,
 *   polities?: readonly string[], label?: readonly number[]}[]} units
 */
export function buildAfricaProvincePlan(units) {
  const byCode = new Map(units.map((unit) => [unit.code, unit]));
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

  /** Units of one modern country whose label point falls inside the map feature. */
  function codesIn(mapTag, country) {
    return units
      .filter(
        (unit) => unit.country === country && (unit.polities ?? []).includes(mapTag),
      )
      .map((unit) => unit.code)
      .sort();
  }

  /** Units of one modern country inside a map feature whose code matches a regex. */
  function pick(mapTag, country, pattern) {
    return codesIn(mapTag, country).filter((code) => pattern.test(code));
  }

  /** Units of one modern country inside a map feature belonging to one parent region. */
  function pickRegion(mapTag, country, regionName) {
    return units
      .filter(
        (unit) =>
          unit.country === country &&
          unit.region === regionName &&
          (unit.polities ?? []).includes(mapTag),
      )
      .map((unit) => unit.code)
      .sort();
  }

  /** Every still-unclaimed unit of a modern country inside the map feature. */
  function restCodes(mapTag, country) {
    const claims = claimsFor(mapTag);
    return codesIn(mapTag, country).filter((code) => !claims.has(code));
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
    codes = [],
    restCountry = null,
    claimOnly = [],
    clip = null,
    exclude = null,
    sources = ["natural-earth-10m-admin1", "project-authored-1900", "project-authored-m12"],
  }) {
    if (!key.startsWith("af-")) throw new Error(`Africa province key must start with af-: ${key}`);
    if (keys.has(key)) {
      duplicateKeys.add(key);
      return;
    }
    keys.add(key);
    const ownerPolityId = OWNER_ID[ownerTag];
    if (ownerPolityId === undefined) throw new Error(`unknown owner tag ${ownerTag}`);
    const regionId = REGION_ID[mapTag];
    if (regionId === undefined) throw new Error(`unknown map tag ${mapTag}`);
    const requested = [...codes];
    if (restCountry !== null) requested.push(...restCodes(mapTag, restCountry));
    const resolved = [];
    for (const code of [...new Set(requested)]) {
      if (!byCode.has(code)) {
        missingCodes.add(code);
        continue;
      }
      const unit = byCode.get(code);
      if (unit.polities !== undefined && !unit.polities.includes(mapTag)) {
        claimedElsewhere.push(`${key}:${code}(${unit.polities.join("+")})`);
      }
      // Two provinces of the same map feature must never share a unit: that
      // would duplicate the same geometry into both and produce an artificial
      // same-owner overlap. The first authored province wins and the collision
      // is reported in the audit.
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
      // polygon (islands and other features without a matching admin-1 block),
      // but the unit must still be consumed so the coverage audit does not report
      // a false gap.
      claim(mapTag, code);
      usedCodes.add(code);
    }
    if (resolved.length === 0 && clip === null) {
      throw new Error(`Africa province ${key} has no geometry source`);
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

  /** Add a set of `[name, codes, overrides]` groups sharing one metadata frame. */
  function addGroups(mapTag, ownerTag, grouping, affiliation, confidence, notes, groups, shared = {}) {
    for (const [name, codes, overrides = {}] of groups) {
      add({
        key: overrides.key ?? `af-${mapTag.toLowerCase()}-${slug(name)}`,
        name,
        mapTag,
        ownerTag,
        grouping,
        affiliation,
        confidence: overrides.confidence ?? confidence,
        notes: overrides.notes ?? notes,
        codes,
        ...shared,
        ...overrides,
      });
    }
  }

  const box = (west, south, east, north) => [
    [west, south],
    [east, south],
    [east, north],
    [west, north],
  ];

  // ---------------------------------------------------------------------------
  // Spanish Sahara: Saguia el-Hamra and Río de Oro
  // ---------------------------------------------------------------------------
  // The whole M11c Spanish Sahara polygon is split at the historical 26th
  // parallel. Both provinces are built from the map polygon itself; the modern
  // Western Sahara and Dakhlet Nouadhibou units only supply claim bookkeeping.
  add({
    key: "af-sah-saguia-el-hamra",
    name: "Saguia el-Hamra",
    mapTag: "SAH",
    ownerTag: "ESP",
    grouping: "Spanish Sahara",
    affiliation: "Spanish colonial territory",
    codes: [],
    claimOnly: ["EH-X01~", "MA-15", "MR-08"],
    clip: [{ polygon: box(-17.3, SAHARA_SPLIT_LATITUDE, -8.5, 28.0) }],
    confidence: "low",
    notes:
      "The northern region of Spanish Sahara, from Cape Bojador to the 27°40' line. The internal boundary at 26°N is an authored historical approximation; the outer boundary is the M11c Spanish Sahara polygon.",
  });
  add({
    key: "af-sah-rio-de-oro",
    name: "Río de Oro",
    mapTag: "SAH",
    ownerTag: "ESP",
    grouping: "Spanish Sahara",
    affiliation: "Spanish colonial territory",
    codes: [],
    claimOnly: ["EH-X01~", "MA-16"],
    clip: [{ polygon: box(-17.3, 20.5, -8.5, SAHARA_SPLIT_LATITUDE) }],
    confidence: "low",
    notes:
      "The southern region of Spanish Sahara, from Cape Bojador to Cape Blanc. The internal boundary at 26°N is an authored historical approximation; the outer boundary is the M11c Spanish Sahara polygon.",
  });

  // ---------------------------------------------------------------------------
  // Walvis Bay: the Cape Colony exclave on the Namibian coast
  // ---------------------------------------------------------------------------
  add({
    key: "af-cap-walvis-bay",
    name: "Walvis Bay",
    mapTag: "CAP",
    ownerTag: "GBR",
    grouping: "Cape Colony",
    affiliation: "British colonial exclave",
    codes: [],
    clip: [{ polygon: WALVIS_BAY_CLIP }],
    confidence: "low",
    notes:
      "Walvis Bay was a Cape Colony exclave on the coast of German South West Africa from 1878. It is a separate permanent province so the 1910 union transfer to South Africa and the later transfer to Namibia need no geometry change. The clip only bounds the existing 1900 Cape ring.",
  });

  // ---------------------------------------------------------------------------
  // Zanzibar, Pemba, Seychelles and Mauritius (British Indian Ocean islands)
  // ---------------------------------------------------------------------------
  add({
    key: "af-bpo-zanzibar",
    name: "Zanzibar",
    mapTag: "BPO",
    ownerTag: "GBR",
    grouping: "Zanzibar",
    affiliation: "British protectorate",
    codes: pick("BPO", "TZA", /^TZ-(07|11|15)$/),
    confidence: "high",
    notes:
      "The islands of Unguja (Zanzibar) under British protection from 1890. The sultanate kept its own administration; the protectorate ended in 1963.",
  });
  add({
    key: "af-bpo-pemba",
    name: "Pemba",
    mapTag: "BPO",
    ownerTag: "GBR",
    grouping: "Zanzibar",
    affiliation: "British protectorate",
    codes: pick("BPO", "TZA", /^TZ-(06|10)$/),
    confidence: "high",
    notes:
      "Pemba was administered with Zanzibar as part of the same British protectorate; it is a separate province because the M11c map exposes the island separately.",
  });
  add({
    key: "af-bpo-seychelles",
    name: "Seychelles",
    mapTag: "BPO",
    ownerTag: "GBR",
    grouping: "British Indian Ocean islands",
    affiliation: "British crown colony",
    codes: pick("BPO", "SYC", /^SC-/),
    confidence: "medium",
    notes:
      "The Seychelles were administered as a dependency of Mauritius until 1903 and became a separate crown colony afterwards. The M11c map exposes Mahé; the outer islands are not separately drawn.",
  });
  add({
    key: "af-bpo-mauritius",
    name: "Mauritius",
    mapTag: "BPO",
    ownerTag: "GBR",
    grouping: "British Indian Ocean islands",
    affiliation: "British crown colony",
    codes: pick("BPO", "MUS", /^MU-/),
    confidence: "medium",
    notes:
      "Mauritius was a British crown colony in 1900. Rodrigues and the Chagos archipelago are not exposed as separate geometry in the M11c map.",
  });

  // ---------------------------------------------------------------------------
  // Portuguese Guinea, Cape Verde, São Tomé and Príncipe
  // ---------------------------------------------------------------------------
  addGroups(
    "PAI",
    "PRT",
    "Portuguese Guinea",
    "Portuguese colonial territory",
    "medium",
    "A district of Portuguese Guinea. The M11c Portuguese Atlantic islands feature carries Guinea-Bissau, Cape Verde, São Tomé and Príncipe together with Portuguese India; only the African parts are provinces here.",
    [
      ["Bissau and Cacheu", pick("PAI", "GNB", /^GW-(BS|CA|OI)$/)],
      ["Bafatá and Gabú", pick("PAI", "GNB", /^GW-(BA|GA)$/)],
      ["Bolama and Quinara", pick("PAI", "GNB", /^GW-(BL|QU|TO)$/)],
    ],
  );
  addGroups(
    "PAI",
    "PRT",
    "Cape Verde",
    "Portuguese colonial territory",
    "medium",
    "The Cape Verde islands were a Portuguese colony administered together with Portuguese Guinea. The M11c map exposes the Barlavento and Sotavento groups.",
    [
      ["Barlavento Islands", pick("PAI", "CPV", /^CV-(BV|SL|SV|PN|PA|RG|RB|TS)$/)],
      [
        "Sotavento Islands",
        pick("PAI", "CPV", /^CV-(BR|CF|CA|MO|SF|TA|RS|PR|SD|CR|SM|MA|SS|SO)$/),
      ],
    ],
  );
  addGroups(
    "PAI",
    "PRT",
    "São Tomé and Príncipe",
    "Portuguese colonial territory",
    "high",
    "The Portuguese islands in the Gulf of Guinea. The 1895 Biafran War is not modelled as a separate status.",
    [
      ["São Tomé", pick("PAI", "STP", /^ST-S$/)],
      ["Príncipe", pick("PAI", "STP", /^ST-P$/)],
    ],
  );

  // ---------------------------------------------------------------------------
  // Spanish Guinea: Río Muni and Fernando Pó
  // ---------------------------------------------------------------------------
  addGroups(
    "SGG",
    "ESP",
    "Spanish Guinea",
    "Spanish colonial territory",
    "medium",
    "The Spanish territory of the Gulf of Guinea: the mainland Río Muni enclave and the island of Fernando Pó (Bioko), with Annobón and Corisco not separately exposed by the M11c map.",
    [
      ["Río Muni", pick("SGG", "GNQ", /^GQ-(CS|KN|LI|WN)$/)],
      ["Fernando Pó", pick("SGG", "GNQ", /^GQ-(BN|BS)$/)],
    ],
  );

  // ---------------------------------------------------------------------------
  // British South Atlantic islands
  // ---------------------------------------------------------------------------
  add({
    key: "af-bsa-st-helena",
    name: "St Helena",
    mapTag: "BSA",
    ownerTag: "GBR",
    grouping: "British South Atlantic islands",
    affiliation: "British crown colony",
    codes: pick("BSA", "SHN", /^SH-HL$/),
    confidence: "high",
    notes:
      "St Helena was a British crown colony administered from London in 1900; Ascension was its dependency.",
  });
  add({
    key: "af-bsa-ascension",
    name: "Ascension",
    mapTag: "BSA",
    ownerTag: "GBR",
    grouping: "British South Atlantic islands",
    affiliation: "British crown colony",
    codes: pick("BSA", "SHN", /^SH-AC$/),
    confidence: "high",
    notes:
      "Ascension was a dependency of St Helena and a coaling station for the Royal Navy. The Falklands, South Georgia and Pitcairn are outside the African scope and are not provinces.",
  });

  // ---------------------------------------------------------------------------
  // French Indian Ocean islands
  // ---------------------------------------------------------------------------
  add({
    key: "af-fra-reunion",
    name: "Réunion",
    mapTag: "FRA",
    ownerTag: "FRA",
    grouping: "French Indian Ocean islands",
    affiliation: "French colony",
    codes: pick("FRA", "FRA", /^FR-RE$/),
    confidence: "high",
    notes:
      "Réunion was a French colony in 1900 and a department from 1946. The simulation-region reference is the French Indian Ocean aggregate because no separate region exists.",
  });
  add({
    key: "af-fra-mayotte",
    name: "Mayotte",
    mapTag: "FRA",
    ownerTag: "FRA",
    grouping: "French Indian Ocean islands",
    affiliation: "French colony",
    codes: pick("FRA", "FRA", /^FR-YT$/),
    confidence: "high",
    notes:
      "Mayotte was acquired by France in 1841 and administered with the Comoros; it stayed French in 1975. The simulation-region reference is the French Indian Ocean aggregate.",
  });

  // ---------------------------------------------------------------------------
  // French Madagascar and the Comoros
  // ---------------------------------------------------------------------------
  addGroups(
    "MAD",
    "FRA",
    "French Madagascar",
    "French colony",
    "medium",
    "A province of the French colony of Madagascar, grouped from the modern faritany.",
    [
      ["Antananarivo", pick("MAD", "MDG", /^MG-T$/)],
      ["Fianarantsoa", pick("MAD", "MDG", /^MG-F$/)],
      ["Toamasina", pick("MAD", "MDG", /^MG-A$/)],
      ["Mahajanga", pick("MAD", "MDG", /^MG-M$/)],
      ["Toliara", pick("MAD", "MDG", /^MG-U$/)],
      ["Antsiranana", pick("MAD", "MDG", /^MG-D$/)],
    ],
  );
  addGroups(
    "MAD",
    "FRA",
    "Comoros",
    "French protectorate",
    "medium",
    "The Comoro islands were French protectorates from 1886, administered from Madagascar until 1908. Mayotte is a separate French province, so the 1975 split needs no geometry change.",
    [
      ["Grande Comore", pick("MAD", "COM", /^KM-G$/)],
      ["Anjouan", pick("MAD", "COM", /^KM-A$/)],
      ["Mohéli", pick("MAD", "COM", /^KM-M$/)],
    ],
  );

  // ---------------------------------------------------------------------------
  // British Somaliland
  // ---------------------------------------------------------------------------
  add({
    key: "af-bso-british-somaliland",
    name: "British Somaliland",
    mapTag: "BSO",
    ownerTag: "GBR",
    grouping: "British Somaliland",
    affiliation: "British protectorate",
    codes: [...pick("BSO", "SOL", /^/), ...pick("BSO", "SOM", /^/)],
    confidence: "medium",
    notes:
      "The British Somaliland Protectorate, established in 1884-1887. The M11c polygon is one protectorate, so it is one province; the 1960 union with Italian Somaliland is an ordinary transfer.",
  });

  // ---------------------------------------------------------------------------
  // Italian Somaliland
  // ---------------------------------------------------------------------------
  addGroups(
    "ITS",
    "ITA",
    "Italian Somaliland",
    "Italian colony",
    "medium",
    "A district of the Italian colony of southern Somalia, grouped from modern gobolka.",
    [
      ["Banaadir and the Lower Shabelle", pick("ITS", "SOM", /^SO-(BN|SD|SH)$/)],
      ["Hiiraan, Bakool and Bay", pick("ITS", "SOM", /^SO-(HI|BK|BY)$/)],
      ["Mudug, Galguduud and Bari", pick("ITS", "SOM", /^SO-(MU|GA|BR)$/)],
    ],
  );

  // ---------------------------------------------------------------------------
  // Italian Eritrea
  // ---------------------------------------------------------------------------
  addGroups(
    "ERI",
    "ITA",
    "Italian Eritrea",
    "Italian colony",
    "medium",
    "A province of the Italian colony of Eritrea. The 1900 boundary is the M11c Eritrea polygon, including the 1889-1890 acquisitions inland from Massawa.",
    [
      ["Hamasien", pick("ERI", "ERI", /^ER-(MA|AN)$/)],
      ["Barka and Gash", pick("ERI", "ERI", /^ER-GB$/)],
      ["Akele Guzai", pick("ERI", "ERI", /^ER-(DU|SK)$/)],
      ["Massawa and the Dankalia Coast", pick("ERI", "ERI", /^ER-DK$/)],
    ],
  );

  // ---------------------------------------------------------------------------
  // Ethiopian Empire
  // ---------------------------------------------------------------------------
  addGroups(
    "ETH",
    "ETH",
    "Ethiopian Empire",
    "Ethiopian province",
    "medium",
    "A historic Ethiopian province or kingdom grouping. Modern kilil boundaries are only a proxy for the 1900 provincial system.",
    [
      ["Tigray", pick("ETH", "ETH", /^ET-TI$/)],
      ["Amhara and Begemder", pick("ETH", "ETH", /^ET-AM$/)],
      ["Afar", pick("ETH", "ETH", /^ET-AF$/)],
      ["Shewa and Addis Ababa", pick("ETH", "ETH", /^ET-AA$/)],
      ["Oromia", pick("ETH", "ETH", /^ET-OR$/)],
      ["Sidamo and the Southern Provinces", pick("ETH", "ETH", /^ET-SN$/)],
      ["Hararghe", pick("ETH", "ETH", /^ET-(HA|DD)$/)],
      ["Ogaden", pick("ETH", "ETH", /^ET-SO$/)],
      ["Benishangul", pick("ETH", "ETH", /^ET-BE$/)],
      ["Gambela", pick("ETH", "ETH", /^ET-GA$/)],
    ],
  );

  // ---------------------------------------------------------------------------
  // Egypt: British occupation of the Ottoman vilayet
  // ---------------------------------------------------------------------------
  // Legal Ottoman suzerainty is not modelled as ownership: the simulation region
  // for Egypt belongs to the Ottoman Empire, while the province owner is the
  // occupying power. The Ottoman claim is a formal claim (see the M12c tests).
  addGroups(
    "EGY",
    "GBR",
    "Egypt",
    "British occupation administration",
    "medium",
    "A mudiriya or governorate of Egypt under the British occupation of 1882. De jure Ottoman suzerainty is represented by a formal claim, not by ownership.",
    [
      ["Alexandria and Beheira", pick("EGY", "EGY", /^EG-(ALX|BH)$/)],
      ["Gharbia and Menufia", pick("EGY", "EGY", /^EG-(GH|KFS|MNF)$/)],
      ["Dakahlia and Damietta", pick("EGY", "EGY", /^EG-(DK|DT)$/)],
      ["Sharqia and the Canal", pick("EGY", "EGY", /^EG-(SHR|IS|PTS|SUZ)$/)],
      ["Cairo", pick("EGY", "EGY", /^EG-(C|KB|GZ)$/)],
      ["Fayyum and Beni Suef", pick("EGY", "EGY", /^EG-(FYM|BNS)$/)],
      ["Minya and Asyut", pick("EGY", "EGY", /^EG-(MN|AST)$/)],
      ["Sohag and Qena", pick("EGY", "EGY", /^EG-(SHG|KN|LX)$/)],
      ["Aswan and the Red Sea", pick("EGY", "EGY", /^EG-(ASN|BA)$/)],
      ["Sinai", pick("EGY", "EGY", /^EG-(SIN|JS)$/)],
      ["The Western Desert", pick("EGY", "EGY", /^EG-(MT|WAD)$/)],
    ],
  );

  // ---------------------------------------------------------------------------
  // Anglo-Egyptian Sudan
  // ---------------------------------------------------------------------------
  const SUDAN_GROUPS = [
    ["Khartoum", pickRegion("SUD", "SDN", "Khartum")],
    ["Blue Nile and Sennar", pickRegion("SUD", "SDN", "Blue Nile")],
    ["Kassala and the Red Sea", pickRegion("SUD", "SDN", "Kassala")],
    ["Northern Province", pickRegion("SUD", "SDN", "Northern")],
    ["Kordofan", pickRegion("SUD", "SDN", "Kordofan")],
  ];
  addGroups(
    "SUD",
    "GBR",
    "Anglo-Egyptian Sudan",
    "Anglo-Egyptian condominium",
    "medium",
    "A province of the Anglo-Egyptian Sudan under the 1899 condominium. The northern provinces are separated from the southern ones from 1900 so the 2011 South Sudan frontier is an ordinary transfer.",
    [
      ...SUDAN_GROUPS,
      [
        "Bahr el Ghazal",
        pick("SUD", "SDS", /^SS-(BN|BW|WR|LK)$/),
        {
          notes:
            "The Bahr el Ghazal province of the southern Sudan, administered separately from the northern provinces. It is part of the independent South Sudan after 2011.",
        },
      ],
      ["Equatoria", pick("SUD", "SDS", /^SS-(EC|EE|EW)$/)],
      ["Upper Nile", pick("SUD", "SDS", /^SS-(NU|JG|UY)$/)],
    ],
    { special: "condominium" },
  );

  // ---------------------------------------------------------------------------
  // Darfur and Wadai
  // ---------------------------------------------------------------------------
  addGroups(
    "DAR",
    "DAR",
    "Sultanate of Darfur",
    "Darfuri sultanate province",
    "medium",
    "The independent Sultanate of Darfur, annexed by the Anglo-Egyptian Sudan in 1916. The provinces are separate from the Sudanese ones so the 1916 annexation is an ordinary transfer.",
    [
      ["North Darfur", pick("DAR", "SDN", /^SD-DN$/)],
      ["South and West Darfur", pick("DAR", "SDN", /^SD-(DS|DW|DE)$/)],
    ],
  );
  addGroups(
    "WAD",
    "WAD",
    "Sultanate of Wadai",
    "Wadai sultanate province",
    "low",
    "The Sultanate of Wadai, conquered by France in 1909-1911 and attached to Chad. The Borkou-Ennedi-Tibesti districts are an M11c approximation of a frontier that was not delimited in 1900.",
    [
      ["Wadai and Ouaddaï", pick("WAD", "TCD", /^TD-(OD|SA|WF|BA)$/)],
      ["Borkou, Ennedi and Tibesti", pick("WAD", "TCD", /^TD-(BO|X01~)$/)],
    ],
  );

  // ---------------------------------------------------------------------------
  // Sokoto Caliphate
  // ---------------------------------------------------------------------------
  addGroups(
    "SOK",
    "SOK",
    "Sokoto Caliphate",
    "Sokoto emirate",
    "medium",
    "An emirate of the Sokoto Caliphate, conquered by Britain in 1903 and attached to Northern Nigeria. The emirates are separate from the British Nigerian provinces so the 1903 annexation is an ordinary transfer.",
    [
      ["Sokoto and Gwandu", pick("SOK", "NGA", /^NG-(SO|KE|ZA)$/)],
      ["Kano", pick("SOK", "NGA", /^NG-(KN|JI|KT)$/)],
      ["Zaria", pick("SOK", "NGA", /^NG-KD$/)],
      ["Bauchi and Adamawa", pick("SOK", "NGA", /^NG-(BA|GO|AD)$/)],
    ],
  );

  // ---------------------------------------------------------------------------
  // German East Africa: Tanganyika, Rwanda and Burundi
  // ---------------------------------------------------------------------------
  addGroups(
    "GEA",
    "DEU",
    "German East Africa",
    "German colonial district",
    "medium",
    "A district of German East Africa. The 1919 mandate divided the colony into Tanganyika, Ruanda and Urundi, each of which is a separate province group from 1900.",
    [
      ["Tanga and the Usambara", pick("GEA", "TZA", /^TZ-25$/)],
      ["Kilimanjaro and Moshi", pick("GEA", "TZA", /^TZ-09$/)],
      ["Arusha and the Maasai Steppe", pick("GEA", "TZA", /^TZ-(01|26)$/)],
      ["Dar es Salaam and the Coast", pick("GEA", "TZA", /^TZ-(02|19)$/)],
      ["Morogoro and the Rufiji", pick("GEA", "TZA", /^TZ-16$/)],
      ["Dodoma and Singida", pick("GEA", "TZA", /^TZ-(03|23)$/)],
      ["Tabora and Kigoma", pick("GEA", "TZA", /^TZ-(24|08)$/)],
      [
        "Bukoba, Mwanza and the Lake",
        pick("GEA", "TZA", /^TZ-(05|13|18|22|27|30)$/),
        {
          notes:
            "The north-western districts around Lake Victoria. The 1890 Heligoland-Zanzibar treaty fixed the frontier with Uganda and British East Africa.",
        },
      ],
      ["Iringa, Mbeya and Rukwa", pick("GEA", "TZA", /^TZ-(04|14|20|28|29)$/)],
      ["Lindi, Mtwara and Ruvuma", pick("GEA", "TZA", /^TZ-(12|17|21)$/)],
    ],
  );
  addGroups(
    "GEA",
    "DEU",
    "Ruanda-Urundi",
    "German colonial district",
    "medium",
    "The western districts of German East Africa, administered by Belgium after 1922 as the Ruanda-Urundi mandate. Rwanda and Burundi are separate provinces from 1900.",
    [
      ["Rwanda", pick("GEA", "RWA", /^RW-/)],
      ["Burundi", pick("GEA", "BDI", /^BI-/)],
    ],
  );

  // ---------------------------------------------------------------------------
  // Kamerun: French and British portions
  // ---------------------------------------------------------------------------
  addGroups(
    "KAM",
    "DEU",
    "Kamerun",
    "German colonial territory",
    "low",
    "A district of German Kamerun, partitioned between France and Britain in 1919. The British Cameroons provinces are separated from 1900 so the 1961 plebiscite is an ordinary transfer.",
    [
      [
        "Southern Cameroons",
        pick("KAM", "CMR", /^CM-(NW|SW)$/),
        {
          confidence: "low",
          notes:
            "The British Cameroons, administered from Nigeria. The modern North-West and South-West regions are a proxy; the Northern Cameroons, now part of Nigeria, lies outside the M11c Kamerun polygon.",
        },
      ],
      ["Northern Kamerun", pick("KAM", "CMR", /^CM-(AD|NO|EN)$/)],
      ["Central Kamerun", pick("KAM", "CMR", /^CM-(CE|LT|OU)$/)],
      ["Southern Kamerun", pick("KAM", "CMR", /^CM-(SU|ES)$/)],
    ],
  );

  // ---------------------------------------------------------------------------
  // Togoland: French and British portions
  // ---------------------------------------------------------------------------
  addGroups(
    "TOG",
    "DEU",
    "Togoland",
    "German colonial territory",
    "medium",
    "A district of German Togoland, partitioned between France and Britain in 1914-1919. The 1957 Ghana union and the 1960 Togolese independence are ordinary transfers.",
    [
      [
        "British Togoland",
        pick("TOG", "GHA", /^GH-TV$/),
        {
          confidence: "low",
          notes:
            "Trans-Volta Togoland, the British portion, integrated with the Gold Coast in 1956 and part of Ghana from 1957. The modern Volta region is a proxy for the 1914 partition line.",
        },
      ],
      ["French Togoland: Maritime and Plateaux", pick("TOG", "TGO", /^TG-(M|P)$/)],
      ["French Togoland: Centre", pick("TOG", "TGO", /^TG-C$/)],
      ["French Togoland: Kara and Savanes", pick("TOG", "TGO", /^TG-(K|S)$/)],
    ],
  );

  // ---------------------------------------------------------------------------
  // German South West Africa
  // ---------------------------------------------------------------------------
  addGroups(
    "GSW",
    "DEU",
    "German South West Africa",
    "German colonial district",
    "medium",
    "A district of German South West Africa. The territory became the South African mandate in 1920 and independent Namibia in 1990; Walvis Bay is a separate Cape Colony province until the 1910 union.",
    [
      ["Windhoek and the Khomas Highlands", pick("GSW", "NAM", /^NA-KH$/)],
      ["Erongo and the Central Coast", pick("GSW", "NAM", /^NA-ER$/)],
      ["Namaland", pick("GSW", "NAM", /^NA-(KA|HA)$/)],
      ["Hereroland", pick("GSW", "NAM", /^NA-(OD|OH)$/)],
      ["Ovamboland", pick("GSW", "NAM", /^NA-(OS|ON|OW|OT)$/)],
      ["Kaokoland", pick("GSW", "NAM", /^NA-KU$/)],
      ["Kavango and Caprivi", pick("GSW", "NAM", /^NA-(OK|CA)$/)],
    ],
  );

  // ---------------------------------------------------------------------------
  // Congo Free State
  // ---------------------------------------------------------------------------
  addGroups(
    "CFS",
    "BEL",
    "Congo Free State",
    "Congo Free State district",
    "medium",
    "A district of the Congo Free State. The 1908 annexation as the Belgian Congo did not change ownership in the simulation model, because the Congo basin region already belongs to Belgium.",
    [
      ["Léopoldville and Bas-Congo", pick("CFS", "COD", /^CD-(KN|BC)$/)],
      ["Kwango and Bandundu", pick("CFS", "COD", /^CD-BN$/)],
      ["Équateur", pick("CFS", "COD", /^CD-EQ$/)],
      ["Orientale", pick("CFS", "COD", /^CD-OR$/)],
      ["Kasaï", pick("CFS", "COD", /^CD-(KW|KE)$/)],
      ["Katanga", pick("CFS", "COD", /^CD-KA$/)],
      ["Maniema", pick("CFS", "COD", /^CD-MA$/)],
      ["North Kivu", pick("CFS", "COD", /^CD-NK$/)],
      ["South Kivu", pick("CFS", "COD", /^CD-SK$/)],
    ],
  );

  // ---------------------------------------------------------------------------
  // Portuguese Angola
  // ---------------------------------------------------------------------------
  addGroups(
    "ANG",
    "PRT",
    "Portuguese Angola",
    "Portuguese colonial district",
    "medium",
    "A district of Portuguese Angola, grouped from the modern províncias.",
    [
      ["Luanda", pick("ANG", "AGO", /^AO-(LUA|BGO)$/)],
      ["Cuanza", pick("ANG", "AGO", /^AO-C(US|NO)$/)],
      ["Malanje", pick("ANG", "AGO", /^AO-MAL$/)],
      ["Uíge and Zaire", pick("ANG", "AGO", /^AO-(UIG|ZAI)$/)],
      ["Cabinda", pick("ANG", "AGO", /^AO-CAB$/)],
      ["Benguela", pick("ANG", "AGO", /^AO-BGU$/)],
      ["Huambo and Bié", pick("ANG", "AGO", /^AO-(HUA|BIE)$/)],
      ["Huíla", pick("ANG", "AGO", /^AO-HUI$/)],
      ["Namibe", pick("ANG", "AGO", /^AO-NAM$/)],
      ["Cunene", pick("ANG", "AGO", /^AO-CNN$/)],
      ["Cuando Cubango", pick("ANG", "AGO", /^AO-CCU$/)],
      ["Moxico", pick("ANG", "AGO", /^AO-MOX$/)],
      ["Lunda", pick("ANG", "AGO", /^AO-L(SU|NO)$/)],
    ],
  );

  // ---------------------------------------------------------------------------
  // Portuguese Mozambique
  // ---------------------------------------------------------------------------
  addGroups(
    "MOZ",
    "PRT",
    "Portuguese Mozambique",
    "Portuguese colonial district",
    "medium",
    "A district of Portuguese Mozambique, grouped from the modern províncias. Likoma island is carried with Niassa because the M11c Mozambique polygon contains it.",
    [
      ["Cabo Delgado", pick("MOZ", "MOZ", /^MZ-P$/)],
      ["Niassa", [...pick("MOZ", "MOZ", /^MZ-A$/), ...pick("MOZ", "MWI", /^MW-LK$/)]],
      ["Nampula", pick("MOZ", "MOZ", /^MZ-N$/)],
      ["Zambézia", pick("MOZ", "MOZ", /^MZ-Q$/)],
      ["Tete", pick("MOZ", "MOZ", /^MZ-T$/)],
      ["Manica and Sofala", pick("MOZ", "MOZ", /^MZ-(B|S)$/)],
      ["Inhambane", pick("MOZ", "MOZ", /^MZ-I$/)],
      ["Gaza", pick("MOZ", "MOZ", /^MZ-G$/)],
      ["Lourenço Marques", pick("MOZ", "MOZ", /^MZ-L$/)],
    ],
  );

  // ---------------------------------------------------------------------------
  // British Central Africa: Nyasaland, Northern and Southern Rhodesia
  // ---------------------------------------------------------------------------
  addGroups(
    "CRA",
    "GBR",
    "British Central Africa",
    "British South Africa Company territory",
    "medium",
    "A district of the British South Africa Company's territories. Nyasaland, Northern Rhodesia and Southern Rhodesia are separate province groups from 1900 so the 1964 and 1980 successor frontiers are ordinary transfers.",
    [
      ["Nyasaland: Northern Province", pick("CRA", "MWI", /^MW-(CT|RU|NB|MZ)$/)],
      [
        "Nyasaland: Central Province",
        pick("CRA", "MWI", /^MW-(KS|NK|DO|SA|LI|MC|NI|DE)$/),
      ],
      [
        "Nyasaland: Southern Province",
        pick("CRA", "MWI", /^MW-(MG|MH|BA|BL|CK|CR|MW|NE|NU|ZO|PH|TH|MU|NS)$/),
      ],
      [
        "Northern Rhodesia: Barotseland",
        pick("CRA", "ZMB", /^ZM-(01|06)$/),
        {
          notes:
            "Barotseland and the north-western districts, administered under the Lochner and Lawley concessions of 1890-1900.",
        },
      ],
      ["Northern Rhodesia: North-Eastern", pick("CRA", "ZMB", /^ZM-(04|05|10)$/)],
      ["Northern Rhodesia: Central", pick("CRA", "ZMB", /^ZM-(02|08|09)$/)],
      ["Northern Rhodesia: Southern", pick("CRA", "ZMB", /^ZM-(03|07)$/)],
      ["Southern Rhodesia: Mashonaland", pick("CRA", "ZWE", /^ZW-(MC|ME|MW|HA)$/)],
      ["Southern Rhodesia: Matabeleland", pick("CRA", "ZWE", /^ZW-(MN|MS|BU)$/)],
      [
        "Southern Rhodesia: Victoria and the Midlands",
        pick("CRA", "ZWE", /^ZW-(MI|MV|MA)$/),
      ],
    ],
  );

  // ---------------------------------------------------------------------------
  // High Commission Territories
  // ---------------------------------------------------------------------------
  addGroups(
    "HCT",
    "GBR",
    "High Commission Territories",
    "British protectorate",
    "medium",
    "A protectorate administered by the High Commissioner for Southern Africa. Bechuanaland, Basutoland and Swaziland are separate province groups so their 1966 and 1968 independence is an ordinary transfer.",
    [
      [
        "Bechuanaland: Ngamiland and Chobe",
        pick("HCT", "BWA", /^BW-(NW|NE|CE|GH|ST|FR|SP)$/),
      ],
      ["Bechuanaland: Central District", pick("HCT", "BWA", /^BW-(KL|KW|GA|JW|SE)$/)],
      ["Bechuanaland: Kgalagadi and the South", pick("HCT", "BWA", /^BW-(KG|SO|LO)$/)],
      ["Basutoland: the Lowlands", pick("HCT", "LSO", /^LS-(A|B|C|D|E|F)$/)],
      ["Basutoland: the Highlands", pick("HCT", "LSO", /^LS-(G|H|J|K)$/)],
      [
        "Swaziland",
        pick("HCT", "SWZ", /^SZ-/),
        {
          notes:
            "The Swaziland Protectorate under the 1894 and 1903 conventions; it was administered by the Transvaal until 1903 and by the High Commissioner afterwards.",
        },
      ],
    ],
  );

  // ---------------------------------------------------------------------------
  // Cape Colony and Natal
  // ---------------------------------------------------------------------------
  addGroups(
    "CAP",
    "GBR",
    "Cape Colony",
    "British colony",
    "medium",
    "A province of the Cape Colony, grouped from the modern provinces because Natural Earth has no 1900 magisterial-division layer. The 1910 union with Natal, the Transvaal and the Orange Free State is an ordinary transfer.",
    [
      [
        "Cape Peninsula and the Western Districts",
        pick("CAP", "ZAF", /^ZA-WC$/),
        { confidence: "medium" },
      ],
      [
        "Eastern Cape and the Transkei",
        pick("CAP", "ZAF", /^ZA-EC$/),
        { confidence: "medium" },
      ],
      [
        "Northern Cape and Griqualand West",
        pick("CAP", "ZAF", /^ZA-NC$/),
        { confidence: "medium" },
      ],
    ],
  );
  addGroups(
    "NAT",
    "GBR",
    "Natal",
    "British colony",
    "medium",
    "The Colony of Natal, including Zululand (annexed in 1897). The modern KwaZulu-Natal province is the closest available proxy for the 1900 colony.",
    [["Natal and Zululand", pick("NAT", "ZAF", /^ZA-NL$/), { confidence: "medium" }]],
  );

  // ---------------------------------------------------------------------------
  // South African Republic (Transvaal) and Orange Free State
  // ---------------------------------------------------------------------------
  addGroups(
    "ZAR",
    "ZAR",
    "South African Republic",
    "Transvaal district",
    "low",
    "A district of the South African Republic (Transvaal). Modern Gauteng, Mpumalanga, Limpopo and North West are grouped around the historic district scale; the republic was annexed by Britain in 1902.",
    [
      ["Pretoria and the Witwatersrand", pick("ZAR", "ZAF", /^ZA-GT$/)],
      ["Lydenburg and the Eastern Transvaal", pick("ZAR", "ZAF", /^ZA-MP$/)],
      ["Zoutpansberg and the Northern Transvaal", pick("ZAR", "ZAF", /^ZA-LP$/)],
      ["Potchefstroom and the Western Transvaal", pick("ZAR", "ZAF", /^ZA-NW$/)],
    ],
  );
  addGroups(
    "ORF",
    "ORF",
    "Orange Free State",
    "Orange Free State district",
    "low",
    "The Orange Free State republic, annexed by Britain in 1902 and part of the Union of South Africa in 1910. The modern Free State province is the only available proxy.",
    [["Orange Free State", pick("ORF", "ZAF", /^ZA-FS$/)]],
  );

  // ---------------------------------------------------------------------------
  // British East Africa: Kenya, Uganda and Jubaland
  // ---------------------------------------------------------------------------
  addGroups(
    "BEA",
    "GBR",
    "British East Africa",
    "East Africa Protectorate province",
    "medium",
    "A province of the East Africa Protectorate (Kenya) or the Uganda Protectorate. Jubaland is a separate province so its 1925 cession to Italy is an ordinary transfer.",
    [
      ["Mombasa and the Coast", pick("BEA", "KEN", /^KE-300$/)],
      ["Ukamba and Nairobi", pick("BEA", "KEN", /^KE-(110|200|400)$/)],
      ["Nyanza and the Western Province", pick("BEA", "KEN", /^KE-(600|800)$/)],
      ["Rift Valley", pick("BEA", "KEN", /^KE-700$/)],
      ["Northern Frontier District", pick("BEA", "KEN", /^KE-500$/)],
      ["Buganda", pickRegion("BEA", "UGA", "Central")],
      ["Eastern Province of Uganda", pickRegion("BEA", "UGA", "Eastern")],
      ["Northern Province of Uganda", pickRegion("BEA", "UGA", "Northern")],
      ["Western Province of Uganda", pickRegion("BEA", "UGA", "Western")],
      [
        "Jubaland",
        pick("BEA", "SOM", /^SO-(GE|JD|JH)$/),
        {
          notes:
            "The Jubaland province of the East Africa Protectorate, ceded to Italy in 1925 and attached to Italian Somaliland.",
        },
      ],
    ],
  );

  // ---------------------------------------------------------------------------
  // British West Africa: Gold Coast, Gambia, Sierra Leone and Nigeria
  // ---------------------------------------------------------------------------
  addGroups(
    "BWA",
    "GBR",
    "British West Africa",
    "British West African colony or protectorate",
    "medium",
    "A colony, protectorate or province of British West Africa. Nigeria is split into the Lagos Colony, Southern Nigeria and Northern Nigeria (plus the separate Sokoto emirates) so the 1914 amalgamation and the 1960 independence are ordinary transfers.",
    [
      ["Gold Coast Colony", pick("BWA", "GHA", /^GH-(WP|CP|AA|EP)$/)],
      ["Ashanti", pick("BWA", "GHA", /^GH-(AH|BA)$/)],
      ["Northern Territories of the Gold Coast", pick("BWA", "GHA", /^GH-(NP|UE|UW)$/)],
      ["Gambia", pick("BWA", "GMB", /^GM-/)],
      ["Sierra Leone Colony", pick("BWA", "SLE", /^SL-W$/)],
      ["Sierra Leone Protectorate", pick("BWA", "SLE", /^SL-(N|S|E)$/)],
      [
        "Lagos Colony",
        pick("BWA", "NGA", /^NG-LA$/),
        {
          notes:
            "The Lagos Colony and its immediate hinterland, administered separately from Southern Nigeria until the 1906 amalgamation.",
        },
      ],
      [
        "Southern Nigeria: the West",
        pick("BWA", "NGA", /^NG-(OG|OS|OY|EK|ON)$/),
        {
          notes:
            "The western districts of the Southern Nigeria Protectorate, including the Yoruba interior.",
        },
      ],
      [
        "Southern Nigeria: the East",
        pick("BWA", "NGA", /^NG-(AB|AK|AN|CR|EB|EN|IM|RI|BY|DE|ED)$/),
        {
          notes:
            "The Niger Coast Protectorate districts, including the Niger Delta and Calabar.",
        },
      ],
      [
        "Southern Nigeria: the Middle Belt",
        pick("BWA", "NGA", /^NG-(BE|KO|KW|NA|PL|FC|TA)$/),
        {
          notes:
            "The middle-belt districts administered from Southern Nigeria after the 1900 reorganisation; the line with Northern Nigeria follows the modern state boundary.",
        },
      ],
      [
        "Northern Nigeria: Borno and the Chad Frontier",
        pick("BWA", "NGA", /^NG-(BO|YO)$/),
        {
          notes:
            "The Borno emirate districts, conquered by Britain in 1902 and attached to Northern Nigeria.",
        },
      ],
      ["Northern Nigeria: the Niger Province", pick("BWA", "NGA", /^NG-NI$/)],
    ],
  );

  // ---------------------------------------------------------------------------
  // French West Africa
  // ---------------------------------------------------------------------------
  addGroups(
    "FWA",
    "FRA",
    "French West Africa",
    "French colony or territory",
    "medium",
    "A colony, protectorate or military territory of French West Africa. Each colony is a separate province group from 1900 so the 1960 independence settlements are ordinary transfers.",
    [
      [
        "Senegal: the Communes and the Coast",
        pick("FWA", "SEN", /^SN-(DK|TH|DB|FK|KA|KL)$/),
      ],
      ["Senegal: the Interior", pick("FWA", "SEN", /^SN-(SL|LG|MT|TC|KD|KE|SE|ZG)$/)],
      [
        "Mauritania: Trarza and the Coast",
        pick("FWA", "MRT", /^MR-(06|12|NKC|05|04|10)$/),
      ],
      ["Mauritania: Adrar and the Hodh", pick("FWA", "MRT", /^MR-(07|09|01|02|03|11)$/)],
      [
        "Mauritania: Dakhlet Nouadhibou",
        ["MR-08"],
        {
          confidence: "low",
          notes:
            "The Cap Blanc district. The unit's label point lies inside the M11c Spanish Sahara polygon, so it is claimed by both features: the Spanish Sahara provinces hold the northern tip and this province holds the French West Africa part. The M11c polygons are the authority.",
        },
      ],
      ["French Sudan: Kayes, Bamako and Koulikoro", pick("FWA", "MLI", /^ML-(1|2|BKO)$/)],
      ["French Sudan: Ségou and Mopti", pick("FWA", "MLI", /^ML-(4|5)$/)],
      ["French Sudan: Sikasso", pick("FWA", "MLI", /^ML-3$/)],
      ["French Sudan: Tombouctou, Gao and Kidal", pick("FWA", "MLI", /^ML-(6|7|8)$/)],
      [
        "Guinea: Conakry and the Coast",
        [...pickRegion("FWA", "GIN", "Conakry"), ...pickRegion("FWA", "GIN", "Kindia")],
      ],
      ["Guinea: Fouta Djallon", pickRegion("FWA", "GIN", "Labé")],
      ["Guinea: the Middle Niger", pickRegion("FWA", "GIN", "Mamou")],
      ["Guinea: the Upper Niger", pickRegion("FWA", "GIN", "Kankan")],
      ["Guinea: Faranah", pickRegion("FWA", "GIN", "Faranah")],
      ["Guinea: the Forest Region", pickRegion("FWA", "GIN", "Nzérékoré")],
      ["Guinea: Boké", pickRegion("FWA", "GIN", "Boke")],
      [
        "Ivory Coast: the South",
        pick("FWA", "CIV", /^CI-(01|02|05|06|09|11|12|13|15|16|18|19)$/),
      ],
      ["Ivory Coast: the North", pick("FWA", "CIV", /^CI-(03|04|07|08|10|14|17)$/)],
      ["Upper Volta: Ouagadougou", pickRegion("FWA", "BFA", "Centre")],
      ["Upper Volta: Bobo-Dioulasso", pickRegion("FWA", "BFA", "Hauts-Bassins")],
      ["Upper Volta: Banfora", pickRegion("FWA", "BFA", "Cascades")],
      ["Upper Volta: Dédougou", pickRegion("FWA", "BFA", "Boucle du Mouhoun")],
      ["Upper Volta: Koudougou", pickRegion("FWA", "BFA", "Centre-Ouest")],
      ["Upper Volta: Manga", pickRegion("FWA", "BFA", "Centre-Sud")],
      ["Upper Volta: Tenkodogo", pickRegion("FWA", "BFA", "Centre-Est")],
      ["Upper Volta: Kaya", pickRegion("FWA", "BFA", "Centre-Nord")],
      ["Upper Volta: Ouahigouya", pickRegion("FWA", "BFA", "Nord")],
      ["Upper Volta: Dori", pickRegion("FWA", "BFA", "Sahel")],
      ["Upper Volta: Fada N'Gourma", pickRegion("FWA", "BFA", "Est")],
      ["Upper Volta: Gaoua", pickRegion("FWA", "BFA", "Sud-Ouest")],
      ["Upper Volta: Ziniaré", pickRegion("FWA", "BFA", "Plateau-Central")],
      ["Dahomey: the Coast", pick("FWA", "BEN", /^BJ-(AQ|LI|MO|OU|PL|KO)$/)],
      ["Dahomey: the North", pick("FWA", "BEN", /^BJ-(AK|AL|BO|CO|DO|ZO)$/)],
      ["Niger: the Niger Valley", pick("FWA", "NER", /^NE-(3|6|8)$/)],
      ["Niger: the Sahel", pick("FWA", "NER", /^NE-(4|5|7)$/)],
      ["Niger: the Sahara", pick("FWA", "NER", /^NE-(1|2)$/)],
    ],
  );

  // ---------------------------------------------------------------------------
  // French Equatorial Africa
  // ---------------------------------------------------------------------------
  addGroups(
    "FEA",
    "FRA",
    "French Equatorial Africa",
    "French colony or territory",
    "medium",
    "A territory of French Equatorial Africa. Gabon, Middle Congo, Ubangi-Shari and Chad are separate province groups from 1900 so the 1960 independence settlements are ordinary transfers.",
    [
      ["Gabon: the Estuary and the Coast", pick("FEA", "GAB", /^GA-(1|8)$/)],
      ["Gabon: the Interior", pick("FEA", "GAB", /^GA-(2|3|4|5|6|7|9)$/)],
      ["Middle Congo: Brazzaville and the Pool", pick("FEA", "COG", /^CG-(BZV|12)$/)],
      ["Middle Congo: the North", pick("FEA", "COG", /^CG-(7|8|13|15)$/)],
      ["Middle Congo: the South", pick("FEA", "COG", /^CG-(2|5|9|11|14|16)$/)],
      ["Ubangi-Shari: the West", pick("FEA", "CAF", /^CF-(HS|NM|OP|MP|LB|SE)$/)],
      ["Ubangi-Shari: the Centre", pick("FEA", "CAF", /^CF-(AC|BGF|KG|UK|BK|KB)$/)],
      ["Ubangi-Shari: the East", pick("FEA", "CAF", /^CF-(BB|HK|MB|HM|VK)$/)],
      [
        "Chad: the Chari and the Lake",
        pick("FEA", "TCD", /^TD-(CB|ND|HL|LC|BG|KA|GR)$/),
        {
          notes:
            "The Chari-Baguirmi, Kanem and Lac districts around Fort-Lamy; the 1900 frontier with Wadai is an approximation.",
        },
      ],
      ["Chad: the South", pick("FEA", "TCD", /^TD-(LO|LR|MA|MC|ME|MO|TA)$/)],
      ["Chad: the East", pick("FEA", "TCD", /^TD-(SI|TI)$/)],
    ],
  );

  // ---------------------------------------------------------------------------
  // Algeria and Tunisia
  // ---------------------------------------------------------------------------
  addGroups(
    "ALG",
    "FRA",
    "French Algeria",
    "French department or territory",
    "medium",
    "A department or military territory of French Algeria. The Sahara departments are grouped from the modern wilayas around the historic Southern Territories.",
    [
      ["Algiers and the Mitidja", pick("ALG", "DZA", /^DZ-(16|09|42|35|44|26)$/)],
      ["The Kabylie", pick("ALG", "DZA", /^DZ-(15|06|18|10)$/)],
      [
        "Constantine and the East",
        pick("ALG", "DZA", /^DZ-(25|21|23|36|24|41|12|04|40|05|19|34|28|43)$/),
      ],
      [
        "Oran and the West",
        pick("ALG", "DZA", /^DZ-(31|46|22|13|27|48|29|20|14|38|02)$/),
      ],
      [
        "Laghouat and the Southern Territories",
        pick("ALG", "DZA", /^DZ-(03|17|32|45|47|07|39)$/),
      ],
      ["Béchar and the West Sahara", pick("ALG", "DZA", /^DZ-(08|37|01)$/)],
      ["Ouargla and the East Sahara", pick("ALG", "DZA", /^DZ-(30|33|11)$/)],
    ],
  );
  addGroups(
    "TUN",
    "FRA",
    "French Tunisia",
    "French protectorate",
    "medium",
    "A district of the French protectorate of Tunisia, grouped from the modern wilayas.",
    [
      [
        "Tunis and the Sahel",
        pick("TUN", "TUN", /^TN-(11|13|14|21|22|23|31|51|52|53)$/),
      ],
      ["Bizerte and the North-West", pick("TUN", "TUN", /^TN-(32|33|34|42|43|71|72|73)$/)],
      ["Kairouan and the Centre", pick("TUN", "TUN", /^TN-(41|61|81|82)$/)],
      ["Gabès and the South", pick("TUN", "TUN", /^TN-83$/)],
    ],
  );

  // ---------------------------------------------------------------------------
  // Morocco
  // ---------------------------------------------------------------------------
  addGroups(
    "MAR",
    "MAR",
    "Sultanate of Morocco",
    "Moroccan province or Spanish zone",
    "medium",
    "A province of the Sultanate of Morocco. The northern provinces are the Spanish zone of 1912-1956 and the rest the French zone, so both protectorates can be represented by control changes without moving a polygon.",
    [
      [
        "Tangier and Tetouan",
        pick("MAR", "MAR", /^MA-01$/),
        {
          confidence: "low",
          notes:
            "The Spanish zone of northern Morocco (1912-1956), including Tangier's international status. The modern Tanger-Tétouan region is a proxy.",
        },
      ],
      [
        "The Rif and the Eastern Zone",
        pick("MAR", "MAR", /^MA-03$/),
        {
          confidence: "low",
          notes:
            "The Rif districts of the Spanish zone. The 1912 zone boundary through the modern Taza-Al Hoceima-Taounate region is an authored approximation.",
        },
      ],
      ["Gharb and the Atlantic Plain", pick("MAR", "MAR", /^MA-(02|07)$/)],
      ["Fez and Meknes", pick("MAR", "MAR", /^MA-(05|06)$/)],
      ["Casablanca, the Chaouia and Tadla", pick("MAR", "MAR", /^MA-(08|09|12)$/)],
      ["Marrakech and the South", pick("MAR", "MAR", /^MA-(11|10)$/)],
      ["Souss, the Anti-Atlas and Tarfaya", pick("MAR", "MAR", /^MA-(13|14)$/)],
      ["Eastern Morocco", pick("MAR", "MAR", /^MA-04$/)],
    ],
  );

  // ---------------------------------------------------------------------------
  // French Somaliland
  // ---------------------------------------------------------------------------
  addGroups(
    "FSO",
    "FRA",
    "French Somaliland",
    "French colony",
    "high",
    "The French colony of Obock and Djibouti, established by the 1880s treaties with the Afar and Issa. It is one province because the M11c polygon is the whole colony.",
    [["French Somaliland", pick("FSO", "DJI", /^DJ-/)]],
  );

  // ---------------------------------------------------------------------------
  // Liberia
  // ---------------------------------------------------------------------------
  addGroups(
    "LBR",
    "LBR",
    "Liberia",
    "Liberian county",
    "medium",
    "A county of the Republic of Liberia in 1900. The interior counties were not fully administered until the 1920s; the modern counties are a proxy.",
    [
      ["Montserrado", pick("LBR", "LBR", /^LR-(MO|MG)$/)],
      ["Grand Bassa", pick("LBR", "LBR", /^LR-(GB|RI)$/)],
      ["Sinoe, Grand Kru and Grand Gedeh", pick("LBR", "LBR", /^LR-(SI|GK|GG)$/)],
      ["Maryland", pick("LBR", "LBR", /^LR-(MY|X2~)$/)],
      ["Nimba and Bong", pick("LBR", "LBR", /^LR-(NI|BG)$/)],
      ["Western Liberia", pick("LBR", "LBR", /^LR-(CM|BM|X1~|LO)$/)],
    ],
  );

  // ---------------------------------------------------------------------------
  // Ottoman Libya: Tripolitania, Cyrenaica and Fezzan
  // ---------------------------------------------------------------------------
  addGroups(
    "OTT",
    "OTT",
    "Tripolitania",
    "Ottoman sanjak grouping",
    "low",
    "A sanjak grouping of the Ottoman vilayet of Tripoli in 1900. Tripolitania is separate from Cyrenaica and Fezzan so the 1951 federal kingdom is an ordinary transfer. Internal boundaries are authored approximations.",
    [
      [
        "Tripoli and the Jefara",
        pick("OTT", "LBY", /^LY-(JI|TN|ZA)$/),
        { confidence: "medium" },
      ],
      ["Misrata and the Gulf Coast", pick("OTT", "LBY", /^LY-(MI|MB|MZ|NQ)$/)],
      ["Sirte, Ghadames and the Jufra", pick("OTT", "LBY", /^LY-(SR|GD|JU)$/)],
    ],
  );
  addGroups(
    "OTT",
    "OTT",
    "Cyrenaica",
    "Ottoman sanjak grouping",
    "low",
    "A sanjak grouping of the Ottoman vilayet of Tripoli in 1900. Cyrenaica is separate from Tripolitania and Fezzan so the 1951 federal kingdom is an ordinary transfer.",
    [
      ["Benghazi and the Jabal al Akhdar", pick("OTT", "LBY", /^LY-(BA|MJ|JA)$/)],
      ["Derna, Butnan and Ajdabiya", pick("OTT", "LBY", /^LY-(QB|BU|AJ)$/)],
      ["Kufra", pick("OTT", "LBY", /^LY-KF$/)],
    ],
  );
  addGroups(
    "OTT",
    "OTT",
    "Fezzan",
    "Ottoman sanjak grouping",
    "low",
    "A sanjak grouping of the Ottoman vilayet of Tripoli in 1900. Fezzan is separate from Tripolitania and Cyrenaica so the 1951 federal kingdom is an ordinary transfer.",
    [
      ["Sabha, Wadi al Hayaa and Ash Shati", pick("OTT", "LBY", /^LY-(SB|WD|WS)$/)],
      ["Murzuq and Ghat", pick("OTT", "LBY", /^LY-(MQ|GT)$/)],
    ],
  );

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------
  if (missingCodes.size > 0) {
    throw new Error(
      `Africa province plan references unknown admin-1 codes: ${[...missingCodes].sort().join(", ")}`,
    );
  }
  if (duplicateKeys.size > 0) {
    throw new Error(`Africa province plan has duplicate keys: ${[...duplicateKeys].join(", ")}`);
  }
  if (provinces.length > 2048) {
    throw new Error(`Africa province plan exceeds its 2048-province budget (${provinces.length})`);
  }
  for (const province of provinces) {
    if (province.units.length === 0 && province.clip === null) {
      throw new Error(`Africa province ${province.key} has no geometry source`);
    }
  }

  // Assign stable ids deterministically in authored order, in a block disjoint
  // from every M12a Europe id (max 66001) and every M12b Asia id (100001-100239).
  const seenIds = new Set();
  for (let index = 0; index < provinces.length; index += 1) {
    const id = AFRICA_PROVINCE_ID_BASE + index + 1;
    if (seenIds.has(id)) throw new Error(`duplicate province id ${id}`);
    seenIds.add(id);
    provinces[index].provinceId = id;
  }

  // Report units whose label point lies in an African 1900 map feature but which
  // no province consumed. This is the primary gap detector for the plan.
  const unassigned = [];
  for (const unit of units) {
    if (!AFRICA_COUNTRIES.has(unit.country)) continue;
    if (usedCodes.has(unit.code)) continue;
    for (const tag of unit.polities ?? []) {
      if (!AFRICA_TAGS.has(tag)) continue;
      if (!claimsFor(tag).has(unit.code)) unassigned.push(`${tag}:${unit.code}`);
    }
  }

  return {
    sources: AFRICA_SOURCES,
    futurePolities: AFRICA_FUTURE_POLITIES,
    provinces,
    usedCodes: [...usedCodes].sort(),
    unassigned: [...new Set(unassigned)].sort(),
    claimedElsewhere: [...new Set(claimedElsewhere)].sort(),
    duplicateClaims: [...new Set(duplicateClaims)].sort(),
  };
}

export { OWNER_ID, REGION_ID };

/**
 * Authored M12b Asian province plan (1 January 1900).
 *
 * This module is data, not simulation logic. It mirrors the M12a European plan:
 * the 1900 map polity supplies the outer boundary, modern Natural Earth admin-1
 * units are only internal geometry blocks, and each province is a permanent
 * geographical unit with a stable numeric id. Asia ids live in a disjoint block
 * (100001+) and every Asia key is prefixed with `as-`, so they can never collide
 * with a European province.
 *
 * Grouping policy:
 * - Anatolia and the Arab provinces follow the 1900 Ottoman vilayet scale.
 * - British India follows the presidency/province scale plus the major princely
 *   states, split where the 1947 partition needs a boundary (Bengal, Punjab).
 * - Qing China follows the provincial scale, with Mongolia, Xinjiang, Tibet and
 *   Manchuria separately transferable.
 * - Asiatic Russia follows the governorate/oblast scale used by M12a for
 *   European Russia, with the Central Asian oblasts and the Caucasus separate.
 * - Dependencies are owned by the sovereign power and carry the territorial
 *   administration in `historicalAdminAffiliation`.
 */

/** First id of the Asia block. The M12a Europe block ends at 66001. */
export const ASIA_PROVINCE_ID_BASE = 100000;

/** Historical and geospatial sources referenced by province entries. */
export const ASIA_SOURCES = [
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
    id: "eb1911-ottoman-asia",
    title: "Encyclopaedia Britannica (1911), 'Turkey' (Asiatic provinces)",
    url: "https://en.wikisource.org/wiki/1911_Encyclop%C3%A6dia_Britannica/Turkey",
    license: "Public domain",
    date: "1911",
    notes:
      "Ottoman vilayets of Anatolia, the Levant, Mesopotamia, Hejaz, Yemen and the Gulf, and the 1878 Russian annexations of Kars, Ardahan and Batum.",
  },
  {
    id: "eb1911-persia",
    title: "Encyclopaedia Britannica (1911), 'Persia'",
    url: "https://en.wikisource.org/wiki/1911_Encyclop%C3%A6dia_Britannica/Persia",
    license: "Public domain",
    date: "1911",
    notes: "Qajar provinces and the Anglo-Russian spheres of influence of 1907.",
  },
  {
    id: "eb1911-afghanistan",
    title: "Encyclopaedia Britannica (1911), 'Afghanistan'",
    url: "https://en.wikisource.org/wiki/1911_Encyclop%C3%A6dia_Britannica/Afghanistan",
    license: "Public domain",
    date: "1911",
    notes: "Afghan provinces and the Durand Line of 1893.",
  },
  {
    id: "eb1911-india",
    title: "Encyclopaedia Britannica (1911), 'India'",
    url: "https://en.wikisource.org/wiki/1911_Encyclop%C3%A6dia_Britannica/India",
    license: "Public domain",
    date: "1911",
    notes:
      "British India's provinces, presidencies, princely states, Burma, Ceylon and Aden; the 1905 partition of Bengal and the 1911 transfer of Delhi.",
  },
  {
    id: "eb1911-china",
    title: "Encyclopaedia Britannica (1911), 'China'",
    url: "https://en.wikisource.org/wiki/1911_Encyclop%C3%A6dia_Britannica/China",
    license: "Public domain",
    date: "1911",
    notes:
      "The eighteen provinces of China proper, Manchuria, Mongolia, Xinjiang and Tibet under Qing rule.",
  },
  {
    id: "eb1911-japan",
    title: "Encyclopaedia Britannica (1911), 'Japan'",
    url: "https://en.wikisource.org/wiki/1911_Encyclop%C3%A6dia_Britannica/Japan",
    license: "Public domain",
    date: "1911",
    notes: "The Japanese home islands, Hokkaido, the Ryukyus and Taiwan (Formosa) after 1895.",
  },
  {
    id: "eb1911-korea",
    title: "Encyclopaedia Britannica (1911), 'Korea'",
    url: "https://en.wikisource.org/wiki/1911_Encyclop%C3%A6dia_Britannica/Korea",
    license: "Public domain",
    date: "1911",
    notes: "The eight historic provinces of the Korean Empire.",
  },
  {
    id: "eb1911-indochina",
    title: "Encyclopaedia Britannica (1911), 'French Indo-China' and 'Siam'",
    url: "https://en.wikisource.org/wiki/1911_Encyclop%C3%A6dia_Britannica/French_Indo-China",
    license: "Public domain",
    date: "1911",
    notes:
      "Tonkin, Annam, Cochinchina, Cambodia and Laos; the Siamese monthon and the 1909 Anglo-Siamese frontier.",
  },
  {
    id: "eb1911-east-indies",
    title: "Encyclopaedia Britannica (1911), 'Dutch East Indies' and 'Philippine Islands'",
    url: "https://en.wikisource.org/wiki/1911_Encyclop%C3%A6dia_Britannica/Dutch_East_Indies",
    license: "Public domain",
    date: "1911",
    notes:
      "Java, Sumatra, Borneo, Celebes, the Moluccas, New Guinea; the Spanish-American transfer of the Philippines in 1898.",
  },
  {
    id: "treaty-sevres-1920",
    title: "Treaty of Sevres (1920), Ottoman territorial clauses",
    url: "https://en.wikisource.org/wiki/Treaty_of_S%C3%A8vres",
    license: "Public domain",
    date: "1920",
    notes:
      "The partition of the Ottoman Empire, the French and British mandates and the Armenian and Hejazi settlements.",
  },
  {
    id: "treaty-lausanne-1923",
    title: "Treaty of Lausanne (1923), Turco-Greek and Middle Eastern clauses",
    url: "https://en.wikisource.org/wiki/Treaty_of_Lausanne",
    license: "Public domain",
    date: "1923",
    notes: "The Republic of Turkey's frontiers and the abandonment of the Sevres Armenian and Kurdish clauses.",
  },
  {
    id: "treaty-versailles-1919",
    title: "Treaty of Versailles (1919), Shandong and Pacific clauses",
    url: "https://en.wikisource.org/wiki/Treaty_of_Versailles",
    license: "Public domain",
    date: "1919",
    notes: "The transfer of German Pacific islands and the Shandong question that shaped Chinese politics.",
  },
  {
    id: "treaty-saint-germain-1919",
    title: "Treaty of Saint-Germain (1919), Asian and Pacific clauses",
    url: "https://en.wikisource.org/wiki/Treaty_of_Saint-Germain-en-Laye",
    license: "Public domain",
    date: "1919",
    notes: "Austro-Hungarian rights in Asia and the Pacific.",
  },
  {
    id: "treaty-san-francisco-1951",
    title: "Treaty of San Francisco (1951), Japanese territorial clauses",
    url: "https://en.wikisource.org/wiki/Treaty_of_San_Francisco",
    license: "Public domain",
    date: "1951",
    notes: "Japan's renunciation of Korea, Taiwan, the Ryukyus, Sakhalin and the Kurils.",
  },
  {
    id: "simla-convention-1914",
    title: "Simla Convention (1914) and the McMahon Line",
    url: "https://en.wikisource.org/wiki/Simla_Convention",
    license: "Public domain",
    date: "1914",
    notes:
      "The Indo-Tibetan frontier; the line is an approximation of the 1900 administrative understanding and is recorded as low confidence.",
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
    title: "Fabric of Nations M12a/M12b authored provincial partition",
    url: "internal:scripts/m12/asia-plan.mjs",
    license: "Project data",
    date: "2026",
    notes: "The authored grouping of modern first-level units into historical provinces.",
  },
];

/**
 * Future successor polities that can receive Asian provinces.
 *
 * Ids 1100-1199 are reserved for Asia and never overlap the M12a Europe range
 * 1000-1016. None is selectable in 1900.
 */
export const ASIA_FUTURE_POLITIES = [
  {
    polityId: 1100,
    tag: "TUR",
    historicalName: "Republic of Turkey",
    commonName: "Turkey",
    status: "independent",
    activeFrom: "1923-10-29",
    activeTo: null,
    capitalName: "Ankara",
    flagKey: null,
    confidence: "high",
    notes: "Successor to the Ottoman Empire in Anatolia and eastern Thrace after the Lausanne settlement.",
  },
  {
    polityId: 1101,
    tag: "HEJ",
    historicalName: "Kingdom of Hejaz",
    commonName: "Hejaz",
    status: "independent",
    activeFrom: "1916-06-10",
    activeTo: "1925-12-23",
    capitalName: "Mecca",
    flagKey: null,
    confidence: "high",
    notes: "The Hashemite kingdom proclaimed during the Arab Revolt; absorbed by Saudi Arabia in 1925.",
  },
  {
    polityId: 1102,
    tag: "SAU",
    historicalName: "Kingdom of Saudi Arabia",
    commonName: "Saudi Arabia",
    status: "independent",
    activeFrom: "1932-09-23",
    activeTo: null,
    capitalName: "Riyadh",
    flagKey: null,
    confidence: "high",
    notes: "Unification of Nejd, Jabal Shammar, Hejaz and Asir under the House of Saud.",
  },
  {
    polityId: 1103,
    tag: "IRQ",
    historicalName: "Kingdom of Iraq",
    commonName: "Iraq",
    status: "independent",
    activeFrom: "1921-08-23",
    activeTo: null,
    capitalName: "Baghdad",
    flagKey: null,
    confidence: "high",
    notes: "British mandate of Mesopotamia from 1920, kingdom from 1921, independent in 1932.",
  },
  {
    polityId: 1104,
    tag: "SYR",
    historicalName: "Syrian Republic",
    commonName: "Syria",
    status: "independent",
    activeFrom: "1920-03-08",
    activeTo: null,
    capitalName: "Damascus",
    flagKey: null,
    confidence: "high",
    notes: "Arab Kingdom of Syria in 1920, then French mandate; independent republic from 1946.",
  },
  {
    polityId: 1105,
    tag: "LBN",
    historicalName: "State of Greater Lebanon",
    commonName: "Lebanon",
    status: "independent",
    activeFrom: "1920-09-01",
    activeTo: null,
    capitalName: "Beirut",
    flagKey: null,
    confidence: "high",
    notes: "French mandate territory created in 1920; independent republic from 1943.",
  },
  {
    polityId: 1106,
    tag: "JOR",
    historicalName: "Emirate of Transjordan",
    commonName: "Jordan",
    status: "independent",
    activeFrom: "1921-04-11",
    activeTo: null,
    capitalName: "Amman",
    flagKey: null,
    confidence: "high",
    notes: "British mandate emirate; independent kingdom from 1946.",
  },
  {
    polityId: 1107,
    tag: "ISR",
    historicalName: "State of Israel",
    commonName: "Israel",
    status: "independent",
    activeFrom: "1948-05-14",
    activeTo: null,
    capitalName: "Jerusalem",
    flagKey: null,
    confidence: "high",
    notes: "Established in the former British Mandate of Palestine; the 1949 armistice lines are not baked into the 1900 state.",
  },
  {
    polityId: 1108,
    tag: "YEM",
    historicalName: "Mutawakkilite Kingdom of Yemen",
    commonName: "Yemen",
    status: "independent",
    activeFrom: "1918-10-30",
    activeTo: null,
    capitalName: "Sana'a",
    flagKey: null,
    confidence: "high",
    notes: "Independent from the Ottoman Empire in 1918; the Aden Protectorate remains British until 1967.",
  },
  {
    polityId: 1109,
    tag: "KWT",
    historicalName: "State of Kuwait",
    commonName: "Kuwait",
    status: "independent",
    activeFrom: "1961-06-19",
    activeTo: null,
    capitalName: "Kuwait City",
    flagKey: null,
    confidence: "high",
    notes: "British protectorate from 1899; independent in 1961.",
  },
  {
    polityId: 1110,
    tag: "ARE",
    historicalName: "United Arab Emirates",
    commonName: "United Arab Emirates",
    status: "independent",
    activeFrom: "1971-12-02",
    activeTo: null,
    capitalName: "Abu Dhabi",
    flagKey: null,
    confidence: "high",
    notes: "Federation of the Trucial Coast sheikhdoms after the British withdrawal.",
  },
  {
    polityId: 1111,
    tag: "QAT",
    historicalName: "State of Qatar",
    commonName: "Qatar",
    status: "independent",
    activeFrom: "1971-09-03",
    activeTo: null,
    capitalName: "Doha",
    flagKey: null,
    confidence: "high",
    notes: "Ottoman province in 1900, British protectorate from 1916, independent in 1971.",
  },
  {
    polityId: 1112,
    tag: "BHR",
    historicalName: "Kingdom of Bahrain",
    commonName: "Bahrain",
    status: "independent",
    activeFrom: "1971-08-15",
    activeTo: null,
    capitalName: "Manama",
    flagKey: null,
    confidence: "high",
    notes: "British protectorate from 1861; independent in 1971.",
  },
  {
    polityId: 1113,
    tag: "IND",
    historicalName: "Dominion of India",
    commonName: "India",
    status: "independent",
    activeFrom: "1947-08-15",
    activeTo: null,
    capitalName: "New Delhi",
    flagKey: null,
    confidence: "high",
    notes: "Partition of British India into India and Pakistan; the princely states accede or are integrated.",
  },
  {
    polityId: 1114,
    tag: "PAK",
    historicalName: "Dominion of Pakistan",
    commonName: "Pakistan",
    status: "independent",
    activeFrom: "1947-08-14",
    activeTo: null,
    capitalName: "Karachi",
    flagKey: null,
    confidence: "high",
    notes: "West Pakistan and East Bengal; East Bengal becomes Bangladesh in 1971.",
  },
  {
    polityId: 1115,
    tag: "BGD",
    historicalName: "People's Republic of Bangladesh",
    commonName: "Bangladesh",
    status: "independent",
    activeFrom: "1971-03-26",
    activeTo: null,
    capitalName: "Dhaka",
    flagKey: null,
    confidence: "high",
    notes: "Eastern Bengal, part of Pakistan from 1947 and independent in 1971.",
  },
  {
    polityId: 1116,
    tag: "LKA",
    historicalName: "Dominion of Ceylon",
    commonName: "Sri Lanka",
    status: "independent",
    activeFrom: "1948-02-04",
    activeTo: null,
    capitalName: "Colombo",
    flagKey: null,
    confidence: "high",
    notes: "Ceylon becomes independent in 1948 and a republic in 1972.",
  },
  {
    polityId: 1117,
    tag: "MMR",
    historicalName: "Union of Burma",
    commonName: "Burma",
    status: "independent",
    activeFrom: "1948-01-04",
    activeTo: null,
    capitalName: "Rangoon",
    flagKey: null,
    confidence: "high",
    notes: "Burma is separated from British India in 1937 and becomes independent in 1948.",
  },
  {
    polityId: 1118,
    tag: "MYS",
    historicalName: "Federation of Malaya",
    commonName: "Malaya",
    status: "independent",
    activeFrom: "1957-08-31",
    activeTo: null,
    capitalName: "Kuala Lumpur",
    flagKey: null,
    confidence: "high",
    notes: "The Malay States, Penang and Malacca; Malaysia is formed in 1963.",
  },
  {
    polityId: 1119,
    tag: "SGP",
    historicalName: "Republic of Singapore",
    commonName: "Singapore",
    status: "independent",
    activeFrom: "1965-08-09",
    activeTo: null,
    capitalName: "Singapore",
    flagKey: null,
    confidence: "high",
    notes: "Straits Settlement in 1900; separate from Malaysia in 1965.",
  },
  {
    polityId: 1120,
    tag: "IDN",
    historicalName: "Republic of Indonesia",
    commonName: "Indonesia",
    status: "independent",
    activeFrom: "1945-08-17",
    activeTo: null,
    capitalName: "Jakarta",
    flagKey: null,
    confidence: "high",
    notes: "Proclaimed in 1945; the Dutch East Indies transfer sovereignty in 1949.",
  },
  {
    polityId: 1121,
    tag: "PHL",
    historicalName: "Republic of the Philippines",
    commonName: "Philippines",
    status: "independent",
    activeFrom: "1946-07-04",
    activeTo: null,
    capitalName: "Manila",
    flagKey: null,
    confidence: "high",
    notes: "American rule from 1898; independent in 1946.",
  },
  {
    polityId: 1122,
    tag: "VNM",
    historicalName: "Democratic Republic of Vietnam",
    commonName: "Vietnam",
    status: "independent",
    activeFrom: "1945-09-02",
    activeTo: null,
    capitalName: "Hanoi",
    flagKey: null,
    confidence: "high",
    notes: "Tonkin, Annam and Cochinchina; partitioned in 1954 and reunified in 1976.",
  },
  {
    polityId: 1123,
    tag: "LAO",
    historicalName: "Kingdom of Laos",
    commonName: "Laos",
    status: "independent",
    activeFrom: "1949-07-19",
    activeTo: null,
    capitalName: "Vientiane",
    flagKey: null,
    confidence: "high",
    notes: "French protectorate within Indochina; independent in 1953.",
  },
  {
    polityId: 1124,
    tag: "KHM",
    historicalName: "Kingdom of Cambodia",
    commonName: "Cambodia",
    status: "independent",
    activeFrom: "1953-11-09",
    activeTo: null,
    capitalName: "Phnom Penh",
    flagKey: null,
    confidence: "high",
    notes: "French protectorate from 1863; independent in 1953.",
  },
  {
    polityId: 1125,
    tag: "PRK",
    historicalName: "Democratic People's Republic of Korea",
    commonName: "North Korea",
    status: "independent",
    activeFrom: "1948-09-09",
    activeTo: null,
    capitalName: "Pyongyang",
    flagKey: null,
    confidence: "high",
    notes: "Soviet occupation zone south of the 38th parallel; the northern half of the Korean Empire.",
  },
  {
    polityId: 1126,
    tag: "ROK",
    historicalName: "Republic of Korea",
    commonName: "South Korea",
    status: "independent",
    activeFrom: "1948-08-15",
    activeTo: null,
    capitalName: "Seoul",
    flagKey: null,
    confidence: "high",
    notes: "American occupation zone south of the 38th parallel; the southern half of the Korean Empire.",
  },
  {
    polityId: 1127,
    tag: "MNG",
    historicalName: "Mongolian People's Republic",
    commonName: "Mongolia",
    status: "independent",
    activeFrom: "1924-11-26",
    activeTo: null,
    capitalName: "Ulaanbaatar",
    flagKey: null,
    confidence: "high",
    notes: "Outer Mongolia under Qing rule in 1900; autonomous in 1911 and a Soviet-aligned republic in 1924.",
  },
  {
    polityId: 1128,
    tag: "TIB",
    historicalName: "Tibet",
    commonName: "Tibet",
    status: "independent",
    activeFrom: "1913-02-13",
    activeTo: null,
    capitalName: "Lhasa",
    flagKey: null,
    confidence: "medium",
    notes: "Qing suzerainty in 1900; the 1913 declaration of independence and the 1951 incorporation are alternative paths.",
  },
  {
    polityId: 1129,
    tag: "ROC",
    historicalName: "Republic of China",
    commonName: "China",
    status: "independent",
    activeFrom: "1912-01-01",
    activeTo: null,
    capitalName: "Nanjing",
    flagKey: null,
    confidence: "high",
    notes: "Successor to the Qing Empire; the 1949 retreat to Taiwan leaves the mainland to the PRC.",
  },
  {
    polityId: 1130,
    tag: "PRC",
    historicalName: "People's Republic of China",
    commonName: "China",
    status: "independent",
    activeFrom: "1949-10-01",
    activeTo: null,
    capitalName: "Beijing",
    flagKey: null,
    confidence: "high",
    notes: "Mainland China from 1949; Taiwan remains under the Republic of China.",
  },
  {
    polityId: 1131,
    tag: "MAN",
    historicalName: "Manchukuo",
    commonName: "Manchuria",
    status: "independent",
    activeFrom: "1932-03-01",
    activeTo: "1945-08-18",
    capitalName: "Xinjing",
    flagKey: null,
    confidence: "medium",
    notes: "Japanese-sponsored state in Manchuria; sovereignty returns to China in 1945.",
  },
  {
    polityId: 1132,
    tag: "KAZ",
    historicalName: "Republic of Kazakhstan",
    commonName: "Kazakhstan",
    status: "independent",
    activeFrom: "1991-12-16",
    activeTo: null,
    capitalName: "Almaty",
    flagKey: null,
    confidence: "high",
    notes: "The Kazakh steppe oblasts of the Russian Empire and the Kazakh SSR.",
  },
  {
    polityId: 1133,
    tag: "UZB",
    historicalName: "Republic of Uzbekistan",
    commonName: "Uzbekistan",
    status: "independent",
    activeFrom: "1991-08-31",
    activeTo: null,
    capitalName: "Tashkent",
    flagKey: null,
    confidence: "high",
    notes: "Turkestan governorate-general and the Bukharan and Khivan protectorates.",
  },
  {
    polityId: 1134,
    tag: "TKM",
    historicalName: "Turkmenistan",
    commonName: "Turkmenistan",
    status: "independent",
    activeFrom: "1991-10-27",
    activeTo: null,
    capitalName: "Ashgabat",
    flagKey: null,
    confidence: "high",
    notes: "The Transcaspian oblast of the Russian Empire.",
  },
  {
    polityId: 1135,
    tag: "TJK",
    historicalName: "Republic of Tajikistan",
    commonName: "Tajikistan",
    status: "independent",
    activeFrom: "1991-09-09",
    activeTo: null,
    capitalName: "Dushanbe",
    flagKey: null,
    confidence: "high",
    notes: "Eastern Bukhara and the Pamir districts of the Russian Empire.",
  },
  {
    polityId: 1136,
    tag: "KGZ",
    historicalName: "Kyrgyz Republic",
    commonName: "Kyrgyzstan",
    status: "independent",
    activeFrom: "1991-08-31",
    activeTo: null,
    capitalName: "Bishkek",
    flagKey: null,
    confidence: "high",
    notes: "Semirechye and the Kyrgyz districts of Turkestan.",
  },
  {
    polityId: 1137,
    tag: "GEO",
    historicalName: "Democratic Republic of Georgia",
    commonName: "Georgia",
    status: "independent",
    activeFrom: "1991-04-09",
    activeTo: null,
    capitalName: "Tbilisi",
    flagKey: null,
    confidence: "high",
    notes: "Tiflis and Kutais governorates; briefly independent in 1918-1921 and again from 1991.",
  },
  {
    polityId: 1138,
    tag: "ARM",
    historicalName: "Republic of Armenia",
    commonName: "Armenia",
    status: "independent",
    activeFrom: "1991-09-21",
    activeTo: null,
    capitalName: "Yerevan",
    flagKey: null,
    confidence: "high",
    notes: "Erivan governorate and the Kars oblast; the 1918 republic and the 1991 republic are alternative paths.",
  },
  {
    polityId: 1139,
    tag: "AZE",
    historicalName: "Republic of Azerbaijan",
    commonName: "Azerbaijan",
    status: "independent",
    activeFrom: "1991-08-30",
    activeTo: null,
    capitalName: "Baku",
    flagKey: null,
    confidence: "high",
    notes: "Baku and Elisavetpol governorates; briefly independent in 1918-1920 and again from 1991.",
  },
  {
    polityId: 1140,
    tag: "TLS",
    historicalName: "Democratic Republic of Timor-Leste",
    commonName: "East Timor",
    status: "independent",
    activeFrom: "1975-11-28",
    activeTo: null,
    capitalName: "Dili",
    flagKey: null,
    confidence: "high",
    notes: "Portuguese Timor; Indonesian occupation from 1975 and independence in 2002.",
  },
  {
    polityId: 1141,
    tag: "BRN",
    historicalName: "Brunei Darussalam",
    commonName: "Brunei",
    status: "independent",
    activeFrom: "1984-01-01",
    activeTo: null,
    capitalName: "Bandar Seri Begawan",
    flagKey: null,
    confidence: "high",
    notes: "British protectorate in 1900; independent in 1984.",
  },
  {
    polityId: 1142,
    tag: "MDV",
    historicalName: "Republic of Maldives",
    commonName: "Maldives",
    status: "independent",
    activeFrom: "1965-07-26",
    activeTo: null,
    capitalName: "Male",
    flagKey: null,
    confidence: "high",
    notes: "British protectorate in 1900; independent in 1965.",
  },
  {
    polityId: 1143,
    tag: "BHU",
    historicalName: "Kingdom of Bhutan",
    commonName: "Bhutan",
    status: "independent",
    activeFrom: "1949-08-08",
    activeTo: null,
    capitalName: "Thimphu",
    flagKey: null,
    confidence: "high",
    notes: "Independent Himalayan kingdom under British suzerainty in 1900; the 1949 treaty with India restored full sovereignty.",
  },
  {
    polityId: 1144,
    tag: "PSE",
    historicalName: "State of Palestine",
    commonName: "Palestine",
    status: "independent",
    activeFrom: "1988-11-15",
    activeTo: null,
    capitalName: "Ramallah",
    flagKey: null,
    confidence: "medium",
    notes:
      "The Palestinian territories occupied in 1967. The province split separates the West Bank/Gaza unit from the Israeli-held Jerusalem unit; the line approximates the 1949 armistice line.",
  },
];

/** 1900 owner polity ids (catalog ids, never renumbered). */
const OWNER_ID = {
  USA: 0,
  GBR: 1,
  FRA: 3,
  RUS: 4,
  JPN: 5,
  PRT: 8,
  NLD: 9,
  OTT: 20,
  CHN: 26,
  KOR: 27,
  PER: 28,
  AFG: 29,
  NPL: 30,
  THA: 31,
  OMN: 32,
  SHM: 65,
};

/** Simulation-region id for each 1900 map feature. */
const REGION_ID = {
  OTT: 20,
  SHM: 65,
  OMN: 32,
  PER: 28,
  AFG: 29,
  NPL: 30,
  BHU: 159,
  THA: 31,
  CHN: 26,
  TIB: 162,
  KOR: 27,
  JPN: 5,
  TWN: 161,
  RUS: 4,
  KHI: 163,
  BUK: 164,
  BIN: 100,
  CEY: 101,
  MAL: 102,
  HKG: 103,
  KUW: 104,
  TRU: 105,
  DEI: 145,
  FIC: 125,
  PHL: 150,
  PTM: 141,
  MAC: 142,
  SAR: 165,
  BPO: 117,
};

/** Admin-1 countries that the Asia plan is expected to consume completely. */
const ASIA_COUNTRIES = new Set([
  "AFG", "ARE", "ARM", "AZE", "BGD", "BHR", "BHS", "BRN", "BTN", "CHN", "GEO", "HKG", "IDN",
  "IND", "IRN", "IRQ", "ISR", "JOR", "JPN", "KAZ", "KGZ", "KHM", "KOR", "KWT", "LAO", "LBN",
  "LKA", "MAC", "MDV", "MMR", "MNG", "MYS", "NPL", "OMN", "PAK", "PHL", "PRK", "PSX", "QAT",
  "SAU", "SGP", "SYR", "THA", "TJK", "TKM", "TLS", "TUR", "TWN", "UZB", "VNM", "YEM",
]);

/** Map features inside the Asia work package. */
const ASIA_TAGS = new Set([
  "OTT", "SHM", "OMN", "PER", "AFG", "NPL", "BHU", "THA", "CHN", "TIB", "KOR", "JPN", "TWN",
  "RUS", "KHI", "BUK", "BIN", "CEY", "MAL", "HKG", "KUW", "TRU", "DEI", "FIC", "PHL", "PTM",
  "MAC", "SAR", "BPO",
]);

/** Ottoman Thrace units are covered by the M12a European bundle. */
const EUROPE_TURKEY_CODES = new Set(["TR-22", "TR-34", "TR-39", "TR-59"]);

/** The M12a Ottoman Europe clip; Asia provinces must not repaint it. */
export const EUROPE_OTT_CLIP = [
  [18, 36.5],
  [23, 35.5],
  [26, 36],
  [28, 40],
  [30, 41.5],
  [30, 43],
  [18, 43],
];

/**
 * Authored Qing/Manchukuo-scale internal boundaries for Manchuria.
 *
 * Natural Earth has no Chinese prefecture-level blocks, so Rehe and Xing'an are
 * approximated by low-confidence historical lines through the modern Hebei,
 * Liaoning and Inner Mongolia provinces. Rehe follows the Yanshan/Liaoxi rim;
 * Xing'an covers Hulunbuir and the Hinggan foothills. They are disjoint and
 * share the 44.8°N line, so the two provinces tile without overlap or gaps.
 */
export const REHE_POLYGON = [
  [115.5, 40.9],
  [116.6, 40.4],
  [118.0, 40.2],
  [119.6, 40.0],
  [121.2, 40.3],
  [122.6, 41.2],
  [123.4, 42.6],
  [123.2, 44.8],
  [122.2, 44.8],
  [120.5, 44.8],
  [118.8, 44.2],
  [117.5, 44.6],
  [115.5, 44.8],
];

export const XINGAN_POLYGON = [
  [115.5, 44.8],
  [117.5, 44.6],
  [118.8, 44.2],
  [120.5, 44.8],
  [122.2, 44.8],
  [123.2, 44.8],
  [124.5, 46.0],
  [126.0, 48.0],
  [126.0, 52.0],
  [124.0, 53.5],
  [121.0, 53.5],
  [119.0, 51.0],
  [117.5, 49.5],
  [116.0, 47.0],
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
 * Build the complete Asia province plan.
 *
 * @param {readonly {code: string, name: string, nameLocal: string, country: string,
 *   region: string, type: string, lat: number, lon: number,
 *   polities?: readonly string[], label?: readonly number[]}[]} units
 */
export function buildAsiaProvincePlan(units) {
  const byCode = new Map(units.map((unit) => [unit.code, unit]));
  const provinces = [];
  const claimedByTag = new Map();
  const missingCodes = new Set();
  const duplicateKeys = new Set();
  const claimedElsewhere = [];
  const keys = new Set();
  const usedCodes = new Set();

  function claimsFor(mapTag) {
    if (!claimedByTag.has(mapTag)) claimedByTag.set(mapTag, new Set());
    return claimedByTag.get(mapTag);
  }

  function claim(mapTag, code) {
    const claims = claimsFor(mapTag);
    if (claims.has(code)) return;
    claims.add(code);
  }

  function restCodes(mapTag, country) {
    const claims = claimsFor(mapTag);
    return units
      .filter(
        (unit) =>
          unit.country === country &&
          (unit.polities ?? []).includes(mapTag) &&
          !claims.has(unit.code),
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
    codes = [],
    restCountry = null,
    clip = null,
    exclude = null,
    sources = ["natural-earth-10m-admin1", "project-authored-1900", "project-authored-m12"],
  }) {
    if (!key.startsWith("as-")) throw new Error(`Asia province key must start with as-: ${key}`);
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
        // Boundary units legitimately straddle two 1900 polities; a unit whose
        // label point is elsewhere is more likely a plan mistake, so record it.
        claimedElsewhere.push(`${key}:${code}(${unit.polities.join("+")})`);
      }
      resolved.push(code);
      claim(mapTag, code);
      usedCodes.add(code);
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
        key: overrides.key ?? `as-${mapTag.toLowerCase()}-${slug(name)}`,
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

  // ---------------------------------------------------------------------------
  // Ottoman Asia: Anatolia, the Levant, Mesopotamia, Arabia, Hejaz and Yemen
  // ---------------------------------------------------------------------------
  const ottomanAsiaExclude = { exclude: [{ polygon: EUROPE_OTT_CLIP }] };
  addGroups(
    "OTT",
    "OTT",
    "Ottoman Asia",
    "Ottoman vilayet grouping",
    "medium",
    "A 1900 Ottoman vilayet of Anatolia or the Arab provinces. Modern Turkish, Syrian, Iraqi, Lebanese, Jordanian, Israeli/Palestinian, Saudi and Yemeni units are grouped around the historic vilayet scale.",
    [
      ["Hudavendigar", ["TR-03", "TR-10", "TR-11", "TR-16", "TR-34", "TR-41", "TR-43", "TR-54", "TR-77", "TR-17"]],
      ["Aydin", ["TR-09", "TR-20", "TR-35", "TR-45", "TR-48", "TR-64"]],
      ["Konya", ["TR-07", "TR-15", "TR-32", "TR-42", "TR-51", "TR-70"]],
      ["Ankara", ["TR-06", "TR-18", "TR-26", "TR-38", "TR-40", "TR-50", "TR-66", "TR-68", "TR-71"]],
      ["Kastamonu", ["TR-14", "TR-37", "TR-57", "TR-67", "TR-74", "TR-78", "TR-81"]],
      ["Sivas", ["TR-05", "TR-19", "TR-58", "TR-60"]],
      ["Trabzon", ["TR-28", "TR-29", "TR-52", "TR-53", "TR-55", "TR-61", "TR-69"]],
      ["Erzurum", ["TR-12", "TR-24", "TR-25", "TR-49"]],
      ["Van", ["TR-04", "TR-30", "TR-65", "TR-73", "TR-76"]],
      ["Bitlis", ["TR-13", "TR-56"]],
      [
        "Diyarbekir",
        ["TR-21", "TR-47", "TR-72"],
        { notes: "Diyarbekir vilayet; the modern Batman and Mardin units are grouped with Diyarbakir." },
      ],
      ["Mamuret-ul-Aziz", ["TR-02", "TR-23", "TR-44", "TR-62"]],
      ["Adana", ["TR-01", "TR-33", "TR-80"]],
      [
        "Hatay",
        ["TR-31"],
        {
          confidence: "low",
          notes:
            "The Alexandretta/Hatay district of Aleppo vilayet. It remained in French-mandate Syria after 1923 and was annexed by Turkey in 1939; a separate province lets that transfer happen without moving Syrian territory.",
        },
      ],
      [
        "Aleppo",
        ["SY-DY", "SY-HA", "SY-HL", "SY-ID", "SY-RA"],
        {
          notes:
            "The Syrian districts of Aleppo vilayet. The northern Turkish districts (Urfa, Maras, Antep, Kilis) are a separate province so the 1923 Turco-Syrian frontier can be formed.",
        },
      ],
      [
        "Urfa",
        ["TR-27", "TR-46", "TR-63", "TR-79"],
        {
          notes:
            "The northern districts of Aleppo vilayet (Urfa, Maras, Antep, Kilis) that passed to Turkey in 1920-1923.",
        },
      ],
      [
        "Lebanon",
        ["LB-AS", "LB-BA", "LB-BI", "LB-JA", "LB-JL", "LB-NA"],
        {
          notes:
            "The Mount Lebanon mutasarrifate and the coastal Lebanese districts. Mount Lebanon's autonomy is recorded through the province grouping, not a separate polity.",
        },
      ],
      [
        "Syrian Coast",
        ["SY-HI", "SY-LA", "SY-TA"],
        {
          notes:
            "The Syrian coastal and Homs districts of Beirut vilayet, kept separate from Lebanon so the 1920 Syro-Lebanese frontier can be formed.",
        },
      ],
      ["Damascus", ["SY-DI", "SY-DR", "SY-HM", "SY-QU", "SY-RD", "SY-SU", "SY-X01~"]],
      [
        "Jerusalem",
        ["IL-D", "IL-HA", "IL-JM", "IL-M", "IL-TA", "IL-Z"],
        {
          confidence: "low",
          notes:
            "The Israeli-held districts of the Jerusalem mutasarrifate. The split from the Palestine province approximates the 1949 armistice line and exists so Israel and Palestine can be separate owners.",
        },
      ],
      [
        "Palestine",
        ["PS-GZZ", "PS-WBK"],
        {
          confidence: "low",
          notes:
            "The West Bank and Gaza districts of the Jerusalem mutasarrifate. The split from the Jerusalem province approximates the 1949 armistice line and exists so a Palestinian state can own territory without changing any polygon.",
        },
      ],
      ["Transjordan", ["JO-AJ", "JO-AM", "JO-AQ", "JO-AT", "JO-AZ", "JO-BA", "JO-IR", "JO-JA", "JO-KA", "JO-MA", "JO-MD", "JO-MN"]],
      ["Baghdad", ["IQ-AN", "IQ-BB", "IQ-BG", "IQ-DI", "IQ-KA", "IQ-NA", "IQ-QA", "IQ-SD", "IQ-TS", "IQ-WA"]],
      ["Basra", ["IQ-BA", "IQ-DQ", "IQ-MA", "IQ-MU"]],
      ["Mosul", ["IQ-AR", "IQ-DA", "IQ-NI", "IQ-SU"]],
      ["Hejaz", ["SA-02", "SA-03", "SA-07"]],
      [
        "Yemen",
        [
          "YE-AM", "YE-DH", "YE-HJ", "YE-HU", "YE-IB", "YE-JA", "YE-MA", "YE-MW", "YE-RA",
          "YE-SA", "YE-SD", "YE-SN", "YE-TA",
        ],
      ],
      ["Asir", ["SA-09", "SA-10", "SA-11", "SA-14"]],
      ["Al-Hasa", ["QA-DA", "QA-KH", "QA-MS", "QA-RA", "QA-US", "QA-WA", "QA-ZA", "SA-04"]],
      [
        "Dodecanese",
        ["GR-L"],
        {
          confidence: "low",
          notes:
            "Rhodes, Kos and the Dodecanese were Ottoman in 1900 and were occupied by Italy in 1912; the modern Greek regional unit is a proxy for the island group.",
        },
      ],
    ],
    ottomanAsiaExclude,
  );

  // ---------------------------------------------------------------------------
  // Arabian interior and the Gulf
  // ---------------------------------------------------------------------------
  addGroups(
    "SHM",
    "SHM",
    "Emirate of Jabal Shammar",
    "Rashidi emirate",
    "medium",
    "The Rashidi emirate of Ha'il controlled northern and central Arabia in 1900; Riyadh had been occupied in 1891.",
    [
      ["Ha'il", ["SA-05", "SA-06"]],
      ["Riyadh", ["SA-01"]],
      ["Northern Arabia", ["SA-08", "SA-12"]],
    ],
  );
  addGroups(
    "OMN",
    "OMN",
    "Sultanate of Muscat and Oman",
    "Omani province",
    "medium",
    "Muscat and the coastal provinces were the sultanate's core; Dhofar was a separate dependency.",
    [
      ["Muscat", ["OM-BA", "OM-BJ", "OM-BU", "OM-DA", "OM-MA", "OM-MU", "OM-SH", "OM-SS", "OM-ZA"]],
      ["Dhofar", ["OM-WU", "OM-ZU"]],
      [
        "Gwadar",
        ["PK-BA"],
        {
          confidence: "low",
          notes:
            "Gwadar was an Omani possession on the Makran coast until 1958; the modern Baluchistan unit is clipped to the Omani 1900 polygon.",
        },
      ],
    ],
  );
  addGroups(
    "KUW",
    "GBR",
    "Kuwait",
    "British protectorate",
    "high",
    "Kuwait was an autonomous Ottoman kaza under British protection from 1899; the whole 1900 territory is one province.",
    [["Kuwait", ["KW-AH", "KW-FA", "KW-HA", "KW-JA", "KW-KU", "KW-MU"]]],
  );
  addGroups(
    "TRU",
    "GBR",
    "Trucial Coast and Bahrain",
    "British protectorate",
    "medium",
    "The Trucial sheikhdoms and Bahrain were under British protection; Bahrain's 1900 status is recorded as a separate province.",
    [
      ["Trucial Coast", ["AE-AJ", "AE-AZ", "AE-DU", "AE-FU", "AE-RK", "AE-SH", "AE-UQ", "AE-X01~", "AE-X02~"]],
      ["Bahrain", ["BH-13", "BH-14", "BH-15", "BH-16", "BH-17"]],
    ],
  );

  // ---------------------------------------------------------------------------
  // Qajar Persia
  // ---------------------------------------------------------------------------
  addGroups(
    "PER",
    "PER",
    "Qajar Persia",
    "Qajar province",
    "medium",
    "A grouping of modern Iranian ostans around the historic Qajar provinces.",
    [
      ["Azerbaijan", ["IR-01", "IR-02", "IR-03"]],
      ["Gilan", ["IR-19"]],
      ["Mazandaran", ["IR-21", "IR-27"]],
      ["Khorasan", ["IR-29", "IR-30", "IR-31"]],
      ["Kerman", ["IR-15"]],
      ["Sistan", ["IR-13"]],
      ["Fars", ["IR-06", "IR-14", "IR-18", "IR-23"]],
      ["Isfahan", ["IR-04", "IR-08", "IR-22", "IR-25", "IR-26"]],
      ["Kermanshah", ["IR-05", "IR-16", "IR-17", "IR-20"]],
      ["Tehran", ["IR-07", "IR-11", "IR-12", "IR-24", "IR-28"]],
      ["Khuzestan", ["IR-10"]],
    ],
  );

  // ---------------------------------------------------------------------------
  // Afghanistan, Nepal and Bhutan
  // ---------------------------------------------------------------------------
  addGroups(
    "AFG",
    "AFG",
    "Emirate of Afghanistan",
    "Afghan province",
    "medium",
    "Afghan provincial groupings of the 1900 emirate; the Durand Line is the 1893 frontier.",
    [
      ["Kabul", ["AF-GHA", "AF-KAB", "AF-KAP", "AF-KHO", "AF-KNR", "AF-LAG", "AF-LOG", "AF-NAN", "AF-NUR", "AF-PAR", "AF-PIA", "AF-PKA", "AF-WAR"]],
      ["Herat", ["AF-BDG", "AF-FRA", "AF-GHO", "AF-HER"]],
      ["Kandahar", ["AF-HEL", "AF-KAN", "AF-NIM", "AF-URU", "AF-ZAB"]],
      ["Afghan Turkestan", ["AF-BAL", "AF-BGL", "AF-FYB", "AF-JOW", "AF-KDZ", "AF-SAM", "AF-SAR", "AF-TAK"]],
      ["Hazarajat", ["AF-BAM"]],
      ["Badakhshan", ["AF-BDS"]],
    ],
  );
  addGroups(
    "NPL",
    "NPL",
    "Kingdom of Nepal",
    "Nepalese province grouping",
    "medium",
    "Nepal remained independent; the modern development regions are grouped into a western and an eastern province.",
    [
      ["Western Nepal", ["NP-BH", "NP-DH", "NP-GA", "NP-KA", "NP-LU", "NP-MA", "NP-RA", "NP-SE"]],
      ["Eastern Nepal", ["NP-BA", "NP-JA", "NP-KO", "NP-ME", "NP-NA", "NP-SA"]],
    ],
  );
  addGroups(
    "BHU",
    "GBR",
    "Kingdom of Bhutan",
    "British suzerainty",
    "medium",
    "Bhutan was an independent Himalayan kingdom under British suzerainty after the 1865 Treaty of Sinchula. It is owned by the British crown in the 1900 model and can be transferred to the future Bhutan polity.",
    [
      ["Western Bhutan", ["BT-11", "BT-12", "BT-13", "BT-14", "BT-15", "BT-21", "BT-22", "BT-23", "BT-24", "BT-32", "BT-33", "BT-GA"]],
      ["Eastern Bhutan", ["BT-31", "BT-34", "BT-41", "BT-42", "BT-43", "BT-44", "BT-45", "BT-TY"]],
    ],
  );

  // ---------------------------------------------------------------------------
  // Siam
  // ---------------------------------------------------------------------------
  addGroups(
    "THA",
    "THA",
    "Kingdom of Siam",
    "Siamese monthon grouping",
    "medium",
    "The Siamese monthon (circle) system of 1900, grouped from modern changwat.",
    [
      ["Bangkok", ["TH-10", "TH-11", "TH-12", "TH-13", "TH-14", "TH-15", "TH-16", "TH-17", "TH-18", "TH-19", "TH-70", "TH-71", "TH-72", "TH-73", "TH-74", "TH-75", "TH-76", "TH-77"]],
      ["Nakhon Sawan", ["TH-60", "TH-61", "TH-62", "TH-63", "TH-64", "TH-65", "TH-66", "TH-67"]],
      ["Phitsanulok", ["TH-50", "TH-51", "TH-52", "TH-53", "TH-54", "TH-55", "TH-56", "TH-57", "TH-58"]],
      ["Nakhon Ratchasima", ["TH-30", "TH-31", "TH-32", "TH-33", "TH-34", "TH-35", "TH-36", "TH-37", "TH-38", "TH-39", "TH-40", "TH-41", "TH-42", "TH-43", "TH-44", "TH-45", "TH-46", "TH-47", "TH-48", "TH-49"]],
      ["Nakhon Si Thammarat", ["TH-80", "TH-81", "TH-82", "TH-83", "TH-84", "TH-85", "TH-86", "TH-90", "TH-91", "TH-92", "TH-93", "TH-94", "TH-95", "TH-96"]],
      ["Chanthaburi", ["TH-20", "TH-21", "TH-22", "TH-23", "TH-24", "TH-25", "TH-26", "TH-27"]],
      [
        "Inner Cambodia",
        ["KH-1", "KH-2", "KH-13", "KH-17", "KH-19", "KH-22"],
        {
          notes:
            "Battambang, Siem Reap and Sisophon were Siamese until the 1907 treaty with France; the modern Cambodian units are clipped to the 1900 Siamese polygon.",
        },
      ],
      [
        "Kedah and Perlis",
        ["MY-02", "MY-09"],
        {
          notes:
            "Kedah and Perlis were Siamese tributaries until the 1909 Anglo-Siamese treaty; the modern Malaysian units are clipped to the 1900 Siamese polygon.",
        },
      ],
      ["Kelantan", ["MY-03"], { notes: "Kelantan was a Siamese tributary until 1909." }],
      ["Terengganu", ["MY-11"], { notes: "Terengganu was a Siamese tributary until 1909." }],
      [
        "Xaignabouri",
        ["LA-XA"],
        {
          notes:
            "Xaignabouri (Sayaboury) was Siamese until the 1907 treaty with France; the modern Lao unit is clipped to the 1900 Siamese polygon.",
        },
      ],
    ],
  );

  // ---------------------------------------------------------------------------
  // Qing China, Mongolia, Xinjiang, Tibet and Manchuria
  // ---------------------------------------------------------------------------
  addGroups(
    "CHN",
    "CHN",
    "Qing Empire",
    "Qing province",
    "medium",
    "A Qing province of China proper, Manchuria, Mongolia or Xinjiang. Modern provinces are a close proxy for the 1900 provincial boundaries.",
    [
      ["Zhili", ["CN-BJ", "CN-HE", "CN-TJ"], { exclude: [{ polygon: REHE_POLYGON }] }],
      ["Shandong", ["CN-SD"]],
      ["Shanxi", ["CN-SX"]],
      ["Henan", ["CN-HA"]],
      ["Shaanxi", ["CN-SN"]],
      ["Gansu", ["CN-GS", "CN-NX"]],
      ["Qinghai", ["CN-QH"]],
      ["Jiangsu", ["CN-JS", "CN-SH"]],
      ["Anhui", ["CN-AH"]],
      ["Jiangxi", ["CN-JX"]],
      ["Zhejiang", ["CN-ZJ"]],
      ["Fujian", ["CN-FJ"]],
      ["Hubei", ["CN-HB"]],
      ["Hunan", ["CN-HN"]],
      ["Guangdong", ["CN-GD", "CN-HI", "CN-X01~"]],
      ["Guangxi", ["CN-GX"]],
      ["Sichuan", ["CN-CQ", "CN-SC"]],
      ["Yunnan", ["CN-YN"]],
      ["Guizhou", ["CN-GZ"]],
      ["Xinjiang", ["CN-XJ"]],
      ["Fengtian", ["CN-LN"], { exclude: [{ polygon: REHE_POLYGON }] }],
      ["Jilin", ["CN-JL"]],
      ["Heilongjiang", ["CN-HL"]],
      [
        "Rehe",
        ["CN-HE", "CN-LN", "CN-NM"],
        {
          clip: [{ polygon: REHE_POLYGON }],
          confidence: "low",
          notes:
            "Historical Rehe (Jehol), the province transferred to Manchukuo in 1933. The boundary is an authored approximation through modern Hebei, Liaoning and Inner Mongolia because Natural Earth has no Chinese prefecture blocks.",
        },
      ],
      [
        "Xing'an",
        ["CN-NM"],
        {
          clip: [{ polygon: XINGAN_POLYGON }],
          confidence: "low",
          notes:
            "Historical Xing'an (Hsingan), the western Manchurian province of Manchukuo covering Hulunbuir and the Hinggan foothills. The boundary is an authored approximation through modern Inner Mongolia.",
        },
      ],
      [
        "Inner Mongolia",
        ["CN-NM"],
        { exclude: [{ polygon: REHE_POLYGON }, { polygon: XINGAN_POLYGON }] },
      ],
      ["Khalkha Mongolia", ["MN-035", "MN-037", "MN-041", "MN-047", "MN-049", "MN-057", "MN-067", "MN-073", "MN-1"]],
      ["Western Mongolia", ["MN-043", "MN-046", "MN-071"]],
      ["Eastern and Gobi Mongolia", ["MN-039", "MN-051", "MN-053", "MN-055", "MN-059", "MN-061", "MN-063", "MN-064", "MN-065", "MN-069"]],
    ],
  );
  addGroups(
    "TIB",
    "CHN",
    "Tibet",
    "Tibetan province grouping",
    "low",
    "Tibet under Qing suzerainty. The M11c map treats Tibet as a separate feature; the province is transferable to a future Tibet polity.",
    [
      ["U-Tsang", ["CN-XZ"], { confidence: "medium" }],
      [
        "Kham",
        ["CN-QH", "CN-SC", "CN-YN"],
        {
          notes:
            "The eastern Tibetan districts around Kham are approximated by the parts of modern Qinghai, Sichuan and Yunnan that fall inside the M11c Tibet polygon.",
        },
      ],
    ],
  );

  // ---------------------------------------------------------------------------
  // Korea, Japan and Taiwan
  // ---------------------------------------------------------------------------
  addGroups(
    "KOR",
    "KOR",
    "Korean Empire",
    "Korean province",
    "medium",
    "The eight historic provinces of the Korean Empire, grouped from modern north and south Korean units.",
    [
      ["Hamgyong", ["KP-08", "KP-09", "KP-10", "KP-13"]],
      ["Pyongan", ["KP-01", "KP-02", "KP-03", "KP-04"]],
      ["Hwanghae", ["KP-05", "KP-06"]],
      [
        "Gangwon",
        ["KR-42"],
        {
          notes:
            "South Gangwon. The historic province crossed the 38th parallel; the northern part is a separate province so the 1945-1948 Korean division can be formed.",
        },
      ],
      [
        "North Kangwon",
        ["KP-07"],
        {
          notes:
            "North Kangwon (the part of the historic Gangwon province north of the 38th parallel).",
        },
      ],
      ["Gyeonggi", ["KR-11", "KR-28", "KR-41", "KR-50"]],
      ["Chungcheong", ["KR-30", "KR-43", "KR-44"]],
      ["Jeolla", ["KR-29", "KR-45", "KR-46", "KR-49"]],
      ["Gyeongsang", ["KR-26", "KR-27", "KR-31", "KR-47", "KR-48"]],
    ],
  );
  addGroups(
    "JPN",
    "JPN",
    "Empire of Japan",
    "Japanese region",
    "high",
    "A historic Japanese region, grouped from modern prefectures.",
    [
      ["Kanto", ["JP-08", "JP-09", "JP-10", "JP-11", "JP-12", "JP-13", "JP-14"]],
      ["Chubu", ["JP-15", "JP-16", "JP-17", "JP-18", "JP-19", "JP-20", "JP-21", "JP-22", "JP-23", "JP-24"]],
      ["Kansai", ["JP-25", "JP-26", "JP-27", "JP-28", "JP-29", "JP-30"]],
      ["Chugoku", ["JP-31", "JP-32", "JP-33", "JP-34", "JP-35"]],
      ["Shikoku", ["JP-36", "JP-37", "JP-38", "JP-39"]],
      ["Kyushu", ["JP-40", "JP-41", "JP-42", "JP-43", "JP-44", "JP-45", "JP-46"]],
      ["Tohoku", ["JP-02", "JP-03", "JP-04", "JP-05", "JP-06", "JP-07"]],
      ["Hokkaido", ["JP-01"]],
      ["Ryukyu", ["JP-47"]],
    ],
  );
  addGroups(
    "TWN",
    "JPN",
    "Taiwan",
    "Taiwanese prefecture grouping",
    "medium",
    "Taiwan was ceded to Japan in 1895; the modern counties are grouped into the historic northern, central and southern prefectures.",
    [
      ["Taihoku", ["TW-HSQ", "TW-HSZ", "TW-ILA", "TW-KEE", "TW-KIN", "TW-MIA", "TW-TAO", "TW-TPE", "TW-TPQ"]],
      ["Taichung", ["TW-CHA", "TW-CYI", "TW-CYQ", "TW-NAN", "TW-PEN", "TW-TXG", "TW-YUN"]],
      ["Tainan", ["TW-HUA", "TW-KHH", "TW-PIF", "TW-TNN", "TW-TTT"]],
    ],
  );

  // ---------------------------------------------------------------------------
  // Asiatic Russia: the Caucasus, Central Asia, Siberia and the Far East
  // ---------------------------------------------------------------------------
  addGroups(
    "RUS",
    "RUS",
    "Caucasus",
    "Russian governorate or oblast",
    "medium",
    "A Caucasian governorate or oblast of the Russian Empire. The 1878 Kars, Ardahan and Batum annexations are included.",
    [
      ["Tiflis", ["GE-KA", "GE-KK", "GE-MM", "GE-SJ", "GE-SK", "GE-TB"]],
      ["Kutais", ["GE-AB", "GE-GU", "GE-IM", "GE-RL", "GE-SZ"]],
      [
        "Batum",
        ["GE-AJ"],
        {
          notes:
            "The Georgian part of Batum oblast. The Artvin district south of the 1921 frontier is a separate province so Georgia's modern border can be formed.",
        },
      ],
      [
        "Artvin",
        ["TR-08"],
        {
          confidence: "low",
          notes:
            "The Artvin district of Batum oblast, transferred to Turkey in 1921; separate from the Georgian Batum province.",
        },
      ],
      [
        "Kars",
        ["TR-36", "TR-75"],
        {
          confidence: "low",
          notes:
            "Kars and Ardahan oblasts, annexed by Russia in 1878 and restored to Turkey in 1921; separate so Armenia and Turkey can be separate owners.",
        },
      ],
      [
        "Erivan",
        ["AM-AG", "AM-AR", "AM-AV", "AM-ER", "AM-GR", "AM-KT", "AM-LO", "AM-SH", "AM-SU", "AM-TV", "AM-VD"],
        {
          notes:
            "Erivan governorate. The Iğdır/Surmalu district is a separate province so Armenia's modern border can be formed.",
        },
      ],
      [
        "Igdir",
        ["TR-76"],
        {
          confidence: "low",
          notes:
            "The Surmalu/Iğdır district of Erivan governorate, transferred to Turkey in 1921.",
        },
      ],
      ["Baku", ["AZ-ABS", "AZ-AGU", "AZ-AGS", "AZ-AST", "AZ-BA", "AZ-BIL", "AZ-CAL", "AZ-GOY", "AZ-HAC", "AZ-IMI", "AZ-ISM", "AZ-KUR", "AZ-LA", "AZ-LER", "AZ-MAS", "AZ-MI", "AZ-NEF", "AZ-QBA", "AZ-QOB", "AZ-QUS", "AZ-SAB", "AZ-SAL", "AZ-SAT", "AZ-SBN", "AZ-SIY", "AZ-SM", "AZ-SMI", "AZ-SR", "AZ-UCA", "AZ-XAC", "AZ-XIZ", "AZ-YAR", "AZ-YEV", "AZ-ZAR"]],
      ["Elisavetpol", ["AZ-AGM", "AZ-AGC", "AZ-BAR", "AZ-BEY", "AZ-CAB", "AZ-DAS", "AZ-FUZ", "AZ-GA", "AZ-GAD", "AZ-GOR", "AZ-GYG", "AZ-KAL", "AZ-NA", "AZ-OGU", "AZ-QAX", "AZ-QAZ", "AZ-QAB", "AZ-QBI", "AZ-SA", "AZ-SKR", "AZ-SMX", "AZ-SUS", "AZ-TAR", "AZ-TOV", "AZ-X01~", "AZ-XCI", "AZ-XVD", "AZ-XA", "AZ-ZAN", "AZ-AGA"]],
      ["Zakatala", ["AZ-BAL", "AZ-ZAQ"]],
      ["Nakhchivan", ["AZ-BAB", "AZ-CUL", "AZ-KAN", "AZ-NX", "AZ-ORD", "AZ-SAD", "AZ-SAH", "AZ-SAR"]],
    ],
  );
  addGroups(
    "RUS",
    "RUS",
    "Turkestan",
    "Russian oblast",
    "medium",
    "A Central Asian oblast of the Russian Empire; the Khivan and Bukharan protectorates are separate map features.",
    [
      ["Uralsk", ["KZ-ATY", "KZ-MAN", "KZ-ZAP"]],
      ["Turgai", ["KZ-AKT", "KZ-KUS"]],
      ["Akmolinsk", ["KZ-AKM", "KZ-AST", "KZ-KAR"]],
      ["Semipalatinsk", ["KZ-PAV", "KZ-SEV", "KZ-VOS"]],
      ["Semirechye", ["KZ-ALA", "KZ-ZHA"]],
      [
        "Kazakh Syr-Darya",
        ["-99-X05~", "KZ-KZY", "KZ-YUZ"],
        {
          notes:
            "The Kazakh part of Syr-Darya oblast, including the Baikonur lease area. Split from the Uzbek part so Kazakhstan and Uzbekistan can be separate owners.",
        },
      ],
      [
        "Uzbek Syr-Darya",
        ["UZ-JI", "UZ-SI", "UZ-TK", "UZ-TO"],
        {
          notes:
            "The Uzbek part of Syr-Darya oblast (Tashkent, Jizzakh, Sirdaryo). Split from the Kazakh part for the 1991 border.",
        },
      ],
      [
        "Fergana",
        ["UZ-AN", "UZ-FA", "UZ-NG"],
        {
          notes:
            "The Uzbek core of Fergana oblast. The Kyrgyz part is a separate province so Kyrgyzstan and Uzbekistan can be separate owners.",
        },
      ],
      [
        "Osh",
        ["KG-B", "KG-J", "KG-O"],
        {
          notes:
            "The Kyrgyz part of Fergana oblast (Osh, Jalal-Abad, Batken).",
        },
      ],
      [
        "Samarkand",
        ["UZ-SA"],
        {
          notes:
            "Samarkand oblast. The Khojand (Leninabad) district is a separate province so Tajikistan and Uzbekistan can be separate owners.",
        },
      ],
      [
        "Khojand",
        ["TJ-SU"],
        {
          confidence: "low",
          notes:
            "The Khojand/Leninabad district of Samarkand oblast, transferred to the Tajik ASSR in 1929.",
        },
      ],
      ["Transcaspia", ["TM-A", "TM-B", "TM-L", "TM-M"]],
      ["Kyrgyz Steppe", ["KG-C", "KG-GB", "KG-N", "KG-T", "KG-Y"]],
      [
        "Pamir",
        ["TJ-GB"],
        {
          confidence: "low",
          notes:
            "The Tajik part of the Pamir (Gorno-Badakhshan). The Wakhan corridor is a separate province so Afghanistan and Tajikistan can be separate owners.",
        },
      ],
      [
        "Wakhan",
        ["AF-BDS"],
        {
          confidence: "low",
          notes:
            "The Afghan Wakhan/Badakhshan corridor, an M11c frontier approximation. It is separate from the Tajik Pamir province so the Afghan border can be formed.",
        },
      ],
    ],
  );
  addGroups(
    "RUS",
    "RUS",
    "Siberia",
    "Russian governorate or oblast",
    "medium",
    "A Siberian or Far Eastern governorate/oblast of the Russian Empire.",
    [
      ["Tobolsk", ["RU-KHM", "RU-TYU", "RU-YAN"]],
      ["Omsk", ["RU-OMS"]],
      ["Tomsk", ["RU-KEM", "RU-NVS", "RU-TOM"]],
      ["Altai", ["RU-AL", "RU-ALT"]],
      ["Yeniseysk", ["RU-KK", "RU-KYA"]],
      ["Irkutsk", ["RU-BU", "RU-IRK"]],
      ["Transbaikal", ["RU-MAG", "RU-ZAB"]],
      ["Yakutsk", ["RU-SA"]],
      ["Amur", ["RU-AMU"]],
      ["Primorye", ["RU-PRI", "RU-YEV"]],
      ["Khabarovsk", ["RU-KHA"]],
      ["Sakhalin", ["RU-SAK"]],
      ["Kamchatka", ["RU-CHU", "RU-KAM"]],
      ["Uriankhai", ["RU-TY"]],
    ],
  );
  addGroups(
    "KHI",
    "RUS",
    "Khanate of Khiva",
    "Russian protectorate",
    "medium",
    "The Khanate of Khiva was a Russian protectorate from 1873; the map feature is separate from Russian Turkestan.",
    [
      [
        "Khiva",
        ["UZ-XO"],
        {
          notes:
            "The Uzbek part of the Khanate of Khiva (Khorezm). The Tashauz district is a separate province so Turkmenistan and Uzbekistan can be separate owners.",
        },
      ],
      [
        "Tashauz",
        ["TM-D"],
        {
          notes:
            "The Turkmen Tashauz district of the Khanate of Khiva, attached to Turkmenistan in 1924.",
        },
      ],
      ["Karakalpak", ["UZ-QR"]],
    ],
  );
  addGroups(
    "BUK",
    "RUS",
    "Emirate of Bukhara",
    "Russian protectorate",
    "medium",
    "The Emirate of Bukhara was a Russian protectorate from 1868; the map feature is separate from Russian Turkestan.",
    [
      ["Bukhara", ["UZ-BU", "UZ-NW", "UZ-QA", "UZ-SU"]],
      ["Eastern Bukhara", ["TJ-DU", "TJ-GB", "TJ-KT", "TJ-X01~"]],
    ],
  );

  // ---------------------------------------------------------------------------
  // British India, Burma, Aden and the princely states
  // ---------------------------------------------------------------------------
  addGroups(
    "BIN",
    "GBR",
    "British India",
    "British Indian province",
    "medium",
    "A province, presidency or major princely state of British India in 1900.",
    [
      ["Bengal", ["IN-WB"]],
      ["Eastern Bengal", ["BD-A", "BD-B", "BD-C", "BD-D", "BD-E", "BD-F", "BD-G"]],
      ["Assam", ["IN-AR", "IN-AS", "IN-ML", "IN-MN", "IN-MZ", "IN-NL", "IN-TR"]],
      ["Bihar", ["IN-BR", "IN-JH"]],
      ["Orissa", ["IN-OR"]],
      ["United Provinces", ["IN-UP", "IN-UT"]],
      [
        "Punjab",
        ["IN-CH", "IN-DL", "IN-HP", "IN-HR", "IN-PB"],
        {
          notes:
            "The Indian districts of the Punjab. The western Punjab is a separate province so the 1947 Radcliffe line can be formed without moving any polygon.",
        },
      ],
      [
        "West Punjab",
        ["PK-IS", "PK-PB"],
        {
          notes:
            "The Pakistani districts of the Punjab (including the Islamabad capital territory), separate from the Indian Punjab for the 1947 partition.",
        },
      ],
      ["Sind", ["PK-SD"]],
      ["North-West Frontier", ["PK-KP", "PK-TA"]],
      ["Baluchistan", ["PK-BA"]],
      [
        "Kashmir",
        ["IN-JK", "IN-LA"],
        {
          notes:
            "The Indian-administered part of Jammu and Kashmir. The Azad Kashmir/Gilgit-Baltistan and Aksai Chin districts are separate provinces so the 1947-1949 ceasefire lines can be formed.",
        },
      ],
      [
        "Azad Kashmir",
        ["PK-GB", "PK-JK"],
        {
          confidence: "low",
          notes:
            "The Pakistan-administered part of Jammu and Kashmir (Azad Kashmir and Gilgit-Baltistan).",
        },
      ],
      [
        "Aksai Chin",
        ["-99-X06~"],
        {
          confidence: "low",
          notes:
            "The Aksai Chin district of Jammu and Kashmir, administered by China after 1962; kept separate so the Sino-Indian frontier can be formed.",
        },
      ],
      ["Rajputana", ["IN-RJ"]],
      ["Central Provinces", ["IN-CT", "IN-MP"]],
      ["Bombay", ["IN-GJ", "IN-MH"]],
      ["Madras", ["IN-AP", "IN-TN"]],
      ["Hyderabad", ["IN-TG"], { special: "autonomous", confidence: "high" }],
      ["Mysore", ["IN-KA"], { special: "autonomous", confidence: "high" }],
      ["Travancore and Cochin", ["IN-KL"], { special: "autonomous" }],
      ["Andaman and Nicobar", ["IN-AN"]],
      // Lakshadweep is not a separate 1900 map feature and the M11c polygon omits
      // the Laccadive islands, so it has no province geometry at this scale.
      ["Sikkim", ["IN-SK"], { special: "autonomous" }],
      ["Burma", ["MM-01", "MM-02", "MM-03", "MM-04", "MM-05", "MM-06", "MM-07"]],
      ["Shan States", ["MM-17"], { special: "autonomous" }],
      ["Frontier Divisions", ["MM-11", "MM-12", "MM-13", "MM-14", "MM-15", "MM-16"]],
      ["Aden", ["YE-AB", "YE-AD", "YE-BA", "YE-DA", "YE-HD", "YE-LA", "YE-MR", "YE-SH"]],
    ],
  );
  addGroups(
    "BIN",
    "PRT",
    "Portuguese India",
    "Portuguese colony",
    "medium",
    "Goa, Daman and Diu were Portuguese possessions inside the Indian subcontinent; the M11c map carries them inside the British India feature.",
    [
      ["Goa", ["IN-GA", "IN-DH"], { confidence: "low", special: "ordinary" }],
    ],
  );

  // ---------------------------------------------------------------------------
  // Ceylon, Malaya, Borneo, Hong Kong and Macao
  // ---------------------------------------------------------------------------
  addGroups(
    "CEY",
    "GBR",
    "Ceylon",
    "Ceylonese province grouping",
    "medium",
    "The British crown colony of Ceylon, grouped from modern districts.",
    [
      ["Western Ceylon", ["LK-11", "LK-12", "LK-13", "LK-91", "LK-92"]],
      ["Central Ceylon", ["LK-21", "LK-22", "LK-23", "LK-81", "LK-82"]],
      ["Northern Ceylon", ["LK-41", "LK-42", "LK-43", "LK-44", "LK-45", "LK-51", "LK-52", "LK-53", "LK-61", "LK-62", "LK-71", "LK-72"]],
      ["Southern Ceylon", ["LK-31", "LK-32", "LK-33"]],
    ],
  );
  addGroups(
    "MAL",
    "GBR",
    "British Malaya",
    "British Malayan state grouping",
    "medium",
    "The Straits Settlements, the Federated Malay States and the Unfederated Malay States, plus British North Borneo and Brunei.",
    [
      ["Straits Settlements", ["MY-04", "MY-07", "SG-01", "SG-02", "SG-03", "SG-04", "SG-05"]],
      ["Federated Malay States", ["MY-05", "MY-06", "MY-08", "MY-10", "MY-14", "MY-16"]],
      ["Johor", ["MY-01"], { special: "autonomous" }],
      // Kedah, Perlis, Kelantan and Terengganu were Siamese in 1900 and are
      // provinces of the Siamese map feature until the 1909 treaty.
      ["British North Borneo", ["MY-12", "MY-15"]],
      ["Brunei", ["BN-BE", "BN-BM", "BN-TE", "BN-TU"], { special: "autonomous" }],
    ],
  );
  addGroups(
    "SAR",
    "GBR",
    "Raj of Sarawak",
    "British protectorate",
    "medium",
    "Sarawak was ruled by the Brooke family as a British protectorate; the whole 1900 territory is one province.",
    [["Sarawak", ["MY-13"]]],
  );
  addGroups(
    "HKG",
    "GBR",
    "Hong Kong",
    "British crown colony",
    "high",
    "The colony of Hong Kong, including Kowloon and the New Territories leased in 1898.",
    [["Hong Kong", ["HK-X01~", "HK-X02~", "HK-X03~", "HK-X04~", "HK-X05~", "HK-X06~", "HK-X07~", "HK-X08~", "HK-X09~", "HK-X10~", "HK-X11~", "HK-X12~", "HK-X13~", "HK-X14~", "HK-X15~", "HK-X16~", "HK-X17~", "HK-X18~"]]],
  );
  addGroups(
    "MAC",
    "PRT",
    "Macao",
    "Portuguese colony",
    "high",
    "Portuguese Macao leased from China; the whole 1900 territory is one province and has no separate admin-1 block.",
    [["Macao", []]],
  );

  // ---------------------------------------------------------------------------
  // French Indochina and French India
  // ---------------------------------------------------------------------------
  addGroups(
    "FIC",
    "FRA",
    "French Indochina",
    "French protectorate or colony",
    "medium",
    "Tonkin, Annam, Cochinchina, Cambodia and Laos, grouped from modern provinces.",
    [
      ["Tonkin", ["VN-01", "VN-02", "VN-03", "VN-04", "VN-05", "VN-06", "VN-07", "VN-09", "VN-13", "VN-14", "VN-18", "VN-20", "VN-53", "VN-54", "VN-56", "VN-61", "VN-63", "VN-66", "VN-67", "VN-68", "VN-69", "VN-70", "VN-71", "VN-HN", "VN-HP"]],
      ["Annam", ["VN-21", "VN-22", "VN-23", "VN-24", "VN-25", "VN-26", "VN-27", "VN-28", "VN-29", "VN-30", "VN-31", "VN-32", "VN-33", "VN-34", "VN-35", "VN-36", "VN-40", "VN-72", "VN-DN"]],
      ["Cochinchina", ["VN-37", "VN-39", "VN-41", "VN-43", "VN-44", "VN-45", "VN-46", "VN-47", "VN-49", "VN-50", "VN-51", "VN-52", "VN-55", "VN-57", "VN-58", "VN-59", "VN-73", "VN-CT", "VN-SG"]],
      ["Cambodia", ["KH-1", "KH-2", "KH-3", "KH-4", "KH-5", "KH-6", "KH-7", "KH-8", "KH-9", "KH-10", "KH-11", "KH-12", "KH-13", "KH-14", "KH-15", "KH-16", "KH-17", "KH-18", "KH-19", "KH-20", "KH-21", "KH-22", "KH-23", "KH-24"]],
      ["Laos", ["LA-AT", "LA-BK", "LA-BL", "LA-CH", "LA-HO", "LA-KH", "LA-LM", "LA-LP", "LA-OU", "LA-PH", "LA-SL", "LA-SV", "LA-VI", "LA-XA", "LA-XE", "LA-XI"]],
      ["French India", ["IN-PY"], { notes: "Pondicherry, Karaikal, Mahe and Yanam were French possessions inside British India." }],
    ],
  );

  // ---------------------------------------------------------------------------
  // Dutch East Indies, the Philippines, Portuguese Timor and the Maldives
  // ---------------------------------------------------------------------------
  addGroups(
    "DEI",
    "NLD",
    "Dutch East Indies",
    "Dutch administrative region",
    "medium",
    "A Dutch East Indies residency grouping, from modern Indonesian provinces.",
    [
      ["West Java", ["ID-BT", "ID-JB", "ID-JK"]],
      ["Central Java", ["ID-JT", "ID-YO"]],
      ["East Java", ["ID-JI"]],
      ["Aceh", ["ID-AC"]],
      ["North Sumatra", ["ID-SU"]],
      ["West Sumatra", ["ID-SB"]],
      ["Riau and Jambi", ["ID-BB", "ID-JA", "ID-KR", "ID-RI"]],
      ["South Sumatra", ["ID-BE", "ID-LA", "ID-SS"]],
      ["West Borneo", ["ID-KB"]],
      ["Central Borneo", ["ID-KT"]],
      ["South and East Borneo", ["ID-KI", "ID-KS"]],
      ["North Sulawesi", ["ID-GO", "ID-SA"]],
      ["Central Sulawesi", ["ID-SR", "ID-ST"]],
      ["South Sulawesi", ["ID-SG", "ID-SN"]],
      ["Moluccas", ["ID-MA", "ID-MU"]],
      ["Bali and Lombok", ["ID-BA", "ID-NB"]],
      ["Timor and Flores", ["ID-NT"]],
      ["New Guinea", ["ID-PA", "ID-PB"]],
    ],
  );
  addGroups(
    "PHL",
    "USA",
    "Philippine Islands",
    "United States insular territory",
    "medium",
    "The Philippines were transferred from Spain to the United States in 1898; the provinces are grouped into Luzon, the Visayas and Mindanao/Sulu.",
    [
      ["Manila and Central Luzon", ["PH-BAN", "PH-BTG", "PH-BUL", "PH-CAV", "PH-LAG", "PH-MNL", "PH-PAM", "PH-QUE", "PH-RIZ", "PH-ZMB"]],
      ["Northern Luzon", ["PH-ABR", "PH-APA", "PH-AUR", "PH-BEN", "PH-BTN", "PH-CAG", "PH-IFU", "PH-ILN", "PH-ILS", "PH-ISA", "PH-KAL", "PH-LUN", "PH-MOU", "PH-NUE", "PH-NUV", "PH-PAN", "PH-QUI", "PH-TAR"]],
      ["Visayas", ["PH-AKL", "PH-ALB", "PH-ANT", "PH-BCD", "PH-BIL", "PH-BOH", "PH-CAM", "PH-CAN", "PH-CAP", "PH-CAS", "PH-CAT", "PH-CEB", "PH-EAS", "PH-GUI", "PH-ILI", "PH-LEY", "PH-MAD", "PH-MAS", "PH-MDC", "PH-MDE", "PH-MDR", "PH-NEC", "PH-NER", "PH-NSA", "PH-ROM", "PH-SIG", "PH-SLE", "PH-SOR", "PH-WSA"]],
      ["Palawan", ["PH-PLW"]],
      ["Mindanao and Sulu", ["PH-AGN", "PH-AGS", "PH-BAS", "PH-BUK", "PH-COM", "PH-DAO", "PH-DAS", "PH-DAV", "PH-LAN", "PH-LAS", "PH-MAG", "PH-MSC", "PH-MSR", "PH-NCO", "PH-SAR", "PH-SCO", "PH-SLU", "PH-SUK", "PH-SUN", "PH-SUR", "PH-TAW", "PH-ZAN", "PH-ZAS", "PH-ZSI"]],
    ],
  );
  addGroups(
    "PTM",
    "PRT",
    "Portuguese Timor",
    "Portuguese colony",
    "medium",
    "Portuguese Timor, from the modern East Timorese districts; West Timor remains part of the Dutch East Indies.",
    [["Timor", ["TL-AL", "TL-AN", "TL-BA", "TL-BO", "TL-CO", "TL-DI", "TL-ER", "TL-LA", "TL-LI", "TL-MF", "TL-MT", "TL-OE", "TL-VI"]]],
  );
  addGroups(
    "BPO",
    "GBR",
    "Maldives",
    "British protectorate",
    "medium",
    "The Maldives were a British protectorate administered from Ceylon; the atolls are one province.",
    [["Maldives", ["MV-00", "MV-01", "MV-02", "MV-03", "MV-04", "MV-05", "MV-07", "MV-08", "MV-12", "MV-13", "MV-14", "MV-17", "MV-20", "MV-23", "MV-24", "MV-25", "MV-26", "MV-27", "MV-28", "MV-29"]]],
  );

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------
  if (missingCodes.size > 0) {
    throw new Error(`Asia province plan references unknown admin-1 codes: ${[...missingCodes].sort().join(", ")}`);
  }
  if (duplicateKeys.size > 0) {
    throw new Error(`Asia province plan has duplicate keys: ${[...duplicateKeys].join(", ")}`);
  }
  if (provinces.length > 2048) {
    throw new Error(`Asia province plan exceeds its 2048-province budget (${provinces.length})`);
  }

  // Assign stable ids deterministically in authored order, in a block disjoint
  // from every M12a Europe id (owner id * 1000 + order, max 66001).
  const seenIds = new Set();
  for (let index = 0; index < provinces.length; index += 1) {
    const id = ASIA_PROVINCE_ID_BASE + index + 1;
    if (seenIds.has(id)) throw new Error(`duplicate province id ${id}`);
    seenIds.add(id);
    provinces[index].provinceId = id;
  }

  // Report units whose label point lies in an Asian 1900 map feature but which
  // no province consumed. This is the primary gap detector for the plan.
  const unassigned = [];
  for (const unit of units) {
    if (!ASIA_COUNTRIES.has(unit.country)) continue;
    if (EUROPE_TURKEY_CODES.has(unit.code)) continue;
    if (usedCodes.has(unit.code)) continue; // already part of another Asian province
    for (const tag of unit.polities ?? []) {
      if (!ASIA_TAGS.has(tag)) continue;
      if (tag === "RUS") continue; // European Russia is covered by M12a.
      if (!claimsFor(tag).has(unit.code)) unassigned.push(`${tag}:${unit.code}`);
    }
  }

  return {
    sources: ASIA_SOURCES,
    futurePolities: ASIA_FUTURE_POLITIES,
    provinces,
    usedCodes: [...usedCodes].sort(),
    unassigned: [...new Set(unassigned)].sort(),
    claimedElsewhere: [...new Set(claimedElsewhere)].sort(),
  };
}

export { ASIA_TAGS, ASIA_COUNTRIES, OWNER_ID, REGION_ID };

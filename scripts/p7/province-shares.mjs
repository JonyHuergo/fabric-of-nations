/**
 * P7 (D-154 item 5f, docs/P7_PROVINCE_PLACEMENT_PROPOSAL.md): 1900 production by state,
 * province or residency, transcribed from the page images, which places the P5b producers
 * tied to land, a deposit or a crop band inside their territory. Read by
 * `scripts/p7/sources-author.mjs` into `provinceShareRows` of p7/sources_1900.json.
 *
 * Each `PS(...)` call is one printed table: the source, the locator, the territory, the
 * producer definitions it places, the measure and unit, and one row per printed unit
 * `[unit as printed, value, game provinces (default: the unit's name), note]`. Values are
 * the printed figures; only shares within the table are used.
 */

export const PROVINCE_SHARE_SOURCES = [
  {
    id: "statab-us-1901",
    title: "Statistical Abstract of the United States, 1901 (Twenty-fourth Number)",
    author: "U.S. Treasury Department, Bureau of Statistics",
    publisher: "Washington: Government Printing Office, 1902",
    url: "https://www2.census.gov/library/publications/1902/compendia/statab/24ed/",
    accessDate: "2026-11-10",
    license: "Public domain (work of the United States Government)",
    attribution: "Statistical Abstract of the United States 1901; tables as given in each locator.",
    notes: "Scanned without a text layer; read from the page images of the census.gov part files (cached in .cache-p5b/census-statab-1901). Part file 1901-06.pdf page n = book page n + 319. Tables printed sideways are read rotated.",
  },
  {
    id: "usda-yearbook-1900",
    title: "Yearbook of the United States Department of Agriculture, 1900",
    author: "U.S. Department of Agriculture",
    publisher: "Washington: Government Printing Office, 1901",
    url: "https://archive.org/details/yearbookofagricu1900unit",
    accessDate: "2026-11-10",
    license: "Public domain (work of the United States Government)",
    attribution: "USDA Yearbook 1900, Statistics of sugar for 1900, p. 819 (Willett & Gray).",
    notes: "Page image read: PDF page 908 = book p. 819 (cached in .cache-p5b/ia-pdf/yoa1900.pdf). The same table gives P5b's country shares of sugar.",
  },
  {
    id: "statabs-british-india-1903-04",
    title: "Statistical Abstract relating to British India (number with the crops of 1903-04), bound in the volume catalogued \"from 1893-94 to 1902-03\"",
    author: "India Office, London",
    publisher: "London: His Majesty's Stationery Office (parliamentary paper), c. 1905",
    url: "https://archive.org/details/india.history.resource.108758",
    accessDate: "2026-11-10",
    license: "Public domain (UK parliamentary paper published over 120 years ago; Crown copyright expired)",
    attribution: "Statistical Abstract relating to British India, table No. 122, Crops under cultivation in 1903-4, in acres, pp. 134-135.",
    notes: "Page images read: PDF pages 428-429 = book pp. 134-135 (cached in .cache-p7/ind-statabs-1904/108758.pdf). The nearest year found with crops by administration: the 1901 number (archive item 108757) prints only the area by administration (table 104). British administrations only; the native states are not in the table. The table's footnote: the total is the area sown, the crop details conventional harvested areas, and every column used here sums to its printed total. The game's Indian provinces follow modern boundaries (point-in-polygon on the province map): Berar and the Nagpur country lie in the game's Bombay, Malabar in Travancore and Cochin, Bellary, South Canara, Dharwar and Coorg in Mysore, Darjeeling and the Duars in Bengal.",
  },
  {
    id: "koloniaal-verslag-1901",
    title: "Koloniaal verslag van 1901, Nederlandsch (Oost-) Indië, Bijlage TT: Opgaven over 1900 betreffende de suikerindustrie op Java",
    author: "Ministerie van Koloniën",
    publisher: "Handelingen der Staten-Generaal, Bijlagen 1901-1902",
    url: "https://archive.org/details/UNIVERSITEITLEIDEN-DIG-KOLONIAAL-VERSLAG-1901",
    accessDate: "2026-11-10",
    license: "Public domain (Dutch parliamentary paper, 1901)",
    attribution: "Koloniaal verslag van 1901, Bijlage TT, Recapitulatie, pp. 16-17 (and note dd).",
    notes: "Page images read: PDF pages 480-481 of the cached scan (.cache-p5b/koloniaal-verslag-1901). Note dd gives, per residency, the 1900 payments of the sugar companies to the native population for wages and deliveries (f 36,132,788, 150 of the 156 companies in the government residencies); the residencies of the Vorstenlanden are not in it, their production is in the recapitulation.",
  },
  {
    id: "brazil-handbook-1901",
    title: "United States of Brazil: a geographical sketch, with special reference to economic conditions and prospects of future development",
    author: "Bureau of the American Republics",
    publisher: "Washington: Government Printing Office, 1901",
    url: "https://archive.org/details/unitedstatesofbr1901bure",
    accessDate: "2026-11-10",
    license: "Public domain (work of the United States Government, 1901)",
    attribution: "Bureau of the American Republics (1901), state chapters: coffee exports of 1899 by state.",
    notes: "Page images read (PDF page = book page + 6, cached in .cache-p5b/brazil-1901). The chapter on Minas Geraes gives no coffee weight (its coffee left by the port of Rio).",
  },
];

/** @param {(sourceId: string, locator: string, territory: string, definitionKeys: string[], measure: string, unit: string, rows: Array<[string, number, string[]?, string?]>) => void} PS */
export function addProvinceShares(PS) {
  // --- United States ---------------------------------------------------------------------
  PS("statab-us-1901", "table 86, pp. 357-358 (part file 1901-06.pdf pp. 38-39), 1900 column", "usa-home", ["coal-mine"], "coal produced, calendar year 1900", "long tons", [
    ["Pennsylvania (anthracite)", 51221353, ["Pennsylvania"]],
    ["Colorado and New Mexico (anthracite)", 87861, ["Colorado", "New Mexico Territory"]],
    ["Maryland", 3593471],
    ["Ohio", 16953705],
    ["Pennsylvania (bituminous)", 71287791, ["Pennsylvania"]],
    ["West Virginia", 20220721],
    ["Colorado", 4626943],
    ["Illinois", 23007126],
    ["Indiana", 5789363],
    ["Iowa", 4645481],
    ["Kansas", 3989170],
    ["Michigan", 758460],
    ["Missouri", 3160806],
    ["Montana", 1483728],
    ["North Dakota", 115967],
    ["Wyoming", 3584466],
    ["California", 153311],
    ["Idaho", 9],
    ["Oregon", 52557],
    ["Utah", 1024131],
    ["Washington", 2209012],
    ["Alabama", 7494888],
    ["Arkansas", 1292808],
    ["Georgia", 281747],
    ["Indian Territory", 1716337, ["Oklahoma Territory and Indian Territory"]],
    ["Kentucky", 4758094, undefined, "Printed 4,758,094; the printed Southern total (23,000,485) and grand total (240,965,917) imply 4,758,004. The 90 tons do not change any share."],
    ["New Mexico", 1127752, ["New Mexico Territory"]],
    ["North Carolina", 15834],
    ["Tennessee", 3311216],
    ["Texas", 864619],
    ["Virginia", 2137280],
  ]);
  PS("statab-us-1901", "table 23, p. 50 (part file 1901-02.pdf p. 50), gold, 1900 column (from the Report of the Director of the Mint)", "usa-home", ["gold-mine"], "estimated coining value of the gold product, calendar year 1900", "dollars", [
    ["Alaska", 8171000],
    ["Arizona", 4193400, ["Arizona Territory"]],
    ["California", 15816200],
    ["Colorado", 28829400],
    ["Georgia", 116700],
    ["Idaho", 1724700],
    ["Michigan", 29000],
    ["Montana", 4698000],
    ["Nevada", 2006200],
    ["New Mexico", 832900, ["New Mexico Territory"]],
    ["North Carolina", 28500],
    ["Oregon", 1694700],
    ["South Carolina", 121000],
    ["South Dakota", 6177600],
    ["Texas", 1100],
    ["Utah", 3972200],
    ["Washington", 718200],
  ]);
  PS("statab-us-1901", "table 23, p. 50 (part file 1901-02.pdf p. 50), silver (coining value), 1900 column (from the Report of the Director of the Mint)", "usa-home", ["silver-mine"], "estimated coining value of the silver product, calendar year 1900", "dollars", [
    ["Alaska", 94772],
    ["Arizona", 3872970, ["Arizona Territory"]],
    ["California", 1217165],
    ["Colorado", 26484234],
    ["Georgia", 517],
    ["Idaho", 8312372],
    ["Michigan", 131879],
    ["Montana", 18353648],
    ["Nevada", 1756703],
    ["New Mexico", 561519, ["New Mexico Territory"]],
    ["North Carolina", 14481],
    ["Oregon", 149204],
    ["South Carolina", 517],
    ["South Dakota", 693269],
    ["Texas", 617244],
    ["Utah", 11982351],
    ["Washington", 290263, undefined, "The scan's 290,263 can be read 296,263; 290,263 makes the printed total 74,533,495."],
  ]);
  PS("statab-us-1901", "table 99, pp. 379-381 (part file 1901-06.pdf pp. 60-62), 1899 row, product", "usa-home", ["cotton-farm"], "cotton crop of 1899", "bales", [
    ["Alabama", 1005313],
    ["Arkansas", 669385],
    ["Florida", 41855],
    ["Georgia", 1345699],
    ["Louisiana", 699476],
    ["Mississippi", 1203739],
    ["North Carolina", 503825],
    ["South Carolina", 830714],
    ["Tennessee", 192263],
    ["Texas", 2438555],
    ["Virginia", 8007],
    ["All other", 204007, ["Oklahoma Territory and Indian Territory", "Missouri", "Kentucky"], "Footnote b: produced chiefly in the Indian Territory, Missouri, Kentucky and Oklahoma."],
  ]);
  PS("usda-yearbook-1900", "p. 819 (PDF 908), sugar crop of the countries named, cane sugar, United States rows, 1900-1901", "usa-home", ["sugar-estate"], "cane-sugar crop 1900-1901", "long tons", [
    ["Louisiana", 270000],
    ["Hawaiian Islands", 306000, ["Hawaii"]],
  ]);

  // --- British India -----------------------------------------------------------------------
  const IND = "table No. 122, Crops under cultivation in 1903-4 (acres), British administrations";
  const BENGAL = ["Bengal", "Eastern Bengal", "Bihar", "Orissa"];
  const MADRAS = ["Madras", "Mysore", "Travancore and Cochin"];
  const BOMBAY = ["Bombay", "Mysore"];
  const CP = ["Central Provinces", "Bombay"];
  const india = (rows) => rows.filter(([, value]) => value > 0);
  PS("statabs-british-india-1903-04", `${IND}, p. 135 (PDF 429), cotton`, "bin", ["cotton-farm"], "area under cotton, 1903-04", "acres", india([
    ["Bengal", 80000, BENGAL],
    ["United Provinces (Agra)", 820353, ["United Provinces"]],
    ["United Provinces (Oudh)", 15385, ["United Provinces"]],
    ["Punjab", 1047532, ["Punjab", "West Punjab"]],
    ["N.W. Frontier Province", 30729, ["North-West Frontier"]],
    ["Upper Burma", 144723, ["Burma"]],
    ["Lower Burma", 14917, ["Burma"]],
    ["Central Provinces", 1305626, CP],
    ["Berar", 2851222, ["Bombay"]],
    ["Assam", 3997, ["Assam"]],
    ["Ajmer-Merwara", 31882, ["Rajputana"]],
    ["Madras", 1769911, MADRAS],
    ["Bombay", 3571824, BOMBAY],
    ["Sind", 207264, ["Sind"]],
    ["Pargana Manpur", 232, ["Central Provinces"]],
  ]), { partialCoverage: "british-administrations" });
  PS("statabs-british-india-1903-04", `${IND}, p. 135 (PDF 429), tea and coffee (acres added; one good in the game)`, "bin", ["plantation"], "area under tea and coffee, 1903-04", "acres", india([
    ["Bengal", 135900, ["Bengal"], "Tea 135,900, coffee none; the Bengal tea districts (Darjeeling, Jalpaiguri) lie in the game's Bengal."],
    ["United Provinces (Agra)", 8259, ["United Provinces"], "Tea."],
    ["Punjab", 9948, ["Punjab"], "Tea (Kangra)."],
    ["Upper Burma", 1676, ["Burma"], "Tea 1,612 + coffee 64."],
    ["Lower Burma", 3, ["Burma"], "Coffee."],
    ["Assam", 338524, ["Assam"], "Tea 338,278 + coffee 246."],
    ["Coorg", 52420, ["Mysore"], "Coffee."],
    ["Madras", 63723, MADRAS, "Tea 12,282 + coffee 51,441."],
    ["Bombay", 73, BOMBAY, "Tea 8 + coffee 65."],
  ]));
  PS("statabs-british-india-1903-04", `${IND}, p. 135 (PDF 429), tobacco`, "bin", ["tobacco-farm"], "area under tobacco, 1903-04", "acres", india([
    ["Bengal", 537900, BENGAL],
    ["United Provinces (Agra)", 40148, ["United Provinces"]],
    ["United Provinces (Oudh)", 11675, ["United Provinces"]],
    ["Punjab", 53658, ["Punjab", "West Punjab"]],
    ["N.W. Frontier Province", 6286, ["North-West Frontier"]],
    ["Upper Burma", 22605, ["Burma"]],
    ["Lower Burma", 41214, ["Burma"]],
    ["Central Provinces", 17373, CP],
    ["Berar", 15044, ["Bombay"]],
    ["Assam", 4466, ["Assam"]],
    ["Ajmer-Merwara", 11, ["Rajputana"]],
    ["Coorg", 59, ["Mysore"]],
    ["Madras", 144799, MADRAS],
    ["Bombay", 72218, BOMBAY],
    ["Sind", 8196, ["Sind"]],
  ]), { partialCoverage: "british-administrations" });
  PS("statabs-british-india-1903-04", `${IND}, p. 134 (PDF 428), sugar cane`, "bin", ["sugar-estate"], "area under sugar cane, 1903-04", "acres", india([
    ["Bengal", 645400, BENGAL],
    ["United Provinces (Agra)", 895453, ["United Provinces"]],
    ["United Provinces (Oudh)", 194277, ["United Provinces"]],
    ["Punjab", 330767, ["Punjab", "West Punjab"]],
    ["N.W. Frontier Province", 27224, ["North-West Frontier"]],
    ["Upper Burma", 2311, ["Burma"]],
    ["Lower Burma", 10797, ["Burma"]],
    ["Central Provinces", 18002, CP],
    ["Berar", 1395, ["Bombay"]],
    ["Assam", 40555, ["Assam"]],
    ["Ajmer-Merwara", 68, ["Rajputana"]],
    ["Madras", 54740, MADRAS],
    ["Bombay", 56838, BOMBAY],
    ["Sind", 2413, ["Sind"]],
    ["Pargana Manpur", 11, ["Central Provinces"]],
  ]), { partialCoverage: "british-administrations" });

  // --- Dutch East Indies -------------------------------------------------------------------
  // Payments to the population (wages and cane deliveries) by residency stand for the place of
  // the cane and the work; the Vorstenlanden production (pikol) is converted to the same
  // footing at the government residencies' own ratio (f 36,132,788 for 10,339,018 pikol of the
  // 154 companies there: 9,694,163 + 541,662 + 103,193, recapitulation column 11).
  const KV_PAID = 36132788;
  const KV_PIKOL = 9694163 + 541662 + 103193;
  PS("koloniaal-verslag-1901", "Bijlage TT, Recapitulatie, note dd, p. 17 (PDF 481): payments by residency, and column 11 for the Vorstenlanden", "dei", ["sugar-estate"], "sugar companies' payments to the population for wages and deliveries, 1900", "guilders", [
    ["Preanger Regentschappen", 17000, ["West Java"]],
    ["Cheribon", 3390385, ["West Java"]],
    ["Tagal", 2636131, ["Central Java"]],
    ["Pekalongan", 1078345, ["Central Java"]],
    ["Samarang", 897319, ["Central Java"]],
    ["Japara", 2684443, ["Central Java"]],
    ["Soerabaja", 9246307, ["East Java"]],
    ["Pasoeroean", 3336766, ["East Java"]],
    ["Probolinggo", 2933331, ["East Java"]],
    ["Bezoeki", 2805423, ["East Java"]],
    ["Banjoemas", 1049222, ["Central Java"]],
    ["Bagelen", 183767, ["Central Java"]],
    ["Madioen", 1301145, ["East Java"]],
    ["Kediri", 4573204, ["East Java"]],
    ["Vorstenlanden", Math.round(((1590519 + 102450) * KV_PAID) / KV_PIKOL), ["Central Java"], "Derived: production 1,590,519 pikol (huurlanden, 29 companies) + 102,450 (overhuurde gronden in Soerakarta, 2) x f 36,132,788 / 10,339,018 pikol; their payments are not given (†)."],
  ]);

  // --- Brazil ------------------------------------------------------------------------------
  // Coffee exports of 1899 by state stand for production (Brazil consumed little of its crop).
  // Minas Gerais, a leading producer whose coffee left through Rio, has no figure: it takes the
  // named states' coffee per worker (extrapolated); no other state is extrapolated.
  PS("brazil-handbook-1901", "state chapters: Bahia p. 72, Espirito Santo pp. 74-75, Rio de Janeiro pp. 94-95, Sao Paulo p. 103 (PDF + 6)", "bra-home", ["plantation"], "coffee exports, 1899", "kilograms", [
    ["Sao Paulo", 344138817, ["São Paulo"], "6,078,990 bags weighing 344,138,817 kilograms (Brazilian official statistics)."],
    ["Rio de Janeiro", 87105716, ["Rio de Janeiro"], "Report of the Secretary of the Treasury for 1900."],
    ["Espirito Santo", 25902470, ["Espírito Santo"], "Official statistics."],
    ["Bahia", 13554223, ["Bahia"]],
  ], { partialCoverage: "four coffee states", extrapolate: ["Minas Gerais"] });
}

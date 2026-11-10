#!/usr/bin/env node
/**
 * P7 step 1: writes packages/data/data/historical/p7/sources_1900.json from the
 * transcriptions below (Webb 1911 "Occupations", Historical Statistics of the United
 * States 1975 ch. D, the Fair Labor Standards Act of 1938). The rows are typed here
 * once and checked; the JSON is the committed source table the generator reads.
 *
 * Usage: node scripts/p7/sources-author.mjs [--check]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = join(ROOT, "packages/data/data/historical/p7/sources_1900.json");
const CHECK = process.argv.includes("--check");

const sources = [
  {
    id: "webb-1911",
    title: "The New Dictionary of Statistics: a complement to the fourth edition of Mulhall's Dictionary of Statistics",
    author: "Augustus Duncan Webb",
    publisher: "London: G. Routledge; New York: E. P. Dutton, 1911",
    url: "https://archive.org/details/newdictionaryofs00webb",
    accessDate: "2026-11-09",
    license: "Public domain (published 1911; Internet Archive copyright status NOT_IN_COPYRIGHT)",
    attribution: "Webb (1911), article \"Occupations\", pp. 428-448; Webb's own sources are his bracketed numbers, given in each locator.",
    notes: "Read from the page images of the Internet Archive scan (PDF page = book page + 16). Webb warns that classifications differ between countries.",
  },
  {
    id: "hsus-1975-chD",
    title: "Historical Statistics of the United States, Colonial Times to 1970, Bicentennial Edition, Part 1, Chapter D: Labor",
    author: "U.S. Bureau of the Census",
    publisher: "Washington, D.C., 1975",
    url: "https://www2.census.gov/library/publications/1975/compendia/hist_stats_colonial-1970/hist_stats_colonial-1970p1-chD.pdf",
    accessDate: "2026-11-09",
    license: "Public domain (work of the United States Government)",
    attribution: "U.S. Bureau of the Census (1975), series D 739-764 (Lebergott) and D 779-793 (Douglas, Real Wages in the United States, 1930).",
    notes: "PDF page = book page - 120. Lebergott's 1900-1928 estimates are not comparable with the later BLS figures (the table's footnote); only 1900-1901 values are used.",
  },
  {
    id: "flsa-1938",
    title: "Fair Labor Standards Act of 1938 (Act of June 25, 1938, ch. 676, 52 Stat. 1060)",
    author: "United States Congress",
    publisher: "United States Statutes at Large, vol. 52, p. 1060",
    url: "https://www.govinfo.gov/content/pkg/STATUTE-52/pdf/STATUTE-52-Pg1060.pdf",
    accessDate: "2026-11-09",
    license: "Public domain (United States statute)",
    attribution: "Fair Labor Standards Act of 1938, sec. 13(a).",
    notes: "Example of a minimum-wage law that left farm employees out (sec. 13(a)(6)). The words \"domestic\" and \"household\" do not occur in the 1938 text (searched), so domestic service was outside it.",
  },
  {
    id: "p7-provisional",
    title: "Fabric of Nations P7 provisional coefficients",
    author: "Fabric of Nations project",
    publisher: "internal",
    url: "internal:docs/P7_PLAN.md",
    accessDate: "2026-11-09",
    license: "Project data",
    attribution: "Fabric of Nations P7 plan and completion report.",
    notes: "Values with no historical counterpart found; each row's note gives the reasoning. Provisional until P15.",
  },
];

/** Occupation group codes (the generator maps each to the sixteen professions). */
const GROUPS = [
  "total", "agriculture", "agri-owners", "agri-labourers", "agri-relatives", "fishing", "mining",
  "manufacturing", "building", "trade", "transport", "trade-transport", "commercial-clerks",
  "domestic-service", "personal-service", "public-administration", "defence", "teaching", "medicine",
  "clergy", "law", "professions", "public-professions", "general-labourers", "other", "owners-rentiers",
];

const occ = [];
const T = (territory, census, locator, rows, sourceId = "webb-1911") => {
  for (const [group, value, note] of rows) occ.push({ territory, census, locator, group, value, note, sourceId });
};
// Webb p.428 [12]: sector table for every country (persons engaged in all occupations).
const P428 = "p.428, table 'numbers actually engaged in certain groups of occupations' [Webb source 12]";
const sector = (t, census, tot, agri, manuf, tt, pub, other, notes = {}) =>
  T(t, census, P428, [
    ["total", tot], ["agriculture", agri, notes.agri], ["manufacturing", manuf, notes.manuf ?? "mining and manufactures"],
    ["trade-transport", tt, notes.tt], ["public-professions", pub, notes.pub ?? "public service and professions"], ["other", other, notes.other],
  ]);
sector("GBR-EW", "1901", 14329000, 1258000, 6877000, 3299000, 953000, 1942000);
sector("GBR-SCO", "1901", 1983000, 250000, 997000, 426000, 98000, 212000);
sector("GBR-IRL", "1901", 1949000, 872000, 490000, 158000, 118000, 311000);
sector("DEU", "1907", 28092000, 9883000, 11256000, 3478000, 1739000, 1736000);
sector("FRA", "1901", 19715000, 8244000, 6993000, 1882000, 1621000, 975000, { manuf: "mining and manufactures, including those engaged in transport (Webb note a)" });
sector("NLD", "1899", 1931000, 593000, 651000, 332000, 124000, 231000);
sector("DNK", "1901", 1107000, 531000, 276000, 131000, 54000, 115000);
sector("SWE", "1900", 1974000, 983000, 413000, 148000, 96000, 334000);
sector("NOR", "1900", 877000, 360000, 243000, 122000, 36000, 116000);
sector("RUS", "1897", 31271000, 18245000, 5597000, 2219000, 2307000, 2903000);
sector("AUT", "1900", 13477000, 8206000, 3139000, 723000, 617000, 792000, { manuf: "mining and manufactures, including food caterers (Webb note c)" });
sector("HUN", "1900", 8690000, 6056000, 1185000, 363000, 345000, 741000, { manuf: "mining and manufactures, including food caterers (Webb note c); includes Croatia and Slavonia" });
sector("ITA", "1901", 16272000, 9666000, 3990000, 1197000, 844000, 575000);
sector("CHE", "1900", 1557000, 482000, 699000, 202000, 73000, 101000);
sector("USA", "1900", 29286000, 10512000, 7039000, 4778000, 1392000, 5565000);
T("BEL", "1900", "p.438, Belgium, groups of occupations at the census of 1900 [Webb source 14]", [
  ["total", 3300100, "each person counted once for each occupation (double counting)"],
  ["agriculture", 697400], ["public-administration", 125500], ["trade", 385200],
  ["other", 719800, "other non-industrial occupations"], ["mining", 173300],
  ["manufacturing", 211900 + 133200 + 79600 + 317100 + 38500 + 286700,
    "metals 211,900 + textile products 133,200 + foodstuffs 79,600 + clothing 317,100 + machines 38,500 + other industrial 286,700"],
  ["building", 131900],
]);
T("GBR", "1901", "pp.430-431, United Kingdom, chief occupations, males and females aged 10 and upwards [Webb source 147]", [
  ["total", 18261000], ["public-administration", 253000, "national 146,000 + local government 107,000"],
  ["defence", 203000, "army at home 144,000 + navy and marines ashore 59,000"],
  ["professions", 734000 - 51000 - 276000, "professional 734,000 less clergy and teachers (barristers and solicitors 27,000 included)"],
  ["clergy", 51000], ["teaching", 276000],
  ["domestic-service", 2200000, "domestic offices (indoor service 1,718,000, charwomen 127,000, laundry 237,000)"],
  ["commercial-clerks", 440000], ["trade", 713000 - 440000 + 63000, "commercial 713,000 less clerks, plus insurance 63,000"],
  ["transport", 1498000], ["agri-owners", 678000, "farmers and graziers"], ["agri-labourers", 985000, "labourers and farm servants"],
  ["agri-relatives", 321000, "sons and male relatives assisting on farms"],
  ["agriculture", 2262000], ["fishing", 61000], ["mining", 943000], ["building", 1132000],
]);
T("NLD", "1899", "p.437, the Netherlands, census of 31 December 1899, total occupied [Webb source 35]", [
  ["domestic-service", 197500], ["trade", 186100, "commerce"], ["transport", 136050, "communications"], ["building", 145000],
]);
T("FRA", "1901", "p.438, France, active population at the census of 1901 [Webb source 9]", [
  ["fishing", 67770], ["mining", 266350], ["transport", 830640], ["trade", 1822620, "commercial"],
  ["professions", 393840 - 172440 - 127730, "liberal professions 393,840 less teaching and medical"],
  ["teaching", 172440], ["medicine", 127730], ["domestic-service", 956200, "domestic service (particular industries)"],
  ["personal-service", 1015040 - 956200, "domestic and other personal service less domestic service"],
  ["public-administration", 1297570, "public service including army"], ["building", 506090],
]);
T("DEU", "1895", "p.439, Germany, actual workers (bread-winners) in particular occupations, 1895 [Webb sources 12, 204]", [
  ["total", 22914000], ["agriculture", 8156000 + 137000, "agriculture 8,156,000 + forestry and fishing 137,000"],
  ["mining", 568000], ["manufacturing", 862000 + 945000 + 647000 + 878000 + 1513000, "metal, textiles, wood, food and refreshments, clothing and cleaning"],
  ["building", 1354000], ["trade", 1205000], ["transport", 615000],
  ["public-professions", 1426000, "military, civil service and professions"], ["other", 4608000, "includes persons without occupation"],
]);
T("ITA", "1901", "p.441, Italy, census of February 1901, aged 9 and upwards [Webb source 54]", [
  ["fishing", 55460], ["mining", 91660], ["building", 564080], ["transport", 423790], ["trade", 484620],
  ["domestic-service", 482080], ["public-administration", 178240], ["teaching", 103430], ["defence", 204010],
  ["clergy", 129890, "public worship"], ["other", 1221540, "others including independent"],
]);
T("AUT", "1900", "p.441, Austria, bread-winners 1900 [Webb source 206]", [
  ["total", 14110000], ["agriculture", 8200000], ["manufacturing", 3140000], ["trade-transport", 1040000],
  ["public-professions", 1730000, "official and professional service"],
  ["domestic-service", 480000, "domestic servants (counted by Webb among dependants)"],
]);
T("HUN", "1900", "p.441, Hungary, bread-winners at the census of 1900 [Webb source 26]", [
  ["total", 8800000], ["agriculture", 6000000], ["manufacturing", 1200000, "mining and industry"],
  ["trade-transport", 360000], ["domestic-service", 390000], ["general-labourers", 300000],
  ["professions", 200000], ["defence", 130000], ["other", 220000],
]);
T("RUS", "1897", "p.442, Russian Empire, wage-earners at the census of 1897 [Webb source 207]", [
  ["agri-labourers", 2722620, "wage-earners in agriculture 2,132,900, cattle raising 411,820, forestry and fishing 177,900"],
  ["domestic-service", 2112630, "servants, domestic 1,556,600 and others 556,030"],
  ["general-labourers", 1094850, "common (unskilled) labourers"],
]);
T("USA", "1900", "p.443, United States, persons aged 10 and upwards at the census of 1900 [Webb source 3]", [
  ["total", 29073100], ["agriculture", 10381700], ["agri-owners", 5736700, "farmers, planters, gardeners"],
  ["agri-labourers", 4410900], ["teaching", 446100, "teachers and professors"], ["medicine", 132000, "physicians and surgeons"],
  ["law", 114500], ["clergy", 111700, "ministers of religion"], ["public-administration", 86600, "government officials and army and navy officers"],
  ["professions", 1258500 - 446100 - 132000 - 114500 - 111700 - 86600, "professional service less the rows above"],
  ["domestic-service", 1560800 + 386000, "servants and waiters, launderers"], ["personal-service", 71300, "boarding-house keepers"],
  ["general-labourers", 2629300, "labourers (unspecified)"], ["trade", 833200, "merchants and dealers"],
  ["commercial-clerks", 885000, "bookkeepers, accountants, clerks and copyists"], ["transport", 582200 + 68000, "steam and street railway employees"],
  ["building", 1212500], ["fishing", 69000], ["mining", 563400],
]);
T("IND", "1901", "p.446, India, actual workers at the census of 1901 [Webb source 5]", [
  ["total", 138700000], ["public-administration", 1308000 + 71000 + 559000 + 31000, "public administration and service of native states"],
  ["defence", 238455], ["agriculture", 60827000 + 27521000], ["personal-service", 3760000 + 1806000, "personal, household and sanitary services"],
  ["trade", 1381000 + 223000, "commerce"], ["transport", 1484000 + 77000], ["professions", 1695000 + 327000, "learned and artistic professions"],
  ["general-labourers", 5803000 + 4044000, "earthwork and general labour (not agricultural)"],
]);
T("ZAF-CAPE", "1904", "p.446, Cape Colony, census of 1904, all races [Webb source 27]", [
  ["total", 1588090, "occupied (total population 2,409,810 less dependants 821,720)"], ["professions", 38310],
  ["domestic-service", 278770], ["trade", 69270, "commercial"], ["agriculture", 1009470], ["manufacturing", 177890, "industrial"],
]);
T("AUS", "1901", "p.447, Australian Commonwealth, census of 1901, thousands [Webb source 15]", [
  ["total", 1652300], ["public-administration", 26600, "government, defence, law"],
  ["professions", 69900 + 41200 - 26600, "professional less government, defence and law (religious, educational, charitable 84,100)"],
  ["domestic-service", 27400 + 110400], ["trade", 188200 + 34500], ["transport", 118700 + 3400],
  ["manufacturing", 350000 + 73600 - 92600, "industrial less building"], ["building", 92600],
  ["agriculture", 251300 + 24700 + 97700 + 14100, "agricultural and pastoral"], ["fishing", 16000], ["mining", 118300],
]);

const statusRows = [
  { id: "ita-proprietors-1901", sourceId: "webb-1911", locator: "p.441, Italy, proprietors at the census of 1901 [Webb source 54]", subject: "ITA", measure: "owners of land, of buildings, and of both", unit: "persons", value: 4110130, status: "sourced", note: "land 1,045,110; buildings 823,440; both 2,241,580" },
];

const earn = (id, locator, measure, value, note) => ({ id, sourceId: "hsus-1975-chD", locator, subject: "United States", measure, unit: "USD per year", value, status: "sourced", ...(note ? { note } : {}) });
const D779 = "series D 779-793 (Douglas), 1900 row, book p.168";
const D739 = "series D 739-764 (Lebergott), book p.167";
const wageRows = [
  earn("us-earn-all-1900", `${D779}, D 779`, "average annual earnings, all industries including farm labor", 438),
  earn("us-earn-manufacturing-1900", `${D779}, D 781`, "average annual earnings, wage earners in manufacturing", 435),
  earn("us-earn-gas-electricity-1900", `${D779}, D 786`, "average annual earnings, gas and electricity workers", 620),
  earn("us-earn-clerical-1900", `${D779}, D 787`, "average annual earnings, clerical workers in manufacturing and steam railroads", 1011),
  earn("us-earn-farm-labor-1900", `${D779}, D 789`, "average annual earnings, farm labor", 247),
  earn("us-earn-federal-1900", `${D779}, D 790`, "average annual earnings, federal employees, executive departments", 1033),
  earn("us-earn-postal-1900", `${D779}, D 791`, "average annual earnings, postal employees", 925),
  earn("us-earn-teachers-1900", `${D779}, D 792`, "average annual earnings, public school teachers", 328, "cross-check of the P2b row us-teacher-salary-1900 ($325, NCES)"),
  earn("us-earn-ministers-1900", `${D779}, D 793`, "average annual earnings, ministers", 731),
  earn("us-earn-trade-1900", `${D739}, 1900 row, D 752`, "average annual earnings per full-time employee, wholesale and retail trade", 508),
  earn("us-earn-finance-1900", `${D739}, 1900 row, D 753`, "average annual earnings per full-time employee, finance, insurance and real estate", 1040),
  earn("us-earn-personal-services-1900", `${D739}, 1900 row, D 755`, "average annual earnings per full-time employee, personal services", 330),
  earn("us-earn-medical-1901", `${D739}, 1901 row (1900 blank), D 756`, "average annual earnings per full-time employee, medical and other health services", 256, "employees only (nurses, attendants); self-employed physicians are not covered"),
  earn("us-earn-domestic-1901", `${D739}, 1901 row (1900 blank), D 757`, "average annual earnings per full-time employee, domestic service", 240, "cash earnings; board and lodging not included"),
  earn("us-earn-public-education-1901", `${D739}, 1901 row (1900 blank), D 763`, "average annual earnings per full-time employee, public education", 345),
  earn("us-earn-federal-civilian-1901", `${D739}, 1901 row (1900 blank), D 764`, "average annual earnings per full-time employee, federal civilian", 940),
];
const prov = (id, measure, value, note, unit = "ratio") => ({ id, sourceId: "p7-provisional", locator: "provisional coefficient", subject: "coefficient", measure, unit, value, status: "provisional", note });
const provisionalRows = [
  prov("farmer-to-laborer-wage", "farm operators' reference wage relative to the production-worker wage", 1, "No 1900 farm-operator income series was found (the Douglas and Lebergott series cover employees). The wage only splits an owner-operator's income between wage and profit (plan §4.1); the residual reaches farmers through profit distribution."),
  prov("shopkeeper-to-trade-wage", "shopkeepers' reference wage relative to trade employees' earnings (D 752)", 1, "Proprietors are not in the employee series; trade employees' earnings stand in. Owner-operators earn the residual through profits."),
  prov("serviceman-to-laborer-wage", "career enlisted pay relative to the production-worker wage", 1, "As the P2b soldier pay (a soldier is paid as an unskilled worker); the army pay table of 1900 was not transcribed. Servicemen are not populated in P7 (plan Q2a)."),
  prov("officer-to-federal-wage", "officers' pay relative to federal executive employees (D 790)", 1, "Officers are not populated in P7 (plan Q2a; counted in Bureaucrats)."),
  prov("medic-to-clerical-wage", "medics' reference wage relative to clerical salaried staff (D 787)", 1, "D 756 ($256, 1901) covers health-service employees only; physicians, half of US medics in 1900 (Webb p.443: 132,000 physicians), were self-employed and earned more. Salaried clerical pay stands in until a physician income source is transcribed."),
  prov("engineer-to-clerical-wage", "engineers' reference wage relative to clerical salaried staff (D 787)", 1, "No 1900 engineers' salary series was transcribed; the salaried staff of manufacturing and railroads stand in."),
  prov("academic-to-clerical-wage", "academics' reference wage relative to clerical salaried staff (D 787)", 1, "Academics were priced at the teacher salary in P2b; teachers now have their own profession. Salaried pay stands in for professors, lawyers and writers."),
  prov("aristocrat-to-capitalist-wage", "aristocrats' reference wage relative to capitalists", 1, "Land income reaches aristocrats through profits; the wage only splits income."),
  prov("engineer-share-heavy-industry", "engineers' share of a heavy-industry or power building's non-manual jobs", 0.25, "Plan §3.4: provisional share of the clerks' slots of heavy industry and power buildings re-mapped to engineers.", "share"),
];
const coverageRows = [
  { id: "flsa-1938-farm-exemption", sourceId: "flsa-1938", locator: "sec. 13(a)(6)", subject: "United States", measure: "minimum wage (sec. 6) does not apply to any employee employed in agriculture", unit: "boolean", value: 1, status: "sourced" },
  { id: "flsa-1938-domestic-absent", sourceId: "flsa-1938", locator: "whole text searched for 'domestic' and 'household'", subject: "United States", measure: "domestic service not named in the act's coverage", unit: "boolean", value: 1, status: "sourced", note: "Domestic service was brought under the act only by later amendments (not cited here)." },
];

// ---------------------------------------------------------------------------------------
// Occupation distribution sources (docs/P7_OCCUPATIONS_1900.md, docs/P7_EMPLOYERS_PROPOSAL.md):
// status in employment, farm persons and holdings by size, establishments by size, army
// and domestic servants. Each row has a machine `key` read by scripts/p7/labour.mjs.
// Every value was read on the page image; class sums were checked against printed totals.
// ---------------------------------------------------------------------------------------
sources.push(
  {
    id: "us-census-1900-occupations",
    title: "Special Reports: Occupations at the Twelfth Census",
    author: "U.S. Bureau of the Census (W. C. Hunt)",
    publisher: "Washington: Government Printing Office, 1904",
    url: "https://www2.census.gov/library/publications/decennial/1900/occupations/occupations-part-2.pdf",
    accessDate: "2026-11-09",
    license: "Public domain (work of the United States Government)",
    attribution: "Occupations at the Twelfth Census (1904), Table I, p. xxiii.",
    notes: "Continental United States column.",
  },
  {
    id: "statjb-dr-1909",
    title: "Statistisches Jahrbuch für das Deutsche Reich, 30. Jahrgang 1909",
    author: "Kaiserliches Statistisches Amt",
    publisher: "Berlin: Puttkammer & Mühlbrecht, 1909",
    url: "https://archive.org/details/per_statistisches-jahrbuch-fur-das-deutsche-reich_statistisches-jahrbuch-fr-das-deutsc_1909_30",
    accessDate: "2026-11-09",
    license: "Public domain (published 1909; Internet Archive scan, no use restriction stated)",
    attribution: "Statistisches Jahrbuch für das Deutsche Reich 1909: I.10 (pp. 10-11) and Internationale Übersichten 9 (p. 14*).",
    notes: "Page images read: leaves 41-42 and 469.",
  },
  {
    id: "statjb-dr-1910",
    title: "Statistisches Jahrbuch für das Deutsche Reich, 31. Jahrgang 1910",
    author: "Kaiserliches Statistisches Amt",
    publisher: "Berlin: Puttkammer & Mühlbrecht, 1910",
    url: "https://archive.org/details/per_statistisches-jahrbuch-fur-das-deutsche-reich_statistisches-jahrbuch-fr-das-deutsc_1910_31",
    accessDate: "2026-11-09",
    license: "Public domain (published 1910; Internet Archive scan, no use restriction stated)",
    attribution: "Statistisches Jahrbuch für das Deutsche Reich 1910: III.2 (pp. 30-31, farm census 1907), V.1b (p. 63) and V.2 (pp. 64-65, trade census 1907).",
    notes: "Page images read: leaves 63-64, 96-98.",
  },
  {
    id: "annuaire-fr-1905",
    title: "Annuaire statistique de la France, 25e volume, 1905",
    author: "Ministère du Commerce, Statistique générale de la France",
    publisher: "Paris: Imprimerie nationale, 1905",
    url: "https://archive.org/details/annuaire-statistique-de-la-france_1905_25",
    accessDate: "2026-11-09",
    license: "Public domain (published 1905; Internet Archive scan, no use restriction stated)",
    attribution: "Annuaire statistique de la France 1905, section 3 C, Tableaux I-II, pp. 170-171 (census of 1901).",
    notes: "Page images read: leaves 215-216.",
  },
  {
    id: "censimento-1901",
    title: "Censimento della popolazione del Regno d'Italia al 10 febbraio 1901",
    author: "Direzione generale della statistica",
    publisher: "Roma, 1902-1904",
    url: "https://archive.org/details/censimentodella00statgoog",
    accessDate: "2026-11-09",
    license: "Public domain (published 1902-1904). Google-digitized scan: Google asks for non-commercial use of its files; the facts transcribed are not affected.",
    attribution: "Censimento 1901, abitanti da 9 anni in su classificati secondo la professione, Nel Regno, Categoria A, Classe I, p. 7.",
    notes: "Page image read: leaf 12. The class rows sum 490 above the printed total (a 3/8 ambiguity in the typeface); each row's M + F was used to decide.",
  },
  {
    id: "voenno-konskaia-1899-1901",
    title: "Voenno-konskaia perepis' 1899-1901 gg. (Statistika Rossiiskoi imperii)",
    author: "Tsentral'nyi statisticheskii komitet MVD",
    publisher: "St Petersburg, 1902",
    url: "https://archive.org/details/voennokonskajaperepispogodamspb9",
    accessDate: "2026-11-09",
    license: "Public domain (published 1902; Internet Archive scan, no use restriction stated)",
    attribution: "Military horse census 1899-1901, introduction, pp. xi-xii (44 guberniias of European Russia).",
    notes: "Page images read: leaves 20-21.",
  },
  {
    id: "census-india-1901-report",
    title: "Census of India, 1901. Vol. I, India. Part I, Report",
    author: "H. H. Risley and E. A. Gait",
    publisher: "Calcutta: Office of the Superintendent of Government Printing, 1903",
    url: "https://archive.org/details/in.ernet.dli.2015.91018",
    accessDate: "2026-11-09",
    license: "Public domain (published 1903; Digital Library of India scan, no terms stated)",
    attribution: "Census of India 1901, vol. I, ch. VI, Subsidiary Table V, p. 230 (actual workers).",
    notes: "Page image read: PDF page 237. The report (para. 330-331) warns that the rent-receiver / rent-payer split and the boundary between field and general labourers are unreliable.",
  },
  {
    id: "japan-year-book-1907",
    title: "The Japan Year Book 1907",
    author: "Y. Takenob",
    publisher: "Tokyo: The Japan Year Book Office, 1907",
    url: "https://archive.org/details/japan-year-book-1907",
    accessDate: "2026-11-09",
    license: "Public domain (published 1907; Internet Archive scan, no use restriction stated)",
    attribution: "The Japan Year Book 1907, Agriculture, p. 321.",
    notes: "Page image read: leaf 366.",
  },
  {
    id: "japan-year-book-1928",
    title: "The Japan Year Book 1928",
    author: "The Japan Year Book Office",
    publisher: "Tokyo, 1928",
    url: "https://archive.org/details/bub_gb_CJFKAAAAMAAJ",
    accessDate: "2026-11-09",
    license: "Public domain in the United States (published 1928). Google-digitized scan: Google asks for non-commercial use of its files.",
    attribution: "The Japan Year Book 1928, Agriculture, p. 491.",
    notes: "Page image read: leaf 587.",
  },
);
const distributionRows = [];
const DR = (sourceId, locator, subject, rows, unit = "persons") => {
  for (const [key, value, measure, note] of rows) distributionRows.push({ id: `dist-${key}`, key, sourceId, locator, subject, measure, unit, value, status: "sourced", ...(note ? { note } : {}) });
};
DR("us-census-1900-occupations", "Table I, p. xxiii", "USA", [
  ["usa-1900-agri-pursuits", 10381765, "agricultural pursuits"],
  ["usa-1900-agri-labourers", 4410877, "agricultural laborers"],
  ["usa-1900-farm-hired", 1999696, "farm and plantation laborers"],
  ["usa-1900-farm-family", 2366149, "farm laborers (members of family)"],
  ["usa-1900-garden-labourers", 45032, "garden and nursery laborers"],
  ["usa-1900-farmers", 5483618, "farmers and planters"],
  ["usa-1900-farmers-family", 168999, "farmers (members of family)"],
]);
const SJ09 = "I.10, Die Bevölkerung des Reichs nach Berufsabteilungen, Berufsgruppen und Stellung im Beruf, p. 10";
DR("statjb-dr-1909", SJ09, "DEU", [
  ["deu-1907-A-a", 2500974, "agriculture etc.: a) independents (owners, tenants, managers)"],
  ["deu-1907-A-b", 98812, "agriculture etc.: b) salaried administrative and supervisory staff"],
  ["deu-1907-A-c", 7283471, "agriculture etc.: c) other assistants, apprentices, factory, wage and day workers"],
  ["deu-1907-B-a", 1977122, "industry incl. mining and building: a)"],
  ["deu-1907-B-b", 686007, "industry: b)"],
  ["deu-1907-B-c", 8593125, "industry: c)"],
  ["deu-1907-C-a", 1012192, "trade and transport incl. inns: a)"],
  ["deu-1907-C-b", 505909, "trade and transport: b)"],
  ["deu-1907-C-c", 1959525, "trade and transport: c)"],
  ["deu-1907-D", 471695, "domestic service (incl. personal attendance) and wage labour of changing kind"],
  ["deu-1907-E", 1738530, "military, court, civil and church service, free professions"],
  ["deu-1907-F", 3404983, "without occupation"],
  ["deu-1907-total", 30232345, "Erwerbstätige A-F"],
]);
DR("statjb-dr-1909", SJ09.replace("p. 10", "p. 11"), "DEU", [
  ["deu-1895-A-a", 2568725, "agriculture etc. 1895: a)"],
  ["deu-1895-A-b", 96173, "agriculture etc. 1895: b)"],
  ["deu-1895-A-c", 5627794, "agriculture etc. 1895: c)"],
]);
const SJ10F = "III.2, Das Personal in den landwirtschaftlichen Betrieben 1907, pp. 30-31 (SDR Bd. 212,1)";
DR("statjb-dr-1910", SJ10F, "DEU", [
  ["deu-1907-farm-heads-lt2ha", 900798, "heads of holdings under 2 ha", "classes under 0.1 a to 1-2 ha: 187 + 23,543 + 60,193 + 166,152 + 164,406 + 183,936 + 302,381"],
  ["deu-1907-farm-heads-2-5ha", 755133, "heads of holdings of 2-5 ha", "284,579 + 255,609 + 214,945"],
  ["deu-1907-farm-heads-5-100ha", 1249807, "heads of holdings of 5-100 ha", "598,085 + 395,162 + 220,716 + 35,844"],
  ["deu-1907-farm-heads-ge100ha", 23755, "heads of holdings of 100 ha and over", "10,617 + 9,557 + 3,196 + 385"],
  ["deu-1907-farm-family-lt2ha", 1142671, "family members working permanently, holdings under 2 ha", "97 + 12,273 + 30,647 + 130,529 + 227,448 + 282,345 + 459,332"],
  ["deu-1907-farm-family-2-5ha", 1193066, "family members working permanently, 2-5 ha", "437,299 + 403,360 + 352,407"],
  ["deu-1907-farm-family-5-100ha", 2334364, "family members working permanently, 5-100 ha", "1,075,220 + 798,353 + 415,295 + 45,496"],
  ["deu-1907-farm-family-ge100ha", 10384, "family members working permanently, 100 ha and over", "6,698 + 2,896 + 747 + 43"],
  ["deu-1907-farm-family-temporary", 3011630, "family members working temporarily"],
  ["deu-1907-farm-supervisors", 77162, "supervisory and accounting staff"],
  ["deu-1907-farm-servants", 1545951, "permanent farm servants (Knechte und Mägde)"],
  ["deu-1907-farm-day-labourers", 882732, "permanent day labourers, workers and Instleute"],
  ["deu-1907-farm-nonpermanent", 2042096, "non-permanent hired workers"],
  ["deu-1907-farm-persons", 15169549, "persons working in farm holdings, total"],
]);
const SJ10E = "V.1b, Die Betriebe nach besonderen Größenklassen, p. 63 (12 June 1907)";
DR("statjb-dr-1910", SJ10E, "DEU", [
  ["deu-1907-B-estab-alone", 994743, "industry: one-person establishments"],
  ["deu-1907-B-estab-le5", 733682 + 141836, "industry: establishments of 2-5 persons", "up to 3 persons 733,682 + 4-5 persons 141,836"],
  ["deu-1907-B-estab-gt5", 96849 + 90225 + 15783 + 11827 + 1423, "industry: establishments of 6 persons and more", "6-10: 96,849; 11-50: 90,225; 51-100: 15,783; 101-500: 11,827; over 500: 1,423"],
  ["deu-1907-C-estab-alone", 433996, "trade and transport: one-person establishments"],
  ["deu-1907-C-estab-le5", 700940 + 69801, "trade and transport: establishments of 2-5 persons", "700,940 + 69,801"],
  ["deu-1907-C-estab-gt5", 48375 + 27991 + 1819 + 942 + 67, "trade and transport: establishments of 6 persons and more", "48,375 + 27,991 + 1,819 + 942 + 67"],
  ["deu-1907-C-persons-le5", 433996 + 1317495 + 305425, "trade and transport: persons in establishments of up to 5 persons", "433,996 + 1,317,495 + 305,425"],
  ["deu-1907-C-persons", 3341032, "trade and transport: persons in establishments, total (p. 65)"],
]);
DR("statjb-dr-1910", "V.2, Das Personal und seine Stellung im Betriebe, pp. 64-65", "DEU", [
  ["deu-1907-B-family-helpers", 72173 + 226031, "industry: family members helping", "male 72,173 + female 226,031"],
  ["deu-1907-C-family-helpers", 64319 + 546842, "trade and transport: family members helping", "male 64,319 + female 546,842"],
]);
const AF = "section 3 C, Tableau I, Population active suivant la situation, p. 170 (census of 1901)";
for (const [sec, label, v] of [
  ["agri", "forêts et agriculture", [4380, 3455407, 2888645, 47177, 1780960]],
  ["extr", "industries extractives", [5, 7411, 250181, 1786, 6968]],
  ["transf", "industries de transformation", [22331, 779263, 3278524, 153657, 1586080]],
  ["transport", "manutention et transport", [11744, 26480, 703360, 43055, 46004]],
  ["commerce", "commerce, spectacles, banque", [639, 521938, 740494, 33563, 525986]],
]) {
  DR("annuaire-fr-1905", AF, "FRA", [
    [`fra-1901-${sec}-undeclared`, v[0], `${label}: situation not declared`],
    [`fra-1901-${sec}-chefs`, v[1], `${label}: heads of establishments (chefs)`],
    [`fra-1901-${sec}-employees`, v[2], `${label}: employees and workers`],
    [`fra-1901-${sec}-unemployed`, v[3], `${label}: employees and workers without work`],
    [`fra-1901-${sec}-isoles`, v[4], `${label}: working alone (isolés)`],
  ]);
}
const AF2 = "section 3 C, Tableau I, établissements classés suivant le nombre des employés et ouvriers, p. 170 (census of 1901)";
DR("annuaire-fr-1905", AF2, "FRA", [
  ["fra-1901-agri-estab-0", 756190, "farm establishments with no employee"],
  ["fra-1901-agri-estab-1-20", 1240371 + 80375 + 7032, "farm establishments with 1-20 employees", "1-4: 1,240,371; 5-10: 80,375; 11-20: 7,032"],
  ["fra-1901-agri-estab-gt20", 2130 + 22 + 1, "farm establishments with more than 20 employees", "21-100: 2,130; 101-200: 22; 201-500: 1"],
  ["fra-1901-extr-estab-ge5", 1190 + 674 + 621 + 91 + 57 + 23 + 22 + 15 + 9, "mining establishments with 5 employees or more"],
  ["fra-1901-transf-estab-ge5", 45993 + 18908 + 16309 + 2203 + 1243 + 289 + 107 + 22 + 2, "manufacturing establishments with 5 employees or more"],
  ["fra-1901-transport-estab-ge5", 2030 + 727 + 601 + 66 + 26 + 9 + 6 + 3 + 3, "transport establishments with 5 employees or more"],
  ["fra-1901-commerce-estab-ge5", 18003 + 4579 + 2270 + 122 + 54 + 6 + 4 + 5 + 1, "commerce establishments with 5 employees or more"],
  ["fra-1901-commerce-estab-lt5", 101050 + 210672, "commerce establishments with fewer than 5 employees", "0: 101,050; 1-4: 210,672"],
  ["fra-1901-commerce-estab", 338490, "commerce establishments, total"],
  ["fra-1901-public-service", 1297570, "services publics (y compris l'armée): active population"],
  ["fra-1901-liberal-professions", 399839, "professions libérales: active population"],
  ["fra-1901-personal-services", 1015037, "services personnels, domestiques: active population"],
  ["fra-1901-unspecified", 18820, "profession non spécifiée: active population"],
]);
DR("censimento-1901", "Categoria A, Classe I, Nel Regno, p. 7 (persons aged 9 and over)", "ITA", [
  ["ita-1901-owner-cultivators", 2583490, "agricoltori che conducono o lavorano terreni propri"],
  ["ita-1901-emphyteutic", 50348, "enfiteuti, utilisti"],
  ["ita-1901-cash-tenants", 691844, "fittaiuoli"],
  ["ita-1901-sharecroppers", 2010050, "mezzadri, coloni"],
  ["ita-1901-bound-hands", 1023576, "contadini obbligati, bifolchi, bovari"],
  ["ita-1901-day-labourers", 2828846, "giornalieri di campagna"],
  ["ita-1901-farm-agents", 29133, "fattori, agenti di campagna"],
  ["ita-1901-field-guards", 13879, "guardie campestri e guardaboschi privati"],
  ["ita-1901-gardeners-masters", 46814, "giardinieri, ortolani, coltivatori d'agrumi, di tabacco, d'alberi da frutto: padroni"],
  ["ita-1901-gardeners-employees", 37438, "the same: dipendenti"],
  ["ita-1901-woodsmen", 17147, "boscaiuoli, siepaiuoli"],
  ["ita-1901-woodcutters-masters", 8502, "taglialegna, carbonai: padroni"],
  ["ita-1901-woodcutters-employees", 19014, "taglialegna, carbonai: dipendenti"],
  ["ita-1901-herdsmen", 247835, "mandriani, pastori, pecorai, caprai, porcai"],
  ["ita-1901-breeders-masters", 247, "allevatori di cavalli, muli, asini, cani: padroni"],
  ["ita-1901-breeders-employees", 544, "the same: dipendenti"],
  ["ita-1901-small-livestock", 1773, "allevatori di polli … apicultori e produttori di seme bachi"],
  ["ita-1901-gatherers", 1013, "raccoglitori di funghi, tartufi, cicoria, ecc."],
  ["ita-1901-agri-total", 9611003, "totale della classe I"],
]);
DR("voenno-konskaia-1899-1901", "introduction, p. xii (44 guberniias)", "RUS", [
  ["rus-1900-commune-h1", 3282771, "peasant households in village communities with 1 horse", undefined],
  ["rus-1900-commune-h2", 2175327, "with 2 horses"],
  ["rus-1900-commune-h3", 951437, "with 3 horses"],
  ["rus-1900-commune-h4", 432860, "with 4 horses"],
  ["rus-1900-commune-h5", 196422, "with 5 horses"],
  ["rus-1900-commune-gt5", 232342, "with more than 5 horses"],
  ["rus-1900-uezd-h1", 173415, "landowners and other persons in the uezd with 1 horse"],
  ["rus-1900-uezd-h2", 129137, "with 2 horses"],
  ["rus-1900-uezd-h3", 59159, "with 3 horses"],
  ["rus-1900-uezd-h4", 33581, "with 4 horses"],
  ["rus-1900-uezd-h5", 17986, "with 5 horses"],
  ["rus-1900-uezd-gt5", 67391, "with more than 5 horses"],
], "households");
DR("voenno-konskaia-1899-1901", "introduction, p. xii", "RUS", [["rus-1900-commune-horseless-share", 0.287, "horseless households among peasant households in village communities, 44 guberniias"]], "share");
DR("census-india-1901-report", "ch. VI, Subsidiary Table V, p. 230 (actual workers, male + female)", "IND", [
  ["ind-1901-agriculture", 60827087 + 27520631, "V. Agriculture"],
  ["ind-1901-rent-receivers", 14377965 + 6151933, "rent receivers"],
  ["ind-1901-rent-payers", 34026928 + 11008358, "rent payers"],
  ["ind-1901-farm-servants", 1995767 + 500585, "farm servants"],
  ["ind-1901-field-labourers", 8678314 + 8954149, "field labourers"],
  ["ind-1901-jhum", 527199 + 332114, "taungya or jhum cultivators"],
  ["ind-1901-tea-labourers", 329434 + 309691, "tea plantations: labourers and other subordinates"],
  ["ind-1901-domestic", 783686 + 435255 + 138560 + 55820 + 318702 + 255139, "indoor servants, cooks and water-carriers", "indoor servants 1,218,941; cooks 194,380; water-carriers 573,841"],
  ["ind-1901-occupied", 95709280 + 43046902, "all occupations"],
]);
DR("japan-year-book-1907", "Agriculture, Farming population, p. 321", "JPN", [
  ["jpn-1904-householders", 8411536, "householders of all descriptions", undefined],
  ["jpn-1904-farming-only", 3776416, "householders pursuing farming only"],
  ["jpn-1904-farming-other", 1638216, "householders combining farming with other occupations"],
], "households");
DR("japan-year-book-1928", "Agriculture, Landed-farmers and Area of Cultivation; Farmers and Total Population, p. 491", "JPN", [
  ["jpn-1926-landowners-ge10cho", 45917 + 4145, "landed farmers cultivating 10 cho and over per family", "10-50 cho 45,917; over 50 cho 4,145"],
  ["jpn-1926-farm-families", 5555157, "families engaged in farming"],
], "households");
const P14 = "Internationale Übersichten 9, Die Erwerbstätigen nach Berufsabteilungen, p. 14*";
for (const [tag, army, servants, occupied] of [
  ["deu", 651194, 1264755, 28092117], ["aut", 229037, 478756, null], ["hun", 132336, 385324, null], ["rus", 1132723, 1617489, null],
  ["ita", 204012, 482080, null], ["che", 2292, 86225, null], ["fra", 597445, 956195, null], ["bel", 33400, null, null], ["nld", 19622, 197511, null],
  ["dnk", null, 92356, null], ["swe", 38847, 212753, null], ["nor", 6053, 98413, null], ["gbr", 203993, 1739828, null], ["usa", 126744, null, null],
]) {
  const rows = [];
  if (army !== null) rows.push([`${tag}-army-navy`, army, "army and navy"]);
  if (servants !== null) rows.push([`${tag}-domestic-servants`, servants, "domestic (personal) servants"]);
  if (occupied !== null) rows.push([`${tag}-occupied`, occupied, "occupied, sum of the row"]);
  DR("statjb-dr-1909", P14, tag.toUpperCase(), rows);
}
DR("webb-1911", "p.443, United States, servants and waiters [Webb source 3]", "USA", [["usa-domestic-servants", 1560800, "servants and waiters"]]);
const HOLD = [
  ["gbr", "p.361, Great Britain, agricultural holdings above 1 acre, June 1907 [Webb source 20]", [[1, 5, 109625], [5, 50, 232500], [50, 300, 151092], [300, null, 17737]]],
  ["irl", "p.362, Ireland, holdings according to the census of 1901 [Webb source 150]", [[0, 1, 29037], [1, 5, 52388], [5, 10, 73035], [10, 15, 61153], [15, 20, 54007], [20, 30, 64742], [30, 50, 67014], [50, 100, 54501], [100, 200, 23086], [200, 500, 9089], [500, null, 2249]]],
  ["hun", "p.364, Hungary, agricultural farms 1895 [Webb source 26]", [[0, 7, 1459900], [7, 142, 1311200], [142, 1422, 20800], [1422, null, 4000]]],
  ["bel", "p.363, Belgium, agricultural holdings 1895 [Webb source 14]", [[0, 2.5, 544040], [2.5, 12, 191830], [12, 25, 49070], [25, 50, 28150], [50, 74, 8160], [74, 99, 3190], [99, 124, 1000], [124, 247, 2660], [247, null, 920]]],
  ["nld", "p.364, the Netherlands, agricultural holdings 1895, owners plus tenants [Webb source 35]", [[2.5, 12.5, 45240 + 33040], [12.5, 24.7, 21010 + 13350], [24.7, 49.4, 17520 + 12190], [49.4, 123.5, 10920 + 10890], [123.5, 247, 1410 + 1870], [247, null, 110 + 60]]],
  ["can", "p.365, Canada, occupiers of farm land 1901 [Webb source 32]", [[5, 10, 91190], [11, 50, 81240], [51, 100, 156780], [101, 200, 150830], [201, null, 64650]]],
  ["aus", "p.366, New South Wales and Victoria, holdings alienated or in process of alienation 1906 [Webb source 15]", [[1, 15, 21270 + 5951], [16, 50, 11143 + 7358], [51, 100, 9217 + 5864], [101, 200, 10042 + 7998], [201, 500, 12226 + 13630], [501, 1000, 6735 + 7688], [1001, 5000, 5185 + 4083], [5001, null, 598 + 356 + 254 + 110 + 220 + 116 + 73 + 6]]],
  ["nzl", "p.367, New Zealand, occupied holdings 1903-4 [Webb source 33]", [[1, 10, 18731], [10, 50, 11386], [50, 100, 7245], [100, 200, 9570], [200, 320, 6145], [320, 640, 6566], [640, 1000, 2497], [1000, null, 3075 + 379 + 223 + 169 + 106]]],
];
for (const [tag, locator, classes] of HOLD) {
  DR("webb-1911", locator, tag.toUpperCase(), classes.map(([lo, hi, n]) => [`holdings-${tag}-${lo}-${hi ?? "up"}`, n, `holdings of ${lo}${hi === null ? " acres and over" : `-${hi} acres`}`]), "holdings");
}

// Mexico, census of 28 October 1900: national summary ("Resumen", "Total general") of the
// professions classified by the Bertillon system. Read on the page images (leaves 68, 73-76);
// each total equals the sum of its four regional rows. Not occupied and left out: "Se ignora"
// 37,721 and "Improductivos (profesión desconocida)" 4,808,994.
sources.push({
  id: "mex-censo-1900",
  title: "Resumen general del censo de la República Mexicana verificado el 28 de octubre de 1900",
  author: "Dirección General de Estadística (Antonio Peñafiel, director)",
  publisher: "México: Imprenta de la Secretaría de Fomento, 1905",
  url: "https://archive.org/details/resumengenerald00mexigoog",
  accessDate: "2026-11-10",
  license: "Public domain (published 1905; Internet Archive copyright status NOT_IN_COPYRIGHT). Google-digitized scan: Google asks for non-commercial use of its files.",
  attribution: "Resumen general del censo de 1900, Profesión clasificada según el sistema Bertillon, Resumen por regiones, Total general.",
  notes: "Page images read: leaf 68 (p.55), leaves 73-76 (pp.60-63). The OCR text layer scrambles the columns and was not used for values.",
});
const MX = (page) => `Resumen 1900, p.${page}, Profesión clasificada según el sistema Bertillon, Resumen, Total general`;
T("MEX", "1900", MX(55), [
  ["agriculture", 3157487, "Agricultura"],
  ["mining", 97345, "Minería (a class of its own, not part of Industrias)"],
], "mex-censo-1900");
T("MEX", "1900", MX(60), [
  ["manufacturing", 757754, "Industrias"],
  ["transport", 57672, "Transportes"],
], "mex-censo-1900");
T("MEX", "1900", MX(61), [
  ["trade", 238133, "Comercio"],
  ["defence", 38852, "Fuerza pública"],
  ["public-administration", 25188, "Administración pública"],
  ["professions", 62207, "Profesiones liberales"],
], "mex-censo-1900");
T("MEX", "1900", MX(62), [
  ["owners-rentiers", 22733, "Propietarios y rentistas"],
  ["domestic-service", 95198, "Trabajos domésticos, men only; the class's 3,785,682 women are left out: it does not separate servants from home duties, so women servants are missing"],
], "mex-censo-1900");
T("MEX", "1900", MX(63), [["other", 360014, "Diversas ocupaciones"]], "mex-censo-1900");

// R9 institution function shares: all-government expenditure by function, 1902 (Census of
// Governments; HSUS 1975 series Y 533-566). The 1902 row was read on the page image; the
// general-expenditure columns sum to the printed total (1,578).
sources.push({
  id: "hsus-1975-chY",
  title: "Historical Statistics of the United States, Colonial Times to 1970, Bicentennial Edition, Part 2, Chapter Y: Government",
  author: "U.S. Bureau of the Census",
  publisher: "Washington, D.C., 1975",
  url: "https://www2.census.gov/library/publications/1975/compendia/hist_stats_colonial-1970/hist_stats_colonial-1970p2-chY.pdf",
  accessDate: "2026-11-10",
  license: "Public domain (work of the United States Government)",
  attribution: "U.S. Bureau of the Census (1975), series Y 533-566, Federal, State, and Local Government Expenditure, by Function: 1902 to 1970.",
  notes: "PDF page = book page - 1066. Series Y 533-549 on book p.1120, Y 550-566 on p.1121; 1902 row. Transactions between governments are excluded (the table's note).",
});
const Y533 = "series Y 533-566, 1902 row";
DR("hsus-1975-chY", `${Y533}, book p.1120`, "USA", [
  ["usa-1902-gov-general", 1578, "general expenditure, all governments (Y 534)"],
  ["usa-1902-gov-defence", 165, "national defense and international relations (Y 535)"],
  ["usa-1902-gov-postal", 126, "postal service (Y 537)"],
  ["usa-1902-gov-education", 258, "education, total (Y 538)"],
  ["usa-1902-gov-higher-education", 13, "state institutions of higher education (Y 539)"],
  ["usa-1902-gov-local-schools", 238, "local schools (Y 540)"],
  ["usa-1902-gov-highways", 175, "highways (Y 542)"],
  ["usa-1902-gov-hospitals", 45, "hospitals (Y 547)"],
  ["usa-1902-gov-health", 18, "health (Y 548)"],
], "million USD");
DR("hsus-1975-chY", `${Y533}, book p.1121`, "USA", [
  ["usa-1902-gov-veterans", 141, "veterans services not elsewhere classified (Y 556)"],
  ["usa-1902-gov-interest", 97, "interest on general debt (Y 558)"],
  ["usa-1902-gov-air-water-transport", 22, "air and water transport and terminals (Y 559)"],
], "million USD");

for (const row of occ) {
  if (!GROUPS.includes(row.group)) throw new Error(`unknown group ${row.group}`);
  if (!Number.isFinite(row.value) || row.value <= 0) throw new Error(`bad value ${row.territory} ${row.group}`);
}
const seen = new Map();
const occupationRows = occ.map((row) => {
  const base = `occ-${row.territory.toLowerCase()}-${row.census}-${row.group}`;
  const count = (seen.get(base) ?? 0) + 1;
  seen.set(base, count);
  return {
    id: count === 1 ? base : `${base}-${String(count)}`,
    sourceId: row.sourceId,
    locator: row.locator,
    subject: row.territory,
    census: row.census,
    group: row.group,
    unit: "persons",
    value: row.value,
    status: "sourced",
    ...(row.note ? { note: row.note } : {}),
  };
});
const ids = new Set();
for (const row of distributionRows) if (!Number.isFinite(row.value) || row.value <= 0 || !sources.some((source) => source.id === row.sourceId)) throw new Error(`bad distribution row ${row.key}`);
for (const row of [...occupationRows, ...statusRows, ...wageRows, ...provisionalRows, ...coverageRows, ...distributionRows]) {
  if (ids.has(row.id)) throw new Error(`duplicate row id ${row.id}`);
  ids.add(row.id);
}
const out = {
  description:
    "P7 source table for the 1900 labour market: census occupation groups (Webb 1911), the occupation-distribution rows (status in employment, farm persons and holdings by size, establishments by size, army and domestic servants), 1900 earnings for the new professions (Historical Statistics of the United States), and the minimum-wage coverage example (FLSA 1938). Every row carries its source, locator and status (sourced, or provisional with the reasoning in its note). Flax, hemp and jute are not sourced here (fibre good deferred by the designer, plan Q15-Q16).",
  groups: GROUPS,
  sources,
  occupationRows,
  statusRows,
  wageRows,
  provisionalRows,
  coverageRows,
  distributionRows,
};
const text = `${JSON.stringify(out, null, 1)}\n`;
if (CHECK) {
  const current = readFileSync(OUT, "utf8");
  if (current !== text) {
    console.error("sources_1900.json is not current");
    process.exit(1);
  }
  console.log("sources_1900.json is current");
} else {
  writeFileSync(OUT, text);
  console.log(`wrote ${OUT}: ${occupationRows.length} occupation rows, ${distributionRows.length} distribution rows, ${wageRows.length} wage rows, ${provisionalRows.length} provisional, ${coverageRows.length} coverage`);
}

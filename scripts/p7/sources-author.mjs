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
  "clergy", "law", "professions", "public-professions", "general-labourers", "other",
];

const occ = [];
const T = (territory, census, locator, rows) => {
  for (const [group, value, note] of rows) occ.push({ territory, census, locator, group, value, note });
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
    sourceId: "webb-1911",
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
for (const row of [...occupationRows, ...statusRows, ...wageRows, ...provisionalRows, ...coverageRows]) {
  if (ids.has(row.id)) throw new Error(`duplicate row id ${row.id}`);
  ids.add(row.id);
}
const out = {
  description:
    "P7 source table for the 1900 labour market: census occupation groups (Webb 1911), 1900 earnings for the new professions (Historical Statistics of the United States), and the minimum-wage coverage example (FLSA 1938). Every row carries its source, locator and status (sourced, or provisional with the reasoning in its note). Flax, hemp and jute are not sourced here (fibre good deferred by the designer, plan Q15-Q16).",
  groups: GROUPS,
  sources,
  occupationRows,
  statusRows,
  wageRows,
  provisionalRows,
  coverageRows,
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
  console.log(`wrote ${OUT}: ${occupationRows.length} occupation rows, ${wageRows.length} wage rows, ${provisionalRows.length} provisional, ${coverageRows.length} coverage`);
}

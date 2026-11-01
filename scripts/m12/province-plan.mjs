/**
 * Authored M12a European province plan.
 *
 * This module is deliberately data, not simulation logic. It expresses the
 * historical province inventory for the 1 January 1900 world and the future
 * successor polities that can receive those provinces. The build script turns
 * each entry into geometry by intersecting the listed modern Natural Earth
 * admin-1 units (and optional authored clip polygons) with the map polity's
 * authored 1900 polygon from `world_map_1900.json`.
 *
 * Design rules:
 * - The 1900 map polity (`mapTag`) supplies the 1900 outer boundary. Modern
 *   admin-1 units are used only as internal geometry blocks, never as an
 *   accepted 1900 frontier.
 * - `ownerTag` is the legal 1900 owner. For a dependent territory it is the
 *   sovereign country, while `mapTag` is the territory's own map feature
 *   (Finland -> RUS/FIN, Cyprus -> GBR/CYP).
 * - Where a later border cut through a 1900 administrative unit, the entry is
 *   split along that border and the approximation is labelled low/medium.
 * - Province ids are assigned deterministically by owner and order in this
 *   plan. They never change when ownership later changes.
 */

/** Historical and geospatial sources referenced by province entries. */
export const SOURCES = [
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
    id: "eb1911-austria",
    title: "Encyclopaedia Britannica (1911), 'Austria-Hungary'",
    url: "https://en.wikisource.org/wiki/1911_Encyclop%C3%A6dia_Britannica/Austria-Hungary",
    license: "Public domain",
    date: "1911",
    notes:
      "Contemporary description of the Austrian crown lands, the Hungarian counties, Croatia-Slavonia and the joint administration of Bosnia-Herzegovina.",
  },
  {
    id: "eb1911-germany",
    title: "Encyclopaedia Britannica (1911), 'Germany' and 'Prussia'",
    url: "https://en.wikisource.org/wiki/1911_Encyclop%C3%A6dia_Britannica/Germany",
    license: "Public domain",
    date: "1911",
    notes:
      "Constituent states and Prussian provinces of the German Empire, including Posen, West Prussia, East Prussia and Silesia.",
  },
  {
    id: "eb1911-russia",
    title: "Encyclopaedia Britannica (1911), 'Russia'",
    url: "https://en.wikisource.org/wiki/1911_Encyclop%C3%A6dia_Britannica/Russia",
    license: "Public domain",
    date: "1911",
    notes:
      "European Russian governorates and the Grand Duchy of Finland; used for historical province names and administrative affiliation.",
  },
  {
    id: "eb1911-poland",
    title: "Encyclopaedia Britannica (1911), 'Poland' and 'Russia'",
    url: "https://en.wikisource.org/wiki/1911_Encyclop%C3%A6dia_Britannica/Poland",
    license: "Public domain",
    date: "1911",
    notes:
      "Congress Poland and its governorates, and the western Russian governorates that later formed Belarus, Ukraine and the Baltic states.",
  },
  {
    id: "eb1911-united-kingdom",
    title: "Encyclopaedia Britannica (1911), 'United Kingdom' and 'Ireland'",
    url: "https://en.wikisource.org/wiki/1911_Encyclop%C3%A6dia_Britannica/United_Kingdom",
    license: "Public domain",
    date: "1911",
    notes:
      "Historic counties of England, Wales, Scotland and Ireland, and the administration of Ireland within the United Kingdom.",
  },
  {
    id: "treaty-versailles-1919",
    title: "Treaty of Versailles (1919), territorial clauses",
    url: "https://en.wikisource.org/wiki/Treaty_of_Versailles",
    license: "Public domain",
    date: "1919",
    notes:
      "Post-WWI German transfers used to identify the provinces that must be independently transferable.",
  },
  {
    id: "treaty-saint-germain-1919",
    title: "Treaty of Saint-Germain (1919), Austro-Hungarian territorial clauses",
    url: "https://en.wikisource.org/wiki/Treaty_of_Saint-Germain-en-Laye",
    license: "Public domain",
    date: "1919",
    notes:
      "Dissolution of Austria-Hungary and the provincial transfers to Austria, Hungary, Czechoslovakia, Poland, Romania, Italy and Yugoslavia.",
  },
  {
    id: "treaty-trianon-1920",
    title: "Treaty of Trianon (1920), Hungarian territorial clauses",
    url: "https://en.wikisource.org/wiki/Treaty_of_Trianon",
    license: "Public domain",
    date: "1920",
    notes: "Hungarian transfers of Slovakia, Ruthenia, Transylvania, Banat, Vojvodina and Croatia.",
  },
  {
    id: "treaty-lausanne-1923",
    title: "Treaty of Lausanne (1923), Ottoman successor boundaries",
    url: "https://en.wikisource.org/wiki/Treaty_of_Lausanne",
    license: "Public domain",
    date: "1923",
    notes: "Ottoman European provinces and their transfer to Greece, Albania and Yugoslavia.",
  },
  {
    id: "treaty-of-london-1915",
    title: "Treaty of London (1915) and the Adriatic settlement",
    url: "https://en.wikisource.org/wiki/Treaty_of_London_(1915)",
    license: "Public domain",
    date: "1915",
    notes: "Italian claims and the post-war Littoral and Dalmatian transfers.",
  },
  {
    id: "potdam-1945",
    title: "Potsdam Agreement (1945), German territorial clauses",
    url: "https://en.wikisource.org/wiki/Potsdam_Agreement",
    license: "Public domain",
    date: "1945",
    notes:
      "Administration of German territories east of the Oder-Neisse line, northern East Prussia to the USSR and southern East Prussia to Poland.",
  },
  {
    id: "basic-law-1949",
    title: "Basic Law for the Federal Republic of Germany (1949) and GDR constitution",
    url: "https://en.wikisource.org/wiki/Basic_Law_for_the_Federal_Republic_of_Germany",
    license: "Public domain",
    date: "1949",
    notes: "Creation of the Federal Republic of Germany and the German Democratic Republic in 1949.",
  },
  {
    id: "two-plus-four-1990",
    title: "Treaty on the Final Settlement with Respect to Germany (1990)",
    url: "https://en.wikisource.org/wiki/Treaty_on_the_Final_Settlement_with_Respect_to_Germany",
    license: "Public domain",
    date: "1990",
    notes:
      "German reunification; the former eastern territories remain outside Germany and are not restored by reunification.",
  },
  {
    id: "project-authored-1900",
    title: "Fabric of Nations M11c authored 1900 boundary reconstruction",
    url: "internal:packages/data/data/historical/m11/boundaries_1900.json",
    license: "Project data",
    date: "2026",
    notes:
      "The 1900 outer polity polygons and their explicit transfers. M12a never overrides a 1900 frontier with a modern one.",
  },
  {
    id: "project-authored-m12",
    title: "Fabric of Nations M12a authored provincial partition",
    url: "internal:scripts/m12/province-plan.mjs",
    license: "Project data",
    date: "2026",
    notes:
      "The choice of historical provinces, their administrative affiliation, granularity and confidence. Modern units are proxies for the internal partition only.",
  },
];

/**
 * Future successor polities. None of these is selectable on 1 January 1900.
 * Ids start at 1000 so they never collide with the 0..165 catalog range and
 * existing polity ids are never renumbered.
 */
export const FUTURE_POLITIES = [
  {
    polityId: 1000,
    tag: "POL",
    historicalName: "Republic of Poland",
    commonName: "Poland",
    status: "independent",
    activeFrom: "1918-11-11",
    activeTo: null,
    capitalName: "Warsaw",
    flagKey: "POL",
    confidence: "high",
    notes: "Restored after the First World War from Congress Poland, Galicia, Posen, West Prussia and Upper Silesia.",
  },
  {
    polityId: 1001,
    tag: "CZE",
    historicalName: "Czechoslovak Republic",
    commonName: "Czechoslovakia",
    status: "independent",
    activeFrom: "1918-10-28",
    activeTo: "1992-12-31",
    capitalName: "Prague",
    flagKey: "CZE",
    confidence: "high",
    notes: "Bohemia, Moravia, Austrian Silesia (including Hultschin), Slovakia and Carpathian Ruthenia.",
  },
  {
    polityId: 1002,
    tag: "YUG",
    historicalName: "Kingdom of Serbs, Croats and Slovenes",
    commonName: "Yugoslavia",
    status: "independent",
    activeFrom: "1918-12-01",
    activeTo: "2000-01-01",
    capitalName: "Belgrade",
    flagKey: "YUG",
    confidence: "high",
    notes: "Serbia, Montenegro, Croatia-Slavonia, Slovenia, Bosnia-Herzegovina, Vojvodina and the Dalmatian coast.",
  },
  {
    polityId: 1003,
    tag: "FIN",
    historicalName: "Republic of Finland",
    commonName: "Finland",
    status: "independent",
    activeFrom: "1917-12-06",
    activeTo: null,
    capitalName: "Helsinki",
    flagKey: "FIN",
    confidence: "high",
    notes: "Independent successor to the Grand Duchy of Finland; the 1900 Grand Duchy itself remains a Russian territory.",
  },
  {
    polityId: 1004,
    tag: "EST",
    historicalName: "Republic of Estonia",
    commonName: "Estonia",
    status: "independent",
    activeFrom: "1918-02-24",
    activeTo: null,
    capitalName: "Tallinn",
    flagKey: "EST",
    confidence: "high",
    notes: "Estonian governorate of the Russian Empire.",
  },
  {
    polityId: 1005,
    tag: "LVA",
    historicalName: "Republic of Latvia",
    commonName: "Latvia",
    status: "independent",
    activeFrom: "1918-11-18",
    activeTo: null,
    capitalName: "Riga",
    flagKey: "LVA",
    confidence: "high",
    notes: "Courland, southern Livonia and Latgale (Vitebsk governorate).",
  },
  {
    polityId: 1006,
    tag: "LTU",
    historicalName: "Republic of Lithuania",
    commonName: "Lithuania",
    status: "independent",
    activeFrom: "1918-02-16",
    activeTo: null,
    capitalName: "Vilnius",
    flagKey: "LTU",
    confidence: "high",
    notes: "Kovno, Vilna and Suwalki governorates; the Memel Territory was added in 1923.",
  },
  {
    polityId: 1007,
    tag: "DDR",
    historicalName: "German Democratic Republic",
    commonName: "East Germany",
    status: "independent",
    activeFrom: "1949-10-07",
    activeTo: "1990-10-03",
    capitalName: "East Berlin",
    flagKey: "DDR",
    confidence: "high",
    notes: "Soviet occupation zone; the five eastern Länder. Reunified with the Federal Republic in 1990.",
  },
  {
    polityId: 1008,
    tag: "FRG",
    historicalName: "Federal Republic of Germany",
    commonName: "West Germany",
    status: "independent",
    activeFrom: "1949-05-23",
    activeTo: null,
    capitalName: "Bonn",
    flagKey: "FRG",
    confidence: "high",
    notes: "The three western occupation zones; reunified Germany keeps this polity and does not regain the eastern territories.",
  },
  {
    polityId: 1009,
    tag: "IRL",
    historicalName: "Irish Free State",
    commonName: "Ireland",
    status: "independent",
    activeFrom: "1922-12-06",
    activeTo: null,
    capitalName: "Dublin",
    flagKey: "IRL",
    confidence: "high",
    notes: "The twenty-six counties; the Republic of Ireland was declared in 1949. Northern Ireland remains with the United Kingdom.",
  },
  {
    polityId: 1010,
    tag: "AUT",
    historicalName: "Republic of Austria",
    commonName: "Austria",
    status: "independent",
    activeFrom: "1918-11-12",
    activeTo: null,
    capitalName: "Vienna",
    flagKey: "AUT",
    confidence: "high",
    notes: "Successor to the Austrian half of the monarchy; the 1900 polity id 60 remains the Austro-Hungarian Monarchy.",
  },
  {
    polityId: 1011,
    tag: "HUN",
    historicalName: "Kingdom of Hungary",
    commonName: "Hungary",
    status: "independent",
    activeFrom: "1918-11-16",
    activeTo: null,
    capitalName: "Budapest",
    flagKey: "HUN",
    confidence: "high",
    notes: "Successor to the Hungarian half of the monarchy after the 1920 Trianon settlement.",
  },
  {
    polityId: 1012,
    tag: "DAN",
    historicalName: "Free City of Danzig",
    commonName: "Danzig",
    status: "independent",
    activeFrom: "1920-11-15",
    activeTo: "1939-09-01",
    capitalName: "Danzig",
    flagKey: "DAN",
    confidence: "medium",
    notes: "League of Nations free city under Polish customs administration; the free-city condition is represented with the province special status.",
  },
  {
    polityId: 1013,
    tag: "ALB",
    historicalName: "Principality of Albania",
    commonName: "Albania",
    status: "independent",
    activeFrom: "1912-11-28",
    activeTo: null,
    capitalName: "Tirana",
    flagKey: "ALB",
    confidence: "high",
    notes: "Independent from the Ottoman Empire in 1912; the 1900 Albanian provinces belong to the Ottoman Empire.",
  },
  {
    polityId: 1014,
    tag: "UKR",
    historicalName: "Ukrainian People's Republic",
    commonName: "Ukraine",
    status: "independent",
    activeFrom: "1917-11-20",
    activeTo: null,
    capitalName: "Kyiv",
    flagKey: "UKR",
    confidence: "high",
    notes: "Ukrainian governorates and Galicia; independence was contested until 1991.",
  },
  {
    polityId: 1015,
    tag: "BLR",
    historicalName: "Belarusian People's Republic",
    commonName: "Belarus",
    status: "independent",
    activeFrom: "1918-03-25",
    activeTo: null,
    capitalName: "Minsk",
    flagKey: "BLR",
    confidence: "high",
    notes: "Belarusian governorates of the Russian Empire; independent statehood was restored in 1991.",
  },
  {
    polityId: 1016,
    tag: "MDA",
    historicalName: "Moldavian Democratic Republic",
    commonName: "Moldova",
    status: "independent",
    activeFrom: "1917-12-15",
    activeTo: null,
    capitalName: "Chișinău",
    flagKey: "MDA",
    confidence: "high",
    notes: "Bessarabia; union with Romania in 1918 and independence in 1991 are alternative historical paths.",
  },
];

const TAG_BY_POLITY = new Map(FUTURE_POLITIES.map((p) => [p.polityId, p.tag]));

/** 1900 owner polity ids (catalog ids, never renumbered). */
const OWNER_ID = {
  GBR: 1,
  DEU: 2,
  FRA: 3,
  RUS: 4,
  ITA: 6,
  ESP: 7,
  PRT: 8,
  NLD: 9,
  BEL: 10,
  CHE: 11,
  SWE: 12,
  NOR: 13,
  DNK: 14,
  GRC: 15,
  SRB: 16,
  MNT: 17,
  ROM: 18,
  BGR: 19,
  OTT: 20,
  LUX: 21,
  MCO: 22,
  SMR: 23,
  AND: 24,
  LIE: 25,
  AUT: 60,
  CRT: 66,
};

/** Simulation-region id for each 1900 map feature. */
const REGION_ID = {
  GBR: 1,
  DEU: 2,
  FRA: 3,
  RUS: 4,
  ITA: 6,
  ESP: 7,
  PRT: 8,
  NLD: 9,
  BEL: 10,
  CHE: 11,
  SWE: 12,
  NOR: 13,
  DNK: 14,
  GRC: 15,
  SRB: 16,
  MNT: 17,
  ROM: 18,
  BGR: 19,
  OTT: 20,
  LUX: 21,
  MCO: 22,
  SMR: 23,
  AND: 24,
  LIE: 25,
  AUT: 60,
  CRT: 66,
  FIN: 160,
  CYP: 106,
  MLT: 107,
  ISL: 154,
  FRO: 156,
  GRL: 155,
};

function slug(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function polygonBox(polygon) {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (const [lon, lat] of polygon) {
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return [minLon, minLat, maxLon, maxLat];
}

function pointInPolygon(point, polygon) {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Build the complete province plan.
 *
 * @param {readonly {code: string, name: string, nameLocal: string, country: string,
 *   region: string, type: string, lat: number, lon: number}[]} units
 */
export function buildProvincePlan(units) {
  const byCode = new Map(units.map((unit) => [unit.code, unit]));
  const provinces = [];
  const usedCodes = new Set();
  const missingCodes = new Set();
  const duplicateKeys = new Set();
  const keys = new Set();

  function unitList(codes) {
    const out = [];
    for (const code of codes) {
      const unit = byCode.get(code);
      if (unit === undefined) {
        missingCodes.add(code);
        continue;
      }
      out.push(code);
      usedCodes.add(code);
    }
    return [...new Set(out)].sort();
  }

  function unitsForCountry(country) {
    return units.filter((unit) => unit.country === country);
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
    sources = ["natural-earth-10m-admin1", "project-authored-1900", "project-authored-m12"],
    special = "ordinary",
    codes = [],
    clip = null,
    exclude = null,
  }) {
    if (keys.has(key)) {
      duplicateKeys.add(key);
      return;
    }
    keys.add(key);
    const ownerPolityId = OWNER_ID[ownerTag];
    if (ownerPolityId === undefined) throw new Error(`unknown owner tag ${ownerTag}`);
    const regionId = REGION_ID[mapTag];
    if (regionId === undefined) throw new Error(`unknown map tag ${mapTag}`);
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
      units: unitList(codes),
      clip,
      exclude,
    });
  }

  // ---------------------------------------------------------------------------
  // British Isles
  // ---------------------------------------------------------------------------
  const gbr = unitsForCountry("GBR");
  const englishRegionNames = {
    "North East": "Northumberland and Durham",
    "North West": "Lancashire and Cheshire",
    "Yorkshire and the Humber": "Yorkshire",
    "East Midlands": "Derbyshire and Nottinghamshire",
    "West Midlands": "Staffordshire and Warwickshire",
    East: "East Anglia and Essex",
    "Greater London": "Middlesex and London",
    "South East": "Surrey, Kent and Sussex",
  };
  for (const [region, name] of Object.entries(englishRegionNames)) {
    const codes = gbr
      .filter((unit) => unit.region === region)
      .map((unit) => unit.code);
    add({
      key: `gbr-${slug(name)}`,
      name,
      mapTag: "GBR",
      ownerTag: "GBR",
      grouping: "England",
      affiliation: "Historic English county grouping",
      confidence: "medium",
      notes:
        "A grouping of historic English counties for map legibility; the 1900 boundary follows the M11c United Kingdom polygon.",
      codes,
    });
  }
  const southWest = gbr.filter((unit) => unit.region === "South West");
  const devonCornwall = southWest.filter((unit) =>
    /devon|cornwall|plymouth|torbay|scilly/i.test(unit.name),
  );
  const wessex = southWest.filter((unit) => !devonCornwall.includes(unit));
  add({
    key: "gbr-devon-and-cornwall",
    name: "Devon and Cornwall",
    mapTag: "GBR",
    ownerTag: "GBR",
    grouping: "England",
    affiliation: "Historic English county grouping",
    notes:
      "The south-western English peninsula of Devon and Cornwall, grouped from historic counties for map legibility.",
    codes: devonCornwall.map((unit) => unit.code),
  });
  add({
    key: "gbr-wessex",
    name: "Wessex",
    mapTag: "GBR",
    ownerTag: "GBR",
    grouping: "England",
    affiliation: "Historic English county grouping",
    notes:
      "The Wessex group of historic southern English counties (Dorset, Somerset, Wiltshire, Hampshire, Berkshire and Gloucestershire).",
    codes: wessex.map((unit) => unit.code),
  });

  const wales = gbr.filter(
    (unit) => unit.region === "East Wales" || unit.region === "West Wales and the Valleys",
  );
  const walesGroups = [
    { key: "gbr-north-wales", name: "North Wales", min: 52.75 },
    { key: "gbr-mid-wales", name: "Mid Wales", min: 52.25 },
    { key: "gbr-south-wales", name: "South Wales", min: -Infinity },
  ];
  for (const group of walesGroups) {
    const codes = wales
      .filter((unit) => unit.lat >= group.min)
      .filter((unit) => {
        if (group.min === 52.75) return true;
        if (group.min === 52.25) return unit.lat < 52.75;
        return unit.lat < 52.25;
      })
      .map((unit) => unit.code);
    add({
      key: group.key,
      name: group.name,
      mapTag: "GBR",
      ownerTag: "GBR",
      grouping: "Wales",
      affiliation: "Historic Welsh county grouping",
      confidence: "medium",
      notes: "A grouping of historic Welsh counties; Wales is a distinct 1900 constituent country.",
      codes,
    });
  }

  const scotlandNames = {
    "Highlands and Islands": "Highlands and Islands",
    "North Eastern": "North East Scotland",
    Eastern: "East Scotland",
    "South Western": "South West Scotland",
  };
  for (const [region, name] of Object.entries(scotlandNames)) {
    add({
      key: `gbr-${slug(name)}`,
      name,
      mapTag: "GBR",
      ownerTag: "GBR",
      grouping: "Scotland",
      affiliation: "Historic Scottish county grouping",
      confidence: "medium",
      notes: "A grouping of historic Scottish counties; Scotland is a distinct 1900 constituent country.",
      codes: gbr.filter((unit) => unit.region === region).map((unit) => unit.code),
    });
  }

  const niCounty = {
    Antrim: ["Antrim", "Ballymena", "Ballymoney", "Belfast", "Carrickfergus", "Larne", "Moyle", "Newtownabbey", "Lisburn"],
    Down: ["Down", "Ards", "North Down", "Castlereagh", "Newry and Mourne", "Banbridge"],
    Armagh: ["Armagh", "Craigavon"],
    Fermanagh: ["Fermanagh"],
    Londonderry: ["Derry", "Coleraine", "Limavady", "Magherafelt"],
    Tyrone: ["Omagh", "Strabane", "Dungannon", "Mid Ulster"],
  };
  for (const [county, names] of Object.entries(niCounty)) {
    const codes = gbr
      .filter((unit) => unit.region === "Northern Ireland" && names.includes(unit.name))
      .map((unit) => unit.code);
    add({
      key: `gbr-ni-${slug(county)}`,
      name: `County ${county}`,
      mapTag: "GBR",
      ownerTag: "GBR",
      grouping: "Ireland (Northern Ireland)",
      affiliation: "Historic Irish county",
      confidence: "high",
      notes:
        "One of the six counties that formed Northern Ireland under the Government of Ireland Act 1920. In 1900 it is an ordinary Irish county of the United Kingdom.",
      codes,
    });
  }

  const irelandCountyNames = {
    CE: "Clare", CN: "Cavan", CO: "Cork", CW: "Carlow", D: "Dublin", DL: "Donegal", G: "Galway",
    KE: "Kildare", KK: "Kilkenny", KY: "Kerry", LD: "Longford", LH: "Louth",
    LK: "Limerick", LM: "Leitrim", LS: "Laois", MH: "Meath", MN: "Monaghan",
    MO: "Mayo", OY: "Offaly", RN: "Roscommon", SO: "Sligo", TA: "Tipperary",
    WD: "Waterford", WH: "Westmeath", WW: "Wicklow", WX: "Wexford",
  };
  for (const [code, name] of Object.entries(irelandCountyNames)) {
    const codes = unitsForCountry("IRL")
      .filter((unit) => unit.code === `IE-${code}`)
      .map((unit) => unit.code);
    add({
      key: `gbr-ie-${slug(name)}`,
      name: `County ${name}`,
      mapTag: "GBR",
      ownerTag: "GBR",
      grouping: "Ireland",
      affiliation: "Historic Irish county",
      confidence: "high",
      notes:
        "One of the twenty-six counties that formed the Irish Free State in 1922. In 1900 Ireland is part of the United Kingdom.",
      codes,
    });
  }

  // ---------------------------------------------------------------------------
  // France
  // ---------------------------------------------------------------------------
  const overseas = new Set([
    "Guyane française",
    "Guadeloupe",
    "Martinique",
    "Réunion",
    "Mayotte",
  ]);
  for (const unit of unitsForCountry("FRA")) {
    if (overseas.has(unit.region) || ["FR-57", "FR-67", "FR-68"].includes(unit.code)) continue;
    add({
      key: `fra-${slug(unit.name)}`,
      name: unit.name,
      mapTag: "FRA",
      ownerTag: "FRA",
      grouping: "Metropolitan France",
      affiliation: "French department",
      confidence: "medium",
      notes:
        "A French department on the 1900 map; the department boundary is a modern proxy for the historical department.",
      codes: [unit.code],
    });
  }

  // ---------------------------------------------------------------------------
  // Italy (1900 borders; Trentino, South Tyrol and Venezia Giulia are Austrian)
  // ---------------------------------------------------------------------------
  const ita = unitsForCountry("ITA");
  const italianRegions = {
    Piemonte: "Piedmont",
    "Valle d'Aosta": "Aosta",
    Liguria: "Liguria",
    Lombardia: "Lombardy",
    Veneto: "Venetia",
    "Emilia-Romagna": "Emilia-Romagna",
    Toscana: "Tuscany",
    Umbria: "Umbria",
    Marche: "Marche",
    Lazio: "Lazio",
    Abruzzo: "Abruzzo",
    Molise: "Molise",
    Campania: "Campania",
    Apulia: "Apulia",
    Basilicata: "Basilicata",
    Calabria: "Calabria",
    Sicily: "Sicily",
    Sardegna: "Sardinia",
  };
  for (const [region, name] of Object.entries(italianRegions)) {
    const codes = ita.filter((unit) => unit.region === region).map((unit) => unit.code);
    add({
      key: `ita-${slug(name)}`,
      name,
      mapTag: "ITA",
      ownerTag: "ITA",
      grouping: "Kingdom of Italy",
      affiliation: "Historic Italian region",
      confidence: "medium",
      notes:
        "A historic Italian region composed of modern provinces; the 1900 boundary is the M11c Italian polygon.",
      codes,
    });
  }
  add({
    key: "ita-friuli",
    name: "Friuli",
    mapTag: "ITA",
    ownerTag: "ITA",
    grouping: "Kingdom of Italy",
    affiliation: "Historic Italian region",
    notes:
      "Friuli, the Italian part of the historic Patria del Friuli. Gorizia and Trieste were Austrian in 1900.",
    codes: ita.filter((unit) => ["IT-UD", "IT-PN"].includes(unit.code)).map((u) => u.code),
  });

  // ---------------------------------------------------------------------------
  // Iberia, Benelux, Switzerland
  // ---------------------------------------------------------------------------
  for (const unit of unitsForCountry("ESP")) {
    // Ceuta and Melilla lie on the African coast outside the M11c Spanish
    // polygon; they are not part of the European provincial work package.
    if (unit.code === "ES-CE" || unit.code === "ES-ML") continue;
    add({
      key: `esp-${slug(unit.name)}`,
      name: unit.name,
      mapTag: "ESP",
      ownerTag: "ESP",
      grouping: "Kingdom of Spain",
      affiliation: "Spanish province",
      confidence: "high",
      notes: "A Spanish province; most 1900 provincial boundaries survive in the modern units.",
      codes: [unit.code],
    });
  }
  for (const unit of unitsForCountry("PRT")) {
    add({
      key: `prt-${slug(unit.name)}`,
      name: unit.name,
      mapTag: "PRT",
      ownerTag: "PRT",
      grouping: "Kingdom of Portugal",
      affiliation: "Portuguese district",
      confidence: "high",
      notes: "A Portuguese district; the 1900 mainland and island districts are retained.",
      codes: [unit.code],
    });
  }
  for (const unit of unitsForCountry("NLD")) {
    if (unit.code.startsWith("NL-BQ")) continue;
    add({
      key: `nld-${slug(unit.name)}`,
      name: unit.name,
      mapTag: "NLD",
      ownerTag: "NLD",
      grouping: "Kingdom of the Netherlands",
      affiliation: "Dutch province",
      confidence: unit.code === "NL-FL" ? "low" : "high",
      notes:
        unit.code === "NL-FL"
          ? "Flevoland is post-1900 reclaimed land included in the modern base outline; the province is retained as a low-confidence modern overlay."
          : "A Dutch province on the 1900 map.",
      codes: [unit.code],
    });
  }
  for (const unit of unitsForCountry("BEL")) {
    add({
      key: `bel-${slug(unit.name)}`,
      name: unit.name,
      mapTag: "BEL",
      ownerTag: "BEL",
      grouping: "Kingdom of Belgium",
      affiliation: "Belgian province",
      confidence: "high",
      notes: "A Belgian province; the 1900 polygon excludes Eupen-Malmedy, which is German.",
      codes: [unit.code],
    });
  }
  for (const unit of unitsForCountry("LUX")) {
    add({
      key: `lux-${slug(unit.name)}`,
      name: unit.name,
      mapTag: "LUX",
      ownerTag: "LUX",
      grouping: "Grand Duchy of Luxembourg",
      affiliation: "Luxembourg district",
      confidence: "high",
      notes: "A Luxembourg district; the grand duchy was in personal union with the Netherlands until 1890 and independent in 1900.",
      codes: [unit.code],
    });
  }
  for (const unit of unitsForCountry("CHE")) {
    add({
      key: `che-${slug(unit.name)}`,
      name: unit.name,
      mapTag: "CHE",
      ownerTag: "CHE",
      grouping: "Swiss Confederation",
      affiliation: "Swiss canton",
      confidence: "high",
      notes: "A Swiss canton; cantonal boundaries were stable in 1900.",
      codes: [unit.code],
    });
  }

  // ---------------------------------------------------------------------------
  // Scandinavia and Denmark
  // ---------------------------------------------------------------------------
  for (const unit of unitsForCountry("SWE")) {
    add({
      key: `swe-${slug(unit.name)}`,
      name: unit.name,
      mapTag: "SWE",
      ownerTag: "SWE",
      grouping: "Kingdom of Sweden",
      affiliation: "Swedish county (län)",
      confidence: "high",
      notes: "A Swedish county (län).",
      codes: [unit.code],
    });
  }
  for (const unit of unitsForCountry("NOR")) {
    if (unit.code === "NO-21" || unit.code === "NO-X01~") continue;
    add({
      key: `nor-${slug(unit.name)}`,
      name: unit.name,
      mapTag: "NOR",
      ownerTag: "NOR",
      grouping: "Kingdom of Norway",
      affiliation: "Norwegian county (amt/fylke)",
      confidence: "high",
      notes: "A Norwegian county; Norway was in personal union with Sweden in 1900.",
      codes: [unit.code],
    });
  }
  const denmarkNames = {
    "DK-81": "North Jutland",
    "DK-82": "Central Jutland",
    "DK-83": "South Jutland",
    "DK-84": "Copenhagen",
    "DK-85": "Zealand",
  };
  for (const [code, name] of Object.entries(denmarkNames)) {
    add({
      key: `dnk-${slug(name)}`,
      name,
      mapTag: "DNK",
      ownerTag: "DNK",
      grouping: "Kingdom of Denmark",
      affiliation: "Danish region (amt)",
      confidence: "medium",
      notes: "A Danish regional grouping; 1900 Denmark used amter rather than the modern regions.",
      codes: [code],
    });
  }

  // ---------------------------------------------------------------------------
  // Greece, Serbia, Montenegro, Romania, Bulgaria
  // ---------------------------------------------------------------------------
  const greekNames = {
    "GR-A1": "Attica",
    "GR-J": "Peloponnese",
    "GR-E": "Thessaly",
    "GR-H": "Central Greece",
    "GR-F": "Ionian Islands",
    "GR-K": "Northern Aegean Islands",
    "GR-L": "Southern Aegean Islands",
    "GR-D": "Epirus",
    "GR-B": "Macedonia",
    "GR-C": "Western Macedonia",
    "GR-A": "Thrace",
  };
  for (const [code, name] of Object.entries(greekNames)) {
    const unit = byCode.get(code);
    if (unit === undefined) {
      missingCodes.add(code);
      continue;
    }
    add({
      key: `grc-${slug(name)}`,
      name,
      mapTag: "GRC",
      ownerTag: "GRC",
      grouping: "Kingdom of Greece",
      affiliation: "Historic Greek region",
      confidence: ["GR-B", "GR-C", "GR-A", "GR-D"].includes(code) ? "low" : "medium",
      notes: ["GR-B", "GR-C", "GR-A", "GR-D"].includes(code)
        ? "Only the part inside the 1900 Greek polygon is Greek; the remainder of this modern unit was Ottoman until 1912-13 and is assigned to the Ottoman vilayets."
        : "A historic Greek region; the modern unit is a proxy for the 1900 extent.",
      codes: [code],
    });
  }

  const serbianGroups = {
    Belgrade: ["RS-00"],
    Šumadija: ["RS-10", "RS-12", "RS-13"],
    Podrinje: ["RS-08", "RS-09", "RS-16", "RS-17", "RS-18", "RS-19"],
    Niš: ["RS-14", "RS-15", "RS-20", "RS-21", "RS-22", "RS-23", "RS-24"],
    Timok: ["RS-11"],
  };
  for (const [name, codes] of Object.entries(serbianGroups)) {
    add({
      key: `srb-${slug(name)}`,
      name,
      mapTag: "SRB",
      ownerTag: "SRB",
      grouping: "Kingdom of Serbia",
      affiliation: "Serbian district (okrug)",
      confidence: "medium",
      notes: "A grouping of Serbian districts; the 1900 kingdom was smaller than modern Serbia.",
      codes,
    });
  }

  const montenegroGroups = {
    Montenegro: ["ME-06", "ME-07", "ME-12", "ME-09", "ME-18", "ME-21", "ME-16"],
    Brda: ["ME-01", "ME-02", "ME-03", "ME-04", "ME-05", "ME-11", "ME-13", "ME-14", "ME-15", "ME-17", "ME-19", "ME-20"],
    "Old Herzegovina": ["ME-08", "ME-10"],
  };
  for (const [name, codes] of Object.entries(montenegroGroups)) {
    add({
      key: `mnt-${slug(name)}`,
      name,
      mapTag: "MNT",
      ownerTag: "MNT",
      grouping: "Principality of Montenegro",
      affiliation: "Montenegrin district",
      confidence: "low",
      notes: "A grouping of Montenegrin municipalities for the 1900 principality.",
      codes,
    });
  }

  const romanianGroups = {
    Muntenia: ["RO-B", "RO-IF", "RO-CL", "RO-DB", "RO-GR", "RO-IL", "RO-PH", "RO-TR", "RO-BZ", "RO-BR", "RO-AG", "RO-VN"],
    Oltenia: ["RO-OT", "RO-DJ", "RO-GJ", "RO-MH", "RO-VL"],
    Moldavia: ["RO-IS", "RO-NT", "RO-VS", "RO-BC", "RO-GL"],
    Dobruja: ["RO-CT", "RO-TL"],
  };
  for (const [name, codes] of Object.entries(romanianGroups)) {
    add({
      key: `rom-${slug(name)}`,
      name,
      mapTag: "ROM",
      ownerTag: "ROM",
      grouping: "Kingdom of Romania",
      affiliation: "Historic Romanian province",
      confidence: "medium",
      notes:
        "One of the Old Kingdom provinces. Transylvania, Banat, Bukovina and the Székely land are Austrian-Hungarian in 1900.",
      codes,
    });
  }

  const bulgarianGroups = {
    Sofia: ["BG-22", "BG-23", "BG-10", "BG-14", "BG-01"],
    Plovdiv: ["BG-16", "BG-13", "BG-21", "BG-26"],
    "Stara Zagora": ["BG-24", "BG-20", "BG-28", "BG-09"],
    Ruse: ["BG-18", "BG-19", "BG-17", "BG-25", "BG-07", "BG-04"],
    Varna: ["BG-03", "BG-08", "BG-27", "BG-02"],
    Pleven: ["BG-15", "BG-11", "BG-05", "BG-06", "BG-12"],
  };
  for (const [name, codes] of Object.entries(bulgarianGroups)) {
    add({
      key: `bgr-${slug(name)}`,
      name,
      mapTag: "BGR",
      ownerTag: "BGR",
      grouping: "Principality of Bulgaria",
      affiliation: "Bulgarian okrug grouping",
      confidence: "medium",
      notes:
        "A grouping of Bulgarian oblasts. Bulgaria was an autonomous vassal of the Ottoman Empire until 1908; Eastern Rumelia had been united with it in 1885.",
      codes,
    });
  }

  // ---------------------------------------------------------------------------
  // Ottoman Europe (including Albania, Macedonia, Kosovo and Ottoman Thrace)
  // ---------------------------------------------------------------------------
  const ottomanAnchors = [
    { name: "Constantinople", lon: 28.98, lat: 41.01 },
    { name: "Adrianople", lon: 26.56, lat: 41.68 },
    { name: "Salonika", lon: 22.94, lat: 40.64 },
    { name: "Monastir", lon: 21.33, lat: 41.03 },
    { name: "Kosovo", lon: 21.17, lat: 42.22 },
    { name: "Scutari", lon: 19.51, lat: 42.07 },
    { name: "Janina", lon: 20.85, lat: 39.66 },
  ];
  const ottomanUnits = units.filter(
    (unit) =>
      ["OTT", "GRC", "ALB", "MKD", "TUR"].includes(unit.country) &&
      unit.code !== "GR-M" &&
      unit.lon > 18 &&
      unit.lat > 35 &&
      unit.lat < 43.5,
  );
  const anchorGroups = new Map(ottomanAnchors.map((anchor) => [anchor.name, []]));
  for (const unit of ottomanUnits) {
    let best = null;
    let bestDistance = Infinity;
    for (const anchor of ottomanAnchors) {
      const distance = Math.hypot(unit.lon - anchor.lon, unit.lat - anchor.lat);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = anchor;
      }
    }
    if (best !== null) anchorGroups.get(best.name).push(unit.code);
  }
  for (const anchor of ottomanAnchors) {
    add({
      key: `ott-${slug(anchor.name)}`,
      name: anchor.name,
      mapTag: "OTT",
      ownerTag: "OTT",
      grouping: "European Ottoman Empire",
      affiliation: "Ottoman vilayet grouping",
      confidence: "low",
      notes:
        "A grouping of modern units around a 1900 Ottoman vilayet capital; only the part inside the M11c Ottoman polygon is Ottoman. Albania, Macedonia and Thrace gained independence or changed hands in 1912-23. Anatolia and the Arab provinces are outside the M12a European provincial scope.",
      codes: anchorGroups.get(anchor.name),
      clip: [
        {
          polygon: [
            [18, 36.5],
            [23, 35.5],
            [26, 36],
            [28, 40],
            [30, 41.5],
            [30, 43],
            [18, 43],
          ],
        },
      ],
    });
  }

  // ---------------------------------------------------------------------------
  // Austria-Hungary
  // ---------------------------------------------------------------------------
  const austrianCrownLands = [
    ["Vienna", "AT-9", "Austrian Crown Land"],
    ["Lower Austria", "AT-3", "Austrian Crown Land"],
    ["Upper Austria", "AT-4", "Austrian Crown Land"],
    ["Salzburg", "AT-5", "Austrian Crown Land"],
    ["Styria", "AT-6", "Austrian Crown Land"],
    ["Carinthia", "AT-2", "Austrian Crown Land", ["AT-2", "SI-016", "SI-025", "SI-074", "SI-101", "SI-103", "SI-112", "SI-126", "SI-133", "SI-141", "SI-175", "SI-177", "SI-179"]],
    ["Tyrol", "AT-7", "Austrian Crown Land"],
    ["Vorarlberg", "AT-8", "Austrian Crown Land"],
  ];
  for (const crownLand of austrianCrownLands) {
    const [name, code, affiliation, codes = [code]] = crownLand;
    add({
      key: `aut-${slug(name)}`,
      name,
      mapTag: "AUT",
      ownerTag: "AUT",
      grouping: "Austrian half",
      affiliation,
      confidence: "high",
      notes: "An Austrian crown land of the dual monarchy on 1 January 1900.",
      codes,
    });
  }

  // Bohemia, Moravia, Austrian Silesia and Hultschin.
  add({
    key: "aut-prague",
    name: "Prague",
    mapTag: "AUT",
    ownerTag: "AUT",
    grouping: "Austrian half",
    affiliation: "Austrian Crown Land (Bohemia)",
    confidence: "high",
    notes: "The royal capital of Bohemia, administered separately for this partition.",
    codes: ["CZ-PR"],
  });
  add({
    key: "aut-bohemia",
    name: "Bohemia",
    mapTag: "AUT",
    ownerTag: "AUT",
    grouping: "Austrian half",
    affiliation: "Austrian Crown Land",
    confidence: "medium",
    notes: "The Kingdom of Bohemia. Modern Czech regions approximate the 1900 crown land.",
    codes: ["CZ-ST", "CZ-JC", "CZ-PL", "CZ-KA", "CZ-US", "CZ-LI", "CZ-KR", "CZ-PA"],
  });
  add({
    key: "aut-moravia",
    name: "Moravia",
    mapTag: "AUT",
    ownerTag: "AUT",
    grouping: "Austrian half",
    affiliation: "Austrian Crown Land",
    confidence: "medium",
    notes: "The Margraviate of Moravia; modern regions approximate the 1900 crown land.",
    codes: ["CZ-JM", "CZ-ZL", "CZ-VY", "CZ-OL"],
  });
  add({
    key: "aut-austrian-silesia",
    name: "Austrian Silesia",
    mapTag: "AUT",
    ownerTag: "AUT",
    grouping: "Austrian half",
    affiliation: "Austrian Crown Land",
    confidence: "medium",
    notes: "The Duchy of Upper and Lower Silesia, excluding the Hultschin district.",
    codes: ["CZ-MO"],
    exclude: [{ polygon: [[17.75, 49.85], [18.35, 49.85], [18.35, 50.1], [17.75, 50.1]] }],
  });
  add({
    key: "aut-hultschin",
    name: "Hultschin",
    mapTag: "AUT",
    ownerTag: "AUT",
    grouping: "Austrian half",
    affiliation: "Austrian Crown Land (Silesia)",
    confidence: "low",
    notes:
      "The Hlučín (Hultschin) district of Austrian Silesia, transferred to Czechoslovakia in 1920. The exact district boundary is approximated by a small clip.",
    codes: ["CZ-MO"],
    clip: [{ polygon: [[17.75, 49.85], [18.35, 49.85], [18.35, 50.1], [17.75, 50.1]] }],
  });

  // Galicia, Bukovina, Carpathian Ruthenia.
  add({
    key: "aut-western-galicia",
    name: "Western Galicia",
    mapTag: "AUT",
    ownerTag: "AUT",
    grouping: "Austrian half",
    affiliation: "Austrian Crown Land (Galicia)",
    confidence: "medium",
    notes: "The western part of the Kingdom of Galicia and Lodomeria around Kraków.",
    codes: ["PL-MA", "PL-PK"],
  });
  add({
    key: "aut-eastern-galicia",
    name: "Eastern Galicia",
    mapTag: "AUT",
    ownerTag: "AUT",
    grouping: "Austrian half",
    affiliation: "Austrian Crown Land (Galicia)",
    confidence: "medium",
    notes: "The eastern part of Galicia around Lemberg (Lviv), with a Ukrainian majority in 1900.",
    codes: ["UA-46", "UA-26"],
  });
  add({
    key: "aut-tarnopol",
    name: "Tarnopol",
    mapTag: "AUT",
    ownerTag: "AUT",
    grouping: "Austrian half",
    affiliation: "Austrian Crown Land (Galicia)",
    confidence: "medium",
    notes: "The eastern Galician district of Tarnopol, separated for the post-1918 Polish-Soviet border.",
    codes: ["UA-61"],
  });
  add({
    key: "aut-northern-bukovina",
    name: "Northern Bukovina",
    mapTag: "AUT",
    ownerTag: "AUT",
    grouping: "Austrian half",
    affiliation: "Austrian Crown Land (Bukovina)",
    confidence: "medium",
    notes: "Northern Bukovina around Chernivtsi; transferred to Romania in 1918 and to the USSR in 1940.",
    codes: ["UA-77"],
  });
  add({
    key: "aut-southern-bukovina",
    name: "Southern Bukovina",
    mapTag: "AUT",
    ownerTag: "AUT",
    grouping: "Austrian half",
    affiliation: "Austrian Crown Land (Bukovina)",
    confidence: "medium",
    notes: "Southern Bukovina around Suceava, retained by Romania after 1918.",
    codes: ["RO-SV", "RO-BT"],
  });
  add({
    key: "aut-carpathian-ruthenia",
    name: "Carpathian Ruthenia",
    mapTag: "AUT",
    ownerTag: "AUT",
    grouping: "Hungarian half",
    affiliation: "Hungarian county (Ung, Bereg, Ugocsa, Máramaros)",
    confidence: "medium",
    notes: "Subcarpathian Ruthenia, part of Hungary in 1900 and of Czechoslovakia after 1919.",
    codes: ["UA-21"],
  });

  // Carniola, Lower Styria and the Littoral.
  const slovenianMunicipalities = unitsForCountry("SVN");
  function slovenianByAnchor(anchors) {
    const groups = new Map(anchors.map((anchor) => [anchor.name, []]));
    for (const unit of slovenianMunicipalities) {
      let best = null;
      let bestDistance = Infinity;
      for (const anchor of anchors) {
        const distance = Math.hypot(unit.lon - anchor.lon, unit.lat - anchor.lat);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = anchor;
        }
      }
      if (best !== null) groups.get(best.name).push(unit.code);
    }
    return groups;
  }
  const slovenianGroups = slovenianByAnchor([
    { name: "Carniola", lon: 14.51, lat: 46.05 },
    { name: "Lower Styria", lon: 15.65, lat: 46.55 },
    { name: "Gorizia and Gradisca", lon: 13.65, lat: 45.95 },
    { name: "Istria", lon: 13.85, lat: 45.55 },
    { name: "Carinthia (Slovenian)", lon: 14.85, lat: 46.55 },
  ]);
  add({
    key: "aut-carniola",
    name: "Carniola",
    mapTag: "AUT",
    ownerTag: "AUT",
    grouping: "Austrian half",
    affiliation: "Austrian Crown Land",
    confidence: "low",
    notes: "The Duchy of Carniola; Slovenian municipalities are grouped around Ljubljana.",
    codes: slovenianGroups.get("Carniola"),
  });
  add({
    key: "aut-lower-styria",
    name: "Lower Styria",
    mapTag: "AUT",
    ownerTag: "AUT",
    grouping: "Austrian half",
    affiliation: "Austrian Crown Land (Styria)",
    confidence: "low",
    notes: "The Slovenian part of the Duchy of Styria, grouped around Maribor.",
    codes: slovenianGroups.get("Lower Styria"),
  });
  add({
    key: "aut-gorizia-gradisca",
    name: "Gorizia and Gradisca",
    mapTag: "AUT",
    ownerTag: "AUT",
    grouping: "Austrian half",
    affiliation: "Austrian Littoral",
    confidence: "low",
    notes: "The Princely County of Gorizia and Gradisca, including the Soča valley.",
    codes: [...slovenianGroups.get("Gorizia and Gradisca"), "IT-GO"],
  });
  add({
    key: "aut-istria",
    name: "Istria",
    mapTag: "AUT",
    ownerTag: "AUT",
    grouping: "Austrian half",
    affiliation: "Austrian Littoral",
    confidence: "medium",
    notes: "The Margraviate of Istria, including the Slovenian and Croatian coast.",
    codes: [...slovenianGroups.get("Istria"), "HR-18", "SI-040", "SI-050", "SI-090"],
  });
  add({
    key: "aut-trieste",
    name: "Trieste",
    mapTag: "AUT",
    ownerTag: "AUT",
    grouping: "Austrian half",
    affiliation: "Austrian Littoral",
    confidence: "high",
    notes: "The free imperial city and port of Trieste.",
    codes: ["IT-TS"],
  });
  add({
    key: "aut-south-tyrol",
    name: "South Tyrol",
    mapTag: "AUT",
    ownerTag: "AUT",
    grouping: "Austrian half",
    affiliation: "Austrian Crown Land (Tyrol)",
    confidence: "high",
    notes: "The German-speaking southern part of Tyrol, transferred to Italy in 1919.",
    codes: ["IT-BZ"],
  });
  add({
    key: "aut-trentino",
    name: "Trentino",
    mapTag: "AUT",
    ownerTag: "AUT",
    grouping: "Austrian half",
    affiliation: "Austrian Crown Land (Tyrol)",
    confidence: "high",
    notes: "The Italian-speaking Welsch Tyrol (Trentino), transferred to Italy in 1919.",
    codes: ["IT-TN"],
  });

  // Dalmatia and Fiume.
  add({
    key: "aut-northern-dalmatia",
    name: "Northern Dalmatia",
    mapTag: "AUT",
    ownerTag: "AUT",
    grouping: "Austrian half",
    affiliation: "Austrian Crown Land (Dalmatia)",
    confidence: "medium",
    notes: "Northern Dalmatia around Zadar and Šibenik.",
    codes: ["HR-13", "HR-15"],
  });
  add({
    key: "aut-southern-dalmatia",
    name: "Southern Dalmatia",
    mapTag: "AUT",
    ownerTag: "AUT",
    grouping: "Austrian half",
    affiliation: "Austrian Crown Land (Dalmatia)",
    confidence: "medium",
    notes:
      "Southern Dalmatia around Split, Dubrovnik and the Bay of Kotor (Cattaro), which the M11c reconstruction places in Austria-Hungary.",
    codes: ["HR-17", "HR-19", "ME-10"],
  });
  add({
    key: "aut-fiume",
    name: "Fiume",
    mapTag: "AUT",
    ownerTag: "AUT",
    grouping: "Hungarian half",
    affiliation: "Hungarian corpus separatum",
    confidence: "medium",
    notes:
      "The corpus separatum of Fiume (Rijeka), directly under the Hungarian crown rather than Croatia-Slavonia. The exact city boundary is approximated.",
    codes: ["HR-08"],
    clip: [{ polygon: [[14.25, 45.25], [14.6, 45.25], [14.6, 45.45], [14.25, 45.45]] }],
  });

  // Bosnia-Herzegovina: joint Austro-Hungarian administration.
  const bosniaUnits = unitsForCountry("BIH");
  add({
    key: "aut-bosnia",
    name: "Bosnia",
    mapTag: "AUT",
    ownerTag: "AUT",
    grouping: "Joint Austro-Hungarian administration",
    affiliation: "Bosnia and Herzegovina (joint administration)",
    confidence: "medium",
    notes:
      "Bosnia proper. Formally under Ottoman sovereignty until 1908 and jointly administered by Austria and Hungary; never an ordinary province of either half.",
    special: "joint-administration",
    codes: bosniaUnits.filter((unit) => unit.lat >= 44.0).map((unit) => unit.code),
  });
  add({
    key: "aut-herzegovina",
    name: "Herzegovina",
    mapTag: "AUT",
    ownerTag: "AUT",
    grouping: "Joint Austro-Hungarian administration",
    affiliation: "Bosnia and Herzegovina (joint administration)",
    confidence: "medium",
    notes:
      "Herzegovina, the southern part of the jointly administered territory. Annexed by Austria-Hungary in 1908.",
    special: "joint-administration",
    codes: bosniaUnits.filter((unit) => unit.lat < 44.0).map((unit) => unit.code),
  });

  // Croatia-Slavonia and the Hungarian core.
  const croatianUnits = unitsForCountry("HRV");
  const croatiaProper = ["HR-01", "HR-02", "HR-03", "HR-04", "HR-05", "HR-06", "HR-07", "HR-21"];
  const slavonia = ["HR-09", "HR-10", "HR-12", "HR-14", "HR-16", "HR-20"];
  add({
    key: "aut-croatia-proper",
    name: "Croatia Proper",
    mapTag: "AUT",
    ownerTag: "AUT",
    grouping: "Hungarian half",
    affiliation: "Kingdom of Croatia-Slavonia",
    confidence: "medium",
    notes: "Croatia-Slavonia was an autonomous kingdom within the Hungarian half of the monarchy.",
    codes: croatiaProper,
  });
  add({
    key: "aut-slavonia",
    name: "Slavonia",
    mapTag: "AUT",
    ownerTag: "AUT",
    grouping: "Hungarian half",
    affiliation: "Kingdom of Croatia-Slavonia",
    confidence: "medium",
    notes: "The eastern part of Croatia-Slavonia between the Drava and the Danube.",
    codes: slavonia,
  });
  void croatianUnits;

  const hungarianUnits = unitsForCountry("HUN");
  const hungarianGroups = {
    "Central Hungary": ["HU-BU", "HU-PE"],
    Transdanubia: ["HU-BA", "HU-FE", "HU-VE", "HU-VM", "HU-ZA", "HU-SO", "HU-TO", "HU-KE", "HU-GS", "HU-GY", "HU-DU", "HU-SN", "HU-VA", "HU-SH", "HU-NK", "HU-SF", "HU-SS", "HU-KV", "HU-PS", "HU-ZE", "HU-TB", "HU-ED"],
    "Northern Hungary": ["HU-BZ", "HU-HE", "HU-NO", "HU-ST"],
    "Great Hungarian Plain": ["HU-SZ", "HU-HB", "HU-DE", "HU-NY", "HU-BE", "HU-BC", "HU-SK", "HU-SD", "HU-HV", "HU-KM", "HU-MI", "HU-EG", "HU-JN", "HU-BK", "HU-CS"],
  };
  for (const [name, codes] of Object.entries(hungarianGroups)) {
    add({
      key: `aut-hun-${slug(name)}`,
      name,
      mapTag: "AUT",
      ownerTag: "AUT",
      grouping: "Hungarian half",
      affiliation: "Hungarian county grouping",
      confidence: "medium",
      notes:
        "A grouping of Hungarian counties of the Kingdom of Hungary. Burgenland, Slovakia, Transylvania, Banat and Vojvodina are separate provinces.",
      codes,
    });
  }
  add({
    key: "aut-burgenland",
    name: "Burgenland",
    mapTag: "AUT",
    ownerTag: "AUT",
    grouping: "Hungarian half",
    affiliation: "Hungarian western border counties",
    confidence: "medium",
    notes:
      "The German-speaking western borderland of Hungary, transferred to Austria in 1921. In 1900 it is part of the Hungarian half, not of Austria.",
    codes: ["AT-1"],
  });

  const slovakNames = {
    "SK-BL": "Pressburg",
    "SK-TA": "Nagyszombat",
    "SK-NI": "Nyitra",
    "SK-TC": "Trencsén",
    "SK-ZI": "Turóc",
    "SK-BC": "Besztercebánya",
    "SK-KI": "Kassa",
    "SK-PV": "Eperjes",
  };
  for (const [code, name] of Object.entries(slovakNames)) {
    add({
      key: `aut-svk-${slug(name)}`,
      name,
      displayName: name,
      aliases: [byCode.get(code)?.name ?? code],
      mapTag: "AUT",
      ownerTag: "AUT",
      grouping: "Hungarian half",
      affiliation: "Hungarian county grouping (Upper Hungary)",
      confidence: "medium",
      notes:
        "Upper Hungary (Slovakia), part of the Kingdom of Hungary in 1900 and of Czechoslovakia after 1918. The province name is the 1900 Hungarian/German name.",
      codes: [code],
    });
  }

  add({
    key: "aut-transylvania",
    name: "Transylvania",
    mapTag: "AUT",
    ownerTag: "AUT",
    grouping: "Hungarian half",
    affiliation: "Hungarian county grouping (Transylvania)",
    confidence: "medium",
    notes: "The Transylvanian counties around Cluj, Sibiu and Brașov, transferred to Romania in 1918-20.",
    codes: ["RO-CJ", "RO-SB", "RO-BV", "RO-MS", "RO-AB", "RO-AR", "RO-HD"],
  });
  add({
    key: "aut-szekely-land",
    name: "Székely Land",
    mapTag: "AUT",
    ownerTag: "AUT",
    grouping: "Hungarian half",
    affiliation: "Hungarian county grouping (Transylvania)",
    confidence: "medium",
    notes: "The Székely counties of Harghita and Covasna in eastern Transylvania.",
    codes: ["RO-HR", "RO-CV"],
  });
  add({
    key: "aut-partium",
    name: "Partium",
    mapTag: "AUT",
    ownerTag: "AUT",
    grouping: "Hungarian half",
    affiliation: "Hungarian county grouping (Partium)",
    confidence: "medium",
    notes: "The north-western Transylvanian counties (Bihor, Sălaj, Satu Mare, Maramureș).",
    codes: ["RO-BH", "RO-SJ", "RO-SM", "RO-MM", "RO-BN"],
  });
  add({
    key: "aut-banat",
    name: "Banat",
    mapTag: "AUT",
    ownerTag: "AUT",
    grouping: "Hungarian half",
    affiliation: "Hungarian county grouping (Banat)",
    confidence: "medium",
    notes:
      "The Banat of Temesvár, divided between Romania and Yugoslavia after 1918. The modern county units are a proxy for the historical boundary.",
    codes: ["RO-TM", "RO-CS", "RS-02", "RS-03", "RS-04"],
  });
  add({
    key: "aut-backa",
    name: "Bačka",
    mapTag: "AUT",
    ownerTag: "AUT",
    grouping: "Hungarian half",
    affiliation: "Hungarian county grouping (Bács-Bodrog)",
    confidence: "medium",
    notes: "The Bačka (Bácska) region of southern Hungary, divided between Yugoslavia and Hungary after 1918.",
    codes: ["RS-01", "RS-05", "RS-06"],
  });
  add({
    key: "aut-syrmia",
    name: "Syrmia",
    mapTag: "AUT",
    ownerTag: "AUT",
    grouping: "Hungarian half",
    affiliation: "Hungarian county grouping (Szerém)",
    confidence: "medium",
    notes: "The Syrmian county between the Danube and the Sava, transferred to Yugoslavia in 1918.",
    codes: ["RS-07"],
  });
  void hungarianUnits;

  // ---------------------------------------------------------------------------
  // German Empire
  // ---------------------------------------------------------------------------
  const de = unitsForCountry("DEU");
  const germanStates = {
    "DE-BY": ["Bavaria", "Kingdom of Bavaria"],
    "DE-SN": ["Saxony", "Kingdom of Saxony"],
    "DE-ST": ["Prussian Saxony", "Prussian Province of Saxony"],
    "DE-TH": ["Thuringia", "Thuringian states"],
    "DE-HE": ["Hesse", "Hesse and Hesse-Nassau"],
    "DE-HH": ["Hamburg", "Free and Hanseatic City of Hamburg"],
    "DE-HB": ["Bremen", "Free Hanseatic City of Bremen"],
    "DE-BE": ["Berlin", "Royal capital and residence city"],
    "DE-BB": ["Brandenburg", "Prussian Province of Brandenburg"],
    "PL-LB": ["Brandenburg (Lebus)", "Prussian Province of Brandenburg (Lebus)"],
    "DE-SH": ["Schleswig-Holstein", "Prussian Province of Schleswig-Holstein"],
    "DE-SL": ["Saar", "Prussian Rhine Province (Saar district)"],
  };
  for (const [code, [name, affiliation]] of Object.entries(germanStates)) {
    add({
      key: `deu-${slug(name)}`,
      name,
      mapTag: "DEU",
      ownerTag: "DEU",
      grouping: "German Empire",
      affiliation,
      confidence: code === "DE-SL" ? "medium" : "high",
      notes:
        code === "DE-SL"
          ? "The Saar district, which received a special League of Nations status in 1920. It is part of the Prussian Rhine Province in 1900."
          : code === "PL-LB"
            ? "The Lebus district east of the Oder, part of Prussian Brandenburg in 1900; the modern Lubusz voivodeship is the geometric proxy."
            : "A constituent state or Prussian province of the German Empire on 1 January 1900.",
      codes: [code],
    });
  }
  // The 1920 North Schleswig plebiscite boundary, approximated by the
  // Tønder-Flensburg line. Using a line instead of a rectangle avoids the
  // artificial east/west cuts that showed up near the Danish border.
  const northSchleswigBoundary = [
    [8.0, 54.95],
    [8.55, 54.95],
    [8.95, 54.92],
    [9.2, 54.89],
    [9.4, 54.86],
    [9.65, 54.84],
    [9.9, 54.82],
    [10.5, 54.8],
    [10.5, 56.0],
    [8.0, 56.0],
  ];
  const schleswigHolstein = provinces.find(
    (province) => province.key === "deu-schleswig-holstein",
  );
  if (schleswigHolstein !== undefined) {
    schleswigHolstein.exclude = [{ polygon: northSchleswigBoundary }];
  }
  add({
    key: "deu-baden",
    name: "Baden",
    mapTag: "DEU",
    ownerTag: "DEU",
    grouping: "German Empire",
    affiliation: "Grand Duchy of Baden",
    confidence: "low",
    notes:
      "Baden is separated from Württemberg by an approximate north-south clip through the modern Baden-Württemberg unit.",
    codes: ["DE-BW"],
    clip: [{ polygon: [[7.4, 47.5], [8.7, 47.5], [8.7, 49.8], [7.4, 49.8]] }],
  });
  add({
    key: "deu-wurttemberg",
    name: "Württemberg",
    mapTag: "DEU",
    ownerTag: "DEU",
    grouping: "German Empire",
    affiliation: "Kingdom of Württemberg",
    confidence: "low",
    notes:
      "Württemberg is separated from Baden by an approximate clip through the modern Baden-Württemberg unit; the Hohenzollern exclave is a separate province.",
    codes: ["DE-BW"],
    exclude: [
      { polygon: [[7.4, 47.5], [8.7, 47.5], [8.7, 49.8], [7.4, 49.8]] },
      { polygon: [[8.9, 47.9], [9.5, 47.9], [9.5, 48.35], [8.9, 48.35]] },
    ],
  });
  add({
    key: "deu-hohenzollern",
    name: "Hohenzollern",
    mapTag: "DEU",
    ownerTag: "DEU",
    grouping: "German Empire",
    affiliation: "Prussian Province of the Rhine (Hohenzollern)",
    confidence: "low",
    notes: "The small Prussian exclave of Hohenzollern in southern Württemberg.",
    codes: ["DE-BW"],
    clip: [{ polygon: [[8.9, 47.9], [9.5, 47.9], [9.5, 48.35], [8.9, 48.35]] }],
  });
  add({
    key: "deu-mecklenburg",
    name: "Mecklenburg",
    mapTag: "DEU",
    ownerTag: "DEU",
    grouping: "German Empire",
    affiliation: "Grand Duchies of Mecklenburg-Schwerin and Mecklenburg-Strelitz",
    confidence: "medium",
    notes: "Mecklenburg west of the historical Pomeranian border, approximated by 12.8°E.",
    codes: ["DE-MV"],
    clip: [{ polygon: [[10.5, 53.0], [12.8, 53.0], [12.8, 54.8], [10.5, 54.8]] }],
  });
  add({
    key: "deu-pomerania",
    name: "Pomerania",
    mapTag: "DEU",
    ownerTag: "DEU",
    grouping: "German Empire",
    affiliation: "Prussian Province of Pomerania",
    confidence: "medium",
    notes:
      "Prussian Pomerania including Vorpommern (the part of modern Mecklenburg-Vorpommern east of 12.8°E) and modern West Pomerania.",
    codes: ["PL-ZP", "DE-MV"],
    clip: [{ polygon: [[12.8, 53.0], [17.8, 53.0], [17.8, 55.0], [12.8, 55.0]] }],
  });
  add({
    key: "deu-west-prussia",
    name: "West Prussia",
    mapTag: "DEU",
    ownerTag: "DEU",
    grouping: "German Empire",
    affiliation: "Prussian Province of West Prussia",
    confidence: "medium",
    notes:
      "The Vistula corridor province, including the part of modern Kuyavian-Pomeranian north of 52.9°N. The Free City of Danzig is a separate province.",
    codes: ["PL-PM", "PL-KP"],
    clip: [{ polygon: [[15.5, 52.9], [19.6, 52.9], [19.6, 54.9], [15.5, 54.9]] }],
    exclude: [{ polygon: [[18.35, 54.2], [19.15, 54.2], [19.15, 54.55], [18.35, 54.55]] }],
  });
  add({
    key: "deu-danzig",
    name: "Danzig",
    mapTag: "DEU",
    ownerTag: "DEU",
    grouping: "German Empire",
    affiliation: "Prussian Province of West Prussia (Danzig)",
    confidence: "low",
    notes:
      "The Danzig city district, which became the Free City of Danzig in 1920. The exact city boundary is approximated by a small clip.",
    codes: ["PL-PM"],
    clip: [{ polygon: [[18.35, 54.2], [19.15, 54.2], [19.15, 54.55], [18.35, 54.55]] }],
  });
  add({
    key: "deu-posen",
    name: "Posen",
    mapTag: "DEU",
    ownerTag: "DEU",
    grouping: "German Empire",
    affiliation: "Prussian Province of Posen",
    confidence: "medium",
    notes:
      "The Province of Posen, including the southern part of modern Kuyavian-Pomeranian, transferred to Poland in 1919-20.",
    codes: ["PL-WP", "PL-KP"],
    clip: [{ polygon: [[15.5, 51.0], [18.6, 51.0], [18.6, 52.9], [15.5, 52.9]] }],
  });
  add({
    key: "deu-lower-silesia",
    name: "Lower Silesia",
    mapTag: "DEU",
    ownerTag: "DEU",
    grouping: "German Empire",
    affiliation: "Prussian Province of Silesia (Lower Silesia)",
    confidence: "medium",
    notes:
      "Lower Silesia around Breslau, retained by Germany after 1919 and transferred to Poland in 1945.",
    codes: ["PL-DS"],
  });
  add({
    key: "deu-middle-silesia",
    name: "Middle Silesia",
    mapTag: "DEU",
    ownerTag: "DEU",
    grouping: "German Empire",
    affiliation: "Prussian Province of Upper Silesia (Oppeln)",
    confidence: "medium",
    notes:
      "The Oppeln administrative district, the part of Upper Silesia that remained German after the 1921 plebiscite.",
    codes: ["PL-OP"],
  });
  add({
    key: "deu-upper-silesia",
    name: "Upper Silesia",
    mapTag: "DEU",
    ownerTag: "DEU",
    grouping: "German Empire",
    affiliation: "Prussian Province of Upper Silesia (Katowice)",
    confidence: "medium",
    notes:
      "The industrial Upper Silesian district around Katowice, awarded to Poland in 1922 after the plebiscite.",
    codes: ["PL-SL"],
  });
  // Hultschin (Hlučín) is represented on the Austrian side because the M11c
  // 1900 base places the whole of modern Czech Silesia in Austria-Hungary; the
  // 1920 transfer to Czechoslovakia is still reproduced from that province.
  add({
    key: "aut-cieszyn-silesia",
    name: "Cieszyn Silesia",
    mapTag: "AUT",
    ownerTag: "AUT",
    grouping: "Austrian half",
    affiliation: "Austrian Crown Land (Silesia)",
    confidence: "low",
    notes:
      "Cieszyn (Teschen) Silesia and Bielsko, Austrian until 1918 and divided between Poland and Czechoslovakia in 1920. The M11c 1900 reconstruction places it in Austria-Hungary.",
    codes: ["PL-SL"],
  });
  add({
    key: "deu-east-prussia-north",
    name: "Königsberg",
    mapTag: "DEU",
    ownerTag: "DEU",
    grouping: "German Empire",
    affiliation: "Prussian Province of East Prussia",
    confidence: "medium",
    notes:
      "Northern East Prussia around Königsberg, assigned to the Soviet Union in 1945 (modern Kaliningrad Oblast).",
    codes: ["RU-KGD"],
  });
  add({
    key: "deu-east-prussia-south",
    name: "Allenstein",
    mapTag: "DEU",
    ownerTag: "DEU",
    grouping: "German Empire",
    affiliation: "Prussian Province of East Prussia",
    confidence: "medium",
    notes:
      "Southern East Prussia around Allenstein, transferred to Poland in 1945 (modern Warmian-Masurian Voivodeship).",
    codes: ["PL-WN"],
  });
  add({
    key: "deu-memel",
    name: "Memel",
    mapTag: "DEU",
    ownerTag: "DEU",
    grouping: "German Empire",
    affiliation: "Prussian Province of East Prussia (Memel)",
    confidence: "medium",
    notes:
      "The Memel (Klaipėda) district of East Prussia, placed under Allied administration in 1920 and annexed by Lithuania in 1923.",
    codes: ["LT-KL"],
  });
  add({
    key: "deu-north-schleswig",
    name: "North Schleswig",
    mapTag: "DEU",
    ownerTag: "DEU",
    grouping: "German Empire",
    affiliation: "Prussian Province of Schleswig-Holstein",
    confidence: "medium",
    notes:
      "The northern part of Schleswig, German until the 1920 plebiscite and transferred to Denmark. The southern boundary follows the approximate Tønder-Flensburg plebiscite line; the northern limit is the 1864 frontier in the M11c base.",
    codes: ["DK-83"],
    clip: [{ polygon: northSchleswigBoundary }],
  });
  add({
    key: "deu-eupen-malmedy",
    name: "Eupen-Malmedy",
    mapTag: "DEU",
    ownerTag: "DEU",
    grouping: "German Empire",
    affiliation: "Prussian Rhine Province (Eupen, Malmedy, Sankt Vith)",
    confidence: "low",
    notes:
      "The Eupen-Malmedy districts, transferred to Belgium in 1920. The rectangle includes Neutral Moresnet, a known small over-inclusion inherited from the M11c reconstruction.",
    codes: ["BE-WLG"],
    clip: [{ polygon: [[5.95, 50.25], [6.35, 50.25], [6.35, 50.75], [5.95, 50.75]] }],
  });
  add({
    key: "deu-alsace",
    name: "Alsace",
    mapTag: "DEU",
    ownerTag: "DEU",
    grouping: "German Empire",
    affiliation: "Reichsland Alsace-Lorraine (Bas-Rhin and Haut-Rhin)",
    confidence: "high",
    notes: "The Alsatian districts of the Reichsland, transferred to France in 1918-19.",
    codes: ["FR-67", "FR-68"],
  });
  add({
    key: "deu-lorraine",
    name: "Lorraine",
    mapTag: "DEU",
    ownerTag: "DEU",
    grouping: "German Empire",
    affiliation: "Reichsland Alsace-Lorraine (Moselle)",
    confidence: "high",
    notes: "The Moselle district of the Reichsland, transferred to France in 1918-19.",
    codes: ["FR-57"],
  });
  add({
    key: "deu-hanover",
    name: "Hanover",
    mapTag: "DEU",
    ownerTag: "DEU",
    grouping: "German Empire",
    affiliation: "Prussian Province of Hanover",
    confidence: "medium",
    notes:
      "The Prussian Province of Hanover. Smaller constituent states inside the modern Lower Saxony unit (Oldenburg, Brunswick, Anhalt-Lippe) are merged into this province for map legibility.",
    codes: ["DE-NI"],
  });
  add({
    key: "deu-westphalia",
    name: "Westphalia",
    mapTag: "DEU",
    ownerTag: "DEU",
    grouping: "German Empire",
    affiliation: "Prussian Province of Westphalia",
    confidence: "low",
    notes:
      "Westphalia is separated from the Rhine Province by an approximate north-south clip at 7.5°E through the modern North Rhine-Westphalia unit.",
    codes: ["DE-NW"],
    clip: [{ polygon: [[7.5, 50.3], [9.5, 50.3], [9.5, 52.6], [7.5, 52.6]] }],
  });
  add({
    key: "deu-rhine-province",
    name: "Rhine Province",
    mapTag: "DEU",
    ownerTag: "DEU",
    grouping: "German Empire",
    affiliation: "Prussian Rhine Province",
    confidence: "low",
    notes:
      "The Prussian Rhine Province west of 7.5°E plus the northern Rhenish part of modern Rhineland-Palatinate. The boundary with Westphalia and the Palatinate is approximate.",
    codes: ["DE-NW", "DE-RP"],
    clip: [
      {
        polygon: [
          [5.5, 49.5],
          [7.5, 49.5],
          [7.5, 49.9],
          [8.15, 49.9],
          [8.15, 50.9],
          [7.5, 50.9],
          [7.5, 52.6],
          [5.5, 52.6],
        ],
      },
    ],
    exclude: [{ polygon: [[6.0, 50.2], [6.4, 50.2], [6.4, 50.8], [6.0, 50.8]] }],
  });
  add({
    key: "deu-palatinate",
    name: "Palatinate",
    mapTag: "DEU",
    ownerTag: "DEU",
    grouping: "German Empire",
    affiliation: "Kingdom of Bavaria (Palatinate)",
    confidence: "low",
    notes: "The Bavarian Palatinate (Pfalz) south of 49.9°N, a separate Bavarian district.",
    codes: ["DE-RP"],
    clip: [{ polygon: [[7.0, 48.9], [8.6, 48.9], [8.6, 49.9], [7.0, 49.9]] }],
  });

  // ---------------------------------------------------------------------------
  // Russian Empire: Finland, the Baltic provinces, Congress Poland and the west
  // ---------------------------------------------------------------------------
  const finnishGroups = {
    Uusimaa: ["FI-18"],
    "Finland Proper": ["FI-19", "FI-17"],
    Häme: ["FI-06", "FI-16", "FI-11", "FI-08"],
    Kymi: ["FI-09", "FI-02"],
    Mikkeli: ["FI-04"],
    Kuopio: ["FI-15", "FI-13"],
    Vaasa: ["FI-12", "FI-03", "FI-07"],
    Oulu: ["FI-14", "FI-05"],
    Lapland: ["FI-10"],
  };
  for (const [name, codes] of Object.entries(finnishGroups)) {
    add({
      key: `rus-fin-${slug(name)}`,
      name,
      mapTag: "FIN",
      ownerTag: "RUS",
      grouping: "Grand Duchy of Finland",
      affiliation: "Finnish lääni",
      confidence: "medium",
      notes:
        "A province of the autonomous Grand Duchy of Finland. Finland is a Russian territory in 1900 and becomes independent in 1917.",
      codes,
    });
  }

  add({
    key: "rus-fin-aland",
    name: "Åland",
    mapTag: "FIN",
    ownerTag: "RUS",
    grouping: "Grand Duchy of Finland",
    affiliation: "Finnish lääni (Åland)",
    confidence: "medium",
    notes:
      "The demilitarized Åland islands, part of the Grand Duchy of Finland. The modern admin-1 source does not separate Åland, so the province is cut from the 1900 Finnish polygon by a small clip.",
    codes: [],
    clip: [{ polygon: [[19.0, 59.6], [21.3, 59.6], [21.3, 60.7], [19.0, 60.7]] }],
  });

  const estonianGroups = {
    Harju: ["EE-37", "EE-70"],
    Järva: ["EE-51"],
    Viru: ["EE-44", "EE-59"],
    Tartu: ["EE-78"],
    Võru: ["EE-86", "EE-65"],
    Viljandi: ["EE-84", "EE-49"],
    Pärnu: ["EE-67"],
    Lääne: ["EE-57"],
    Saare: ["EE-74", "EE-39"],
  };
  for (const [name, codes] of Object.entries(estonianGroups)) {
    add({
      key: `rus-est-${slug(name)}`,
      name,
      mapTag: "RUS",
      ownerTag: "RUS",
      grouping: "Baltic Provinces",
      affiliation: "Estonian governorate (Estlyandskaya)",
      confidence: "medium",
      notes: "Part of the Russian governorate of Estonia; independent Estonia is a future polity.",
      codes,
    });
  }

  const latvianAnchors = [
    { name: "Riga", lon: 24.11, lat: 56.95 },
    { name: "Vidzeme", lon: 25.6, lat: 57.3 },
    { name: "Kurzeme", lon: 21.6, lat: 57.0 },
    { name: "Zemgale", lon: 23.3, lat: 56.5 },
    { name: "Latgale", lon: 26.9, lat: 56.3 },
  ];
  const latvianGroups = new Map(latvianAnchors.map((anchor) => [anchor.name, []]));
  for (const unit of unitsForCountry("LVA")) {
    let best = null;
    let bestDistance = Infinity;
    for (const anchor of latvianAnchors) {
      const distance = Math.hypot(unit.lon - anchor.lon, unit.lat - anchor.lat);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = anchor;
      }
    }
    if (best !== null) latvianGroups.get(best.name).push(unit.code);
  }
  for (const anchor of latvianAnchors) {
    add({
      key: `rus-lva-${slug(anchor.name)}`,
      name: anchor.name,
      mapTag: "RUS",
      ownerTag: "RUS",
      grouping: "Baltic Provinces",
      affiliation: "Baltic governorate (Courland, Livonia or Vitebsk)",
      confidence: "low",
      notes:
        "A grouping of Latvian municipalities around a historical centre. Courland and southern Livonia were in the Baltic Provinces; Latgale belonged to Vitebsk governorate.",
      codes: latvianGroups.get(anchor.name),
    });
  }

  const lithuanianNames = {
    "LT-VL": "Vilnius",
    "LT-KU": "Kaunas",
    "LT-SA": "Šiauliai",
    "LT-PN": "Panevėžys",
    "LT-AL": "Alytus",
    "LT-MR": "Marijampolė",
    "LT-TA": "Tauragė",
    "LT-TE": "Telšiai",
    "LT-UT": "Utena",
  };
  for (const [code, name] of Object.entries(lithuanianNames)) {
    add({
      key: `rus-ltu-${slug(name)}`,
      name,
      mapTag: "RUS",
      ownerTag: "RUS",
      grouping: "Western Provinces",
      affiliation: "Lithuanian governorate (Kovno, Vilna or Suwalki)",
      confidence: "medium",
      notes: "A Lithuanian district of the Russian Empire; Lithuania is a future polity.",
      codes: [code],
    });
  }

  const congressPoland = {
    Warsaw: ["PL-MZ"],
    "Łódź": ["PL-LD"],
    Lublin: ["PL-LU"],
    Siedlce: ["PL-PD"],
    Kielce: ["PL-SK"],
    Kalisz: ["PL-KP", "PL-WP"],
  };
  for (const [name, codes] of Object.entries(congressPoland)) {
    add({
      key: `rus-pol-${slug(name)}`,
      name,
      mapTag: "RUS",
      ownerTag: "RUS",
      grouping: "Congress Poland",
      affiliation: "Polish governorate (Vistula Land)",
      confidence: "medium",
      notes:
        "Part of Congress Poland (Vistula Land) in the Russian Empire. Only the part inside the M11c Russian polygon is Russian; western Kuyavia is Prussian.",
      codes,
    });
  }

  const belarusNames = {
    Brest: ["BY-BR"],
    Grodno: ["BY-HR"],
    Minsk: ["BY-MI", "BY-HM"],
    Mogilev: ["BY-MA"],
    Gomel: ["BY-HO"],
    Vitebsk: ["BY-VI"],
  };
  for (const [name, codes] of Object.entries(belarusNames)) {
    add({
      key: `rus-blr-${slug(name)}`,
      name,
      mapTag: "RUS",
      ownerTag: "RUS",
      grouping: "Western Provinces",
      affiliation: "Belarusian governorate",
      confidence: "medium",
      notes: "A Belarusian governorate of the Russian Empire; Belarus is a future polity.",
      codes,
    });
  }

  const ukrainianGroups = {
    Kiev: ["UA-30", "UA-32", "UA-18"],
    Volhynia: ["UA-07", "UA-56"],
    Podolia: ["UA-05", "UA-68"],
    Kherson: ["UA-48", "UA-65"],
    Yekaterinoslav: ["UA-12", "UA-35", "UA-23"],
    Taurida: ["UA-43", "UA-40"],
    Kharkov: ["UA-63", "UA-59"],
    Poltava: ["UA-53", "UA-71"],
    Chernigov: ["UA-74"],
    Donetsk: ["UA-14", "UA-09"],
    Odessa: ["UA-51"],
  };
  for (const [name, codes] of Object.entries(ukrainianGroups)) {
    add({
      key: `rus-ukr-${slug(name)}`,
      name,
      mapTag: "RUS",
      ownerTag: "RUS",
      grouping: "Ukrainian Provinces",
      affiliation: "Ukrainian governorate",
      confidence: "medium",
      notes: "A Ukrainian governorate of the Russian Empire; Ukraine is a future polity.",
      codes,
    });
  }

  const moldovanGroups = {
    Kishinev: [],
    Bender: [],
    Izmail: [],
  };
  for (const unit of unitsForCountry("MDA")) {
    if (unit.lat < 46.15 && unit.lon > 28.0) moldovanGroups.Izmail.push(unit.code);
    else if (unit.lon > 29.2) moldovanGroups.Bender.push(unit.code);
    else moldovanGroups.Kishinev.push(unit.code);
  }
  for (const [name, codes] of Object.entries(moldovanGroups)) {
    add({
      key: `rus-mda-${slug(name)}`,
      name,
      mapTag: "RUS",
      ownerTag: "RUS",
      grouping: "Bessarabia",
      affiliation: "Bessarabian district",
      confidence: "low",
      notes:
        "A Bessarabian district of the Russian Empire. The southern Budjak and the eastern bank are approximated by modern raion boundaries.",
      codes,
    });
  }

  // European Russia: one province per governorate-scale grouping.
  const russianGroups = {
    Moscow: ["RU-MOW", "RU-MOS"],
    "Saint Petersburg": ["RU-SPE", "RU-LEN"],
    Novgorod: ["RU-NGR"],
    Pskov: ["RU-PSK"],
    Smolensk: ["RU-SMO"],
    Tver: ["RU-TVE"],
    Yaroslavl: ["RU-YAR"],
    Kostroma: ["RU-KOS"],
    Vladimir: ["RU-VLA"],
    Ivanovo: ["RU-IVA"],
    "Nizhny Novgorod": ["RU-NIZ"],
    Ryazan: ["RU-RYA"],
    Tula: ["RU-TUL"],
    Kaluga: ["RU-KLU"],
    Bryansk: ["RU-BRY"],
    Orel: ["RU-ORL"],
    Kursk: ["RU-KRS"],
    Belgorod: ["RU-BEL"],
    Voronezh: ["RU-VOR"],
    Tsaritsyn: ["RU-VGG"],
    Kurgan: ["RU-KGN"],
    Lipetsk: ["RU-LIP"],
    Tambov: ["RU-TAM"],
    Penza: ["RU-PNZ"],
    Saratov: ["RU-SAR"],
    Samara: ["RU-SAM"],
    Simbirsk: ["RU-ULY"],
    Kazan: ["RU-TA"],
    Chuvash: ["RU-CU"],
    "Mari El": ["RU-ME"],
    Mordovia: ["RU-MO"],
    Udmurt: ["RU-UD"],
    Vyatka: ["RU-KIR"],
    Perm: ["RU-PER"],
    Vologda: ["RU-VLG"],
    Arkhangelsk: ["RU-ARK", "RU-NEN"],
    Olonets: ["RU-KR"],
    "Ust-Sysolsk": ["RU-KO"],
    Orenburg: ["RU-ORE"],
    Ufa: ["RU-BA"],
    Yekaterinburg: ["RU-SVE"],
    Chelyabinsk: ["RU-CHE"],
    Don: ["RU-ROS"],
    Kuban: ["RU-KDA", "RU-AD"],
    Stavropol: ["RU-STA", "RU-KC"],
    Terek: ["RU-SE", "RU-KB", "RU-IN", "RU-CE"],
    Dagestan: ["RU-DA"],
    Astrakhan: ["RU-AST"],
    Kalmykia: ["RU-KL"],
    Alexandrovsk: ["RU-MUR"],
  };
  for (const [name, codes] of Object.entries(russianGroups)) {
    add({
      key: `rus-${slug(name)}`,
      name,
      mapTag: "RUS",
      ownerTag: "RUS",
      grouping: "European Russia",
      affiliation: "Russian governorate or oblast",
      confidence: name === "Alexandrovsk" ? "low" : "medium",
      notes:
        name === "Alexandrovsk"
          ? "Murmansk (Alexandrovsk before 1917) was a small Arctic port district of Arkhangelsk governorate; the modern unit is a proxy."
          : "A European Russian governorate-scale province of the Russian Empire. Modern oblast boundaries are a proxy for the 1900 governorate.",
      codes,
    });
  }

  // ---------------------------------------------------------------------------
  // Small European polities and dependent territories without admin-1 units
  // ---------------------------------------------------------------------------
  const polygonOnly = [
    ["MCO", "MCO", "Monaco", "Principality of Monaco", "high"],
    ["SMR", "SMR", "San Marino", "Most Serene Republic of San Marino", "high"],
    ["AND", "AND", "Andorra", "Co-Principality of Andorra", "high"],
    ["LIE", "LIE", "Liechtenstein", "Principality of Liechtenstein", "high"],
    ["CRT", "CRT", "Crete", "Cretan State", "medium"],
    ["CYP", "GBR", "Cyprus", "British Cyprus", "medium"],
    ["MLT", "GBR", "Malta", "British Malta", "high"],
    ["ISL", "DNK", "Iceland", "Danish Iceland", "high"],
    ["FRO", "DNK", "Faroe Islands", "Danish Faroe Islands", "high"],
  ];
  for (const [mapTag, ownerTag, name, affiliation, confidence] of polygonOnly) {
    add({
      key: `${slug(mapTag)}-${slug(name)}`,
      name,
      mapTag,
      ownerTag,
      grouping: null,
      affiliation,
      confidence,
      notes:
        "The whole 1900 territory is one province; no separate historical first-level unit is distinguishable at this map scale.",
      codes: [],
    });
  }
  // Greenland is a Danish dependency geographically in North America. It is
  // included because the 1900 catalog lists it as a European dependency, and the
  // province remains one unit so it never becomes an oversized Arctic province.
  add({
    key: "grl-greenland",
    name: "Greenland",
    displayName: "Greenland",
    mapTag: "GRL",
    ownerTag: "DNK",
    grouping: null,
    affiliation: "Danish Arctic dependency",
    confidence: "low",
    notes:
      "A single province for the whole Arctic dependency. It lies outside the European provincial geometry scope but is retained as the catalog's Danish dependency.",
    codes: [],
  });

  if (missingCodes.size > 0) {
    throw new Error(`province plan references unknown admin-1 codes: ${[...missingCodes].sort().join(", ")}`);
  }
  if (duplicateKeys.size > 0) {
    throw new Error(`province plan has duplicate keys: ${[...duplicateKeys].join(", ")}`);
  }
  if (provinces.length > 4096) {
    throw new Error(`province plan exceeds the 4096-province limit (${provinces.length})`);
  }

  // Assign stable ids deterministically: owner catalog id * 1000 + order.
  const counters = new Map();
  const seenIds = new Set();
  for (const province of provinces) {
    const base = province.ownerPolityId * 1000;
    const next = (counters.get(base) ?? 0) + 1;
    counters.set(base, next);
    const id = base + next;
    if (seenIds.has(id)) throw new Error(`duplicate province id ${id}`);
    seenIds.add(id);
    province.provinceId = id;
  }

  return {
    sources: SOURCES,
    futurePolities: FUTURE_POLITIES,
    provinces,
    usedCodes: [...usedCodes].sort(),
  };
}

/** Day index helper used by the data loader and snapshot fixtures. */
export function isoDayIndex(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  let index = 0;
  const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  for (let y = 1900; y < year; y += 1) index += isLeap(y) ? 366 : 365;
  for (let m = 1; m < month; m += 1) index += m === 2 && isLeap(year) ? 29 : days[m - 1];
  return index + day - 1;
}

export { TAG_BY_POLITY, OWNER_ID, REGION_ID };


/**
 * Authored M11c 1900 boundary reconstruction and provenance source.
 *
 * This module is the human-maintained input for
 * `packages/data/data/historical/m11/boundaries_1900.json`. It never ships to
 * the app directly; `scripts/m11/build-boundaries.mjs` validates and expands it.
 *
 * The modern Natural Earth units are used only as geometric building blocks.
 * Every transfer is an explicit, dated historical claim with a source list and
 * confidence. See docs/HISTORICAL_MAP_PROVENANCE.md.
 */

export const REFERENCE_DATE = "1900-01-01";

export const SOURCES = [
  {
    id: "natural-earth-50m",
    title: "Natural Earth 1:50m cultural vectors (admin-0 and selected admin-1)",
    url: "https://www.naturalearthdata.com/downloads/50m-cultural-vectors/",
    license: "Public domain",
    date: "2024",
    notes:
      "Modern base geometry only. Used to build coastlines and modern country units, never accepted as a 1900 border without the explicit transfers below.",
  },
  {
    id: "natural-earth-10m-admin1",
    title: "Natural Earth 1:10m admin-1 states and provinces",
    url: "https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-1-states-provinces/",
    license: "Public domain",
    date: "2024",
    notes:
      "Modern first-level units used only as reconstruction blocks for historical provinces (French departments, Polish voivodeships, Romanian counties, Indian states, etc.).",
  },
  {
    id: "natural-earth-10m-admin0",
    title: "Natural Earth 1:10m admin-0 countries",
    url: "https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-0-countries/",
    license: "Public domain",
    date: "2024",
    notes:
      "Modern country units used for small-island additions and for clipping the reconstructed Ottoman Libyan provinces.",
  },
  {
    id: "eb1911-germany",
    title: "Encyclopaedia Britannica (1911), 'Germany' and 'Prussia'",
    url: "https://en.wikisource.org/wiki/1911_Encyclop%C3%A6dia_Britannica/Germany",
    license: "Public domain",
    date: "1911",
    notes:
      "Contemporary description of the German Empire's constituent states and its eastern provinces, including Posen, West Prussia, East Prussia and Silesia.",
  },
  {
    id: "eb1911-tripoli",
    title: "Encyclopaedia Britannica (1911), 'Tripoli' and 'Cyrenaica'",
    url: "https://en.wikisource.org/wiki/1911_Encyclop%C3%A6dia_Britannica/Tripoli",
    license: "Public domain",
    date: "1911",
    notes:
      "Contemporary description of Ottoman Tripolitania, the vilayet of Tripoli, the sanjak of Benghazi and the Fezzan; used for the Libyan provincial components and the note on limited effective control in the interior.",
  },
  {
    id: "eb1911-darfur",
    title: "Encyclopaedia Britannica (1911), 'Darfur'",
    url: "https://en.wikisource.org/wiki/1911_Encyclop%C3%A6dia_Britannica/Darfur",
    license: "Public domain",
    date: "1911",
    notes:
      "Describes the restored Darfur Sultanate after 1898 and its approximate western Sudanese extent; used for the reconstructed Darfur polygon.",
  },
  {
    id: "eb1911-wadai",
    title: "Encyclopaedia Britannica (1911), 'Wadai'",
    url: "https://en.wikisource.org/wiki/1911_Encyclop%C3%A6dia_Britannica/Wadai",
    license: "Public domain",
    date: "1911",
    notes:
      "Describes Wadai (Ouaddai) in eastern Chad and its dependencies; used for the reconstructed Wadai polygon.",
  },
  {
    id: "hammond-1912",
    title: "Hammond's Modern Atlas of the World (1912)",
    url: "https://archive.org/details/hammondsmodernat00hamm",
    license: "Public domain",
    date: "1912",
    notes:
      "Political atlas contemporary with the reference date; cross-check for European, African and Asian external borders.",
  },
  {
    id: "times-atlas-1920",
    title: "The Times Survey Atlas of the World (1920), historical political sheets",
    url: "https://archive.org/details/timessurveyatla00lond",
    license: "Public domain",
    date: "1920",
    notes:
      "Cross-check for post-1900 changes; used only where the 1900 border is explicitly marked in the historical sheets.",
  },
  {
    id: "karte-deutsches-reich-1900",
    title: "Karte Deutsches Reich, Verwaltungsgliederung 1900-01-01 (Wikimedia Commons)",
    url: "https://commons.wikimedia.org/wiki/File:Karte_Deutsches_Reich,_Verwaltungsgliederung_1900-01-01.png",
    license: "Public domain",
    date: "1900",
    notes:
      "Administrative map of the German Empire on the reference date; used to check Alsace-Lorraine, the Prussian eastern provinces, Schleswig-Holstein and the constituent states.",
  },
  {
    id: "reichsgesetzblatt-1871",
    title: "Reichsgesetzblatt 1871, Treaty of Frankfurt boundary annexations",
    url: "https://de.wikisource.org/wiki/Friede_von_Frankfurt",
    license: "Public domain",
    date: "1871",
    notes: "Primary instrument transferring Alsace and the Moselle departments to the German Empire.",
  },
  {
    id: "treaty-versailles-1919",
    title: "Treaty of Versailles (1919), territorial clauses",
    url: "https://en.wikisource.org/wiki/Treaty_of_Versailles",
    license: "Public domain",
    date: "1919",
    notes:
      "Used inversely to identify what the German Empire held in 1900: Alsace-Lorraine, Posen, West Prussia, parts of Silesia, Memel, northern Schleswig and Eupen-Malmedy.",
  },
  {
    id: "treaty-saint-germain-1919",
    title: "Treaty of Saint-Germain (1919), Austro-Hungarian territorial clauses",
    url: "https://en.wikisource.org/wiki/Treaty_of_Saint-Germain-en-Laye",
    license: "Public domain",
    date: "1919",
    notes:
      "Used inversely for Galicia, Bukovina, Transylvania, Vojvodina, South Tyrol, Trieste and the Dalmatian coast.",
  },
  {
    id: "treaty-trianon-1920",
    title: "Treaty of Trianon (1920), Hungarian territorial clauses",
    url: "https://en.wikisource.org/wiki/Treaty_of_Trianon",
    license: "Public domain",
    date: "1920",
    notes: "Used inversely for the Hungarian half of Austria-Hungary, including Transylvania, Slovakia, Vojvodina and Kotor.",
  },
  {
    id: "treaty-lausanne-1923",
    title: "Treaty of Lausanne (1923), Ottoman successor boundaries",
    url: "https://en.wikisource.org/wiki/Treaty_of_Lausanne",
    license: "Public domain",
    date: "1923",
    notes:
      "Used inversely for Ottoman Europe and Anatolia: Kars/Ardahan/Artvin to Russia in 1878, Crete autonomous, and the Balkan/Macedonian provinces still Ottoman in 1900.",
  },
  {
    id: "anglo-egyptian-sudan-1899",
    title: "Anglo-Egyptian Condominium Agreement (1899)",
    url: "https://en.wikisource.org/wiki/Anglo-Egyptian_Condominium_Agreement",
    license: "Public domain",
    date: "1899",
    notes: "Defines the Sudan condominium that in 1900 still excluded Darfur.",
  },
  {
    id: "icj-libya-chad-1994",
    title: "ICJ, Territorial Dispute (Libyan Arab Jamahiriya/Chad), Judgment of 3 February 1994",
    url: "https://www.icj-cij.org/case/83",
    license: "ICJ public documents; quotation and citation only",
    date: "1994",
    notes:
      "The Court treated the Anglo-French Declaration of 21 March 1899 as defining a line limiting the French zone or sphere of influence, and the 1919 Convention and 1902 Franco-Italian agreement as later boundary instruments. The 1955 Franco-Libyan Treaty is a post-1900 instrument. The judgment is used here to distinguish a claimed sphere of influence from effective administration on 1 January 1900; no boundary from the later treaty is projected back onto the 1900 map.",
  },
  {
    id: "icj-libya-chad-pleadings",
    title: "ICJ, Territorial Dispute (Libya/Chad), written pleadings and oral records, 1991-1993",
    url: "https://www.icj-cij.org/case/83/written-proceedings",
    license: "ICJ public documents; citation only",
    date: "1991-1993",
    notes:
      "Libya and Chad disputed the extent and effectiveness of Ottoman, Senussi, Toubou and French authority in Tibesti, Borkou, Ennedi and the Aouzou strip. The pleadings are used as evidence of contested authority, not as a survey of 1900 administration.",
  },
  {
    id: "labrador-boundary-dispute",
    title: "Labrador boundary dispute and the 1927 Privy Council reference",
    url: "https://www.thecanadianencyclopedia.ca/en/article/labrador-boundary-dispute",
    license: "Reference only (not redistributed)",
    date: "1927",
    notes:
      "The interior boundary between Quebec and Labrador was disputed around 1900 and was referred to the Judicial Committee of the Privy Council in 1927. The M11c map uses the modern province outline only as a geometric proxy and does not treat the 1927 line as an uncontested 1900 border.",
  },
  {
    id: "treaty-petropolis-1903",
    title: "Treaty of Petrópolis between Bolivia and Brazil (1903)",
    url: "https://en.wikisource.org/wiki/Treaty_of_Petr%C3%B3polis",
    license: "Public domain",
    date: "1903",
    notes:
      "Bolivia ceded Acre to Brazil after the 1902-03 conflict. The treaty and the subsequent demarcation are post-1900 and are not applied to the 1900 map; Acre is Bolivian in the M11c geometry.",
  },
  {
    id: "british-aden-1839",
    title: "British Aden and the Aden Protectorate, 1839-1900",
    url: "https://en.wikisource.org/wiki/1911_Encyclop%C3%A6dia_Britannica/Aden",
    license: "Public domain",
    date: "1911",
    notes:
      "Aden and its hinterland were British Indian territory in 1900; the Ottoman-Yemeni frontier was not delimited until 1904-1914, so the southern limit is approximate.",
  },
  {
    id: "historical-basemaps-1900",
    title: "historical-basemaps world_1900 (cross-check only)",
    url: "https://github.com/aourednik/historical-basemaps",
    license: "GPL-3.0 (not redistributed)",
    date: "2018",
    notes:
      "Used only as a visual and topological cross-check for the German eastern border and the broad extent of the Ottoman Sahara. No coordinate ring from this dataset is redistributed; all final geometry is rebuilt from public-domain modern units and the explicit transfer polygons above.",
  },
  {
    id: "cshapes-2.0",
    title: "CShapes 2.0 (classification reference only)",
    url: "https://icr.ethz.ch/data/cshapes/",
    license: "CC BY-NC-SA 4.0 (not redistributed)",
    date: "2019",
    notes: "Consulted for status coding only; not used for geometry.",
  },
  {
    id: "project-authored-1900",
    title: "Century M11c authored boundary reconstruction",
    url: "internal:packages/data/data/historical/m11/boundaries_1900.json",
    license: "Project data",
    date: "2026",
    notes:
      "Explicit transfer polygons, clipping lines and per-polity provenance. Every reconstructed frontier is labelled HIGH, MEDIUM or LOW; approximate lines are not presented as exact.",
  },
];

/**
 * A rectangular or authored polygon helper. Rings are [lon, lat] and may be
 * open; the build closes them.
 */
function box(west, south, east, north) {
  return [
    [west, south],
    [east, south],
    [east, north],
    [west, north],
  ];
}

/**
 * The German Empire's eastern border, simplified from the 1900 administrative
 * map. The polygon is the German side; it is used to clip modern Polish
 * voivodeships so that Congress Poland and Austrian Galicia are excluded.
 *
 * Points: Baltic near Memel; Neman/SuwaÃ…â€ški frontier; East Prussian southern
 * frontier near Soldau/Neidenburg; Vistula near Thorn; Posen frontier west of
 * Kalisz and Konin; Silesian frontier; Austrian Silesian frontier.
 */
export const GERMANY_EAST_CLIP = [
  [5.0, 49.5],
  [18.55, 49.96],
  [18.77, 50.18],
  [18.65, 50.65],
  [18.14, 50.99],
  [17.95, 51.85],
  [18.2, 52.2],
  [18.6, 52.5],
  [18.76, 52.93],
  [19.42, 53.11],
  [20.1, 53.18],
  [20.48, 53.13],
  [21.1, 53.27],
  [22.7, 53.8],
  [22.7, 54.4],
  [22.8, 54.9],
  [22.8, 56.0],
  [5.0, 56.0],
];

/** North Schleswig: modern Danish Jutland south of the KongeÃƒÂ¥, north of the 1920 border. */
export const NORTH_SCHLESWIG = box(8.3, 54.8, 9.9, 55.45);

/** Eupen-Malmedy: the 1920 Belgian annexations from the German Empire. */
export const EUPEN_MALMEDY = box(5.95, 50.25, 6.35, 50.75);

/** The Dodecanese, Ottoman in 1900 (Italy occupied them only in 1912). */
export const DODECANESE = box(26.3, 35.3, 28.4, 37.2);

/** SandÃ…Â¾ak of Novi Pazar, still Ottoman in 1900. */
export const SANDZAK = box(19.4, 42.7, 20.6, 43.5);

/** Cieszyn (Teschen) Silesia and Bielsko, Austrian before 1918. */
export const CIESZYN_SILESIA = box(18.4, 49.5, 19.2, 50.0);

/** Aouzou strip: claimed by France and later ceded by the 1935 Franco-Italian agreement. */
export const AOUZOU_STRIP = box(15.0, 19.5, 16.0, 23.0);

/**
 * Aouzou-Tibesti frontier zone. In 1900 the 1899 Anglo-French Declaration
 * delimited a French sphere of influence, not an administered territory; Ottoman
 * claims and Toubou local authority overlapped, and no boundary had been
 * surveyed. This rectangle is an explicit "disputed / no established
 * administration" cartographic zone, not a claim that either empire governed it.
 */
export const AOUZOU_TIBESTI_DISPUTED = box(15.0, 19.5, 19.0, 23.0);

/** Kionga triangle: German East Africa, transferred to Mozambique only in 1919. */
export const KIONGA_TRIANGLE = box(40.4, -10.9, 40.7, -10.4);

/** Walvis Bay: British Cape Colony enclave, not part of German South West Africa. */
export const WALVIS_BAY = box(14.3, -23.1, 14.7, -22.8);

/** British Somaliland: the protectorate's approximate 1900 extent. */
export const BRITISH_SOMALILAND = box(42.5, 7.9, 49.0, 12.0);

/** Gwadar: Omani possession on the Makran coast until 1958. */
export const GWADAR = box(61.4, 24.9, 62.8, 25.5);

export const PATCHES = [
  // ---------------------------------------------------------------------------
  // Germany and the German Empire's external frontier
  // ---------------------------------------------------------------------------
  {
    id: "germany-alsace-lorraine",
    description: "Alsace-Lorraine (Bas-Rhin, Haut-Rhin, Moselle) transferred from France to the German Empire in 1871.",
    to: "DEU",
    from: ["FRA"],
    include: [{ adm1: "FR-67" }, { adm1: "FR-68" }, { adm1: "FR-57" }],
    confidence: "high",
    sourceIds: ["reichsgesetzblatt-1871", "treaty-versailles-1919", "karte-deutsches-reich-1900"],
    notes:
      "The three modern French departments are the exact 1871-1918 Alsace-Lorraine departments. Belfort (Territoire de Belfort) remained French and is deliberately excluded.",
  },
  {
    id: "germany-north-schleswig",
    description: "North Schleswig, German until the 1920 plebiscite, transferred from Denmark.",
    to: "DEU",
    from: ["DNK"],
    include: [{ polygon: NORTH_SCHLESWIG }],
    clip: [{ adm0: "DNK" }],
    confidence: "medium",
    sourceIds: ["treaty-versailles-1919", "karte-deutsches-reich-1900"],
    notes:
      "The northern limit follows the KongeÃƒÂ¥ (1864 frontier); the southern limit is the modern Danish-German border. The exact 1864-1920 line is generalized.",
  },
  {
    id: "germany-eupen-malmedy",
    description: "Eupen-Malmedy, German districts transferred to Belgium in 1920.",
    to: "DEU",
    from: ["BEL"],
    include: [{ polygon: EUPEN_MALMEDY }],
    clip: [{ adm0: "BEL" }],
    confidence: "medium",
    sourceIds: ["treaty-versailles-1919", "karte-deutsches-reich-1900"],
    notes:
      "The polygon approximates the districts of Eupen, Malmedy and Sankt Vith. Neutral Moresnet, condominium territory in 1900, is included by the rectangle and is a known small over-inclusion.",
  },
  {
    id: "germany-east-prussia-kaliningrad",
    description: "The northern part of East Prussia (modern Kaliningrad Oblast), Russian from 1945.",
    to: "DEU",
    from: ["RUS"],
    include: [{ adm1: "RU-KGD" }],
    confidence: "high",
    sourceIds: ["eb1911-germany", "karte-deutsches-reich-1900"],
    notes: "Kaliningrad Oblast corresponds closely to the northern half of East Prussia; the 1900 eastern frontier is approximated by the modern oblast border.",
  },
  {
    id: "germany-memel",
    description: "Memel (KlaipÃ„â€”da) territory, German in 1900, Lithuanian from 1923.",
    to: "DEU",
    from: ["RUS"],
    include: [{ adm1: "LT-KL" }],
    confidence: "high",
    sourceIds: ["treaty-versailles-1919", "karte-deutsches-reich-1900"],
    notes: "KlaipÃ„â€”da County closely matches the Memel Territory. The northern frontier along the Neman is a modern county boundary approximation.",
  },
  {
    id: "germany-prussian-east",
    description:
      "Posen, West Prussia, East Prussia, Pomerania and Silesia: the German Empire's eastern provinces, clipped to the 1900 German-Russian and German-Austrian frontier.",
    to: "DEU",
    from: ["RUS"],
    include: [
      { adm1: "PL-WN" },
      { adm1: "PL-PM" },
      { adm1: "PL-ZP" },
      { adm1: "PL-LB" },
      { adm1: "PL-DS" },
      { adm1: "PL-OP" },
      { adm1: "PL-KP" },
      { adm1: "PL-WP" },
      { adm1: "PL-SL" },
    ],
    clip: [{ polygon: GERMANY_EAST_CLIP }],
    confidence: "medium",
    sourceIds: ["eb1911-germany", "karte-deutsches-reich-1900", "historical-basemaps-1900"],
    notes:
      "The modern voivodeships are clipped by the authored 1900 frontier. The line excludes Congress Poland (Kalisz, Konin, WÃ…â€šocÃ…â€šawek, CzÃ„â„¢stochowa) and Austrian Galicia, while keeping Thorn, Posen, Breslau and the East Prussian core. The frontier is generalized to about 10-20 km; LOW confidence applies to the immediate border strip.",
  },
  {
    id: "austria-galicia",
    description: "Galicia and Lodomeria, the Austrian partition of Poland, including Lviv, Ternopil, Ivano-Frankivsk, KrakÃƒÂ³w and PrzemyÃ…â€ºl.",
    to: "AUT",
    from: ["RUS"],
    include: [
      { adm1: "PL-MA" },
      { adm1: "PL-PK" },
      { adm1: "UA-46" },
      { adm1: "UA-26" },
      { adm1: "UA-61" },
      { adm1: "UA-77" },
      { adm1: "UA-21" },
    ],
    confidence: "high",
    sourceIds: ["treaty-saint-germain-1919", "hammond-1912"],
    notes:
      "Modern Polish and Ukrainian provinces are close to the Austrian crown land. Eastern Galicia's 1900 eastern limit is approximated by the modern Lviv/Ternopil/Ivano-Frankivsk oblasts.",
  },
  {
    id: "austria-bukovina",
    description: "Southern Bukovina (Suceava), Austrian until 1918.",
    to: "AUT",
    from: ["ROM"],
    include: [{ adm1: "RO-SV" }],
    confidence: "high",
    sourceIds: ["treaty-saint-germain-1919"],
    notes: "Suceava County is the modern Romanian remnant of the Duchy of Bukovina; northern Bukovina is in Chernivtsi Oblast and is included in the Galicia patch.",
  },
  {
    id: "austria-transylvania",
    description: "Transylvania, the Banat, CriÃˆâ„¢ana and MaramureÃˆâ„¢, Hungarian until 1918.",
    to: "AUT",
    from: ["ROM"],
    include: [
      { adm1: "RO-AB" },
      { adm1: "RO-AR" },
      { adm1: "RO-BH" },
      { adm1: "RO-BN" },
      { adm1: "RO-BV" },
      { adm1: "RO-CJ" },
      { adm1: "RO-CS" },
      { adm1: "RO-CV" },
      { adm1: "RO-HD" },
      { adm1: "RO-HR" },
      { adm1: "RO-MM" },
      { adm1: "RO-MS" },
      { adm1: "RO-SB" },
      { adm1: "RO-SJ" },
      { adm1: "RO-SM" },
      { adm1: "RO-TM" },
    ],
    confidence: "high",
    sourceIds: ["treaty-trianon-1920", "hammond-1912"],
    notes:
      "The listed counties are the historical Transylvanian, Banat, CriÃˆâ„¢ana and MaramureÃˆâ„¢ counties. The 1900 Hungarian-Romanian border is approximated by the modern county boundaries.",
  },
  {
    id: "austria-vojvodina",
    description: "Vojvodina (BÃƒÂ¡cska, Banat, Syrmia), Hungarian until 1918.",
    to: "AUT",
    from: ["SRB"],
    include: [
      { adm1: "RS-01" },
      { adm1: "RS-02" },
      { adm1: "RS-03" },
      { adm1: "RS-04" },
      { adm1: "RS-05" },
      { adm1: "RS-06" },
      { adm1: "RS-07" },
    ],
    confidence: "high",
    sourceIds: ["treaty-trianon-1920"],
    notes: "The seven Vojvodina districts match the Hungarian counties closely; the Danube/Tisa frontier is approximated by modern district boundaries.",
  },
  {
    id: "austria-kotor",
    description: "Bay of Kotor (Cattaro), Austrian Dalmatia in 1900.",
    to: "AUT",
    from: ["MNT"],
    include: [{ adm1: "ME-10" }],
    confidence: "high",
    sourceIds: ["treaty-saint-germain-1919", "hammond-1912"],
    notes: "Kotor district is the modern Montenegrin remnant of Austrian Dalmatia; the 1900 border ran immediately east of the bay.",
  },
  {
    id: "austria-south-tyrol",
    description: "Trentino and South Tyrol, Austrian until 1918.",
    to: "AUT",
    from: ["ITA"],
    include: [{ adm1: "IT-BZ" }, { adm1: "IT-TN" }],
    confidence: "high",
    sourceIds: ["treaty-saint-germain-1919"],
    notes: "The modern autonomous provinces of Bolzano/Bozen and Trento match the Austrian crown land of Tyrol south of the Brenner.",
  },
  {
    id: "austria-littoral",
    description: "Trieste and Gorizia (Austrian Littoral), Austrian until 1918.",
    to: "AUT",
    from: ["ITA"],
    include: [{ adm1: "IT-TS" }, { adm1: "IT-GO" }],
    confidence: "high",
    sourceIds: ["treaty-saint-germain-1919"],
    notes: "Trieste and Gorizia provinces correspond to the Austrian Littoral around the Isonzo; the 1900 hinterland border is approximated.",
  },
  {
    id: "austria-cieszyn",
    description: "Cieszyn (Teschen) Silesia and Bielsko, Austrian until 1918.",
    to: "AUT",
    from: ["RUS"],
    include: [{ polygon: CIESZYN_SILESIA }],
    clip: [{ adm0: "POL" }],
    confidence: "medium",
    sourceIds: ["treaty-saint-germain-1919", "hammond-1912"],
    notes:
      "The rectangle is clipped to modern Poland to avoid double-counting Czech Cieszyn, which is already in Austria-Hungary. It covers Bielsko and the Polish part of Cieszyn Silesia.",
  },
  {
    id: "russia-kars",
    description: "Kars, Ardahan and Artvin, annexed by Russia in 1878 and Ottoman before that.",
    to: "RUS",
    from: ["OTT"],
    include: [{ adm1: "TR-36" }, { adm1: "TR-75" }, { adm1: "TR-08" }],
    confidence: "high",
    sourceIds: ["treaty-lausanne-1923", "hammond-1912"],
    notes: "The three modern Turkish provinces approximate the 1878-1918 Russian Kars Oblast; the border with the rest of the Ottoman Empire is the 1878 line.",
  },
  {
    id: "serbia-sandzak",
    description: "The SandÃ…Â¾ak of Novi Pazar, Ottoman until 1912.",
    to: "OTT",
    from: ["SRB"],
    include: [{ polygon: SANDZAK }],
    clip: [{ adm0: "SRB" }],
    confidence: "low",
    sourceIds: ["treaty-lausanne-1923", "hammond-1912"],
    notes:
      "The rectangle approximates the Sanjak's Serbian districts (Novi Pazar, Sjenica, Prijepolje). The 1900 frontier was a military-administrative line, not a modern district border; parts of the rectangle may include Serbian-administered territory.",
  },
  {
    id: "montenegro-sandzak",
    description: "Pljevlja, Bijelo Polje, Berane, Plav and RoÃ…Â¾aje, acquired by Montenegro only in 1912-13.",
    to: "OTT",
    from: ["MNT"],
    include: [{ adm1: "ME-03" }, { adm1: "ME-04" }, { adm1: "ME-13" }, { adm1: "ME-14" }, { adm1: "ME-17" }],
    confidence: "high",
    sourceIds: ["treaty-lausanne-1923", "hammond-1912"],
    notes: "The five municipalities were Ottoman SandÃ…Â¾ak territory in 1900; the 1912-13 Montenegrin acquisitions are removed.",
  },
  {
    id: "greece-ottoman-new-lands",
    description: "Epirus, Macedonia, Thrace and the North Aegean islands, Ottoman in 1900 and Greek only after the Balkan Wars.",
    to: "OTT",
    from: ["GRC"],
    include: [
      { adm1: "GR-D" },
      { adm1: "GR-C" },
      { adm1: "GR-B" },
      { adm1: "GR-A" },
      { adm1: "GR-K" },
    ],
    confidence: "medium",
    sourceIds: ["treaty-lausanne-1923", "hammond-1912"],
    notes:
      "The modern Greek regions are broader than the 1881 Greek-Ottoman frontier. Arta and parts of southern Epirus were already Greek; the whole-region subtraction therefore under-represents Greece by a small strip. LOW confidence applies to the Arta/Ioannina frontier.",
  },
  {
    id: "greece-dodecanese",
    description: "The Dodecanese islands, Ottoman in 1900 and Italian only from 1912.",
    to: "OTT",
    from: ["GRC"],
    include: [{ polygon: DODECANESE }],
    clip: [{ adm0: "GRC" }],
    confidence: "medium",
    sourceIds: ["treaty-lausanne-1923"],
    notes: "The rectangle includes Rhodes, Kos and Karpathos. It is clipped to Greece so the Turkish mainland is unaffected; small islets at the rectangle edge may be missed.",
  },
  {
    id: "crete-autonomous",
    description: "Crete, an autonomous Ottoman vassal state under the 1897-98 settlement.",
    to: "CRT",
    from: ["GRC"],
    include: [{ adm1: "GR-M" }],
    confidence: "high",
    sourceIds: ["treaty-lausanne-1923", "hammond-1912"],
    notes: "The modern Crete region is the island; it is removed from Greece and assigned to the Cretan State.",
  },
  {
    id: "bulgaria-south-dobruja",
    description: "Southern Dobruja (Dobrich and Silistra), Romanian from 1878 to 1913.",
    to: "ROM",
    from: ["BGR"],
    include: [{ adm1: "BG-08" }, { adm1: "BG-19" }],
    confidence: "high",
    sourceIds: ["treaty-trianon-1920", "hammond-1912"],
    notes: "The two modern Bulgarian provinces correspond to the Dobrujan territory Romania held in 1900; Bulgaria acquired it in 1913.",
  },
  {
    id: "libya-ottoman",
    description:
      "Tripolitania, Cyrenaica and Fezzan under Ottoman sovereignty in 1900, minus the Aouzou–Tibesti disputed/no-established-administration zone.",
    to: "OTT",
    from: [],
    include: [{ adm0: "LBY" }],
    subtract: [{ polygon: AOUZOU_STRIP }],
    confidence: "medium",
    sourceIds: ["eb1911-tripoli", "hammond-1912"],
    notes:
      "Modern Libya is used as the outer administrative frame. The Ottoman vilayet of Tripoli, the sanjak of Benghazi and the Fezzan were not delimited to modern precision; effective control in the Fezzan and the southern desert was limited and shared with local authorities. The Aouzou–Tibesti zone is excluded from both OTT and FEA and represented as a map-only disputed/no-established-administration area; the 1935 Franco-Italian cession and the 1955 Franco-Libyan treaty are post-1900 and are not applied retroactively.",
  },
  {
    id: "yemen-aden-british",
    description: "Aden and the southern Yemeni protectorates, British Indian territory in 1900.",
    to: "BIN",
    from: ["OTT"],
    include: [
      { adm1: "YE-AD" },
      { adm1: "YE-LA" },
      { adm1: "YE-AB" },
      { adm1: "YE-SH" },
      { adm1: "YE-HD" },
      { adm1: "YE-MR" },
      { adm1: "YE-DA" },
      { adm1: "YE-BA" },
    ],
    confidence: "low",
    sourceIds: ["british-aden-1839", "hammond-1912"],
    notes:
      "The Ottoman-British frontier in Yemen was not delimited until 1904-1914. The modern southern governorates are used as a defensible proxy for the Aden Protectorate and Hadhramaut; the northern limit is approximate.",
  },

  // ---------------------------------------------------------------------------
  // Asia
  // ---------------------------------------------------------------------------
  {
    id: "siam-cambodian-provinces",
    description: "Battambang, Siem Reap, Sisophon, Preah Vihear and Stung Treng, Siamese in 1900 and ceded to France in 1904-07.",
    to: "THA",
    from: ["FIC"],
    include: [
      { adm1: "KH-1" },
      { adm1: "KH-2" },
      { adm1: "KH-13" },
      { adm1: "KH-17" },
      { adm1: "KH-19" },
      { adm1: "KH-22" },
    ],
    confidence: "medium",
    sourceIds: ["hammond-1912"],
    notes:
      "The modern Cambodian provinces approximate the western Cambodian provinces under Siamese suzerainty in 1900. The 1904 and 1907 treaties moved the frontier; the exact 1900 line is uncertain.",
  },
  {
    id: "siam-laotian-provinces",
    description: "Sainyabuli (Xaignabouli) west of the Mekong, Siamese in 1900.",
    to: "THA",
    from: ["FIC"],
    include: [{ adm1: "LA-XA" }],
    confidence: "low",
    sourceIds: ["hammond-1912"],
    notes:
      "Only Sainyabuli is reconstructed. Other trans-Mekong districts ceded in 1904-07 are not separated because the modern Lao provinces mix both banks; this under-represents Siam by a small amount.",
  },
  {
    id: "siam-malay-states",
    description: "Kedah, Kelantan, Perlis and Terengganu, Siamese vassals in 1900 and transferred to British protection in 1909.",
    to: "THA",
    from: ["MAL"],
    include: [{ adm1: "MY-02" }, { adm1: "MY-03" }, { adm1: "MY-09" }, { adm1: "MY-11" }],
    confidence: "high",
    sourceIds: ["hammond-1912"],
    notes: "The four modern Malaysian states were under Siamese suzerainty in 1900 under the Anglo-Siamese Treaty of 1909.",
  },
  {
    id: "malaya-sarawak",
    description: "The Raj of Sarawak, a separate British-protected polity, not part of British Malaya.",
    to: "SAR",
    from: ["MAL"],
    include: [{ adm1: "MY-13" }],
    confidence: "high",
    sourceIds: ["hammond-1912"],
    notes: "Sarawak was ruled by the Brooke dynasty under British protection and was not one of the Malay States. The modern Malaysian state is used as the polygon.",
  },
  {
    id: "portuguese-india",
    description: "Goa, Daman and Diu, Portuguese India in 1900.",
    to: "PAI",
    from: ["BIN"],
    include: [{ adm1: "IN-GA" }, { adm1: "IN-DH" }],
    confidence: "high",
    sourceIds: ["hammond-1912"],
    notes:
      "Goa and the Daman/Diu union territory are removed from British India and grouped with the Portuguese colonial possessions. The grouping is a map aggregation; Portuguese India was a separate colony.",
  },
  {
    id: "french-india",
    description: "Puducherry, Karaikal, MahÃƒÂ© and Yanam, French India in 1900.",
    to: "FIC",
    from: ["BIN"],
    include: [{ adm1: "IN-PY" }],
    confidence: "medium",
    sourceIds: ["hammond-1912"],
    notes:
      "The modern Puducherry union territory is used as the proxy for the four French enclaves. The enclaves are tiny; grouping them with French Indochina is a map aggregation, not an administrative claim.",
  },
  {
    id: "ceylon-maldives",
    description: "The Maldives, a separate British protectorate, not part of Ceylon.",
    to: "BPO",
    from: ["CEY"],
    include: [{ adm1: "MV-00" }, { adm1: "MV-01" }, { adm1: "MV-02" }, { adm1: "MV-03" }, { adm1: "MV-04" }, { adm1: "MV-05" }, { adm1: "MV-07" }, { adm1: "MV-08" }, { adm1: "MV-12" }, { adm1: "MV-13" }, { adm1: "MV-14" }, { adm1: "MV-17" }, { adm1: "MV-20" }, { adm1: "MV-23" }, { adm1: "MV-24" }, { adm1: "MV-25" }, { adm1: "MV-26" }, { adm1: "MV-27" }, { adm1: "MV-28" }, { adm1: "MV-29" }],
    confidence: "high",
    sourceIds: ["hammond-1912"],
    notes: "The Maldives became a British protectorate in 1887 and were not administered as part of Ceylon.",
  },
  {
    id: "oman-gwadar",
    description: "Gwadar, an Omani possession on the Makran coast until 1958.",
    to: "OMN",
    from: ["BIN"],
    include: [{ polygon: GWADAR }],
    clip: [{ adm0: "PAK" }],
    confidence: "medium",
    sourceIds: ["hammond-1912"],
    notes: "The rectangle approximates the Gwadar enclave; the exact 1900 boundary with British Baluchistan is uncertain.",
  },
  {
    id: "tibet-from-china",
    description: "Tibet, an autonomous province under Qing suzerainty, separated from the Qing polygon for map representation.",
    to: "TIB",
    from: ["CHN"],
    include: [{ adm1: "CN-XZ" }],
    confidence: "low",
    sourceIds: ["hammond-1912"],
    notes:
      "The Tibet Autonomous Region covers only part of the 1900 Tibetan cultural and administrative sphere; Amdo (Qinghai) and Kham (Sichuan/Yunnan) are not separated. The polygon is a conservative core, not the full Tibetan plateau.",
  },
  {
    id: "khiva-from-russia",
    description: "The Khanate of Khiva, a Russian protectorate in 1900.",
    to: "KHI",
    from: ["RUS"],
    include: [{ adm1: "UZ-XO" }, { adm1: "UZ-QR" }, { adm1: "TM-D" }],
    confidence: "low",
    sourceIds: ["hammond-1912"],
    notes:
      "The khanate's irrigated core along the Amu Darya is approximated by Xorazm, Karakalpakstan and DaÃ…Å¸oguz. The desert frontier with Bukhara and Persia was not a hard line.",
  },
  {
    id: "bukhara-from-russia",
    description: "The Emirate of Bukhara, a Russian protectorate in 1900.",
    to: "BUK",
    from: ["RUS"],
    include: [
      { adm1: "UZ-BU" },
      { adm1: "UZ-NW" },
      { adm1: "UZ-QA" },
      { adm1: "UZ-SU" },
      { adm1: "TJ-KT" },
      { adm1: "TJ-X01~" },
      { adm1: "TJ-DU" },
    ],
    confidence: "low",
    sourceIds: ["hammond-1912"],
    notes:
      "The emirate's core (Bukhara, Qarshi, Termez, Dushanbe, Kulob) is approximated by modern Uzbek and Tajik provinces. The eastern Pamir frontier and the desert boundary with Khiva are uncertain.",
  },
  {
    id: "shammar-from-ottoman",
    description: "Jabal Shammar (Ha'il), the effective power in northern Najd in 1900; Ottoman sovereignty was nominal.",
    to: "SHM",
    from: ["OTT"],
    include: [
      { adm1: "SA-01" },
      { adm1: "SA-05" },
      { adm1: "SA-06" },
      { adm1: "SA-08" },
      { adm1: "SA-12" },
    ],
    confidence: "medium",
    sourceIds: ["hammond-1912"],
    notes:
      "The emirate's core in 1900 included Ha'il, Qassim and Riyadh after the fall of the Second Saudi State. The Hejaz and al-Hasa remained Ottoman. The desert frontiers are approximate; Ottoman suzerainty over Najd is recorded but not shown as direct administration.",
  },

  // ---------------------------------------------------------------------------
  // Africa
  // ---------------------------------------------------------------------------
  {
    id: "german-east-africa-zanzibar",
    description: "Zanzibar and Pemba, a British protectorate, not part of German East Africa.",
    to: "BPO",
    from: ["GEA"],
    include: [{ adm1: "TZ-06" }, { adm1: "TZ-07" }, { adm1: "TZ-10" }, { adm1: "TZ-11" }, { adm1: "TZ-15" }],
    confidence: "high",
    sourceIds: ["hammond-1912"],
    notes: "The five Zanzibar/Pemba regions are removed from German East Africa and grouped with British Indian Ocean possessions. Zanzibar was a protectorate, not a colony.",
  },
  {
    id: "german-east-africa-kionga",
    description: "The Kionga triangle, German East Africa until 1919.",
    to: "GEA",
    from: ["MOZ"],
    include: [{ polygon: KIONGA_TRIANGLE }],
    clip: [{ adm0: "MOZ" }],
    confidence: "medium",
    sourceIds: ["treaty-versailles-1919"],
    notes: "The triangle south of the Rovuma mouth is approximated by a small rectangle; the river boundary is generalized.",
  },
  {
    id: "german-south-west-africa-walvis",
    description: "Walvis Bay, a British Cape Colony enclave, not part of German South West Africa.",
    to: "CAP",
    from: ["GSW"],
    include: [{ polygon: WALVIS_BAY }],
    clip: [{ adm0: "NAM" }],
    confidence: "high",
    sourceIds: ["hammond-1912"],
    notes: "Walvis Bay was annexed to the Cape in 1884 and surrounded by German territory; the rectangle approximates the enclave.",
  },
  {
    id: "togo-volta",
    description: "The Volta Region (British Togoland), part of German Togo in 1900.",
    to: "TOG",
    from: ["BWA"],
    include: [{ adm1: "GH-TV" }],
    confidence: "high",
    sourceIds: ["treaty-versailles-1919", "hammond-1912"],
    notes: "The Volta Region was the western part of German Togo until the 1914 British occupation; it is removed from the Gold Coast and restored to Togo.",
  },
  {
    id: "italian-somaliland-british",
    description: "British Somaliland, separate from Italian Somaliland in 1900.",
    to: "BSO",
    from: ["ITS"],
    include: [{ polygon: BRITISH_SOMALILAND }],
    clip: [{ adm0: "SOM" }],
    confidence: "medium",
    sourceIds: ["hammond-1912"],
    notes:
      "The northwest Somali regions are approximated by a rectangle clipped to modern Somalia. The 1894 Anglo-Italian frontier is generalized; Bari and the eastern Sanaag are borderline.",
  },
  {
    id: "italian-somaliland-jubaland",
    description: "Jubaland, British East Africa until 1924, not Italian Somaliland.",
    to: "BEA",
    from: ["ITS"],
    include: [{ adm1: "SO-JH" }, { adm1: "SO-JD" }, { adm1: "SO-GE" }],
    confidence: "medium",
    sourceIds: ["treaty-lausanne-1923", "hammond-1912"],
    notes: "The lower and middle Juba provinces and Gedo approximate British Jubaland. The Juba River frontier and the 1900 interior limit are generalized.",
  },
  {
    id: "german-new-guinea-papua",
    description: "British New Guinea (Papua), separate from German New Guinea in 1900.",
    to: "BPO",
    from: ["GNG"],
    include: [
      { adm1: "PG-WPD" },
      { adm1: "PG-GPK" },
      { adm1: "PG-CPM" },
      { adm1: "PG-NCD" },
      { adm1: "PG-NPP" },
      { adm1: "PG-MBA" },
    ],
    confidence: "medium",
    sourceIds: ["hammond-1912"],
    notes:
      "The southern Papuan provinces approximate British New Guinea. The 1885-86 Anglo-German boundary followed the central range, not the modern provincial borders; the split is approximate.",
  },
  {
    id: "sokoto-from-british-west-africa",
    description: "The Sokoto Caliphate's core in northern Nigeria, independent until the British conquest of 1900-03.",
    to: "SOK",
    from: ["BWA"],
    include: [
      { adm1: "NG-SO" },
      { adm1: "NG-KE" },
      { adm1: "NG-ZA" },
      { adm1: "NG-KT" },
      { adm1: "NG-KN" },
      { adm1: "NG-JI" },
      { adm1: "NG-KD" },
      { adm1: "NG-AD" },
      { adm1: "NG-BA" },
      { adm1: "NG-GO" },
    ],
    confidence: "low",
    sourceIds: ["hammond-1912"],
    notes:
      "The caliphate's core emirates are approximated by ten modern Nigerian states. The southern and eastern frontier emirates, Ilorin and the Niger bend are not included; the 1900 border was a shifting military frontier, not a surveyed line.",
  },
  {
    id: "wadai-from-french-equatorial-africa",
    description: "The Wadai (Ouaddai) Sultanate in eastern Chad, independent until the French conquest of 1909-11.",
    to: "WAD",
    from: ["FEA"],
    include: [
      { adm1: "TD-OD" },
      { adm1: "TD-WF" },
      { adm1: "TD-BA" },
      { adm1: "TD-BO" },
      { adm1: "TD-X01~" },
      { adm1: "TD-SA" },
    ],
    confidence: "low",
    sourceIds: ["eb1911-wadai", "hammond-1912"],
    notes:
      "The sultanate's core in OuaddaÃƒÂ¯, Wadi Fira, Batha and the Borkou/Ennedi approaches is approximated by modern Chadian regions. The northern Tibesti and the southern tributary zones are excluded; the frontier was not surveyed.",
  },
  {
    id: "darfur-from-anglo-egyptian-sudan",
    description: "The Darfur Sultanate, restored in 1898 and independent of the Anglo-Egyptian Sudan until 1916.",
    to: "DAR",
    from: ["SUD"],
    include: [{ adm1: "SD-DE" }, { adm1: "SD-DN" }, { adm1: "SD-DS" }, { adm1: "SD-DW" }],
    confidence: "medium",
    sourceIds: ["eb1911-darfur", "hammond-1912"],
    notes:
      "The five modern Darfur states approximate the sultanate's late-19th-century core. The Kordofan frontier and the southern raiding zones are generalized; Darfur's 1900 extent was somewhat larger than the modern states.",
  },

  // ---------------------------------------------------------------------------
  // Americas and Oceania
  // ---------------------------------------------------------------------------
  {
    id: "bolivia-acre",
    description: "Acre, Bolivian until the 1903 Treaty of PetrÃƒÂ³polis.",
    to: "BOL",
    from: ["BRA"],
    include: [{ adm1: "BR-AC" }],
    confidence: "high",
    sourceIds: ["hammond-1912"],
    notes: "Acre was Bolivian territory in 1900; Brazil acquired it in 1903. The modern state boundary is used.",
  },
  {
    id: "chile-tacna",
    description: "Tacna, under Chilean administration from 1883 to 1929.",
    to: "CHL",
    from: ["PRU"],
    include: [{ adm1: "PE-TAC" }],
    confidence: "high",
    sourceIds: ["hammond-1912"],
    notes: "Tacna was occupied and administered by Chile after the War of the Pacific; Peru recovered it in 1929. The modern Tacna region is used.",
  },
  {
    id: "newfoundland-from-canada",
    description: "Newfoundland and Labrador, a separate dominion in 1900, not part of Canada.",
    to: "NFD",
    from: ["CAN"],
    include: [{ adm1: "CA-NL" }],
    confidence: "high",
    sourceIds: ["hammond-1912"],
    notes: "Newfoundland and Labrador were a separate self-governing dominion until 1949. The modern Canadian province is used as the polygon.",
  },
  {
    id: "tonga-from-british-pacific",
    description: "The Kingdom of Tonga, a British-protected but internally self-governing kingdom, not a British colony.",
    to: "TON",
    from: ["BPO"],
    include: [{ adm0: "TON" }],
    confidence: "high",
    sourceIds: ["hammond-1912"],
    notes: "Tonga was a protected state, not part of the British colonial empire. It is removed from the British Pacific group and given its own polygon.",
  },
  {
    id: "niue-british-protectorate",
    description: "Niue, a British protectorate in 1900 (annexed to New Zealand in 1901).",
    to: "BPO",
    from: [],
    include: [{ adm0: "NIU" }],
    confidence: "high",
    sourceIds: ["hammond-1912"],
    notes: "Niue was not included in any 1900 polity polygon. It is assigned to the British Pacific group; New Zealand's annexation came in 1901.",
  },
  {
    id: "french-southern-territories",
    description: "Kerguelen, Crozet, Saint-Paul and Amsterdam islands, French since the 1890s.",
    to: "FPO",
    from: [],
    include: [{ adm0: "ATF" }],
    confidence: "high",
    sourceIds: ["hammond-1912"],
    notes: "The French Southern and Antarctic Lands fill a terrestrial gap in the southern Indian Ocean. They were administered from Madagascar in 1900; grouping them with the French Pacific is a map aggregation.",
  },
];

/**
 * Map-only territorial uncertainty. These areas are deliberately excluded from
 * every polity polygon and rendered as disputed/no-established-administration
 * zones. They do not add a playable polity or change any simulation id.
 */
export const DISPUTED_AREAS = [
  {
    id: "aouzou-tibesti",
    name: "Aouzouâ€“Tibesti frontier zone",
    classification: "disputed-no-established-administration",
    referenceDate: "1900-01-01",
    confidence: "low",
    polygon: AOUZOU_TIBESTI_DISPUTED,
    label: [17.0, 21.3],
    sovereigntyClaims: [
      "France: the 21 March 1899 Anglo-French Declaration placed the area in a French sphere of influence; this was not effective administration in 1900.",
      "Ottoman Empire: Tripolitanian claims and later military/administrative activity in the wider Tibesti region; no continuous effective administration across the zone in January 1900.",
      "Local authority: Toubou/Teda communities and trans-Saharan networks exercised the practical authority; no surveyed frontier existed.",
    ],
    administration:
      "No single power exercised continuous effective administration across the whole zone on 1 January 1900. French posts and columns did not control Tibesti; Ottoman authority was claimed and intermittently projected; local Toubou authority was the most direct administration.",
    sources: ["icj-libya-chad-1994", "icj-libya-chad-pleadings", "eb1911-tripoli", "hammond-1912"],
    notes:
      "A cartographic uncertainty zone, not a state. The 1899 declaration is a sphere-of-influence line, not a boundary survey. The 1935 Franco-Italian agreement and the 1955 Franco-Libyan treaty are post-1900 and are not applied retroactively. The rectangle approximates the Aouzou strip (15â€“16Â°E) plus the Tibesti massif (16â€“19Â°E) north of 19.5Â°N, including BardaÃ¯ and Gouro. It is not a precise historical border.",
  },
  {
    id: "siachen-kashmir",
    name: "Karakoram–Siachen frontier zone",
    classification: "disputed-frontier-unsettled",
    referenceDate: "1900-01-01",
    confidence: "low",
    polygon: box(76.6, 35.0, 77.9, 35.8),
    label: [77.25, 35.4],
    sovereigntyClaims: [
      "British India: Kashmir was a princely state under British suzerainty; its northern boundary was not surveyed in 1900.",
      "Qing China: the Karakoram alignment was not delimited in the Siachen/Aksai Chin sector.",
    ],
    administration:
      "No surveyed or effectively administered boundary existed in the high Karakoram in 1900. The zone is represented as a disputed frontier rather than assigned to British India or Qing China.",
    sources: ["hammond-1912"],
    notes:
      "A small map-only uncertainty zone at the junction of the Karakoram and Siachen. It is not a separate polity and does not change any simulation id. The rectangle is a cartographic proxy for an undelimited high-mountain frontier, not a precise boundary.",
  },
];

/**
 * Per-polity provenance. `class` is one of:
 *  - direct-modern-verified: one modern unit whose 1900 external border is the same;
 *  - aggregate-modern-verified: a union of modern units whose combined 1900 border is the same;
 *  - reconstructed: explicit historical transfers applied;
 *  - approximate: a defensible but low-confidence historical extent;
 *  - marker-only: no polygon (retained only where no defensible extent exists).
 *
 * Confidence is the boundary confidence, separate from the catalog's
 * population confidence.
 */
export const TAG_BOUNDARY = {
  // Europe
  USA: ["direct-modern-verified", "high", "The 1900 United States external border (including Alaska and the annexed Hawaiian Islands) coincides with the modern Natural Earth outline. The Philippines, Puerto Rico, Guam and American Samoa are separate territories."],
  GBR: ["aggregate-modern-verified", "high", "The United Kingdom of Great Britain and Ireland in 1900 comprised the modern United Kingdom and the whole of Ireland. External borders are unchanged."],
  DEU: ["reconstructed", "medium", "Reconstructed as the 1900 German Empire: modern Germany plus Alsace-Lorraine, northern Schleswig, Eupen-Malmedy, KlaipÃ„â€”da, Kaliningrad and the Prussian eastern provinces, clipped to the 1900 Russian/Austrian frontier. The eastern frontier strip is the least certain part."],
  FRA: ["reconstructed", "high", "Modern France minus Alsace-Lorraine (Bas-Rhin, Haut-Rhin, Moselle). Belfort remained French and is retained."],
  RUS: ["reconstructed", "medium", "The Russian Empire in 1900 included the Baltic provinces, Belarus, most of Ukraine, Bessarabia, Congress Poland, Finland (separate grand duchy), the Caucasus, Central Asia and Kars/Ardahan/Artvin. German Poland, KlaipÃ„â€”da, Galicia, Khiva and Bukhara are removed; Kars is added."],
  JPN: ["direct-modern-verified", "high", "The Japanese home islands in 1900 (Honshu, Hokkaido, Kyushu, Shikoku, Okinawa and the Bonins) match the modern outline. Taiwan is a separate colony and Korea is independent."],
  ITA: ["reconstructed", "high", "Modern Italy minus Trentino/South Tyrol, Trieste and Gorizia, which were Austrian in 1900."],
  ESP: ["direct-modern-verified", "high", "Peninsular Spain and the Balearics were unchanged between 1900 and the modern outline; the African possessions are separate territories."],
  PRT: ["direct-modern-verified", "high", "Peninsular Portugal was unchanged; the Azores and Madeira are included in the modern outline and were Portuguese in 1900."],
  NLD: ["direct-modern-verified", "high", "The European Netherlands external border was unchanged in 1900. The East Indies, Suriname and Caribbean islands are separate territories."],
  BEL: ["reconstructed", "high", "Modern Belgium minus Eupen-Malmedy, annexed from Germany in 1920."],
  CHE: ["direct-modern-verified", "high", "The Swiss Confederation's external border was unchanged in 1900."],
  SWE: ["direct-modern-verified", "high", "Sweden's external border was unchanged in 1900; the personal union with Norway is a separate polity."],
  NOR: ["direct-modern-verified", "high", "Norway's external border was unchanged in 1900. Svalbard was terra nullius until 1920 but is included in the modern Norwegian outline; this is a known small over-assignment."],
  DNK: ["reconstructed", "high", "Modern Denmark minus North Schleswig, German from 1864 to 1920."],
  GRC: ["reconstructed", "medium", "The 1900 Kingdom of Greece comprised the Peloponnese, Attica, Thessaly (from 1881), the Ionian Islands, Euboea, the Cyclades and part of southern Epirus. Epirus, Macedonia, Thrace, the North Aegean and the Dodecanese are removed to the Ottoman Empire; Crete is separate."],
  SRB: ["reconstructed", "high", "The 1900 Kingdom of Serbia excluded Vojvodina (Austria-Hungary) and the SandÃ…Â¾ak (Ottoman). Both are removed."],
  MNT: ["reconstructed", "high", "The 1900 Principality of Montenegro excluded the Bay of Kotor (Austrian) and the SandÃ…Â¾ak municipalities acquired in 1912-13."],
  ROM: ["reconstructed", "high", "The 1900 Kingdom of Romania comprised Wallachia and Moldavia plus northern Dobruja. Transylvania, the Banat, CriÃˆâ„¢ana, MaramureÃˆâ„¢ and southern Bukovina are removed to Austria-Hungary; southern Dobruja is added from Bulgaria."],
  BGR: ["reconstructed", "high", "The 1900 Principality of Bulgaria included Eastern Rumelia but not southern Dobruja, which was Romanian until 1913."],
  OTT: ["reconstructed", "medium", "The Ottoman Empire in 1900 included Anatolia, the Levant, Iraq, the Hejaz, Yemen, Albania, Macedonia and Kosovo, plus Libya. Kars/Ardahan/Artvin are Russian; northern Najd is Jabal Shammar; southern Yemen is British; Crete is autonomous."],
  LUX: ["direct-modern-verified", "high", "The Grand Duchy's external border was unchanged in 1900."],
  MCO: ["direct-modern-verified", "high", "Monaco's 1861 border was unchanged in 1900."],
  SMR: ["direct-modern-verified", "high", "San Marino's border was unchanged in 1900."],
  AND: ["direct-modern-verified", "high", "Andorra's border was unchanged in 1900."],
  LIE: ["direct-modern-verified", "high", "Liechtenstein's border was unchanged in 1900."],
  // Asia
  CHN: ["reconstructed", "medium", "The Qing Empire in 1900 included modern China, Manchuria, Xinjiang, Mongolia and Tibet. Tibet is separated as an autonomous province; Taiwan is Japanese; Hong Kong and Macao are separate. The Tibetan and Mongolian internal frontiers are not drawn."],
  KOR: ["aggregate-modern-verified", "high", "The Korean Empire comprised the modern Korean peninsula (Republic of Korea and DPRK). External borders are unchanged."],
  PER: ["direct-modern-verified", "medium", "Persia's external border was broadly the modern Iranian outline. The Ottoman-Persian frontier in Kurdistan and Khuzestan was not fully delimited until 1913-37; minor frontier strips are approximate."],
  AFG: ["direct-modern-verified", "medium", "Afghanistan's external border after the 1893 Durand Line matches the modern outline. The northern frontier with Russia was fixed in the 1880s-90s."],
  NPL: ["direct-modern-verified", "high", "Nepal's external border was unchanged in 1900."],
  THA: ["reconstructed", "medium", "Siam in 1900 included the western Cambodian provinces ceded in 1904-07, Sainyabuli, and the northern Malay states transferred to British protection in 1909. Those areas are added."],
  OMN: ["reconstructed", "medium", "Muscat and Oman included Gwadar on the Makran coast until 1958. Gwadar is added from British India."],
  ETH: ["direct-modern-verified", "medium", "The Ethiopian Empire's 1900 outline is broadly the modern one after Menelik II's expansion. The western and southern frontier zones were not surveyed; the modern outline is a defensible approximation."],
  LBR: ["direct-modern-verified", "low", "Liberia's 1900 boundary was larger than the modern one: France annexed frontier districts in 1892 and 1911. The modern outline is retained as a conservative de facto extent; the loss is not reconstructed."],
  MAR: ["direct-modern-verified", "low", "Morocco's 1900 southern and south-eastern frontier was not delimited. The modern outline excludes the Tindouf/Colomb-BÃƒÂ©char claims and Western Sahara (separate Spanish territory); the modern border is a rough approximation."],
  ZAR: ["approximate", "low", "The Transvaal is approximated by the modern Gauteng, North West, Mpumalanga and Limpopo provinces. The 1900 republic's border differed from the modern provincial boundaries, especially in the west and south."],
  ORF: ["approximate", "low", "The Orange Free State is approximated by the modern Free State province. The 1900 republic's western boundary and the Basutoland border differed from the modern province."],
  MEX: ["direct-modern-verified", "high", "Mexico's external border was unchanged after 1853; Quintana Roo was administered as part of YucatÃƒÂ¡n in 1900 but is Mexican territory."],
  GUA: ["direct-modern-verified", "medium", "Guatemala's external border with Mexico was fixed in 1882 and with British Honduras in 1859-1931; the modern outline is a close approximation."],
  HON: ["direct-modern-verified", "medium", "Honduras's borders with Nicaragua and El Salvador were settled in the early 20th century; the modern outline is a close approximation."],
  SAL: ["direct-modern-verified", "high", "El Salvador's external border was unchanged in 1900."],
  NIC: ["direct-modern-verified", "medium", "Nicaragua's borders with Honduras and Costa Rica were settled in 1906-15; the modern outline is a close approximation."],
  COS: ["direct-modern-verified", "medium", "Costa Rica's border with Panama (then Colombian) was settled in 1900-01; the modern outline is a close approximation."],
  COL: ["aggregate-modern-verified", "high", "Colombia in 1900 included Panama; the union of modern Colombia and Panama is the correct 1900 extent."],
  VEN: ["direct-modern-verified", "medium", "Venezuela's de facto border with British Guiana followed the Schomburgk line; the modern outline is close but the Essequibo claim was larger."],
  ECU: ["direct-modern-verified", "low", "Ecuador's 1900 claim to the Oriente was much larger than the modern outline; the de facto Amazonian frontier was contested with Peru. The modern outline is a conservative approximation."],
  PRU: ["reconstructed", "high", "Peru in 1900 did not include Tacna, which was under Chilean administration until 1929. Tacna is removed."],
  BOL: ["reconstructed", "medium", "Bolivia in 1900 included Acre, acquired by Brazil in 1903; Acre is added and the Treaty of Petrópolis is not applied retroactively. The Chaco Boreal was disputed with Paraguay and is left with Paraguay as the de facto administration, not a recognized sovereignty. A residual proxy-boundary sliver with Brazil is trimmed and recorded."],
  CHL: ["reconstructed", "high", "Chile in 1900 administered Tacna and Arica after the War of the Pacific. Tacna is added; Arica is already in the modern Chilean outline."],
  ARG: ["direct-modern-verified", "high", "Argentina's external border with Chile was settled in 1881-1902; the modern outline is the 1900 extent."],
  URY: ["direct-modern-verified", "high", "Uruguay's borders were unchanged in 1900."],
  PRY: ["direct-modern-verified", "low", "Paraguay's 1900 Chaco frontier was disputed and largely unadministered. The modern Chaco is shown as de facto Paraguayan; this is an explicit uncertainty, not a recognized 1900 border."],
  BRA: ["reconstructed", "medium", "Brazil in 1900 did not include Acre, which was Bolivian until 1903. Acre is removed; the Treaty of Petrópolis is not applied retroactively. A residual proxy-boundary sliver with Bolivia is trimmed and recorded."],
  HTI: ["direct-modern-verified", "high", "Haiti's border was unchanged in 1900."],
  DOM: ["direct-modern-verified", "high", "The Dominican Republic's border was unchanged in 1900."],
  CAN: ["reconstructed", "high", "The Dominion of Canada in 1900 excluded Newfoundland and Labrador, which are removed. The modern provincial boundaries are used; northern Quebec and the territories were administered by Canada."],
  AUS: ["aggregate-modern-verified", "high", "The six Australian colonies in 1900 covered the modern Australian mainland and Tasmania. Federation occurred on 1 January 1901; the map shows the colonies as one 1900 dominion."],
  NZL: ["direct-modern-verified", "high", "New Zealand's 1900 borders were the modern ones. The Cook Islands, Niue and other Pacific dependencies are separate territories."],
  CUB: ["direct-modern-verified", "high", "Cuba's border was unchanged; the island was under United States military occupation in January 1900."],
  AUT: ["reconstructed", "high", "Austria-Hungary in 1900 comprised modern Austria, Hungary, Czechia, Slovakia, Slovenia, Croatia, Bosnia and Galicia, plus Transylvania, the Banat, Vojvodina, South Tyrol, Trieste, Gorizia, Kotor and Cieszyn Silesia. Those areas are added from Russia, Romania, Serbia, Montenegro, Italy and Poland."],
  TON: ["direct-modern-verified", "high", "The Kingdom of Tonga's 1900 territory is the modern Tongan archipelago. It was a British protected state, not a colony."],
  SOK: ["approximate", "low", "The Sokoto Caliphate's core is reconstructed from ten modern northern Nigerian states. The frontier was a shifting military boundary; the southern and eastern emirates are not all included."],
  WAD: ["approximate", "low", "The Wadai Sultanate's core is reconstructed from six modern Chadian regions. The northern Tibesti and southern tributary zones are excluded; no surveyed 1900 border exists."],
  DAR: ["approximate", "medium", "The Darfur Sultanate is reconstructed from the five modern Darfur states. The 1900 sultanate was somewhat larger, especially toward Kordofan; the modern states are a conservative core."],
  SHM: ["approximate", "medium", "Jabal Shammar is reconstructed from Ha'il, Qassim, Riyadh, the Northern Borders and al-Jowf. Ottoman sovereignty over Najd was nominal; the desert frontiers are approximate."],
  CRT: ["direct-modern-verified", "high", "The Cretan State's 1900 territory is the island of Crete, matching the modern Greek region."],
  // Territories
  BIN: ["reconstructed", "medium", "British India in 1900 included modern India, Pakistan, Bangladesh and Burma, plus Aden. Goa/Daman/Diu, French India and Gwadar are removed; the Andamans, Nicobars, Lakshadweep and Sikkim are retained. The Burmese and frontier administrations are not separately drawn."],
  CEY: ["reconstructed", "high", "Ceylon in 1900 was the modern Sri Lanka; the Maldives were a separate protectorate and are removed."],
  MAL: ["reconstructed", "medium", "British Malaya in 1900 comprised the Federated and Unfederated Malay States, Singapore and Brunei, but not Sarawak, North Borneo or the northern Malay states (Siamese until 1909). Sarawak is separate; the northern states are removed to Siam. North Borneo remains grouped here as a British-protected territory."],
  HKG: ["direct-modern-verified", "high", "Hong Kong in 1900 included Hong Kong Island, Kowloon and the New Territories leased in 1898; the modern outline is correct."],
  KUW: ["direct-modern-verified", "medium", "Kuwait was a British protectorate from 1899; its 1900 borders were not delimited. The modern outline is a rough approximation."],
  TRU: ["aggregate-modern-verified", "medium", "The Trucial States and Bahrain were British-protected; the modern UAE and Bahrain outlines approximate the 1900 coastal principalities. The interior boundaries were not delimited."],
  CYP: ["aggregate-modern-verified", "high", "Cyprus was a British protectorate from 1878; the modern island outline (including the north) is correct."],
  MLT: ["direct-modern-verified", "high", "Malta's borders were unchanged in 1900."],
  BWI: ["aggregate-modern-verified", "medium", "The British West Indies grouping aggregates the British Caribbean colonies and British Honduras. Individual colonial boundaries were largely unchanged; the grouping is a map aggregation."],
  BSA: ["aggregate-modern-verified", "medium", "The British South Atlantic and Pacific islands grouping aggregates the Falklands, South Georgia, St Helena, Pitcairn and the British Indian Ocean Territory. BIOT (Chagos) was administered from Mauritius in 1900; the grouping is a map aggregation."],
  BWA: ["aggregate-modern-verified", "medium", "British West Africa in 1900 comprised Gambia, Sierra Leone, the Gold Coast and Nigeria. The Volta Region is removed to German Togo; northern Nigeria is removed to Sokoto. The grouping is a map aggregation."],
  BEA: ["aggregate-modern-verified", "medium", "British East Africa in 1900 comprised the East Africa Protectorate and Uganda, plus Jubaland. The modern Kenya/Uganda outlines approximate the 1900 protectorates; Jubaland is added from Italian Somaliland."],
  SUD: ["reconstructed", "high", "Anglo-Egyptian Sudan in 1900 excluded Darfur, which was independent after 1898. Darfur is removed."],
  BSO: ["reconstructed", "medium", "British Somaliland is reconstructed from the northwest Somali regions, approximating the 1894 Anglo-Italian frontier."],
  CRA: ["aggregate-modern-verified", "medium", "British Central Africa in 1900 comprised Nyasaland, Northern Rhodesia and Southern Rhodesia. The modern Malawi/Zambia/Zimbabwe outlines are close; the grouping is a map aggregation."],
  HCT: ["aggregate-modern-verified", "high", "The High Commission Territories were Basutoland, Bechuanaland and Swaziland, matching modern Lesotho, Botswana and Eswatini."],
  FJI: ["direct-modern-verified", "high", "Fiji's 1900 borders were the modern archipelago."],
  BPO: ["reconstructed", "medium", "The British Pacific and Indian Ocean grouping includes the Solomon Islands, Gilbert and Ellice Islands, Cook Islands, Niue, Norfolk Island, New Hebrides, Mauritius, Seychelles, Maldives, Zanzibar/Pemba and British New Guinea. Tonga is separate. Some of these were protectorates or condominia, not colonies; the grouping is a map aggregation."],
  CAP: ["approximate", "medium", "The Cape Colony is approximated by the modern Northern Cape, Western Cape and Eastern Cape provinces, plus Walvis Bay. The 1900 colonial boundary differed from the modern provincial lines, especially on the eastern frontier and in Griqualand."],
  NAT: ["approximate", "medium", "Natal is approximated by the modern KwaZulu-Natal province. The 1900 colony included Zululand (annexed 1897); the modern province is close but not identical."],
  NFD: ["reconstructed", "medium", "Newfoundland and Labrador were a separate dominion in 1900. The modern province is used as the polygon, but the Labrador interior boundary was disputed around 1900; the 1927 Privy Council line is not treated as an uncontested 1900 border. A residual coastline sliver is trimmed and recorded in the overlap audit."],
  ALG: ["direct-modern-verified", "low", "French Algeria's 1900 southern boundary was not effectively administered beyond the Tell and the northern Sahara; the modern Algerian outline is a rough approximation. The Hoggar and Touat were not fully controlled until 1902-05."],
  TUN: ["direct-modern-verified", "high", "The French protectorate of Tunisia's borders were unchanged after 1881."],
  FWA: ["aggregate-modern-verified", "medium", "French West Africa in 1900 comprised Senegal, French Sudan, Guinea, Ivory Coast, Dahomey, Mauritania and the Niger military territory. The modern outlines are close; Upper Volta did not exist until 1919. The grouping is a map aggregation."],
  FEA: ["aggregate-modern-verified", "medium", "French Equatorial Africa in 1900 comprised Congo, Gabon, Ubangi-Shari and Chad. Wadai is removed as an independent sultanate. The modern outlines are close."],
  FIC: ["reconstructed", "medium", "French Indochina in 1900 comprised Tonkin, Annam, Cochinchina, Cambodia and Laos. The western Cambodian and Lao provinces ceded by Siam in 1904-07 are removed; French India is grouped here as a map aggregation."],
  MAD: ["aggregate-modern-verified", "high", "French Madagascar and the Comoros were French in 1900; the modern outlines are correct."],
  FSO: ["direct-modern-verified", "high", "French Somaliland's 1900 border was broadly the modern Djibouti outline."],
  FCA: ["aggregate-modern-verified", "high", "The French Caribbean grouping (Guiana, Guadeloupe, Martinique, St Pierre and Miquelon, St BarthÃƒÂ©lemy, St Martin) was French in 1900."],
  FPO: ["aggregate-modern-verified", "high", "The French Pacific grouping (French Polynesia, New Caledonia, Wallis and Futuna, plus the French Southern Territories) was French in 1900. The southern Indian Ocean islands were administered from Madagascar; the grouping is a map aggregation."],
  GEA: ["reconstructed", "medium", "German East Africa in 1900 comprised Tanganyika, Rwanda, Burundi and the Kionga triangle, but not Zanzibar and Pemba. Zanzibar is removed to the British group; Kionga is added from Mozambique."],
  GSW: ["reconstructed", "high", "German South West Africa in 1900 excluded Walvis Bay, a British Cape enclave. Walvis Bay is removed."],
  KAM: ["direct-modern-verified", "low", "Kamerun's 1900 borders were smaller than the 1911 Neukamerun and did not include the later French Congo cessions. The modern Cameroon outline is a rough approximation; the Chad/CAR frontier and the Bakassi area are uncertain."],
  TOG: ["reconstructed", "high", "German Togo in 1900 included the Volta Region, which is added from the Gold Coast. The modern Togolese outline is otherwise correct."],
  GNG: ["reconstructed", "medium", "German New Guinea in 1900 comprised the northern mainland (Kaiser-Wilhelmsland), the Bismarck Archipelago and Bougainville, but not British New Guinea (Papua). The southern Papuan provinces are removed to the British group; the 1885 boundary is approximated."],
  GSA: ["direct-modern-verified", "high", "German Samoa comprised the modern independent Samoa (Western Samoa); American Samoa was a separate US territory."],
  GPN: ["aggregate-modern-verified", "high", "The German Pacific islands (Marshall, Caroline, Palau, Northern Marianas, Nauru) were German in 1900; the modern island outlines are correct."],
  CFS: ["direct-modern-verified", "medium", "The Congo Free State in 1900 covered the modern DRC. The external border was broadly the modern one; the eastern and southern frontiers were not fully surveyed."],
  ANG: ["direct-modern-verified", "medium", "Portuguese Angola in 1900 included Cabinda and the modern Angolan outline. The eastern frontier with the Congo Free State and Northern Rhodesia was not fully demarcated until the 20th century."],
  MOZ: ["reconstructed", "high", "Portuguese Mozambique in 1900 included the Kionga triangle, which is removed to German East Africa. The modern outline is otherwise correct."],
  PAI: ["reconstructed", "medium", "The Portuguese colonial grouping includes Cape Verde, SÃƒÂ£o TomÃƒÂ© and PrÃƒÂ­ncipe, Portuguese Guinea and Portuguese India (Goa, Daman, Diu). Portuguese India was a separate colony; grouping it here is a map aggregation."],
  PTM: ["direct-modern-verified", "high", "Portuguese Timor's 1900 border with the Dutch East Indies was the modern East Timor outline."],
  MAC: ["direct-modern-verified", "high", "Macao's 1900 territory was the Macao peninsula and the islands; the modern outline is correct."],
  ERI: ["direct-modern-verified", "high", "Italian Eritrea's 1900 borders were the modern Eritrean outline after the 1889-1900 delimitations."],
  ITS: ["reconstructed", "medium", "Italian Somaliland in 1900 excluded British Somaliland and Jubaland. British Somaliland is removed to the British protectorate; Jubaland is removed to British East Africa."],
  DEI: ["direct-modern-verified", "low", "The Dutch East Indies in 1900 comprised the modern Indonesian archipelago, but Dutch New Guinea was only nominally claimed and not effectively administered. The modern outline is retained with this caveat."],
  SUR: ["direct-modern-verified", "high", "Suriname's 1900 border was the modern one after the 1891 arbitration."],
  DGC: ["aggregate-modern-verified", "high", "The Dutch Caribbean islands (Aruba, CuraÃƒÂ§ao, Sint Maarten, Bonaire, Saba, Sint Eustatius) were Dutch in 1900."],
  SAH: ["direct-modern-verified", "medium", "Spanish Sahara's 1900 coastal and northern boundary was established by the 1884-1900 agreements; the eastern and southern limit with French West Africa was not fully delimited. The modern Western Sahara outline is a rough approximation."],
  SGG: ["direct-modern-verified", "high", "Spanish Guinea (Rio Muni and Fernando PÃƒÂ³) matches the modern Equatorial Guinea mainland and Bioko; AnnobÃƒÂ³n was also Spanish."],
  PHL: ["aggregate-modern-verified", "medium", "The Philippine Islands were a United States territory in 1900; the modern archipelago is correct. The Sulu Sultanate's residual authority and the Moro resistance are not shown as separate polities."],
  PRI: ["direct-modern-verified", "high", "Puerto Rico was a United States territory in 1900; the modern outline is correct."],
  GUM: ["direct-modern-verified", "high", "Guam was a United States territory in 1900; the modern outline is correct."],
  ASM: ["direct-modern-verified", "high", "American Samoa was a United States territory in 1900; the modern outline is correct."],
  ISL: ["direct-modern-verified", "high", "Iceland was a Danish dependency in 1900; the modern outline is correct."],
  GRL: ["direct-modern-verified", "high", "Greenland was a Danish colony in 1900; the modern outline is correct."],
  FRO: ["direct-modern-verified", "high", "The Faroe Islands were a Danish dependency in 1900; the modern outline is correct."],
  DWI: ["direct-modern-verified", "high", "The Danish West Indies (now the US Virgin Islands) were Danish in 1900; the modern island outlines are correct."],
  EGY: ["direct-modern-verified", "medium", "Egypt was an autonomous Ottoman province under British occupation in 1900. The modern Egyptian outline is close; the Sudan condominium and the Hala'ib frontier are not shown separately."],
  BHU: ["direct-modern-verified", "high", "Bhutan's external border was unchanged after the 1865 Duar War settlement."],
  FIN: ["reconstructed", "medium", "The Grand Duchy of Finland in 1900 included the Karelian Isthmus, Ladoga Karelia, Salla and Petsamo, which modern Finland lost to the USSR, and excluded Petsamo (acquired 1920). The modern Finnish outline is used as a base; the eastern cessions are not reconstructed. This is a known under-representation."],
  TWN: ["direct-modern-verified", "high", "Taiwan was a Japanese colony from 1895; the modern island outline is correct."],
  TIB: ["approximate", "low", "Tibet is reconstructed from the modern Tibet Autonomous Region only. Amdo (Qinghai) and Kham (Sichuan/Yunnan) are not separated; the polygon is a conservative core."],
  KHI: ["approximate", "low", "The Khanate of Khiva is approximated by Xorazm, Karakalpakstan and DaÃ…Å¸oguz. The desert frontier was not a hard line."],
  BUK: ["approximate", "low", "The Emirate of Bukhara is approximated by Bukhara, Navoiy, Qashqadaryo, Surxondaryo, Khatlon, Dushanbe and the Republican Subordination districts. The Pamir and desert frontiers are uncertain."],
  SAR: ["direct-modern-verified", "high", "The Raj of Sarawak's 1900 territory matches the modern Malaysian state of Sarawak."],
};

/** Components shown in map provenance for composite polities. */
export const COMPONENTS = {
  OTT: [
    {
      name: "Tripolitania",
      adminStatus: "Ottoman vilayet of Tripoli",
      confidence: "medium",
      notes: "North-western Libya; Ottoman garrisons on the coast and limited effective control in the interior.",
    },
    {
      name: "Cyrenaica",
      adminStatus: "Ottoman sanjak of Benghazi, under the vilayet of Tripoli",
      confidence: "medium",
      notes: "Eastern Libya; the Senussi order exercised substantial local authority alongside Ottoman administration.",
    },
    {
      name: "Fezzan",
      adminStatus: "Ottoman mutasarrifate, loosely administered",
      confidence: "low",
      notes: "South-western Libya; effective control was shared with local and trans-Saharan authorities. The southern limit was not delimited.",
    },
  ],
  DEU: [
    { name: "Prussia", adminStatus: "Kingdom of Prussia (constituent state)", confidence: "high", notes: "Included East Prussia, West Prussia, Posen, Pomerania, Silesia, Brandenburg, Saxony, Hanover, Schleswig-Holstein and the Rhineland." },
    { name: "Alsace-Lorraine", adminStatus: "Imperial territory (Reichsland)", confidence: "high", notes: "Annexed in 1871; included Bas-Rhin, Haut-Rhin and Moselle." },
    { name: "Bavaria, Saxony, WÃƒÂ¼rttemberg, Baden and the smaller states", adminStatus: "Constituent monarchies and duchies", confidence: "high", notes: "Their external borders are those of the German Empire; internal state borders are not drawn on the political layer." },
  ],
  AUT: [
    { name: "Austria (Cisleithania)", adminStatus: "Austrian half of the Dual Monarchy", confidence: "high", notes: "Included Austria, Bohemia, Moravia, Austrian Silesia, Galicia, Bukovina, Carniola, the Littoral, Dalmatia and Bosnia-Herzegovina." },
    { name: "Hungary (Transleithania)", adminStatus: "Hungarian half of the Dual Monarchy", confidence: "high", notes: "Included Hungary, Slovakia, Transylvania, the Banat, Vojvodina, Croatia-Slavonia and the Kotor bay." },
  ],
};

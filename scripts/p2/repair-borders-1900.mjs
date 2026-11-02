#!/usr/bin/env node
/**
 * P2 historical border corrections for 1 January 1900 (D-128), run after
 * repair-provinces.mjs.
 *
 * The M12 provinces were cut from modern administrative units. Where those units do
 * not follow a 1900 boundary, the M12 build used straight construction lines, which
 * put towns on the wrong side of the German-Russian and Austro-Russian borders, left a
 * stray exclave near Western Galicia, and drew several German provinces as boxes. Each
 * correction below is an authored historical line or outline with the towns it was
 * checked against. Coordinates are degrees (lon, lat); the precision is a few
 * kilometres, which is below the 0.02-degree map simplification.
 *
 * Two operations are used:
 * - carve(outline, target, donors): the target province becomes the outline clipped to
 *   the land of its donors (so coastlines are kept), and the donors lose that area.
 * - partition(sidePolygon, sideA, sideB): any piece of a side-A province outside the
 *   polygon moves to the nearest side-B province, and any piece of a side-B province
 *   inside it moves to the nearest side-A province. Provinces outside both lists are
 *   untouched, so the polygon may extend over other countries and the sea.
 *
 * Usage: node --max-old-space-size=8192 scripts/p2/repair-borders-1900.mjs
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import polygonClipping from "polygon-clipping";
import { bboxOf, multiArea, refresh, toMultiPolygon } from "./province-geometry-lib.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const MAP_DIR = join(ROOT, "packages/data/data/map");
// All five bundles: the M12e coverage residuals (for example `oc-gap-rus-residual`)
// live in the Oceania file but cover gaps everywhere, including the frontier.
const FILES = [
  "provinces_1900.json",
  "provinces_asia_1900.json",
  "provinces_africa_1900.json",
  "provinces_americas_1900.json",
  "provinces_oceania_1900.json",
];
const MIN_PIECE = 1e-5; // square degrees, about 0.1 km^2

const bundles = FILES.map((file) => ({ file, data: JSON.parse(readFileSync(join(MAP_DIR, file), "utf8")) }));
const allProvinces = bundles.flatMap(({ data }) => data.provinces);
const byKey = new Map(allProvinces.map((province) => [province.key, province]));
const geometry = new Map(allProvinces.map((province) => [province.key, toMultiPolygon(province)]));
const changed = new Set();
const report = [];

function polygon(points) {
  return [[[...points, points[0]]]];
}

function get(key) {
  if (!byKey.has(key)) throw new Error(`unknown province ${key}`);
  return geometry.get(key);
}

function set(key, multi) {
  geometry.set(key, multi);
  changed.add(key);
}

function safe(operation, ...args) {
  try {
    return polygonClipping[operation](...args);
  } catch {
    // Retry polygon by polygon of the first operand; the library's sweep line can fail
    // on very large multipolygons that it handles piecewise.
    const [first, ...rest] = args;
    const out = [];
    for (const part of first) out.push(...polygonClipping[operation]([part], ...rest));
    return operation === "union" ? polygonClipping.union(out) : out;
  }
}

function minDistance(multiA, multiB) {
  let best = Infinity;
  for (const polyA of multiA) {
    for (const [ax, ay] of polyA[0]) {
      for (const polyB of multiB) {
        for (const [bx, by] of polyB[0]) {
          const d = (ax - bx) ** 2 + (ay - by) ** 2;
          if (d < best) best = d;
        }
      }
    }
  }
  return Math.sqrt(best);
}

function segmentDistance([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const length = dx * dx + dy * dy;
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function boundaryDistance(point, multi) {
  let best = Infinity;
  for (const polygon of multi) {
    for (const ring of polygon) {
      for (let i = 0; i + 1 < ring.length; i += 1) {
        const d = segmentDistance(point, ring[i], ring[i + 1]);
        if (d < best) best = d;
      }
    }
  }
  return best;
}

/**
 * The receiver is the candidate sharing the most of the piece's outline (piece vertices
 * within 0.01 degrees of its boundary); ties and pieces touching no candidate go to the
 * candidate whose boundary is closest to the piece's vertex centroid.
 */
function nearest(piece, candidates) {
  return nearestWithShare(piece, candidates).key;
}

function nearestWithShare(piece, candidates) {
  const [px0, py0, px1, py1] = bboxOf(piece);
  const vertices = piece.flatMap((polygon) => polygon[0].slice(0, -1));
  const centroid = [
    vertices.reduce((sum, [x]) => sum + x, 0) / vertices.length,
    vertices.reduce((sum, [, y]) => sum + y, 0) / vertices.length,
  ];
  let bestKey = null;
  let bestShared = -1;
  let bestDistance = Infinity;
  for (const key of candidates) {
    const multi = get(key);
    if (multi.length === 0) continue;
    const [x0, y0, x1, y1] = bboxOf(multi);
    if (x0 > px1 + 2 || x1 < px0 - 2 || y0 > py1 + 2 || y1 < py0 - 2) continue;
    let shared = 0;
    if (!(x0 > px1 + 0.01 || x1 < px0 - 0.01 || y0 > py1 + 0.01 || y1 < py0 - 0.01)) {
      for (const vertex of vertices) if (boundaryDistance(vertex, multi) < 0.01) shared += 1;
    }
    const distance = boundaryDistance(centroid, multi);
    if (shared > bestShared || (shared === bestShared && distance < bestDistance)) {
      bestShared = shared;
      bestDistance = distance;
      bestKey = key;
    }
  }
  return { key: bestKey, shared: Math.max(0, bestShared), distance: bestDistance };
}

function carve(name, outline, target, donors) {
  const shape = polygon(outline);
  let taken = [];
  for (const key of donors) {
    const inside = safe("intersection", get(key), shape);
    if (multiArea(inside) < MIN_PIECE) continue;
    set(key, safe("difference", get(key), shape));
    taken = taken.length === 0 ? inside : safe("union", taken, inside);
  }
  if (taken.length === 0) throw new Error(`${name}: the outline covers no donor land`);
  set(target, taken);
  report.push({ correction: name, target, areaSqDeg: Number(multiArea(taken).toFixed(4)) });
}

/** The target gains the outline's land from the donors and keeps its own territory. */
function annex(name, outline, target, donors) {
  const shape = polygon(outline);
  let gained = 0;
  for (const key of donors) {
    if (key === target) continue;
    const inside = safe("intersection", get(key), shape);
    if (multiArea(inside) < MIN_PIECE) continue;
    set(key, safe("difference", get(key), shape));
    set(target, safe("union", get(target), inside));
    gained += multiArea(inside);
  }
  report.push({ correction: name, target, areaSqDeg: Number(gained.toFixed(4)) });
}

function merge(from, into) {
  set(into, safe("union", get(into), get(from)));
  set(from, []);
}

function partition(name, side, sideA, sideB, maxDistanceA = Infinity) {
  const shape = polygon(side);
  const moves = [];
  const collect = (keys, outsideOfSide, receivers, maxDistance) => {
    for (const key of keys) {
      const multi = get(key);
      if (multi.length === 0) continue;
      const wrong = outsideOfSide ? safe("difference", multi, shape) : safe("intersection", multi, shape);
      if (multiArea(wrong) < MIN_PIECE) continue;
      // A piece only changes hands when a receiving province is within maxDistance;
      // otherwise it is the polygon that is coarse there, and the piece stays.
      const kept = [];
      for (const part of wrong) {
        if (multiArea([part]) < MIN_PIECE) continue;
        const receiver = nearest([part], receivers);
        if (receiver === null || minDistance([part], get(receiver)) > maxDistance) {
          kept.push(part);
          continue;
        }
        moves.push({ from: key, part, receivers });
      }
      const remaining = outsideOfSide ? safe("intersection", multi, shape) : safe("difference", multi, shape);
      set(key, kept.length === 0 ? remaining : safe("union", remaining, kept));
    }
  };
  collect(sideA, true, sideB, maxDistanceA);
  collect(sideB, false, sideA, Infinity);
  for (const move of moves) {
    const receiver = nearest([move.part], move.receivers);
    if (receiver === null) throw new Error(`${name}: no receiver for a piece of ${move.from}`);
    set(receiver, safe("union", get(receiver), [move.part]));
    report.push({
      correction: name,
      from: move.from,
      to: receiver,
      areaSqDeg: Number(multiArea([move.part]).toFixed(4)),
      bbox: bboxOf([move.part]).map((value) => Number(value.toFixed(2))),
    });
  }
}

// ---- 1. Hohenzollern ------------------------------------------------------------
// Prussian Hohenzollern Lands: the Hechingen district around Hechingen (8.96, 48.35)
// and Haigerloch (8.80, 48.36), and the Sigmaringen strip through Gammertingen
// (9.22, 48.25) and Sigmaringen (9.22, 48.09) to Ostrach (9.38, 47.95).
merge("deu-hohenzollern", "deu-wurttemberg");
carve(
  "Hohenzollern Lands",
  [
    [8.70, 48.37], [8.79, 48.43], [8.92, 48.44], [9.03, 48.41], [9.10, 48.35], [9.16, 48.29],
    [9.27, 48.27], [9.31, 48.19], [9.33, 48.10], [9.43, 48.01], [9.41, 47.93], [9.30, 47.90],
    [9.16, 47.92], [9.08, 47.98], [9.12, 48.06], [9.10, 48.15], [9.02, 48.22], [8.92, 48.27],
    [8.78, 48.29],
  ],
  "deu-hohenzollern",
  ["deu-wurttemberg", "deu-baden"],
);

// ---- 2. Danzig ----------------------------------------------------------------------
// The future Free City territory: Zoppot (18.56, 54.44), Danzig, Oliva, the Vistula
// delta east to the Nogat near Marienburg and the Frische Nehrung to about 19.3 E.
merge("deu-danzig", "deu-west-prussia");
carve(
  "Danzig",
  [
    [18.42, 54.46], [18.57, 54.50], [18.75, 54.42], [18.95, 54.38], [19.15, 54.36], [19.33, 54.34],
    [19.30, 54.24], [19.17, 54.17], [19.00, 54.13], [18.84, 54.11], [18.66, 54.13], [18.52, 54.17],
    [18.43, 54.25], [18.40, 54.36],
  ],
  "deu-danzig",
  ["deu-west-prussia", "deu-east-prussia-north", "deu-pomerania"],
);

// ---- 3. Eupen-Malmedy -----------------------------------------------------------------
// The Prussian districts of Eupen and Malmedy (Eupen 6.03, 50.63; Malmedy 6.03, 50.43;
// St. Vith 6.13, 50.28), transferred to Belgium in 1920.
merge("deu-eupen-malmedy", "deu-rhine-province");
carve(
  "Eupen-Malmedy",
  [
    [5.95, 50.76], [6.10, 50.73], [6.20, 50.64], [6.27, 50.52], [6.38, 50.36], [6.40, 50.25],
    [6.30, 50.13], [6.15, 50.12], [6.03, 50.17], [5.97, 50.30], [5.92, 50.45], [5.97, 50.56],
    [5.93, 50.68],
  ],
  "deu-eupen-malmedy",
  ["deu-rhine-province"],
);

// ---- 3b. Silesian coverage gap ------------------------------------------------------------
// The Russian coverage residual also filled an unassigned gap of the M12 build around
// Lubliniec, Tarnowskie Gory and Czestochowa. The gap is handed to Upper Silesia first;
// the frontier partition below then returns its Russian part (Czestochowa, Bedzin).
{
  const gap = polygon([[18.0, 49.9], [19.5, 49.9], [19.5, 51.25], [18.0, 51.25]]);
  const piece = safe("intersection", get("oc-gap-rus-residual"), gap);
  if (multiArea(piece) > MIN_PIECE) {
    set("oc-gap-rus-residual", safe("difference", get("oc-gap-rus-residual"), gap));
    set("deu-upper-silesia", safe("union", get("deu-upper-silesia"), piece));
    report.push({ correction: "Silesian coverage gap", target: "deu-upper-silesia", areaSqDeg: Number(multiArea(piece).toFixed(4)) });
  }
}

// ---- 4. Russian frontier with Germany and Austria-Hungary --------------------------
// The polygon is the Russian side. Its edge is the 1900 frontier:
// German-Russian: Nimmersatt on the Baltic (21.06, 55.88), the Memel land north border,
// Schmalleningken on the Niemen (22.58, 55.08), Eydtkuhnen/Wirballen (22.90, 54.63),
// the Wystiter lake, Prostken/Grajewo (22.4, 53.7), south of Johannisburg, Willenberg and
// Neidenburg (German) against Kolno, Chorzele and Mlawa (Russian), Soldau, the Drewenz
// past Strasburg and Golub to Leibitsch, east of Thorn (German) with Ciechocinek and
// Nieszawa Russian, Gniewkowo and Kruszwica German against Radziejow, lake Goplo,
// Strzalkowo German against Slupca, Pyzdry and Konin Russian, the Prosna with Kalisz
// Russian and Ostrowo German, Wieruszow and Praszka Russian, Lublinitz and Tarnowitz
// German against Czestochowa, Bedzin and Sosnowiec Russian, to the Three Emperors'
// Corner at Myslowitz (19.19, 50.23).
// Austro-Russian: north of Chrzanow and Krakow (Austrian), the Vistula to the San mouth
// with Sandomierz Russian and Tarnobrzeg Austrian, Rozwadow and Lubaczow Austrian against
// Janow, Bilgoraj, Tarnogrod and Tomaszow Russian, Belz and Sokal Austrian, Brody
// Austrian against Radziwillow, the Zbruch from Podwoloczyska to the Dniester, and the
// Bukovina-Bessarabia line to Nowosielitza on the Prut (26.27, 48.22) and the
// Bukovina-Romania-Bessarabia corner near Mamalyga (26.6, 48.25). Beyond that the edge
// runs through Romania, west of the Prut, so all of Bessarabia stays on the Russian side;
// Romanian provinces are in neither list and are not changed.
const RUSSIAN_SIDE = [
  [21.06, 55.88], [21.35, 55.88], [21.70, 55.75], [22.05, 55.40], [22.20, 55.12], [22.58, 55.08],
  [22.85, 54.86], [22.90, 54.63], [22.78, 54.40], [22.72, 54.30], [22.60, 54.12], [22.50, 53.90],
  [22.42, 53.68], [22.10, 53.55], [21.90, 53.45], [21.50, 53.40], [21.10, 53.30], [20.85, 53.28],
  [20.60, 53.20], [20.40, 53.18], [20.20, 53.15], [19.90, 53.22], [19.60, 53.22], [19.40, 53.24],
  [19.20, 53.15], [19.00, 53.10], [18.78, 53.03], [18.85, 52.92], [18.70, 52.80], [18.50, 52.70],
  [18.38, 52.62], [18.35, 52.45], [18.15, 52.35], [17.88, 52.30], [17.65, 52.25], [17.60, 52.15],
  [17.75, 52.00], [17.95, 51.85], [18.02, 51.75], [18.10, 51.55], [18.15, 51.35], [18.20, 51.20],
  [18.40, 51.05], [18.65, 50.98], [18.85, 50.82], [18.95, 50.65], [19.05, 50.48], [19.08, 50.35],
  [19.19, 50.23],
  // Austro-Russian frontier, west to east.
  [19.35, 50.18], [19.60, 50.15], [19.85, 50.13], [20.05, 50.10], [20.20, 50.08], [20.45, 50.15],
  [20.80, 50.23], [21.20, 50.33], [21.50, 50.45], [21.83, 50.66], [22.05, 50.68], [22.30, 50.62],
  [22.55, 50.48], [22.75, 50.32], [23.10, 50.24], [23.50, 50.38], [23.95, 50.42], [24.20, 50.52],
  [24.45, 50.40], [24.75, 50.25], [25.00, 50.15], [25.25, 50.10], [25.55, 49.90], [25.85, 49.65],
  [26.16, 49.52], [26.20, 49.20], [26.15, 48.90], [26.37, 48.58], [26.25, 48.40], [26.27, 48.22],
  // Through Romania west of the Prut, then closing through the south, east and north.
  [26.60, 48.25], [27.00, 47.50], [27.00, 44.00], [40.00, 44.00], [40.00, 72.00],
  [15.00, 72.00], [15.00, 56.80], [20.50, 56.20],
];
const inFrontierBox = (key) => {
  const [x0, y0, x1, y1] = bboxOf(get(key));
  return x0 < 30 && x1 > 13 && y0 < 57 && y1 > 45;
};
const ownerKeys = (tag) =>
  allProvinces.filter((province) => province.initialOwnerTag === tag).map((province) => province.key).filter(inFrontierBox);
partition(
  "Russian frontier of 1900",
  RUSSIAN_SIDE,
  ownerKeys("RUS"),
  [...ownerKeys("DEU"), ...ownerKeys("AUT")],
  // Russian pieces move only when a German or Austrian province is within 0.3 degrees
  // (vertex to vertex); Bessarabia, about 1.5 degrees from Austria, never qualifies.
  0.3,
);

// ---- 6. Rhine Province and Westphalia ---------------------------------------------------
// Rhine Province: Isselburg, Essen, Elberfeld, Remscheid, Gummersbach, Altenkirchen.
// Westphalia: Anholt, Bocholt, Dorsten, Gelsenkirchen, Bochum, Hattingen, Schwelm,
// Luedenscheid, Olpe, Siegen. The polygon is the Rhine side.
partition(
  "Rhine Province-Westphalia border",
  [
    [6.45, 51.86], [6.75, 51.72], [6.95, 51.60], [7.03, 51.50], [7.12, 51.40], [7.25, 51.30],
    [7.45, 51.18], [7.65, 51.10], [7.75, 51.00], [7.95, 50.85], [8.05, 50.72], [8.05, 49.00],
    [5.50, 49.00], [5.50, 51.86],
  ],
  ["deu-rhine-province"],
  ["deu-westphalia"],
);

// ---- 7. Bavarian Palatinate ---------------------------------------------------------------
// Palatinate: St. Ingbert, Homburg, Kusel, Rockenhausen, Kirchheimbolanden, Gruenstadt,
// Frankenthal. Outside it: Saarbruecken, Neunkirchen and St. Wendel (Prussian), Kirn and
// Bad Kreuznach (Prussian), Alzey and Worms (Hesse). The polygon is the Palatinate side.
partition(
  "Palatinate border",
  [
    [7.05, 49.10], [7.08, 49.28], [7.25, 49.33], [7.28, 49.45], [7.32, 49.56], [7.55, 49.68],
    [7.75, 49.68], [7.95, 49.72], [8.10, 49.68], [8.25, 49.60], [8.48, 49.55], [8.60, 49.40],
    [8.30, 48.95], [7.05, 48.95],
  ],
  ["deu-palatinate"],
  // Hesse's Rheinhessen is annexed explicitly in correction 14; the strip north of the
  // Palatinate (Kirn, Bad Kreuznach) was Prussian.
  ["deu-rhine-province", "deu-saar"],
);

// ---- 8. Hultschin --------------------------------------------------------------------------
// The Hultschiner Laendchen (Hlucin region) was Prussian from 1742 to 1920, part of the
// Ratibor district of the Province of Silesia, not Austrian Silesia: Hlucin (18.19, 49.90),
// Kravare (18.00, 49.93), Bolatice (18.08, 49.95), Pist (18.19, 50.04). Outline and owner
// are corrected; the permanent key keeps its M12 spelling.
merge("aut-hultschin", "aut-austrian-silesia");
carve(
  "Hultschin",
  [
    [17.93, 49.93], [17.98, 50.02], [18.08, 50.06], [18.20, 50.05], [18.27, 49.98], [18.28, 49.90],
    [18.20, 49.86], [18.08, 49.87], [17.98, 49.89],
  ],
  "aut-hultschin",
  ["aut-austrian-silesia", "aut-moravia", "deu-upper-silesia", "deu-middle-silesia"],
);
{
  const hultschin = byKey.get("aut-hultschin");
  const prussia = byKey.get("deu-upper-silesia");
  hultschin.initialOwnerPolityId = prussia.initialOwnerPolityId;
  hultschin.initialOwnerTag = prussia.initialOwnerTag;
  hultschin.mapTag = prussia.mapTag;
  hultschin.historicalAdminAffiliation = "Prussian Province of Silesia (Ratibor district)";
  hultschin.historicalGrouping = prussia.historicalGrouping;
  hultschin.notes =
    "The Hultschin (Hlucin) region of Prussian Upper Silesia, part of the Ratibor district from 1742; transferred to Czechoslovakia in 1920 under the Treaty of Versailles.";
  report.push({ correction: "Hultschin owner", target: "aut-hultschin", owner: prussia.initialOwnerTag });
}

// ---- 9. Pomerania's western and south-western border -----------------------------------------
// Pomerania: Damgarten, Tribsees, Demmin, Anklam, Pasewalk. Mecklenburg: Ribnitz, Malchin,
// Neubrandenburg. Brandenburg: Strasburg (Uckermark), Prenzlau. The polygon is the
// Pomeranian side of the Recknitz-Trebel-Peene line and the Uckermark border.
partition(
  "Pomerania-Mecklenburg border",
  [
    [12.44, 54.40], [12.44, 54.27], [12.50, 54.20], [12.68, 54.12], [12.85, 54.03], [13.02, 53.93],
    [13.15, 53.80], [13.30, 53.70], [13.45, 53.62], [13.62, 53.56], [13.80, 53.50], [13.95, 53.45],
    // East of the Oder the existing Pomerania-Neumark line (53.0 N) is kept; deu-brandenburg
    // ends at 14.76 E, so the polygon then opens east over Farther Pomerania.
    [14.25, 53.43], [14.30, 53.00], [14.80, 53.00], [14.80, 52.00], [20.00, 52.00], [20.00, 55.00],
    [12.44, 55.00],
  ],
  ["deu-pomerania"],
  ["deu-mecklenburg", "deu-brandenburg"],
);

// ---- 10. Pomerania's southern border -------------------------------------------------------
// Pomerania: Greifenhagen, Pyritz, Reetz, Dramburg, Neustettin, Buetow, Lauenburg.
// Brandenburg (Neumark): Schwedt, Koenigsberg in der Neumark, Arnswalde. West Prussia:
// Deutsch Krone, Flatow, Hammerstein, Konitz, Putzig. The polygon is the Pomeranian side;
// its western part repeats the Uckermark line of correction 9.
partition(
  "Pomerania southern border",
  [
    [12.30, 54.90], [12.30, 53.95], [13.30, 53.70], [13.45, 53.62], [13.62, 53.56], [13.80, 53.50],
    [13.95, 53.45], [14.25, 53.43], [14.35, 53.15], [14.60, 53.12], [14.90, 53.05], [15.20, 53.10],
    [15.45, 53.20], [15.65, 53.35], [15.95, 53.45], [16.20, 53.55], [16.45, 53.55], [16.70, 53.62],
    [16.95, 53.75], [17.20, 53.85], [17.40, 54.00], [17.55, 54.10], [17.70, 54.30], [17.85, 54.45],
    [17.95, 54.62], [18.00, 54.90],
  ],
  ["deu-pomerania"],
  // Not Posen: the strip south of this line was the Neumark (Arnswalde) and West
  // Prussia (Deutsch Krone, Flatow), whatever the M12 ruler lines touch.
  ["deu-brandenburg", "deu-brandenburg-lebus", "deu-west-prussia"],
);

// ---- 11. Baden and Wuerttemberg ---------------------------------------------------------------
// Baden: Wertheim, Tauberbischofsheim, Mosbach, Eppingen, Bretten, Pforzheim, Gernsbach,
// Hornberg, St. Georgen, Villingen, Engen, Ueberlingen, Konstanz. Wuerttemberg: Mergentheim,
// Moeckmuehl, Heilbronn, Brackenheim, Maulbronn, Calw, Herrenalb, Freudenstadt, Schramberg,
// Schwenningen, Tuttlingen, Friedrichshafen. The polygon is the Baden side.
partition(
  "Baden-Wuerttemberg border",
  [
    [7.50, 49.80], [9.55, 49.80], [9.65, 49.75], [9.78, 49.62], [9.75, 49.50], [9.60, 49.42],
    [9.38, 49.32], [9.15, 49.25], [8.97, 49.15], [8.83, 49.04], [8.76, 48.90], [8.58, 48.82],
    [8.43, 48.74], [8.34, 48.58], [8.32, 48.44], [8.36, 48.30], [8.44, 48.13], [8.58, 47.97],
    [8.76, 47.92], [8.92, 47.85], [9.05, 47.80], [9.22, 47.72], [9.36, 47.70], [9.40, 47.55],
    [7.50, 47.50],
  ],
  ["deu-baden"],
  ["deu-wurttemberg"],
);

// ---- 12. Posen and West Prussia (run last: it overrides the strips moved by 9 and 10) -------------------------------------------------------
// Posen held Schneidemuehl, Wirsitz, Nakel, Bromberg, Koronowo and Fordon; West Prussia
// held Deutsch Krone, Flatow, Schwetz, Kulm and Thorn. The polygon is the Posen side.
partition(
  "Posen-West Prussia border",
  [
    [15.95, 53.05], [16.30, 53.12], [16.60, 53.20], [16.90, 53.25], [17.20, 53.27], [17.50, 53.30],
    [17.80, 53.38], [18.10, 53.32], [18.30, 53.22], [18.50, 53.06], [18.60, 52.98], [18.80, 52.94],
    [19.20, 52.90], [19.20, 51.05],
    // South and west: Kempen, Krotoschin, Rawitsch, Lissa, Fraustadt, Bomst, Meseritz,
    // Schwerin an der Warthe and Filehne in Posen; Militsch (Silesia), Schwiebus and
    // Driesen (Brandenburg) outside.
    [18.10, 51.10], [17.85, 51.20], [17.80, 51.40], [17.55, 51.55], [17.25, 51.62], [16.95, 51.55],
    [16.65, 51.62], [16.35, 51.72], [16.05, 51.80], [15.85, 51.98], [15.70, 52.15], [15.65, 52.30],
    [15.45, 52.40], [15.40, 52.60], [15.55, 52.75], [15.85, 52.85], [16.05, 52.95],
  ],
  ["deu-posen"],
  [
    "deu-west-prussia",
    "deu-pomerania",
    "deu-brandenburg-lebus",
    "deu-brandenburg",
    "deu-lower-silesia",
    "deu-middle-silesia",
  ],
);

// ---- 13. Dissolve the German and Austro-Hungarian coverage residuals -----------------------
// The M12e residuals fill gaps the continental build left (they caused the ruler line
// north of Posen). Every residual piece that shares a border with a real province of the
// same country joins the one it shares the most with; isolated pieces stay.
for (const [residualKey, tag] of [["oc-gap-deu-residual", "DEU"], ["oc-gap-aut-residual", "AUT"]]) {
  const owners = allProvinces
    .filter((province) => province.initialOwnerTag === tag && province.key !== residualKey)
    .map((province) => province.key);
  const kept = [];
  for (const part of get(residualKey)) {
    // Straight construction edges carry only corner vertices, so one shared vertex or a
    // boundary within 0.02 degrees of the piece centroid counts as touching.
    const { key, shared, distance } = nearestWithShare([part], owners);
    if (key === null || (shared < 1 && distance > 0.02)) {
      kept.push(part);
      continue;
    }
    set(key, safe("union", get(key), [part]));
    report.push({
      correction: "coverage residual dissolved",
      from: residualKey,
      to: key,
      areaSqDeg: Number(multiArea([part]).toFixed(4)),
      bbox: bboxOf([part]).map((value) => Number(value.toFixed(2))),
    });
  }
  set(residualKey, kept);
  if (kept.length === 0) report.push({ correction: "coverage residual fully dissolved", target: residualKey });
}

// ---- 14. Rheinhessen ------------------------------------------------------------------------
// The Hessian province of Rheinhessen: Mainz, Bingen, Alzey, Worms, Oppenheim; west of it
// Bad Kreuznach and Kirn were Prussian.
annex(
  "Rheinhessen",
  [
    [7.88, 49.97], [8.00, 50.00], [8.25, 50.03], [8.35, 49.95], [8.45, 49.75], [8.48, 49.55],
    [8.25, 49.60], [8.10, 49.68], [7.95, 49.72], [7.85, 49.80],
  ],
  "deu-hesse",
  ["deu-rhine-province", "deu-palatinate"],
);

// ---- 15. Mecklenburg-Strelitz ----------------------------------------------------------------
// Neustrelitz, Neubrandenburg, Woldegk and Fuerstenberg were Mecklenburg-Strelitz, not
// Brandenburg or Pomerania.
annex(
  "Mecklenburg-Strelitz",
  [
    [12.65, 53.20], [12.85, 53.16], [13.15, 53.12], [13.35, 53.20], [13.55, 53.35], [13.75, 53.48],
    [13.62, 53.56], [13.45, 53.62], [13.30, 53.70], [13.15, 53.80], [12.95, 53.75], [12.75, 53.55],
    [12.65, 53.35],
  ],
  "deu-mecklenburg",
  ["deu-brandenburg", "deu-pomerania"],
);

// ---- 15b. Fiume ----------------------------------------------------------------------------
// The Corpus Separatum of Fiume was the city and its immediate surroundings, about 21 km2
// (Fiume/Rijeka 14.44, 45.33; Susak across the Recina was Croatian). The M12 box covered
// Volosko and part of the Croatian hinterland.
merge("aut-fiume", "aut-croatia-proper");
carve(
  "Fiume",
  [[14.38, 45.33], [14.41, 45.36], [14.46, 45.37], [14.50, 45.35], [14.47, 45.31], [14.42, 45.31]],
  "aut-fiume",
  ["aut-croatia-proper", "aut-istria", "aut-carniola"],
);

// ---- 15c. Prussian-Austrian Silesian border ---------------------------------------------------
// Prussian: Ziegenhals, Leobschuetz, Ratibor, Hultschin, Pless, Neu-Berun, Myslowitz.
// Austrian: Zuckmantel, Jaegerndorf, Troppau, Maehrisch Ostrau, Oderberg, Strumien,
// Oswiecim. The line follows the Opava, the Oder at Oderberg, the Olza and the Vistula,
// then the Przemsza to the Three Emperors' Corner. The polygon is the Prussian side; it
// closes north through Russian Poland, which is in neither list.
partition(
  "Silesian border",
  [
    // West: the north edge of Austrian Silesia (Weidenau, Javornik Austrian; Neisse,
    // Patschkau Prussian) and the Glatz county (Mittelwalde Prussian) against Moravia and
    // Bohemia; the polygon then opens north and west over Prussian Silesia and Bohemia,
    // which is in neither list.
    [15.50, 52.50], [15.50, 50.60], [16.20, 50.40], [16.40, 50.20], [16.55, 50.13], [16.70, 50.15],
    [16.80, 50.20], [16.88, 50.30], [16.90, 50.40], [17.00, 50.42], [17.15, 50.40], [17.30, 50.36],
    [17.40, 50.27], [17.55, 50.20], [17.70, 50.13], [17.82, 50.03], [17.92, 49.97],
    [18.02, 49.93], [18.12, 49.89], [18.22, 49.87], [18.30, 49.88], [18.36, 49.93], [18.42, 49.97],
    [18.55, 49.98], [18.65, 49.97], [18.78, 49.94], [18.92, 49.93], [19.05, 49.96], [19.15, 50.01],
    [19.20, 50.07], [19.19, 50.15], [19.19, 50.23], [19.19, 52.50],
  ],
  ["deu-upper-silesia", "deu-middle-silesia", "aut-hultschin"],
  ["aut-austrian-silesia", "aut-moravia", "aut-cieszyn-silesia", "aut-western-galicia"],
);

// ---- 15d. Danish-German border of 1864 -------------------------------------------------------
// German: Roemoe, Toender, Hadersleben, Christiansfeld, Als (Sonderburg). Danish: Fanoe,
// Ribe and its parishes south of the Kongeaa, Kolding, Aeroe. The line follows the
// Kongeaa from the North Sea round the Ribe bulge to the Kolding fjord. The polygon is the
// German side; Aeroe lies east of it.
partition(
  "Danish-German border",
  [
    [8.00, 55.25], [8.55, 55.25], [8.65, 55.24], [8.80, 55.22], [8.95, 55.30], [9.00, 55.42],
    [9.15, 55.47], [9.30, 55.47], [9.45, 55.45], [9.58, 55.47], [9.70, 55.48],
    // The Little Belt (Funen Danish), round Als (German) and west of Aeroe, then south and
    // east far enough to keep all of Holstein and Fehmarn on the German side.
    [9.72, 55.35], [9.78, 55.20], [9.88, 55.10], [10.15, 55.05], [10.12, 54.85], [10.50, 54.65],
    [11.50, 54.65], [11.50, 53.00], [8.00, 53.00],
  ],
  ["deu-north-schleswig", "deu-schleswig-holstein"],
  ["dnk-south-jutland"],
);

// ---- 16. Eupen-Malmedy again, after the residual box joined it --------------------------------
merge("deu-eupen-malmedy", "deu-rhine-province");
carve(
  "Eupen-Malmedy (after residuals)",
  [
    [5.95, 50.76], [6.10, 50.73], [6.20, 50.64], [6.27, 50.52], [6.38, 50.36], [6.40, 50.25],
    [6.30, 50.13], [6.15, 50.12], [6.03, 50.17], [5.97, 50.30], [5.92, 50.45], [5.97, 50.56],
    [5.93, 50.68],
  ],
  "deu-eupen-malmedy",
  ["deu-rhine-province"],
);

// ---- 17. Interior gaps ---------------------------------------------------------------------------
// The clipping operations can leave thin unassigned slivers between provinces. Any gap
// inside a region box that does not touch the box edge (so it is not sea) and is smaller
// than 0.05 square degrees joins the province it shares the most border with.
function fillGaps(name, box) {
  const [x0, y0, x1, y1] = box;
  const shape = polygon([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
  const keys = [...geometry.keys()].filter((key) => {
    const multi = geometry.get(key);
    if (multi.length === 0) return false;
    const [a0, b0, a1, b1] = bboxOf(multi);
    return !(a0 > x1 || a1 < x0 || b0 > y1 || b1 < y0);
  });
  let covered = [];
  for (const key of keys) covered = covered.length === 0 ? get(key) : safe("union", covered, get(key));
  const gaps = safe("difference", shape, covered);
  for (const gap of gaps) {
    const [g0, h0, g1, h1] = bboxOf([gap]);
    const edge = 1e-6;
    if (g0 <= x0 + edge || g1 >= x1 - edge || h0 <= y0 + edge || h1 >= y1 - edge) continue;
    const area = multiArea([gap]);
    if (area > 0.05 || area < 1e-7) continue;
    const { key, shared } = nearestWithShare([gap], keys);
    if (key === null || shared < 1) continue;
    set(key, safe("union", get(key), [gap]));
    report.push({ correction: name, to: key, areaSqDeg: Number(area.toFixed(5)), bbox: [g0, h0, g1, h1].map((v) => Number(v.toFixed(2))) });
  }
}
fillGaps("gap filled (Silesia)", [16.3, 49.4, 19.7, 51.6]);
fillGaps("gap filled (Russian frontier)", [17.0, 49.6, 24.5, 55.9]);
fillGaps("gap filled (Schleswig)", [7.9, 54.3, 10.6, 55.7]);

// ---- write ------------------------------------------------------------------------------
const emptied = [];
for (const key of changed) {
  let multi = geometry.get(key);
  if (multi.length === 0) {
    // Only a fully dissolved coverage residual may end empty; it is removed below.
    if (!key.startsWith("oc-gap-")) throw new Error(`${key} lost all of its territory`);
    emptied.push(key);
    continue;
  }
  // Merge touching parts so a province carries no internal seams.
  multi = safe("union", multi);
  refresh(byKey.get(key), multi);
}
for (const { data } of bundles) {
  const ids = new Set(data.provinces.filter((province) => emptied.includes(province.key)).map((province) => province.id));
  if (ids.size === 0) continue;
  data.provinces = data.provinces.filter((province) => !ids.has(province.id));
  data.borders = data.borders.filter((border) => !ids.has(border.a) && !ids.has(border.b));
}
if (emptied.length > 0) console.log(`removed fully dissolved residuals: ${emptied.join(", ")}`);
for (const { file, data } of bundles) writeFileSync(join(MAP_DIR, file), JSON.stringify(data));
writeFileSync(join(MAP_DIR, "province_border_corrections_1900.json"), `${JSON.stringify(report, null, 1)}\n`);
console.log(`changed ${changed.size} provinces`);
for (const entry of report) console.log(JSON.stringify(entry));

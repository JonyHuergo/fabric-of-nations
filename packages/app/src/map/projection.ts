/**
 * The single map projection: James Gall's stereographic cylindrical (1855).
 *
 * Chosen over the former Miller cylindrical for a Europe-centred strategy map:
 * it stays cylindrical, so the world wraps horizontally with an exact linear
 * longitude, while standard parallels at 45 degrees keep Europe and North
 * America close to their true shapes (at 50N the east-west/north-south stretch
 * is 1.06, against 1.19 for Miller) and inflate the high Arctic less. The cost is
 * a roughly 20% north-south stretch at the equator. It is also period
 * appropriate: atlases of the 1900 era used it for world maps.
 *
 * Map units: x runs 0..MAP_WIDTH from 180W eastward, y runs 0..MAP_HEIGHT
 * southward from MAP_NORTH_LAT. `scripts/map/build-render-bundle.mjs` compiles
 * rasters with the same constants and a test compares the two.
 */

export const MAP_WIDTH = 1000;
export const MAP_NORTH_LAT = 84;
export const MAP_SOUTH_LAT = -78;

const GALL_C = 1 + Math.SQRT2 / 2;
const GALL_K = (MAP_WIDTH * Math.SQRT2) / (2 * Math.PI);

function gallY(latitude: number): number {
  return GALL_C * Math.tan((latitude * Math.PI) / 360) * GALL_K;
}

const Y_NORTH = gallY(MAP_NORTH_LAT);

export const MAP_HEIGHT = Y_NORTH - gallY(MAP_SOUTH_LAT);

/** Map-unit x of a longitude; longitudes beyond +-180 stay on the same line. */
export function projectLon(longitude: number): number {
  return ((longitude + 180) / 360) * MAP_WIDTH;
}

/** Map-unit y of a latitude. */
export function projectLat(latitude: number): number {
  return Y_NORTH - gallY(latitude);
}

export function unprojectX(x: number): number {
  return (x / MAP_WIDTH) * 360 - 180;
}

export function unprojectY(y: number): number {
  return (Math.atan((Y_NORTH - y) / GALL_K / GALL_C) * 360) / Math.PI;
}

/** Map units per degree of longitude, the one axis with a constant scale. */
export const MAP_UNITS_PER_DEGREE = MAP_WIDTH / 360;

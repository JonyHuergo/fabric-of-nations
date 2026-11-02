/**
 * Province rings for the SVG fallback on the web. Native builds resolve
 * `provinceGeometry.native.ts` instead, which keeps the rings out of the phone's
 * JavaScript bundle: the atlas page already carries the shapes it draws.
 */
export { PROVINCE_MAP_1900 as FALLBACK_PROVINCE_MAP } from "../provinceMapBundle";

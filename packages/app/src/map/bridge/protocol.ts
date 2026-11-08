/**
 * The bridge between the React Native interface and the map runtime.
 *
 * Camera movement and gestures stay inside the runtime, so nothing here is sent
 * per frame. The interface sends selection, ownership changes, lenses, era and
 * insets; the runtime answers with presses and hover changes. Everything is plain
 * JSON. Messages from the other side are parsed by the validators below, so a
 * malformed message is rejected at the boundary instead of reaching the engine.
 *
 * This is presentation state only: nothing here enters the simulation.
 */

import { ERA_ORDER, type EraId } from "../../design/tokens";
import type { ReservedBox } from "../labels";
import type { MapModeId } from "../mapModes";

/** 2: P2 province lens values in every state change. 3: P5 harvest lens value. 4: P6 crowding lens value. */
export const MAP_PROTOCOL_VERSION = 4;

export const MAP_LENS_IDS: readonly MapModeId[] = [
  "political",
  "control",
  "markets",
  "density",
  "urban",
  "literacy",
  "unrest",
  "harvest",
  "crowding",
];

/** Fastest backdrop rotation the runtime accepts, in degrees of longitude per second. */
export const MAX_DRIFT_DEGREES_PER_SECOND = 30;

/**
 * [province index, owner tag, controller tag, unit tag, market id, density per km²,
 * urban share, literacy, unrest, harvest, crowding]; the six lens values are null without data.
 */
export type ProvinceStateChange = readonly [
  number,
  string,
  string,
  string,
  number | null,
  number | null,
  number | null,
  number | null,
  number | null,
  number | null,
  number | null,
];

export type MapCommand =
  | { readonly type: "set-theme"; readonly eraId: EraId; readonly immediate: boolean }
  | { readonly type: "set-lens"; readonly lens: MapModeId; readonly highlightMarketId: number | null }
  | { readonly type: "set-states"; readonly changes: readonly ProvinceStateChange[] }
  | {
      readonly type: "set-selection";
      readonly selectedTag: string | null;
      readonly playerTag: string | null;
      readonly selectedProvinceIndex: number | null;
    }
  | {
      readonly type: "set-insets";
      readonly left: number;
      readonly right: number;
      readonly reserved: readonly ReservedBox[];
    }
  | { readonly type: "focus-unit"; readonly tag: string; readonly immediate: boolean }
  | { readonly type: "focus-province"; readonly index: number }
  | { readonly type: "zoom"; readonly direction: "in" | "out" }
  | { readonly type: "reset-view" }
  /**
   * Turn the world slowly under a still camera, as the main menu's backdrop does.
   * Positive moves the map to the right, the way the Earth turns seen from above.
   * While it turns the labels are put away; 0 stops it and returns to the home view.
   */
  | { readonly type: "set-drift"; readonly degreesPerSecond: number };

export type MapEvent =
  /** The runtime has drawn; commands may flow. */
  | { readonly type: "ready" }
  /** The map cannot run here; the host shows the SVG fallback. */
  | { readonly type: "unavailable"; readonly reason: string }
  /** The GPU context was lost; the host reloads the page. */
  | { readonly type: "context-lost" }
  | { readonly type: "province-press"; readonly index: number; readonly x: number; readonly y: number }
  | { readonly type: "sea-press" }
  /** Mouse only. Nothing depends on it. */
  | { readonly type: "hover"; readonly index: number | null; readonly x: number; readonly y: number };

export interface MapEnvelope<T> {
  readonly v: typeof MAP_PROTOCOL_VERSION;
  readonly body: T;
}

export function encodeMapMessage<T>(body: T): string {
  return JSON.stringify({ v: MAP_PROTOCOL_VERSION, body } satisfies MapEnvelope<T>);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const isIndex = (value: unknown): value is number =>
  isFiniteNumber(value) && Number.isInteger(value) && value >= 0;
const isTagOrNull = (value: unknown): value is string | null =>
  value === null || typeof value === "string";

function isReservedBox(value: unknown): value is ReservedBox {
  return (
    isRecord(value) &&
    isFiniteNumber(value["left"]) &&
    isFiniteNumber(value["top"]) &&
    isFiniteNumber(value["width"]) &&
    isFiniteNumber(value["height"])
  );
}

function isStateChange(value: unknown): value is ProvinceStateChange {
  return (
    Array.isArray(value) &&
    value.length === 11 &&
    isIndex(value[0]) &&
    typeof value[1] === "string" &&
    typeof value[2] === "string" &&
    typeof value[3] === "string" &&
    (value[4] === null || isIndex(value[4])) &&
    [value[5], value[6], value[7], value[8], value[9], value[10]].every((entry) => entry === null || isFiniteNumber(entry))
  );
}

function unwrap(raw: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(raw);
  if (!isRecord(parsed) || parsed["v"] !== MAP_PROTOCOL_VERSION || !isRecord(parsed["body"])) {
    throw new Error("map bridge: malformed envelope");
  }
  return parsed["body"];
}

/** Validate a command arriving in the runtime. Throws on anything else. */
export function parseMapCommand(raw: string): MapCommand {
  const body = unwrap(raw);
  switch (body["type"]) {
    case "set-theme":
      if (ERA_ORDER.includes(body["eraId"] as EraId) && typeof body["immediate"] === "boolean") {
        return body as unknown as MapCommand;
      }
      break;
    case "set-lens":
      if (
        MAP_LENS_IDS.includes(body["lens"] as MapModeId) &&
        (body["highlightMarketId"] === null || isIndex(body["highlightMarketId"]))
      ) {
        return body as unknown as MapCommand;
      }
      break;
    case "set-states":
      if (Array.isArray(body["changes"]) && body["changes"].every(isStateChange)) {
        return body as unknown as MapCommand;
      }
      break;
    case "set-selection":
      if (
        isTagOrNull(body["selectedTag"]) &&
        isTagOrNull(body["playerTag"]) &&
        (body["selectedProvinceIndex"] === null || isIndex(body["selectedProvinceIndex"]))
      ) {
        return body as unknown as MapCommand;
      }
      break;
    case "set-insets":
      if (
        isFiniteNumber(body["left"]) &&
        isFiniteNumber(body["right"]) &&
        Array.isArray(body["reserved"]) &&
        body["reserved"].every(isReservedBox)
      ) {
        return body as unknown as MapCommand;
      }
      break;
    case "focus-unit":
      if (typeof body["tag"] === "string" && typeof body["immediate"] === "boolean") {
        return body as unknown as MapCommand;
      }
      break;
    case "focus-province":
      if (isIndex(body["index"])) return body as unknown as MapCommand;
      break;
    case "zoom":
      if (body["direction"] === "in" || body["direction"] === "out") {
        return body as unknown as MapCommand;
      }
      break;
    case "reset-view":
      return body as unknown as MapCommand;
    case "set-drift":
      if (
        isFiniteNumber(body["degreesPerSecond"]) &&
        Math.abs(body["degreesPerSecond"]) <= MAX_DRIFT_DEGREES_PER_SECOND
      ) {
        return body as unknown as MapCommand;
      }
      break;
    default:
      break;
  }
  throw new Error(`map bridge: invalid command ${String(body["type"])}`);
}

/** Validate an event arriving in the interface. Throws on anything else. */
export function parseMapEvent(raw: string): MapEvent {
  const body = unwrap(raw);
  switch (body["type"]) {
    case "ready":
    case "context-lost":
    case "sea-press":
      return body as unknown as MapEvent;
    case "unavailable":
      if (typeof body["reason"] === "string") return body as unknown as MapEvent;
      break;
    case "province-press":
      if (isIndex(body["index"]) && isFiniteNumber(body["x"]) && isFiniteNumber(body["y"])) {
        return body as unknown as MapEvent;
      }
      break;
    case "hover":
      if (
        (body["index"] === null || isIndex(body["index"])) &&
        isFiniteNumber(body["x"]) &&
        isFiniteNumber(body["y"])
      ) {
        return body as unknown as MapEvent;
      }
      break;
    default:
      break;
  }
  throw new Error(`map bridge: invalid event ${String(body["type"])}`);
}

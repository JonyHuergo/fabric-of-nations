/**
 * The map runtime: the page that runs the map on every platform. iOS and Android
 * load it in a WebView; the web build loads it in an iframe, so development always
 * exercises the artifact a phone receives. `scripts/map/build-atlas.mjs` bundles
 * this file and its assets into the single page `public/map/atlas-v1.html`.
 *
 * All payloads are inline, so the page needs no file access and no network, and
 * its Content-Security-Policy forbids both.
 */

import {
  MAP_PROTOCOL_VERSION,
  encodeMapMessage,
  parseMapCommand,
  type MapCommand,
  type MapEvent,
} from "../bridge/protocol";
import { MapEngine, supportsMapEngine, type MapEngineAssets, type MapInsets } from "../mapEngine";
import {
  MAP_MODES,
  buildProvinceStates,
  type MapDataContext,
  type MapModeId,
  type ProvinceState,
} from "../mapModes";
import type { RenderBundle } from "../renderBundle";
import type { MapRuntimeCatalog } from "../runtimeCatalog";
import { FONTS, type EraId } from "../../design/tokens";
import { base64ToBytes, decodeBundle } from "./decodeBundle";

interface NativeBridge {
  postMessage(message: string): void;
}

interface RuntimeWindow extends Window {
  ReactNativeWebView?: NativeBridge;
  /** Native delivers commands through injected script calling this. */
  __fonMapReceive?: (message: string) => void;
  /** A read-only inspection seam for the runtime verification scripts. */
  __mapEngine?: MapEngine;
}

const page = window as unknown as RuntimeWindow;

function emit(event: MapEvent): void {
  const message = encodeMapMessage(event);
  if (page.ReactNativeWebView !== undefined) page.ReactNativeWebView.postMessage(message);
  else window.parent.postMessage({ fonMap: message }, "*");
}

/** An inline payload, removed from the page so its text can be collected. */
function takePayload(id: string): string {
  const node = document.getElementById(id);
  if (node === null) throw new Error(`atlas page is missing ${id}`);
  const text = node.textContent ?? "";
  node.remove();
  return text;
}

/** A worker that has said nothing by now is not going to. */
const DECODE_WORKER_TIMEOUT_MS = 20_000;

function decodeOffMainThread(base64: string, workerSource: string): Promise<RenderBundle> {
  return new Promise((resolve, reject) => {
    // A page the system will not let run a worker still gets its map.
    const onThisThread = (): void => {
      decodeBundle(base64).then(resolve, reject);
    };
    let worker: Worker;
    try {
      worker = new Worker(URL.createObjectURL(new Blob([workerSource], { type: "text/javascript" })));
    } catch {
      onThisThread();
      return;
    }
    const watchdog = setTimeout(() => {
      worker.terminate();
      onThisThread();
    }, DECODE_WORKER_TIMEOUT_MS);
    worker.onerror = () => {
      clearTimeout(watchdog);
      worker.terminate();
      onThisThread();
    };
    worker.onmessage = (event: MessageEvent<{ bundle?: RenderBundle; error?: string }>) => {
      clearTimeout(watchdog);
      worker.terminate();
      if (event.data.bundle === undefined) reject(new Error(event.data.error ?? "bundle decode failed"));
      else resolve(event.data.bundle);
    };
    worker.postMessage(base64);
  });
}

/** Decode a raster off the main thread where the system can. */
async function decodeTexture(base64: string): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    const blob = new Blob([base64ToBytes(base64) as BlobPart], { type: "image/jpeg" });
    try {
      return await createImageBitmap(blob);
    } catch {
      // Fall through to the element path below.
    }
  }
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("could not decode a map raster"));
    image.src = `data:image/jpeg;base64,${base64}`;
  });
}

async function fontsReady(): Promise<void> {
  await Promise.all([
    document.fonts.load(`13px ${FONTS.sansMedium}`, "ATLAS"),
    document.fonts.load(`13px ${FONTS.sansSemiBold}`, "ATLAS"),
  ]);
}

/** Holds the latest of everything the host has said, and feeds the engine. */
class MapController {
  private lens: MapModeId = "political";
  private highlightMarketId: number | null = null;
  private selectedTag: string | null = null;
  private playerTag: string | null = null;
  private selectedProvinceIndex: number | null = null;
  private states: ProvinceState[];
  private readonly entryByTag: MapDataContext["entryByTag"];

  constructor(
    private readonly engine: MapEngine,
    private readonly catalog: MapRuntimeCatalog,
  ) {
    this.states = [...buildProvinceStates(catalog, catalog, null)];
    this.entryByTag = new Map(catalog.entries.map((entry) => [entry.tag, entry] as const));
  }

  stateAt(index: number): ProvinceState | undefined {
    return this.states[index];
  }

  private apply(): void {
    const context: MapDataContext = {
      provinces: this.catalog.provinces,
      states: this.states,
      entryByTag: this.entryByTag,
      // Names belong to the legend, which the interface draws.
      marketNames: new Map(),
      highlightMarketId: this.highlightMarketId,
    };
    this.engine.setData({
      mode: MAP_MODES[this.lens],
      context,
      selectedTag: this.selectedTag,
      playerTag: this.playerTag,
      selectedProvinceIndex: this.selectedProvinceIndex,
    });
  }

  flush(): void {
    this.apply();
  }

  handle(command: MapCommand): void {
    switch (command.type) {
      case "set-theme":
        this.engine.setTheme(command.eraId as EraId, command.immediate);
        return;
      case "set-lens":
        this.lens = command.lens;
        this.highlightMarketId = command.highlightMarketId;
        this.apply();
        return;
      case "set-states": {
        const next = [...this.states];
        for (const [index, ownerTag, controllerTag, unitTag, marketId, densityPerKm2, urbanShare, literacy, unrest, harvest, crowding] of command.changes) {
          if (index < next.length) {
            next[index] = { ownerTag, controllerTag, unitTag, marketId, densityPerKm2, urbanShare, literacy, unrest, harvest, crowding };
          }
        }
        this.states = next;
        this.apply();
        return;
      }
      case "set-selection":
        this.selectedTag = command.selectedTag;
        this.playerTag = command.playerTag;
        this.selectedProvinceIndex = command.selectedProvinceIndex;
        this.apply();
        return;
      case "set-insets": {
        const insets: MapInsets = { left: command.left, right: command.right, reserved: command.reserved };
        this.engine.setInsets(insets);
        return;
      }
      case "focus-unit":
        this.engine.focusUnit(command.tag, command.immediate);
        return;
      case "focus-province":
        this.engine.focusProvince(command.index);
        return;
      case "zoom":
        if (command.direction === "in") this.engine.zoomIn();
        else this.engine.zoomOut();
        return;
      case "reset-view":
        this.engine.resetView();
        return;
      case "set-drift":
        this.engine.setDrift(command.degreesPerSecond);
        return;
      default:
        return;
    }
  }
}

async function main(): Promise<void> {
  if (!supportsMapEngine()) {
    emit({ type: "unavailable", reason: "This device has no hardware WebGL2." });
    return;
  }
  const catalog = JSON.parse(takePayload("fon-catalog")) as MapRuntimeCatalog;
  const bundleBase64 = takePayload("fon-bundle");
  const workerSource = takePayload("fon-decode-worker");
  const textures = { relief: takePayload("fon-relief"), ocean: takePayload("fon-ocean") };
  const assets: MapEngineAssets = {
    loadBundle: () => decodeOffMainThread(bundleBase64, workerSource),
    loadTexture: (kind) => decodeTexture(textures[kind]),
  };
  const surface = document.getElementById("map");
  if (surface === null) throw new Error("atlas page has no map surface");

  // Commands can arrive while the bundle decodes; they apply in order afterwards.
  const queue: MapCommand[] = [];
  let controller: MapController | null = null;
  const receive = (message: string): void => {
    const command = parseMapCommand(message);
    if (controller === null) queue.push(command);
    else controller.handle(command);
  };
  page.__fonMapReceive = receive;
  window.addEventListener("message", (event: MessageEvent<unknown>) => {
    const data = event.data as { fonMap?: unknown } | null;
    if (typeof data?.fonMap === "string") receive(data.fonMap);
  });

  const engine = new MapEngine(surface, catalog, assets, {
    onHoverChange: (index, x, y) => emit({ type: "hover", index, x, y }),
    onProvincePress: (index, x, y) => emit({ type: "province-press", index, x, y }),
    onSeaPress: () => emit({ type: "sea-press" }),
    onContextLost: () => emit({ type: "context-lost" }),
  });
  page.__mapEngine = engine;
  // Labels are worth waiting for, but never worth losing the map over.
  await fontsReady().catch(() => undefined);
  await engine.start();
  const ready = new MapController(engine, catalog);
  ready.flush();
  for (const command of queue.splice(0)) ready.handle(command);
  controller = ready;
  emit({ type: "ready" });
}

window.addEventListener("error", (event) => {
  emit({ type: "unavailable", reason: event.message });
});

main().catch((error: unknown) => {
  emit({ type: "unavailable", reason: error instanceof Error ? error.message : String(error) });
});

export { MAP_PROTOCOL_VERSION };

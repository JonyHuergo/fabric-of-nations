/**
 * The interactive map: owns the canvases, camera, input, picking and frame loop.
 * It runs inside the map runtime page, so gestures and camera movement never
 * cross a bridge. The host hears only about presses and hover changes.
 *
 * Nothing is drawn unless something changed: `requestFrame` is called by input,
 * data and animations, and an idle map costs nothing.
 */

import {
  ERA_THEMES,
  ERA_TRANSITION_MS,
  FONTS,
  MOUSE_PICK_RADIUS,
  TOUCH_PICK_RADIUS,
  blendMapTokens,
  resolveEra,
  rgbToCss,
  rgbaToCss,
  zoomLevelForScale,
  type EraId,
  type MapTokens,
  type MapZoomLevel,
} from "../design/tokens";
import {
  cameraForBounds,
  clampCamera,
  minimumScale,
  panCamera,
  screenToWorld,
  shortestDeltaX,
  smoothingAlpha,
  worldToScreen,
  CAMERA_MAX_SCALE,
  wrapX,
  zoomCameraAt,
  type Camera,
  type MapBounds,
  type MapViewportSize,
} from "./camera";
import { MapGlRenderer } from "./glRenderer";
import { createMeshHitIndex, type ProvinceHitIndex } from "./hitTest";
import {
  placeLabels,
  seaLabels,
  type LabelInputs,
  type PlacedLabel,
  type PointLabel,
  type ReservedBox,
} from "./labels";
import {
  STYLE_FLAG_DIMMED,
  STYLE_FLAG_HOVER,
  STYLE_FLAG_SELECTED_PROVINCE,
  buildProvinceStyleTable,
  selectionFlags,
  type MapDataContext,
  type MapMode,
  type ProvinceState,
  type ProvinceStyleTable,
} from "./mapModes";
import { paintLabels } from "./labelPainter";
import { levelOfDetail, mapPalette } from "./mapStyle";
import { politicalColor, type Rgb } from "./politicalPalette";
import { buildUnitLabels, neighbourPairs } from "./unitLabels";
import { MAP_HEIGHT, MAP_WIDTH, projectLat, projectLon, unprojectX, unprojectY } from "./projection";
import type { RenderBundle } from "./renderBundle";
import type { MapRuntimeCatalog } from "./runtimeCatalog";

/** Pointer travel, in CSS pixels, separating a tap from a drag. */
const DRAG_THRESHOLD = 4;
/** A fingertip wobbles further than a mouse while tapping. */
const TOUCH_DRAG_THRESHOLD = 9;
/** Holding this long without moving opens the loupe. */
const LONG_PRESS_MS = 360;
const DOUBLE_TAP_MS = 320;
const DOUBLE_TAP_DISTANCE = 30;
const LOUPE_SIZE = 132;
const LOUPE_ZOOM = 3;
/** The loupe sits above the finger, so the finger never hides what it picks. */
const LOUPE_OFFSET = 104;
/** The top interface controls; a loupe that would reach them opens below instead. */
const LOUPE_TOP_CLEARANCE = 60;
const WHEEL_SENSITIVITY = 0.0016;
const PINCH_WHEEL_SENSITIVITY = 0.008;
const ZOOM_TIME_CONSTANT_MS = 70;
const FLIGHT_MS = 520;
const INERTIA_DECAY_MS = 190;
const INERTIA_MIN_SPEED = 0.03;
/** Panning this far re-places labels; less just translates the overlay. */
const LABEL_REPLACE_PAN_PX = 90;
const BUTTON_ZOOM = 1.6;
const KEY_PAN_PX = 90;
/** Framing a tiny state stops here rather than at the maximum zoom. */
const FOCUS_MAX_SCALE = 22;
/** Map units squared below which a unit keeps a locating dot at strategic zoom. */
const SMALL_UNIT_AREA = 1.4;
/** A turning backdrop sits this much closer than the whole-world view... */
const DRIFT_ZOOM = 1.22;
/** ...and centred on this latitude, where most of the land is. */
const DRIFT_CENTRE_LAT = 26;
/** Labels fade out of, and back into, a turning backdrop over this long. */
const DRIFT_LABEL_FADE_MS = 700;

export interface MapHoverEvent {
  readonly provinceIndex: number;
  readonly x: number;
  readonly y: number;
}

export interface MapEngineCallbacks {
  /** Fired only when the hovered province changes; mouse only. */
  readonly onHoverChange: (provinceIndex: number | null, x: number, y: number) => void;
  /** `x` and `y` are where the press landed, in map-surface pixels. */
  readonly onProvincePress: (provinceIndex: number, x: number, y: number) => void;
  readonly onSeaPress: () => void;
  /** The GPU context is gone; the host reloads the page. */
  readonly onContextLost: () => void;
}

export interface MapEngineData {
  readonly mode: MapMode;
  readonly context: MapDataContext;
  readonly selectedTag: string | null;
  readonly playerTag: string | null;
  readonly selectedProvinceIndex: number | null;
}

/** Where the runtime gets its heavy assets; the textures are optional extras. */
export interface MapEngineAssets {
  readonly loadBundle: () => Promise<RenderBundle>;
  readonly loadTexture: (kind: "relief" | "ocean") => Promise<ImageBitmap | HTMLImageElement>;
}

export interface MapInsets {
  readonly left: number;
  readonly right: number;
  /** Interface controls over the map; labels stay out of them. */
  readonly reserved: readonly ReservedBox[];
}

export interface MapEngineStats {
  readonly frames: number;
  readonly lastFrameMs: number;
  readonly frameTimes: readonly number[];
  readonly pickCount: number;
  readonly pickMs: number;
  readonly drawCalls: number;
  readonly styleUploads: number;
  readonly labelPlacements: number;
}

interface PointerRecord {
  x: number;
  y: number;
}

interface Flight {
  readonly from: Camera;
  readonly to: Camera;
  elapsed: number;
}

interface ThemeFade {
  readonly from: MapTokens;
  readonly to: MapTokens;
  elapsed: number;
}

interface LoupeState {
  x: number;
  y: number;
  index: number;
}

let cachedSupport: boolean | null = null;

/** True when this browser can run the WebGL map at interactive speed. */
export function supportsMapEngine(): boolean {
  try {
    if (typeof document === "undefined" || typeof DecompressionStream !== "function") return false;
    if (cachedSupport !== null) return cachedSupport;
    const probe = document.createElement("canvas");
    // Software rasterisers take seconds per frame on this geometry, so they count
    // as unavailable and the SVG map is used instead.
    const context = probe.getContext("webgl2", { failIfMajorPerformanceCaveat: true });
    let supported = context !== null;
    if (context !== null) {
      const info = context.getExtension("WEBGL_debug_renderer_info");
      const name = info === null ? "" : String(context.getParameter(info.UNMASKED_RENDERER_WEBGL));
      if (/swiftshader|llvmpipe|software/iu.test(name)) supported = false;
      context.getExtension("WEBGL_lose_context")?.loseContext();
    }
    cachedSupport = supported;
    return supported;
  } catch {
    return false;
  }
}

export class MapEngine {
  private readonly container: HTMLElement;
  private readonly callbacks: MapEngineCallbacks;
  private readonly catalog: MapRuntimeCatalog;
  private readonly assets: MapEngineAssets;
  private readonly glCanvas: HTMLCanvasElement;
  private readonly labelCanvas: HTMLCanvasElement;
  private readonly loupeRoot: HTMLDivElement;
  private readonly loupeCanvas: HTMLCanvasElement;
  private readonly loupeNameNode: HTMLDivElement;
  private readonly seas = seaLabels();
  private bundle: RenderBundle | null = null;
  private renderer: MapGlRenderer | null = null;
  private hitIndex: ProvinceHitIndex | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private frameHandle: number | null = null;
  private lastFrameTime = 0;
  private disposed = false;
  private dirty = true;
  private labelsDirty = true;

  private viewport: MapViewportSize = { width: 0, height: 0 };
  private dpr = 1;
  private camera: Camera = { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2, scale: 1 };

  private readonly pointers = new Map<number, PointerRecord>();
  private dragging = false;
  private travelled = 0;
  private pinchDistance = 0;
  private velocity = { x: 0, y: 0 };
  private lastMoveTime = 0;
  private zoomRemaining = 0;
  private zoomFocus = { x: 0, y: 0 };
  private flight: Flight | null = null;
  /** Degrees of longitude per second the backdrop turns; 0 is a still map. */
  private drift = 0;
  private tokens: MapTokens = resolveEra(ERA_THEMES.imperial).map;
  private themeFade: ThemeFade | null = null;
  private longPressTimer: ReturnType<typeof setTimeout> | null = null;
  private loupe: LoupeState | null = null;
  private lastTap = { x: 0, y: 0, time: -Infinity };
  private touchActive = false;

  private insetRight = 0;
  private insetLeft = 0;
  private reserved: readonly ReservedBox[] = [];
  private data: MapEngineData | null = null;
  private styleTable: ProvinceStyleTable | null = null;
  private baseFlags: Uint8Array | null = null;
  private hoverIndex: number | null = null;
  private unitBounds: ReadonlyMap<string, MapBounds> = new Map();
  private labelInputs: Omit<LabelInputs, "emphasisedTags"> | null = null;
  private markers: readonly { readonly x: number; readonly y: number; readonly color: Rgb }[] = [];
  private placed: readonly PlacedLabel[] = [];
  private placedCamera: Camera | null = null;
  private neighbours: Int32Array | null = null;

  private frames = 0;
  private lastFrameMs = 0;
  private readonly frameTimes: number[] = [];
  private pickCount = 0;
  private pickMs = 0;
  private styleUploads = 0;
  private labelPlacements = 0;

  constructor(
    container: HTMLElement,
    catalog: MapRuntimeCatalog,
    assets: MapEngineAssets,
    callbacks: MapEngineCallbacks,
  ) {
    this.container = container;
    this.catalog = catalog;
    this.assets = assets;
    this.callbacks = callbacks;
    this.glCanvas = this.createCanvas();
    this.labelCanvas = this.createCanvas();
    this.labelCanvas.style.pointerEvents = "none";
    this.labelCanvas.style.transition = `opacity ${String(DRIFT_LABEL_FADE_MS)}ms ease`;
    this.container.prepend(this.labelCanvas);
    this.container.prepend(this.glCanvas);
    this.loupeRoot = document.createElement("div");
    this.loupeCanvas = document.createElement("canvas");
    this.loupeNameNode = document.createElement("div");
    this.buildLoupe();
    this.container.setAttribute("tabindex", "0");
    this.container.style.touchAction = "none";
    this.container.style.outline = "none";
    this.container.style.cursor = "grab";
    // A read-only inspection seam for the runtime verification scripts.
    (container as HTMLElement & { __mapEngine?: MapEngine }).__mapEngine = this;
  }

  private createCanvas(): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.style.position = "absolute";
    canvas.style.left = "0";
    canvas.style.top = "0";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.display = "block";
    return canvas;
  }

  private buildLoupe(): void {
    const { style } = this.loupeRoot;
    style.position = "absolute";
    style.left = "0";
    style.top = "0";
    style.width = `${String(LOUPE_SIZE)}px`;
    style.display = "none";
    style.pointerEvents = "none";
    const lens = this.loupeCanvas.style;
    lens.display = "block";
    lens.width = `${String(LOUPE_SIZE)}px`;
    lens.height = `${String(LOUPE_SIZE)}px`;
    lens.borderRadius = "50%";
    lens.boxSizing = "border-box";
    const name = this.loupeNameNode.style;
    name.marginTop = "6px";
    name.padding = "3px 8px";
    name.borderRadius = "10px";
    name.textAlign = "center";
    name.font = `13px/17px ${FONTS.sansSemiBold}`;
    name.overflow = "hidden";
    name.whiteSpace = "nowrap";
    name.textOverflow = "ellipsis";
    this.loupeRoot.append(this.loupeCanvas, this.loupeNameNode);
    this.container.append(this.loupeRoot);
  }

  /** Load data and start rendering; rejects so the host can fall back to SVG. */
  async start(): Promise<void> {
    const bundle = await this.assets.loadBundle();
    if (this.disposed) return;
    if (bundle.provinceCount !== this.catalog.provinces.length) {
      throw new Error("render bundle: province count does not match the catalogue");
    }
    bundle.provinceIds.forEach((id, index) => {
      if (this.catalog.provinces[index]?.id !== id) {
        throw new Error(`render bundle: province ${String(index)} does not match the catalogue`);
      }
    });
    const gl = this.glCanvas.getContext("webgl2", {
      antialias: true,
      stencil: true,
      alpha: false,
      depth: false,
      powerPreference: "high-performance",
    });
    if (gl === null) throw new Error("WebGL2 context unavailable");
    this.bundle = bundle;
    this.renderer = new MapGlRenderer(gl, bundle, mapPalette(this.tokens));
    this.hitIndex = createMeshHitIndex(this.catalog.provinces, bundle);
    this.neighbours = neighbourPairs(bundle.borders[0]?.ids ?? new Uint16Array());
    this.glCanvas.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      this.callbacks.onContextLost();
    });
    this.attachInput();
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.container);
    this.handleResize();
    this.applyData(true);
    this.requestFrame();
    // Terrain and sea-floor textures arrive progressively; the map is complete
    // and correct without them, so they never hold up the first frame.
    for (const kind of ["relief", "ocean"] as const) {
      void this.assets
        .loadTexture(kind)
        .then((image) => {
          if (this.disposed) return;
          this.renderer?.setImageTexture(kind, image);
          this.dirty = true;
          this.requestFrame();
        })
        .catch(() => undefined);
    }
  }

  destroy(): void {
    this.disposed = true;
    if (this.frameHandle !== null) cancelAnimationFrame(this.frameHandle);
    this.cancelLongPress();
    this.resizeObserver?.disconnect();
    this.detachInput?.();
    this.renderer?.dispose();
    this.glCanvas.remove();
    this.labelCanvas.remove();
    this.loupeRoot.remove();
  }

  // ---- data -----------------------------------------------------------------

  setData(data: MapEngineData): void {
    const previous = this.data;
    this.data = data;
    if (this.renderer === null) return;
    const statesChanged = previous === null || !sameStates(previous.context.states, data.context.states);
    const styleChanged =
      statesChanged ||
      previous?.mode !== data.mode ||
      previous?.context.highlightMarketId !== data.context.highlightMarketId;
    if (statesChanged) this.rebuildLabels();
    if (styleChanged) {
      this.styleTable = null;
    } else if (
      previous?.selectedTag === data.selectedTag &&
      previous?.playerTag === data.playerTag &&
      previous?.selectedProvinceIndex === data.selectedProvinceIndex
    ) {
      return;
    }
    this.applyData(false);
  }

  private applyData(force: boolean): void {
    const { data, renderer } = this;
    if (data === null || renderer === null) return;
    if (force || this.styleTable === null) {
      this.styleTable = buildProvinceStyleTable(data.mode, data.context);
      this.baseFlags = new Uint8Array(this.styleTable.width);
      for (let texel = 0; texel < this.styleTable.width; texel += 1) {
        this.baseFlags[texel] = this.styleTable.data[texel * 4 + 3] ?? 0;
      }
      this.composeFlags();
      renderer.setStyleTable(this.styleTable);
      if (this.labelInputs === null) this.rebuildLabels();
    } else {
      this.composeFlags();
      renderer.updateFlagsRow(this.styleTable);
    }
    this.styleUploads += 1;
    this.labelsDirty = true;
    this.dirty = true;
    this.requestFrame();
  }

  /** Merge mode dimming with the interaction flags into row 0's alpha channel. */
  private composeFlags(): void {
    const { styleTable, baseFlags, data } = this;
    if (styleTable === null || baseFlags === null || data === null) return;
    const { states } = data.context;
    for (let index = 0; index < states.length; index += 1) {
      const state = states[index];
      const texel = index + 1;
      let flags = (baseFlags[texel] ?? 0) & STYLE_FLAG_DIMMED;
      if (state !== undefined) flags |= selectionFlags(state, data.selectedTag, data.playerTag);
      if (index === data.selectedProvinceIndex) flags |= STYLE_FLAG_SELECTED_PROVINCE;
      if (index === this.hoverIndex) flags |= STYLE_FLAG_HOVER;
      styleTable.data[texel * 4 + 3] = flags;
    }
  }

  /** Group provinces into units and fit one label to each unit's main landmass. */
  private rebuildLabels(): void {
    const { data, bundle, neighbours } = this;
    if (data === null || bundle === null || neighbours === null) return;
    const { states, provinces, entryByTag } = data.context;
    const futureNames = new Map(this.catalog.futurePolities.map((polity) => [polity.tag, polity.commonName]));
    const { labels: units, bounds: unitBounds } = buildUnitLabels({
      provinces,
      unitTags: states.map((state) => state.unitTag),
      stats: bundle.stats,
      neighbours,
      nameOf: (tag) => entryByTag.get(tag)?.commonName ?? futureNames.get(tag) ?? tag,
    });
    this.unitBounds = unitBounds;
    // Territories too small to see at strategic zoom keep a locating dot.
    const markers = units
      .filter((unit) => unit.area < SMALL_UNIT_AREA)
      .map((unit) => ({ x: unit.x, y: unit.y, color: politicalColor(unit.tag, entryByTag) }));
    const pointProvinces: PointLabel[] = [];
    provinces.forEach((province, index) => {
      if (province.residual) return;
      const [lon = 0, lat = 0] = province.label;
      const area = bundle.stats[index * 6] ?? 0;
      pointProvinces.push({
        key: province.key,
        name: province.displayName,
        x: projectLon(lon),
        y: projectLat(lat),
        priority: area,
        halfWidth: Math.sqrt(area) * 0.6,
      });
    });
    const capitals: PointLabel[] = this.catalog.entries
      .filter((entry) => entry.capital.name !== "")
      .map((entry) => ({
        key: entry.tag,
        name: entry.capital.name,
        x: projectLon(entry.capital.lon),
        y: projectLat(entry.capital.lat),
        priority: entry.kind === "state" ? entry.population1900 + 1e10 : entry.population1900,
        halfWidth: 100,
      }));
    this.labelInputs = { units, provinces: pointProvinces, capitals, seas: this.seas };
    this.markers = markers;
    this.labelsDirty = true;
    this.dirty = true;
    this.requestFrame();
  }

  // ---- camera ---------------------------------------------------------------

  private handleResize(): void {
    const rect = this.container.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const first = this.viewport.width === 0;
    if (width === this.viewport.width && height === this.viewport.height && dpr === this.dpr) return;
    this.viewport = { width, height };
    this.dpr = dpr;
    for (const canvas of [this.glCanvas, this.labelCanvas]) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    if (first) this.camera = this.homeCamera();
    this.camera = clampCamera(this.camera, this.viewport);
    this.labelsDirty = true;
    this.dirty = true;
    this.renderNow();
  }

  /** The default view: the whole world with Europe near the centre. */
  private homeCamera(): Camera {
    const scale = minimumScale(this.viewport) * 1.02;
    return clampCamera(
      { x: projectLon(12) + this.insetRight / 2 / scale, y: projectLat(16), scale },
      this.viewport,
    );
  }

  private renderNow(): void {
    if (this.frameHandle !== null) {
      cancelAnimationFrame(this.frameHandle);
      this.frameHandle = null;
    }
    this.draw();
  }

  private requestFrame(): void {
    if (this.frameHandle !== null || this.disposed) return;
    this.frameHandle = requestAnimationFrame((time) => {
      this.frameHandle = null;
      this.tick(time);
    });
  }

  private tick(time: number): void {
    const elapsed = Math.min(50, this.lastFrameTime === 0 ? 16 : time - this.lastFrameTime);
    this.lastFrameTime = time;
    const animating = this.advanceAnimations(elapsed);
    if (this.dirty || animating) this.draw();
    if (animating) {
      this.requestFrame();
    } else {
      this.lastFrameTime = 0;
      if (this.labelsDirty) {
        this.dirty = true;
        this.requestFrame();
      }
    }
  }

  private advanceAnimations(elapsed: number): boolean {
    let animating = false;
    if (this.themeFade !== null) {
      const fade = this.themeFade;
      fade.elapsed += elapsed;
      const t = Math.min(1, fade.elapsed / ERA_TRANSITION_MS);
      this.applyTokens(blendMapTokens(fade.from, fade.to, t * t * (3 - 2 * t)));
      if (t >= 1) this.themeFade = null;
      else animating = true;
    }
    if (this.flight !== null) {
      const flight = this.flight;
      flight.elapsed += elapsed;
      const t = Math.min(1, flight.elapsed / FLIGHT_MS);
      const eased = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
      const delta = shortestDeltaX(flight.from.x, flight.to.x);
      this.camera = clampCamera(
        {
          x: flight.from.x + delta * eased,
          y: flight.from.y + (flight.to.y - flight.from.y) * eased,
          scale: Math.exp(Math.log(flight.from.scale) + (Math.log(flight.to.scale) - Math.log(flight.from.scale)) * eased),
        },
        this.viewport,
      );
      this.labelsDirty = true;
      if (t >= 1) this.flight = null;
      else animating = true;
    }
    if (Math.abs(this.zoomRemaining) > 0.0005) {
      const step = this.zoomRemaining * smoothingAlpha(elapsed, ZOOM_TIME_CONSTANT_MS);
      this.zoomRemaining -= step;
      this.camera = zoomCameraAt(this.camera, this.viewport, Math.exp(step), this.zoomFocus.x, this.zoomFocus.y);
      this.labelsDirty = true;
      animating = true;
    } else {
      this.zoomRemaining = 0;
    }
    if (this.drift !== 0) {
      // A hand on the map, a throw or a flight holds the turn; it resumes after.
      const held =
        this.pointers.size > 0 ||
        this.flight !== null ||
        Math.hypot(this.velocity.x, this.velocity.y) > INERTIA_MIN_SPEED;
      if (!held) {
        const travel = ((this.drift * elapsed) / 1000) * (MAP_WIDTH / 360);
        this.camera = clampCamera({ ...this.camera, x: this.camera.x - travel }, this.viewport);
      }
      animating = true;
    }
    const speed = Math.hypot(this.velocity.x, this.velocity.y);
    if (speed > INERTIA_MIN_SPEED && this.pointers.size === 0) {
      this.camera = panCamera(this.camera, this.viewport, this.velocity.x * elapsed, this.velocity.y * elapsed);
      const decay = Math.exp(-elapsed / INERTIA_DECAY_MS);
      this.velocity = { x: this.velocity.x * decay, y: this.velocity.y * decay };
      animating = true;
    } else if (this.pointers.size === 0) {
      this.velocity = { x: 0, y: 0 };
    }
    return animating;
  }

  private draw(): void {
    const { renderer, data } = this;
    if (renderer === null || data === null || this.styleTable === null) return;
    const started = performance.now();
    if (this.loupe !== null) this.drawLoupe(this.loupe);
    renderer.render(this.camera, this.viewport, this.dpr);
    // A turning backdrop has no labels to place; they return when it stops.
    if (this.drift === 0) this.updateLabels();
    this.dirty = false;
    const duration = performance.now() - started;
    this.frames += 1;
    this.lastFrameMs = duration;
    this.frameTimes.push(duration);
    if (this.frameTimes.length > 600) this.frameTimes.shift();
  }

  private updateLabels(): void {
    const { data, labelInputs } = this;
    if (data === null || labelInputs === null) return;
    const context = this.labelCanvas.getContext("2d");
    if (context === null) return;
    const previous = this.placedCamera;
    const panOnly = previous !== null && previous.scale === this.camera.scale;
    const panX = panOnly ? shortestDeltaX(this.camera.x, previous.x) * this.camera.scale : 0;
    const panY = panOnly ? (previous.y - this.camera.y) * this.camera.scale : 0;
    if (
      !this.labelsDirty &&
      panOnly &&
      Math.hypot(panX, panY) < LABEL_REPLACE_PAN_PX
    ) {
      this.labelCanvas.style.transform =
        panX === 0 && panY === 0 ? "" : `translate(${panX.toFixed(1)}px, ${panY.toFixed(1)}px)`;
      return;
    }
    if (
      this.labelsDirty &&
      panOnly &&
      this.isMoving() &&
      Math.hypot(panX, panY) < LABEL_REPLACE_PAN_PX
    ) {
      // During motion a pure pan keeps the cached overlay; the final frame of the
      // gesture repaints it.
      this.labelCanvas.style.transform = `translate(${panX.toFixed(1)}px, ${panY.toFixed(1)}px)`;
      return;
    }
    this.labelCanvas.style.transform = "";
    const emphasised = new Set<string>();
    if (data.selectedTag !== null) emphasised.add(data.selectedTag);
    if (data.playerTag !== null) emphasised.add(data.playerTag);
    this.placed = placeLabels(
      { ...labelInputs, emphasisedTags: emphasised },
      this.camera,
      this.viewport,
      this.insetRight,
      { insetLeft: this.insetLeft, reserved: this.reserved },
    );
    this.placedCamera = this.camera;
    this.labelsDirty = false;
    this.labelPlacements += 1;
    paintLabels(context, this.placed, this.markers, this.camera, this.viewport, this.dpr, this.tokens);
  }

  private applyTokens(tokens: MapTokens): void {
    this.tokens = tokens;
    this.renderer?.setPalette(mapPalette(tokens));
    this.labelsDirty = true;
    this.dirty = true;
  }

  /** Move to an era's look: a slow cross-fade, unless told to jump. */
  setTheme(eraId: EraId, immediate: boolean): void {
    const target = resolveEra(ERA_THEMES[eraId]).map;
    if (immediate) {
      this.themeFade = null;
      this.applyTokens(target);
    } else {
      this.themeFade = { from: this.tokens, to: target, elapsed: 0 };
    }
    this.requestFrame();
  }

  private isMoving(): boolean {
    return (
      this.dragging ||
      Math.hypot(this.velocity.x, this.velocity.y) > INERTIA_MIN_SPEED ||
      this.flight !== null
    );
  }

  zoomIn(): void {
    this.queueZoom(Math.log(BUTTON_ZOOM), this.viewport.width / 2, this.viewport.height / 2);
  }

  zoomOut(): void {
    this.queueZoom(-Math.log(BUTTON_ZOOM), this.viewport.width / 2, this.viewport.height / 2);
  }

  resetView(): void {
    this.flyTo(this.homeCamera());
  }

  /**
   * Turn the world under a still camera: a backdrop, not a view to read. Starting
   * eases to a closer framing and fades the labels out; stopping fades them back
   * and returns to the home view the next screen expects.
   */
  setDrift(degreesPerSecond: number): void {
    const was = this.drift;
    this.drift = degreesPerSecond;
    if (was === 0 && degreesPerSecond !== 0) {
      this.labelCanvas.style.opacity = "0";
      this.setHover(null);
      if (this.viewport.width > 0) {
        const scale = minimumScale(this.viewport) * DRIFT_ZOOM;
        this.flyTo(clampCamera({ x: this.camera.x, y: projectLat(DRIFT_CENTRE_LAT), scale }, this.viewport));
      }
    } else if (was !== 0 && degreesPerSecond === 0) {
      this.labelCanvas.style.opacity = "1";
      this.labelsDirty = true;
      this.dirty = true;
      this.flyTo(this.homeCamera());
    }
    this.requestFrame();
  }

  /** Screen space the interface covers; framing and labels stay clear of it. */
  setInsets(insets: MapInsets): void {
    this.insetLeft = insets.left;
    this.insetRight = insets.right;
    this.reserved = insets.reserved;
    this.labelsDirty = true;
    this.dirty = true;
    this.requestFrame();
  }

  zoomLevel(): MapZoomLevel {
    return zoomLevelForScale(this.camera.scale);
  }

  /** Frame a political unit, staying clear of any docked panel. */
  focusUnit(tag: string, immediate = false): void {
    const bounds = this.unitBounds.get(tag);
    if (bounds === undefined || this.viewport.width === 0) return;
    const covered = this.insetRight + this.insetLeft;
    const usable = { ...this.viewport, width: Math.max(320, this.viewport.width - covered) };
    const framed = cameraForBounds(bounds, usable, 0.2);
    const scale = Math.max(minimumScale(this.viewport), Math.min(framed.scale, FOCUS_MAX_SCALE));
    const capped = clampCamera(
      { x: framed.x + (this.insetRight - this.insetLeft) / 2 / scale, y: framed.y, scale },
      this.viewport,
    );
    if (immediate) {
      // A jump also ends any flight still under way, such as the return from a turning backdrop.
      this.flight = null;
      this.camera = capped;
      this.labelsDirty = true;
      this.dirty = true;
      this.requestFrame();
    } else {
      this.flyTo(capped);
    }
  }

  focusPoint(worldX: number, worldY: number, scale: number): void {
    this.flyTo(clampCamera({ x: worldX, y: worldY, scale }, this.viewport));
  }

  /** Fly to a province chosen from a list, at province zoom if not already there. */
  focusProvince(index: number): void {
    const province = this.catalog.provinces[index];
    if (province === undefined || this.viewport.width === 0) return;
    const [lon = 0, lat = 0] = province.label;
    const scale = Math.max(this.camera.scale, 9);
    this.focusPoint(projectLon(lon) + (this.insetRight - this.insetLeft) / 2 / scale, projectLat(lat), scale);
  }

  private flyTo(target: Camera): void {
    this.flight = { from: this.camera, to: target, elapsed: 0 };
    this.velocity = { x: 0, y: 0 };
    this.zoomRemaining = 0;
    this.requestFrame();
  }

  private queueZoom(logFactor: number, focusX: number, focusY: number): void {
    this.flight = null;
    this.zoomRemaining += logFactor;
    this.zoomFocus = { x: focusX, y: focusY };
    this.requestFrame();
  }

  // ---- input ----------------------------------------------------------------

  private detachInput: (() => void) | null = null;

  private localPoint(event: { clientX: number; clientY: number }): { x: number; y: number } {
    const rect = this.container.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  private attachInput(): void {
    const node = this.container;
    const onPointerDown = (event: PointerEvent): void => {
      if (event.target !== this.glCanvas && event.target !== node) return;
      if (event.pointerType === "mouse" && event.button !== 0 && event.button !== 1) return;
      node.focus({ preventScroll: true });
      const point = this.localPoint(event);
      this.pointers.set(event.pointerId, point);
      node.setPointerCapture(event.pointerId);
      this.flight = null;
      this.velocity = { x: 0, y: 0 };
      this.travelled = 0;
      this.touchActive = event.pointerType !== "mouse";
      this.pinchDistance = this.currentPinchDistance();
      this.lastMoveTime = event.timeStamp;
      if (this.pointers.size > 1) {
        // A second finger always means a pinch, even mid-loupe.
        this.dragging = true;
        this.cancelLongPress();
        this.closeLoupe();
      } else if (this.touchActive) {
        this.setHover(null);
        this.cancelLongPress();
        this.longPressTimer = setTimeout(() => {
          this.longPressTimer = null;
          if (this.pointers.size === 1 && !this.dragging) this.openLoupe(point.x, point.y);
        }, LONG_PRESS_MS);
      }
    };
    const onPointerMove = (event: PointerEvent): void => {
      const point = this.localPoint(event);
      const record = this.pointers.get(event.pointerId);
      if (record === undefined) {
        if (event.pointerType === "mouse") this.updateHover(point.x, point.y);
        return;
      }
      if (this.loupe !== null) {
        record.x = point.x;
        record.y = point.y;
        this.moveLoupe(point.x, point.y);
        return;
      }
      if (this.pointers.size >= 2) {
        record.x = point.x;
        record.y = point.y;
        const distance = this.currentPinchDistance();
        const middle = this.pinchMiddle();
        if (this.pinchDistance > 0 && distance > 0) {
          this.camera = zoomCameraAt(this.camera, this.viewport, distance / this.pinchDistance, middle.x, middle.y);
          this.labelsDirty = true;
          this.dirty = true;
          this.requestFrame();
        }
        this.pinchDistance = distance;
        return;
      }
      const deltaX = point.x - record.x;
      const deltaY = point.y - record.y;
      record.x = point.x;
      record.y = point.y;
      this.travelled += Math.hypot(deltaX, deltaY);
      const threshold = event.pointerType === "mouse" ? DRAG_THRESHOLD : TOUCH_DRAG_THRESHOLD;
      if (!this.dragging && this.travelled < threshold) return;
      if (!this.dragging) {
        this.dragging = true;
        this.cancelLongPress();
        node.style.cursor = "grabbing";
        this.setHover(null);
      }
      this.camera = panCamera(this.camera, this.viewport, deltaX, deltaY);
      const elapsed = Math.max(1, event.timeStamp - this.lastMoveTime);
      this.lastMoveTime = event.timeStamp;
      // A short blend so one jittery event cannot fling the map.
      this.velocity = {
        x: this.velocity.x * 0.6 + (deltaX / elapsed) * 0.4,
        y: this.velocity.y * 0.6 + (deltaY / elapsed) * 0.4,
      };
      this.dirty = true;
      this.requestFrame();
    };
    const onPointerUp = (event: PointerEvent): void => {
      const record = this.pointers.get(event.pointerId);
      if (record === undefined) return;
      this.pointers.delete(event.pointerId);
      this.cancelLongPress();
      if (this.loupe !== null) {
        const { index, x, y } = this.loupe;
        this.closeLoupe();
        if (event.type === "pointerup") {
          if (index >= 0) this.callbacks.onProvincePress(index, x, y);
          else this.callbacks.onSeaPress();
        }
        return;
      }
      const wasDragging = this.dragging;
      if (this.pointers.size === 0) {
        this.dragging = false;
        node.style.cursor = "grab";
        // A pointer held still before release carries no throw.
        if (event.timeStamp - this.lastMoveTime > 70) this.velocity = { x: 0, y: 0 };
      }
      this.pinchDistance = this.currentPinchDistance();
      if (!wasDragging && event.type === "pointerup" && (event.pointerType !== "mouse" || event.button === 0)) {
        this.press(record.x, record.y);
        if (event.pointerType !== "mouse") this.noteTap(record.x, record.y, event.timeStamp);
      } else {
        this.labelsDirty = true;
        this.dirty = true;
        this.requestFrame();
      }
    };
    const onPointerLeave = (): void => {
      if (this.pointers.size === 0) this.setHover(null);
    };
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 32 : event.deltaMode === 2 ? this.viewport.height : 1;
      const sensitivity = event.ctrlKey ? PINCH_WHEEL_SENSITIVITY : WHEEL_SENSITIVITY;
      const point = this.localPoint(event);
      this.queueZoom(-event.deltaY * unit * sensitivity, point.x, point.y);
      this.setHover(null);
    };
    const onDoubleClick = (event: MouseEvent): void => {
      const point = this.localPoint(event);
      this.queueZoom(Math.log(event.shiftKey ? 0.5 : 2), point.x, point.y);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      const pan = (x: number, y: number): void => {
        this.flyTo(panCamera(this.camera, this.viewport, x, y));
        event.preventDefault();
      };
      switch (event.key) {
        case "ArrowLeft":
          pan(KEY_PAN_PX, 0);
          break;
        case "ArrowRight":
          pan(-KEY_PAN_PX, 0);
          break;
        case "ArrowUp":
          pan(0, KEY_PAN_PX);
          break;
        case "ArrowDown":
          pan(0, -KEY_PAN_PX);
          break;
        case "+":
        case "=":
          this.zoomIn();
          event.preventDefault();
          break;
        case "-":
          this.zoomOut();
          event.preventDefault();
          break;
        case "0":
          this.resetView();
          event.preventDefault();
          break;
        default:
          break;
      }
    };
    node.addEventListener("pointerdown", onPointerDown);
    node.addEventListener("pointermove", onPointerMove);
    node.addEventListener("pointerup", onPointerUp);
    node.addEventListener("pointercancel", onPointerUp);
    node.addEventListener("pointerleave", onPointerLeave);
    node.addEventListener("wheel", onWheel, { passive: false });
    node.addEventListener("dblclick", onDoubleClick);
    node.addEventListener("keydown", onKeyDown);
    this.detachInput = () => {
      node.removeEventListener("pointerdown", onPointerDown);
      node.removeEventListener("pointermove", onPointerMove);
      node.removeEventListener("pointerup", onPointerUp);
      node.removeEventListener("pointercancel", onPointerUp);
      node.removeEventListener("pointerleave", onPointerLeave);
      node.removeEventListener("wheel", onWheel);
      node.removeEventListener("dblclick", onDoubleClick);
      node.removeEventListener("keydown", onKeyDown);
    };
  }

  /** A browser sends no reliable dblclick for touch, so double-tap is detected here. */
  private noteTap(x: number, y: number, time: number): void {
    const previous = this.lastTap;
    if (time - previous.time < DOUBLE_TAP_MS && Math.hypot(x - previous.x, y - previous.y) < DOUBLE_TAP_DISTANCE) {
      this.queueZoom(Math.log(2), x, y);
      this.lastTap = { x, y, time: -Infinity };
      return;
    }
    this.lastTap = { x, y, time };
  }

  private cancelLongPress(): void {
    if (this.longPressTimer !== null) clearTimeout(this.longPressTimer);
    this.longPressTimer = null;
  }

  private openLoupe(x: number, y: number): void {
    const size = Math.round(LOUPE_SIZE * this.dpr);
    this.loupeCanvas.width = size;
    this.loupeCanvas.height = size;
    this.loupeCanvas.style.border = `2px solid ${rgbToCss(this.tokens.selection)}`;
    this.loupeNameNode.style.color = rgbToCss(this.tokens.label);
    this.loupeNameNode.style.backgroundColor = rgbaToCss(this.tokens.labelBack, 0.9);
    this.loupeRoot.style.display = "block";
    this.loupe = { x, y, index: -1 };
    this.moveLoupe(x, y);
  }

  private moveLoupe(x: number, y: number): void {
    const { loupe } = this;
    if (loupe === null) return;
    loupe.x = x;
    loupe.y = y;
    loupe.index = this.pick(x, y, TOUCH_PICK_RADIUS / LOUPE_ZOOM);
    const left = Math.max(4, Math.min(this.viewport.width - LOUPE_SIZE - 4, x - LOUPE_SIZE / 2));
    const above = y - LOUPE_OFFSET - LOUPE_SIZE / 2;
    const top = above < LOUPE_TOP_CLEARANCE ? y + LOUPE_OFFSET - LOUPE_SIZE / 2 : above;
    this.loupeRoot.style.transform = `translate(${left.toFixed(1)}px, ${top.toFixed(1)}px)`;
    this.loupeNameNode.textContent = this.catalog.provinces[loupe.index]?.displayName ?? "Open sea";
    this.setHover(loupe.index >= 0 ? loupe.index : null);
    this.dirty = true;
    this.requestFrame();
  }

  private closeLoupe(): void {
    if (this.loupe === null) return;
    this.loupe = null;
    this.loupeRoot.style.display = "none";
    this.setHover(null);
  }

  /**
   * Draw the magnified view into the corner of the drawing buffer and copy it out
   * before the main view overwrites it, all within one task, so the canvas needs
   * no preserved buffer. A real render stays sharp where a scaled copy would blur.
   */
  private drawLoupe(loupe: LoupeState): void {
    const { renderer } = this;
    const context = this.loupeCanvas.getContext("2d");
    if (renderer === null || context === null) return;
    const world = screenToWorld(this.camera, this.viewport, loupe.x, loupe.y);
    const size = Math.round(LOUPE_SIZE * this.dpr);
    const scale = Math.min(CAMERA_MAX_SCALE, this.camera.scale * LOUPE_ZOOM);
    renderer.render(
      { x: wrapX(world.x), y: world.y, scale },
      { width: LOUPE_SIZE, height: LOUPE_SIZE },
      this.dpr,
      levelOfDetail(this.camera.scale * this.dpr),
    );
    context.clearRect(0, 0, size, size);
    context.save();
    context.beginPath();
    context.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    context.clip();
    context.drawImage(this.glCanvas, 0, this.glCanvas.height - size, size, size, 0, 0, size, size);
    context.restore();
    // A clean crosshair marks exactly what lifting the finger will pick.
    context.strokeStyle = rgbToCss(this.tokens.selection);
    context.lineWidth = this.dpr;
    context.beginPath();
    const reach = 9 * this.dpr;
    context.moveTo(size / 2 - reach, size / 2);
    context.lineTo(size / 2 + reach, size / 2);
    context.moveTo(size / 2, size / 2 - reach);
    context.lineTo(size / 2, size / 2 + reach);
    context.stroke();
  }

  private currentPinchDistance(): number {
    const [a, b] = [...this.pointers.values()];
    return a === undefined || b === undefined ? 0 : Math.hypot(a.x - b.x, a.y - b.y);
  }

  private pinchMiddle(): { x: number; y: number } {
    const [a, b] = [...this.pointers.values()];
    return a === undefined || b === undefined ? { x: 0, y: 0 } : { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  private pick(screenX: number, screenY: number, radiusPx?: number): number {
    const { hitIndex } = this;
    if (hitIndex === null) return -1;
    const started = performance.now();
    const world = screenToWorld(this.camera, this.viewport, screenX, screenY);
    const radius = radiusPx ?? (this.touchActive ? TOUCH_PICK_RADIUS : MOUSE_PICK_RADIUS);
    const index = hitIndex.pickNear(wrapX(world.x), world.y, radius / this.camera.scale);
    this.pickMs += performance.now() - started;
    this.pickCount += 1;
    return index;
  }

  private press(screenX: number, screenY: number): void {
    const index = this.pick(screenX, screenY);
    if (index >= 0) this.callbacks.onProvincePress(index, screenX, screenY);
    else this.callbacks.onSeaPress();
  }

  private updateHover(screenX: number, screenY: number): void {
    if (this.dragging || this.drift !== 0 || Math.abs(this.zoomRemaining) > 0.02) return;
    this.touchActive = false;
    const index = this.pick(screenX, screenY);
    this.setHover(index >= 0 ? index : null, screenX, screenY);
  }

  private setHover(index: number | null, x = 0, y = 0): void {
    if (index === this.hoverIndex) return;
    this.hoverIndex = index;
    this.container.style.cursor = index === null ? "grab" : "pointer";
    if (this.loupe === null) this.callbacks.onHoverChange(index, x, y);
    if (this.styleTable !== null) {
      this.composeFlags();
      this.renderer?.updateFlagsRow(this.styleTable);
      this.styleUploads += 1;
      this.dirty = true;
      this.requestFrame();
    }
  }

  // ---- inspection (runtime verification scripts) ----------------------------

  labelCount(): number {
    return this.placed.length;
  }

  loupeOpen(): boolean {
    return this.loupe !== null;
  }

  loupeName(): string {
    return this.loupeNameNode.textContent ?? "";
  }

  stats(): MapEngineStats {
    return {
      frames: this.frames,
      lastFrameMs: this.lastFrameMs,
      frameTimes: [...this.frameTimes],
      pickCount: this.pickCount,
      pickMs: this.pickMs,
      drawCalls: this.renderer?.counters.drawCalls ?? 0,
      styleUploads: this.styleUploads,
      labelPlacements: this.labelPlacements,
    };
  }

  cameraState(): Camera {
    return this.camera;
  }

  viewportState(): MapViewportSize {
    return this.viewport;
  }

  /** Jump straight to a geographic view, for scripted verification. */
  setView(lon: number, lat: number, scale: number): void {
    this.flight = null;
    this.zoomRemaining = 0;
    this.velocity = { x: 0, y: 0 };
    this.camera = clampCamera({ x: projectLon(lon), y: projectLat(lat), scale }, this.viewport);
    this.labelsDirty = true;
    this.dirty = true;
    this.renderNow();
  }

  /** Screen position of a geographic point, for scripted verification. */
  screenOf(lon: number, lat: number): { readonly x: number; readonly y: number } {
    return worldToScreen(this.camera, this.viewport, projectLon(lon), projectLat(lat));
  }

  /** Geographic position under a screen point, for scripted verification. */
  geoAt(screenX: number, screenY: number): { readonly lon: number; readonly lat: number } {
    const world = screenToWorld(this.camera, this.viewport, screenX, screenY);
    return { lon: unprojectX(wrapX(world.x)), lat: unprojectY(world.y) };
  }

  /** The province key at a screen point, without changing any state. */
  provinceKeyAt(screenX: number, screenY: number): string | null {
    const index = this.pick(screenX, screenY);
    return index >= 0 ? (this.catalog.provinces[index]?.key ?? null) : null;
  }
}

function sameStates(left: readonly ProvinceState[], right: readonly ProvinceState[]): boolean {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index];
    const b = right[index];
    if (
      a?.ownerTag !== b?.ownerTag ||
      a?.controllerTag !== b?.controllerTag ||
      a?.unitTag !== b?.unitTag ||
      a?.marketId !== b?.marketId
    ) {
      return false;
    }
  }
  return true;
}

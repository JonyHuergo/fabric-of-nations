import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import {
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";
import Svg, {
  Circle,
  G,
  Path,
  Rect,
  Text as SvgText,
} from "react-native-svg";

import type { SimulationSnapshot } from "@century/sim-worker";

import { colors, lighten, nationColor, spacing, type } from "../theme";
import {
  MAP_HEIGHT,
  MAP_MAX_SCALE,
  MAP_MIN_SCALE,
  MAP_WIDTH,
  wheelZoomFactor,
} from "./mapViewport";
import {
  decodePolityGeometry,
  decodeProvinceGeometry,
  pathForRings,
  project,
  type DecodedPolityGeometry,
} from "./worldMapGeometry";
import { PROVINCES_1900 } from "../generated/provinces1900";
import {
  pickProvinceAtPoint,
  planProvinceBorders,
  pointInRing,
} from "./provinceRenderPlan";
import type {
  ProvinceMapData,
  ProvinceMapProvince,
} from "../provinceCatalogTypes";

export { MAP_MAX_SCALE, MAP_MIN_SCALE, MAP_PREVIOUS_MAX_SCALE } from "./mapViewport";
import type {
  WorldCatalogData,
  WorldCatalogEntry,
  WorldCatalogMarket,
  WorldMapData,
  WorldMapPolity,
} from "../worldCatalogTypes";
import { Badge } from "./ui";

const MIN_SCALE = MAP_MIN_SCALE;
const MAX_SCALE = MAP_MAX_SCALE;

const MARKET_COLORS = [
  "#7f9c7a",
  "#b08a63",
  "#8e8ab5",
  "#b57e7a",
  "#6f8fa8",
  "#a8936a",
  "#8a9c8f",
  "#a97f9a",
  "#7c8fa0",
  "#a19062",
  "#7e9d94",
  "#9a7f6d",
  "#8c8fa8",
  "#a58f7f",
  "#6f9a8a",
  "#b09a7a",
  "#8f9a6a",
  "#a07a8c",
] as const;

export type MapLayer = "political" | "control" | "markets";

interface DecodedPolity extends WorldMapPolity {
  readonly entry: WorldCatalogEntry;
  /** Null only for a polity with no rings; it renders as a marker fallback. */
  readonly path: string | null;
  readonly centroid: readonly [number, number];
  readonly screenBox: readonly [number, number, number, number];
  readonly points: DecodedPolityGeometry["points"];
}

interface DecodedProvince extends ProvinceMapProvince {
  readonly path: string | null;
  readonly centroid: readonly [number, number];
  readonly screenBox: readonly [number, number, number, number];
  readonly points: DecodedPolityGeometry["points"];
}

/** Provincial boundaries are thin white dotted lines; country borders are stronger. */
const PROVINCE_BORDER_COLOR = "#f4f1e6";
const PROVINCE_BORDER_WIDTH = 0.9;
const PROVINCE_DASH_ON = 1.5;
const PROVINCE_DASH_OFF = 1.7;
const COUNTRY_BORDER_WIDTH = 1.7;

function centroidOf(polity: WorldMapPolity): readonly [number, number] {
  const [lon, lat] = polity.label;
  return project(lon, lat);
}

export interface WorldMapProps {
  readonly catalog: WorldCatalogData;
  readonly map: WorldMapData;
  readonly snapshot: SimulationSnapshot | null;
  readonly selectedTag: string | null;
  readonly onSelect: (tag: string) => void;
  readonly layer?: MapLayer;
  readonly playerTag?: string | null;
  readonly height?: number;
  readonly showLegend?: boolean;
  /** In the market layer, dim every polity outside this market. */
  readonly highlightMarketId?: number | null;
  /** M12a selected province, when the host screen exposes province selection. */
  readonly selectedProvinceId?: number | null;
  readonly onSelectProvince?: (provinceId: number | null) => void;
  /** Provincial boundaries are shown by default for every M12a map. */
  readonly showProvinces?: boolean;
}

export function WorldMap({
  catalog,
  map,
  snapshot,
  selectedTag,
  onSelect,
  layer = "political",
  playerTag = null,
  height = 420,
  showLegend = true,
  highlightMarketId = null,
  selectedProvinceId = null,
  onSelectProvince,
  showProvinces = true,
}: WorldMapProps) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [hoveredTag, setHoveredTag] = useState<string | null>(null);
  const [hoveredProvinceId, setHoveredProvinceId] = useState<number | null>(null);
  const gestureRef = useRef({ x: 0, y: 0, distance: 0 });
  /** DOM node used to attach a non-passive web wheel listener. */
  const containerRef = useRef<ComponentRef<typeof View> | null>(null);

  const [hoverPoint, setHoverPoint] = useState<{ x: number; y: number } | null>(null);
  const gesturing = useRef({ x: 0, y: 0 });
  /** Suppresses the click that the browser emits at the end of a map drag. */
  const suppressClickRef = useRef(false);
  const translateRef = useRef(translate);
  translateRef.current = translate;
  const scaleRef = useRef(scale);
  scaleRef.current = scale;

  const entryByTag = useMemo(
    () => new Map(catalog.entries.map((entry) => [entry.tag, entry] as const)),
    [catalog],
  );
  const marketByKey = useMemo(
    () => new Map(catalog.markets.map((market) => [market.key, market] as const)),
    [catalog],
  );
  const regionByPolityId = useMemo(() => {
    const mapById = new Map<number, SimulationSnapshot["regions"][number]>();
    if (snapshot !== null) for (const region of snapshot.regions) mapById.set(region.id, region);
    return mapById;
  }, [snapshot]);
  const countryTagById = useMemo(() => {
    const byId = new Map<number, string>();
    if (snapshot !== null) {
      for (const summary of snapshot.countrySummaries) byId.set(summary.id, summary.tag);
    }
    return byId;
  }, [snapshot]);

  const polities = useMemo<readonly DecodedPolity[]>(() => {
    return map.polities.map((polity) => {
      const entry = entryByTag.get(polity.tag) ?? {
        id: 0,
        tag: polity.tag,
        name: polity.tag,
        commonName: polity.tag,
        kind: polity.kind,
        status: "independent",
        sovereignTag: null,
        selectable: false,
        continent: "Europe",
        capital: { name: "", lat: 0, lon: 0 },
        population1900: 0,
        market: null,
        description: "",
        confidence: "low" as const,
        notes: "",
        geometry: [],
      };
      const centroid = centroidOf(polity);
      const [minX = -180, minY = -90, maxX = 180, maxY = 90] = polity.bbox;
      const topLeft = project(minX, maxY);
      const bottomRight = project(maxX, minY);
      const geometry = decodePolityGeometry(polity);
      return {
        ...polity,
        entry,
        path: geometry.path,
        // A polity without rings has no fill; the marker layer still draws and
        // selects it, so the country is never silently discarded.
        markerOnly: polity.markerOnly === true || geometry.path === null,
        centroid,
        screenBox: [topLeft[0], topLeft[1], bottomRight[0], bottomRight[1]],
        points: geometry.points,
      };
    });
  }, [entryByTag, map.polities]);

  /**
   * M12a province geometry. Provinces are the sole geographical subdivision in
   * Europe; polity fills remain as the 1900 underlay and for non-European areas.
   */
  const provinceMap: ProvinceMapData = PROVINCES_1900;
  const provinces = useMemo<readonly DecodedProvince[]>(() => {
    return provinceMap.provinces.map((province) => {
      const [minX = -180, minY = -90, maxX = 180, maxY = 90] = province.bbox;
      const topLeft = project(minX, maxY);
      const bottomRight = project(maxX, minY);
      const geometry = decodeProvinceGeometry(province);
      const [lon = 0, lat = 0] = province.label;
      return {
        ...province,
        path: geometry.path,
        centroid: project(lon, lat),
        screenBox: [topLeft[0], topLeft[1], bottomRight[0], bottomRight[1]],
        points: geometry.points,
      };
    });
  }, [provinceMap.provinces]);

  const provinceById = useMemo(
    () => new Map(provinceMap.provinces.map((province) => [province.id, province])),
    [provinceMap.provinces],
  );
  const futurePolityTagById = useMemo(() => {
    const byId = new Map<number, string>();
    for (const polity of provinceMap.futurePolities) byId.set(polity.polityId, polity.tag);
    return byId;
  }, [provinceMap.futurePolities]);
  const ownershipByProvinceId = useMemo(() => {
    const byId = new Map<number, SimulationSnapshot["provinces"][number]>();
    if (snapshot !== null) {
      for (const entry of snapshot.provinces) byId.set(entry.provinceId, entry);
    }
    return byId;
  }, [snapshot]);
  const catalogTagById = useMemo(
    () => new Map(catalog.entries.map((entry) => [entry.id, entry.tag] as const)),
    [catalog.entries],
  );
  const provinceOwnerPolityId = useCallback(
    (province: ProvinceMapProvince): number =>
      ownershipByProvinceId.get(province.id)?.ownerPolityId ??
      province.initialOwnerPolityId,
    [ownershipByProvinceId],
  );
  const tagForPolityId = useCallback(
    (polityId: number): string | null =>
      futurePolityTagById.get(polityId) ?? catalogTagById.get(polityId) ?? null,
    [catalogTagById, futurePolityTagById],
  );

  const ownerTagByProvinceId = useMemo(() => {
    const byId = new Map<number, string>();
    for (const province of provinces) {
      const polityId = provinceOwnerPolityId(province);
      const tag = tagForPolityId(polityId) ?? province.initialOwnerTag;
      byId.set(province.id, tag);
    }
    return byId;
  }, [provinceOwnerPolityId, provinces, tagForPolityId]);

  const provinceOwnerTags = useMemo(
    () => new Set(provinces.map((province) => province.initialOwnerTag)),
    [provinces],
  );

  const provinceBorderPlan = useMemo(
    () => planProvinceBorders(provinceMap.borders, ownerTagByProvinceId),
    [ownerTagByProvinceId, provinceMap.borders],
  );
  const provinceBorderPaths = useMemo(() => {
    const dotted: string[] = [];
    const national: string[] = [];
    for (const border of provinceBorderPlan) {
      if (border.path === null) continue;
      dotted.push(border.path);
      if (border.national) national.push(border.path);
    }
    return { dotted: dotted.join(""), national: national.join("") };
  }, [provinceBorderPlan]);

  const selectedCountryProvincePath = useMemo(() => {
    if (selectedTag === null) return null;
    const parts: string[] = [];
    for (const province of provinces) {
      if (province.path === null) continue;
      if (ownerTagByProvinceId.get(province.id) === selectedTag) parts.push(province.path);
    }
    return parts.length === 0 ? null : parts.join("");
  }, [ownerTagByProvinceId, provinces, selectedTag]);

  const landPath = useMemo(
    () => pathForRings(map.land, "world.land") ?? "",
    [map.land],
  );

  const viewScale =
    size.width > 0 && size.height > 0
      ? Math.min(size.width / MAP_WIDTH, size.height / MAP_HEIGHT)
      : 1;

  const clampTranslate = useCallback(
    (next: { x: number; y: number }, nextScale: number) => {
      const renderedWidth = MAP_WIDTH * nextScale;
      const renderedHeight = MAP_HEIGHT * nextScale;
      const minX = Math.min(0, MAP_WIDTH - renderedWidth);
      const minY = Math.min(0, MAP_HEIGHT - renderedHeight);
      return {
        x: Math.max(minX, Math.min(0, next.x)),
        y: Math.max(minY, Math.min(0, next.y)),
      };
    },
    [],
  );

  const zoomBy = useCallback(
    (factor: number, focus?: { x: number; y: number }) => {
      setScale((current) => {
        const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, current * factor));
        if (next === current) return current;
        const pivot = focus ?? { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 };
        setTranslate((currentTranslate) => {
          const worldX = (pivot.x - currentTranslate.x) / current;
          const worldY = (pivot.y - currentTranslate.y) / current;
          return clampTranslate(
            { x: pivot.x - worldX * next, y: pivot.y - worldY * next },
            next,
          );
        });
        return next;
      });
    },
    [clampTranslate],
  );

  const resetView = useCallback(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  }, []);

  const screenPointToViewBox = useCallback(
    (localX: number, localY: number): [number, number] | null => {
      if (size.width <= 0 || size.height <= 0) return null;
      const drawnWidth = MAP_WIDTH * viewScale;
      const drawnHeight = MAP_HEIGHT * viewScale;
      const offsetX = (size.width - drawnWidth) / 2;
      const offsetY = (size.height - drawnHeight) / 2;
      return [
        (localX - offsetX) / Math.max(viewScale, 0.0001),
        (localY - offsetY) / Math.max(viewScale, 0.0001),
      ];
    },
    [size.height, size.width, viewScale],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (event, gesture) =>
          Math.abs(gesture.dx) > 3 || Math.abs(gesture.dy) > 3 || event.nativeEvent.touches.length > 1,
        onPanResponderGrant: (event) => {
          const touches = event.nativeEvent.touches;
          if (touches.length >= 2) {
            const [a, b] = [touches[0], touches[1]];
            gestureRef.current = {
              x: 0,
              y: 0,
              distance: a !== undefined && b !== undefined ? Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY) : 0,
            };
          } else {
            gesturing.current = { x: translateRef.current.x, y: translateRef.current.y };
          }
        },
        onPanResponderMove: (event, gesture) => {
          const touches = event.nativeEvent.touches;
          if (touches.length >= 2) {
            const [a, b] = [touches[0], touches[1]];
            if (a === undefined || b === undefined) return;
            const distance = Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
            const previous = gestureRef.current.distance || distance;
            const factor = previous > 0 ? distance / previous : 1;
            gestureRef.current.distance = distance;
            const point = screenPointToViewBox(
              (a.locationX + b.locationX) / 2,
              (a.locationY + b.locationY) / 2,
            );
            const center = point === null ? { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 } : { x: point[0], y: point[1] };
            zoomBy(factor, center);
            return;
          }
          const next = {
            x: gesturing.current.x + gesture.dx / Math.max(viewScale, 0.0001),
            y: gesturing.current.y + gesture.dy / Math.max(viewScale, 0.0001),
          };
          setTranslate(clampTranslate(next, scaleRef.current));
        },
        onPanResponderRelease: (_event, gesture) => {
          gestureRef.current.distance = 0;
          if (Platform.OS === "web" && (Math.abs(gesture.dx) > 3 || Math.abs(gesture.dy) > 3)) {
            suppressClickRef.current = true;
            setTimeout(() => {
              suppressClickRef.current = false;
            }, 250);
          }
        },
      }),
    [clampTranslate, screenPointToViewBox, viewScale, zoomBy],
  );

  const onLayout = (event: LayoutChangeEvent): void => {
    setSize({
      width: event.nativeEvent.layout.width,
      height: event.nativeEvent.layout.height,
    });
  };

  const screenToWorld = useCallback(
    (localX: number, localY: number): [number, number] | null => {
      const view = screenPointToViewBox(localX, localY);
      if (view === null) return null;
      // Invert the group transform.
      return [(view[0] - translate.x) / scale, (view[1] - translate.y) / scale];
    },
    [scale, screenPointToViewBox, translate.x, translate.y],
  );

  /**
   * Web wheel zoom.
   *
   * React attaches `onWheel` through a passive listener, so calling
   * preventDefault from a synthetic handler logs "Unable to preventDefault
   * inside passive event listener invocation" and still scrolls the page. The
   * container therefore owns a native, explicitly non-passive wheel listener
   * and maps the pointer with client coordinates relative to its own box.
   */
  const handleWheel = useCallback(
    (event: WheelEvent) => {
      if (Platform.OS !== "web") return;
      const deltaY = event.deltaY;
      if (!Number.isFinite(deltaY) || deltaY === 0) return;
      const node = containerRef.current as unknown as HTMLElement | null;
      if (node === null) return;
      event.preventDefault();
      const rect = node.getBoundingClientRect();
      const factor = wheelZoomFactor(deltaY, event.ctrlKey === true);
      const point = screenPointToViewBox(event.clientX - rect.left, event.clientY - rect.top);
      const focus =
        point === null ? { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 } : { x: point[0], y: point[1] };
      zoomBy(factor, focus);
    },
    [screenPointToViewBox, zoomBy],
  );

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const node = containerRef.current as unknown as HTMLElement | null;
    if (node === null) return;
    node.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      node.removeEventListener("wheel", handleWheel);
    };
  }, [handleWheel]);

  const pickAt = useCallback(
    (worldX: number, worldY: number): DecodedPolity | null => {
      const candidates = polities.filter(
        (polity) =>
          worldX >= polity.screenBox[0] - 6 &&
          worldX <= polity.screenBox[2] + 6 &&
          worldY >= polity.screenBox[1] - 6 &&
          worldY <= polity.screenBox[3] + 6,
      );
      let best: DecodedPolity | null = null;
      let bestArea = Infinity;
      for (const polity of candidates) {
        for (const offset of [-MAP_WIDTH, 0, MAP_WIDTH]) {
          let inside = false;
          for (const points of polity.points) {
            if (points.length < 3) continue;
            if (pointInRing(worldX - offset, worldY, points)) {
              inside = !inside;
            }
          }
          if (inside) {
            if (polity.area < bestArea) {
              best = polity;
              bestArea = polity.area;
            }
            break;
          }
        }
      }
      return best;
    },
    [polities],
  );

  const pickProvinceAt = useCallback(
    (worldX: number, worldY: number): DecodedProvince | null => {
      if (!showProvinces) return null;
      const candidates = provinces.filter(
        (province) =>
          province.path !== null &&
          worldX >= province.screenBox[0] - 4 &&
          worldX <= province.screenBox[2] + 4 &&
          worldY >= province.screenBox[1] - 4 &&
          worldY <= province.screenBox[3] + 4,
      );
      const id = pickProvinceAtPoint(candidates, worldX, worldY, [
        -MAP_WIDTH,
        0,
        MAP_WIDTH,
      ]);
      return id === null ? null : (candidates.find((province) => province.id === id) ?? null);
    },
    [provinces, showProvinces],
  );

  const provinceFillFor = useCallback(
    (province: DecodedProvince): string => {
      const ownerTag = ownerTagByProvinceId.get(province.id) ?? province.initialOwnerTag;
      if (layer === "markets") {
        const region = regionByPolityId.get(province.simulationRegionId);
        const marketId = region?.marketId ?? null;
        if (marketId !== null) {
          return MARKET_COLORS[marketId % MARKET_COLORS.length] ?? colors.faint;
        }
      }
      if (playerTag !== null && ownerTag === playerTag) return colors.player;
      return nationColor(ownerTag);
    },
    [layer, ownerTagByProvinceId, playerTag, regionByPolityId],
  );

  const handlePointerMove = useCallback(
    (event: {
      nativeEvent: { locationX?: number; locationY?: number; offsetX?: number; offsetY?: number };
    }) => {
      if (Platform.OS !== "web") return;
      const localX = event.nativeEvent.locationX ?? event.nativeEvent.offsetX;
      const localY = event.nativeEvent.locationY ?? event.nativeEvent.offsetY;
      if (localX === undefined || localY === undefined) return;
      setHoverPoint({ x: localX, y: localY });
      const world = screenToWorld(localX, localY);
      if (world === null) return;
      const province = pickProvinceAt(world[0], world[1]);
      if (province !== null) {
        setHoveredProvinceId(province.id);
        setHoveredTag(ownerTagByProvinceId.get(province.id) ?? province.initialOwnerTag);
        return;
      }
      setHoveredProvinceId(null);
      const polity = pickAt(world[0], world[1]);
      setHoveredTag(polity?.tag ?? null);
    },
    [ownerTagByProvinceId, pickAt, pickProvinceAt, screenToWorld],
  );

  const marketIdFor = (polity: DecodedPolity): number | null => {
    const region = regionByPolityId.get(polity.entry.id);
    if (region !== undefined && region.marketId !== null) return region.marketId;
    const key = polity.entry.market ?? marketByKey.get(polity.entry.market ?? "")?.key ?? null;
    return catalog.markets.find((market) => market.key === key)?.id ?? null;
  };

  const fillFor = (polity: DecodedPolity): string => {
    const entry = polity.entry;
    if (layer === "markets") {
      const region = regionByPolityId.get(entry.id);
      const marketId = region?.marketId;
      if (marketId !== undefined && marketId !== null) {
        return MARKET_COLORS[marketId % MARKET_COLORS.length] ?? colors.faint;
      }
      const marketKey = entry.market ?? marketByKey.get(entry.market ?? "")?.key;
      const fallback = catalog.markets.find((market) => market.key === marketKey);
      return MARKET_COLORS[(fallback?.id ?? 0) % MARKET_COLORS.length] ?? colors.faint;
    }
    const sovereignTag =
      (entry.id !== undefined
        ? countryTagById.get(regionByPolityId.get(entry.id)?.countryId ?? -1)
        : undefined) ??
      entry.sovereignTag ??
      (entry.kind === "state" ? entry.tag : null);
    const base = nationColor(sovereignTag ?? entry.tag);
    if (entry.kind === "territory") return lighten(base, 0.3);
    if (playerTag !== null && entry.tag === playerTag) return colors.player;
    return base;
  };

  const occupationFor = (polity: DecodedPolity) => {
    if (layer !== "control" && layer !== "political") return null;
    const region = regionByPolityId.get(polity.entry.id);
    if (region === undefined || region.controllerCountryId === null) return null;
    const controllerTag = countryTagById.get(region.controllerCountryId) ?? null;
    return controllerTag;
  };

  /**
   * Platform-specific selection props for an SVG country shape.
   *
   * On web, `react-native-svg`'s `WebShape` treats `onPress`/`onPressIn` as React
   * Native touchables and injects `onStartShouldSetResponder`, `onResponder*` and
   * `onPressIn` into a DOM SVG node. React DOM rejects those as unknown event
   * handler properties, which produced the repeated WebShape console errors for
   * every interactive polity. The web build instead listens to the ordinary DOM
   * click in the capture phase; native keeps the touchable props. `onClickCapture`
   * is not rewritten by `WebShape.prepare`, unlike `onClick`.
   *
   * Pointer hover is already handled by the container's `onPointerMove`, so the
   * web branch does not need `onPressIn`.
   */
  const polityPressProps = (tag: string): object =>
    Platform.OS === "web"
      ? {
          onClickCapture: () => {
            // A drag ends with a browser click; do not turn map panning into a
            // country selection.
            if (suppressClickRef.current) return;
            onSelect(tag);
          },
        }
      : {
          onPress: () => onSelect(tag),
          onPressIn: () => setHoveredTag(tag),
        };

  const provincePressProps = (province: DecodedProvince): object => {
    const ownerTag = ownerTagByProvinceId.get(province.id) ?? province.initialOwnerTag;
    const ownership = ownershipByProvinceId.get(province.id);
    const ownerPolityId = ownership?.ownerPolityId ?? province.initialOwnerPolityId;
    // A future successor polity has no active simulation country to open. The
    // province can still be inspected; country selection stays on the last
    // active country instead of resolving a same-tag 1900 territory incorrectly.
    const selectOwner = ownerPolityId < 1000;
    const select = (): void => {
      onSelectProvince?.(province.id);
      if (selectOwner) onSelect(ownerTag);
    };
    return Platform.OS === "web"
      ? {
          onClickCapture: () => {
            if (suppressClickRef.current) return;
            select();
          },
        }
      : {
          onPress: select,
          onPressIn: () => {
            setHoveredProvinceId(province.id);
            setHoveredTag(ownerTag);
          },
        };
  };

  /**
   * Screen-constant country labels with a simple collision cull.
   *
   * Labels used to be 6 viewBox units divided by the zoom scale, which is about
   * five screen pixels at every zoom level. They are now ~12 px on screen with a
   * dark halo, and a larger country wins the space when two labels overlap.
   * The selected or player country is always a candidate.
   */
  const screenScale = Math.max(viewScale * scale, 0.0001);
  const labelLayout = useMemo(() => {
    const visible = {
      left: -translate.x / scale,
      right: (MAP_WIDTH - translate.x) / scale,
      top: -translate.y / scale,
      bottom: (MAP_HEIGHT - translate.y) / scale,
    };
    const placed: {
      readonly tag: string;
      readonly name: string;
      readonly x: number;
      readonly y: number;
      readonly fontSize: number;
      readonly selected: boolean;
    }[] = [];
    const boxes: { left: number; right: number; top: number; bottom: number }[] = [];
    const candidates = polities.filter((polity) => {
      if (polity.markerOnly === true) return false;
      if (polity.tag === selectedTag) return true;
      if (playerTag !== null && polity.tag === playerTag) return true;
      if (scale >= 2.6) return !polity.small;
      if (scale >= 1.8) return polity.area > 6;
      if (scale >= 1.25) return polity.area > 15;
      return polity.area > 90;
    });
    candidates.sort((left, right) => {
      const leftSelected = left.tag === selectedTag ? 1 : 0;
      const rightSelected = right.tag === selectedTag ? 1 : 0;
      if (leftSelected !== rightSelected) return rightSelected - leftSelected;
      return right.area - left.area;
    });
    for (const polity of candidates) {
      const selected = polity.tag === selectedTag;
      const name = polity.entry.commonName;
      const [x, y] = polity.centroid;
      /*
       * Size the label to the country on screen. A large state gets a large
       * name that sits inside its outline; a small state keeps a readable but
       * modest label. The text is also capped by the width available for this
       * specific name so long names do not spill across neighbours.
       */
      const countryWidth = Math.max(
        (polity.screenBox[2] - polity.screenBox[0]) * screenScale,
        1,
      );
      const countryHeight = Math.max(
        (polity.screenBox[3] - polity.screenBox[1]) * screenScale,
        1,
      );
      const fitByWidth = countryWidth / (Math.max(name.length, 1) * 0.68);
      const fitByHeight = countryHeight * 0.48;
      const areaBased = Math.sqrt(countryWidth * countryHeight) * 0.14;
      const screenFontSize = Math.max(
        7,
        Math.min(24, fitByWidth, fitByHeight, areaBased),
      );
      const fontSize = (screenFontSize + (selected ? 1.5 : 0)) / screenScale;
      const width = name.length * fontSize * 0.68 + 8 / screenScale;
      const height = fontSize * 1.35;
      const box = {
        left: x - width / 2,
        right: x + width / 2,
        top: y - height / 2,
        bottom: y + height / 2,
      };
      // A label that does not fit the visible world rectangle is clipped by the
      // SVG viewport and leaves stray fragments at the map edge; skip it.
      if (
        box.left < visible.left ||
        box.right > visible.right ||
        box.top < visible.top ||
        box.bottom > visible.bottom
      ) {
        continue;
      }
      if (
        boxes.some(
          (existing) =>
            !(
              box.right < existing.left ||
              box.left > existing.right ||
              box.bottom < existing.top ||
              box.top > existing.bottom
            ),
        )
      ) {
        continue;
      }
      boxes.push(box);
      placed.push({ tag: polity.tag, name, x, y, fontSize, selected });
    }
    return placed;
  }, [playerTag, polities, scale, screenScale, selectedTag, translate.x, translate.y]);

  const hoveredProvince =
    hoveredProvinceId === null ? null : (provinceById.get(hoveredProvinceId) ?? null);
  const hoveredProvinceOwner =
    hoveredProvince === null ? null : (ownerTagByProvinceId.get(hoveredProvince.id) ?? null);
  const hoveredProvinceControllerTag =
    hoveredProvince === null
      ? null
      : (() => {
          const ownership = ownershipByProvinceId.get(hoveredProvince.id);
          if (
            ownership === undefined ||
            ownership.controllerPolityId === ownership.ownerPolityId
          ) {
            return null;
          }
          return tagForPolityId(ownership.controllerPolityId);
        })();
  const hovered = hoveredTag === null ? null : (entryByTag.get(hoveredTag) ?? null);
  const tooltipLeft = hoverPoint === null ? 0 : Math.min(Math.max(hoverPoint.x + 12, 8), Math.max(size.width - 220, 8));
  const tooltipTop = hoverPoint === null ? 0 : Math.min(Math.max(hoverPoint.y + 12, 8), Math.max(size.height - 90, 8));

  return (
    <View
      ref={containerRef}
      style={[styles.container, { height }]}
      onLayout={onLayout}
      {...(Platform.OS === "web"
        ? ({
            onPointerMove: handlePointerMove,
            onPointerLeave: () => {
              setHoveredTag(null);
              setHoveredProvinceId(null);
              setHoverPoint(null);
            },
          } as object)
        : {})}
    >
      <View style={styles.mapFrame} {...panResponder.panHandlers}>
        {size.width > 0 ? (
          <Svg width={size.width} height={size.height} viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}>
            <Rect x={0} y={0} width={MAP_WIDTH} height={MAP_HEIGHT} fill={colors.mapOcean} />
            <G transform={`translate(${translate.x} ${translate.y}) scale(${scale})`}>
              {/*
                The neutral land mask must share the country group transform.
                Drawing it outside this group makes it stay at world scale while
                the political fills zoom, producing a stale "land" overlay over
                the ocean at every zoom above 1.
              */}
              <Path
                d={landPath}
                fill={colors.mapLand}
                fillRule="evenodd"
                /*
                 * The land mask is the single coastline source. Polity borders
                 * are skipped for province-owning 1900 polities, so this stroke
                 * is not duplicated along Europe; non-European polities share
                 * the identical outline rather than a separate simplified one.
                 */
                stroke={colors.mapBorder}
                strokeWidth={0.9 / scale}
                pointerEvents="none"
              />
              {polities.map((polity) => {
                const isSelected = selectedTag === polity.tag;
                const isHovered = hoveredTag === polity.tag;
                const dimmed =
                  layer === "markets" &&
                  highlightMarketId !== null &&
                  marketIdFor(polity) !== highlightMarketId;
                // A ringless polity has no fill. Its marker is rendered by the
                // marker layer below, so it remains visible and selectable.
                if (polity.path === null) return null;
                return (
                  <Path
                    key={polity.tag}
                    d={polity.path}
                    fill={fillFor(polity)}
                    fillRule="evenodd"
                    stroke="none"
                    {...polityPressProps(polity.tag)}
                    accessibilityLabel={`${polity.entry.name}`}
                    opacity={dimmed ? 0.18 : isHovered && !isSelected ? 0.92 : 1}
                  />
                );
              })}
              {showProvinces
                ? provinces.map((province) => {
                    if (province.path === null) return null;
                    const isSelected =
                      selectedProvinceId !== null && province.id === selectedProvinceId;
                    const isHovered =
                      hoveredProvinceId !== null && province.id === hoveredProvinceId;
                    const dimmed =
                      layer === "markets" &&
                      highlightMarketId !== null &&
                      (regionByPolityId.get(province.simulationRegionId)?.marketId ?? null) !==
                        highlightMarketId;
                    return (
                      <Path
                        key={`province-${String(province.id)}`}
                        d={province.path}
                        fill={provinceFillFor(province)}
                        fillRule="evenodd"
                        stroke={provinceFillFor(province)}
                        strokeWidth={0.35 / scale}
                        {...provincePressProps(province)}
                        accessibilityLabel={`${province.displayName}, ${
                          ownerTagByProvinceId.get(province.id) ?? province.initialOwnerTag
                        }`}
                        opacity={dimmed ? 0.18 : isHovered && !isSelected ? 0.94 : 1}
                      />
                    );
                  })
                : null}
              {/*
                Provincial boundaries: one dotted white layer for every internal
                province edge, including neighbours of the same country. A
                stronger solid layer is drawn only where the current owners of the
                two provinces differ, so national borders remain derived from
                provincial ownership rather than from the 1900 polity outlines.
              */}
              {showProvinces && provinceBorderPaths.dotted.length > 0 ? (
                <Path
                  d={provinceBorderPaths.dotted}
                  fill="none"
                  stroke={PROVINCE_BORDER_COLOR}
                  strokeWidth={PROVINCE_BORDER_WIDTH / scale}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  strokeDasharray={`${PROVINCE_DASH_ON / scale} ${PROVINCE_DASH_OFF / scale}`}
                  opacity={scale >= 2 ? 0.78 : scale >= 1.25 ? 0.62 : 0.42}
                  pointerEvents="none"
                />
              ) : null}
              {showProvinces && provinceBorderPaths.national.length > 0 ? (
                <Path
                  d={provinceBorderPaths.national}
                  fill="none"
                  stroke={colors.mapBorder}
                  strokeWidth={COUNTRY_BORDER_WIDTH / scale}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  pointerEvents="none"
                />
              ) : null}
              {selectedProvinceId === null
                ? null
                : (() => {
                    const selected = provinceById.get(selectedProvinceId);
                    if (selected === undefined) return null;
                    const path = provinces.find(
                      (province) => province.id === selected.id,
                    )?.path;
                    if (path === null || path === undefined) return null;
                    return (
                      <Path
                        d={path}
                        fill="none"
                        fillRule="evenodd"
                        stroke={colors.accentStrong}
                        strokeWidth={1.4 / scale}
                        strokeLinejoin="round"
                        pointerEvents="none"
                      />
                    );
                  })()}
              {showProvinces && selectedCountryProvincePath !== null ? (
                <Path
                  d={selectedCountryProvincePath}
                  fill="none"
                  fillRule="evenodd"
                  stroke={colors.accentStrong}
                  strokeWidth={1.15 / scale}
                  strokeLinejoin="round"
                  opacity={0.9}
                  pointerEvents="none"
                />
              ) : null}
              {/*
                Borders are a separate layer after every fill. Drawing them while
                filling each polity lets a later neighbour's fill cover a shared
                border and makes lines appear/disappear with draw order. A 1900
                polity whose territory is covered by provinces is skipped: its
                international borders are reconstructed from current provincial
                ownership above, so a stale 1900 line never survives a transfer.
              */}
              {polities.map((polity) =>
                polity.path === null || (showProvinces && provinceOwnerTags.has(polity.tag)) ? null : (
                  <Path
                    key={`border-${polity.tag}`}
                    d={polity.path}
                    fill="none"
                    fillRule="evenodd"
                    stroke={colors.mapBorder}
                    strokeWidth={1.1 / scale}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    pointerEvents="none"
                  />
                ),
              )}
              {selectedTag === null
                ? null
                : (() => {
                    const selected = polities.find((polity) => polity.tag === selectedTag);
                    if (
                      selected === undefined ||
                      selected.path === null ||
                      (showProvinces && provinceOwnerTags.has(selected.tag))
                    ) {
                      return null;
                    }
                    return (
                      <Path
                        d={selected.path}
                        fill="none"
                        fillRule="evenodd"
                        stroke={colors.accentStrong}
                        strokeWidth={1.4 / scale}
                        strokeLinejoin="round"
                        pointerEvents="none"
                      />
                    );
                  })()}
              {polities.map((polity) => {
                const controllerTag = occupationFor(polity);
                if (controllerTag === null || polity.path === null) return null;
                return (
                  <Path
                    key={`occ-${polity.tag}`}
                    d={polity.path}
                    fill={nationColor(controllerTag)}
                    fillOpacity={0.42}
                    fillRule="evenodd"
                    stroke={nationColor(controllerTag)}
                    strokeWidth={1 / scale}
                    strokeDasharray={`${2 / scale} ${1.4 / scale}`}
                    pointerEvents="none"
                  />
                );
              })}
              {showProvinces
                ? provinces.map((province) => {
                    if (province.path === null) return null;
                    const ownership = ownershipByProvinceId.get(province.id);
                    if (
                      ownership === undefined ||
                      ownership.controllerPolityId === ownership.ownerPolityId
                    ) {
                      return null;
                    }
                    const controllerTag = tagForPolityId(ownership.controllerPolityId);
                    if (controllerTag === null) return null;
                    return (
                      <Path
                        key={`province-occ-${String(province.id)}`}
                        d={province.path}
                        fill={nationColor(controllerTag)}
                        fillOpacity={0.38}
                        fillRule="evenodd"
                        stroke={nationColor(controllerTag)}
                        strokeWidth={1 / scale}
                        strokeDasharray={`${2 / scale} ${1.4 / scale}`}
                        pointerEvents="none"
                      />
                    );
                  })
                : null}
              {labelLayout.map((label) => (
                <G key={`label-${label.tag}`} pointerEvents="none">
                  <SvgText
                    x={label.x}
                    y={label.y}
                    fill="none"
                    stroke={colors.mapOcean}
                    strokeWidth={3 / scale}
                    strokeLinejoin="round"
                    fontSize={label.fontSize}
                    fontWeight="700"
                    textAnchor="middle"
                  >
                    {label.name}
                  </SvgText>
                  <SvgText
                    x={label.x}
                    y={label.y}
                    fill={colors.textStrong}
                    fontSize={label.fontSize}
                    fontWeight={label.selected ? "800" : "700"}
                    textAnchor="middle"
                    opacity={0.98}
                  >
                    {label.name}
                  </SvgText>
                </G>
              ))}
              {polities.map((polity) => {
                const [cx, cy] = project(polity.entry.capital.lon, polity.entry.capital.lat);
                const isSelected = selectedTag === polity.tag;
                if (!isSelected && scale < 1.6) return null;
                return (
                  <Circle
                    key={`capital-${polity.tag}`}
                    cx={cx}
                    cy={cy}
                    r={(isSelected ? 2.6 : 1.8) / scale}
                    fill={colors.mapOcean}
                    stroke={isSelected ? colors.accentStrong : colors.textStrong}
                    strokeWidth={1 / scale}
                    pointerEvents="none"
                  />
                );
              })}
              {polities.map((polity) => {
                if (polity.markerOnly !== true && !polity.small) return null;
                const [x, y] = polity.centroid;
                const isSelected = selectedTag === polity.tag;
                return (
                  <Circle
                    key={`marker-${polity.tag}`}
                    cx={x}
                    cy={y}
                    r={(isSelected ? 5 : 3.2) / Math.max(scale, 0.8)}
                    fill={isSelected ? colors.accentStrong : colors.textStrong}
                    stroke={colors.mapBorder}
                    strokeWidth={0.8 / scale}
                    {...polityPressProps(polity.tag)}
                  />
                );
              })}
            </G>
          </Svg>
        ) : null}
      </View>

      {hoveredProvince !== null ? (
        <View style={[styles.tooltip, { left: tooltipLeft, top: tooltipTop }]} pointerEvents="none">
          <Text style={styles.tooltipTitle}>{hoveredProvince.displayName}</Text>
          <Text style={styles.tooltipMeta}>
            Province · owner {hoveredProvinceOwner ?? hoveredProvince.initialOwnerTag}
          </Text>
          <Text style={styles.tooltipMeta}>
            1900 owner: {hoveredProvince.initialOwnerTag} · {hoveredProvince.confidence} confidence
          </Text>
          <Text style={styles.tooltipMeta} numberOfLines={2}>
            {hoveredProvince.historicalAdminAffiliation}
          </Text>
          {hoveredProvince.historicalGrouping === null ? null : (
            <Text style={styles.tooltipMeta} numberOfLines={1}>
              Grouping: {hoveredProvince.historicalGrouping}
            </Text>
          )}
          {hoveredProvinceControllerTag === null ? null : (
            <Text style={styles.tooltipMeta}>
              Controlled by {hoveredProvinceControllerTag}
            </Text>
          )}
        </View>
      ) : hovered === null ? null : (
        <View style={[styles.tooltip, { left: tooltipLeft, top: tooltipTop }]} pointerEvents="none">
          <Text style={styles.tooltipTitle}>{hovered.name}</Text>
          <Text style={styles.tooltipMeta}>
            {statusLabel(hovered.status)} · {hovered.capital.name}
          </Text>
          {hovered.kind === "territory" && hovered.sovereignTag !== null ? (
            <Text style={styles.tooltipMeta}>
              Administered by {entryByTag.get(hovered.sovereignTag)?.name ?? hovered.sovereignTag}
            </Text>
          ) : null}
        </View>
      )}

      <View style={styles.controls}>
        <MapButton label="+" accessibilityLabel="Zoom in" onPress={() => zoomBy(1.5)} />
        <MapButton label="−" accessibilityLabel="Zoom out" onPress={() => zoomBy(1 / 1.5)} />
        <MapButton label="⤢" accessibilityLabel="Reset map view" onPress={resetView} />
      </View>

      {showLegend ? (
        <View style={styles.legend}>
          <Badge label={layer === "markets" ? "Market layer" : layer === "control" ? "Control layer" : "Political layer"} tone="accent" />
          <View style={styles.legendRow}>
            <View style={[styles.swatch, { backgroundColor: colors.player }]} />
            <Text style={styles.legendText}>Player</Text>
          </View>
          <View style={styles.legendRow}>
            <View style={[styles.swatch, { backgroundColor: "#b08a63" }]} />
            <Text style={styles.legendText}>Sovereign state</Text>
          </View>
          <View style={styles.legendRow}>
            <View style={[styles.swatch, { backgroundColor: lighten("#b08a63", 0.3) }]} />
            <Text style={styles.legendText}>Dependent territory</Text>
          </View>
          {showProvinces ? (
            <>
              <View style={styles.legendRow}>
                <View style={[styles.provinceLineSwatch]} />
                <Text style={styles.legendText}>Province boundary (dotted)</Text>
              </View>
              <View style={styles.legendRow}>
                <View style={[styles.countryLineSwatch]} />
                <Text style={styles.legendText}>Country border (from provinces)</Text>
              </View>
            </>
          ) : null}
          {layer === "political" || layer === "control" ? (
            <View style={styles.legendRow}>
              <View style={[styles.swatch, styles.occSwatch]} />
              <Text style={styles.legendText}>Military occupation overlay</Text>
            </View>
          ) : null}
          {hovered === null ? null : <Text style={styles.legendHint}>Click a territory to inspect it.</Text>}
        </View>
      ) : null}
    </View>
  );
}

function MapButton({
  label,
  accessibilityLabel,
  onPress,
}: {
  readonly label: string;
  readonly accessibilityLabel: string;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [styles.mapButton, pressed ? styles.mapButtonPressed : null]}
    >
      <Text style={styles.mapButtonLabel}>{label}</Text>
    </Pressable>
  );
}

export function statusLabel(status: string): string {
  switch (status) {
    case "independent":
      return "Independent state";
    case "personal-union":
      return "Personal union";
    case "autonomous-vassal":
      return "Autonomous vassal";
    case "dominion":
      return "Self-governing dominion";
    case "self-governing-colony":
      return "Self-governing colony";
    case "protectorate":
      return "Protectorate";
    case "colony":
      return "Colony";
    case "occupation":
      return "Under occupation";
    case "autonomous-province":
      return "Autonomous province";
    case "dependency":
      return "Dependency";
    default:
      return status;
  }
}

export function marketOfEntry(
  entry: WorldCatalogEntry,
  catalog: WorldCatalogData,
): WorldCatalogMarket | null {
  if (entry.market === null) return null;
  return catalog.markets.find((market) => market.key === entry.market) ?? null;
}

const styles = StyleSheet.create({
  container: {
    position: "relative",
    width: "100%",
    backgroundColor: colors.mapOcean,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 4,
    overflow: "hidden",
  },
  mapFrame: { flex: 1 },
  controls: { position: "absolute", right: 8, top: 8, gap: 4 },
  mapButton: {
    width: 28,
    height: 28,
    borderRadius: 3,
    backgroundColor: "rgba(11, 16, 20, 0.82)",
    borderColor: colors.borderStrong,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  mapButtonPressed: { backgroundColor: colors.surfaceHover },
  mapButtonLabel: { color: colors.text, fontSize: 15, lineHeight: 18 },
  legend: {
    position: "absolute",
    left: 8,
    bottom: 8,
    backgroundColor: "rgba(11, 16, 20, 0.88)",
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 3,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    gap: 3,
    maxWidth: 230,
  },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendText: { ...type.tiny, color: colors.muted },
  legendHint: { ...type.tiny, color: colors.faint, marginTop: 2 },
  swatch: { width: 10, height: 10, borderRadius: 1 },
  provinceLineSwatch: {
    width: 18,
    height: 0,
    borderTopWidth: 1,
    borderTopColor: "#f4f1e6",
    borderStyle: "dotted",
  },
  countryLineSwatch: {
    width: 18,
    height: 0,
    borderTopWidth: 2,
    borderTopColor: colors.mapBorder,
  },
  occSwatch: {
    backgroundColor: colors.red,
    opacity: 0.5,
    borderWidth: 1,
    borderColor: colors.red,
    borderStyle: "dashed",
  },
  tooltip: {
    position: "absolute",
    maxWidth: 210,
    backgroundColor: "rgba(8, 12, 16, 0.95)",
    borderColor: colors.borderStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 3,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    gap: 1,
  },
  tooltipTitle: { ...type.body, color: colors.textStrong, fontWeight: "700" },
  tooltipMeta: { ...type.tiny, color: colors.muted },
});

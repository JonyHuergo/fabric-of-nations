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
  readonly path: string;
  readonly centroid: readonly [number, number];
  readonly screenBox: readonly [number, number, number, number];
  readonly points: readonly (readonly number[][])[];
}

function miller(latDegrees: number): number {
  const lat = (Math.max(-89.9, Math.min(89.9, latDegrees)) * Math.PI) / 180;
  return 1.25 * Math.log(Math.tan(Math.PI / 4 + 0.4 * lat));
}
const MILLER_MAX = miller(89.9);

function project(lon: number, lat: number): [number, number] {
  return [((lon + 180) / 360) * MAP_WIDTH, ((MILLER_MAX - miller(lat)) / (2 * MILLER_MAX)) * MAP_HEIGHT];
}

function decodeRing(flat: readonly number[]): number[][] {
  const points: number[][] = [];
  let x = 0;
  let y = 0;
  for (let index = 0; index < flat.length; index += 2) {
    x += flat[index] ?? 0;
    y += flat[index + 1] ?? 0;
    const [px, py] = project(x / 1000, y / 1000);
    points.push([px, py]);
  }
  return points;
}

function pathForRings(rings: readonly (readonly number[])[]): string {
  const commands: string[] = [];
  for (const flat of rings) {
    const points = decodeRing(flat);
    if (points.length < 3) continue;
    // Draw at the antimeridian-adjacent copies so unwrapped rings wrap cleanly.
    for (const offset of [-MAP_WIDTH, 0, MAP_WIDTH]) {
      const [startX = 0, startY = 0] = points[0] ?? [];
      commands.push(`M${(startX + offset).toFixed(1)} ${startY.toFixed(1)}`);
      for (let index = 1; index < points.length; index += 1) {
        const [x = 0, y = 0] = points[index] ?? [];
        commands.push(`L${(x + offset).toFixed(1)} ${y.toFixed(1)}`);
      }
      commands.push("Z");
    }
  }
  return commands.join("");
}

function pathFor(polity: WorldMapPolity): string {
  return pathForRings(polity.rings);
}

function centroidOf(polity: WorldMapPolity): [number, number] {
  const [lon, lat] = polity.label;
  return project(lon, lat);
}

function pointInRing(x: number, y: number, points: readonly number[][]): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const [xi = 0, yi = 0] = points[i] ?? [];
    const [xj = 0, yj = 0] = points[j] ?? [];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
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
}: WorldMapProps) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [hoveredTag, setHoveredTag] = useState<string | null>(null);
  const gestureRef = useRef({ x: 0, y: 0, distance: 0 });
  /** DOM node used to attach a non-passive web wheel listener. */
  const containerRef = useRef<ComponentRef<typeof View> | null>(null);

  const [hoverPoint, setHoverPoint] = useState<{ x: number; y: number } | null>(null);
  const gesturing = useRef({ x: 0, y: 0 });
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
      return {
        ...polity,
        entry,
        path: pathFor(polity),
        centroid,
        screenBox: [topLeft[0], topLeft[1], bottomRight[0], bottomRight[1]],
        points: polity.rings.map((flat) => decodeRing(flat)),
      };
    });
  }, [entryByTag, map.polities]);

  const landPath = useMemo(() => {
    const commands: string[] = [];
    for (const flat of map.land) {
      const points = decodeRing(flat);
      if (points.length < 3) continue;
      for (const offset of [-MAP_WIDTH, 0, MAP_WIDTH]) {
        const [startX = 0, startY = 0] = points[0] ?? [];
        commands.push(`M${(startX + offset).toFixed(1)} ${startY.toFixed(1)}`);
        for (let index = 1; index < points.length; index += 1) {
          const [x = 0, y = 0] = points[index] ?? [];
          commands.push(`L${(x + offset).toFixed(1)} ${y.toFixed(1)}`);
        }
        commands.push("Z");
      }
    }
    return commands.join("");
  }, [map.land]);

  const disputedAreas = useMemo(
    () =>
      map.disputedAreas.map((area) => ({
        ...area,
        path: pathForRings(area.rings),
      })),
    [map.disputedAreas],
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
        onPanResponderRelease: () => {
          gestureRef.current.distance = 0;
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
      const polity = pickAt(world[0], world[1]);
      setHoveredTag(polity?.tag ?? null);
    },
    [pickAt, screenToWorld],
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

  const labelVisible = (polity: DecodedPolity): boolean => {
    if (polity.markerOnly === true) return false;
    if (scale >= 2.6) return !polity.small;
    if (scale >= 1.8) return polity.area > 2;
    if (scale >= 1.25) return polity.area > 8;
    return polity.area > 55;
  };

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
                stroke={colors.mapBorder}
                strokeWidth={0.35 / scale}
                pointerEvents="none"
              />
              {polities.map((polity) => {
                const isSelected = selectedTag === polity.tag;
                const isHovered = hoveredTag === polity.tag;
                const dimmed =
                  layer === "markets" &&
                  highlightMarketId !== null &&
                  marketIdFor(polity) !== highlightMarketId;
                return (
                  <Path
                    key={polity.tag}
                    d={polity.path}
                    fill={fillFor(polity)}
                    fillRule="evenodd"
                    stroke="none"
                    onPress={() => onSelect(polity.tag)}
                    onPressIn={() => setHoveredTag(polity.tag)}
                    accessibilityLabel={`${polity.entry.name}`}
                    opacity={dimmed ? 0.18 : isHovered && !isSelected ? 0.92 : 1}
                  />
                );
              })}
              {disputedAreas.map((area) => (
                <Path
                  key={`disputed-${area.id}`}
                  d={area.path}
                  fill="rgba(216, 179, 74, 0.18)"
                  fillRule="evenodd"
                  stroke="#d8b34a"
                  strokeWidth={0.7 / scale}
                  strokeDasharray={`${3 / scale} ${2 / scale}`}
                  strokeLinejoin="round"
                  pointerEvents="none"
                />
              ))}
              {/*
                Borders are a separate layer after every fill. Drawing them while
                filling each polity lets a later neighbour's fill cover a shared
                border and makes lines appear/disappear with draw order.
              */}
              {polities.map((polity) => (
                <Path
                  key={`border-${polity.tag}`}
                  d={polity.path}
                  fill="none"
                  fillRule="evenodd"
                  stroke={colors.mapBorder}
                  strokeWidth={0.32 / scale}
                  strokeLinejoin="round"
                  pointerEvents="none"
                />
              ))}
              {selectedTag === null
                ? null
                : (() => {
                    const selected = polities.find((polity) => polity.tag === selectedTag);
                    if (selected === undefined) return null;
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
                if (controllerTag === null) return null;
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
              {polities.map((polity) => {
                if (!labelVisible(polity) || polity.markerOnly === true) return null;
                const [x, y] = polity.centroid;
                const isSelected = selectedTag === polity.tag;
                return (
                  <SvgText
                    key={`label-${polity.tag}`}
                    x={x}
                    y={y}
                    fill={isSelected ? colors.accentStrong : colors.text}
                    fontSize={(isSelected ? 7.5 : 6) / Math.max(scale, 0.7)}
                    fontWeight="600"
                    textAnchor="middle"
                    stroke={colors.mapOcean}
                    strokeWidth={0.6 / scale}
                    opacity={0.95}
                    /*
                     * Labels are drawn at the polity centroid, which is exactly
                     * where a player is most likely to click. Without this the
                     * text becomes the pointer target and selection silently
                     * fails for every labelled country.
                     */
                    pointerEvents="none"
                  >
                    {polity.entry.commonName}
                  </SvgText>
                );
              })}
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
                    onPress={() => onSelect(polity.tag)}
                  />
                );
              })}
            </G>
          </Svg>
        ) : null}
      </View>

      {hovered === null ? null : (
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
          {map.disputedAreas.length > 0 && layer === "political" ? (
            <View style={styles.legendRow}>
              <View style={[styles.swatch, styles.disputedSwatch]} />
              <Text style={styles.legendText}>Disputed / no established administration</Text>
            </View>
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
  occSwatch: {
    backgroundColor: colors.red,
    opacity: 0.5,
    borderWidth: 1,
    borderColor: colors.red,
    borderStyle: "dashed",
  },
  disputedSwatch: {
    backgroundColor: "rgba(216, 179, 74, 0.18)",
    borderWidth: 1,
    borderColor: "#d8b34a",
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

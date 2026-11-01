import { useEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { SimulationSnapshot } from "@century/sim-worker";

import { PROVINCE_MAP_1900 } from "../provinceMapBundle";
import { colors, fonts, spacing, type } from "../theme";
import type { WorldCatalogData } from "../worldCatalogTypes";
import { statusLabel } from "./statusLabel";
import { MapEngine } from "./mapEngine";
import {
  MAP_MODES,
  buildProvinceStates,
  type MapDataContext,
  type MapLegendEntry,
  type MapModeId,
} from "./mapModes";
import { rgbToCss } from "./politicalPalette";

export interface GlWorldMapProps {
  readonly catalog: WorldCatalogData;
  readonly snapshot: SimulationSnapshot | null;
  readonly selectedTag: string | null;
  readonly onSelect: (tag: string) => void;
  readonly layer: MapModeId;
  readonly playerTag: string | null;
  readonly height: number;
  /** Fill the parent instead of using `height`. */
  readonly fill: boolean;
  readonly showLegend: boolean;
  readonly highlightMarketId: number | null;
  readonly selectedProvinceId: number | null;
  readonly onSelectProvince: ((provinceId: number | null) => void) | undefined;
  /** Screen space covered by a docked panel; framing stays clear of it. */
  readonly insetRight: number;
  /** Rendered above the map, for host-screen controls. */
  readonly overlay: ReactNode;
  /** The WebGL map cannot run here; the host renders the SVG map instead. */
  readonly onUnavailable: () => void;
}

const HOVER_CARD_WIDTH = 236;
const HOVER_CARD_OFFSET = 14;

export function GlWorldMap({
  catalog,
  snapshot,
  selectedTag,
  onSelect,
  layer,
  playerTag,
  height,
  fill,
  showLegend,
  highlightMarketId,
  selectedProvinceId,
  onSelectProvince,
  insetRight,
  overlay,
  onUnavailable,
}: GlWorldMapProps) {
  const surfaceRef = useRef<ComponentRef<typeof View> | null>(null);
  const cardRef = useRef<ComponentRef<typeof View> | null>(null);
  const engineRef = useRef<MapEngine | null>(null);
  const [ready, setReady] = useState(false);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  /** A selection made on the map itself must not move the camera. */
  const selectionFromMapRef = useRef(false);
  const focusedTagRef = useRef<string | null>(null);

  const provinceMap = PROVINCE_MAP_1900;
  const states = useMemo(
    () => buildProvinceStates(provinceMap, catalog, snapshot),
    [catalog, provinceMap, snapshot],
  );
  const entryByTag = useMemo(
    () => new Map(catalog.entries.map((entry) => [entry.tag, entry] as const)),
    [catalog],
  );
  const marketNames = useMemo(
    () =>
      new Map<number, string>(
        (snapshot?.markets ?? catalog.markets).map((market) => [market.id, market.name] as const),
      ),
    [catalog, snapshot?.markets],
  );
  const context = useMemo<MapDataContext>(
    () => ({
      provinces: provinceMap.provinces,
      states,
      entryByTag,
      marketNames,
      highlightMarketId,
    }),
    [entryByTag, highlightMarketId, marketNames, provinceMap.provinces, states],
  );
  const mode = MAP_MODES[layer];
  const selectedProvinceIndex = useMemo(() => {
    if (selectedProvinceId === null) return null;
    const index = provinceMap.provinces.findIndex((province) => province.id === selectedProvinceId);
    return index < 0 ? null : index;
  }, [provinceMap.provinces, selectedProvinceId]);

  const latest = useRef({ states, onSelect, onSelectProvince, entryByTag, provinceMap });
  latest.current = { states, onSelect, onSelectProvince, entryByTag, provinceMap };

  useEffect(() => {
    const node = surfaceRef.current as unknown as HTMLElement | null;
    if (node === null) return;
    let cancelled = false;
    const engine = new MapEngine(node, provinceMap, {
      onHoverChange: setHoverIndex,
      onHoverMove: (x, y) => {
        const card = cardRef.current as unknown as HTMLElement | null;
        if (card === null) return;
        const parent = node.getBoundingClientRect();
        const left = x + HOVER_CARD_OFFSET + HOVER_CARD_WIDTH > parent.width ? x - HOVER_CARD_WIDTH - HOVER_CARD_OFFSET : x + HOVER_CARD_OFFSET;
        const top = Math.min(y + HOVER_CARD_OFFSET, parent.height - card.offsetHeight - 8);
        card.style.left = `${String(Math.round(Math.max(8, left)))}px`;
        card.style.top = `${String(Math.round(Math.max(8, top)))}px`;
      },
      onProvincePress: (index) => {
        const { states: current, onSelect: select, onSelectProvince: selectProvince, entryByTag: entries, provinceMap: map } = latest.current;
        const province = map.provinces[index];
        const state = current[index];
        if (province === undefined || state === undefined) return;
        selectProvince?.(province.id);
        // A future successor polity has no catalogue entry to open; the province
        // can still be inspected and country selection stays where it was.
        if (entries.has(state.unitTag)) {
          selectionFromMapRef.current = true;
          select(state.unitTag);
        }
      },
      onSeaPress: () => latest.current.onSelectProvince?.(null),
    });
    engineRef.current = engine;
    engine
      .start()
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.warn("WebGL map unavailable, using the SVG map:", error);
        onUnavailable();
      });
    return () => {
      cancelled = true;
      engine.destroy();
      engineRef.current = null;
    };
    // The engine lives for the component's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    engineRef.current?.setInsetRight(insetRight);
  }, [insetRight, ready]);

  useEffect(() => {
    if (!ready) return;
    engineRef.current?.setData({
      mode,
      context,
      selectedTag,
      playerTag,
      selectedProvinceIndex,
      catalog,
    });
  }, [catalog, context, mode, playerTag, ready, selectedProvinceIndex, selectedTag]);

  useEffect(() => {
    if (!ready || selectedTag === null || focusedTagRef.current === selectedTag) return;
    const first = focusedTagRef.current === null;
    focusedTagRef.current = selectedTag;
    if (selectionFromMapRef.current) {
      selectionFromMapRef.current = false;
      return;
    }
    engineRef.current?.focusUnit(selectedTag, first);
  }, [ready, selectedTag]);

  const hovered = hoverIndex === null ? null : (provinceMap.provinces[hoverIndex] ?? null);
  const hoveredState = hoverIndex === null ? null : (states[hoverIndex] ?? null);
  const hoveredEntry = hoveredState === null ? null : (entryByTag.get(hoveredState.unitTag) ?? null);
  const legend = showLegend ? mode.legend(context) : [];

  return (
    <View style={[styles.container, fill ? styles.fill : { height }]}>
      <View ref={surfaceRef} style={styles.surface} />
      {ready ? null : (
        <View style={styles.loading} pointerEvents="none">
          <Text style={styles.loadingText}>Preparing the atlas…</Text>
        </View>
      )}
      {overlay}
      <View
        ref={cardRef}
        style={[styles.hoverCard, hovered === null ? styles.hidden : null]}
        pointerEvents="none"
      >
        {hovered === null || hoveredState === null ? null : (
          <>
            <Text style={styles.hoverTitle} numberOfLines={1}>
              {hovered.displayName}
            </Text>
            <Text style={styles.hoverUnit} numberOfLines={1}>
              {hoveredEntry?.commonName ?? hoveredState.unitTag}
              {hoveredEntry === null ? "" : ` · ${statusLabel(hoveredEntry.status)}`}
            </Text>
            <Text style={styles.hoverMeta} numberOfLines={2}>
              {hovered.historicalAdminAffiliation}
            </Text>
            {hoveredState.ownerTag === hovered.initialOwnerTag ? null : (
              <Text style={styles.hoverMeta}>
                Owner {hoveredState.ownerTag} · 1900 owner {hovered.initialOwnerTag}
              </Text>
            )}
            {hoveredState.controllerTag === hoveredState.ownerTag ? null : (
              <Text style={styles.hoverWarning}>Controlled by {hoveredState.controllerTag}</Text>
            )}
          </>
        )}
      </View>
      {showLegend ? (
        <View style={[styles.controls, { right: insetRight + 10 }]}>
          <MapControl label="+" accessibilityLabel="Zoom in" onPress={() => engineRef.current?.zoomIn()} />
          <MapControl label="−" accessibilityLabel="Zoom out" onPress={() => engineRef.current?.zoomOut()} />
          <MapControl label="⌂" accessibilityLabel="Reset map view" onPress={() => engineRef.current?.resetView()} />
        </View>
      ) : null}
      {legend.length === 0 ? null : <MapLegend title={mode.label} entries={legend} />}
    </View>
  );
}

function MapControl({
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
      style={({ pressed }) => [styles.control, pressed ? styles.controlPressed : null]}
    >
      <Text style={styles.controlLabel}>{label}</Text>
    </Pressable>
  );
}

function MapLegend({
  title,
  entries,
}: {
  readonly title: string;
  readonly entries: readonly MapLegendEntry[];
}) {
  return (
    <View style={styles.legend} pointerEvents="none">
      <Text style={styles.legendTitle}>{title}</Text>
      {entries.map((entry) => (
        <View key={entry.label} style={styles.legendRow}>
          <View
            style={[
              styles.swatch,
              { backgroundColor: rgbToCss(entry.color) },
              entry.hatched === true ? styles.swatchHatched : null,
            ]}
          />
          <Text style={styles.legendText} numberOfLines={1}>
            {entry.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const PANEL_BACKGROUND = "rgba(11, 16, 20, 0.86)";

const styles = StyleSheet.create({
  container: {
    position: "relative",
    width: "100%",
    backgroundColor: "#1e3a4d",
    overflow: "hidden",
  },
  fill: { flex: 1 },
  surface: { ...StyleSheet.absoluteFill },
  loading: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },
  loadingText: { fontFamily: fonts.display, fontSize: 13, color: "rgba(231, 225, 210, 0.7)", letterSpacing: 0.6 },
  hidden: { opacity: 0 },
  hoverCard: {
    position: "absolute",
    left: 0,
    top: 0,
    width: HOVER_CARD_WIDTH,
    backgroundColor: "rgba(9, 13, 17, 0.93)",
    borderLeftWidth: 2,
    borderLeftColor: colors.accent,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    gap: 1,
  },
  hoverTitle: { fontFamily: fonts.display, fontSize: 14, lineHeight: 18, fontWeight: "600", color: colors.textStrong },
  hoverUnit: { ...type.small, color: colors.text },
  hoverMeta: { ...type.tiny, color: colors.muted },
  hoverWarning: { ...type.tiny, color: colors.red },
  controls: { position: "absolute", bottom: 12, gap: 1 },
  control: {
    width: 30,
    height: 30,
    backgroundColor: PANEL_BACKGROUND,
    alignItems: "center",
    justifyContent: "center",
  },
  controlPressed: { backgroundColor: colors.surfaceHover },
  controlLabel: { color: colors.text, fontSize: 16, lineHeight: 19 },
  legend: {
    position: "absolute",
    left: 10,
    bottom: 12,
    backgroundColor: PANEL_BACKGROUND,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    gap: 3,
    maxWidth: 220,
  },
  legendTitle: { ...type.label, color: colors.accent },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendText: { ...type.tiny, color: colors.muted },
  swatch: { width: 11, height: 11 },
  swatchHatched: { opacity: 0.7, borderWidth: 1, borderColor: colors.text, borderStyle: "dashed" },
});

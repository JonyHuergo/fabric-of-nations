import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, forwardRef } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { SimulationSnapshot } from "@century/sim-worker";

import { PROVINCE_CATALOG } from "../../generated/provinceCatalog";
import { colors, spacing, themedSheet, type } from "../../theme";
import type { WorldCatalogData } from "../../worldCatalogTypes";
import { encodeMapMessage, parseMapEvent, type MapCommand, type MapEvent } from "../bridge/protocol";
import type { ReservedBox } from "../labels";
import { buildProvinceStates, type MapModeId } from "../mapModes";
import { statusLabel } from "../statusLabel";
import type { EraId } from "../../design/tokens";
import { AtlasSurface, type AtlasSurfaceHandle } from "./AtlasSurface";
import { planMapCommands, type MapHostInputs } from "./mapHostState";

/** A page that says nothing for this long will not start. */
const READY_TIMEOUT_MS = 45_000;
/** One automatic reload after the system kills the page, then the fallback. */
const MAX_RELOADS = 2;

export interface MapPress {
  readonly x: number;
  readonly y: number;
}

export interface AtlasMapHandle {
  zoom(direction: "in" | "out"): void;
  resetView(): void;
  focusProvince(provinceId: number): void;
}

export interface AtlasMapProps {
  readonly catalog: WorldCatalogData;
  readonly snapshot: SimulationSnapshot | null;
  readonly eraId: EraId;
  readonly lens: MapModeId;
  readonly highlightMarketId: number | null;
  readonly selectedTag: string | null;
  readonly selectedProvinceId: number | null;
  readonly playerTag: string | null;
  readonly insetLeft: number;
  readonly insetRight: number;
  readonly reserved: readonly ReservedBox[];
  readonly drift: number;
  readonly onSelect: (tag: string) => void;
  readonly onSelectProvince: ((provinceId: number | null, press: MapPress | null) => void) | undefined;
  readonly onSeaPress: (() => void) | undefined;
  /** The map cannot run here; the host renders the SVG map instead. */
  readonly onUnavailable: (reason: string) => void;
}

const HOVER_CARD_WIDTH = 236;
const HOVER_CARD_OFFSET = 14;

/**
 * Runs the map on every platform. The heavy work happens in the atlas page; this
 * component only translates props into bridge commands and presses back into
 * selection. Commands wait for `ready`, and the latest state is replayed after a
 * reload, so losing the page never loses what the map should show.
 */
export const AtlasMap = forwardRef<AtlasMapHandle, AtlasMapProps>(function AtlasMap(
  {
    catalog,
    snapshot,
    eraId,
    lens,
    highlightMarketId,
    selectedTag,
    selectedProvinceId,
    playerTag,
    insetLeft,
    insetRight,
    reserved,
    drift,
    onSelect,
    onSelectProvince,
    onSeaPress,
    onUnavailable,
  },
  ref,
) {
  const surface = useRef<AtlasSurfaceHandle | null>(null);
  const [ready, setReady] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [hover, setHover] = useState<{ index: number; x: number; y: number } | null>(null);
  const reloads = useRef(0);
  const sent = useRef<MapHostInputs | null>(null);
  /** A selection made on the map itself must not move the camera. */
  const selectionFromMap = useRef(false);
  const focusedTag = useRef<string | null>(null);

  const provinces = PROVINCE_CATALOG.provinces;
  const baseStates = useMemo(() => buildProvinceStates(PROVINCE_CATALOG, catalog, null), [catalog]);
  const states = useMemo(() => buildProvinceStates(PROVINCE_CATALOG, catalog, snapshot), [catalog, snapshot]);
  const entryByTag = useMemo(
    () => new Map(catalog.entries.map((entry) => [entry.tag, entry])),
    [catalog],
  );
  const selectedProvinceIndex = useMemo(() => {
    if (selectedProvinceId === null) return null;
    const index = provinces.findIndex((province) => province.id === selectedProvinceId);
    return index < 0 ? null : index;
  }, [provinces, selectedProvinceId]);

  const latest = useRef({ states, onSelect, onSelectProvince, onSeaPress, onUnavailable });
  latest.current = { states, onSelect, onSelectProvince, onSeaPress, onUnavailable };

  const send = useCallback((command: MapCommand) => {
    surface.current?.send(encodeMapMessage(command));
  }, []);

  const handleEvent = useCallback(
    (event: MapEvent) => {
      switch (event.type) {
        case "ready":
          sent.current = null;
          focusedTag.current = null;
          setReady(true);
          return;
        case "unavailable":
          latest.current.onUnavailable(event.reason);
          return;
        case "context-lost":
          setReady(false);
          setReloadKey((key) => key + 1);
          return;
        case "province-press": {
          const province = provinces[event.index];
          const state = latest.current.states[event.index];
          if (province === undefined || state === undefined) return;
          latest.current.onSelectProvince?.(province.id, { x: event.x, y: event.y });
          // A future successor polity has no catalogue entry to open; the province
          // can still be inspected and country selection stays where it was.
          if (entryByTag.has(state.unitTag)) {
            selectionFromMap.current = true;
            latest.current.onSelect(state.unitTag);
          }
          return;
        }
        case "sea-press":
          latest.current.onSelectProvince?.(null, null);
          latest.current.onSeaPress?.();
          return;
        case "hover":
          setHover(event.index === null ? null : { index: event.index, x: event.x, y: event.y });
          return;
        default:
          return;
      }
    },
    [entryByTag, provinces],
  );

  const handleMessage = useCallback(
    (message: string) => {
      try {
        handleEvent(parseMapEvent(message));
      } catch (error) {
        console.warn("Ignored a malformed map message:", error);
      }
    },
    [handleEvent],
  );

  const handleFailure = useCallback((reason: string) => {
    setReady(false);
    if (reason === "process-gone" && reloads.current < MAX_RELOADS) {
      reloads.current += 1;
      setReloadKey((key) => key + 1);
      return;
    }
    latest.current.onUnavailable(reason);
  }, []);

  useEffect(() => {
    if (ready) return;
    const timer = setTimeout(() => latest.current.onUnavailable("The map did not start in time."), READY_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [ready, reloadKey]);

  useEffect(() => {
    if (!ready) return;
    const next: MapHostInputs = {
      eraId,
      lens,
      highlightMarketId,
      states,
      selectedTag,
      playerTag,
      selectedProvinceIndex,
      insetLeft,
      insetRight,
      reserved,
      drift,
    };
    for (const command of planMapCommands(sent.current, next, baseStates)) send(command);
    sent.current = next;
  }, [
    baseStates,
    drift,
    eraId,
    highlightMarketId,
    insetLeft,
    insetRight,
    lens,
    playerTag,
    ready,
    reserved,
    selectedProvinceIndex,
    selectedTag,
    send,
    states,
  ]);

  // A selection from a list flies to the place; one from the map leaves it alone.
  useEffect(() => {
    if (!ready || selectedTag === null || focusedTag.current === selectedTag) return;
    const first = focusedTag.current === null;
    focusedTag.current = selectedTag;
    if (selectionFromMap.current) {
      selectionFromMap.current = false;
      return;
    }
    send({ type: "focus-unit", tag: selectedTag, immediate: first });
  }, [ready, selectedTag, send]);

  useImperativeHandle(
    ref,
    () => ({
      zoom: (direction) => send({ type: "zoom", direction }),
      resetView: () => send({ type: "reset-view" }),
      focusProvince: (provinceId) => {
        const index = provinces.findIndex((province) => province.id === provinceId);
        if (index >= 0) send({ type: "focus-province", index });
      },
    }),
    [provinces, send],
  );

  const [surfaceWidth, setSurfaceWidth] = useState(0);
  const hovered = hover === null ? null : (provinces[hover.index] ?? null);
  const hoveredState = hover === null ? null : (states[hover.index] ?? null);
  const hoveredEntry = hoveredState === null ? null : (entryByTag.get(hoveredState.unitTag) ?? null);

  return (
    <View style={styles.container} onLayout={(event) => setSurfaceWidth(event.nativeEvent.layout.width)}>
      <AtlasSurface ref={surface} reloadKey={reloadKey} onMessage={handleMessage} onFailure={handleFailure} />
      {ready ? null : (
        <View style={styles.loading} pointerEvents="none">
          <Text style={styles.loadingText}>Preparing the atlas…</Text>
        </View>
      )}
      {drift !== 0 || hover === null || hovered === null || hoveredState === null ? null : (
        <View
          style={[
            styles.hoverCard,
            {
              left:
                hover.x + HOVER_CARD_OFFSET + HOVER_CARD_WIDTH > surfaceWidth - insetRight
                  ? Math.max(8, hover.x - HOVER_CARD_OFFSET - HOVER_CARD_WIDTH)
                  : hover.x + HOVER_CARD_OFFSET,
              top: Math.max(8, hover.y + HOVER_CARD_OFFSET),
            },
          ]}
          pointerEvents="none"
        >
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
        </View>
      )}
    </View>
  );
});

const styles = themedSheet(() => ({
  container: { ...StyleSheet.absoluteFill, backgroundColor: colors.mapOcean, overflow: "hidden" },
  loading: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },
  loadingText: { ...type.section, color: colors.muted },
  hoverCard: {
    position: "absolute",
    width: HOVER_CARD_WIDTH,
    backgroundColor: colors.chrome,
    borderLeftWidth: 2,
    borderLeftColor: colors.accent,
    borderRadius: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    gap: 1,
  },
  hoverTitle: { ...type.section, color: colors.textStrong },
  hoverUnit: { ...type.small, color: colors.text },
  hoverMeta: { ...type.tiny },
  hoverWarning: { ...type.tiny, color: colors.red },
}));

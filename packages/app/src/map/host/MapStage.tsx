import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Animated, StyleSheet } from "react-native";

import type { SimulationSnapshot } from "@century/sim-worker";

import type { EraId } from "../../design/tokens";
import { WORLD_CATALOG } from "../../generated/worldCatalog";
import { WORLD_MAP_1900 } from "../../generated/worldMap1900";
import { WorldMap } from "../../components/WorldMap";
import type { ReservedBox } from "../labels";
import type { MapModeId } from "../mapModes";
import type { AtlasMapHandle, MapPress } from "./AtlasMap";

/** What a screen wants the one map under it to show. */
export interface MapStageView {
  readonly selectedTag: string | null;
  readonly selectedProvinceId: number | null;
  readonly playerTag: string | null;
  readonly lens: MapModeId;
  readonly highlightMarketId: number | null;
  readonly insetLeft: number;
  readonly insetRight: number;
  readonly reserved: readonly ReservedBox[];
  /** Degrees of longitude per second the world turns behind a screen; 0 is still. */
  readonly drift: number;
}

export interface MapStageHandlers {
  readonly onSelect: (tag: string) => void;
  readonly onSelectProvince: (provinceId: number | null, press: MapPress | null) => void;
  readonly onSeaPress: () => void;
}

const DEFAULT_VIEW: MapStageView = {
  selectedTag: null,
  selectedProvinceId: null,
  playerTag: null,
  lens: "political",
  highlightMarketId: null,
  insetLeft: 0,
  insetRight: 0,
  reserved: [],
  drift: 0,
};

const NO_HANDLERS: MapStageHandlers = {
  onSelect: () => undefined,
  onSelectProvince: () => undefined,
  onSeaPress: () => undefined,
};

interface MapStageApi {
  readonly configure: (view: Partial<MapStageView>) => void;
  readonly setHandlers: (handlers: MapStageHandlers) => void;
  readonly map: () => AtlasMapHandle | null;
  /** Horizontal shift of the whole map surface, for making room beside a sheet. */
  readonly shift: Animated.Value;
}

const MapStageContext = createContext<MapStageApi | null>(null);

export function useMapStage(): MapStageApi {
  const value = useContext(MapStageContext);
  if (value === null) throw new Error("useMapStage must be used inside MapStageProvider");
  return value;
}

/**
 * Declare what the map should show while this component is on screen. Unset
 * fields fall back to the defaults, so one screen's selection cannot leak into
 * the next.
 */
export function useMapView(view: Partial<MapStageView>, handlers: Partial<MapStageHandlers>): void {
  const stage = useMapStage();
  const next: MapStageView = { ...DEFAULT_VIEW, ...view };
  useEffect(() => {
    stage.configure(next);
    // Every field is a value compared by identity; arrays must be memoised by the caller.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    next.selectedTag,
    next.selectedProvinceId,
    next.playerTag,
    next.lens,
    next.highlightMarketId,
    next.insetLeft,
    next.insetRight,
    next.reserved,
    next.drift,
  ]);
  const latest = useRef(handlers);
  latest.current = handlers;
  useEffect(() => {
    stage.setHandlers({
      onSelect: (tag) => latest.current.onSelect?.(tag),
      onSelectProvince: (id, press) => latest.current.onSelectProvince?.(id, press),
      onSeaPress: () => latest.current.onSeaPress?.(),
    });
    return () => stage.setHandlers(NO_HANDLERS);
  }, [stage]);
}

/**
 * The one map. "The map is always the screen": it is mounted here, under every
 * screen from the main menu to the game, and the WebView is created once. Screens
 * only slide over it and tell it what to show.
 */
export function MapStageProvider({
  snapshot,
  eraId,
  children,
}: {
  readonly snapshot: SimulationSnapshot | null;
  readonly eraId: EraId;
  readonly children: ReactNode;
}) {
  const [view, setView] = useState<MapStageView>(DEFAULT_VIEW);
  const handlers = useRef<MapStageHandlers>(NO_HANDLERS);
  const atlas = useRef<AtlasMapHandle | null>(null);
  const shift = useRef(new Animated.Value(0)).current;

  const configure = useCallback((changes: Partial<MapStageView>) => {
    setView((current) => ({ ...current, ...changes }));
  }, []);
  const setHandlers = useCallback((next: MapStageHandlers) => {
    handlers.current = next;
  }, []);
  const api = useMemo<MapStageApi>(
    () => ({ configure, setHandlers, map: () => atlas.current, shift }),
    [configure, setHandlers, shift],
  );
  const onSelect = useCallback((tag: string) => handlers.current.onSelect(tag), []);
  const onSelectProvince = useCallback(
    (provinceId: number | null, press: MapPress | null) => handlers.current.onSelectProvince(provinceId, press),
    [],
  );
  const onSeaPress = useCallback(() => handlers.current.onSeaPress(), []);

  return (
    <MapStageContext.Provider value={api}>
      <Animated.View style={[styles.stage, { transform: [{ translateX: shift }] }]}>
        <WorldMap
          ref={atlas}
          catalog={WORLD_CATALOG}
          map={WORLD_MAP_1900}
          snapshot={snapshot}
          eraId={eraId}
          selectedTag={view.selectedTag}
          onSelect={onSelect}
          layer={view.lens}
          playerTag={view.playerTag}
          highlightMarketId={view.highlightMarketId}
          selectedProvinceId={view.selectedProvinceId}
          onSelectProvince={onSelectProvince}
          onSeaPress={onSeaPress}
          insetLeft={view.insetLeft}
          insetRight={view.insetRight}
          reserved={view.reserved}
          drift={view.drift}
          fill
          showLegend={false}
        />
      </Animated.View>
      {children}
    </MapStageContext.Provider>
  );
}

const styles = StyleSheet.create({
  stage: StyleSheet.absoluteFill,
});

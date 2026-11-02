import { useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, Easing, Platform, Pressable, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { SimulationSnapshot } from "@century/sim-worker";

import { CountryFlag } from "../components/CountryFlag";
import { Dialog } from "../components/Dialog";
import { Icon } from "../components/icons";
import { Button, Divider, Ornament } from "../components/ui";
import { Vignette } from "../components/Vignette";
import { ERA_THEMES, shellMetrics } from "../design/tokens";
import { useReduceMotion } from "../design/useReduceMotion";
import { WORLD_CATALOG } from "../generated/worldCatalog";
import { useMapView } from "../map/host/MapStage";
import { TOUCH_TARGET, colors, fonts, spacing, themedSheet, type } from "../theme";
import type { SaveSlot } from "../storage/saveStorage";
import { longDate, saveEra, saveNation } from "./saveDisplay";

/**
 * How fast the world turns behind the title and load screens, in degrees of
 * longitude per second: one revolution in four minutes, slow enough to read the
 * borders going by.
 */
export const BACKDROP_DRIFT_DEGREES_PER_SECOND = 1.5;

/** The official name, set on two lines on the title screen. */
const GAME_NAME = "FABRIC OF NATIONS";

/**
 * The title screen. The map behind it is the world of the saved campaign, or the
 * world of 1 January 1900 when there is none, turning slowly like the Earth seen
 * from above. The menu holds only decisions; the reading lives in dialogs.
 */
export function MainMenuScreen({
  latestSave,
  savedWorld,
  loading,
  onContinue,
  onLoadGame,
  onNewGame,
  onShowProvenance,
}: {
  /** The most recently saved campaign, which Continue plays. */
  readonly latestSave: SaveSlot | null;
  /** That campaign's world once the worker has read it; null when unreadable. */
  readonly savedWorld: SimulationSnapshot | null | undefined;
  /** A save is being loaded. */
  readonly loading: boolean;
  readonly onContinue: () => void;
  readonly onLoadGame: () => void;
  readonly onNewGame: () => void;
  readonly onShowProvenance: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const safe = useSafeAreaInsets();
  const compact = shellMetrics(width, height).compact;
  const reduceMotion = useReduceMotion();
  const [codex, setCodex] = useState(false);

  const player = saveNation(latestSave, savedWorld);
  useMapView(
    { drift: reduceMotion ? 0 : BACKDROP_DRIFT_DEGREES_PER_SECOND, playerTag: player?.tag ?? null },
    {},
  );

  const savedDate =
    latestSave === null ? null : latestSave.metadata === null ? "Unreadable save" : longDate(latestSave.metadata.dateLabel);
  const era = latestSave === null ? ERA_THEMES.imperial : saveEra(latestSave);
  const playable = WORLD_CATALOG.entries.filter((entry) => entry.selectable).length;
  const territories = WORLD_CATALOG.entries.filter((entry) => entry.kind === "territory").length;

  // The title arrives first, then the entries one after another, then the caption.
  const entryCount = latestSave === null ? 2 : 4;
  const intro = useRef([...Array(entryCount + 2)].map(() => new Animated.Value(0))).current;
  useEffect(() => {
    Animated.stagger(
      90,
      intro.map((value) =>
        Animated.timing(value, {
          toValue: 1,
          duration: 700,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: Platform.OS !== "web",
        }),
      ),
    ).start();
  }, [intro]);
  const rise = (index: number, distance: number) => {
    const value = intro[Math.min(index, intro.length - 1)] ?? new Animated.Value(1);
    return {
      opacity: value,
      transform: [{ translateX: value.interpolate({ inputRange: [0, 1], outputRange: [-distance, 0] }) }],
    };
  };

  const left = safe.left + (compact ? spacing.xl : spacing.xxxl);
  const columnWidth = compact ? 320 : 480;
  return (
    <View style={styles.root} accessibilityLabel="Main menu">
      <Vignette variant="title" />

      <View
        style={[
          styles.column,
          {
            left,
            width: columnWidth,
            top: safe.top + (compact ? spacing.lg : spacing.xxl),
            bottom: safe.bottom + (compact ? spacing.sm : spacing.xl),
          },
        ]}
      >
        <Animated.View style={[styles.lockup, rise(0, 18)]} accessibilityRole="header">
          <Text style={type.eyebrow}>Grand strategy · 1900 – 2000</Text>
          <Text style={[styles.hero, compact ? styles.heroCompact : styles.heroRoomy]} accessibilityLabel="Fabric of Nations">
            {GAME_NAME.replace(" OF ", "\nOF ")}
          </Text>
          <Ornament width={compact ? 200 : 240} style={styles.heroRule} />
        </Animated.View>

        <View style={[styles.entries, compact ? null : styles.entriesRoomy]}>
          {latestSave === null ? null : (
            <>
              <Animated.View style={rise(1, 12)}>
                <MenuEntry
                  label={loading ? "Loading…" : "Continue"}
                  primary
                  disabled={loading}
                  onPress={onContinue}
                  detail={
                    <View style={styles.continueDetail}>
                      {player === null ? null : (
                        <CountryFlag polityId={player.id} tag={player.tag} size="topBar" />
                      )}
                      <Text style={styles.entryDetail} numberOfLines={1}>
                        {player === null ? "" : `${player.commonName} · `}
                        {savedDate}
                      </Text>
                    </View>
                  }
                />
              </Animated.View>
              <Animated.View style={rise(2, 12)}>
                <MenuEntry label="Load game" disabled={loading} onPress={onLoadGame} />
              </Animated.View>
            </>
          )}
          <Animated.View style={rise(entryCount - 1, 12)}>
            <MenuEntry label="New campaign" primary={latestSave === null} disabled={loading} onPress={onNewGame} />
          </Animated.View>
          <Animated.View style={rise(entryCount, 12)}>
            <MenuEntry label="The world of 1900" onPress={() => setCodex(true)} />
          </Animated.View>
        </View>

        <Text style={styles.version}>world {WORLD_CATALOG.meta.version}</Text>
      </View>

      <Animated.View
        pointerEvents="none"
        style={[
          styles.caption,
          { right: safe.right + (compact ? spacing.lg : spacing.xxl), bottom: safe.bottom + (compact ? spacing.md : spacing.xl) },
          { opacity: intro[intro.length - 1] ?? 1 },
        ]}
      >
        <Text style={styles.captionKicker}>
          {latestSave === null ? "The world" : "The world as saved"}
          {era === null ? "" : ` · ${era.label} era`}
        </Text>
        <Text style={styles.captionDate}>{savedDate ?? "1 January 1900"}</Text>
        <Ornament align="center" width={120} style={styles.captionRule} />
        <Text style={styles.captionMeta} numberOfLines={2}>
          {latestSave === null
            ? `${String(playable)} nations to lead · ${String(territories)} territories · ${String(WORLD_CATALOG.markets.length)} markets`
            : savedWorld === undefined
              ? "Reading the saved world…"
              : player === null
                ? "Your campaign"
                : `${player.commonName}, your nation, is outlined on the map`}
        </Text>
      </Animated.View>

      <Dialog
        visible={codex}
        kicker="Codex"
        title="The world of 1 January 1900"
        onRequestClose={() => setCodex(false)}
        scroll
        actions={
          <>
            <Button
              label="Sources & licensing"
              tone="ghost"
              onPress={() => {
                setCodex(false);
                onShowProvenance();
              }}
            />
            <Button label="Close" onPress={() => setCodex(false)} />
          </>
        }
      >
        <View style={styles.statGrid}>
          <CodexStat label="Playable states" value={String(playable)} />
          <CodexStat label="Territories" value={String(territories)} />
          <CodexStat label="Markets" value={String(WORLD_CATALOG.markets.length)} />
        </View>
        <Divider />
        <Text style={styles.codexHeading}>Nations and their dependencies</Text>
        <Text style={styles.codexBody}>
          Every selectable country has its own regions, population, buildings, treasury,
          government, laws, technology and market membership. Colonies and protectorates are
          shown as dependent territories of their sovereign power, not as independent states.
          Population, occupation structure and economic starting values are documented
          historical estimates or explicitly labelled provisional calibrations — not measured
          1900 statistics.
        </Text>
        <Text style={styles.codexHeading}>The historical map</Text>
        <Text style={styles.codexBody}>
          The map is offline vector geometry assembled from Natural Earth 1:10m and an authored
          1900 crosswalk. Political fill shows sovereignty; occupation is a control overlay;
          markets are a separate economic layer. CShapes 2.0 is used only as a classification
          reference because its non-commercial licence is not compatible with redistribution
          here.
        </Text>
        <Text style={styles.codexBody}>
          Every country you can choose starts with a valid, simulated 1900 state. A country that
          is visible but not selectable is shown in the picker with its constitutional status
          and the reason it cannot be played.
        </Text>
      </Dialog>
    </View>
  );
}

/**
 * One entry of the title menu: spaced serif capitals behind a marker bar. The
 * primary entry carries the accent; any entry lights up while touched or, with a
 * mouse, under the pointer. Nothing depends on the pointer.
 */
function MenuEntry({
  label,
  detail,
  primary = false,
  disabled = false,
  onPress,
}: {
  readonly label: string;
  readonly detail?: ReactNode;
  readonly primary?: boolean;
  readonly disabled?: boolean;
  readonly onPress: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={[styles.entry, disabled ? styles.entryDisabled : null]}
    >
      {({ pressed }) => {
        const lit = pressed || hovered;
        return (
          <>
            <View style={[styles.marker, primary ? styles.markerPrimary : null, lit ? styles.markerLit : null]} />
            <View style={styles.entryText}>
              <Text
                style={[styles.entryLabel, primary ? styles.entryLabelPrimary : null, lit ? styles.entryLabelLit : null]}
                numberOfLines={1}
              >
                {label}
              </Text>
              {detail}
            </View>
            <View style={[styles.chevron, lit || primary ? null : styles.chevronQuiet]}>
              <Icon name="forward" size={18} color={primary ? colors.accentStrong : colors.text} />
            </View>
          </>
        );
      }}
    </Pressable>
  );
}

function CodexStat({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <View style={styles.codexStat}>
      <Text style={styles.codexStatValue}>{value}</Text>
      <Text style={type.label}>{label}</Text>
    </View>
  );
}

const styles = themedSheet(() => ({
  // A plain view over the whole map: the backdrop turns, it does not take a touch.
  root: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  column: { position: "absolute" },
  lockup: { gap: spacing.xs },
  hero: { ...type.hero },
  heroCompact: { fontSize: 34, lineHeight: 37, letterSpacing: 4 },
  heroRoomy: { fontSize: 56, lineHeight: 60, letterSpacing: 6 },
  heroRule: { marginTop: spacing.sm },
  entries: { gap: 2, marginTop: spacing.md },
  entriesRoomy: { gap: spacing.xs, marginTop: spacing.xxl },
  entry: {
    alignSelf: "flex-start",
    maxWidth: "100%",
    minHeight: TOUCH_TARGET,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: 3,
  },
  marker: { width: 3, alignSelf: "stretch", marginVertical: 8, backgroundColor: colors.border },
  markerPrimary: { backgroundColor: colors.accent },
  markerLit: { backgroundColor: colors.accentStrong, marginVertical: 2 },
  entryDisabled: { opacity: 0.55 },
  entryText: { flexShrink: 1, minWidth: 0, gap: 3 },
  entryLabel: { ...type.menu },
  entryLabelPrimary: { color: colors.accentStrong },
  entryLabelLit: { color: colors.textStrong },
  entryDetail: { ...type.small, color: colors.muted, flexShrink: 1 },
  continueDetail: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  chevron: { width: 24, alignItems: "center" },
  chevronQuiet: { opacity: 0 },
  version: { ...type.tiny, marginTop: "auto", paddingTop: spacing.sm },
  caption: { position: "absolute", maxWidth: 300, alignItems: "flex-end", gap: 2 },
  captionKicker: { ...type.eyebrow, textAlign: "right" },
  captionDate: { ...type.title, fontSize: 24, lineHeight: 28, fontFamily: fonts.serifMedium, textAlign: "right" },
  captionRule: { marginVertical: spacing.xs },
  captionMeta: { ...type.small, color: colors.text, textAlign: "right" },
  statGrid: { flexDirection: "row", gap: spacing.md },
  codexStat: { flex: 1, gap: 2 },
  codexStatValue: { ...type.numberLarge, color: colors.accentStrong },
  codexHeading: { ...type.section, marginTop: spacing.xs },
  codexBody: { ...type.small, color: colors.text },
}));

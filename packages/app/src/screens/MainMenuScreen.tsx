import { StyleSheet, Text, View, useWindowDimensions } from "react-native";

import { WORLD_CATALOG } from "../generated/worldCatalog";
import { WORLD_MAP_1900 } from "../generated/worldMap1900";
import { colors, radii, spacing, type } from "../theme";
import type { StoredCampaign } from "../storage/saveStorage";
import { WorldMap } from "../components/WorldMap";
import { Badge, Button, Divider, Panel } from "../components/ui";

export function MainMenuScreen({
  savedCampaign,
  onContinue,
  onNewGame,
  onShowProvenance,
}: {
  readonly savedCampaign: StoredCampaign | null;
  readonly onContinue: () => void;
  readonly onNewGame: () => void;
  readonly onShowProvenance: () => void;
}) {
  const { width } = useWindowDimensions();
  const narrow = width < 820;
  const playable = WORLD_CATALOG.entries.filter((entry) => entry.selectable).length;
  const territories = WORLD_CATALOG.entries.filter((entry) => entry.kind === "territory").length;
  return (
    <View style={styles.root}>
      <View style={styles.hero}>
        <WorldMap
          catalog={WORLD_CATALOG}
          map={WORLD_MAP_1900}
          snapshot={null}
          selectedTag={null}
          onSelect={() => undefined}
          height={narrow ? 200 : 300}
          showLegend={false}
        />
        <View style={styles.heroShade} pointerEvents="none" />
        <View style={styles.heroTitle}>
          <Text style={styles.kicker}>GRAND STRATEGY · 1900–2000</Text>
          <Text style={[styles.title, narrow ? styles.titleNarrow : null]}>CENTURY</Text>
          <Text style={styles.tagline}>
            One world. Fifty-nine playable states. A century of industry, empire and upheaval
            begins on 1 January 1900.
          </Text>
        </View>
      </View>

      <View style={[styles.body, narrow ? styles.bodyNarrow : null]}>
        <View style={[styles.menuColumn, narrow ? null : styles.menuColumnWide]}>
          <Panel title="Campaign" subtitle="Start a new world or continue the last saved one.">
            {savedCampaign === null ? (
              <Text style={styles.empty}>
                No saved campaign yet. Choose a country from the 1900 political map to begin.
              </Text>
            ) : (
              <View style={styles.saveCard}>
                <View style={styles.saveRow}>
                  <Text style={styles.saveDate}>{savedCampaign.metadata.dateLabel}</Text>
                  <Badge label="Saved campaign" tone="positive" />
                </View>
                <Text style={styles.saveMeta}>
                  {savedCampaign.metadata.scenarioId} · simulation {savedCampaign.metadata.simVersion} ·
                  schema {String(savedCampaign.metadata.schemaVersion)}
                </Text>
                <Text style={styles.saveMeta}>
                  {Math.round(savedCampaign.storedBytes / 1024)} KiB stored
                  {savedCampaign.source === "primary" ? "" : " (recovered copy)"}
                </Text>
              </View>
            )}
            <View style={styles.actions}>
              {savedCampaign === null ? null : (
                <Button label="Continue campaign" tone="primary" size="lg" onPress={onContinue} />
              )}
              <Button
                label={savedCampaign === null ? "New campaign" : "New campaign"}
                tone={savedCampaign === null ? "primary" : "default"}
                size="lg"
                onPress={onNewGame}
              />
            </View>
          </Panel>

          <Panel title="The world of 1900" subtitle="What this build models, and what it does not.">
            <View style={styles.statGrid}>
              <MenuStat label="Playable states" value={String(playable)} />
              <MenuStat label="Dependent territories" value={String(territories)} />
              <MenuStat label="Trade markets" value={String(WORLD_CATALOG.markets.length)} />
            </View>
            <Text style={styles.note}>
              Every selectable country has its own regions, population, buildings, treasury,
              government, laws, technology and market membership. Colonies and protectorates are
              shown as dependent territories of their sovereign power, not as independent states.
              Population, occupation structure and economic starting values are documented
              historical estimates or explicitly labelled provisional calibrations — not measured
              1900 statistics.
            </Text>
            <Divider />
            <View style={styles.footerRow}>
              <Button label="Sources and licensing" tone="ghost" size="sm" onPress={onShowProvenance} />
              <Text style={styles.version}>world {WORLD_CATALOG.meta.version}</Text>
            </View>
          </Panel>
        </View>

        {narrow ? null : (
          <View style={styles.sideColumn}>
            <Panel title="Historical map" tone="quiet">
              <Text style={styles.sideBody}>
                The map is offline vector geometry assembled from Natural Earth 1:50m and an
                authored 1900 crosswalk. Political fill shows sovereignty; occupation is a control
                overlay; markets are a separate economic layer. CShapes 2.0 is used only as a
                classification reference because its non-commercial licence is not compatible
                with redistribution here.
              </Text>
              <Divider />
              <Text style={styles.sideBody}>
                Every country you can choose starts with a valid, simulated 1900 state. A country
                that is visible but not selectable is shown in the picker with its constitutional
                status and the reason it cannot be played.
              </Text>
            </Panel>
          </View>
        )}
      </View>
    </View>
  );
}

function MenuStat({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <View style={styles.menuStat}>
      <Text style={type.label}>{label}</Text>
      <Text style={styles.menuStatValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  hero: { position: "relative", width: "100%", maxWidth: 1280, alignSelf: "center" },
  heroShade: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(6, 10, 14, 0.35)",
  },
  heroTitle: {
    position: "absolute",
    left: spacing.xl,
    right: spacing.xl,
    bottom: spacing.lg,
    gap: 2,
  },
  kicker: { ...type.label, color: colors.accentStrong },
  title: {
    ...type.display,
    fontSize: 64,
    lineHeight: 66,
    letterSpacing: 10,
    color: colors.textStrong,
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  titleNarrow: { fontSize: 42, lineHeight: 46, letterSpacing: 7 },
  tagline: { ...type.body, color: colors.text, maxWidth: 640, marginTop: 2 },
  body: {
    width: "100%",
    maxWidth: 1280,
    alignSelf: "center",
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md,
  },
  bodyNarrow: { flexDirection: "column", padding: spacing.sm },
  menuColumn: { flex: 1 },
  menuColumnWide: { maxWidth: 720 },
  sideColumn: { width: 380 },
  empty: { ...type.body, color: colors.muted, paddingVertical: spacing.sm },
  saveCard: {
    backgroundColor: colors.backgroundAlt,
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 3,
  },
  saveRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  saveDate: { ...type.numberLarge, color: colors.accentStrong, fontSize: 16 },
  saveMeta: { ...type.tiny },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md },
  statGrid: { flexDirection: "row", gap: spacing.lg, marginBottom: spacing.sm },
  menuStat: { flex: 1 },
  menuStatValue: { ...type.numberLarge, color: colors.accentStrong, fontSize: 24, marginTop: 2 },
  note: { ...type.small, lineHeight: 17 },
  footerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  version: { ...type.tiny },
  sideBody: { ...type.small, lineHeight: 18, marginBottom: spacing.sm },
});

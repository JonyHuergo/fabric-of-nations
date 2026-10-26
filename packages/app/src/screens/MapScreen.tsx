import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  countryById,
  countryColor,
  formatCount,
  formatRate,
  formatSUSD,
  type SimulationSnapshot,
} from "@century/sim-worker";

import { Section, StatRow } from "../components/ui";
import { colors, radii, spacing } from "../theme";

export interface MapScreenProps {
  readonly snapshot: SimulationSnapshot;
  readonly selectedCountryId: number | null;
  readonly selectedRegionId: number | null;
  readonly onSelectCountry: (countryId: number) => void;
  readonly onSelectRegion: (regionId: number, countryId: number | null) => void;
}

export function MapScreen({
  snapshot,
  selectedCountryId,
  selectedRegionId,
  onSelectCountry,
  onSelectRegion,
}: MapScreenProps) {
  const selected = countryById(snapshot, selectedCountryId);
  return (
    <View>
      <Section
        title="World map"
        subtitle="Stylized vector-grid prototype of the 16 authored regions. Tap a region to inspect its country. Pan/zoom and the 500-region production map remain future work."
      >
        <View style={styles.grid}>
          {snapshot.regions.map((region) => {
            const selectedTile =
              region.id === selectedRegionId || region.countryId === selectedCountryId;
            return (
              <Pressable
                key={region.id}
                accessibilityRole="button"
                accessibilityLabel={`${region.name}, ${region.countryId === null ? "unowned" : `country ${String(region.countryId)}`}`}
                onPress={() => onSelectRegion(region.id, region.countryId)}
                onLongPress={() => {
                  if (region.countryId !== null) onSelectCountry(region.countryId);
                }}
                style={[
                  styles.regionTile,
                  { backgroundColor: countryColor(region.countryId) },
                  selectedTile ? styles.regionSelected : null,
                ]}
              >
                <Text style={styles.regionKey}>{region.key.toUpperCase()}</Text>
                <Text style={styles.regionPopulation}>{formatCount(region.population)}</Text>
                <Text style={styles.regionBuildings}>{region.buildingCount} bldg</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.legend}>
          {snapshot.countries.map((country) => (
            <Pressable
              key={country.id}
              accessibilityRole="button"
              onPress={() => onSelectCountry(country.id)}
              style={styles.legendRow}
            >
              <View
                style={[styles.legendSwatch, { backgroundColor: countryColor(country.id) }]}
              />
              <Text style={styles.legendTag}>{country.tag}</Text>
              <Text style={styles.legendName} numberOfLines={1}>
                {country.name}
              </Text>
            </Pressable>
          ))}
        </View>
      </Section>

      {selected === null ? null : (
        <Section title={`${selected.name} (${selected.tag})`} subtitle="Selected country summary">
          <StatRow label="Population" value={formatCount(selected.population)} />
          <StatRow label="Treasury cash" value={formatSUSD(selected.treasuryCashSUSD)} />
          <StatRow label="Income tax" value={formatRate(selected.fiscal.incomeTaxRate)} />
          <StatRow
            label="Welfare budget"
            value={`${formatSUSD(selected.fiscal.welfareBudgetSUSDPerYear)}/yr`}
          />
          <StatRow
            label="Hardship"
            value={formatRate(selected.hardshipPopulationShare)}
            detail="Share of population in blocks with 7+ unmet subsistence days"
          />
        </Section>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: spacing.sm,
  },
  regionTile: {
    width: "23.5%",
    minHeight: 74,
    borderRadius: radii.sm,
    padding: spacing.sm,
    borderColor: "rgba(0,0,0,0.25)",
    borderWidth: 1,
    justifyContent: "space-between",
  },
  regionSelected: { borderColor: colors.accent, borderWidth: 3 },
  regionKey: { color: "#f5f1df", fontSize: 13, fontWeight: "700" },
  regionPopulation: { color: "#f5f1df", fontSize: 11, fontVariant: ["tabular-nums"] },
  regionBuildings: { color: "rgba(245,241,223,0.75)", fontSize: 9 },
  legend: { marginTop: spacing.lg },
  legendRow: { flexDirection: "row", alignItems: "center", paddingVertical: 4 },
  legendSwatch: { width: 12, height: 12, borderRadius: 2, marginRight: spacing.sm },
  legendTag: { color: colors.text, fontSize: 11, fontWeight: "700", width: 38 },
  legendName: { color: colors.muted, fontSize: 11, flex: 1 },
});

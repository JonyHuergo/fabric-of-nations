import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  countryById,
  formatCount,
  formatRate,
  type SimulationSnapshot,
} from "@century/sim-worker";

import { Section, StatRow } from "../components/ui";
import { colors, spacing } from "../theme";

export function PopulationScreen({
  snapshot,
  countryId,
  onSelectCountry,
}: {
  readonly snapshot: SimulationSnapshot;
  readonly countryId: number | null;
  readonly onSelectCountry: (countryId: number) => void;
}) {
  const country = countryById(snapshot, countryId);
  return (
    <View>
      <Section
        title="Population and employment"
        subtitle="Country aggregates derived from the authoritative single-year sex/age blocks."
      >
        {snapshot.countries.map((entry) => (
          <Pressable
            key={entry.id}
            accessibilityRole="button"
            onPress={() => onSelectCountry(entry.id)}
            style={[styles.countryRow, entry.id === countryId ? styles.countrySelected : null]}
          >
            <Text style={styles.countryTag}>{entry.tag}</Text>
            <Text style={styles.countryName} numberOfLines={1}>
              {entry.name}
            </Text>
            <View style={styles.numbers}>
              <Text style={styles.number}>{formatCount(entry.population)}</Text>
              <Text style={styles.numberMuted}>{formatCount(entry.workingAgePopulation)}</Text>
              <Text style={styles.numberMuted}>{formatCount(entry.employedWorkers)}</Text>
              <Text style={styles.numberMuted}>{formatRate(entry.hardshipPopulationShare)}</Text>
            </View>
          </Pressable>
        ))}
        <View style={styles.headerRow}>
          <Text style={styles.headerText}>Country</Text>
          <Text style={styles.headerText}>Population · working-age · employed · hardship</Text>
        </View>
      </Section>

      {country === null ? null : (
        <Section title={`${country.name} detail`} subtitle={snapshot.date.label}>
          <StatRow label="Population" value={formatCount(country.population)} detail="people" />
          <StatRow
            label="Working-age population"
            value={formatCount(country.workingAgePopulation)}
            detail="M2 working-age definition"
          />
          <StatRow label="Employed workers" value={formatCount(country.employedWorkers)} />
          <StatRow label="Literacy" value={formatRate(country.literacy)} />
          <StatRow label="Wealth level" value={country.wealthLevel.toFixed(1)} detail="0–99 index" />
          <StatRow label="Militancy" value={formatRate(country.militancy)} />
          <StatRow
            label="Blocks with unmet subsistence"
            value={`${String(country.blocksWithUnmetSubsistence)} of ${String(
              snapshot.regions.filter((region) => region.countryId === country.id).length,
            )} regions`}
          />
          <StatRow
            label="Blocks with unmet basic needs"
            value={String(country.blocksWithUnmetBasic)}
            detail="consecutive-day counters are authoritative"
          />
        </Section>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  countryRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  countrySelected: { backgroundColor: colors.surfaceRaised },
  countryTag: { color: colors.text, fontSize: 11, fontWeight: "700", width: 40 },
  countryName: { color: colors.muted, fontSize: 11, flex: 1, paddingRight: spacing.xs },
  numbers: { alignItems: "flex-end" },
  number: { color: colors.text, fontSize: 12, fontVariant: ["tabular-nums"] },
  numberMuted: { color: colors.muted, fontSize: 10, fontVariant: ["tabular-nums"] },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.sm,
  },
  headerText: { color: colors.faint, fontSize: 9 },
});

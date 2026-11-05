import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  countryById,
  formatCount,
  formatRate,
  type SimulationSnapshot,
} from "@century/sim-worker";

import { Disclosure, Headline, Notice, Section, StatRow } from "../components/ui";
import { colors, fonts, spacing, themedSheet } from "../theme";
import { provinceEconomyRows } from "@century/sim-worker";
import { useMoney } from "../format/useMoney";

export function PopulationScreen({
  snapshot,
  countryId,
  onSelectCountry,
}: {
  readonly snapshot: SimulationSnapshot;
  readonly countryId: number | null;
  readonly onSelectCountry: (countryId: number) => void;
}) {
  const money = useMoney();
  const country = countryById(snapshot, countryId);
  return (
    <View>
      {country === null ? null : (
        <Headline
          label="Population"
          value={formatCount(country.population)}
          detail={`${formatCount(country.employedWorkers)} employed · hardship ${formatRate(country.hardshipPopulationShare)}`}
        />
      )}
      {country === null ? null : (
        <Section title={`${country.name} detail`} subtitle={snapshot.date.label}>
          <StatRow label="Population" value={formatCount(country.population)} detail="people" />
          <StatRow
            label="Working-age population"
            value={formatCount(country.workingAgePopulation)}
            detail="M2 working-age definition"
          />
          <StatRow
            label="Employed workers"
            value={formatCount(country.employedWorkers)}
            detail="Assignments to operational buildings; stock."
          />
          <StatRow
            label="Working-age not in modeled employment"
            value={formatCount(
              Math.max(0, country.workingAgePopulation - country.employedWorkers),
            )}
            detail="Residual, not an unemployment rate: the model does not measure job search or labor-force participation separately."
          />
          <StatRow
            label="Household cash"
            value={money.format(country.householdCashRUSD)}
            detail="Sum of household cash accounts; stock."
          />
          <StatRow
            label="Estimated daily wage base"
            value={money.format(country.estimatedDailyWageBaseRUSD)}
            detail="Current employment × base wages ÷ civil year days; current-base estimate, not realized wages."
          />
          <StatRow label="Literacy" value={formatRate(country.literacy)} detail="population-weighted, 0–100%" />
          <StatRow label="Wealth level" value={country.wealthLevel.toFixed(1)} detail="0–99 index; not money." />
          <StatRow label="Militancy" value={formatRate(country.militancy)} detail="population-weighted index." />
          <StatRow
            label="Blocks with unmet subsistence"
            value={`${String(country.blocksWithUnmetSubsistence)} block(s)`}
            detail={`Country has ${String(
              provinceEconomyRows(snapshot).filter((province) => province.countryId === country.id).length,
            )} provinces. Any unmet subsistence day in the block's current counter.`}
          />
          <StatRow
            label="Blocks with unmet basic needs"
            value={String(country.blocksWithUnmetBasic)}
            detail="Consecutive-day counters are authoritative."
          />
          <Notice title="What these figures mean">
            Population, worker, and cash values are stocks. The wage base is a current
            employment estimate. The model does not calculate an unemployment rate, labor-force
            participation rate, or per-capita income; no such figure is shown.
          </Notice>
        </Section>
      )}
      <Section
        title="Population and employment"
        subtitle="Country aggregates derived from the authoritative single-year sex/age blocks."
      >
        <Disclosure title={`All countries · ${String(snapshot.countrySummaries.length)}`}>
        {snapshot.countrySummaries.map((entry) => (
          <Pressable
            key={entry.id}
            accessibilityRole="button"
            onPress={() => onSelectCountry(entry.id)}
            style={[styles.countryRow, entry.id === countryId ? styles.countrySelected : null]}
          >
            <Text style={styles.countryTag}>{entry.tag}</Text>
            <Text style={styles.countryName} numberOfLines={1}>
              {entry.name}
              {entry.id === snapshot.playerCountryId ? " · Player" : ""}
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
        </Disclosure>
      </Section>

    </View>
  );
}

const styles = themedSheet(() => ({
  countryRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  countrySelected: { backgroundColor: colors.surfaceRaised },
  countryTag: { color: colors.text, fontSize: 13, fontFamily: fonts.sansSemiBold, width: 40 },
  countryName: { color: colors.muted, fontFamily: fonts.sans, fontSize: 13, flex: 1, paddingRight: spacing.xs },
  numbers: { alignItems: "flex-end" },
  number: { color: colors.text, fontFamily: fonts.sans, fontSize: 13, fontVariant: ["tabular-nums"] },
  numberMuted: { color: colors.muted, fontFamily: fonts.sans, fontSize: 11, fontVariant: ["tabular-nums"] },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.sm,
  },
  headerText: { color: colors.faint, fontFamily: fonts.sans, fontSize: 11 },
}));

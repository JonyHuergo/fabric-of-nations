import { StyleSheet, Text, View } from "react-native";

import {
  countryById,
  fiscalResultLabel,
  formatCount,
  formatRate,
  formatSUSD,
  latestFinancePeriod,
  type SimulationSnapshot,
} from "@century/sim-worker";

import { Section, StatRow } from "../components/ui";
import { colors, spacing } from "../theme";

export function CountryScreen({
  snapshot,
  countryId,
}: {
  readonly snapshot: SimulationSnapshot;
  readonly countryId: number | null;
}) {
  const country = countryById(snapshot, countryId);
  if (country === null) {
    return (
      <Section title="Country dashboard">
        <Text style={styles.empty}>Select a country on the map.</Text>
      </Section>
    );
  }
  const latest = latestFinancePeriod(country);
  const regions = snapshot.regions.filter((region) => region.countryId === country.id);
  return (
    <View>
      <Section
        title={`${country.name} (${country.tag})`}
        subtitle={`${snapshot.date.label} · ${regions.length} regions · ${country.buildingCount} buildings`}
      >
        <StatRow label="Population" value={formatCount(country.population)} detail="people" />
        <StatRow
          label="Working-age population"
          value={formatCount(country.workingAgePopulation)}
        />
        <StatRow label="Employed workers" value={formatCount(country.employedWorkers)} />
        <StatRow label="Literacy" value={formatRate(country.literacy)} />
        <StatRow label="Wealth level" value={country.wealthLevel.toFixed(1)} detail="0–99 index" />
        <StatRow label="Militancy" value={formatRate(country.militancy)} />
        <StatRow
          label="Hardship"
          value={formatRate(country.hardshipPopulationShare)}
          detail={`${String(country.blocksWithUnmetSubsistence)} blocks with unmet subsistence`}
        />
      </Section>

      <Section title="Public finance" subtitle="Authoritative M4c/M5b state exposed through the snapshot">
        <StatRow label="Treasury cash" value={formatSUSD(country.treasuryCashSUSD)} />
        <StatRow label="Debt outstanding" value={formatSUSD(country.debtOutstandingPrincipalSUSD)} />
        <StatRow
          label="Income tax rate"
          value={formatRate(country.fiscal.incomeTaxRate)}
          detail="Flat rate on wages actually received"
        />
        <StatRow
          label="Welfare budget"
          value={`${formatSUSD(country.fiscal.welfareBudgetSUSDPerYear)}/yr`}
        />
        <StatRow
          label="Latest fiscal result"
          value={latest === null ? "Not closed yet" : fiscalResultLabel(latest.netFiscalResultSUSD)}
          detail={latest === null ? "First monthly close has not run" : `${snapshot.date.label}`}
        />
      </Section>

      <Section title="Regions" subtitle="Population and building counts by authored region">
        {regions.map((region) => (
          <StatRow
            key={region.id}
            label={`${region.name} (${region.key})`}
            value={formatCount(region.population)}
            detail={`${String(region.buildingCount)} buildings · market ${String(region.marketId)}`}
          />
        ))}
      </Section>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { color: colors.muted, fontSize: 13, paddingVertical: spacing.sm },
});

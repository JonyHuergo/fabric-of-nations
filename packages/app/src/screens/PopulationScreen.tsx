import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  countryById,
  formatCount,
  formatRate,
  type SimulationSnapshot,
} from "@century/sim-worker";

import { Disclosure, Headline, Notice, Section, StatRow } from "../components/ui";
import { DemographyRows, DemographyTrend, PopulationPyramid, percent } from "../components/Demography";
import { colors, fonts, spacing, themedSheet } from "../theme";
import { provinceEconomyRows } from "@century/sim-worker";
import { useMoney } from "../format/useMoney";

/** P6 (D-153): names of the demand system's categories (presentation). */
const CATEGORY_NAMES: Readonly<Record<string, string>> = {
  food: "Food",
  clothing: "Clothing",
  "fuel-light": "Fuel and light",
  "household-goods": "Household goods",
  tobacco: "Tobacco",
  transport: "Transport",
  services: "Services",
};

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
      {country === null || country.demography === null ? null : (
        <Section title="Births, deaths and lifespans" subtitle={`${country.name} · ${snapshot.date.label}`}>
          <DemographyRows demography={country.demography.current} />
          <StatRow
            label="Towns"
            value={`${percent(country.demography.current.urbanShare)} urban`}
            detail="Town dwellers have fewer children; until sanitation reaches them they also die younger."
          />
          {country.demography.yearToDate === null ? null : (
            <StatRow
              label={`Recorded in ${String(country.demography.yearToDate.year)}`}
              value={`${formatCount(country.demography.yearToDate.births)} born`}
              detail={`${formatCount(country.demography.yearToDate.deaths)} died · ${String(country.demography.yearToDate.days)} days so far`}
            />
          )}
          <PopulationPyramid pyramid={country.demography.pyramid} />
          <DemographyTrend history={country.demography.history} />
          <Disclosure title="What moves these figures">
            <StatRow
              label="Public health and medicine"
              value={`${percent(1 - country.demography.causes.healthFactor)} fewer deaths`}
              detail="Medical research, public-health staff and funding (Labor & health), and shorter working hours. Children gain most."
            />
            <StatRow
              label="Sanitation in towns"
              value={percent(country.demography.causes.sanitationCoverage)}
              detail={`Sanitation research ${percent(country.demography.causes.sanitationKnowledge)} × public-health service ${percent(country.demography.causes.healthServiceOutput)}. Knowledge needs staff to reach the towns.`}
            />
            <StatRow
              label="Contraception"
              value={percent(country.demography.causes.contraception)}
              detail="Fewer births from researched family-planning methods."
            />
            <Notice title="How the player shapes population">
              Fertility falls as women learn to read (fund schooling and education laws), as
              people move to towns, as incomes rise above subsistence, some years after child
              deaths fall, and with contraception. Deaths fall with medicine, public-health staff
              and sanitation; they rise when people cannot buy enough food and in crowded towns
              without sanitation. Each country started from its own sourced 1900 levels.
            </Notice>
          </Disclosure>
        </Section>
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
      {country === undefined || country === null || country.households === null ? null : (
        <Section title="Households" subtitle="Planned spending at this month's prices; dwellings owned by households.">
          <StatRow
            label="Food share"
            value={formatRate(country.households.foodShare)}
            detail={country.households.categoryShares
              .filter((entry) => entry.key !== "food" && entry.share > 0)
              .map((entry) => `${CATEGORY_NAMES[entry.key] ?? entry.key} ${formatRate(entry.share)}`)
              .join(" · ")}
          />
          <StatRow
            label="Saving rate"
            value={country.households.savingRate.lower === null ? "—" : formatRate(country.households.savingRate.lower)}
            detail={`Workers and peasants. Clerks and academics ${country.households.savingRate.middle === null ? "—" : formatRate(country.households.savingRate.middle)} · capitalists ${country.households.savingRate.upper === null ? "—" : formatRate(country.households.savingRate.upper)}. Saving is kept as cash and pays for new dwellings.`}
          />
          <StatRow
            label="Housing"
            value={country.households.personsPerDwelling === null ? "—" : `${country.households.personsPerDwelling.toFixed(2)} per dwelling`}
            detail={`${formatCount(Math.round(country.households.dwellings))} dwellings · crowding ${country.households.crowding === null ? "—" : formatRate(country.households.crowding)} of 1900. Crowding above 1900 raises deaths and unrest.`}
          />
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

import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  countryById,
  formatCount,
  formatRate,
  PROFESSION_GROUPS,
  type CountryLabourMarketSnapshot,
  type ProfessionGroupDto,
  type SimulationSnapshot,
} from "@century/sim-worker";

import { DataRow, Disclosure, Headline, Notice, Section, StatRow } from "../components/ui";
import type { MoneyFormat } from "../format/money";
import { DemographyRows, DemographyTrend, PopulationPyramid, percent } from "../components/Demography";
import { colors, fonts, spacing, themedSheet } from "../theme";
import { provinceEconomyRows } from "@century/sim-worker";
import { useMoney } from "../format/useMoney";

/** P7 (D-156): headings of the profession groups (presentation). */
const GROUP_NAMES: Readonly<Record<ProfessionGroupDto, string>> = {
  rural: "Rural",
  "manual-service": "Manual and service",
  military: "Military",
  "office-commerce": "Office and commerce",
  professional: "Professional",
  "state-church": "State and church",
  owners: "Owners",
  other: "Other",
};

/** P7 (D-156): how a profession's people earn, as the rows say it. */
const EARNS_TEXT = {
  wage: "wages",
  "own-work": "their own farm or shop",
  residual: "the residual of the buildings and land they own",
} as const;

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
            detail="Residual, not an unemployment rate: it includes people outside the labour force. The labour market's unemployment rate is on the Labor screen."
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
            employment estimate. Unemployment and wages by profession are measured in the
            labour market (Labor screen); income per head by profession is under Professions.
          </Notice>
        </Section>
      )}
      {country === null || country.labourMarket === null ? null : (
        <ProfessionsSection market={country.labourMarket} snapshot={snapshot} money={money} />
      )}
      {country === null ? null : <MobilitySection snapshot={snapshot} />}
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

/** P7 (D-156): the sixteen professions in their groups, with persons, income and servants. */
function ProfessionsSection({
  market,
  snapshot,
  money,
}: {
  readonly market: CountryLabourMarketSnapshot;
  readonly snapshot: SimulationSnapshot;
  readonly money: MoneyFormat;
}) {
  const rowOf = new Map(market.professions.map((row) => [row.professionId, row]));
  return (
    <Section title="Professions" subtitle="Persons of every age by occupation; income per head over the last weeks.">
      {PROFESSION_GROUPS.map((group) => {
        const members = snapshot.professions.filter((profession) => profession.group === group);
        if (members.length === 0) return null;
        const persons = members.reduce((sum, profession) => sum + (rowOf.get(profession.id)?.persons ?? 0), 0);
        return (
          <Disclosure key={group} title={`${GROUP_NAMES[group]} · ${persons > 0 ? formatCount(persons) : "none"}`}>
            {members.map((profession) => {
              const row = rowOf.get(profession.id);
              if (row === undefined) {
                return <DataRow key={profession.id} title={profession.name} value="None" valueTone="muted" />;
              }
              const servants = [
                row.servantsEmployed > 0 ? `employ ${formatCount(row.servantsEmployed)} servants` : null,
                row.inHouseholdService > 0 ? `${formatCount(row.inHouseholdService)} work as servants` : null,
              ].filter((part): part is string => part !== null);
              return (
                <DataRow
                  key={profession.id}
                  title={profession.name}
                  value={formatCount(row.persons)}
                  note={[`${money.format(row.incomeRUSDPerHeadYear)}/yr a head from ${EARNS_TEXT[profession.earns]}`, ...servants].join(" · ")}
                />
              );
            })}
          </Disclosure>
        );
      })}
    </Section>
  );
}

/** P7 (D-156): the last month's social mobility (a world-wide report). */
function MobilitySection({ snapshot }: { readonly snapshot: SimulationSnapshot }) {
  const report = snapshot.labourMobility;
  const nameOf = new Map(snapshot.professions.map((profession) => [profession.id, profession.name]));
  return (
    <Section title="Mobility" subtitle="People change profession and province on the first day of each month.">
      <Disclosure title={report === null ? "Mobility this month · none yet" : "Mobility this month · world"}>
        {report === null ? (
          <Notice title="No month has closed yet">
            The first month's mobility runs on the first day of the next month: people move
            toward professions and provinces that pay more and have work.
          </Notice>
        ) : (
          <>
            <StatRow label="Changed profession" value={formatCount(report.mobilityPeople)} detail="Inside their province" />
            <StatRow label="Moved province" value={formatCount(report.migrationPeople)} detail="Toward work, wages and housing" />
            <StatRow
              label="Population blocks"
              value={`${String(report.blocksCreated)} created · ${String(report.blocksRetired)} retired`}
              detail={`${formatCount(report.liveBlocks)} blocks now`}
            />
            {report.net.map((entry) => (
              <DataRow
                key={entry.professionId}
                title={nameOf.get(entry.professionId) ?? `Profession ${String(entry.professionId)}`}
                value={`${entry.net > 0 ? "+" : "−"}${formatCount(Math.abs(entry.net))}`}
                valueTone={entry.net > 0 ? "accent" : "muted"}
              />
            ))}
            <Text style={styles.headerText}>
              The monthly report covers the whole world; the simulation does not yet keep one per country.
            </Text>
          </>
        )}
      </Disclosure>
    </Section>
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

import { useEffect, useState } from "react";
import { Text, View } from "react-native";

import {
  countryById,
  formatCount,
  formatRate,
  previewHealthPolicy,
  previewTrainingPolicy,
  type CountryLabourMarketSnapshot,
  type SimulationSnapshot,
} from "@century/sim-worker";

import { LabourRows, mergeTerritoryRows } from "../components/Labour";
import { SliderField, useDeferredCommit } from "../components/Slider";
import { ActionButton, DataRow, Disclosure, Headline, Notice, Section, StatRow } from "../components/ui";
import type { MoneyFormat } from "../format/money";
import { colors, fonts, spacing, themedSheet } from "../theme";
import { useSimulation } from "../worker/SimulationProvider";
import { useMoney } from "../format/useMoney";

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function LaborScreen({
  snapshot,
  countryId,
}: {
  readonly snapshot: SimulationSnapshot;
  readonly countryId: number | null;
}) {
  const money = useMoney();
  const { applyAction, busy, connection } = useSimulation();
  const country = countryById(snapshot, countryId);
  const [budgetText, setBudgetText] = useState("");
  const [stipendText, setStipendText] = useState("");
  const [trainingShareText, setTrainingShareText] = useState("");
  const [healthShareText, setHealthShareText] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (country === null) return;
    setBudgetText(country.labor.trainingBudgetRUSDPerYear.toFixed(0));
    setStipendText(country.labor.trainingStipendPerTraineeRUSDPerYear.toFixed(2));
    setTrainingShareText(country.labor.trainingStaffShare.toFixed(2));
    setHealthShareText(country.labor.healthStaffShare.toFixed(2));
    setLocalError(null);
  }, [
    countryId,
    country?.labor.trainingBudgetRUSDPerYear,
    country?.labor.trainingStipendPerTraineeRUSDPerYear,
    country?.labor.trainingStaffShare,
    country?.labor.healthStaffShare,
  ]);

  const isPlayerCountry =
    country !== null &&
    snapshot.playerCountryId !== null &&
    country.id === snapshot.playerCountryId;

  const submit = (action: Parameters<typeof applyAction>[0], error: string | null): void => {
    if (!isPlayerCountry) {
      setLocalError("Only the player-controlled country may change labor policy.");
      return;
    }
    if (error !== null) {
      setLocalError(error);
      return;
    }
    setLocalError(null);
    applyAction(action);
  };

  // Recompute the same estimate the screen displays, with one draft value replaced
  // by the slider's commit value. The worker still validates the action.
  const trainingPreviewFor = (overrides: {
    readonly budget?: number;
    readonly stipend?: number;
    readonly share?: number;
  }) => {
    if (country === null) return null;
    return previewTrainingPolicy(snapshot, country, {
      trainingBudgetRUSDPerYear: overrides.budget ?? Number(budgetText),
      trainingStipendPerTraineeRUSDPerYear: overrides.stipend ?? Number(stipendText),
      trainingStaffShare: overrides.share ?? Number(trainingShareText),
    });
  };

  const applyTrainingBudget = (annualRUSDOverride?: number): void => {
    if (country === null) return;
    const annualRUSD = annualRUSDOverride ?? Number(budgetText);
    const preview = trainingPreviewFor({ budget: annualRUSD });
    submit(
      { kind: "set-training-budget", countryId: country.id, annualRUSD },
      preview !== null && preview.errors.length > 0 ? preview.errors.join(" ") : null,
    );
  };

  const applyTrainingStipend = (annualRUSDOverride?: number): void => {
    if (country === null) return;
    const annualRUSD = annualRUSDOverride ?? Number(stipendText);
    const preview = trainingPreviewFor({ stipend: annualRUSD });
    submit(
      { kind: "set-training-stipend", countryId: country.id, annualRUSD },
      preview !== null && preview.errors.length > 0 ? preview.errors.join(" ") : null,
    );
  };

  const applyTrainingShare = (shareOverride?: number): void => {
    if (country === null) return;
    const share = shareOverride ?? Number(trainingShareText);
    const preview = trainingPreviewFor({ share });
    submit(
      { kind: "set-training-staff-share", countryId: country.id, share },
      preview !== null && preview.errors.length > 0 ? preview.errors.join(" ") : null,
    );
  };

  const applyHealthShare = (shareOverride?: number): void => {
    if (country === null) return;
    const share = shareOverride ?? Number(healthShareText);
    const preview = previewHealthPolicy(snapshot, country, share);
    submit(
      { kind: "set-health-staff-share", countryId: country.id, share },
      preview.errors.length > 0 ? preview.errors.join(" ") : null,
    );
  };

  // Hooks are unconditional and precede the country guard. The callbacks guard
  // country themselves, so every slider commit sends the authoritative action.
  const budgetCommit = useDeferredCommit((value) => applyTrainingBudget(value), busy);
  const stipendCommit = useDeferredCommit((value) => applyTrainingStipend(value), busy);
  const trainingShareCommit = useDeferredCommit((value) => applyTrainingShare(value), busy);
  const healthShareCommit = useDeferredCommit((value) => applyHealthShare(value), busy);

  if (country === null) {
    return (
      <Section title="Labor & society">
        <Text style={styles.empty}>Select a country on the map.</Text>
      </Section>
    );
  }
  const canAct = isPlayerCountry && !busy && connection === "ready";
  const parsedBudget = Number(budgetText);
  const parsedStipend = Number(stipendText);
  const parsedTrainingShare = Number(trainingShareText);
  const parsedHealthShare = Number(healthShareText);
  const trainingPreview = previewTrainingPolicy(snapshot, country, {
    trainingBudgetRUSDPerYear: parsedBudget,
    trainingStipendPerTraineeRUSDPerYear: parsedStipend,
    trainingStaffShare: parsedTrainingShare,
  });
  const healthPreview = previewHealthPolicy(snapshot, country, parsedHealthShare);

  // Practical slider ranges inside the authoritative 0..MAX_FISCAL_BUDGET bounds.
  // The annual step is 1% of the slider maximum; share steps are 0.01.
  const budgetMax = Math.max(
    1_000_000,
    Math.round(country.treasuryCashRUSD * 0.5),
    Math.round(country.labor.trainingBudgetRUSDPerYear * 2),
  );
  const budgetStep = Math.max(1_000, Math.round(budgetMax / 100));
  const stipendMax = Math.max(
    10_000,
    Math.round(country.labor.trainingStipendPerTraineeRUSDPerYear * 2),
  );
  const stipendStep = Math.max(100, Math.round(stipendMax / 100));
  // Authoritative validation also caps training at 1 - researchStaffShare.
  const trainingShareMax = Math.max(
    0.01,
    Math.min(1, 1 - country.education.researchStaffShare),
  );

  return (
    <Section title="Labor & society">
      {!isPlayerCountry ? (
        <Notice title="Read-only country" tone="warning">
          These are the observed labor and social institutions of the selected country.
          Only the player-controlled country can change policy.
        </Notice>
      ) : null}
      {localError !== null ? (
        <Notice title="Action rejected" tone="warning">
          {localError}
        </Notice>
      ) : null}

      {country.labourMarket === null ? null : (
        <LabourMarketSection market={country.labourMarket} snapshot={snapshot} money={money} />
      )}

      <Headline
        label="Qualification"
        value={percent(country.labor.qualificationAverage)}
        detail={`${percent(country.labor.trainingParticipation)} of eligible people in training`}
      />

      <Text style={styles.heading}>Vocational training — actual state</Text>
      <StatRow
        label="Training participation"
        value={percent(country.labor.trainingParticipation)}
      />
      <StatRow
        label="Academic instructors assigned"
        value={country.labor.trainingInstructors.toFixed(0)}
      />
      <StatRow
        label="Eligible working-age people"
        value={country.labor.eligibleWorkingAge.toLocaleString()}
      />
      <StatRow label="Trainees (part-time)" value={country.labor.trainees.toFixed(0)} />
      <StatRow
        label="Qualification (working-age average)"
        value={percent(country.labor.qualificationAverage)}
      />
      <StatRow
        label="Training budget"
        value={`${money.format(country.labor.trainingBudgetRUSDPerYear)}/year`}
      />
      <StatRow
        label="Stipend per trainee"
        value={`${money.format(country.labor.trainingStipendPerTraineeRUSDPerYear)}/year`}
      />
      <StatRow
        label="Month-to-date requested"
        value={money.format(country.labor.trainingRequestedMonthToDateRUSD)}
      />
      <StatRow
        label="Month-to-date shortfall"
        value={money.format(country.labor.trainingShortfallMonthToDateRUSD)}
      />
      {country.labor.trainingBlockedReason !== null ? (
        <Notice title="Training blocked" tone="warning">
          {country.labor.trainingBlockedReason === "no-funding"
            ? "No training budget is funded. Set a budget to pay instructors."
            : country.labor.trainingBlockedReason === "no-academic-staff"
              ? "No academic staff are available to instruct training."
              : "No eligible working-age people meet the literacy threshold."}
        </Notice>
      ) : null}

      <Text style={styles.heading}>Training policy</Text>
      <Text style={styles.help}>
        Estimates only. The worker recomputes instructors, funding adequacy, and
        participation from live state. Stipends are immediate cash transfers;
        qualification gains are slow and require funded training.
      </Text>
      <SliderField
        label="Annual training budget"
        value={Number.isFinite(parsedBudget) ? parsedBudget : 0}
        min={0}
        max={budgetMax}
        step={budgetStep}
        precision={0}
        money={money}
          unit="/yr"
        disabled={!canAct}
        pending={budgetCommit.hasPending}
        onChange={(value) => setBudgetText(value.toFixed(0))}
        onCommit={(value) => budgetCommit.submit(value)}
        hint="Annual funding for instructors; stipends are paid separately from treasury cash."
      />
      <SliderField
        label="Annual stipend per trainee"
        value={Number.isFinite(parsedStipend) ? parsedStipend : 0}
        min={0}
        max={stipendMax}
        step={stipendStep}
        precision={0}
        money={money}
          unit="/yr"
        disabled={!canAct}
        pending={stipendCommit.hasPending}
        onChange={(value) => setStipendText(value.toFixed(2))}
        onCommit={(value) => stipendCommit.submit(value)}
        hint="An immediate cash transfer per trainee; it does not fund instructors by itself."
      />
      <SliderField
        label="Academic staff share for training"
        value={Number.isFinite(parsedTrainingShare) ? parsedTrainingShare : 0}
        min={0}
        max={trainingShareMax}
        step={0.01}
        precision={2}
        disabled={!canAct}
        pending={trainingShareCommit.hasPending}
        onChange={(value) => setTrainingShareText(value.toFixed(2))}
        onCommit={(value) => trainingShareCommit.submit(value)}
        hint="0 to 1. Research and training academic staff shares must not exceed 100%."
      />
      <View style={styles.estimate}>
        <Text style={styles.estimateTitle}>Estimate</Text>
        <StatRow
          label="Instructors"
          value={trainingPreview.instructors.toFixed(0)}
        />
        <StatRow
          label="Participation"
          value={percent(trainingPreview.participation)}
        />
        <StatRow
          label="Trainees"
          value={trainingPreview.trainees.toFixed(0)}
        />
        <StatRow
          label="Annual cost (budget + stipend)"
          value={`${money.format(trainingPreview.annualCostRUSD)}/year`}
        />
        <StatRow
          label="Qualification gain (first year)"
          value={`${(trainingPreview.qualificationGainPerYear * 100).toFixed(2)} pp`}
        />
        {trainingPreview.blockedReason !== null ? (
          <Text style={styles.warning}>
            Blocked: {trainingPreview.blockedReason}
          </Text>
        ) : null}
        {trainingPreview.errors.map((error: string) => (
          <Text key={error} style={styles.warning}>
            {error}
          </Text>
        ))}
      </View>
      <ActionButton
        label="Set training budget"
        disabled={!canAct}
        onPress={() => applyTrainingBudget()}
      />
      <ActionButton
        label="Set training stipend"
        disabled={!canAct}
        onPress={() => applyTrainingStipend()}
      />
      <ActionButton
        label="Set training staff share"
        disabled={!canAct}
        onPress={() => applyTrainingShare()}
      />

      <Text style={styles.heading}>Public health — actual state</Text>
      <StatRow
        label="Health staff share"
        value={percent(country.labor.healthStaffShare)}
      />
      <StatRow label="Health staff" value={country.labor.healthStaff.toFixed(0)} />
      <StatRow
        label="Administration staff"
        value={country.labor.administrationStaff.toFixed(0)}
      />
      <StatRow
        label="Health service output"
        value={percent(country.labor.healthServiceOutputIndex)}
      />
      <StatRow
        label="Mortality factor"
        value={country.labor.healthMortalityFactor.toFixed(3)}
      />
      {country.labor.healthBlockedReason !== null ? (
        <Notice title="Health service blocked" tone="warning">
          {country.labor.healthBlockedReason === "no-administration-staff"
            ? "No administration clerks are available for public health."
            : country.labor.healthBlockedReason === "no-health-share"
              ? "No staff share is assigned to public health."
              : "The administration institution is unfunded."}
        </Notice>
      ) : null}

      <Text style={styles.heading}>Health policy</Text>
      <SliderField
        label="Health staff share of administration"
        value={Number.isFinite(parsedHealthShare) ? parsedHealthShare : 0}
        min={0}
        max={1}
        step={0.01}
        precision={2}
        disabled={!canAct}
        pending={healthShareCommit.hasPending}
        onChange={(value) => setHealthShareText(value.toFixed(2))}
        onCommit={(value) => healthShareCommit.submit(value)}
        hint="0 to 1. Any statutory health-law floor is enforced by the worker."
      />
      <View style={styles.estimate}>
        <Text style={styles.estimateTitle}>Estimate</Text>
        <StatRow
          label="Health staff"
          value={healthPreview.healthStaff.toFixed(0)}
        />
        <StatRow
          label="Administration staff"
          value={healthPreview.administrationStaff.toFixed(0)}
        />
        <StatRow
          label="Staffing coverage"
          value={percent(healthPreview.staffingCoverage)}
        />
        {healthPreview.errors.map((error: string) => (
          <Text key={error} style={styles.warning}>
            {error}
          </Text>
        ))}
      </View>
      <ActionButton
        label="Set health staff share"
        disabled={!canAct}
        onPress={() => applyHealthShare()}
      />

      <Text style={styles.heading}>Labor standards</Text>
      <StatRow
        label="Statutory minimum wage"
        value={
          country.labor.minimumWageRUSDPerYear > 0
            ? `${money.format(country.labor.minimumWageRUSDPerYear)}/year`
            : "No floor enacted"
        }
      />
      {country.labourMarket === null
        ? null
        : country.labourMarket.minimumWage.map((preview) => (
            <View key={preview.lawId} style={styles.estimate}>
              <Text style={styles.estimateTitle}>
                {`${preview.lawName} at ${money.format(preview.floorRUSDPerYear)}/year${preview.enacted ? " (in force)" : ""} · short-run estimate`}
              </Text>
              <StatRow
                label="Covered workers"
                value={formatCount(preview.coveredWorkers)}
                detail="Employees of firms and public institutions; never the self-employed, peasants or owners."
              />
              <StatRow
                label="Paid below the floor today"
                value={formatCount(preview.workersBelowFloor)}
              />
              <StatRow
                label="Jobs at risk"
                value={formatCount(preview.jobsAtRisk)}
                detail="Filled jobs in covered buildings that could not pay their staff at this floor."
                tone={preview.jobsAtRisk > 0 ? "negative" : "default"}
              />
              <StatRow
                label="Compliance"
                value={formatRate(preview.compliance)}
                detail="Share of the gap employers pay; it rises with administration quality."
              />
              <Text style={styles.help}>
                Prices and people are held at today's levels; in time shed output raises prices
                and people move toward work. Monopsony, efficiency wages and pay rises spreading
                up the wage scale are not modelled.
              </Text>
            </View>
          ))}
      <StatRow
        label="Statutory working week"
        value={
          country.labor.hoursPerWeek > 0
            ? `${country.labor.hoursPerWeek.toFixed(0)} hours`
            : "No standard enacted"
        }
      />
      <StatRow
        label="Effective hours factor"
        value={country.labor.hoursFactor.toFixed(3)}
      />
      <Text style={styles.help}>
        Labor and health laws are proposed in the Politics screen. A minimum wage raises
        the wage owed in covered jobs as far as employers comply; buildings that cannot
        pay it take on fewer workers. A shorter week scales output and wages and modestly
        improves mortality. Public health lowers mortality through the population stock.
        Pensions and collective bargaining are deliberately deferred.
      </Text>
    </Section>
  );
}

/** P7 (D-156): the country's labour market, one row per profession with a labour force. */
function LabourMarketSection({
  market,
  snapshot,
  money,
}: {
  readonly market: CountryLabourMarketSnapshot;
  readonly snapshot: SimulationSnapshot;
  readonly money: MoneyFormat;
}) {
  const rows = mergeTerritoryRows(market.territories);
  const nameOf = new Map(snapshot.professions.map((profession) => [profession.id, profession]));
  const owners = market.professions.filter((row) => nameOf.get(row.professionId)?.earns === "residual");
  const marketName = new Map(snapshot.markets.map((entry) => [entry.id, entry.name]));
  return (
    <>
      <Headline
        label="Unemployment"
        value={formatRate(market.unemploymentRate)}
        tone={market.unemploymentRate >= 0.08 ? "negative" : "default"}
        detail={`${formatCount(market.employed)} of ${formatCount(market.labourForce)} in the labour force working · ${formatCount(market.vacancies)} posts unfilled`}
      />
      <Section title="Labour market" subtitle={snapshot.date.label}>
        <StatRow
          label="Work on farms"
          value={formatRate(market.agriculturalEmploymentShare)}
          detail="Share of the employed working on farms: farm jobs, and peasants and farmers on their own land."
        />
        <StatRow
          label="Towns"
          value={`${formatRate(market.urbanShare)} urban`}
          detail="Changes as people move to work, migrate, are born and die."
        />
        <Disclosure title={`Professions · ${String(rows.length)}`}>
          <LabourRows rows={rows} professions={snapshot.professions} money={money} />
          {market.territories.length > 1
            ? market.territories.map((territory) => (
                <Disclosure
                  key={territory.marketId}
                  title={`${marketName.get(territory.marketId) ?? `Territory ${String(territory.marketId)}`} · ${String(territory.rows.length)}`}
                >
                  <LabourRows rows={territory.rows} professions={snapshot.professions} money={money} />
                </Disclosure>
              ))
            : null}
        </Disclosure>
        {owners.map((row) => (
          <DataRow
            key={row.professionId}
            title={nameOf.get(row.professionId)?.name ?? `Profession ${String(row.professionId)}`}
            value={`${money.format(row.incomeRUSDPerHeadYear)}/yr a head`}
            note={`${formatCount(row.persons)} persons outside the labour force: they earn the residual of the buildings and land they own${row.servantsEmployed > 0 ? ` · employ ${formatCount(row.servantsEmployed)} servants` : ""}`}
          />
        ))}
        <StatRow
          label="Household service"
          value={`${formatCount(market.servants.workers)} servants`}
          detail={`Employed by ${String(market.servants.employerBlocks)} groups of middle and upper households · ${money.format(market.servants.wageBillRUSDPerYear)}/yr in wages owed`}
        />
        <Text style={styles.help}>
          Unemployment counts the labour force without work in its own province; a post
          unfilled elsewhere does not employ anyone. Wages are this month's market wage
          before any statutory floor.
        </Text>
      </Section>
    </>
  );
}

const styles = themedSheet(() => ({
  empty: {
    color: colors.muted,
  },
  heading: {
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    fontSize: 15,
    fontFamily: fonts.sansSemiBold,
    color: colors.text,
  },
  help: {
    fontSize: 13,
    color: colors.muted,
    lineHeight: 17,
  },
  estimate: {
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    backgroundColor: colors.surface,
  },
  estimateTitle: {
    fontSize: 13,
    fontFamily: fonts.sansSemiBold,
    color: colors.muted,
    marginBottom: 4,
  },
  warning: {
    marginTop: 4,
    fontSize: 13,
    color: colors.red,
  },
}));

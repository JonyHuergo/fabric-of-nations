import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  countryById,
  formatSUSD,
  previewHealthPolicy,
  previewTrainingPolicy,
  type SimulationSnapshot,
} from "@century/sim-worker";

import { SliderField, useDeferredCommit } from "../components/Slider";
import { ActionButton, Notice, Section, StatRow } from "../components/ui";
import { colors, spacing } from "../theme";
import { useSimulation } from "../worker/SimulationProvider";

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
  const { applyAction, busy, connection } = useSimulation();
  const country = countryById(snapshot, countryId);
  const [budgetText, setBudgetText] = useState("");
  const [stipendText, setStipendText] = useState("");
  const [trainingShareText, setTrainingShareText] = useState("");
  const [healthShareText, setHealthShareText] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (country === null) return;
    setBudgetText(country.labor.trainingBudgetSUSDPerYear.toFixed(0));
    setStipendText(country.labor.trainingStipendPerTraineeSUSDPerYear.toFixed(2));
    setTrainingShareText(country.labor.trainingStaffShare.toFixed(2));
    setHealthShareText(country.labor.healthStaffShare.toFixed(2));
    setLocalError(null);
  }, [
    countryId,
    country?.labor.trainingBudgetSUSDPerYear,
    country?.labor.trainingStipendPerTraineeSUSDPerYear,
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
      trainingBudgetSUSDPerYear: overrides.budget ?? Number(budgetText),
      trainingStipendPerTraineeSUSDPerYear: overrides.stipend ?? Number(stipendText),
      trainingStaffShare: overrides.share ?? Number(trainingShareText),
    });
  };

  const applyTrainingBudget = (annualSUSDOverride?: number): void => {
    if (country === null) return;
    const annualSUSD = annualSUSDOverride ?? Number(budgetText);
    const preview = trainingPreviewFor({ budget: annualSUSD });
    submit(
      { kind: "set-training-budget", countryId: country.id, annualSUSD },
      preview !== null && preview.errors.length > 0 ? preview.errors.join(" ") : null,
    );
  };

  const applyTrainingStipend = (annualSUSDOverride?: number): void => {
    if (country === null) return;
    const annualSUSD = annualSUSDOverride ?? Number(stipendText);
    const preview = trainingPreviewFor({ stipend: annualSUSD });
    submit(
      { kind: "set-training-stipend", countryId: country.id, annualSUSD },
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
    trainingBudgetSUSDPerYear: parsedBudget,
    trainingStipendPerTraineeSUSDPerYear: parsedStipend,
    trainingStaffShare: parsedTrainingShare,
  });
  const healthPreview = previewHealthPolicy(snapshot, country, parsedHealthShare);

  // Practical slider ranges inside the authoritative 0..MAX_FISCAL_BUDGET bounds.
  // The annual step is 1% of the slider maximum; share steps are 0.01.
  const budgetMax = Math.max(
    1_000_000,
    Math.round(country.treasuryCashSUSD * 0.5),
    Math.round(country.labor.trainingBudgetSUSDPerYear * 2),
  );
  const budgetStep = Math.max(1_000, Math.round(budgetMax / 100));
  const stipendMax = Math.max(
    10_000,
    Math.round(country.labor.trainingStipendPerTraineeSUSDPerYear * 2),
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
        value={`${formatSUSD(country.labor.trainingBudgetSUSDPerYear)}/year`}
      />
      <StatRow
        label="Stipend per trainee"
        value={`${formatSUSD(country.labor.trainingStipendPerTraineeSUSDPerYear)}/year`}
      />
      <StatRow
        label="Month-to-date requested"
        value={formatSUSD(country.labor.trainingRequestedMonthToDateSUSD)}
      />
      <StatRow
        label="Month-to-date shortfall"
        value={formatSUSD(country.labor.trainingShortfallMonthToDateSUSD)}
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
        unit="SUSD/yr"
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
        unit="SUSD/yr"
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
          value={`${formatSUSD(trainingPreview.annualCostSUSD)}/year`}
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
          country.labor.minimumWageSUSDPerYear > 0
            ? `${formatSUSD(country.labor.minimumWageSUSDPerYear)}/year`
            : "No floor enacted"
        }
      />
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
        the actual wage obligation; a shorter week scales output and wages and modestly
        improves mortality. Public health lowers mortality through the population stock.
        Pensions, collective bargaining, and labor-market enforcement are deliberately
        deferred.
      </Text>
    </Section>
  );
}

const styles = StyleSheet.create({
  empty: {
    color: colors.muted,
  },
  heading: {
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    fontSize: 15,
    fontWeight: "600",
    color: colors.text,
  },
  help: {
    fontSize: 12,
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
    fontSize: 12,
    fontWeight: "600",
    color: colors.muted,
    marginBottom: 4,
  },
  warning: {
    marginTop: 4,
    fontSize: 12,
    color: colors.red,
  },
});

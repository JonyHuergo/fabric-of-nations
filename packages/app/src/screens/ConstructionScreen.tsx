import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  countryById,
  formatQuantity,
  formatRate,
  formatSUSD,
  previewConstruction,
  type SimulationSnapshot,
} from "@century/sim-worker";

import { ActionButton, Pill, Section, StatRow } from "../components/ui";
import { colors, radii, spacing } from "../theme";
import { useSimulation } from "../worker/SimulationProvider";

export function ConstructionScreen({
  snapshot,
  countryId,
}: {
  readonly snapshot: SimulationSnapshot;
  readonly countryId: number | null;
}) {
  const { applyAction, busy, running, connection } = useSimulation();
  const country = countryById(snapshot, countryId);
  const [definitionId, setDefinitionId] = useState<number | null>(null);
  const [regionId, setRegionId] = useState<number | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (country === null) return;
    const types = snapshot.projectTypes;
    setDefinitionId((current) =>
      current !== null && types.some((type) => type.definitionId === current)
        ? current
        : (types[0]?.definitionId ?? null),
    );
    setRegionId((current) =>
      current !== null && country.regionIds.includes(current)
        ? current
        : (country.regionIds[0] ?? null),
    );
  }, [countryId, snapshot.projectTypes, country]);

  if (country === null) {
    return (
      <Section title="Construction">
        <Text style={styles.empty}>Select a country on the map.</Text>
      </Section>
    );
  }
  const isPlayerCountry =
    snapshot.playerCountryId !== null && country.id === snapshot.playerCountryId;
  const canAct = isPlayerCountry && !busy && connection === "ready";
  const selectedType =
    definitionId === null
      ? null
      : (snapshot.projectTypes.find((type) => type.definitionId === definitionId) ?? null);
  const preview =
    selectedType !== null && regionId !== null
      ? previewConstruction(snapshot, country, selectedType.definitionId, regionId)
      : null;
  const projects = [...country.constructionProjects].sort((left, right) => {
    const active = (status: string) =>
      status === "completed" || status === "cancelled" ? 1 : 0;
    return active(left.status) - active(right.status) || right.id - left.id;
  });

  const start = (): void => {
    if (!isPlayerCountry) {
      setLocalError("Only the player-controlled country may authorize construction.");
      return;
    }
    if (selectedType === null || regionId === null || preview === null || !preview.valid) {
      setLocalError(preview?.errors.join(" ") ?? "Select a valid project type and region.");
      return;
    }
    setLocalError(null);
    applyAction({
      kind: "start-construction",
      countryId: country.id,
      regionId,
      definitionId: selectedType.definitionId,
    });
  };

  const order = (
    projectId: number,
    kind: "cancel-construction" | "set-construction-paused",
    paused?: boolean,
  ): void => {
    if (!isPlayerCountry) {
      setLocalError("Only the player-controlled country may change construction orders.");
      return;
    }
    setLocalError(null);
    if (kind === "cancel-construction") {
      applyAction({ kind, countryId: country.id, projectId });
    } else {
      applyAction({
        kind,
        countryId: country.id,
        projectId,
        paused: paused === true,
      });
    }
  };

  return (
    <View>
      <Section
        title="Construction"
        subtitle={`${country.name} · ${isPlayerCountry ? "Player country" : "AI-controlled"} · real public investment: idle labor, treasury cash, and time create a state-owned productive building.`}
      >
        <StatRow
          label="Treasury cash (stock)"
          value={formatSUSD(country.treasuryCashSUSD)}
          detail={`Construction work-in-progress ${formatSUSD(country.constructionInProgressSUSD)} · public capital ${formatSUSD(country.publicCapitalSUSD)}`}
        />
        <StatRow
          label="Idle construction labor"
          value={`${formatQuantity(country.constructionLabor.idleWorkers)} workers`}
          detail={`Mean daily base wage ${formatSUSD(country.constructionLabor.dailyWageSUSD)} · only workers not assigned to production are hired`}
        />
        <StatRow
          label="This month construction outlay"
          value={formatSUSD(country.budgetMonthToDate.constructionSpentSUSD)}
          detail={`Written off on cancellation ${formatSUSD(country.budgetMonthToDate.constructionWrittenOffSUSD)}; capital spending is not an expense.`}
        />
        <StatRow
          label="Retained history"
          value={`${String(country.constructionHistory.projectsCompleted)} completed · ${String(country.constructionHistory.projectsCancelled)} cancelled`}
          detail={`Compacted spent ${formatSUSD(country.constructionHistory.totalSpentSUSD)} · written off ${formatSUSD(country.constructionHistory.totalWrittenOffSUSD)}`}
        />
      </Section>

      <Section
        title="Choose a public project"
        subtitle="Only validated productive building definitions that permit state ownership are offered. Materials and contractor procurement are not modeled in E3."
      >
        {snapshot.projectTypes.length === 0 ? (
          <Text style={styles.empty}>No public project types are available in this data set.</Text>
        ) : (
          <View style={styles.typeList}>
            {snapshot.projectTypes.map((type) => (
              <Pill
                key={type.definitionId}
                label={`${type.name} · ${formatSUSD(type.constructionCostSUSD)}`}
                active={definitionId === type.definitionId}
                onPress={() => setDefinitionId(type.definitionId)}
                disabled={!isPlayerCountry || busy}
              />
            ))}
          </View>
        )}
        <Text style={styles.inputLabel}>Target region</Text>
        <View style={styles.typeList}>
          {country.regionIds.map((id) => (
            <Pill
              key={id}
              label={`Region ${String(id)}`}
              active={regionId === id}
              onPress={() => setRegionId(id)}
              disabled={!isPlayerCountry || busy}
            />
          ))}
        </View>
        {selectedType === null ? null : (
          <>
            <StatRow
              label="Project type"
              value={selectedType.name}
              detail={`${String(selectedType.constructionWorkers)} maximum crew · ${formatQuantity(selectedType.plannedJobs)} planned jobs at level 1`}
            />
            <StatRow
              label="Construction cost"
              value={formatSUSD(selectedType.constructionCostSUSD)}
              detail={`Paid as construction wages over time; working-capital target ${formatSUSD(selectedType.workingCapitalSUSD)} (30 days upkeep).`}
            />
            <StatRow
              label="Output at level 1"
              value={selectedType.outputs
                .map(
                  (output) =>
                    `${formatQuantity(output.dailyCapacityAtLevelOne)} ${output.unitLabel} ${output.goodName}/day`,
                )
                .join(" · ")}
              detail={`Daily upkeep ${formatSUSD(selectedType.dailyUpkeepSUSDAtLevelOne)}; the completed building then uses ordinary production, employment, market, and state-remittance rules.`}
            />
            {preview === null ? null : (
              <>
                <StatRow
                  label="Treasury requirement"
                  value={`${formatSUSD(preview.upfrontRequirementSUSD)} upfront`}
                  detail={`Treasury ${formatSUSD(preview.treasuryCashSUSD)} · grant ${preview.valid ? "affordable" : "not affordable"}`}
                />
                <StatRow
                  label="Crew and duration estimate"
                  value={
                    preview.estimatedDays === null
                      ? "Waiting for labor"
                      : `${formatQuantity(preview.desiredCrew)} workers · ~${String(preview.estimatedDays)} days`
                  }
                  detail={`Daily payroll estimate ${formatSUSD(preview.estimatedDailyPayrollSUSD)} at the current idle wage; a static projection, not a promise.`}
                />
                {preview.errors.map((error) => (
                  <Text key={error} style={styles.error}>
                    • {error}
                  </Text>
                ))}
                {preview.constraints.map((constraint) => (
                  <Text key={constraint} style={styles.note}>
                    • {constraint}
                  </Text>
                ))}
              </>
            )}
            {localError === null ? null : <Text style={styles.error}>{localError}</Text>}
            <View style={styles.applyRow}>
              <ActionButton
                label={isPlayerCountry ? "Authorize construction" : "AI-controlled country"}
                tone="accent"
                onPress={start}
                disabled={!canAct || preview === null || !preview.valid}
              />
            </View>
          </>
        )}
      </Section>

      <Section
        title="Project queue"
        subtitle="Authorized projects start on the next processed day. Progress is gross construction payroll divided by the authorized cost; blocked projects report the concrete reason."
      >
        {projects.length === 0 ? (
          <Text style={styles.empty}>No construction projects yet.</Text>
        ) : (
          projects.map((project) => {
            const progressPercent = Math.min(100, Math.max(0, project.progress * 100));
            return (
              <View key={project.id} style={styles.projectRow}>
                <Text style={styles.projectTitle}>
                  #{String(project.id)} {project.definitionName} · {project.regionName} ·{" "}
                  {project.status.toUpperCase()}
                </Text>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
                </View>
                <Text style={styles.projectDetail}>
                  {formatRate(project.progress)} · spent {formatSUSD(project.spentSUSD)} of{" "}
                  {formatSUSD(project.totalCostSUSD)} · remaining{" "}
                  {formatSUSD(project.remainingSUSD)}
                </Text>
                <Text style={styles.projectDetail}>
                  Workers last day {String(project.lastWorkers)}
                  {project.blockedReason === null
                    ? ""
                    : ` · waiting for ${project.blockedReason === "funds" ? "treasury funds" : "idle labor"}`}
                  {project.completedDay === null ? "" : ` · completed day ${String(project.completedDay)}`}
                  {project.cancelledDay === null ? "" : ` · cancelled day ${String(project.cancelledDay)}`}
                  {project.buildingId === null ? "" : ` · building #${String(project.buildingId)}`}
                </Text>
                {project.status === "completed" || project.status === "cancelled" ? null : (
                  <View style={styles.projectActions}>
                    <ActionButton
                      label={
                        project.status === "paused"
                          ? "Resume"
                          : project.status === "authorized"
                            ? "Pause before start"
                            : "Pause"
                      }
                      onPress={() =>
                        order(
                          project.id,
                          "set-construction-paused",
                          project.status !== "paused",
                        )
                      }
                      disabled={!canAct}
                    />
                    <ActionButton
                      label="Cancel"
                      tone="danger"
                      onPress={() => order(project.id, "cancel-construction")}
                      disabled={!canAct}
                    />
                  </View>
                )}
              </View>
            );
          })
        )}
        {!isPlayerCountry ? (
          <Text style={styles.note}>
            This country is AI-governed. Select the player country to authorize or manage projects.
          </Text>
        ) : null}
        {running ? (
          <Text style={styles.note}>
            Simulation is running. Actions are accepted between ticks; pause for a predictable start day.
          </Text>
        ) : null}
      </Section>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { color: colors.muted, fontSize: 13, paddingVertical: spacing.sm },
  typeList: { flexDirection: "row", flexWrap: "wrap", rowGap: spacing.xs, marginTop: spacing.sm },
  inputLabel: { color: colors.muted, fontSize: 12, marginTop: spacing.sm, marginBottom: spacing.xs },
  error: { color: colors.red, fontSize: 12, marginTop: spacing.sm },
  note: { color: colors.faint, fontSize: 10, lineHeight: 15, marginTop: 4 },
  applyRow: { marginTop: spacing.md },
  projectRow: {
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.sm,
    marginTop: spacing.sm,
  },
  projectTitle: { color: colors.text, fontSize: 12, fontWeight: "700" },
  projectDetail: { color: colors.muted, fontSize: 10, marginTop: 2, lineHeight: 14 },
  progressTrack: {
    height: 6,
    borderRadius: radii.md,
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: spacing.xs,
    overflow: "hidden",
  },
  progressFill: { height: 6, backgroundColor: colors.accent },
  projectActions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
});

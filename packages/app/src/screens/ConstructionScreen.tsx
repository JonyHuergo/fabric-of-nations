import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  countryById,
  formatQuantity,
  formatRate,
  formatRUSD,
  previewConstruction,
  type SimulationSnapshot,
} from "@century/sim-worker";

import { ActionButton, Headline, Pill, Section, StatRow } from "../components/ui";
import { colors, fonts, radii, spacing, themedSheet } from "../theme";
import { useSimulation } from "../worker/SimulationProvider";
import { provinceEconomyRows, type ProvinceEconomySnapshot } from "@century/sim-worker";
import { provinceDisplayName } from "../provinceNames";

/** Quick picks: a country's most populous provinces, keeping the current pick in view (P2). */
function mostPopulousProvinces(
  snapshot: SimulationSnapshot,
  countryId: number,
  keep: number | null,
): readonly ProvinceEconomySnapshot[] {
  const owned = provinceEconomyRows(snapshot)
    .filter((province) => province.countryId === countryId)
    .sort((left, right) => right.population - left.population || left.id - right.id);
  const top = owned.slice(0, 12);
  const kept = keep === null ? undefined : owned.find((province) => province.id === keep);
  return kept !== undefined && !top.includes(kept) ? [...top, kept] : top;
}

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
  const [provinceId, setProvinceId] = useState<number | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (country === null) return;
    const types = snapshot.projectTypes;
    setDefinitionId((current) =>
      current !== null && types.some((type) => type.definitionId === current)
        ? current
        : (types[0]?.definitionId ?? null),
    );
    setProvinceId((current) =>
      current !== null && country.provinceIds.includes(current)
        ? current
        : (mostPopulousProvinces(snapshot, country.id, null)[0]?.id ?? country.provinceIds[0] ?? null),
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
  const canAct =
    isPlayerCountry && snapshot.constructionEnabled && !busy && connection === "ready";
  const selectedType =
    definitionId === null
      ? null
      : (snapshot.projectTypes.find((type) => type.definitionId === definitionId) ?? null);
  const preview =
    selectedType !== null && provinceId !== null
      ? previewConstruction(snapshot, country, selectedType.definitionId, provinceId)
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
    if (selectedType === null || provinceId === null || preview === null || !preview.valid) {
      setLocalError(preview?.errors.join(" ") ?? "Select a valid project type and province.");
      return;
    }
    setLocalError(null);
    applyAction({
      kind: "start-construction",
      countryId: country.id,
      provinceId,
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
      <Headline
        label="Public capital"
        value={formatRUSD(country.publicCapitalRUSD)}
        detail={`${formatRUSD(country.constructionInProgressRUSD)} in progress · ${String(projects.filter((project) => project.status === "active").length)} active projects`}
      />
      <Section
        title="Construction"
        subtitle={`${country.name} · ${isPlayerCountry ? "Player country" : "AI-controlled"} · real public investment: idle labor, treasury cash, and time create a state-owned productive building.`}
      >
        <StatRow
          label="Treasury cash (stock)"
          value={formatRUSD(country.treasuryCashRUSD)}
          detail={`Construction work-in-progress ${formatRUSD(country.constructionInProgressRUSD)} · public capital ${formatRUSD(country.publicCapitalRUSD)}`}
        />
        <StatRow
          label="Idle construction labor"
          value={`${formatQuantity(country.constructionLabor.idleWorkers)} workers`}
          detail={`Mean daily base wage ${formatRUSD(country.constructionLabor.dailyWageRUSD)} · only workers not assigned to production are hired`}
        />
        <StatRow
          label="This month construction outlay"
          value={formatRUSD(country.budgetMonthToDate.constructionSpentRUSD)}
          detail={`Materials ${formatRUSD(country.budgetMonthToDate.constructionMaterialsSpentRUSD)} · written off ${formatRUSD(country.budgetMonthToDate.constructionWrittenOffRUSD)}; capital spending is not an expense.`}
        />
        <StatRow
          label="Retained history"
          value={`${String(country.constructionHistory.projectsCompleted)} completed · ${String(country.constructionHistory.projectsCancelled)} cancelled`}
          detail={`Compacted spent ${formatRUSD(country.constructionHistory.totalSpentRUSD)} · written off ${formatRUSD(country.constructionHistory.totalWrittenOffRUSD)}`}
        />
        {!snapshot.constructionEnabled ? (
          <Text style={styles.error}>
            This scenario disables the state-enterprise profit-distribution policy, so public
            construction is unavailable. No project can be authorized.
          </Text>
        ) : null}
      </Section>

      <Section folded
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
                label={`${type.name} · ${formatRUSD(type.constructionCostRUSD)}`}
                active={definitionId === type.definitionId}
                onPress={() => setDefinitionId(type.definitionId)}
                disabled={!isPlayerCountry || busy}
              />
            ))}
          </View>
        )}
        <Text style={styles.inputLabel}>Target province (most populous)</Text>
        <View style={styles.typeList}>
          {mostPopulousProvinces(snapshot, country.id, provinceId).map((province) => (
            <Pill
              key={province.id}
              label={provinceDisplayName(province.id)}
              active={provinceId === province.id}
              onPress={() => setProvinceId(province.id)}
              disabled={!isPlayerCountry || busy}
            />
          ))}
        </View>
        {selectedType === null ? null : (
          <>
            <StatRow
              label="Project type"
              value={selectedType.name}
              detail={`${selectedType.sector} · ${String(selectedType.constructionWorkers)} maximum crew · ${formatQuantity(selectedType.plannedJobs)} planned jobs at level 1`}
            />
            <StatRow
              label="Construction labor budget"
              value={formatRUSD(selectedType.constructionCostRUSD)}
              detail={`Paid as construction wages over time; working-capital target ${formatRUSD(selectedType.workingCapitalRUSD)} (30 days upkeep).`}
            />
            <StatRow
              label="Output at level 1"
              value={selectedType.outputs
                .map(
                  (output) =>
                    `${formatQuantity(output.dailyCapacityAtLevelOne)} ${output.unitLabel} ${output.goodName}/day`,
                )
                .join(" · ")}
              detail={`Daily upkeep ${formatRUSD(selectedType.dailyUpkeepRUSDAtLevelOne)}; the completed building then uses ordinary production, employment, market, and state-remittance rules.`}
            />
            {preview === null ? null : (
              <>
                <StatRow
                  label="Treasury requirement"
                  value={`${formatRUSD(preview.upfrontRequirementRUSD)} upfront`}
                  detail={`Materials estimate ${formatRUSD(preview.estimatedMaterialsCostRUSD)} · total investment estimate ${formatRUSD(preview.totalInvestmentRUSD)} · treasury ${formatRUSD(preview.treasuryCashRUSD)} · grant ${preview.valid ? "affordable" : "not affordable"}`}
                />
                {preview.materials.length === 0 ? null : (
                  <View style={styles.materials}>
                    <Text style={styles.inputLabel}>Materials bought from the provincial market</Text>
                    {preview.materials.map((material) => (
                      <Text key={material.goodId} style={styles.projectDetail}>
                        {material.goodName}: {formatQuantity(material.requiredQuantity)}{" "}
                        {material.unitLabel} · price {formatRUSD(material.unitPriceRUSD)} · market
                        stock {formatQuantity(material.marketStock)} · estimated{" "}
                        {formatRUSD(material.estimatedCostRUSD)}
                        {material.shortfallQuantity > 0
                          ? ` · short ${formatQuantity(material.shortfallQuantity)}`
                          : ""}
                      </Text>
                    ))}
                  </View>
                )}
                <StatRow
                  label="Crew and duration estimate"
                  value={
                    preview.estimatedDays === null
                      ? "Waiting for labor"
                      : `${formatQuantity(preview.desiredCrew)} workers · ~${String(preview.estimatedDays)} days`
                  }
                  detail={`Daily payroll estimate ${formatRUSD(preview.estimatedDailyPayrollRUSD)} at the current idle wage; a static projection, not a promise.`}
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

      <Section folded
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
                  #{String(project.id)} {project.definitionName} · {project.provinceName} ·{" "}
                  {project.status.toUpperCase()}
                </Text>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
                </View>
                <Text style={styles.projectDetail}>
                  Labor {formatRate(project.progress)} · materials{" "}
                  {formatRate(project.materialsProgress)} · spent {formatRUSD(project.spentRUSD)} +{" "}
                  {formatRUSD(project.materialsSpentRUSD)} materials · remaining{" "}
                  {formatRUSD(project.remainingRUSD)}
                </Text>
                {project.materials.length === 0 ? null : (
                  <Text style={styles.projectDetail}>
                    Materials:{" "}
                    {project.materials
                      .map(
                        (material) =>
                          `${material.goodName} ${formatQuantity(material.deliveredQuantity)}/${formatQuantity(material.requiredQuantity)} ${material.unitLabel}`,
                      )
                      .join(" · ")}
                  </Text>
                )}
                <Text style={styles.projectDetail}>
                  Workers last day {String(project.lastWorkers)}
                  {project.blockedReason === null
                    ? ""
                    : ` · waiting for ${
                        project.blockedReason === "funds"
                          ? "treasury funds"
                          : project.blockedReason === "materials"
                            ? "materials"
                            : "idle labor"
                      }`}
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

const styles = themedSheet(() => ({
  empty: { color: colors.muted, fontFamily: fonts.sans, fontSize: 13, paddingVertical: spacing.sm },
  typeList: { flexDirection: "row", flexWrap: "wrap", rowGap: spacing.xs, marginTop: spacing.sm },
  materials: { marginTop: spacing.sm },
  inputLabel: { color: colors.muted, fontFamily: fonts.sans, fontSize: 13, marginTop: spacing.sm, marginBottom: spacing.xs },
  error: { color: colors.red, fontFamily: fonts.sans, fontSize: 13, marginTop: spacing.sm },
  note: { color: colors.faint, fontFamily: fonts.sans, fontSize: 11, lineHeight: 15, marginTop: 4 },
  applyRow: { marginTop: spacing.md },
  projectRow: {
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.sm,
    marginTop: spacing.sm,
  },
  projectTitle: { color: colors.text, fontSize: 13, fontFamily: fonts.sansSemiBold },
  projectDetail: { color: colors.muted, fontFamily: fonts.sans, fontSize: 11, marginTop: 2, lineHeight: 14 },
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
}));

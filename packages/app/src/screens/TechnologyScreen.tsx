import { useEffect, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import {
  countryById,
  formatSUSD,
  previewEducationFunding,
  previewResearchStaffShare,
  previewResearchStart,
  type SimulationSnapshot,
} from "@century/sim-worker";

import { ActionButton, Notice, Section, StatRow } from "../components/ui";
import { colors, spacing } from "../theme";
import { useSimulation } from "../worker/SimulationProvider";

type ResearchStatus = "researched" | "active" | "available" | "locked";

const STATUS_LABELS: Record<ResearchStatus, string> = {
  researched: "Researched",
  active: "Researching",
  available: "Available",
  locked: "Locked",
};

export function TechnologyScreen({
  snapshot,
  countryId,
}: {
  readonly snapshot: SimulationSnapshot;
  readonly countryId: number | null;
}) {
  const { applyAction, busy, connection } = useSimulation();
  const country = countryById(snapshot, countryId);
  const [fundingText, setFundingText] = useState("");
  const [shareText, setShareText] = useState("");
  const [selectedTechnologyId, setSelectedTechnologyId] = useState<number | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (country === null) return;
    setFundingText(country.education.fundedAnnualSUSD.toFixed(0));
    setShareText(country.education.researchStaffShare.toFixed(2));
    setSelectedTechnologyId(null);
  }, [
    countryId,
    country?.education.fundedAnnualSUSD,
    country?.education.researchStaffShare,
  ]);

  if (country === null) {
    return (
      <Section title="Technology">
        <Text style={styles.empty}>Select a country on the map.</Text>
      </Section>
    );
  }
  const technology = country.technology;
  if (!technology.enabled) {
    return (
      <Section title="Technology">
        <Notice title="M9 technology unavailable" tone="warning">
          This world has no validated technology definitions. Research, education, and
          technology effects are inert.
        </Notice>
      </Section>
    );
  }
  const isPlayerCountry =
    snapshot.playerCountryId !== null && country.id === snapshot.playerCountryId;
  const canAct = isPlayerCountry && !busy && connection === "ready";
  const parsedFunding = Number(fundingText);
  const parsedShare = Number(shareText);
  const fundingPreview = previewEducationFunding(snapshot, country, parsedFunding);
  const sharePreview = previewResearchStaffShare(snapshot, country, parsedShare);
  const statusById = new Map(
    technology.statuses.map((status) => [status.technologyId, status] as const),
  );
  const catalog = snapshot.technologyCatalog;
  const selected =
    selectedTechnologyId === null
      ? null
      : (catalog.find((entry) => entry.technologyId === selectedTechnologyId) ?? null);
  const researchPreview =
    selectedTechnologyId === null
      ? null
      : previewResearchStart(snapshot, country, selectedTechnologyId);

  const setFunding = (): void => {
    if (!isPlayerCountry) {
      setLocalError("Only the player-controlled country may set education funding.");
      return;
    }
    if (!fundingPreview.valid) {
      setLocalError(fundingPreview.errors.join(" "));
      return;
    }
    setLocalError(null);
    applyAction({
      kind: "set-education-funding",
      countryId: country.id,
      annualSUSD: parsedFunding,
    });
  };

  const setShare = (): void => {
    if (!isPlayerCountry) {
      setLocalError("Only the player-controlled country may set research staffing.");
      return;
    }
    if (!sharePreview.valid) {
      setLocalError(sharePreview.errors.join(" "));
      return;
    }
    setLocalError(null);
    applyAction({
      kind: "set-research-staff-share",
      countryId: country.id,
      share: parsedShare,
    });
  };

  const startResearch = (): void => {
    if (!isPlayerCountry) {
      setLocalError("Only the player-controlled country may choose research.");
      return;
    }
    if (researchPreview === null || !researchPreview.valid || selectedTechnologyId === null) {
      setLocalError(researchPreview?.errors.join(" ") ?? "Select a technology first.");
      return;
    }
    setLocalError(null);
    applyAction({
      kind: "start-research",
      countryId: country.id,
      technologyId: selectedTechnologyId,
    });
  };

  const cancelResearch = (): void => {
    if (!isPlayerCountry) {
      setLocalError("Only the player-controlled country may cancel research.");
      return;
    }
    setLocalError(null);
    applyAction({ kind: "cancel-research", countryId: country.id });
  };

  const activeEntry =
    technology.activeProjectTechnologyId === null
      ? null
      : (catalog.find(
          (entry) => entry.technologyId === technology.activeProjectTechnologyId,
        ) ?? null);
  const activeStatus =
    technology.activeProjectTechnologyId === null
      ? null
      : (statusById.get(technology.activeProjectTechnologyId) ?? null);

  return (
    <View>
      <Section
        title="Technology"
        subtitle={`${country.name} · ${isPlayerCountry ? "Player country" : "AI-controlled"} · research progresses only from funded academic work, never from time alone.`}
      >
        <StatRow
          label="Researched"
          value={`${String(technology.researchedCount)} / ${String(catalog.length)}`}
          detail={`Effects are derived from the researched set. Mortality factor ${technology.mortalityFactor.toFixed(3)} · education bonus +${(technology.educationBonus * 100).toFixed(1)}%.`}
        />
        <StatRow
          label="Active project"
          value={activeEntry?.name ?? "None"}
          detail={
            activeEntry === null || activeStatus === null
              ? technology.researchBlockedReason === null
                ? "Select an available technology to begin research."
                : `Research blocked: ${technology.researchBlockedReason}.`
              : `${activeStatus.workCompleted.toFixed(0)} / ${activeEntry.researchWork.toFixed(0)} researcher-days (${((activeStatus.workCompleted / activeEntry.researchWork) * 100).toFixed(1)}%).`
          }
        />
        {technology.productivityBySector.map((sector) => (
          <StatRow
            key={sector.sector}
            label={`${sector.sector} output factor`}
            value={`×${sector.factor.toFixed(3)}`}
          />
        ))}
        {activeEntry === null ? null : (
          <ActionButton
            label="Cancel research"
            tone="danger"
            onPress={cancelResearch}
            disabled={!canAct}
          />
        )}
      </Section>

      <Section
        title="Education"
        subtitle="Academic staff, funding, and the enacted education law set capacity and quality. Attendance is limited by teaching capacity and household resources. Reported values are current derived state, not a forecast."
      >
        <StatRow
          label="Academics"
          value={country.education.academicPopulation.toLocaleString()}
          detail={`${country.education.availableAcademicWorkers.toLocaleString()} participating working-age academics · ${country.education.researchStaff.toLocaleString()} assigned to research · ${country.education.teacherStaff.toLocaleString()} to teaching`}
        />
        <StatRow
          label="Schooling"
          value={`${(country.education.attendanceRate * 100).toFixed(1)}% attendance`}
          detail={`School age ${country.education.schoolAgePopulation.toLocaleString()} · capacity ${country.education.teachingCapacityStudents.toLocaleString()} · enrolled ${country.education.enrolledStudents.toLocaleString()}`}
        />
        <StatRow
          label="Quality"
          value={`${(country.education.quality * 100).toFixed(1)}%`}
          detail={`Funding adequacy ${(country.education.fundingAdequacy * 100).toFixed(1)}% · service output index ${(country.education.serviceOutputIndex * 100).toFixed(1)}% · adult literacy ${(country.literacy * 100).toFixed(1)}%`}
        />
        <StatRow
          label="Funding (this month)"
          value={`${formatSUSD(country.education.fundedAnnualSUSD)}/yr`}
          detail={`Requested ${formatSUSD(country.education.fundingRequestedMonthToDateSUSD)} · shortfall ${formatSUSD(country.education.fundingShortfallMonthToDateSUSD)}`}
        />
        {country.education.educationBlockedReason === null ? null : (
          <Text style={styles.detail}>
            Schooling constrained: {country.education.educationBlockedReason}.
          </Text>
        )}
        <View style={styles.row}>
          <TextInput
            value={fundingText}
            onChangeText={setFundingText}
            keyboardType="decimal-pad"
            editable={canAct}
            style={styles.input}
            accessibilityLabel="Education funding SUSD per year"
          />
          <Text style={styles.unit}>SUSD/yr</Text>
          <ActionButton
            label="Set funding"
            tone="accent"
            onPress={setFunding}
            disabled={!canAct || !fundingPreview.valid}
          />
        </View>
        <Text style={styles.detail}>
          Daily request {formatSUSD(fundingPreview.dailyRequestSUSD)}; treasury cash{" "}
          {formatSUSD(country.treasuryCashSUSD)}. Funding also pays research staff.
        </Text>
        <View style={styles.row}>
          <TextInput
            value={shareText}
            onChangeText={setShareText}
            keyboardType="decimal-pad"
            editable={canAct}
            style={styles.input}
            accessibilityLabel="Research staff share 0 to 1"
          />
          <Text style={styles.unit}>research share</Text>
          <ActionButton
            label="Set share"
            tone="accent"
            onPress={setShare}
            disabled={!canAct || !sharePreview.valid}
          />
        </View>
        <Text style={styles.detail}>
          At this share: {sharePreview.researchStaff.toLocaleString()} researchers,{" "}
          {sharePreview.teacherStaff.toLocaleString()} teachers, capacity{" "}
          {sharePreview.teachingCapacityStudents.toLocaleString()} students.
        </Text>
        {localError === null ? null : <Text style={styles.error}>{localError}</Text>}
      </Section>

      <Section
        title="Technology catalog"
        subtitle="Prerequisites are validated data. Locked technologies require earlier research; a technology completed today applies from the next civil day."
      >
        {[...new Set(catalog.map((entry) => entry.era))].map((era) => (
          <View key={era} style={styles.era}>
            <Text style={styles.eraTitle}>
              Era {era}: {snapshot.technologyEraNames[era - 1] ?? ""}
            </Text>
            {catalog
              .filter((entry) => entry.era === era)
              .map((entry) => {
                const status = statusById.get(entry.technologyId);
                if (status === undefined) return null;
                return (
                <View key={entry.technologyId} style={styles.tech}>
                  <View style={styles.rowText}>
                    <Text style={styles.label}>{entry.name}</Text>
                    <Text style={styles.detail}>
                      {STATUS_LABELS[status.status]} · {entry.researchWork.toFixed(0)}{" "}
                      researcher-days
                      {status.status === "active" || status.workCompleted > 0
                        ? ` · ${status.workCompleted.toFixed(0)} done`
                        : ""}
                    </Text>
                    {entry.effects.length === 0 ? null : (
                      <Text style={styles.detail}>{entry.effects.join(" · ")}</Text>
                    )}
                    {entry.unlockedBuildingKeys.length === 0 ? null : (
                      <Text style={styles.detail}>
                        Unlocks buildings: {entry.unlockedBuildingKeys.join(", ")}
                      </Text>
                    )}
                    {entry.requiredByLawKeys.length === 0 ? null : (
                      <Text style={styles.detail}>
                        Enables laws: {entry.requiredByLawKeys.join(", ")}
                      </Text>
                    )}
                    {entry.prerequisiteKeys.length === 0 ? null : (
                      <Text style={styles.detail}>
                        Requires: {entry.prerequisiteKeys.join(", ")}
                      </Text>
                    )}
                  </View>
                  <ActionButton
                    label={status.status === "active" ? "Selected" : "Select"}
                    onPress={() => setSelectedTechnologyId(entry.technologyId)}
                    disabled={
                      !canAct ||
                      status.status === "researched" ||
                      status.status === "active"
                    }
                  />
                </View>
                );
              })}
          </View>
        ))}
        {selected === null || researchPreview === null ? null : (
          <View style={styles.preview}>
            <Text style={styles.previewTitle}>
              {selected.name}: {researchPreview.valid ? "ready" : "blocked"}
            </Text>
            <Text style={styles.detail}>
              Remaining {researchPreview.remainingWork.toFixed(0)} researcher-days.
            </Text>
            {researchPreview.errors.map((error) => (
              <Text key={error} style={styles.error}>
                {error}
              </Text>
            ))}
            <ActionButton
              label="Start research"
              tone="accent"
              onPress={startResearch}
              disabled={!canAct || !researchPreview.valid}
            />
          </View>
        )}
      </Section>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { color: colors.muted, fontSize: 12 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  rowText: { flex: 1 },
  label: { color: colors.text, fontSize: 13, fontWeight: "600" },
  detail: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 2 },
  input: {
    minWidth: 100,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
    color: colors.text,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    fontSize: 13,
    textAlign: "right",
  },
  unit: { color: colors.faint, fontSize: 11 },
  error: { color: colors.red, fontSize: 11, lineHeight: 16, marginTop: spacing.xs },
  era: { marginTop: spacing.md, gap: spacing.xs },
  eraTitle: { color: colors.text, fontSize: 13, fontWeight: "700" },
  tech: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: 2,
  },
  preview: {
    marginTop: spacing.md,
    padding: spacing.sm,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
    backgroundColor: colors.surface,
    gap: spacing.xs,
  },
  previewTitle: { color: colors.text, fontSize: 13, fontWeight: "700" },
});

import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  countryById,
  previewEducationFunding,
  previewResearchStaffShare,
  previewResearchStart,
  type SimulationSnapshot,
} from "@century/sim-worker";

import { SliderField, useDeferredCommit } from "../components/Slider";
import { ActionButton, Disclosure, Headline, Notice, Section, StatRow } from "../components/ui";
import { colors, fonts, spacing, themedSheet } from "../theme";
import { useSimulation } from "../worker/SimulationProvider";
import { useMoney } from "../format/useMoney";

/** Mirrors the simulation's numeric-safety bound for an annual fiscal budget. */
const MAX_ANNUAL_FUNDING_RUSD = 1e15;

/**
 * The worker rejects education funding only for non-finite/negative values or the
 * numeric-safety bound, while the preview also rejects a daily request above current
 * treasury cash. This ceiling keeps the slider inside the cash-limited range (and
 * always includes the current policy value so it remains representable).
 */
function annualFundingCeiling(
  currentAnnualRUSD: number,
  treasuryCashRUSD: number,
): number {
  const affordable = Number.isFinite(treasuryCashRUSD)
    ? Math.max(0, treasuryCashRUSD) * 365
    : 0;
  return Math.min(
    MAX_ANNUAL_FUNDING_RUSD,
    Math.max(1_000, currentAnnualRUSD, affordable),
  );
}

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
  const money = useMoney();
  const { applyAction, busy, connection } = useSimulation();
  const country = countryById(snapshot, countryId);
  const [fundingText, setFundingText] = useState("");
  const [shareText, setShareText] = useState("");
  const [selectedTechnologyId, setSelectedTechnologyId] = useState<number | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (country === null) return;
    setFundingText(country.education.fundedAnnualRUSD.toFixed(0));
    setShareText(country.education.researchStaffShare.toFixed(2));
    setSelectedTechnologyId(null);
  }, [
    countryId,
    country?.education.fundedAnnualRUSD,
    country?.education.researchStaffShare,
  ]);

  const isPlayerCountry =
    country !== null &&
    snapshot.playerCountryId !== null &&
    country.id === snapshot.playerCountryId;
  const parsedFunding = Number(fundingText);
  const parsedShare = Number(shareText);

  const applyFunding = (annualRUSD?: number): void => {
    if (country === null) return;
    if (!isPlayerCountry) {
      setLocalError("Only the player-controlled country may set education funding.");
      return;
    }
    if (!country.technology.enabled) return;
    const target = annualRUSD ?? parsedFunding;
    const preview = previewEducationFunding(snapshot, country, target);
    if (!preview.valid) {
      setLocalError(preview.errors.join(" "));
      return;
    }
    setLocalError(null);
    applyAction({
      kind: "set-education-funding",
      countryId: country.id,
      annualRUSD: target,
    });
  };

  const applyShare = (share?: number): void => {
    if (country === null) return;
    if (!isPlayerCountry) {
      setLocalError("Only the player-controlled country may set research staffing.");
      return;
    }
    if (!country.technology.enabled) return;
    const target = share ?? parsedShare;
    const preview = previewResearchStaffShare(snapshot, country, target);
    if (!preview.valid) {
      setLocalError(preview.errors.join(" "));
      return;
    }
    setLocalError(null);
    applyAction({
      kind: "set-research-staff-share",
      countryId: country.id,
      share: target,
    });
  };
  // Unconditional hooks: coalesce rapid slider commits so only one validated action
  // is in flight and the latest released value wins. They must run before the
  // early returns below so the hook order never changes.
  const fundingCommit = useDeferredCommit((value) => applyFunding(value), busy);
  const shareCommit = useDeferredCommit((value) => applyShare(value), busy);

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
  const canAct = isPlayerCountry && !busy && connection === "ready";
  const fundingPreview = previewEducationFunding(snapshot, country, parsedFunding);
  const sharePreview = previewResearchStaffShare(snapshot, country, parsedShare);
  const fundingLimit = annualFundingCeiling(
    country.education.fundedAnnualRUSD,
    country.treasuryCashRUSD,
  );
  const fundingStep = Math.max(1, Math.round(fundingLimit / 100));
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
      <Headline
        label="Researched"
        value={`${String(technology.researchedCount)} / ${String(catalog.length)}`}
        tone="accent"
        detail={activeEntry === null ? "No active project" : `Researching ${activeEntry.name}`}
      />
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
        <Disclosure title="Output factors by sector">
          {technology.productivityBySector.map((sector) => (
            <StatRow
              key={sector.sector}
              label={`${sector.sector} output factor`}
              value={`×${sector.factor.toFixed(3)}`}
            />
          ))}
        </Disclosure>
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
        <Disclosure title="Academics, schooling and funding">
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
          value={`${money.format(country.education.fundedAnnualRUSD)}/yr`}
          detail={`Requested ${money.format(country.education.fundingRequestedMonthToDateRUSD)} · shortfall ${money.format(country.education.fundingShortfallMonthToDateRUSD)}`}
        />
        </Disclosure>
        {country.education.educationBlockedReason === null ? null : (
          <Text style={styles.detail}>
            Schooling constrained: {country.education.educationBlockedReason}.
          </Text>
        )}
        <SliderField
          label="Education funding"
          value={
            Number.isFinite(parsedFunding)
              ? Math.max(0, Math.min(fundingLimit, parsedFunding))
              : 0
          }
          min={0}
          max={fundingLimit}
          step={fundingStep}
          precision={0}
          money={money}
          unit="/yr"
          disabled={!isPlayerCountry || connection !== "ready"}
          pending={fundingCommit.hasPending}
          onChange={(value) => setFundingText(value.toFixed(0))}
          onCommit={(value) => fundingCommit.submit(value)}
          hint="Daily request is cash-limited; the worker validates the action against live treasury cash."
        />
        <View style={styles.actionRow}>
          <ActionButton
            label="Set funding"
            tone="accent"
            onPress={() => applyFunding()}
            disabled={!canAct || !fundingPreview.valid}
          />
        </View>
        <Text style={styles.detail}>
          Daily request {money.format(fundingPreview.dailyRequestRUSD)}; treasury cash{" "}
          {money.format(country.treasuryCashRUSD)}. Funding also pays research staff.
        </Text>
        <SliderField
          label="Research staff share"
          value={
            Number.isFinite(parsedShare)
              ? Math.max(0, Math.min(1, parsedShare))
              : 0
          }
          min={0}
          max={1}
          step={0.01}
          precision={2}
          unit="share"
          ticks={[
            { value: 0, label: "0%" },
            { value: 0.5, label: "50%" },
            { value: 1, label: "100%" },
          ]}
          disabled={!isPlayerCountry || connection !== "ready"}
          pending={shareCommit.hasPending}
          onChange={(value) => setShareText(value.toFixed(2))}
          onCommit={(value) => shareCommit.submit(value)}
          hint="Research and teaching draw on the same academic staff pool."
        />
        <View style={styles.actionRow}>
          <ActionButton
            label="Set share"
            tone="accent"
            onPress={() => applyShare()}
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
          <Disclosure
            key={era}
            title={`Era ${String(era)}: ${snapshot.technologyEraNames[era - 1] ?? ""}`}
            initiallyOpen={activeEntry?.era === era}
          >
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
          </Disclosure>
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

const styles = themedSheet(() => ({
  empty: { color: colors.muted, fontFamily: fonts.sans, fontSize: 13 },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  rowText: { flex: 1 },
  label: { color: colors.text, fontSize: 13, fontFamily: fonts.sansSemiBold },
  detail: { color: colors.muted, fontFamily: fonts.sans, fontSize: 13, lineHeight: 16, marginTop: 2 },
  error: { color: colors.red, fontFamily: fonts.sans, fontSize: 13, lineHeight: 16, marginTop: spacing.xs },
  era: { marginTop: spacing.md, gap: spacing.xs },
  eraTitle: { color: colors.text, fontSize: 13, fontFamily: fonts.sansSemiBold },
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
  previewTitle: { color: colors.text, fontSize: 13, fontFamily: fonts.sansSemiBold },
}));

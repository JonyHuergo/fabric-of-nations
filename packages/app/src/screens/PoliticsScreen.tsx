import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  countryById,
  previewInstitutionFunding,
  previewLawProposal,
  type SimulationSnapshot,
} from "@century/sim-worker";

import { SliderField, useDeferredCommit } from "../components/Slider";
import { ActionButton, Headline, Notice, Section, StatRow } from "../components/ui";
import { colors, fonts, spacing, themedSheet } from "../theme";
import { useSimulation } from "../worker/SimulationProvider";
import { provinceEconomyRows } from "@century/sim-worker";
import { provinceDisplayName } from "../provinceNames";
import { useMoney } from "../format/useMoney";

/** Mirrors the simulation's numeric-safety bound for an annual fiscal budget. */
const MAX_ANNUAL_FUNDING_RUSD = 1e15;

/**
 * The worker rejects a funding target only for non-finite/negative values or the
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

const SLOT_LABELS: Record<string, string> = {
  suffrage: "Suffrage",
  taxation: "Taxation",
  education: "Education",
  health: "Health",
  labor: "Labor",
  militaryService: "Military service",
  trade: "Trade",
  colonialPolicy: "Colonial policy",
  currency: "Currency",
};

function dayLabel(dayIndex: number): string {
  // Presentation-only Gregorian label. Day 0 is 1900-01-01; the simulation owns
  // all authoritative date logic, and this helper never feeds it back.
  let remaining = dayIndex;
  let year = 1900;
  const leap = (value: number): boolean =>
    value % 4 === 0 && (value % 100 !== 0 || value % 400 === 0);
  const months = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  while (true) {
    const length = leap(year) ? 366 : 365;
    if (remaining < length) break;
    remaining -= length;
    year += 1;
  }
  let month = 1;
  while (true) {
    const length = month === 2 && leap(year) ? 29 : (months[month - 1] ?? 30);
    if (remaining < length) break;
    remaining -= length;
    month += 1;
  }
  return `${String(year)}-${String(month).padStart(2, "0")}-${String(remaining + 1).padStart(2, "0")}`;
}

export function PoliticsScreen({
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
  const [localError, setLocalError] = useState<string | null>(null);
  const [selectedLawId, setSelectedLawId] = useState<number | null>(null);

  useEffect(() => {
    if (country === null) return;
    setFundingText(country.politics.institution.fundedAnnualRUSD.toFixed(0));
    setSelectedLawId(null);
  }, [countryId, country?.politics.institution.fundedAnnualRUSD]);

  const isPlayerCountry =
    country !== null &&
    snapshot.playerCountryId !== null &&
    country.id === snapshot.playerCountryId;
  const parsedFunding = Number(fundingText);

  const applyFunding = (annualRUSD?: number): void => {
    if (country === null) return;
    if (!isPlayerCountry) {
      setLocalError("Only the player-controlled country may set administration funding.");
      return;
    }
    if (!country.politics.enabled) return;
    const target = annualRUSD ?? parsedFunding;
    const preview = previewInstitutionFunding(snapshot, country, target);
    if (!preview.valid) {
      setLocalError(preview.errors.join(" "));
      return;
    }
    setLocalError(null);
    applyAction({
      kind: "set-institution-funding",
      countryId: country.id,
      annualRUSD: target,
    });
  };
  // Unconditional hook: coalesces rapid slider commits so only one validated action
  // is in flight and the latest released value wins.
  const fundingCommit = useDeferredCommit((value) => applyFunding(value), busy);

  if (country === null) {
    return (
      <Section title="Politics">
        <Text style={styles.empty}>Select a country on the map.</Text>
      </Section>
    );
  }
  const politics = country.politics;
  if (!politics.enabled) {
    return (
      <Section title="Politics">
        <Notice title="M8 politics unavailable" tone="warning">
          This world has no M8 political-institutions definitions. Laws, elections,
          interest groups, unrest, and institutions are inert.
        </Notice>
      </Section>
    );
  }
  const canAct = isPlayerCountry && !busy && connection === "ready";
  const fundingPreview = previewInstitutionFunding(snapshot, country, parsedFunding);
  const fundingLimit = annualFundingCeiling(
    politics.institution.fundedAnnualRUSD,
    country.treasuryCashRUSD,
  );
  const fundingStep = Math.max(1, Math.round(fundingLimit / 100));
  const selectedLaw =
    selectedLawId === null
      ? null
      : (politics.lawOptions.find((option) => option.lawId === selectedLawId) ?? null);
  const lawPreview =
    selectedLawId === null ? null : previewLawProposal(snapshot, country, selectedLawId);

  const propose = (): void => {
    if (!isPlayerCountry) {
      setLocalError("Only the player-controlled country may propose laws.");
      return;
    }
    if (lawPreview === null || !lawPreview.valid || selectedLawId === null) {
      setLocalError(lawPreview?.errors.join(" ") ?? "Select a law option first.");
      return;
    }
    setLocalError(null);
    applyAction({ kind: "propose-law", countryId: country.id, lawId: selectedLawId });
  };

  return (
    <View>
      <Headline label="Regime" value={politics.regimeName} detail={`Governing group: ${politics.governmentGroupName}`} />
      <Section
        title="Politics"
        subtitle={`${country.name} · ${isPlayerCountry ? "Player country" : "AI-controlled"} · laws, elections, interest groups, unrest, and administration are simulated state, not a policy score.`}
      >
        <StatRow label="Regime" value={politics.regimeName} detail={`Governing group: ${politics.governmentGroupName}`} />
        <StatRow
          label="Elections"
          value={
            politics.nextElectionDay === null
              ? "No elected assembly"
              : `Next ${dayLabel(politics.nextElectionDay)}`
          }
          detail={
            politics.lastElection === null
              ? "No election has run. An election requires an elected regime, a positive franchise, and sufficient institution quality."
              : `Last ${dayLabel(politics.lastElection.day)}: government vote ${(politics.lastElection.governmentVoteShare * 100).toFixed(1)}%, turnout ${(politics.lastElection.turnoutShare * 100).toFixed(1)}%, governing group ${politics.lastElection.winnerGroupKey}.`
          }
        />
        <StatRow
          label="Franchise"
          value={`${(politics.franchiseShare * 100).toFixed(1)}%`}
          detail={`${politics.eligiblePopulation.toLocaleString()} enfranchised people · government support index ${(politics.supportForGovernment * 100).toFixed(1)}%`}
        />
        <StatRow
          label="Crisis stage"
          value={politics.crisis.stage}
          detail={`Pressure ${(politics.crisis.pressure * 100).toFixed(1)}% · ${String(politics.crisis.pressureDays)} pressure days · since ${dayLabel(politics.crisis.sinceDay)}`}
        />
      </Section>

      <Section folded
        title="Interest groups"
        subtitle="Membership is derived from professions; influence is normalised and cannot be spent. Stance is the average position on the enacted-law programme."
      >
        {politics.interestGroups.map((group) => (
          <View key={group.key} style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.label}>{group.name}</Text>
              <Text style={styles.detail}>
                {group.membershipPopulation.toLocaleString()} members · organisation{" "}
                {(group.organization * 100).toFixed(1)}% · influence{" "}
                {(group.influence * 100).toFixed(1)}%
              </Text>
            </View>
            <Text style={styles.stance}>{(group.governmentStance * 100).toFixed(1)}%</Text>
          </View>
        ))}
      </Section>

      <Section folded
        title="State administration"
        subtitle="Quality is derived from clerk staffing, funding, literacy, provincial infrastructure, law load, and recent disruption. Overload reduces tax collection and construction speed."
      >
        <StatRow
          label="Quality / overload"
          value={`${(politics.institution.quality * 100).toFixed(1)}% / ${(politics.institution.overload * 100).toFixed(1)}%`}
          detail={`Service output index ${(politics.institution.serviceOutputIndex * 100).toFixed(1)}% · ${politics.institution.staffedPopulation.toLocaleString()} clerks staff the administration`}
        />
        <StatRow
          label="Tax collection efficiency"
          value={`${(politics.taxCollectionEfficiency * 100).toFixed(1)}%`}
          detail={`Construction progress factor ${(politics.constructionProgressFactor * 100).toFixed(1)}%. Uncollected tax is not a receivable.`}
        />
        <StatRow
          label="Funding (this month)"
          value={`${money.format(politics.institution.fundedAnnualRUSD)}/yr`}
          detail={`Requested ${money.format(politics.institution.fundingRequestedMonthToDateRUSD)} · shortfall ${money.format(politics.institution.fundingShortfallMonthToDateRUSD)}`}
        />
        <SliderField
          label="Administration funding"
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
        <View style={styles.row}>
          <ActionButton
            label="Set funding"
            tone="accent"
            onPress={() => applyFunding()}
            disabled={!canAct || !fundingPreview.valid}
          />
        </View>
        <Text style={styles.detail}>
          Daily request {money.format(fundingPreview.dailyRequestRUSD)}; treasury cash{" "}
          {money.format(country.treasuryCashRUSD)}.
        </Text>
        {fundingPreview.errors.map((error) => (
          <Text key={error} style={styles.error}>
            {error}
          </Text>
        ))}
      </Section>

      <Section folded
        title="Laws"
        subtitle="A proposal needs support, a legal path, and time. Enactment is not instant; effects apply from the effective day and never rewrite a closed report."
      >
        {politics.lawSlots.map((slot) => (
          <View key={slot.slot} style={styles.slot}>
            <Text style={styles.slotTitle}>
              {SLOT_LABELS[slot.slot] ?? slot.slot}: {slot.enactedLawName}
            </Text>
            {slot.options.length === 0 ? (
              <Text style={styles.deferred}>
                No law options are defined for this slot in the current scenario.
              </Text>
            ) : (
              slot.options.map((option) => (
                <View key={option.lawId} style={styles.option}>
                  <View style={styles.rowText}>
                    <Text style={styles.label}>{option.name}</Text>
                    <Text style={styles.detail}>
                      support {(option.support * 100).toFixed(1)}% ·{" "}
                      {option.eligible ? "regime eligible" : "regime ineligible"} ·{" "}
                      {option.prerequisitesMet ? "prerequisites met" : "prerequisites missing"} ·{" "}
                      {option.alreadyEnacted ? "enacted" : `base ${String(option.enactmentDays)} days`}
                    </Text>
                  </View>
                  <ActionButton
                    label={option.isBaseLaw ? "Repeal/return" : "Propose"}
                    onPress={() => setSelectedLawId(option.lawId)}
                    disabled={!canAct || option.alreadyEnacted}
                  />
                </View>
              ))
            )}
          </View>
        ))}
        {selectedLaw === null || lawPreview === null ? null : (
          <View style={styles.preview}>
            <Text style={styles.previewTitle}>
              {selectedLaw.name}: {lawPreview.valid ? "ready" : "blocked"}
            </Text>
            <Text style={styles.detail}>
              Support {(lawPreview.support * 100).toFixed(1)}% · estimated effective after{" "}
              {String(lawPreview.effectiveEnactmentDays)} days at current institution quality.
            </Text>
            {lawPreview.errors.map((error) => (
              <Text key={error} style={styles.error}>
                {error}
              </Text>
            ))}
            <ActionButton
              label="Confirm proposal"
              tone="accent"
              onPress={propose}
              disabled={!canAct || !lawPreview.valid}
            />
          </View>
        )}
        {politics.lawTransitions.length === 0 ? null : (
          <View style={styles.preview}>
            <Text style={styles.previewTitle}>In progress</Text>
            {politics.lawTransitions.map((transition) => (
              <Text key={transition.id} style={styles.detail}>
                {SLOT_LABELS[transition.slot] ?? transition.slot}: {transition.fromLawName} →{" "}
                {transition.toLawName} · effective {dayLabel(transition.effectiveDay)} · support at
                proposal {(transition.support * 100).toFixed(1)}%
              </Text>
            ))}
          </View>
        )}
        {localError === null ? null : <Text style={styles.error}>{localError}</Text>}
      </Section>

      <Section folded
        title="Provincial unrest"
        subtitle="Unrest is a provincial aggregate fed by pop-level militancy, unmet needs, unemployment, exclusion, administration overload, and labor-law grievance. It updates daily after needs."
      >
        {politics.interestGroups.length === 0 ? null : (
          <Text style={styles.detail}>
            National political pressure{" "}
            {(politics.crisis.pressure * 100).toFixed(1)}% · stage {politics.crisis.stage} ·{" "}
            {String(politics.crisis.pressureDays)} days at or above threshold.
          </Text>
        )}
        {provinceEconomyRows(snapshot)
          .filter((province) => country.provinceIds.includes(province.id))
          .map((province) => (
            <StatRow
              key={province.id}
              label={provinceDisplayName(province.id)}
              value={`${(province.unrest * 100).toFixed(1)}% unrest`}
              detail={`Infrastructure ${(province.infrastructure * 100).toFixed(1)}% · population ${province.population.toLocaleString()}`}
            />
          ))}
      </Section>

      <Section folded
        title="Recent political record"
        subtitle="Bounded event log with provenance. It is presentation evidence, not a second authority."
      >
        {politics.recentLog.length === 0 ? (
          <Text style={styles.empty}>No recorded political event yet.</Text>
        ) : (
          politics.recentLog.map((entry) => (
            <Text key={entry.id} style={styles.log}>
              {dayLabel(entry.day)} · {entry.kind} · {entry.summary} [{entry.provenance}]
            </Text>
          ))
        )}
      </Section>
    </View>
  );
}

const styles = themedSheet(() => ({
  empty: { color: colors.muted, fontFamily: fonts.sans, fontSize: 13 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xs },
  rowText: { flex: 1 },
  label: { color: colors.text, fontSize: 13, fontFamily: fonts.sansSemiBold },
  detail: { color: colors.muted, fontFamily: fonts.sans, fontSize: 13, lineHeight: 16, marginTop: 2 },
  stance: { color: colors.accent, fontFamily: fonts.sans, fontSize: 13, fontVariant: ["tabular-nums"] },
  error: { color: colors.red, fontFamily: fonts.sans, fontSize: 13, lineHeight: 16, marginTop: spacing.xs },
  slot: { marginTop: spacing.md, gap: spacing.xs },
  slotTitle: { color: colors.text, fontSize: 13, fontFamily: fonts.sansSemiBold },
  option: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 2 },
  deferred: { color: colors.faint, fontFamily: fonts.sans, fontSize: 13, fontStyle: "italic" },
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
  log: { color: colors.muted, fontFamily: fonts.sans, fontSize: 13, lineHeight: 16, marginTop: 2 },
}));

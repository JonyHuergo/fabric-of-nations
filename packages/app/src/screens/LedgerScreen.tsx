import { StyleSheet, Text, View } from "react-native";

import {
  buildMonthlyReports,
  countryById,
  describePlayerAction,
  fiscalResultLabel,
  formatSUSD,
  latestAnnualReport,
  recentAnnualReports,
  recentPlayerActions,
  type SimulationSnapshot,
} from "@century/sim-worker";

import { MiniBars, Notice, Section } from "../components/ui";
import { colors, spacing } from "../theme";
import { useSimulation } from "../worker/SimulationProvider";

const FLOW_LABELS: Readonly<Record<string, string>> = {
  "goods-purchase": "Household goods",
  "input-purchase": "Production inputs",
  wages: "Wages",
  upkeep: "Upkeep",
};

export function LedgerScreen({
  snapshot,
  countryId,
}: {
  readonly snapshot: SimulationSnapshot;
  readonly countryId: number | null;
}) {
  const { actionHistory } = useSimulation();
  const country = countryById(snapshot, countryId);
  if (country === null) {
    return (
      <Section title="Ledger">
        <Text style={styles.empty}>Select a country on the map.</Text>
      </Section>
    );
  }
  const reports = buildMonthlyReports(country);
  const latest = reports[0] ?? null;
  const latestAnnual = latestAnnualReport(country);
  const annualReports = recentAnnualReports(country, 5);
  const netValues = country.financeHistory.map((period) => period.netFiscalResultSUSD);
  const actions = recentPlayerActions(actionHistory, 12);
  const actionsInLatestPeriod =
    latest === null
      ? []
      : actionHistory.filter(
          (action) =>
            action.countryId === country.id &&
            action.dayIndex >= latest.periodStartDay &&
            action.dayIndex <= latest.periodEndDay,
        );
  return (
    <View>
      <Section
        title="Ledger / financial summary"
        subtitle={`${country.name} · immutable monthly summaries. Closed periods are never rewritten.`}
      >
        {latest === null ? (
          <Text style={styles.empty}>
            No monthly close has run yet. Advance time to the end of the first civil month.
          </Text>
        ) : (
          <>
            <Text style={styles.result}>{fiscalResultLabel(latest.netFiscalResultSUSD)}</Text>
            <Text style={styles.resultDetail}>
              {formatSUSD(latest.netFiscalResultSUSD)} · {latest.periodStartLabel} to{" "}
              {latest.periodEndLabel}
            </Text>
            {netValues.length > 1 ? <MiniBars values={netValues} /> : null}
          </>
        )}
      </Section>

      <Section
        title="Monthly economic report"
        subtitle="Closed-period flows and end-of-close balances. A closing balance is not a period flow."
      >
        {latest === null ? (
          <Text style={styles.empty}>No closed period yet.</Text>
        ) : (
          <>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Income tax</Text>
              <Text style={styles.reportValue}>{formatSUSD(latest.incomeTaxSUSD)}</Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Business-profit tax</Text>
              <Text style={styles.reportValue}>{formatSUSD(latest.businessTaxRevenueSUSD)}</Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Welfare paid (of requested)</Text>
              <Text style={styles.reportValue}>
                {formatSUSD(latest.welfareExpenseSUSD)} /{" "}
                {formatSUSD(latest.welfareRequestedSUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Welfare shortfall (unpaid budget)</Text>
              <Text style={styles.reportValue}>{formatSUSD(latest.welfareShortfallSUSD)}</Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Business tax assessed / uncollected</Text>
              <Text style={styles.reportValue}>
                {formatSUSD(latest.businessTaxAssessedSUSD)} /{" "}
                {formatSUSD(latest.businessTaxUncollectedSUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Interest expense / cash paid</Text>
              <Text style={styles.reportValue}>
                {formatSUSD(latest.interestExpenseSUSD)} / {formatSUSD(latest.interestPaidSUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Borrowed / principal repaid</Text>
              <Text style={styles.reportValue}>
                {formatSUSD(latest.debtIssuedSUSD)} / {formatSUSD(latest.principalRepaidSUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Unfinanced requirement</Text>
              <Text style={styles.reportValue}>
                {formatSUSD(latest.unfinancedRequirementSUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Construction outlay (capital, not expense)</Text>
              <Text style={styles.reportValue}>
                {formatSUSD(latest.constructionSpentSUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Construction written off</Text>
              <Text style={styles.reportValue}>
                {formatSUSD(latest.constructionWrittenOffSUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Construction materials (capital)</Text>
              <Text style={styles.reportValue}>
                {formatSUSD(latest.constructionMaterialsSpentSUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Production subsidies (expense)</Text>
              <Text style={styles.reportValue}>{formatSUSD(latest.subsidyExpenseSUSD)}</Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Subsidy requested / shortfall</Text>
              <Text style={styles.reportValue}>
                {formatSUSD(latest.subsidyRequestedSUSD)} /{" "}
                {formatSUSD(latest.subsidyShortfallSUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Public-enterprise capital support</Text>
              <Text style={styles.reportValue}>
                {formatSUSD(latest.publicEnterpriseSupportSUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Administration payroll (expense)</Text>
              <Text style={styles.reportValue}>
                {formatSUSD(latest.administrationExpenseSUSD ?? 0)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Administration requested / shortfall</Text>
              <Text style={styles.reportValue}>
                {formatSUSD(latest.administrationRequestedSUSD ?? 0)} /{" "}
                {formatSUSD(latest.administrationShortfallSUSD ?? 0)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Net fiscal result</Text>
              <Text
                style={[
                  styles.reportValue,
                  latest.netFiscalResultSUSD >= 0 ? styles.positive : styles.negative,
                ]}
              >
                {formatSUSD(latest.netFiscalResultSUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Treasury at close</Text>
              <Text style={styles.reportValue}>
                {latest.treasuryCash === null
                  ? "Not retained"
                  : formatSUSD(latest.treasuryCash.endSUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Treasury change</Text>
              <Text style={styles.reportValue}>
                {latest.treasuryCash?.changeSUSD === null ||
                latest.treasuryCash?.changeSUSD === undefined
                  ? "Not derivable"
                  : formatSUSD(latest.treasuryCash.changeSUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Debt principal at close</Text>
              <Text style={styles.reportValue}>
                {latest.debtOutstanding === null
                  ? "Not retained"
                  : `${formatSUSD(latest.debtOutstanding.endSUSD)}${
                      latest.debtOutstanding.changeSUSD === null
                        ? ""
                        : ` (${formatSUSD(latest.debtOutstanding.changeSUSD)})`
                    }`}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Household cash at close</Text>
              <Text style={styles.reportValue}>
                {latest.householdCash === null
                  ? "Not retained"
                  : formatSUSD(latest.householdCash.endSUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Confirmed player actions in period</Text>
              <Text style={styles.reportValue}>
                {String(actionsInLatestPeriod.length)}
                {actionsInLatestPeriod.length === 0 ? " (none)" : ""}
              </Text>
            </View>
            <Notice title="What this report does not contain">
              Market prices, production, shortages, and employment are not retained as a
              monthly series in the current snapshot. Their current values are shown on the
              Overview, Markets, and Population screens and are not presented here as monthly
              changes. Older compacted months retain fiscal flows but not account-level
              balances.
            </Notice>
          </>
        )}
      </Section>

      <Section
        title="Annual accounting"
        subtitle="Closed calendar-year summaries. Annual flows are sums of that year's monthly closes; year-end balances are separate."
      >
        {latestAnnual === null ? (
          <Text style={styles.empty}>
            No year-end has closed yet. The first annual report appears after 31 December.
          </Text>
        ) : (
          <>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Year</Text>
              <Text style={styles.reportValue}>
                {String(latestAnnual.year)} ·{" "}
                {latestAnnual.complete ? "complete calendar year" : "partial year"}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Period</Text>
              <Text style={styles.reportValue}>
                {latestAnnual.periodStartLabel} → {latestAnnual.periodEndLabel}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Income tax (annual flow)</Text>
              <Text style={styles.reportValue}>{formatSUSD(latestAnnual.incomeTaxSUSD)}</Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Business-profit tax (annual flow)</Text>
              <Text style={styles.reportValue}>
                {formatSUSD(latestAnnual.businessTaxRevenueSUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Welfare paid / requested (annual flows)</Text>
              <Text style={styles.reportValue}>
                {formatSUSD(latestAnnual.welfareExpenseSUSD)} /{" "}
                {formatSUSD(latestAnnual.welfareRequestedSUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Welfare shortfall (annual flow)</Text>
              <Text style={styles.reportValue}>
                {formatSUSD(latestAnnual.welfareShortfallSUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Interest expense (annual flow)</Text>
              <Text style={styles.reportValue}>{formatSUSD(latestAnnual.interestExpenseSUSD)}</Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Borrowed / principal repaid (annual financing)</Text>
              <Text style={styles.reportValue}>
                {formatSUSD(latestAnnual.debtIssuedSUSD)} /{" "}
                {formatSUSD(latestAnnual.principalRepaidSUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Interest cash paid (annual financing)</Text>
              <Text style={styles.reportValue}>{formatSUSD(latestAnnual.interestPaidSUSD)}</Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Unfinanced requirement (annual)</Text>
              <Text style={styles.reportValue}>
                {formatSUSD(latestAnnual.unfinancedRequirementSUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Construction outlay (annual capital flow)</Text>
              <Text style={styles.reportValue}>
                {formatSUSD(latestAnnual.constructionSpentSUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Construction written off (annual)</Text>
              <Text style={styles.reportValue}>
                {formatSUSD(latestAnnual.constructionWrittenOffSUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Construction materials (annual capital)</Text>
              <Text style={styles.reportValue}>
                {formatSUSD(latestAnnual.constructionMaterialsSpentSUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Production subsidies (annual expense)</Text>
              <Text style={styles.reportValue}>
                {formatSUSD(latestAnnual.subsidyExpenseSUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Subsidy requested / shortfall (annual)</Text>
              <Text style={styles.reportValue}>
                {formatSUSD(latestAnnual.subsidyRequestedSUSD)} /{" "}
                {formatSUSD(latestAnnual.subsidyShortfallSUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Public-enterprise capital support (annual)</Text>
              <Text style={styles.reportValue}>
                {formatSUSD(latestAnnual.publicEnterpriseSupportSUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Administration payroll (annual expense)</Text>
              <Text style={styles.reportValue}>
                {formatSUSD(latestAnnual.administrationExpenseSUSD ?? 0)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>
                Administration requested / shortfall (annual)
              </Text>
              <Text style={styles.reportValue}>
                {formatSUSD(latestAnnual.administrationRequestedSUSD ?? 0)} /{" "}
                {formatSUSD(latestAnnual.administrationShortfallSUSD ?? 0)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Net fiscal result (annual flow)</Text>
              <Text
                style={[
                  styles.reportValue,
                  latestAnnual.netFiscalResultSUSD >= 0 ? styles.positive : styles.negative,
                ]}
              >
                {formatSUSD(latestAnnual.netFiscalResultSUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Treasury at year-end (balance)</Text>
              <Text style={styles.reportValue}>
                {formatSUSD(latestAnnual.treasuryCashEndSUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Debt principal liability at year-end</Text>
              <Text style={styles.reportValue}>
                {formatSUSD(latestAnnual.debtLiabilityEndSUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Interest payable at year-end</Text>
              <Text style={styles.reportValue}>
                {formatSUSD(latestAnnual.interestPayableEndSUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>
                Controlled corrections posted in year (world-wide)
              </Text>
              <Text style={styles.reportValue}>{String(latestAnnual.correctionCount)}</Text>
            </View>
            <Notice title="Annual versus monthly">
              Annual flows are exact sums of the year's closed monthly summaries; they are not
              the current month repeated. Year-end balances are closing stocks, not activity.
              Partial years are labelled and never padded with zero months. Corrections are
              posted in the current open period and never rewrite a closed monthly or annual
              summary.
            </Notice>
            {annualReports.length > 1 ? (
              <View style={styles.annualList}>
                {annualReports.slice(1).map((report) => (
                  <View key={report.year} style={styles.annualRow}>
                    <Text style={styles.annualYear}>
                      {String(report.year)}
                      {report.complete ? "" : " partial"}
                    </Text>
                    <Text style={styles.annualNet}>
                      Net {formatSUSD(report.netFiscalResultSUSD)} · Treasury{" "}
                      {formatSUSD(report.treasuryCashEndSUSD)}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
          </>
        )}
      </Section>

      <Section
        title="Recent monthly closes"
        subtitle="Newest first. Detailed balances appear only for the retained detailed window."
      >
        {reports.length === 0 ? (
          <Text style={styles.empty}>No closed periods.</Text>
        ) : (
          reports.slice(0, 6).map((report) => (
            <View key={report.periodEndDay} style={styles.periodRow}>
              <Text style={styles.periodDate}>
                {report.periodStartLabel} → {report.periodEndLabel}
              </Text>
              <View style={styles.columns}>
                <Text style={styles.cell}>Tax {formatSUSD(report.incomeTaxSUSD)}</Text>
                <Text style={styles.cell}>Welfare {formatSUSD(report.welfareExpenseSUSD)}</Text>
                <Text style={styles.cell}>Interest {formatSUSD(report.interestExpenseSUSD)}</Text>
                <Text style={styles.cell}>
                  Treasury{" "}
                  {report.treasuryCash === null
                    ? "n/a"
                    : formatSUSD(report.treasuryCash.endSUSD)}
                </Text>
              </View>
              <Text
                style={[
                  styles.net,
                  report.netFiscalResultSUSD >= 0 ? styles.positive : styles.negative,
                ]}
              >
                {formatSUSD(report.netFiscalResultSUSD)}
              </Text>
            </View>
          ))
        )}
      </Section>

      <Section
        title="Confirmed player actions"
        subtitle="Appended only from authoritative worker ACTION_RESULT replies. Session-only; cleared on load or worker restart."
      >
        {actions.length === 0 ? (
          <Text style={styles.empty}>No confirmed fiscal actions this session.</Text>
        ) : (
          actions.map((action) => (
            <View key={action.actionId} style={styles.actionRow}>
              <View style={styles.actionHeader}>
                <Text style={styles.actionDate}>
                  {action.dateLabel} · {action.countryTag ?? `country ${String(action.countryId)}`}
                </Text>
                <Text
                  style={[styles.actionStatus, action.accepted ? styles.positive : styles.negative]}
                >
                  {action.accepted ? "APPLIED" : "REJECTED"}
                </Text>
              </View>
              <Text style={styles.actionDetail}>
                Requested: {describePlayerAction(action.requested)}
              </Text>
              {action.applied === null ? null : (
                <Text style={styles.actionDetail}>
                  Confirmed applied: {describePlayerAction(action.applied)}
                </Text>
              )}
              {action.errors.length === 0 ? null : (
                <Text style={styles.actionError}>{action.errors.join("; ")}</Text>
              )}
            </View>
          ))
        )}
      </Section>

      <Section
        title="World gross flows"
        subtitle="The four M4b flow kinds; reported for the world, not allocated per country."
      >
        {latest === null ? (
          <Text style={styles.empty}>No closed period.</Text>
        ) : (
          Object.entries(latest.grossFlowTotals).map(([kind, value]) => (
            <View key={kind} style={styles.flowRow}>
              <Text style={styles.flowLabel}>{FLOW_LABELS[kind] ?? kind}</Text>
              <Text style={styles.flowValue}>{formatSUSD(value)}</Text>
            </View>
          ))
        )}
      </Section>

      <Section title="Debug diagnostics" subtitle="Bounded authoritative counters from the world.">
        <View style={styles.flowRow}>
          <Text style={styles.flowLabel}>Rejected player/AI actions</Text>
          <Text style={styles.flowValue}>{String(snapshot.diagnostics.invalidActionCount)}</Text>
        </View>
        <View style={styles.flowRow}>
          <Text style={styles.flowLabel}>Invariant failures</Text>
          <Text style={styles.flowValue}>{String(snapshot.diagnostics.invariantFailureCount)}</Text>
        </View>
        {snapshot.diagnostics.recentWarnings.map((warning, index) => (
          <Text key={`${String(index)}:${warning}`} style={styles.warning}>
            {warning}
          </Text>
        ))}
      </Section>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { color: colors.muted, fontSize: 13, paddingVertical: spacing.sm },
  result: { color: colors.text, fontSize: 22, fontWeight: "700" },
  resultDetail: { color: colors.muted, fontSize: 12, marginTop: spacing.xs },
  reportRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 5,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  reportLabel: { color: colors.muted, fontSize: 12, flexShrink: 1, paddingRight: spacing.sm },
  reportValue: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
    textAlign: "right",
  },
  periodRow: {
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.sm,
  },
  periodDate: { color: colors.text, fontSize: 12, fontWeight: "600" },
  columns: { flexDirection: "row", flexWrap: "wrap", marginTop: 3, columnGap: spacing.sm },
  cell: { color: colors.muted, fontSize: 10 },
  net: { fontSize: 12, fontWeight: "700", marginTop: 3, fontVariant: ["tabular-nums"] },
  positive: { color: colors.green },
  negative: { color: colors.red },
  actionRow: {
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.sm,
  },
  actionHeader: { flexDirection: "row", justifyContent: "space-between" },
  actionDate: { color: colors.text, fontSize: 11, fontWeight: "600" },
  actionStatus: { fontSize: 9, fontWeight: "800", letterSpacing: 0.6 },
  actionDetail: { color: colors.muted, fontSize: 10, marginTop: 2, lineHeight: 14 },
  actionError: { color: colors.red, fontSize: 10, marginTop: 2, lineHeight: 14 },
  flowRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 5,
  },
  flowLabel: { color: colors.muted, fontSize: 12 },
  flowValue: {
    color: colors.text,
    fontSize: 12,
    fontVariant: ["tabular-nums"],
    fontWeight: "600",
  },
  warning: { color: colors.faint, fontSize: 10, marginTop: 4 },
  annualList: { marginTop: spacing.sm },
  annualRow: {
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 5,
  },
  annualYear: { color: colors.text, fontSize: 11, fontWeight: "600" },
  annualNet: { color: colors.muted, fontSize: 10, marginTop: 2, fontVariant: ["tabular-nums"] },
});

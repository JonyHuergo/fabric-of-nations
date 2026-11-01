import { StyleSheet, Text, View } from "react-native";

import {
  buildMonthlyReports,
  countryById,
  describePlayerAction,
  fiscalResultLabel,
  formatRUSD,
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
  const netValues = country.financeHistory.map((period) => period.netFiscalResultRUSD);
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
            <Text style={styles.result}>{fiscalResultLabel(latest.netFiscalResultRUSD)}</Text>
            <Text style={styles.resultDetail}>
              {formatRUSD(latest.netFiscalResultRUSD)} · {latest.periodStartLabel} to{" "}
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
              <Text style={styles.reportValue}>{formatRUSD(latest.incomeTaxRUSD)}</Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Business-profit tax</Text>
              <Text style={styles.reportValue}>{formatRUSD(latest.businessTaxRevenueRUSD)}</Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Welfare paid (of requested)</Text>
              <Text style={styles.reportValue}>
                {formatRUSD(latest.welfareExpenseRUSD)} /{" "}
                {formatRUSD(latest.welfareRequestedRUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Welfare shortfall (unpaid budget)</Text>
              <Text style={styles.reportValue}>{formatRUSD(latest.welfareShortfallRUSD)}</Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Business tax assessed / uncollected</Text>
              <Text style={styles.reportValue}>
                {formatRUSD(latest.businessTaxAssessedRUSD)} /{" "}
                {formatRUSD(latest.businessTaxUncollectedRUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Interest expense / cash paid</Text>
              <Text style={styles.reportValue}>
                {formatRUSD(latest.interestExpenseRUSD)} / {formatRUSD(latest.interestPaidRUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Borrowed / principal repaid</Text>
              <Text style={styles.reportValue}>
                {formatRUSD(latest.debtIssuedRUSD)} / {formatRUSD(latest.principalRepaidRUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Unfinanced requirement</Text>
              <Text style={styles.reportValue}>
                {formatRUSD(latest.unfinancedRequirementRUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Construction outlay (capital, not expense)</Text>
              <Text style={styles.reportValue}>
                {formatRUSD(latest.constructionSpentRUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Construction written off</Text>
              <Text style={styles.reportValue}>
                {formatRUSD(latest.constructionWrittenOffRUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Construction materials (capital)</Text>
              <Text style={styles.reportValue}>
                {formatRUSD(latest.constructionMaterialsSpentRUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Production subsidies (expense)</Text>
              <Text style={styles.reportValue}>{formatRUSD(latest.subsidyExpenseRUSD)}</Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Subsidy requested / shortfall</Text>
              <Text style={styles.reportValue}>
                {formatRUSD(latest.subsidyRequestedRUSD)} /{" "}
                {formatRUSD(latest.subsidyShortfallRUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Public-enterprise capital support</Text>
              <Text style={styles.reportValue}>
                {formatRUSD(latest.publicEnterpriseSupportRUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Administration payroll (expense)</Text>
              <Text style={styles.reportValue}>
                {formatRUSD(latest.administrationExpenseRUSD ?? 0)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Administration requested / shortfall</Text>
              <Text style={styles.reportValue}>
                {formatRUSD(latest.administrationRequestedRUSD ?? 0)} /{" "}
                {formatRUSD(latest.administrationShortfallRUSD ?? 0)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Customs duty revenue</Text>
              <Text style={styles.reportValue}>
                {formatRUSD(latest.customsDutyRevenueRUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Education and research payroll (expense)</Text>
              <Text style={styles.reportValue}>
                {formatRUSD(latest.educationExpenseRUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Training payroll and stipend (expense)</Text>
              <Text style={styles.reportValue}>
                {formatRUSD(latest.trainingExpenseRUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Military pay and procurement (expense)</Text>
              <Text style={styles.reportValue}>
                {formatRUSD(latest.militaryExpenseRUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Net fiscal result</Text>
              <Text
                style={[
                  styles.reportValue,
                  latest.netFiscalResultRUSD >= 0 ? styles.positive : styles.negative,
                ]}
              >
                {formatRUSD(latest.netFiscalResultRUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Treasury at close</Text>
              <Text style={styles.reportValue}>
                {latest.treasuryCash === null
                  ? "Not retained"
                  : formatRUSD(latest.treasuryCash.endRUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Treasury change</Text>
              <Text style={styles.reportValue}>
                {latest.treasuryCash?.changeRUSD === null ||
                latest.treasuryCash?.changeRUSD === undefined
                  ? "Not derivable"
                  : formatRUSD(latest.treasuryCash.changeRUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Debt principal at close</Text>
              <Text style={styles.reportValue}>
                {latest.debtOutstanding === null
                  ? "Not retained"
                  : `${formatRUSD(latest.debtOutstanding.endRUSD)}${
                      latest.debtOutstanding.changeRUSD === null
                        ? ""
                        : ` (${formatRUSD(latest.debtOutstanding.changeRUSD)})`
                    }`}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Household cash at close</Text>
              <Text style={styles.reportValue}>
                {latest.householdCash === null
                  ? "Not retained"
                  : formatRUSD(latest.householdCash.endRUSD)}
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
              <Text style={styles.reportValue}>{formatRUSD(latestAnnual.incomeTaxRUSD)}</Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Business-profit tax (annual flow)</Text>
              <Text style={styles.reportValue}>
                {formatRUSD(latestAnnual.businessTaxRevenueRUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Welfare paid / requested (annual flows)</Text>
              <Text style={styles.reportValue}>
                {formatRUSD(latestAnnual.welfareExpenseRUSD)} /{" "}
                {formatRUSD(latestAnnual.welfareRequestedRUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Welfare shortfall (annual flow)</Text>
              <Text style={styles.reportValue}>
                {formatRUSD(latestAnnual.welfareShortfallRUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Interest expense (annual flow)</Text>
              <Text style={styles.reportValue}>{formatRUSD(latestAnnual.interestExpenseRUSD)}</Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Borrowed / principal repaid (annual financing)</Text>
              <Text style={styles.reportValue}>
                {formatRUSD(latestAnnual.debtIssuedRUSD)} /{" "}
                {formatRUSD(latestAnnual.principalRepaidRUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Interest cash paid (annual financing)</Text>
              <Text style={styles.reportValue}>{formatRUSD(latestAnnual.interestPaidRUSD)}</Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Unfinanced requirement (annual)</Text>
              <Text style={styles.reportValue}>
                {formatRUSD(latestAnnual.unfinancedRequirementRUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Construction outlay (annual capital flow)</Text>
              <Text style={styles.reportValue}>
                {formatRUSD(latestAnnual.constructionSpentRUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Construction written off (annual)</Text>
              <Text style={styles.reportValue}>
                {formatRUSD(latestAnnual.constructionWrittenOffRUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Construction materials (annual capital)</Text>
              <Text style={styles.reportValue}>
                {formatRUSD(latestAnnual.constructionMaterialsSpentRUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Production subsidies (annual expense)</Text>
              <Text style={styles.reportValue}>
                {formatRUSD(latestAnnual.subsidyExpenseRUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Subsidy requested / shortfall (annual)</Text>
              <Text style={styles.reportValue}>
                {formatRUSD(latestAnnual.subsidyRequestedRUSD)} /{" "}
                {formatRUSD(latestAnnual.subsidyShortfallRUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Public-enterprise capital support (annual)</Text>
              <Text style={styles.reportValue}>
                {formatRUSD(latestAnnual.publicEnterpriseSupportRUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Administration payroll (annual expense)</Text>
              <Text style={styles.reportValue}>
                {formatRUSD(latestAnnual.administrationExpenseRUSD ?? 0)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>
                Administration requested / shortfall (annual)
              </Text>
              <Text style={styles.reportValue}>
                {formatRUSD(latestAnnual.administrationRequestedRUSD ?? 0)} /{" "}
                {formatRUSD(latestAnnual.administrationShortfallRUSD ?? 0)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Customs duty revenue (annual flow)</Text>
              <Text style={styles.reportValue}>
                {formatRUSD(latestAnnual.customsDutyRevenueRUSD ?? 0)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Education and research payroll (annual expense)</Text>
              <Text style={styles.reportValue}>
                {formatRUSD(latestAnnual.educationExpenseRUSD ?? 0)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Training payroll and stipend (annual expense)</Text>
              <Text style={styles.reportValue}>
                {formatRUSD(latestAnnual.trainingExpenseRUSD ?? 0)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Military pay and procurement (annual expense)</Text>
              <Text style={styles.reportValue}>
                {formatRUSD(latestAnnual.militaryExpenseRUSD ?? 0)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Net fiscal result (annual flow)</Text>
              <Text
                style={[
                  styles.reportValue,
                  latestAnnual.netFiscalResultRUSD >= 0 ? styles.positive : styles.negative,
                ]}
              >
                {formatRUSD(latestAnnual.netFiscalResultRUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Treasury at year-end (balance)</Text>
              <Text style={styles.reportValue}>
                {formatRUSD(latestAnnual.treasuryCashEndRUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Debt principal liability at year-end</Text>
              <Text style={styles.reportValue}>
                {formatRUSD(latestAnnual.debtLiabilityEndRUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Interest payable at year-end</Text>
              <Text style={styles.reportValue}>
                {formatRUSD(latestAnnual.interestPayableEndRUSD)}
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
                      Net {formatRUSD(report.netFiscalResultRUSD)} · Treasury{" "}
                      {formatRUSD(report.treasuryCashEndRUSD)}
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
                <Text style={styles.cell}>Tax {formatRUSD(report.incomeTaxRUSD)}</Text>
                <Text style={styles.cell}>Welfare {formatRUSD(report.welfareExpenseRUSD)}</Text>
                <Text style={styles.cell}>Interest {formatRUSD(report.interestExpenseRUSD)}</Text>
                <Text style={styles.cell}>
                  Treasury{" "}
                  {report.treasuryCash === null
                    ? "n/a"
                    : formatRUSD(report.treasuryCash.endRUSD)}
                </Text>
              </View>
              <Text
                style={[
                  styles.net,
                  report.netFiscalResultRUSD >= 0 ? styles.positive : styles.negative,
                ]}
              >
                {formatRUSD(report.netFiscalResultRUSD)}
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
              <Text style={styles.flowValue}>{formatRUSD(value)}</Text>
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

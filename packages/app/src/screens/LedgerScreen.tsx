import { StyleSheet, Text, View } from "react-native";

import {
  buildMonthlyReports,
  countryById,
  describePlayerAction,
  fiscalResultLabel,
  latestAnnualReport,
  recentAnnualReports,
  recentPlayerActions,
  type SimulationSnapshot,
} from "@century/sim-worker";

import { Headline, MiniBars, Notice, Section } from "../components/ui";
import { colors, fonts, spacing, themedSheet } from "../theme";
import { useSimulation } from "../worker/SimulationProvider";
import { useMoney } from "../format/useMoney";

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
  const money = useMoney();
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
  // P3: closed periods convert at their own closing valuation, years at their mean.
  const latestMoney = latest === null ? money : money.atPeriod(latest.periodEndDay);
  const annualMoney = latestAnnual === null ? money : money.atYear(latestAnnual.year);
  const lastPeriod = country.financeHistory[country.financeHistory.length - 1];
  const lastPeriodMoney = lastPeriod === undefined ? money : money.atPeriod(lastPeriod.periodEndDay);
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
      <Headline
        label="Last closed month"
        value={netValues.length === 0 ? "No month closed" : lastPeriodMoney.format(netValues[netValues.length - 1] ?? 0)}
        tone={(netValues[netValues.length - 1] ?? 0) >= 0 ? "default" : "negative"}
        trend={netValues}
        detail="Net fiscal result"
      />
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
              {latestMoney.format(latest.netFiscalResultRUSD)} · {latest.periodStartLabel} to{" "}
              {latest.periodEndLabel}
            </Text>
            {netValues.length > 1 ? <MiniBars values={netValues} /> : null}
          </>
        )}
      </Section>

      <Section folded
        title="Monthly economic report"
        subtitle="Closed-period flows and end-of-close balances. A closing balance is not a period flow."
      >
        {latest === null ? (
          <Text style={styles.empty}>No closed period yet.</Text>
        ) : (
          <>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Income tax</Text>
              <Text style={styles.reportValue}>{latestMoney.format(latest.incomeTaxRUSD)}</Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Business-profit tax</Text>
              <Text style={styles.reportValue}>{latestMoney.format(latest.businessTaxRevenueRUSD)}</Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Welfare paid (of requested)</Text>
              <Text style={styles.reportValue}>
                {latestMoney.format(latest.welfareExpenseRUSD)} /{" "}
                {latestMoney.format(latest.welfareRequestedRUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Welfare shortfall (unpaid budget)</Text>
              <Text style={styles.reportValue}>{latestMoney.format(latest.welfareShortfallRUSD)}</Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Business tax assessed / uncollected</Text>
              <Text style={styles.reportValue}>
                {latestMoney.format(latest.businessTaxAssessedRUSD)} /{" "}
                {latestMoney.format(latest.businessTaxUncollectedRUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Interest expense / cash paid</Text>
              <Text style={styles.reportValue}>
                {latestMoney.format(latest.interestExpenseRUSD)} / {latestMoney.format(latest.interestPaidRUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Borrowed / principal repaid</Text>
              <Text style={styles.reportValue}>
                {latestMoney.format(latest.debtIssuedRUSD)} / {latestMoney.format(latest.principalRepaidRUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Unfinanced requirement</Text>
              <Text style={styles.reportValue}>
                {latestMoney.format(latest.unfinancedRequirementRUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Construction outlay (capital, not expense)</Text>
              <Text style={styles.reportValue}>
                {latestMoney.format(latest.constructionSpentRUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Construction written off</Text>
              <Text style={styles.reportValue}>
                {latestMoney.format(latest.constructionWrittenOffRUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Construction materials (capital)</Text>
              <Text style={styles.reportValue}>
                {latestMoney.format(latest.constructionMaterialsSpentRUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Production subsidies (expense)</Text>
              <Text style={styles.reportValue}>{latestMoney.format(latest.subsidyExpenseRUSD)}</Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Subsidy requested / shortfall</Text>
              <Text style={styles.reportValue}>
                {latestMoney.format(latest.subsidyRequestedRUSD)} /{" "}
                {latestMoney.format(latest.subsidyShortfallRUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Public-enterprise capital support</Text>
              <Text style={styles.reportValue}>
                {latestMoney.format(latest.publicEnterpriseSupportRUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Administration payroll (expense)</Text>
              <Text style={styles.reportValue}>
                {latestMoney.format(latest.administrationExpenseRUSD ?? 0)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Administration requested / shortfall</Text>
              <Text style={styles.reportValue}>
                {latestMoney.format(latest.administrationRequestedRUSD ?? 0)} /{" "}
                {latestMoney.format(latest.administrationShortfallRUSD ?? 0)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Customs duty revenue</Text>
              <Text style={styles.reportValue}>
                {latestMoney.format(latest.customsDutyRevenueRUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Education and research payroll (expense)</Text>
              <Text style={styles.reportValue}>
                {latestMoney.format(latest.educationExpenseRUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Training payroll and stipend (expense)</Text>
              <Text style={styles.reportValue}>
                {latestMoney.format(latest.trainingExpenseRUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Military pay and procurement (expense)</Text>
              <Text style={styles.reportValue}>
                {latestMoney.format(latest.militaryExpenseRUSD)}
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
                {latestMoney.format(latest.netFiscalResultRUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Treasury at close</Text>
              <Text style={styles.reportValue}>
                {latest.treasuryCash === null
                  ? "Not retained"
                  : latestMoney.format(latest.treasuryCash.endRUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Treasury change</Text>
              <Text style={styles.reportValue}>
                {latest.treasuryCash?.changeRUSD === null ||
                latest.treasuryCash?.changeRUSD === undefined
                  ? "Not derivable"
                  : latestMoney.format(latest.treasuryCash.changeRUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Debt principal at close</Text>
              <Text style={styles.reportValue}>
                {latest.debtOutstanding === null
                  ? "Not retained"
                  : `${latestMoney.format(latest.debtOutstanding.endRUSD)}${
                      latest.debtOutstanding.changeRUSD === null
                        ? ""
                        : ` (${latestMoney.format(latest.debtOutstanding.changeRUSD)})`
                    }`}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Household cash at close</Text>
              <Text style={styles.reportValue}>
                {latest.householdCash === null
                  ? "Not retained"
                  : latestMoney.format(latest.householdCash.endRUSD)}
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

      <Section folded
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
              <Text style={styles.reportValue}>{annualMoney.format(latestAnnual.incomeTaxRUSD)}</Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Business-profit tax (annual flow)</Text>
              <Text style={styles.reportValue}>
                {annualMoney.format(latestAnnual.businessTaxRevenueRUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Welfare paid / requested (annual flows)</Text>
              <Text style={styles.reportValue}>
                {annualMoney.format(latestAnnual.welfareExpenseRUSD)} /{" "}
                {annualMoney.format(latestAnnual.welfareRequestedRUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Welfare shortfall (annual flow)</Text>
              <Text style={styles.reportValue}>
                {annualMoney.format(latestAnnual.welfareShortfallRUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Interest expense (annual flow)</Text>
              <Text style={styles.reportValue}>{annualMoney.format(latestAnnual.interestExpenseRUSD)}</Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Borrowed / principal repaid (annual financing)</Text>
              <Text style={styles.reportValue}>
                {annualMoney.format(latestAnnual.debtIssuedRUSD)} /{" "}
                {annualMoney.format(latestAnnual.principalRepaidRUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Interest cash paid (annual financing)</Text>
              <Text style={styles.reportValue}>{annualMoney.format(latestAnnual.interestPaidRUSD)}</Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Unfinanced requirement (annual)</Text>
              <Text style={styles.reportValue}>
                {annualMoney.format(latestAnnual.unfinancedRequirementRUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Construction outlay (annual capital flow)</Text>
              <Text style={styles.reportValue}>
                {annualMoney.format(latestAnnual.constructionSpentRUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Construction written off (annual)</Text>
              <Text style={styles.reportValue}>
                {annualMoney.format(latestAnnual.constructionWrittenOffRUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Construction materials (annual capital)</Text>
              <Text style={styles.reportValue}>
                {annualMoney.format(latestAnnual.constructionMaterialsSpentRUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Production subsidies (annual expense)</Text>
              <Text style={styles.reportValue}>
                {annualMoney.format(latestAnnual.subsidyExpenseRUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Subsidy requested / shortfall (annual)</Text>
              <Text style={styles.reportValue}>
                {annualMoney.format(latestAnnual.subsidyRequestedRUSD)} /{" "}
                {annualMoney.format(latestAnnual.subsidyShortfallRUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Public-enterprise capital support (annual)</Text>
              <Text style={styles.reportValue}>
                {annualMoney.format(latestAnnual.publicEnterpriseSupportRUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Administration payroll (annual expense)</Text>
              <Text style={styles.reportValue}>
                {annualMoney.format(latestAnnual.administrationExpenseRUSD ?? 0)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>
                Administration requested / shortfall (annual)
              </Text>
              <Text style={styles.reportValue}>
                {annualMoney.format(latestAnnual.administrationRequestedRUSD ?? 0)} /{" "}
                {annualMoney.format(latestAnnual.administrationShortfallRUSD ?? 0)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Customs duty revenue (annual flow)</Text>
              <Text style={styles.reportValue}>
                {annualMoney.format(latestAnnual.customsDutyRevenueRUSD ?? 0)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Education and research payroll (annual expense)</Text>
              <Text style={styles.reportValue}>
                {annualMoney.format(latestAnnual.educationExpenseRUSD ?? 0)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Training payroll and stipend (annual expense)</Text>
              <Text style={styles.reportValue}>
                {annualMoney.format(latestAnnual.trainingExpenseRUSD ?? 0)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Military pay and procurement (annual expense)</Text>
              <Text style={styles.reportValue}>
                {annualMoney.format(latestAnnual.militaryExpenseRUSD ?? 0)}
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
                {annualMoney.format(latestAnnual.netFiscalResultRUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Treasury at year-end (balance)</Text>
              <Text style={styles.reportValue}>
                {annualMoney.format(latestAnnual.treasuryCashEndRUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Debt principal liability at year-end</Text>
              <Text style={styles.reportValue}>
                {annualMoney.format(latestAnnual.debtLiabilityEndRUSD)}
              </Text>
            </View>
            <View style={styles.reportRow}>
              <Text style={styles.reportLabel}>Interest payable at year-end</Text>
              <Text style={styles.reportValue}>
                {annualMoney.format(latestAnnual.interestPayableEndRUSD)}
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
                      Net {money.atYear(report.year).format(report.netFiscalResultRUSD)} · Treasury{" "}
                      {money.atYear(report.year).format(report.treasuryCashEndRUSD)}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
          </>
        )}
      </Section>

      <Section folded
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
                <Text style={styles.cell}>Tax {money.atPeriod(report.periodEndDay).format(report.incomeTaxRUSD)}</Text>
                <Text style={styles.cell}>Welfare {money.atPeriod(report.periodEndDay).format(report.welfareExpenseRUSD)}</Text>
                <Text style={styles.cell}>Interest {money.atPeriod(report.periodEndDay).format(report.interestExpenseRUSD)}</Text>
                <Text style={styles.cell}>
                  Treasury{" "}
                  {report.treasuryCash === null
                    ? "n/a"
                    : money.atPeriod(report.periodEndDay).format(report.treasuryCash.endRUSD)}
                </Text>
              </View>
              <Text
                style={[
                  styles.net,
                  report.netFiscalResultRUSD >= 0 ? styles.positive : styles.negative,
                ]}
              >
                {money.atPeriod(report.periodEndDay).format(report.netFiscalResultRUSD)}
              </Text>
            </View>
          ))
        )}
      </Section>

      <Section folded
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
                Requested: {describePlayerAction(action.requested, money)}
              </Text>
              {action.applied === null ? null : (
                <Text style={styles.actionDetail}>
                  Confirmed applied: {describePlayerAction(action.applied, money)}
                </Text>
              )}
              {action.errors.length === 0 ? null : (
                <Text style={styles.actionError}>{action.errors.join("; ")}</Text>
              )}
            </View>
          ))
        )}
      </Section>

      <Section folded
        title="World gross flows"
        subtitle="The four M4b flow kinds; reported for the world, not allocated per country."
      >
        {latest === null ? (
          <Text style={styles.empty}>No closed period.</Text>
        ) : (
          Object.entries(latest.grossFlowTotals).map(([kind, value]) => (
            <View key={kind} style={styles.flowRow}>
              <Text style={styles.flowLabel}>{FLOW_LABELS[kind] ?? kind}</Text>
              <Text style={styles.flowValue}>{latestMoney.format(value)}</Text>
            </View>
          ))
        )}
      </Section>

      <Section folded title="Debug diagnostics" subtitle="Bounded authoritative counters from the world.">
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

const styles = themedSheet(() => ({
  empty: { color: colors.muted, fontFamily: fonts.sans, fontSize: 13, paddingVertical: spacing.sm },
  result: { color: colors.text, fontSize: 22, fontFamily: fonts.sansSemiBold },
  resultDetail: { color: colors.muted, fontFamily: fonts.sans, fontSize: 13, marginTop: spacing.xs },
  reportRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 5,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  reportLabel: { color: colors.muted, fontFamily: fonts.sans, fontSize: 13, flexShrink: 1, paddingRight: spacing.sm },
  reportValue: {
    color: colors.text,
    fontSize: 13,
    fontFamily: fonts.sansSemiBold,
    fontVariant: ["tabular-nums"],
    textAlign: "right",
  },
  periodRow: {
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.sm,
  },
  periodDate: { color: colors.text, fontSize: 13, fontFamily: fonts.sansSemiBold },
  columns: { flexDirection: "row", flexWrap: "wrap", marginTop: 3, columnGap: spacing.sm },
  cell: { color: colors.muted, fontFamily: fonts.sans, fontSize: 11 },
  net: { fontSize: 13, fontFamily: fonts.sansSemiBold, marginTop: 3, fontVariant: ["tabular-nums"] },
  positive: { color: colors.green },
  negative: { color: colors.red },
  actionRow: {
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.sm,
  },
  actionHeader: { flexDirection: "row", justifyContent: "space-between" },
  actionDate: { color: colors.text, fontSize: 13, fontFamily: fonts.sansSemiBold },
  actionStatus: { fontSize: 11, fontFamily: fonts.sansSemiBold, letterSpacing: 0.6 },
  actionDetail: { color: colors.muted, fontFamily: fonts.sans, fontSize: 11, marginTop: 2, lineHeight: 14 },
  actionError: { color: colors.red, fontFamily: fonts.sans, fontSize: 11, marginTop: 2, lineHeight: 14 },
  flowRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 5,
  },
  flowLabel: { color: colors.muted, fontFamily: fonts.sans, fontSize: 13 },
  flowValue: {
    color: colors.text,
    fontSize: 13,
    fontVariant: ["tabular-nums"],
    fontFamily: fonts.sansSemiBold,
  },
  warning: { color: colors.faint, fontFamily: fonts.sans, fontSize: 11, marginTop: 4 },
  annualList: { marginTop: spacing.sm },
  annualRow: {
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 5,
  },
  annualYear: { color: colors.text, fontSize: 13, fontFamily: fonts.sansSemiBold },
  annualNet: { color: colors.muted, fontFamily: fonts.sans, fontSize: 11, marginTop: 2, fontVariant: ["tabular-nums"] },
}));

import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  countryById,
  fiscalResultLabel,
  formatRate,
  formatSUSD,
  latestFinancePeriod,
  latestMonthlyReport,
  previewDebtIssuance,
  previewDebtPolicy,
  previewDebtRepayment,
  previewFiscalPolicy,
  type SimulationSnapshot,
} from "@century/sim-worker";

import { ActionButton, Chip, MiniBars, Section, StatRow } from "../components/ui";
import { SliderField, useDeferredCommit } from "../components/Slider";
import { colors, radii, spacing } from "../theme";
import { useSimulation } from "../worker/SimulationProvider";

function parseNumber(text: string): number {
  const value = Number.parseFloat(text);
  return Number.isFinite(value) ? value : Number.NaN;
}

export function BudgetScreen({
  snapshot,
  countryId,
}: {
  readonly snapshot: SimulationSnapshot;
  readonly countryId: number | null;
}) {
  const { applyAction, running, busy, connection } = useSimulation();
  const country = countryById(snapshot, countryId);
  const [taxText, setTaxText] = useState("0");
  const [allowanceText, setAllowanceText] = useState("0");
  const [welfareText, setWelfareText] = useState("0");
  const [wealthText, setWealthText] = useState("99");
  const [businessText, setBusinessText] = useState("0");
  const [reserveText, setReserveText] = useState("0");
  const [ceilingText, setCeilingText] = useState("0");
  const [borrowText, setBorrowText] = useState("");
  const [repayTexts, setRepayTexts] = useState<Record<number, string>>({});
  const [refinanceOn, setRefinanceOn] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const isPlayerCountry =
    country !== null &&
    snapshot.playerCountryId !== null &&
    country.id === snapshot.playerCountryId;
  const fiscal = country?.fiscal;
  const debtPolicy = country?.debtPolicy;

  useEffect(() => {
    if (fiscal === undefined || debtPolicy === undefined) return;
    setTaxText((fiscal.incomeTaxRate * 100).toFixed(2));
    setAllowanceText(fiscal.incomeTaxAllowanceSUSDPerYear.toFixed(0));
    setWelfareText(fiscal.welfareBudgetSUSDPerYear.toFixed(0));
    setWealthText(String(fiscal.welfareMaxWealthLevel));
    setBusinessText((fiscal.businessProfitTaxRate * 100).toFixed(2));
    setReserveText(fiscal.reserveTargetSUSD.toFixed(0));
    setCeilingText(debtPolicy.maxOutstandingPrincipalSUSD.toFixed(0));
    setRefinanceOn(debtPolicy.refinanceOnMaturity);
    setRepayTexts({});
    setBorrowText("");
  }, [
    countryId,
    fiscal?.incomeTaxRate,
    fiscal?.incomeTaxAllowanceSUSDPerYear,
    fiscal?.welfareBudgetSUSDPerYear,
    fiscal?.welfareMaxWealthLevel,
    fiscal?.businessProfitTaxRate,
    fiscal?.reserveTargetSUSD,
    debtPolicy?.maxOutstandingPrincipalSUSD,
    debtPolicy?.refinanceOnMaturity,
  ]);

  if (country === null || fiscal === undefined || debtPolicy === undefined) {
    return (
      <Section title="Budget">
        <Text style={styles.empty}>Select a country on the map.</Text>
      </Section>
    );
  }

  const canAct = isPlayerCountry && !busy && connection === "ready";

  const latest = latestFinancePeriod(country);
  const latestMonthly = latestMonthlyReport(country);
  const historyValues = country.financeHistory.map((period) => period.netFiscalResultSUSD);

  const proposedTax = parseNumber(taxText) / 100;
  const proposedAllowance = parseNumber(allowanceText);
  const proposedWelfare = parseNumber(welfareText);
  const proposedWealth = Math.round(parseNumber(wealthText));
  const proposedBusiness = parseNumber(businessText) / 100;
  const proposedReserve = parseNumber(reserveText);
  const preview = previewFiscalPolicy(
    snapshot,
    country,
    proposedTax,
    proposedWelfare,
    {
      incomeTaxAllowanceSUSDPerYear: proposedAllowance,
      welfareMaxWealthLevel: proposedWealth,
      businessProfitTaxRate: proposedBusiness,
      reserveTargetSUSD: proposedReserve,
    },
  );

  const applyFiscal = (overrides?: {
    tax?: number;
    allowance?: number;
    welfare?: number;
    wealth?: number;
    business?: number;
    reserve?: number;
  }) => {
    const tax = overrides?.tax ?? proposedTax;
    const allowance = overrides?.allowance ?? proposedAllowance;
    const welfare = overrides?.welfare ?? proposedWelfare;
    const wealth = overrides?.wealth ?? proposedWealth;
    const business = overrides?.business ?? proposedBusiness;
    const reserve = overrides?.reserve ?? proposedReserve;
    if (!isPlayerCountry) {
      setLocalError("This is an AI-controlled country. Policy can only be changed for the player country.");
      return;
    }
    if (!Number.isFinite(tax) || tax < 0 || tax > 1) {
      setLocalError("Income tax must be between 0% and 100%.");
      return;
    }
    if (!Number.isFinite(allowance) || allowance < 0) {
      setLocalError("The income-tax exemption must be a non-negative annual SUSD amount.");
      return;
    }
    if (!Number.isFinite(welfare) || welfare < 0) {
      setLocalError("Welfare budget must be a non-negative annual SUSD amount.");
      return;
    }
    if (!Number.isInteger(wealth) || wealth < 0 || wealth > 99) {
      setLocalError("The welfare eligibility ceiling must be a whole wealth level from 0 to 99.");
      return;
    }
    if (!Number.isFinite(business) || business < 0 || business > 1) {
      setLocalError("The business-profit tax must be between 0% and 100%.");
      return;
    }
    if (!Number.isFinite(reserve) || reserve < 0) {
      setLocalError("The reserve target must be a non-negative SUSD amount.");
      return;
    }
    setLocalError(null);
    applyAction({
      kind: "set-fiscal-policy",
      countryId: country.id,
      incomeTaxRate: tax,
      incomeTaxAllowanceSUSDPerYear: allowance,
      welfareBudgetSUSDPerYear: welfare,
      welfareMaxWealthLevel: wealth,
      businessProfitTaxRate: business,
      reserveTargetSUSD: reserve,
    });
  };
  const taxCommit = useDeferredCommit((value) => applyFiscal({ tax: value / 100 }), busy);
  const allowanceCommit = useDeferredCommit((value) => applyFiscal({ allowance: value }), busy);
  const businessCommit = useDeferredCommit((value) => applyFiscal({ business: value / 100 }), busy);
  const welfareCommit = useDeferredCommit((value) => applyFiscal({ welfare: value }), busy);
  const wealthCommit = useDeferredCommit((value) => applyFiscal({ wealth: Math.round(value) }), busy);
  const reserveCommit = useDeferredCommit((value) => applyFiscal({ reserve: value }), busy);

  const proposedCeiling = parseNumber(ceilingText);
  const debtPolicyPreview = previewDebtPolicy(
    snapshot,
    country,
    refinanceOn,
    proposedCeiling,
  );
  const applyDebtPolicy = (overrides?: { ceiling?: number; refinance?: boolean }) => {
    if (!isPlayerCountry) {
      setLocalError("Only the player country may change debt policy.");
      return;
    }
    if (!debtPolicyPreview.valid) {
      setLocalError(debtPolicyPreview.errors.join(" "));
      return;
    }
    setLocalError(null);
    applyAction({
      kind: "set-debt-policy",
      countryId: country.id,
      refinanceOnMaturity: overrides?.refinance ?? refinanceOn,
      maxOutstandingPrincipalSUSD: overrides?.ceiling ?? proposedCeiling,
    });
  };

  const borrowAmount = parseNumber(borrowText);
  const borrowPreview = previewDebtIssuance(snapshot, country, borrowAmount);
  const applyBorrow = (overrides?: number) => {
    if (!isPlayerCountry) {
      setLocalError("Only the player country may borrow.");
      return;
    }
    const amount = overrides ?? borrowAmount;
    const preview = previewDebtIssuance(snapshot, country, amount);
    if (!preview.valid) {
      setLocalError(preview.errors.join(" "));
      return;
    }
    setLocalError(null);
    applyAction({ kind: "issue-debt", countryId: country.id, amountSUSD: amount });
  };

  const mtd = country.budgetMonthToDate;

  return (
    <View>
      <Section
        title="Budget"
        subtitle={`${country.name} · ${isPlayerCountry ? "Player country" : "AI-controlled"} · every change is a validated action. There are no silent overrides.`}
      >
        <StatRow
          label="Treasury cash (stock)"
          value={formatSUSD(country.treasuryCashSUSD)}
          detail={`Reserve target ${formatSUSD(fiscal.reserveTargetSUSD)} · cash above target ${formatSUSD(Math.max(0, country.treasuryCashSUSD - fiscal.reserveTargetSUSD))}`}
        />
        <StatRow
          label="Latest closed result"
          value={latest === null ? "Awaiting first close" : fiscalResultLabel(latest.netFiscalResultSUSD)}
          detail={
            latest === null
              ? "No closed period yet"
              : `${formatSUSD(latest.netFiscalResultSUSD)} · all recorded revenue − all recorded expense`
          }
        />
        <StatRow
          label="Debt principal (stock)"
          value={formatSUSD(country.debtOutstandingPrincipalSUSD)}
          detail={
            debtPolicy.enabled
              ? `Ceiling ${formatSUSD(debtPolicy.maxOutstandingPrincipalSUSD)} · creditor ${debtPolicy.creditorLabel} · coupon ${formatRate(debtPolicy.annualCouponRate)}`
              : "No enabled debt policy for this country"
          }
        />
        <StatRow
          label="This month so far (flows)"
          value={`Tax ${formatSUSD(latestMonthly?.incomeTaxSUSD ?? 0)} · Welfare requested ${formatSUSD(mtd.welfareRequestedSUSD)}`}
          detail={`Welfare shortfall ${formatSUSD(mtd.welfareShortfallSUSD)} · business tax assessed ${formatSUSD(mtd.businessTaxAssessedSUSD)} · borrowed ${formatSUSD(mtd.debtIssuedSUSD)} · principal repaid ${formatSUSD(mtd.principalRepaidSUSD)} · interest paid ${formatSUSD(mtd.interestPaidSUSD)}`}
        />
      </Section>

      <Section
        title="Taxation"
        subtitle="Every instrument below uses a modeled base. Rates and amounts are provisional policy, not enacted law."
      >
        <SliderField
          label="Personal income tax rate"
          value={Number.isFinite(proposedTax) ? proposedTax * 100 : 0}
          min={0}
          max={60}
          step={0.5}
          precision={2}
          unit="%"
          disabled={!canAct}
          pending={taxCommit.hasPending}
          ticks={[{ value: 0, label: "0%" }, { value: 15, label: "15%" }, { value: 30, label: "30%" }]}
          onChange={(value) => setTaxText(value.toFixed(2))}
          onCommit={(value) => taxCommit.submit(value)}
          hint="Applies to the estimated current wage base. Released values are sent as a validated fiscal action."
        />
        <SliderField
          label="Income-tax exemption"
          value={Number.isFinite(proposedAllowance) ? proposedAllowance : 0}
          min={0}
          max={Math.max(
            1000,
            Math.round(country.treasuryCashSUSD),
            Math.round(preview.estimatedDailyTaxableWageBaseSUSD * 365),
          )}
          step={100}
          precision={0}
          unit="SUSD/yr"
          disabled={!canAct}
          pending={allowanceCommit.hasPending}
          onChange={(value) => setAllowanceText(value.toFixed(0))}
          onCommit={(value) => allowanceCommit.submit(value)}
          hint="Subtracted from each household's annual wage receipt before the rate applies."
        />
        <SliderField
          label="Business-profit tax rate"
          value={Number.isFinite(proposedBusiness) ? proposedBusiness * 100 : 0}
          min={0}
          max={50}
          step={0.5}
          precision={2}
          unit="%"
          disabled={!canAct}
          pending={businessCommit.hasPending}
          ticks={[{ value: 0, label: "0%" }, { value: 10, label: "10%" }, { value: 25, label: "25%" }]}
          onChange={(value) => setBusinessText(value.toFixed(2))}
          onCommit={(value) => businessCommit.submit(value)}
          hint="Assessed at each month-end on positive recognized building profit. Losses are not refunded."
        />
        <StatRow
          label="Current-base income-tax base"
          value={formatSUSD(preview.estimatedDailyTaxableWageBaseSUSD)}
          detail="Estimated exact current base at the current exemption; not realized wages."
        />
        <StatRow
          label="Month-to-date enterprise profit base"
          value={formatSUSD(mtd.businessTaxBaseMonthToDateSUSD)}
          detail="Sum of positive building results so far this month, before assessment."
        />
      </Section>

      <Section
        title="Spending and reserve"
        subtitle="Welfare is paid daily from treasury cash subject to the reserve floor and wealth eligibility ceiling. Other implemented spending categories are set by their own policy screens and reported in Budget execution."
      >
        <SliderField
          label="Welfare budget"
          value={Number.isFinite(proposedWelfare) ? proposedWelfare : 0}
          min={0}
          max={Math.max(10_000_000, Math.round(country.treasuryCashSUSD * 0.5))}
          step={100_000}
          precision={0}
          unit="SUSD/yr"
          disabled={!canAct}
          pending={welfareCommit.hasPending}
          onChange={(value) => setWelfareText(value.toFixed(0))}
          onCommit={(value) => welfareCommit.submit(value)}
          hint="Paid daily from treasury cash above the reserve target, subject to the eligibility ceiling."
        />
        <SliderField
          label="Welfare eligibility ceiling"
          value={Number.isFinite(proposedWealth) ? proposedWealth : 99}
          min={0}
          max={99}
          step={1}
          precision={0}
          unit="wealth level"
          disabled={!canAct}
          pending={wealthCommit.hasPending}
          ticks={[{ value: 10, label: "10" }, { value: 50, label: "50" }, { value: 99, label: "99" }]}
          onChange={(value) => setWealthText(String(Math.round(value)))}
          onCommit={(value) => wealthCommit.submit(value)}
          hint="Only blocks at or below this wealth level receive the daily transfer."
        />
        <SliderField
          label="Treasury reserve target"
          value={Number.isFinite(proposedReserve) ? proposedReserve : 0}
          min={0}
          max={Math.max(1000, Math.round(country.treasuryCashSUSD))}
          step={1000}
          precision={0}
          unit="SUSD"
          disabled={!canAct}
          pending={reserveCommit.hasPending}
          onChange={(value) => setReserveText(value.toFixed(0))}
          onCommit={(value) => reserveCommit.submit(value)}
          hint="A liquidity floor, not a spendable pool. It never causes borrowing."
        />
      </Section>

      <Section
        title="Before you commit the budget"
        subtitle="Static current-base estimates. They hold today's wage base, employment, prices, and month-to-date profit constant and are not forecasts."
      >
        <StatRow
          label="Income tax rate now → proposed"
          value={`${formatRate(preview.currentIncomeTaxRate)} → ${formatRate(preview.proposedIncomeTaxRate)}`}
          detail={`Estimated tax ${formatSUSD(preview.currentDailyIncomeTaxSUSD)} → ${formatSUSD(preview.proposedDailyIncomeTaxSUSD)} per day.`}
        />
        <StatRow
          label="Taxable base now → proposed"
          value={`${formatSUSD(preview.estimatedDailyTaxableWageBaseSUSD)} → ${formatSUSD(preview.proposedDailyTaxableWageBaseSUSD)}`}
          detail={preview.taxableBaseIsEstimate ? "Proposed base is an upper-bound estimate assuming every wage-earning block exceeds the exemption." : "Exact current-base calculation under the current exemption."}
        />
        <StatRow
          label="Monthly income-tax effect"
          value={formatSUSD(preview.monthlyIncomeTaxDeltaSUSD)}
          detail="Static change for the current civil month's day count, before behaviour changes."
        />
        <StatRow
          label="Welfare now → proposed"
          value={`${formatSUSD(preview.currentWelfareBudgetSUSDPerYear)}/yr → ${formatSUSD(preview.proposedWelfareBudgetSUSDPerYear)}/yr`}
          detail={`Daily request ${formatSUSD(preview.currentDailyWelfareSUSD)} → ${formatSUSD(preview.proposedDailyWelfareSUSD)}; cash ceiling above reserve ${formatSUSD(preview.currentWelfareCashCeilingSUSD)} → ${formatSUSD(preview.proposedWelfareCashCeilingSUSD)}.`}
        />
        <StatRow
          label="Monthly welfare effect"
          value={formatSUSD(preview.monthlyWelfareDeltaSUSD)}
          detail={`Eligibility ceiling ${String(preview.currentWelfareMaxWealthLevel)} → ${String(preview.proposedWelfareMaxWealthLevel)}; the per-capita eligibility effect is not retained per threshold and is not predicted.`}
        />
        <StatRow
          label="Business tax at current month base"
          value={`${formatSUSD(preview.currentBusinessTaxAtCurrentBaseSUSD)} → ${formatSUSD(preview.proposedBusinessTaxAtCurrentBaseSUSD)}`}
          detail={`Rate ${formatRate(preview.currentBusinessProfitTaxRate)} → ${formatRate(preview.proposedBusinessProfitTaxRate)} on ${formatSUSD(preview.businessTaxBaseMonthToDateSUSD)} month-to-date profit; collection is limited by each building's cash.`}
        />
        <StatRow
          label="Reserve target now → proposed"
          value={`${formatSUSD(preview.currentReserveTargetSUSD)} → ${formatSUSD(preview.proposedReserveTargetSUSD)}`}
          detail="Changes the welfare cash ceiling and the repayment floor; it is not a spending authorization."
        />
        <StatRow
          label="Estimated net monthly fiscal change"
          value={formatSUSD(preview.estimatedMonthlyFiscalDeltaSUSD)}
          detail="Income-tax change minus welfare change; excludes business tax, interest, borrowing, principal, and economic response."
        />
        {preview.constraints.map((constraint) => (
          <Text key={constraint} style={styles.previewNote}>
            • {constraint}
          </Text>
        ))}
        {localError === null ? null : <Text style={styles.error}>{localError}</Text>}
        <View style={styles.applyRow}>
          <ActionButton
            label={isPlayerCountry ? "Apply fiscal policy" : "AI-controlled country"}
            tone="accent"
            onPress={applyFiscal}
            disabled={!canAct}
          />
        </View>
      </Section>

      <Section
        title="Financing: borrowing, repayment, refinancing"
        subtitle="Borrowing and principal repayment are financing movements. They are not revenue or expenditure and do not change the fiscal result."
      >
        <StatRow
          label="Creditor"
          value={debtPolicy.enabled ? debtPolicy.creditorLabel : "No creditor (debt disabled)"}
          detail={`Kind ${debtPolicy.creditorKind} · creditor cash ${formatSUSD(debtPolicy.creditorCashSUSD)} · headroom ${formatSUSD(debtPolicy.headroomSUSD)} · term ${String(debtPolicy.termDays)} days`}
        />
        <StatRow
          label="Interest payable (stock)"
          value={formatSUSD(country.debtInterestPayableSUSD)}
          detail={`Annual coupon ${formatRate(debtPolicy.annualCouponRate)}; interest accrues daily and pays at month-end.`}
        />

        <SliderField
          label="Borrow principal"
          value={Number.isFinite(borrowAmount) ? borrowAmount : 0}
          min={0}
          max={Math.max(1000, Math.round(debtPolicy.headroomSUSD))}
          step={1000}
          precision={0}
          unit="SUSD"
          disabled={!canAct || !debtPolicy.enabled}
          onChange={(value) => setBorrowText(value.toFixed(0))}
          onCommit={(value) => applyBorrow(value)}
          hint="Financing, not revenue: treasury cash and debt principal change together."
        />
        {borrowPreview.valid ? (
          <Text style={styles.hint}>
            Treasury {formatSUSD(country.treasuryCashSUSD)} → {formatSUSD(borrowPreview.treasuryAfterSUSD)};
            debt {formatSUSD(country.debtOutstandingPrincipalSUSD)} → {formatSUSD(borrowPreview.outstandingAfterSUSD)};
            interest {formatSUSD(borrowPreview.annualInterestSUSD)}/yr.
          </Text>
        ) : (
          borrowPreview.errors.map((error) => (
            <Text key={error} style={styles.previewNote}>
              • {error}
            </Text>
          ))
        )}
        <View style={styles.applyRow}>
          <ActionButton
            label="Issue debt"
            onPress={applyBorrow}
            disabled={!canAct || !borrowPreview.valid}
          />
        </View>

        {country.debtContracts.length === 0 ? (
          <Text style={styles.empty}>No outstanding contracts to repay.</Text>
        ) : (
          country.debtContracts.map((contract) => {
            const amount = parseNumber(repayTexts[contract.id] ?? "");
            const repayment = previewDebtRepayment(snapshot, country, contract.id, amount);
            return (
              <View key={contract.id} style={styles.contractRow}>
                <Text style={styles.contractTitle}>
                  Contract {String(contract.id)} · {contract.holderLabel} · {contract.status}
                </Text>
                <Text style={styles.contractDetail}>
                  Principal {formatSUSD(contract.principalSUSD)} · outstanding{" "}
                  {formatSUSD(contract.outstandingPrincipalSUSD)} · accrued interest{" "}
                  {formatSUSD(contract.accruedInterestSUSD)} · matures day{" "}
                  {String(contract.maturityDay)}
                </Text>
                <SliderField
                  label="Repay principal"
                  value={Number.isFinite(amount) ? Math.max(0, amount) : 0}
                  min={0}
                  max={Math.max(1, Math.round(contract.outstandingPrincipalSUSD))}
                  step={100}
                  precision={0}
                  unit="SUSD"
                  disabled={!canAct}
                  onChange={(value) =>
                    setRepayTexts((current) => ({ ...current, [contract.id]: value.toFixed(0) }))
                  }
                  onCommit={(value) => {
                    setRepayTexts((current) => ({ ...current, [contract.id]: value.toFixed(0) }));
                    const preview = previewDebtRepayment(snapshot, country, contract.id, value);
                    if (preview === null || !preview.valid) {
                      setLocalError(preview?.errors.join(" ") ?? "Enter a valid repayment.");
                      return;
                    }
                    setLocalError(null);
                    applyAction({
                      kind: "repay-debt",
                      countryId: country.id,
                      contractId: contract.id,
                      amountSUSD: value,
                    });
                  }}
                  hint="Principal repayment is a financing movement, not an expense."
                />
                {repayment === null ? null : repayment.valid ? (
                  <Text style={styles.hint}>
                    Outstanding {formatSUSD(repayment.outstandingBeforeSUSD)} →{" "}
                    {formatSUSD(repayment.outstandingAfterSUSD)} · treasury{" "}
                    {formatSUSD(country.treasuryCashSUSD)} → {formatSUSD(repayment.treasuryAfterSUSD)}{" "}
                    · reserve floor {formatSUSD(repayment.reserveTargetSUSD)}
                  </Text>
                ) : (
                  repayment.errors.map((error) => (
                    <Text key={error} style={styles.previewNote}>
                      • {error}
                    </Text>
                  ))
                )}
                <View style={styles.applyRow}>
                  <ActionButton
                    label="Repay principal"
                    onPress={() => {
                      if (repayment === null || !repayment.valid) {
                        setLocalError(repayment?.errors.join(" ") ?? "Enter a valid repayment.");
                        return;
                      }
                      setLocalError(null);
                      applyAction({
                        kind: "repay-debt",
                        countryId: country.id,
                        contractId: contract.id,
                        amountSUSD: amount,
                      });
                    }}
                    disabled={!canAct || repayment === null || !repayment.valid}
                  />
                </View>
              </View>
            );
          })
        )}

        <SliderField
          label="Outstanding-principal ceiling"
          value={Number.isFinite(proposedCeiling) ? proposedCeiling : 0}
          min={0}
          max={Math.max(1_000_000, Math.round(debtPolicy.maxOutstandingPrincipalSUSD * 2))}
          step={100_000}
          precision={0}
          unit="SUSD"
          disabled={!canAct || !debtPolicy.enabled}
          onChange={(value) => setCeilingText(value.toFixed(0))}
          onCommit={(value) => applyDebtPolicy({ ceiling: value })}
          hint="A ceiling, not an authorisation. Issuance is also limited by the creditor's cash."
        />
        <View style={styles.quickRow}>
          <Chip
            label="Refinance on maturity"
            active={refinanceOn}
            onPress={() => setRefinanceOn((current) => !current)}
            disabled={!canAct || !debtPolicy.enabled}
          />
        </View>
        <View style={styles.applyRow}>
          <ActionButton
            label="Apply debt policy"
            onPress={applyDebtPolicy}
            disabled={!canAct || !debtPolicyPreview.valid}
          />
        </View>
        {!isPlayerCountry ? (
          <Text style={styles.note}>
            This country is AI-governed. Select the player country to change policy or financing.
          </Text>
        ) : null}
        {running ? (
          <Text style={styles.note}>
            Simulation is running. Actions are accepted between ticks; pause for a predictable day.
          </Text>
        ) : null}
      </Section>

      <Section
        title="Budget execution"
        subtitle="Latest closed month: requested, paid, and shortfall are separate from borrowing, principal, and interest."
      >
        {latestMonthly === null ? (
          <Text style={styles.empty}>No monthly close has run yet.</Text>
        ) : (
          <>
            <StatRow
              label="Personal income tax (revenue)"
              value={formatSUSD(latestMonthly.incomeTaxSUSD)}
              detail="Recognized revenue for the closed period."
            />
            <StatRow
              label="Business-profit tax (revenue)"
              value={formatSUSD(latestMonthly.businessTaxRevenueSUSD)}
              detail={`Assessed ${formatSUSD(latestMonthly.businessTaxAssessedSUSD)} · uncollected ${formatSUSD(latestMonthly.businessTaxUncollectedSUSD)}`}
            />
            <StatRow
              label="Customs duty (revenue)"
              value={formatSUSD(latestMonthly.customsDutyRevenueSUSD)}
              detail="Duty collected by this country's customs administration."
            />
            <StatRow
              label="Welfare"
              value={`${formatSUSD(latestMonthly.welfareExpenseSUSD)} paid`}
              detail={`Requested ${formatSUSD(latestMonthly.welfareRequestedSUSD)} · shortfall ${formatSUSD(latestMonthly.welfareShortfallSUSD)}`}
            />
            <StatRow
              label="Interest"
              value={`${formatSUSD(latestMonthly.interestExpenseSUSD)} expense`}
              detail={`Cash interest paid ${formatSUSD(latestMonthly.interestPaidSUSD)} (accrual and payment are distinct).`}
            />
            <StatRow
              label="Production subsidies"
              value={formatSUSD(latestMonthly.subsidyExpenseSUSD)}
              detail={`Requested ${formatSUSD(latestMonthly.subsidyRequestedSUSD)} · shortfall ${formatSUSD(latestMonthly.subsidyShortfallSUSD)}`}
            />
            <StatRow
              label="Administration payroll"
              value={formatSUSD(latestMonthly.administrationExpenseSUSD)}
              detail={`Requested ${formatSUSD(latestMonthly.administrationRequestedSUSD)} · shortfall ${formatSUSD(latestMonthly.administrationShortfallSUSD)}`}
            />
            <StatRow
              label="Education and research payroll"
              value={formatSUSD(latestMonthly.educationExpenseSUSD)}
            />
            <StatRow
              label="Training payroll and stipend"
              value={formatSUSD(latestMonthly.trainingExpenseSUSD)}
            />
            <StatRow
              label="Military pay and procurement"
              value={formatSUSD(latestMonthly.militaryExpenseSUSD)}
              detail="Daily army pay, equipment upkeep, garrison cost, and recruitment equipment purchases."
            />
            <StatRow
              label="Net fiscal result"
              value={formatSUSD(latestMonthly.netFiscalResultSUSD)}
              detail="Income tax + business tax + customs duty − welfare − interest − subsidies − administration − education − training − military; financing is excluded."
            />
            <StatRow
              label="Financing"
              value={`${formatSUSD(latestMonthly.debtIssuedSUSD)} borrowed · ${formatSUSD(latestMonthly.principalRepaidSUSD)} principal repaid`}
              detail={`Unfinanced requirement ${formatSUSD(latestMonthly.unfinancedRequirementSUSD)}; shortfall is explicit, never money-created.`}
            />
            <StatRow
              label="Balances at close"
              value={
                latestMonthly.treasuryCash === null
                  ? "Not retained (compacted month)"
                  : formatSUSD(latestMonthly.treasuryCash.endSUSD)
              }
              detail={
                latestMonthly.debtOutstanding === null
                  ? "Debt balance not retained for this month."
                  : `Debt principal ${formatSUSD(latestMonthly.debtOutstanding.endSUSD)}.`
              }
            />
          </>
        )}
      </Section>

      <Section title="Net fiscal history" subtitle="Last closed months; bars show surplus or deficit.">
        {historyValues.length === 0 ? (
          <Text style={styles.empty}>No monthly close has run yet.</Text>
        ) : (
          <>
            <MiniBars values={historyValues} />
            {country.financeHistory
              .slice()
              .reverse()
              .slice(0, 6)
              .map((period) => (
                <StatRow
                  key={period.periodEndDay}
                  label={`Period ending day ${String(period.periodEndDay)}`}
                  value={formatSUSD(period.netFiscalResultSUSD)}
                  detail={`Tax ${formatSUSD(period.incomeTaxSUSD)} · business ${formatSUSD(period.businessTaxRevenueSUSD)} · welfare requested ${formatSUSD(period.welfareRequestedSUSD)} paid ${formatSUSD(period.welfareExpenseSUSD)}`}
                />
              ))}
          </>
        )}
      </Section>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { color: colors.muted, fontSize: 13, paddingVertical: spacing.sm },
  inputLabel: { color: colors.muted, fontSize: 12, marginTop: spacing.sm, marginBottom: spacing.xs },
  input: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.md,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 15,
    fontVariant: ["tabular-nums"],
  },
  quickRow: { flexDirection: "row", flexWrap: "wrap", marginTop: spacing.sm, rowGap: spacing.xs },
  applyRow: { marginTop: spacing.md },
  error: { color: colors.red, fontSize: 12, marginTop: spacing.sm },
  hint: { color: colors.faint, fontSize: 10, lineHeight: 15, marginTop: 4 },
  previewNote: { color: colors.faint, fontSize: 10, lineHeight: 15, marginTop: 4 },
  note: { color: colors.faint, fontSize: 11, marginTop: spacing.sm, lineHeight: 16 },
  contractRow: {
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: spacing.md,
    paddingTop: spacing.sm,
  },
  contractTitle: { color: colors.text, fontSize: 12, fontWeight: "600" },
  contractDetail: { color: colors.muted, fontSize: 10, marginTop: 2, lineHeight: 14 },
});

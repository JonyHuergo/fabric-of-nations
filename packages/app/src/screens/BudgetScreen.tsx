import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  countryById,
  fiscalResultLabel,
  formatRate,
  latestFinancePeriod,
  latestMonthlyReport,
  previewDebtIssuance,
  previewDebtPolicy,
  previewDebtRepayment,
  previewFiscalPolicy,
  type SimulationSnapshot,
} from "@century/sim-worker";

import { ActionButton, Chip, Headline, MiniBars, Section, StatRow } from "../components/ui";
import { SliderField, useDeferredCommit } from "../components/Slider";
import { colors, fonts, radii, spacing, themedSheet } from "../theme";
import { useSimulation } from "../worker/SimulationProvider";
import { useMoney } from "../format/useMoney";

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
  const money = useMoney();
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
    setAllowanceText(fiscal.incomeTaxAllowanceRUSDPerYear.toFixed(0));
    setWelfareText(fiscal.welfareBudgetRUSDPerYear.toFixed(0));
    setWealthText(String(fiscal.welfareMaxWealthLevel));
    setBusinessText((fiscal.businessProfitTaxRate * 100).toFixed(2));
    setReserveText(fiscal.reserveTargetRUSD.toFixed(0));
    setCeilingText(debtPolicy.maxOutstandingPrincipalRUSD.toFixed(0));
    setRefinanceOn(debtPolicy.refinanceOnMaturity);
    setRepayTexts({});
    setBorrowText("");
  }, [
    countryId,
    fiscal?.incomeTaxRate,
    fiscal?.incomeTaxAllowanceRUSDPerYear,
    fiscal?.welfareBudgetRUSDPerYear,
    fiscal?.welfareMaxWealthLevel,
    fiscal?.businessProfitTaxRate,
    fiscal?.reserveTargetRUSD,
    debtPolicy?.maxOutstandingPrincipalRUSD,
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
  // P3: a closed month converts at its own closing valuation.
  const latestMonthlyMoney = latestMonthly === null ? money : money.atPeriod(latestMonthly.periodEndDay);
  const historyValues = country.financeHistory.map((period) => period.netFiscalResultRUSD);

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
      incomeTaxAllowanceRUSDPerYear: proposedAllowance,
      welfareMaxWealthLevel: proposedWealth,
      businessProfitTaxRate: proposedBusiness,
      reserveTargetRUSD: proposedReserve,
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
      setLocalError("The income-tax exemption must be a non-negative annual amount.");
      return;
    }
    if (!Number.isFinite(welfare) || welfare < 0) {
      setLocalError("Welfare budget must be a non-negative annual amount.");
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
      setLocalError("The reserve target must be a non-negative amount.");
      return;
    }
    setLocalError(null);
    applyAction({
      kind: "set-fiscal-policy",
      countryId: country.id,
      incomeTaxRate: tax,
      incomeTaxAllowanceRUSDPerYear: allowance,
      welfareBudgetRUSDPerYear: welfare,
      welfareMaxWealthLevel: wealth,
      businessProfitTaxRate: business,
      reserveTargetRUSD: reserve,
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
      maxOutstandingPrincipalRUSD: overrides?.ceiling ?? proposedCeiling,
    });
  };

  const borrowAmount = parseNumber(borrowText);
  const borrowPreview = previewDebtIssuance(snapshot, country, borrowAmount, money);
  const applyBorrow = (overrides?: number) => {
    if (!isPlayerCountry) {
      setLocalError("Only the player country may borrow.");
      return;
    }
    const amount = overrides ?? borrowAmount;
    const preview = previewDebtIssuance(snapshot, country, amount, money);
    if (!preview.valid) {
      setLocalError(preview.errors.join(" "));
      return;
    }
    setLocalError(null);
    applyAction({ kind: "issue-debt", countryId: country.id, amountRUSD: amount });
  };

  const mtd = country.budgetMonthToDate;

  return (
    <View>
      <Headline
        label="Treasury"
        value={money.format(country.treasuryCashRUSD)}
        tone={country.treasuryCashRUSD >= 0 ? "default" : "negative"}
        trend={historyValues}
        detail="Bars show the net result of closed months"
      />
      <Section
        title="Budget"
        subtitle={`${country.name} · ${isPlayerCountry ? "Player country" : "AI-controlled"} · every change is a validated action. There are no silent overrides.`}
      >
        <StatRow
          label="Treasury cash (stock)"
          value={money.format(country.treasuryCashRUSD)}
          detail={`Reserve target ${money.format(fiscal.reserveTargetRUSD)} · cash above target ${money.format(Math.max(0, country.treasuryCashRUSD - fiscal.reserveTargetRUSD))}`}
        />
        <StatRow
          label="Latest closed result"
          value={latest === null ? "Awaiting first close" : fiscalResultLabel(latest.netFiscalResultRUSD)}
          detail={
            latest === null
              ? "No closed period yet"
              : `${money.format(latest.netFiscalResultRUSD)} · all recorded revenue − all recorded expense`
          }
        />
        <StatRow
          label="Debt principal (stock)"
          value={money.format(country.debtOutstandingPrincipalRUSD)}
          detail={
            debtPolicy.enabled
              ? `Ceiling ${money.format(debtPolicy.maxOutstandingPrincipalRUSD)} · creditor ${debtPolicy.creditorLabel} · coupon ${formatRate(debtPolicy.annualCouponRate)}`
              : "No enabled debt policy for this country"
          }
        />
        <StatRow
          label="This month so far (flows)"
          value={`Tax ${latestMonthlyMoney.format(latestMonthly?.incomeTaxRUSD ?? 0)} · Welfare requested ${money.format(mtd.welfareRequestedRUSD)}`}
          detail={`Welfare shortfall ${money.format(mtd.welfareShortfallRUSD)} · business tax assessed ${money.format(mtd.businessTaxAssessedRUSD)} · borrowed ${money.format(mtd.debtIssuedRUSD)} · principal repaid ${money.format(mtd.principalRepaidRUSD)} · interest paid ${money.format(mtd.interestPaidRUSD)}`}
        />
      </Section>

      <Section folded
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
            Math.round(country.treasuryCashRUSD),
            Math.round(preview.estimatedDailyTaxableWageBaseRUSD * 365),
          )}
          step={100}
          precision={0}
          money={money}
          unit="/yr"
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
          value={money.format(preview.estimatedDailyTaxableWageBaseRUSD)}
          detail="Estimated exact current base at the current exemption; not realized wages."
        />
        <StatRow
          label="Month-to-date enterprise profit base"
          value={money.format(mtd.businessTaxBaseMonthToDateRUSD)}
          detail="Sum of positive building results so far this month, before assessment."
        />
      </Section>

      <Section folded
        title="Spending and reserve"
        subtitle="Welfare is paid daily from treasury cash subject to the reserve floor and wealth eligibility ceiling. Other implemented spending categories are set by their own policy screens and reported in Budget execution."
      >
        <SliderField
          label="Welfare budget"
          value={Number.isFinite(proposedWelfare) ? proposedWelfare : 0}
          min={0}
          max={Math.max(10_000_000, Math.round(country.treasuryCashRUSD * 0.5))}
          step={100_000}
          precision={0}
          money={money}
          unit="/yr"
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
          max={Math.max(1000, Math.round(country.treasuryCashRUSD))}
          step={1000}
          precision={0}
          money={money}
          disabled={!canAct}
          pending={reserveCommit.hasPending}
          onChange={(value) => setReserveText(value.toFixed(0))}
          onCommit={(value) => reserveCommit.submit(value)}
          hint="A liquidity floor, not a spendable pool. It never causes borrowing."
        />
      </Section>

      <Section folded
        title="Before you commit the budget"
        subtitle="Static current-base estimates. They hold today's wage base, employment, prices, and month-to-date profit constant and are not forecasts."
      >
        <StatRow
          label="Income tax rate now → proposed"
          value={`${formatRate(preview.currentIncomeTaxRate)} → ${formatRate(preview.proposedIncomeTaxRate)}`}
          detail={`Estimated tax ${money.format(preview.currentDailyIncomeTaxRUSD)} → ${money.format(preview.proposedDailyIncomeTaxRUSD)} per day.`}
        />
        <StatRow
          label="Taxable base now → proposed"
          value={`${money.format(preview.estimatedDailyTaxableWageBaseRUSD)} → ${money.format(preview.proposedDailyTaxableWageBaseRUSD)}`}
          detail={preview.taxableBaseIsEstimate ? "Proposed base is an upper-bound estimate assuming every wage-earning block exceeds the exemption." : "Exact current-base calculation under the current exemption."}
        />
        <StatRow
          label="Monthly income-tax effect"
          value={money.format(preview.monthlyIncomeTaxDeltaRUSD)}
          detail="Static change for the current civil month's day count, before behaviour changes."
        />
        <StatRow
          label="Welfare now → proposed"
          value={`${money.format(preview.currentWelfareBudgetRUSDPerYear)}/yr → ${money.format(preview.proposedWelfareBudgetRUSDPerYear)}/yr`}
          detail={`Daily request ${money.format(preview.currentDailyWelfareRUSD)} → ${money.format(preview.proposedDailyWelfareRUSD)}; cash ceiling above reserve ${money.format(preview.currentWelfareCashCeilingRUSD)} → ${money.format(preview.proposedWelfareCashCeilingRUSD)}.`}
        />
        <StatRow
          label="Monthly welfare effect"
          value={money.format(preview.monthlyWelfareDeltaRUSD)}
          detail={`Eligibility ceiling ${String(preview.currentWelfareMaxWealthLevel)} → ${String(preview.proposedWelfareMaxWealthLevel)}; the per-capita eligibility effect is not retained per threshold and is not predicted.`}
        />
        <StatRow
          label="Business tax at current month base"
          value={`${money.format(preview.currentBusinessTaxAtCurrentBaseRUSD)} → ${money.format(preview.proposedBusinessTaxAtCurrentBaseRUSD)}`}
          detail={`Rate ${formatRate(preview.currentBusinessProfitTaxRate)} → ${formatRate(preview.proposedBusinessProfitTaxRate)} on ${money.format(preview.businessTaxBaseMonthToDateRUSD)} month-to-date profit; collection is limited by each building's cash.`}
        />
        <StatRow
          label="Reserve target now → proposed"
          value={`${money.format(preview.currentReserveTargetRUSD)} → ${money.format(preview.proposedReserveTargetRUSD)}`}
          detail="Changes the welfare cash ceiling and the repayment floor; it is not a spending authorization."
        />
        <StatRow
          label="Estimated net monthly fiscal change"
          value={money.format(preview.estimatedMonthlyFiscalDeltaRUSD)}
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

      <Section folded
        title="Financing: borrowing, repayment, refinancing"
        subtitle="Borrowing and principal repayment are financing movements. They are not revenue or expenditure and do not change the fiscal result."
      >
        <StatRow
          label="Creditor"
          value={debtPolicy.enabled ? debtPolicy.creditorLabel : "No creditor (debt disabled)"}
          detail={`Kind ${debtPolicy.creditorKind} · creditor cash ${money.format(debtPolicy.creditorCashRUSD)} · headroom ${money.format(debtPolicy.headroomRUSD)} · term ${String(debtPolicy.termDays)} days`}
        />
        <StatRow
          label="Interest payable (stock)"
          value={money.format(country.debtInterestPayableRUSD)}
          detail={`Annual coupon ${formatRate(debtPolicy.annualCouponRate)}; interest accrues daily and pays at month-end.`}
        />

        <SliderField
          label="Borrow principal"
          value={Number.isFinite(borrowAmount) ? borrowAmount : 0}
          min={0}
          max={Math.max(1000, Math.round(debtPolicy.headroomRUSD))}
          step={1000}
          precision={0}
          money={money}
          disabled={!canAct || !debtPolicy.enabled}
          onChange={(value) => setBorrowText(value.toFixed(0))}
          onCommit={(value) => applyBorrow(value)}
          hint="Financing, not revenue: treasury cash and debt principal change together."
        />
        {borrowPreview.valid ? (
          <Text style={styles.hint}>
            Treasury {money.format(country.treasuryCashRUSD)} → {money.format(borrowPreview.treasuryAfterRUSD)};
            debt {money.format(country.debtOutstandingPrincipalRUSD)} → {money.format(borrowPreview.outstandingAfterRUSD)};
            interest {money.format(borrowPreview.annualInterestRUSD)}/yr.
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
            const repayment = previewDebtRepayment(snapshot, country, contract.id, amount, money);
            return (
              <View key={contract.id} style={styles.contractRow}>
                <Text style={styles.contractTitle}>
                  Contract {String(contract.id)} · {contract.holderLabel} · {contract.status}
                </Text>
                <Text style={styles.contractDetail}>
                  Principal {money.format(contract.principalRUSD)} · outstanding{" "}
                  {money.format(contract.outstandingPrincipalRUSD)} · accrued interest{" "}
                  {money.format(contract.accruedInterestRUSD)} · matures day{" "}
                  {String(contract.maturityDay)}
                </Text>
                <SliderField
                  label="Repay principal"
                  value={Number.isFinite(amount) ? Math.max(0, amount) : 0}
                  min={0}
                  max={Math.max(1, Math.round(contract.outstandingPrincipalRUSD))}
                  step={100}
                  precision={0}
                  money={money}
                  disabled={!canAct}
                  onChange={(value) =>
                    setRepayTexts((current) => ({ ...current, [contract.id]: value.toFixed(0) }))
                  }
                  onCommit={(value) => {
                    setRepayTexts((current) => ({ ...current, [contract.id]: value.toFixed(0) }));
                    const preview = previewDebtRepayment(snapshot, country, contract.id, value, money);
                    if (preview === null || !preview.valid) {
                      setLocalError(preview?.errors.join(" ") ?? "Enter a valid repayment.");
                      return;
                    }
                    setLocalError(null);
                    applyAction({
                      kind: "repay-debt",
                      countryId: country.id,
                      contractId: contract.id,
                      amountRUSD: value,
                    });
                  }}
                  hint="Principal repayment is a financing movement, not an expense."
                />
                {repayment === null ? null : repayment.valid ? (
                  <Text style={styles.hint}>
                    Outstanding {money.format(repayment.outstandingBeforeRUSD)} →{" "}
                    {money.format(repayment.outstandingAfterRUSD)} · treasury{" "}
                    {money.format(country.treasuryCashRUSD)} → {money.format(repayment.treasuryAfterRUSD)}{" "}
                    · reserve floor {money.format(repayment.reserveTargetRUSD)}
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
                        amountRUSD: amount,
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
          max={Math.max(1_000_000, Math.round(debtPolicy.maxOutstandingPrincipalRUSD * 2))}
          step={100_000}
          precision={0}
          money={money}
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

      <Section folded
        title="Budget execution"
        subtitle="Latest closed month: requested, paid, and shortfall are separate from borrowing, principal, and interest."
      >
        {latestMonthly === null ? (
          <Text style={styles.empty}>No monthly close has run yet.</Text>
        ) : (
          <>
            <StatRow
              label="Personal income tax (revenue)"
              value={latestMonthlyMoney.format(latestMonthly.incomeTaxRUSD)}
              detail="Recognized revenue for the closed period."
            />
            <StatRow
              label="Business-profit tax (revenue)"
              value={latestMonthlyMoney.format(latestMonthly.businessTaxRevenueRUSD)}
              detail={`Assessed ${latestMonthlyMoney.format(latestMonthly.businessTaxAssessedRUSD)} · uncollected ${latestMonthlyMoney.format(latestMonthly.businessTaxUncollectedRUSD)}`}
            />
            <StatRow
              label="Customs duty (revenue)"
              value={latestMonthlyMoney.format(latestMonthly.customsDutyRevenueRUSD)}
              detail="Duty collected by this country's customs administration."
            />
            <StatRow
              label="Welfare"
              value={`${latestMonthlyMoney.format(latestMonthly.welfareExpenseRUSD)} paid`}
              detail={`Requested ${latestMonthlyMoney.format(latestMonthly.welfareRequestedRUSD)} · shortfall ${latestMonthlyMoney.format(latestMonthly.welfareShortfallRUSD)}`}
            />
            <StatRow
              label="Interest"
              value={`${latestMonthlyMoney.format(latestMonthly.interestExpenseRUSD)} expense`}
              detail={`Cash interest paid ${latestMonthlyMoney.format(latestMonthly.interestPaidRUSD)} (accrual and payment are distinct).`}
            />
            <StatRow
              label="Production subsidies"
              value={latestMonthlyMoney.format(latestMonthly.subsidyExpenseRUSD)}
              detail={`Requested ${latestMonthlyMoney.format(latestMonthly.subsidyRequestedRUSD)} · shortfall ${latestMonthlyMoney.format(latestMonthly.subsidyShortfallRUSD)}`}
            />
            <StatRow
              label="Administration payroll"
              value={latestMonthlyMoney.format(latestMonthly.administrationExpenseRUSD)}
              detail={`Requested ${latestMonthlyMoney.format(latestMonthly.administrationRequestedRUSD)} · shortfall ${latestMonthlyMoney.format(latestMonthly.administrationShortfallRUSD)}`}
            />
            <StatRow
              label="Education and research payroll"
              value={latestMonthlyMoney.format(latestMonthly.educationExpenseRUSD)}
            />
            <StatRow
              label="Training payroll and stipend"
              value={latestMonthlyMoney.format(latestMonthly.trainingExpenseRUSD)}
            />
            <StatRow
              label="Military pay and procurement"
              value={latestMonthlyMoney.format(latestMonthly.militaryExpenseRUSD)}
              detail="Daily army pay, equipment upkeep, garrison cost, and recruitment equipment purchases."
            />
            <StatRow
              label="Net fiscal result"
              value={latestMonthlyMoney.format(latestMonthly.netFiscalResultRUSD)}
              detail="Income tax + business tax + customs duty − welfare − interest − subsidies − administration − education − training − military; financing is excluded."
            />
            <StatRow
              label="Financing"
              value={`${latestMonthlyMoney.format(latestMonthly.debtIssuedRUSD)} borrowed · ${latestMonthlyMoney.format(latestMonthly.principalRepaidRUSD)} principal repaid`}
              detail={`Unfinanced requirement ${latestMonthlyMoney.format(latestMonthly.unfinancedRequirementRUSD)}; shortfall is explicit, never money-created.`}
            />
            <StatRow
              label="Balances at close"
              value={
                latestMonthly.treasuryCash === null
                  ? "Not retained (compacted month)"
                  : latestMonthlyMoney.format(latestMonthly.treasuryCash.endRUSD)
              }
              detail={
                latestMonthly.debtOutstanding === null
                  ? "Debt balance not retained for this month."
                  : `Debt principal ${latestMonthlyMoney.format(latestMonthly.debtOutstanding.endRUSD)}.`
              }
            />
          </>
        )}
      </Section>

      <Section folded title="Net fiscal history" subtitle="Last closed months; bars show surplus or deficit.">
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
                  value={money.atPeriod(period.periodEndDay).format(period.netFiscalResultRUSD)}
                  detail={`Tax ${money.atPeriod(period.periodEndDay).format(period.incomeTaxRUSD)} · business ${money.atPeriod(period.periodEndDay).format(period.businessTaxRevenueRUSD)} · welfare requested ${money.atPeriod(period.periodEndDay).format(period.welfareRequestedRUSD)} paid ${money.atPeriod(period.periodEndDay).format(period.welfareExpenseRUSD)}`}
                />
              ))}
          </>
        )}
      </Section>
    </View>
  );
}

const styles = themedSheet(() => ({
  empty: { color: colors.muted, fontFamily: fonts.sans, fontSize: 13, paddingVertical: spacing.sm },
  inputLabel: { color: colors.muted, fontFamily: fonts.sans, fontSize: 13, marginTop: spacing.sm, marginBottom: spacing.xs },
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
  error: { color: colors.red, fontFamily: fonts.sans, fontSize: 13, marginTop: spacing.sm },
  hint: { color: colors.faint, fontFamily: fonts.sans, fontSize: 11, lineHeight: 15, marginTop: 4 },
  previewNote: { color: colors.faint, fontFamily: fonts.sans, fontSize: 11, lineHeight: 15, marginTop: 4 },
  note: { color: colors.faint, fontFamily: fonts.sans, fontSize: 13, marginTop: spacing.sm, lineHeight: 16 },
  contractRow: {
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: spacing.md,
    paddingTop: spacing.sm,
  },
  contractTitle: { color: colors.text, fontSize: 13, fontFamily: fonts.sansSemiBold },
  contractDetail: { color: colors.muted, fontFamily: fonts.sans, fontSize: 11, marginTop: 2, lineHeight: 14 },
}));

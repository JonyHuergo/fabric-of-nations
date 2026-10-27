import { useEffect, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

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

import { ActionButton, MiniBars, Pill, Section, StatRow } from "../components/ui";
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

  const guard = (): boolean => {
    if (!isPlayerCountry) {
      setLocalError(
        "This is an AI-controlled country. Policy can only be changed for the player country.",
      );
      return false;
    }
    if (!Number.isFinite(proposedTax) || proposedTax < 0 || proposedTax > 1) {
      setLocalError("Income tax must be between 0% and 100%.");
      return false;
    }
    if (!Number.isFinite(proposedAllowance) || proposedAllowance < 0) {
      setLocalError("The income-tax exemption must be a non-negative annual SUSD amount.");
      return false;
    }
    if (!Number.isFinite(proposedWelfare) || proposedWelfare < 0) {
      setLocalError("Welfare budget must be a non-negative annual SUSD amount.");
      return false;
    }
    if (!Number.isInteger(proposedWealth) || proposedWealth < 0 || proposedWealth > 99) {
      setLocalError("The welfare eligibility ceiling must be a whole wealth level from 0 to 99.");
      return false;
    }
    if (!Number.isFinite(proposedBusiness) || proposedBusiness < 0 || proposedBusiness > 1) {
      setLocalError("The business-profit tax must be between 0% and 100%.");
      return false;
    }
    if (!Number.isFinite(proposedReserve) || proposedReserve < 0) {
      setLocalError("The reserve target must be a non-negative SUSD amount.");
      return false;
    }
    setLocalError(null);
    return true;
  };

  const applyFiscal = () => {
    if (!guard()) return;
    applyAction({
      kind: "set-fiscal-policy",
      countryId: country.id,
      incomeTaxRate: proposedTax,
      incomeTaxAllowanceSUSDPerYear: proposedAllowance,
      welfareBudgetSUSDPerYear: proposedWelfare,
      welfareMaxWealthLevel: proposedWealth,
      businessProfitTaxRate: proposedBusiness,
      reserveTargetSUSD: proposedReserve,
    });
  };

  const proposedCeiling = parseNumber(ceilingText);
  const debtPolicyPreview = previewDebtPolicy(
    snapshot,
    country,
    refinanceOn,
    proposedCeiling,
  );
  const applyDebtPolicy = () => {
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
      refinanceOnMaturity: refinanceOn,
      maxOutstandingPrincipalSUSD: proposedCeiling,
    });
  };

  const borrowAmount = parseNumber(borrowText);
  const borrowPreview = previewDebtIssuance(snapshot, country, borrowAmount);
  const applyBorrow = () => {
    if (!isPlayerCountry) {
      setLocalError("Only the player country may borrow.");
      return;
    }
    if (!borrowPreview.valid) {
      setLocalError(borrowPreview.errors.join(" "));
      return;
    }
    setLocalError(null);
    applyAction({ kind: "issue-debt", countryId: country.id, amountSUSD: borrowAmount });
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
              : `${formatSUSD(latest.netFiscalResultSUSD)} · tax + business tax − welfare − interest`
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
        <Text style={styles.inputLabel}>Personal income tax rate (%)</Text>
        <TextInput
          value={taxText}
          onChangeText={setTaxText}
          keyboardType="decimal-pad"
          style={styles.input}
          accessibilityLabel="Income tax rate percent"
        />
        <View style={styles.quickRow}>
          {[0, 5, 10, 15, 25].map((value) => (
            <Pill
              key={value}
              label={`${String(value)}%`}
              active={Math.abs(parseNumber(taxText) - value) < 0.001}
              onPress={() => setTaxText(String(value))}
              disabled={!canAct}
            />
          ))}
        </View>
        <Text style={styles.inputLabel}>Income-tax exemption (SUSD per household per year)</Text>
        <TextInput
          value={allowanceText}
          onChangeText={setAllowanceText}
          keyboardType="decimal-pad"
          style={styles.input}
          accessibilityLabel="Annual income tax exemption in SUSD"
        />
        <Text style={styles.hint}>
          Subtracted from each household&apos;s actual daily wage receipt before the rate applies.
        </Text>
        <Text style={styles.inputLabel}>Business-profit tax rate (%)</Text>
        <TextInput
          value={businessText}
          onChangeText={setBusinessText}
          keyboardType="decimal-pad"
          style={styles.input}
          accessibilityLabel="Business profit tax rate percent"
        />
        <View style={styles.quickRow}>
          {[0, 5, 10, 20].map((value) => (
            <Pill
              key={value}
              label={`${String(value)}%`}
              active={Math.abs(parseNumber(businessText) - value) < 0.001}
              onPress={() => setBusinessText(String(value))}
              disabled={!canAct}
            />
          ))}
        </View>
        <Text style={styles.hint}>
          Assessed once at each month-end on a building&apos;s positive recognized period result
          (sales − inputs − wages − upkeep). Losses are not refunded or carried forward for tax.
        </Text>
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
        subtitle="Welfare is the only spending category with a complete delivery mechanism in E2. Education, health, administration, subsidies, procurement, and public investment are deferred to the stages that create their real mechanics."
      >
        <Text style={styles.inputLabel}>Welfare budget (SUSD per year)</Text>
        <TextInput
          value={welfareText}
          onChangeText={setWelfareText}
          keyboardType="decimal-pad"
          style={styles.input}
          accessibilityLabel="Annual welfare budget in SUSD"
        />
        <View style={styles.quickRow}>
          {[0, 1_000_000, 10_000_000].map((value) => (
            <Pill
              key={value}
              label={value === 0 ? "0" : formatSUSD(value)}
              active={Math.abs(parseNumber(welfareText) - value) < 0.5}
              onPress={() => setWelfareText(String(value))}
              disabled={!canAct}
            />
          ))}
        </View>
        <Text style={styles.inputLabel}>Welfare eligibility ceiling (wealth level 0–99)</Text>
        <TextInput
          value={wealthText}
          onChangeText={setWealthText}
          keyboardType="number-pad"
          style={styles.input}
          accessibilityLabel="Welfare eligibility wealth ceiling"
        />
        <View style={styles.quickRow}>
          {[99, 50, 25, 10].map((value) => (
            <Pill
              key={value}
              label={value === 99 ? "Universal (99)" : String(value)}
              active={parseNumber(wealthText) === value}
              onPress={() => setWealthText(String(value))}
              disabled={!canAct}
            />
          ))}
        </View>
        <Text style={styles.hint}>
          Only blocks at or below the ceiling receive the daily transfer, shared in proportion to
          their population. Unpaid welfare is a shortfall, never a liability.
        </Text>
        <Text style={styles.inputLabel}>Treasury reserve target (SUSD)</Text>
        <TextInput
          value={reserveText}
          onChangeText={setReserveText}
          keyboardType="decimal-pad"
          style={styles.input}
          accessibilityLabel="Treasury reserve target in SUSD"
        />
        <Text style={styles.hint}>
          A liquidity floor, not a spendable pool: daily welfare may not draw treasury cash below
          it, and discretionary principal repayment may not either. It never causes borrowing.
        </Text>
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

        <Text style={styles.inputLabel}>Borrow principal (SUSD)</Text>
        <TextInput
          value={borrowText}
          onChangeText={setBorrowText}
          keyboardType="decimal-pad"
          style={styles.input}
          accessibilityLabel="Borrow principal in SUSD"
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
                <TextInput
                  value={repayTexts[contract.id] ?? ""}
                  onChangeText={(text) =>
                    setRepayTexts((current) => ({ ...current, [contract.id]: text }))
                  }
                  keyboardType="decimal-pad"
                  style={styles.input}
                  accessibilityLabel={`Repay principal for contract ${String(contract.id)}`}
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

        <Text style={styles.inputLabel}>Outstanding-principal ceiling (SUSD)</Text>
        <TextInput
          value={ceilingText}
          onChangeText={setCeilingText}
          keyboardType="decimal-pad"
          style={styles.input}
          accessibilityLabel="Debt ceiling in SUSD"
        />
        <View style={styles.quickRow}>
          <Pill
            label="Refinance on maturity"
            active={refinanceOn}
            onPress={() => setRefinanceOn((current) => !current)}
            disabled={!canAct || !debtPolicy.enabled}
          />
        </View>
        {debtPolicyPreview.valid ? (
          <Text style={styles.hint}>
            Headroom {formatSUSD(debtPolicyPreview.currentHeadroomSUSD)} →{" "}
            {formatSUSD(debtPolicyPreview.proposedHeadroomSUSD)}; refinancing{" "}
            {debtPolicyPreview.currentRefinanceOnMaturity ? "on" : "off"} →{" "}
            {debtPolicyPreview.proposedRefinanceOnMaturity ? "on" : "off"}.
          </Text>
        ) : (
          debtPolicyPreview.errors.map((error) => (
            <Text key={error} style={styles.previewNote}>
              • {error}
            </Text>
          ))
        )}
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
              label="Net fiscal result"
              value={formatSUSD(latestMonthly.netFiscalResultSUSD)}
              detail="Tax revenue minus welfare and interest expense; financing is excluded."
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

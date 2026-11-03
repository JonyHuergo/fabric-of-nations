/** * M5b public debt and deficit financing. * * Scope: country-issued RUSD debt held by an explicitly identified simulated * creditor (another country treasury or a pop-block household). There is no bank, * central bank, bond market, or external investor pool. * * Accounting: * - issuance: issuer treasury cash / debt liability; holder bond asset / cash. * - interest accrual: issuer interest expense / interest payable; holder interest *   receivable / interest income. * - interest payment: issuer interest payable / treasury cash; holder cash / *   interest receivable. * - principal repayment: issuer debt liability / treasury cash; holder cash / bond *   asset. * - default write-down: remaining liability/interest and holder asset/receivable *   are written off against owner equity on both sides. * * Deficit financing: at a month-end, after daily interest accrual, a country with * an enabled debt policy may issue debt up to its accrued fiscal deficit, the * designated creditor's cash, and its outstanding-principal ceiling. Borrowing is * not revenue; principal repayment is not expense; both are kept outside the M4b * gross flow kinds. */ import { assertValidDayIndex, dayIndexToCivilDate, daysInMonth, daysInYear, isTerminalDayIndex } from "../calendar.js";

import { MONEY_TOLERANCE_RUSD } from "../population/constants.js";

import type { Day, DayIndex, Id } from "../types.js";

import { requireFiniteNumber, requireInteger } from "../validation.js";

import { assertValidWorld, assertValidWorldForTick, type PhaseValidationOptions, type World } from "../world.js";

import { postJournalBatch, postJournalEntry, type JournalEntryInput } from "./accounting.js";

import { assertAccountingIdentity, buildFinanceIndex, cloneFinanceState, designatedCashTotal, phaseFinance, type FinanceIndex, } from "./accounts.js";

import { MAX_ACTIVE_DEBT_CONTRACTS, MAX_DEBT_COUPON_RATE, MAX_DEBT_TERM_DAYS, MAX_RETAINED_TERMINATED_DEBT_CONTRACTS, MIN_DEBT_COUPON_RATE, MIN_DEBT_TERM_DAYS, } from "./constants.js";

import type { Country, DebtContract, DebtPolicy, FinanceState } from "./types.js";

import { debtMaturityFor, debtOutstandingPrincipal } from "./debtPolicy.js";

import { assertValidFinanceState } from "./validation.js";

import { accumulateBudgetMemo, readBudgetMemo } from "./budget.js";

interface HolderAccounts {
    readonly cash: ReturnType<FinanceIndex["get"]>;
    readonly bond: ReturnType<FinanceIndex["get"]>;
    readonly receivable: ReturnType<FinanceIndex["get"]>;
    readonly income: ReturnType<FinanceIndex["get"]>;
}

function issuerAccounts(index: FinanceIndex, countryId: Id): {
    readonly treasury: ReturnType<FinanceIndex["get"]>;
    readonly liability: ReturnType<FinanceIndex["get"]>;
    readonly payable: ReturnType<FinanceIndex["get"]>;
    readonly expense: ReturnType<FinanceIndex["get"]>;
} {
    return {
        treasury: index.get("country", countryId, "treasury-cash"), liability: index.get("country", countryId, "debt-liability"), payable: index.get("country", countryId, "interest-payable"), expense: index.get("country", countryId, "interest-expense"),
    };
}

function holderAccounts(index: FinanceIndex, holderKind: "country" | "popBlock", holderId: Id): HolderAccounts {
    return {
        cash: index.get(holderKind === "country" ? "country" : "popBlock", holderId, holderKind === "country" ? "treasury-cash" : "household-cash"), bond: index.get(holderKind, holderId, "bond-asset"), receivable: index.get(holderKind, holderId, "interest-receivable"), income: index.get(holderKind, holderId, "interest-income"),
    };
}

function issuanceEntry(index: FinanceIndex, contract: DebtContract): JournalEntryInput {
    const issuer = issuerAccounts(index, contract.issuerCountryId);
    const holder = holderAccounts(index, contract.holderKind, contract.holderId);
    return {
        transactionKind: "debt-issuance", lines: [{
                accountId: issuer.treasury.id, side: "debit", amountRUSD: contract.principalRUSD
            },
            {
                accountId: issuer.liability.id, side: "credit", amountRUSD: contract.principalRUSD
            },
            {
                accountId: holder.bond.id, side: "debit", amountRUSD: contract.principalRUSD
            },
            {
                accountId: holder.cash.id, side: "credit", amountRUSD: contract.principalRUSD
            },
        ], sourceEntityId: contract.issuerCountryId, targetEntityId: contract.holderId,
    };
}

function principalRepaymentEntry(index: FinanceIndex, contract: DebtContract, amount: number): JournalEntryInput {
    const issuer = issuerAccounts(index, contract.issuerCountryId);
    const holder = holderAccounts(index, contract.holderKind, contract.holderId);
    return {
        transactionKind: "debt-principal-repayment", lines: [{
                accountId: issuer.liability.id, side: "debit", amountRUSD: amount
            },
            {
                accountId: issuer.treasury.id, side: "credit", amountRUSD: amount
            },
            {
                accountId: holder.cash.id, side: "debit", amountRUSD: amount
            },
            {
                accountId: holder.bond.id, side: "credit", amountRUSD: amount
            },
        ], sourceEntityId: contract.issuerCountryId, targetEntityId: contract.holderId,
    };
}

function interestAccrualEntry(index: FinanceIndex, contract: DebtContract, amount: number): JournalEntryInput {
    const issuer = issuerAccounts(index, contract.issuerCountryId);
    const holder = holderAccounts(index, contract.holderKind, contract.holderId);
    return {
        transactionKind: "interest-accrual", lines: [{
                accountId: issuer.expense.id, side: "debit", amountRUSD: amount
            },
            {
                accountId: issuer.payable.id, side: "credit", amountRUSD: amount
            },
            {
                accountId: holder.receivable.id, side: "debit", amountRUSD: amount
            },
            {
                accountId: holder.income.id, side: "credit", amountRUSD: amount
            },
        ], sourceEntityId: contract.issuerCountryId, targetEntityId: contract.holderId,
    };
}

function interestPaymentEntry(index: FinanceIndex, contract: DebtContract, amount: number): JournalEntryInput {
    const issuer = issuerAccounts(index, contract.issuerCountryId);
    const holder = holderAccounts(index, contract.holderKind, contract.holderId);
    return {
        transactionKind: "interest-payment", lines: [{
                accountId: issuer.payable.id, side: "debit", amountRUSD: amount
            },
            {
                accountId: issuer.treasury.id, side: "credit", amountRUSD: amount
            },
            {
                accountId: holder.cash.id, side: "debit", amountRUSD: amount
            },
            {
                accountId: holder.receivable.id, side: "credit", amountRUSD: amount
            },
        ], sourceEntityId: contract.issuerCountryId, targetEntityId: contract.holderId,
    };
}

function defaultWriteoffEntry(index: FinanceIndex, contract: DebtContract): JournalEntryInput | null {
    const issuer = issuerAccounts(index, contract.issuerCountryId);
    const holder = holderAccounts(index, contract.holderKind, contract.holderId);
    // Contract-level accrued amounts can differ from aggregate posting-account
    // balances by a floating residual. Never write off more than both sides hold.
    const principal = Math.min(
        contract.outstandingPrincipalRUSD,
        issuer.liability.balanceRUSD,
        holder.bond.balanceRUSD,
    );
    const interest = Math.min(
        contract.accruedInterestRUSD,
        issuer.payable.balanceRUSD,
        holder.receivable.balanceRUSD,
    );
    const total = principal + interest;
    if (!(total > 0))
        return null;
    const holderEquity = index.get(contract.holderKind, contract.holderId, "owner-equity");
    const lines = [...(principal > 0 ? [{
                accountId: issuer.liability.id, side: "debit" as const, amountRUSD: principal
            }
        ] : []), ...(interest > 0 ? [{
                accountId: issuer.payable.id, side: "debit" as const, amountRUSD: interest
            }
        ] : []), {
            accountId: index.get("country", contract.issuerCountryId, "owner-equity").id, side: "credit" as const, amountRUSD: total
        },
        ...(principal > 0 ? [{
                accountId: holder.bond.id, side: "credit" as const, amountRUSD: principal
            }
        ] : []), ...(interest > 0 ? [{
                accountId: holder.receivable.id, side: "credit" as const, amountRUSD: interest
            }
        ] : []), {
            accountId: holderEquity.id, side: "debit" as const, amountRUSD: total
        },
    ];
    return {
        transactionKind: "debt-default-writeoff", lines, sourceEntityId: contract.issuerCountryId, targetEntityId: contract.holderId,
    };
}

function appendContract(finance: FinanceState, contract: DebtContract): void {
    finance.debtContracts.push(contract);
    finance.debtContracts.sort((left, right) => left.id - right.id);
}

function activeDebtContractCount(contracts: readonly DebtContract[]): number {
    return contracts.filter((contract) => contract.status === "active" || contract.status === "arrears").length;
}

function recordRetiredContract(
    finance: FinanceState,
    contract: DebtContract,
    principalBefore: number,
    interestBefore: number,
): void {
    const defaulted = contract.status === "defaulted";
    let aggregate = finance.debtHistory.find(
        (entry) => entry.issuerCountryId === contract.issuerCountryId,
    );
    if (aggregate === undefined) {
        aggregate = {
            issuerCountryId: contract.issuerCountryId,
            contractsRetired: 0,
            contractsDefaulted: 0,
            principalIssuedRUSD: 0,
            principalRepaidRUSD: 0,
            principalWrittenOffRUSD: 0,
            interestWrittenOffRUSD: 0,
        };
        finance.debtHistory.push(aggregate);
        finance.debtHistory.sort((left, right) => left.issuerCountryId - right.issuerCountryId);
    }
    const updated = {
        ...aggregate,
        contractsRetired: aggregate.contractsRetired + (defaulted ? 0 : 1),
        contractsDefaulted: aggregate.contractsDefaulted + (defaulted ? 1 : 0),
        principalIssuedRUSD: aggregate.principalIssuedRUSD + contract.principalRUSD,
        principalRepaidRUSD:
            aggregate.principalRepaidRUSD +
            (defaulted
                ? Math.max(0, contract.principalRUSD - principalBefore)
                : contract.principalRUSD),
        principalWrittenOffRUSD:
            aggregate.principalWrittenOffRUSD + (defaulted ? principalBefore : 0),
        interestWrittenOffRUSD:
            aggregate.interestWrittenOffRUSD + (defaulted ? interestBefore : 0),
    };
    const index = finance.debtHistory.findIndex(
        (entry) => entry.issuerCountryId === contract.issuerCountryId,
    );
    finance.debtHistory[index] = updated;
}

/**
 * Retain every active/arrears contract and only the newest bounded set of
 * terminated contracts. Older terminated detail is already represented in
 * `debtHistory`; removing it therefore cannot orphan a liability, bond asset,
 * accrued interest, or cash transfer.
 */
function compactDebtContracts(finance: FinanceState): number {
    const terminated = finance.debtContracts
        .filter((contract) => contract.status === "repaid" || contract.status === "defaulted")
        .sort((left, right) => left.id - right.id);
    if (terminated.length <= MAX_RETAINED_TERMINATED_DEBT_CONTRACTS) return 0;
    const remove = new Set(
        terminated
            .slice(0, terminated.length - MAX_RETAINED_TERMINATED_DEBT_CONTRACTS)
            .map((contract) => contract.id),
    );
    finance.debtContracts = finance.debtContracts.filter((contract) => !remove.has(contract.id));
    return remove.size;
}

function newContract(finance: FinanceState, issuerCountryId: Id, holderKind: "country" | "popBlock", holderId: Id, principalRUSD: number, annualCouponRate: number, issueDay: Day, termDays: number): DebtContract {
    const id = requireInteger(finance.nextContractId, "finance.nextContractId", 1, Number.MAX_SAFE_INTEGER);
    finance.nextContractId = id + 1;
    return {
        id, contractVersion: 1, issuerCountryId, holderKind, holderId, principalRUSD, outstandingPrincipalRUSD: principalRUSD, annualCouponRate, issueDay, maturityDay: debtMaturityFor(issueDay, termDays), accruedInterestRUSD: 0, status: "active", arrearsSinceDay: null,
    };
}

function assertIssuerAndHolder(world: World, policy: DebtPolicy, issuerCountry: Country): void {
    if (policy.creditorKind === "country") {
        if (policy.creditorId === issuerCountry.id) {
            throw new RangeError(`country ${String(issuerCountry.id)} cannot borrow from its own treasury`);
        }
        if (!world.countries.some((country) => country.id === policy.creditorId)) {
            throw new RangeError(`unknown debt creditor country ${String(policy.creditorId)}`);
        }
    }
    else if (!world.popBlocks.some((block) => block.id === policy.creditorId)) {
        throw new RangeError(`unknown debt creditor popBlock ${String(policy.creditorId)}`);
    }
}

/** Input for one explicit debt issuance. */
export interface DebtIssuanceInput {
    readonly issuerCountryId: Id;
    readonly holderKind: "country" | "popBlock";
    readonly holderId: Id;
    readonly principalRUSD: number;
    readonly annualCouponRate: number;
    readonly termDays: number;
}

/** Result of one explicit issuance. */
export interface DebtIssuanceResult {
    readonly contract: DebtContract;
    readonly postingIds: readonly number[];
}

/** * Validate one explicit issuance without mutating. The issuer must have an * enabled debt policy, the holder must be its designated creditor, and the * issuance must satisfy the holder's cash and the issuer's outstanding-principal * ceiling. */
export function validateDebtIssuance(world: World, input: DebtIssuanceInput): void {
    const issuerCountry = world.countries.find((country) => country.id === input.issuerCountryId);
    if (issuerCountry === undefined)
        throw new RangeError(`unknown issuer country ${String(input.issuerCountryId)}`);
    if (!issuerCountry.debt.enabled) {
        throw new RangeError(`country ${String(issuerCountry.id)} has no enabled debt policy`);
    }
    assertIssuerAndHolder(world, issuerCountry.debt, issuerCountry);
    if (input.holderKind !== issuerCountry.debt.creditorKind || input.holderId !== issuerCountry.debt.creditorId) {
        throw new RangeError("explicit issuance must use the country's designated debt creditor");
    }
    const principal = requireFiniteNumber(input.principalRUSD, "debt.principalRUSD");
    if (!(principal > 0))
        throw new RangeError("debt principal must be positive");
    const coupon = requireFiniteNumber(input.annualCouponRate, "debt.annualCouponRate");
    if (coupon < MIN_DEBT_COUPON_RATE || coupon > MAX_DEBT_COUPON_RATE) {
        throw new RangeError("debt coupon must be in 0..1");
    }
    requireInteger(input.termDays, "debt.termDays", MIN_DEBT_TERM_DAYS, MAX_DEBT_TERM_DAYS);
    const index = buildFinanceIndex(world.finance);
    const holder = holderAccounts(index, input.holderKind, input.holderId);
    if (holder.cash.balanceRUSD < principal - MONEY_TOLERANCE_RUSD) {
        throw new RangeError("debt creditor has insufficient cash");
    }
    const ceiling = issuerCountry.debt.maxOutstandingPrincipalRUSD;
    if (debtOutstandingPrincipal(world.finance.debtContracts, issuerCountry.id) + principal > ceiling + MONEY_TOLERANCE_RUSD) {
        throw new RangeError("debt issuance exceeds the outstanding-principal ceiling");
    }
    if (activeDebtContractCount(world.finance.debtContracts) >= MAX_ACTIVE_DEBT_CONTRACTS) {
        throw new RangeError(
            `debt issuance would exceed the active-contract cap of ${String(MAX_ACTIVE_DEBT_CONTRACTS)}`,
        );
    }
}

/** * Issue one explicit debt contract. The operation is staged and atomic. */
export function issueGovernmentDebt(world: World, input: DebtIssuanceInput): DebtIssuanceResult {
    validateDebtIssuance(world, input);
    const staged = cloneFinanceState(world.finance);
    const index = buildFinanceIndex(staged);
    const contract = newContract(staged, input.issuerCountryId, input.holderKind, input.holderId, input.principalRUSD, input.annualCouponRate, world.dayIndex, input.termDays);
    const postings = postJournalBatch(staged, world.dayIndex, [issuanceEntry(index, contract)]);
    appendContract(staged, contract);
    accumulateBudgetMemo(staged, input.issuerCountryId, { debtIssuedRUSD: input.principalRUSD });
    assertValidFinanceState(staged);
    const candidate: World = {
        ...world, finance: staged
    };
    assertValidWorld(candidate);
    world.finance = staged;
    return {
        contract, postingIds: postings.map((posting) => posting.id)
    };
}

/** Input for one explicit early principal repayment. */
export interface DebtRepaymentInput {
    readonly issuerCountryId: Id;
    readonly contractId: Id;
    readonly amountRUSD: number;
}

/** Result of one explicit early principal repayment. */
export interface DebtRepaymentResult {
    readonly contract: DebtContract;
    readonly principalPaidRUSD: number;
    readonly postingIds: readonly number[];
}

/** * Validate one explicit early principal repayment without mutating. * * E2 rules: the contract must belong to the issuer and still be active/arrears, * the amount must be positive and no larger than the outstanding principal, * treasury cash must cover it, and the payment may not take treasury cash below * the country's reserve target. The reserve floor applies only to discretionary * repayment, never to contractual maturity, coupon, or arrears obligations. */
export function validateDebtRepayment(world: World, input: DebtRepaymentInput): void {
    const issuerCountry = world.countries.find((country) => country.id === input.issuerCountryId);
    if (issuerCountry === undefined)
        throw new RangeError(`unknown issuer country ${String(input.issuerCountryId)}`);
    const contract = world.finance.debtContracts.find((candidate) => candidate.id === input.contractId);
    if (contract === undefined)
        throw new RangeError(`unknown debt contract ${String(input.contractId)}`);
    if (contract.issuerCountryId !== issuerCountry.id) {
        throw new RangeError(
            `debt contract ${String(contract.id)} is not issued by country ${String(issuerCountry.id)}`,
        );
    }
    if (contract.status !== "active" && contract.status !== "arrears") {
        throw new RangeError(`debt contract ${String(contract.id)} is not outstanding`);
    }
    const amount = requireFiniteNumber(input.amountRUSD, "debt.repayment.amountRUSD");
    if (!(amount > 0))
        throw new RangeError("debt repayment amount must be positive");
    if (amount > contract.outstandingPrincipalRUSD + MONEY_TOLERANCE_RUSD) {
        throw new RangeError(
            `debt repayment ${String(amount)} exceeds outstanding principal ${String(contract.outstandingPrincipalRUSD)}`,
        );
    }
    const index = buildFinanceIndex(world.finance);
    const treasury = index.get("country", issuerCountry.id, "treasury-cash");
    if (amount > treasury.balanceRUSD + MONEY_TOLERANCE_RUSD) {
        throw new RangeError("debt repayment exceeds available treasury cash");
    }
    const reserve = issuerCountry.fiscal.reserveTargetRUSD;
    if (treasury.balanceRUSD - amount < reserve - MONEY_TOLERANCE_RUSD) {
        throw new RangeError(
            `debt repayment would take treasury cash below the ${String(reserve)} RUSD reserve target`,
        );
    }
}

/** * Repay part or all of one contract's outstanding principal early. The payment * is a financing movement, not expenditure. A fully settled contract is retired; * accrued interest remains payable through the normal month-end/maturity path. */
export function repayGovernmentDebt(world: World, input: DebtRepaymentInput): DebtRepaymentResult {
    validateDebtRepayment(world, input);
    const staged = cloneFinanceState(world.finance);
    const index = buildFinanceIndex(staged);
    const contract = staged.debtContracts.find((candidate) => candidate.id === input.contractId);
    if (contract === undefined)
        throw new RangeError(`unknown debt contract ${String(input.contractId)}`);
    const amount = Math.min(input.amountRUSD, contract.outstandingPrincipalRUSD);
    const principalBefore = contract.outstandingPrincipalRUSD;
    const posting = postJournalEntry(staged, world.dayIndex, "debt-principal-repayment", principalRepaymentEntry(index, contract, amount).lines, contract.issuerCountryId, contract.holderId);
    contract.outstandingPrincipalRUSD -= amount;
    if (contract.outstandingPrincipalRUSD <= toleranceMoney(contract.outstandingPrincipalRUSD)) {
        contract.outstandingPrincipalRUSD = 0;
    }
    accumulateBudgetMemo(staged, contract.issuerCountryId, { principalRepaidRUSD: amount });
    if (
        contract.outstandingPrincipalRUSD <= toleranceMoney(contract.outstandingPrincipalRUSD) &&
        contract.accruedInterestRUSD <= toleranceMoney(contract.accruedInterestRUSD)
    ) {
        contract.outstandingPrincipalRUSD = 0;
        contract.accruedInterestRUSD = 0;
        contract.status = "repaid";
        contract.arrearsSinceDay = null;
        recordRetiredContract(staged, contract, principalBefore, 0);
    }
    assertValidFinanceState(staged);
    assertAccountingIdentity(staged);
    const candidate: World = {
        ...world, finance: staged
    };
    assertValidWorld(candidate);
    world.finance = staged;
    return {
        contract: { ...contract },
        principalPaidRUSD: amount,
        postingIds: [posting.id],
    };
}

/** M5b phase result for one contract. */
export interface DebtContractResult {
    readonly contractId: Id;
    readonly issuerCountryId: Id;
    readonly holderKind: "country" | "popBlock";
    readonly holderId: Id;
    readonly interestAccruedRUSD: number;
    readonly interestPaidRUSD: number;
    readonly principalPaidRUSD: number;
    readonly debtIssuedRUSD: number;
    readonly refinancedContractId: Id | null;
    readonly status: DebtContract["status"];
    readonly outstandingPrincipalRUSD: number;
}

/** M5b month-end/daily debt phase result. */
export interface DebtPhaseResult {
    readonly ran: boolean;
    readonly dayIndex: DayIndex;
    readonly contracts: readonly DebtContractResult[];
    readonly interestAccruedRUSD: number;
    readonly interestPaidRUSD: number;
    readonly principalRepaidRUSD: number;
    readonly debtIssuedForDeficitRUSD: number;
    /** Month-to-date budget/interest gap not covered by treasury liquidity. */
    readonly financingRequirementRUSD: number;
    readonly unfinancedDeficitRUSD: number;
    readonly principalWrittenOffRUSD: number;
    readonly interestWrittenOffRUSD: number;
}

function emptyDebtResult(dayIndex: DayIndex): DebtPhaseResult {
    return {
        ran: false, dayIndex, contracts: [], interestAccruedRUSD: 0, interestPaidRUSD: 0, principalRepaidRUSD: 0, debtIssuedForDeficitRUSD: 0, financingRequirementRUSD: 0, unfinancedDeficitRUSD: 0, principalWrittenOffRUSD: 0, interestWrittenOffRUSD: 0,
    };
}

function toleranceMoney(...values: number[]): number {
    let scale = 1;
    for (const value of values)
        scale = Math.max(scale, Math.abs(value));
    return MONEY_TOLERANCE_RUSD * scale;
}

function isLastCivilDayOfMonth(dayIndex: DayIndex): boolean {
    const date = dayIndexToCivilDate(dayIndex);
    return date.day === daysInMonth(date.year, date.month);
}

function markArrears(contract: DebtContract, dayIndex: DayIndex): void {
    if (contract.status !== "arrears") {
        contract.status = "arrears";
        contract.arrearsSinceDay = dayIndex;
    }
}

function countryFinancingRequirement(
    finance: FinanceState,
    index: FinanceIndex,
    countryId: Id,
): number {
    const incomeTax = index.get("country", countryId, "income-tax-revenue").balanceRUSD;
    const businessTax = index.get("country", countryId, "business-tax-revenue").balanceRUSD;
    const requestedWelfare = readBudgetMemo(finance, countryId).welfareRequestedRUSD;
    const interest = index.get("country", countryId, "interest-expense").balanceRUSD;
    const treasuryCash = index.get("country", countryId, "treasury-cash").balanceRUSD;
    // The memo includes welfare paid and unpaid. Subtracting actual treasury
    // liquidity means a country with cash (including prior state-enterprise
    // remittances) does not borrow solely because the accounting formula is
    // narrower than its cash position. Unpaid welfare remains an unmet budget,
    // not a liability, and borrowing never posts back-pay. E2: every collected
    // tax instrument (personal and business) reduces the requirement equally.
    return Math.max(0, requestedWelfare + interest - incomeTax - businessTax - treasuryCash);
}

function accrueInterest(staged: FinanceState, index: FinanceIndex, contract: DebtContract, dayIndex: DayIndex): number {
    if (contract.status !== "active" && contract.status !== "arrears")
        return 0;
    if (contract.outstandingPrincipalRUSD <= 0 || contract.annualCouponRate <= 0)
        return 0;
    if (contract.issueDay >= dayIndex)
        return 0;
    const year = dayIndexToCivilDate(dayIndex).year;
    const amount = (contract.outstandingPrincipalRUSD * contract.annualCouponRate) / daysInYear(year);
    if (!(amount > 0))
        return 0;
    postJournalEntry(staged, dayIndex, "interest-accrual", interestAccrualEntry(index, contract, amount).lines, contract.issuerCountryId, contract.holderId);
    contract.accruedInterestRUSD += amount;
    return amount;
}

function payAccruedInterest(staged: FinanceState, index: FinanceIndex, contract: DebtContract, dayIndex: DayIndex): number {
    if (contract.accruedInterestRUSD <= 0)
        return 0;
    const treasury = index.get("country", contract.issuerCountryId, "treasury-cash");
    const payable = index.get("country", contract.issuerCountryId, "interest-payable");
    // Contract-level accrued interest and the posting account can differ by a
    // floating residual; never debit more payable than actually exists.
    const amount = Math.min(contract.accruedInterestRUSD, payable.balanceRUSD, treasury.balanceRUSD);
    if (!(amount > 0))
        return 0;
    postJournalEntry(staged, dayIndex, "interest-payment", interestPaymentEntry(index, contract, amount).lines, contract.issuerCountryId, contract.holderId);
    contract.accruedInterestRUSD -= amount;
    if (contract.accruedInterestRUSD <= toleranceMoney(contract.accruedInterestRUSD)) {
        contract.accruedInterestRUSD = 0;
    }
    accumulateBudgetMemo(staged, contract.issuerCountryId, { interestPaidRUSD: amount });
    return amount;
}

function repayPrincipal(staged: FinanceState, index: FinanceIndex, contract: DebtContract, dayIndex: DayIndex, amount: number): number {
    if (!(amount > 0))
        return 0;
    postJournalEntry(staged, dayIndex, "debt-principal-repayment", principalRepaymentEntry(index, contract, amount).lines, contract.issuerCountryId, contract.holderId);
    contract.outstandingPrincipalRUSD -= amount;
    if (contract.outstandingPrincipalRUSD <= toleranceMoney(contract.outstandingPrincipalRUSD)) {
        contract.outstandingPrincipalRUSD = 0;
    }
    accumulateBudgetMemo(staged, contract.issuerCountryId, { principalRepaidRUSD: amount });
    return amount;
}

function refinanceContract(staged: FinanceState, index: FinanceIndex, contract: DebtContract, dayIndex: DayIndex, issuerCountry: Country): Id | null {
    if (!issuerCountry.debt.enabled || !issuerCountry.debt.refinanceOnMaturity)
        return null;
    if (contract.accruedInterestRUSD > 0)
        return null;
    const principal = contract.outstandingPrincipalRUSD;
    if (!(principal > 0))
        return null;
    const current = debtOutstandingPrincipal(staged.debtContracts, issuerCountry.id);
    const after = current - principal + principal;
    if (after > issuerCountry.debt.maxOutstandingPrincipalRUSD + MONEY_TOLERANCE_RUSD)
        return null;
    const replacement = newContract(staged, issuerCountry.id, contract.holderKind, contract.holderId, principal, issuerCountry.debt.annualCouponRate, dayIndex, issuerCountry.debt.termDays);
    const entries = [issuanceEntry(index, replacement), principalRepaymentEntry(index, contract, principal),];
    postJournalBatch(staged, dayIndex, entries);
    appendContract(staged, replacement);
    accumulateBudgetMemo(staged, issuerCountry.id, {
        debtIssuedRUSD: replacement.principalRUSD,
        principalRepaidRUSD: principal,
    });
    const principalBefore = contract.outstandingPrincipalRUSD;
    contract.outstandingPrincipalRUSD = 0;
    contract.status = "repaid";
    contract.arrearsSinceDay = null;
    recordRetiredContract(staged, contract, principalBefore, contract.accruedInterestRUSD);
    return replacement.id;
}

function defaultContract(staged: FinanceState, index: FinanceIndex, contract: DebtContract, dayIndex: DayIndex): {
    principal: number;
    interest: number;
} {
    const issuer = issuerAccounts(index, contract.issuerCountryId);
    const holder = holderAccounts(index, contract.holderKind, contract.holderId);
    const principal = Math.min(
        contract.outstandingPrincipalRUSD,
        issuer.liability.balanceRUSD,
        holder.bond.balanceRUSD,
    );
    const interest = Math.min(
        contract.accruedInterestRUSD,
        issuer.payable.balanceRUSD,
        holder.receivable.balanceRUSD,
    );
    const entry = defaultWriteoffEntry(index, contract);
    if (entry !== null)
        postJournalEntry(staged, dayIndex, "debt-default-writeoff", entry.lines, contract.issuerCountryId, contract.holderId);
    contract.outstandingPrincipalRUSD = 0;
    contract.accruedInterestRUSD = 0;
    contract.status = "defaulted";
    contract.arrearsSinceDay = null;
    recordRetiredContract(staged, contract, principal, interest);
    return {
        principal, interest
    };
}

/** * Run the daily debt phase. Interest accrues daily; coupon interest is paid at * month-end; principal maturities are processed on their contract date. When the * policy is enabled, a month-end deficit is financed up to the designated * creditor's cash and the issuer's outstanding-principal ceiling. */
export function runDebtPhase(world: World, dayIndex: DayIndex, options: PhaseValidationOptions = {}): DebtPhaseResult {
    assertValidDayIndex(dayIndex);
    if (isTerminalDayIndex(dayIndex)) {
        throw new RangeError("debt phase cannot run at the terminal boundary");
    }
    if (dayIndex !== world.dayIndex)
        throw new RangeError("debt phase day must match the world's next day");
    if (world.finance.debtContracts.length === 0 && !world.countries.some((country) => country.debt.enabled)) {
        return emptyDebtResult(dayIndex);
    }
    if (options.validateWorld !== false) assertValidFinanceState(world.finance);
    const openingCash = designatedCashTotal(world.finance);
    // D-137: in place inside the integrated day, staged for direct callers.
    const staged = phaseFinance(world.finance, options.financeInPlace);
    const index = buildFinanceIndex(staged);
    const monthEnd = isLastCivilDayOfMonth(dayIndex);
    const results = new Map<Id, DebtContractResult>();
    let interestAccrued = 0;
    let interestPaid = 0;
    let principalRepaid = 0;
    let debtIssued = 0;
    let financingRequirement = 0;
    let unfinanced = 0;
    let principalWrittenOff = 0;
    let interestWrittenOff = 0;
    const record = (contract: DebtContract, patch: Partial<DebtContractResult>): void => {
        const previous = results.get(contract.id);
        results.set(contract.id, {
            contractId: contract.id, issuerCountryId: contract.issuerCountryId, holderKind: contract.holderKind, holderId: contract.holderId, interestAccruedRUSD: previous?.interestAccruedRUSD ?? 0, interestPaidRUSD: previous?.interestPaidRUSD ?? 0, principalPaidRUSD: previous?.principalPaidRUSD ?? 0, debtIssuedRUSD: previous?.debtIssuedRUSD ?? 0, refinancedContractId: previous?.refinancedContractId ?? null, outstandingPrincipalRUSD: contract.outstandingPrincipalRUSD, status: contract.status, ...patch,
        });
    };
    for (const contract of [...staged.debtContracts].sort((left, right) => left.id - right.id)) {
        const accrued = accrueInterest(staged, index, contract, dayIndex);
        if (accrued > 0) {
            interestAccrued += accrued;
            record(contract, {
                interestAccruedRUSD: accrued
            });
        }
    }
    if (monthEnd) {
        for (const country of [...world.countries].sort((left, right) => left.id - right.id)) {
            const policy = country.debt;
            if (!policy.enabled)
                continue;
            const requirement = countryFinancingRequirement(staged, index, country.id);
            financingRequirement += requirement;
            if (!(requirement > 0))
                continue;
            assertIssuerAndHolder(world, policy, country);
            if (activeDebtContractCount(staged.debtContracts) >= MAX_ACTIVE_DEBT_CONTRACTS) {
                unfinanced += requirement;
                accumulateBudgetMemo(staged, country.id, { unfinancedRequirementRUSD: requirement });
                continue;
            }
            const holder = holderAccounts(index, policy.creditorKind, policy.creditorId);
            const headroom = policy.maxOutstandingPrincipalRUSD - debtOutstandingPrincipal(staged.debtContracts, country.id);
            const amount = Math.min(requirement, holder.cash.balanceRUSD, headroom);
            if (!(amount > 0)) {
                unfinanced += requirement;
                accumulateBudgetMemo(staged, country.id, { unfinancedRequirementRUSD: requirement });
                continue;
            }
            const contract = newContract(staged, country.id, policy.creditorKind, policy.creditorId, amount, policy.annualCouponRate, dayIndex, policy.termDays);
            postJournalEntry(staged, dayIndex, "debt-issuance", issuanceEntry(index, contract).lines, country.id, policy.creditorId);
            appendContract(staged, contract);
            debtIssued += amount;
            unfinanced += Math.max(0, requirement - amount);
            accumulateBudgetMemo(staged, country.id, {
                debtIssuedRUSD: amount,
                unfinancedRequirementRUSD: Math.max(0, requirement - amount),
            });
            record(contract, {
                debtIssuedRUSD: amount
            });
        }
        for (const contract of [...staged.debtContracts].sort((left, right) => left.id - right.id)) {
            if (contract.status !== "active" && contract.status !== "arrears")
                continue;
            const paid = payAccruedInterest(staged, index, contract, dayIndex);
            if (paid > 0) {
                interestPaid += paid;
                record(contract, {
                    interestPaidRUSD: paid
                });
            }
            if (contract.accruedInterestRUSD > toleranceMoney(contract.accruedInterestRUSD)) {
                markArrears(contract, dayIndex);
            }
            else if (contract.status === "arrears" && contract.maturityDay > dayIndex) {
                contract.status = "active";
                contract.arrearsSinceDay = null;
            }
            record(contract, {
                status: contract.status
            });
        }
    }
    for (const contract of [...staged.debtContracts].sort((left, right) => left.id - right.id)) {
        if (contract.maturityDay > dayIndex)
            continue;
        if (contract.status === "repaid" || contract.status === "defaulted")
            continue;
        if (contract.outstandingPrincipalRUSD <= 0) {
            if (contract.accruedInterestRUSD > 0) {
                const paid = payAccruedInterest(staged, index, contract, dayIndex);
                if (paid > 0) {
                    interestPaid += paid;
                    record(contract, { interestPaidRUSD: paid });
                }
            }
            if (contract.accruedInterestRUSD > toleranceMoney(contract.accruedInterestRUSD)) {
                markArrears(contract, dayIndex);
            }
            else {
                contract.status = "repaid";
                contract.arrearsSinceDay = null;
                recordRetiredContract(staged, contract, 0, 0);
            }
            record(contract, {
                status: contract.status
            });
            continue;
        }
        if (contract.accruedInterestRUSD > 0) {
            const paid = payAccruedInterest(staged, index, contract, dayIndex);
            if (paid > 0) {
                interestPaid += paid;
                record(contract, {
                    interestPaidRUSD: paid
                });
            }
        }
        if (contract.accruedInterestRUSD > toleranceMoney(contract.accruedInterestRUSD)) {
            markArrears(contract, dayIndex);
            record(contract, {
                status: contract.status
            });
            continue;
        }
        const issuerCountry = world.countries.find((country) => country.id === contract.issuerCountryId);
        if (issuerCountry === undefined)
            throw new RangeError(`unknown debt issuer ${String(contract.issuerCountryId)}`);
        const replacementId = refinanceContract(staged, index, contract, dayIndex, issuerCountry);
        if (replacementId !== null) {
            const replacement = staged.debtContracts.find((candidate) => candidate.id === replacementId);
            if (replacement !== undefined)
                record(replacement, {
                    debtIssuedRUSD: replacement.principalRUSD
                });
            record(contract, {
                refinancedContractId: replacementId, status: contract.status
            });
            continue;
        }
        const principalBefore = contract.outstandingPrincipalRUSD;
        const treasury = index.get("country", contract.issuerCountryId, "treasury-cash");
        const pay = Math.min(contract.outstandingPrincipalRUSD, treasury.balanceRUSD);
        if (pay > 0) {
            const paid = repayPrincipal(staged, index, contract, dayIndex, pay);
            principalRepaid += paid;
            record(contract, {
                principalPaidRUSD: paid
            });
        }
        if (contract.outstandingPrincipalRUSD > toleranceMoney(contract.outstandingPrincipalRUSD)) {
            markArrears(contract, dayIndex);
        }
        else {
            contract.outstandingPrincipalRUSD = 0;
            contract.status = "repaid";
            contract.arrearsSinceDay = null;
            recordRetiredContract(staged, contract, principalBefore, 0);
        }
        record(contract, {
            status: contract.status, outstandingPrincipalRUSD: contract.outstandingPrincipalRUSD
        });
    }
    for (const contract of [...staged.debtContracts].sort((left, right) => left.id - right.id)) {
        if (contract.status !== "arrears" || contract.arrearsSinceDay === null)
            continue;
        const country = world.countries.find((candidate) => candidate.id === contract.issuerCountryId);
        if (country === undefined)
            continue;
        if (dayIndex - contract.arrearsSinceDay < country.debt.arrearsGraceDays)
            continue;
        const written = defaultContract(staged, index, contract, dayIndex);
        principalWrittenOff += written.principal;
        interestWrittenOff += written.interest;
        record(contract, {
            status: contract.status, outstandingPrincipalRUSD: 0, interestAccruedRUSD: 0,
        });
    }
    compactDebtContracts(staged);
    if (options.validateWorld !== false) assertValidFinanceState(staged);
    assertAccountingIdentity(staged);
    const closingCash = designatedCashTotal(staged);
    if (Math.abs(openingCash - closingCash) > toleranceMoney(openingCash, closingCash)) {
        throw new RangeError("debt phase did not conserve aggregate designated cash");
    }
    const candidate: World = {
        ...world, finance: staged
    };
    if (options.validateWorld !== false) assertValidWorldForTick(candidate);
    world.finance = staged;
    const contracts = [...results.values()].sort((left, right) => left.contractId - right.contractId);
    return {
        ran: true, dayIndex, contracts, interestAccruedRUSD: interestAccrued, interestPaidRUSD: interestPaid, principalRepaidRUSD: principalRepaid, debtIssuedForDeficitRUSD: debtIssued, financingRequirementRUSD: financingRequirement, unfinancedDeficitRUSD: unfinanced, principalWrittenOffRUSD: principalWrittenOff, interestWrittenOffRUSD: interestWrittenOff,
    };
}


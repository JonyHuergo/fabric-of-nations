/** M3 economy constants. Content parameters live in data; code-level rule constants are documented here. */

/** Maximum number of recent journal postings retained for diagnostics. */
export const MAX_AUDIT_POSTINGS = 256;

/**
 * Maximum number of monthly finance summaries for the 100-year campaign.
 *
 * Derivation: 100 calendar years × 12 Gregorian months = 1200 closed periods.
 * The first period may be partial; the terminal 2000-01-01 boundary is never
 * closed, so 1200 is a hard upper bound rather than an expected count.
 */
export const MAX_PERIOD_SUMMARIES = 1200;

/**
 * Number of most recent monthly summaries that retain the full pre-close trial
 * balance. Older summaries retain period dates, the four gross flow totals, and
 * per-country fiscal totals, but not the account-level trial balance (D-065).
 * P5 (D-143 §6): one. Every summary carries the per-country closing balances the
 * Ledger history reads, and only the latest close is read account by account (profit
 * allocation, AI); each detailed month added about 0.6 M stored characters, so twelve
 * pushed web saves past the browser storage quota.
 */
export const MAX_DETAILED_PERIOD_SUMMARIES = 1;

/**
 * Maximum annual summaries retained. Derivation: 1900..1999 inclusive = 100
 * campaign years. The first year may be partial; 2000-01-01 is terminal and is
 * never closed as a year.
 */
export const MAX_ANNUAL_SUMMARIES = 100;

/** Maximum controlled correction records retained for audit. */
export const MAX_FINANCE_CORRECTIONS = 64;

/** Maximum accepted correction reason length. */
export const MAX_CORRECTION_REASON_LENGTH = 500;

/** M3 excludes non-storable service output; services are deferred. */
export const M3_DEFERRED_GOOD_KEYS = ["services"] as const;

/**
 * M4c/E2 fiscal numeric-safety bounds. These are validation limits, not
 * calibrated economics: a tax rate is dimensionless in [0, 1], a budget,
 * exemption, or reserve target is a finite nominal RUSD amount below the
 * documented safe bound, and the welfare wealth ceiling is a population wealth
 * level (0..99, where 99 covers every block and is therefore universal).
 */
export const MIN_FISCAL_TAX_RATE = 0;
export const MAX_FISCAL_TAX_RATE = 1;
export const MAX_FISCAL_BUDGET_RUSD_PER_YEAR = 1e15;

/** Highest population wealth level; mirrors `WEALTH_MAX` (0..99). */
export const MAX_WELFARE_WEALTH_LEVEL = 99;

/**
 * E2 provisional fiscal-policy defaults. The shipped historical scenario declares
 * only the M4c rate and welfare budget, so every E2 instrument starts neutral:
 * no income-tax exemption, universal welfare eligibility, no business-profit tax,
 * and no treasury reserve floor. A neutral policy preserves the accepted M4c/M5b
 * behavior exactly; the player changes these through validated actions.
 */
export const DEFAULT_INCOME_TAX_ALLOWANCE_RUSD_PER_YEAR = 0;
export const DEFAULT_WELFARE_MAX_WEALTH_LEVEL = MAX_WELFARE_WEALTH_LEVEL;
export const DEFAULT_BUSINESS_PROFIT_TAX_RATE = 0;
export const DEFAULT_RESERVE_TARGET_RUSD = 0;

/**
 * M3d provisional bounded price-update coefficients, not calibrated.
 * imbalance = (funded demand - sellable supply) / max(demand, supply, epsilon).
 * daily change = clamp(kappa * imbalance, -maxDailyChange, +maxDailyChange).
 * Price is clamped to [base*minRatio, base*maxRatio].
 */
export const M3_PRICE_KAPPA = 0.1;
export const M3_PRICE_MAX_DAILY_CHANGE = 0.05;
export const M3_PRICE_EPSILON = 1e-9;
export const M3_PRICE_MIN_RATIO = 0.25;
export const M3_PRICE_MAX_RATIO = 4;

/**
 * M5 migration pressure coefficients. PROVISIONAL, not calibrated.
 *
 * Monthly pressure for one source->destination pair is
 * `vacancyWeight * vacancyRate + wealthWeight * wealthGap`, where vacancyRate is
 * unfilled job slots divided by eligible provincial workforce (0..1) and
 * wealthGap is (destination wealth - source wealth) / 100. The weights sum to 1.
 * The monthly migrant fraction of the source population is
 * `clamp(pressure * ratePerPressure, 0, maxFraction)`.
 */
export const MIGRATION_VACANCY_WEIGHT = 0.7;
export const MIGRATION_WEALTH_WEIGHT = 0.3;

/** Fraction of source population that moves per month at pressure 1. PROVISIONAL. */
export const MIGRATION_RATE_PER_PRESSURE = 0.01;

/** Hard monthly cap on the fraction of a source block that may migrate. PROVISIONAL. */
export const MIGRATION_MONTHLY_MAX_FRACTION = 0.01;

/**
 * Provisional absorption/friction cap: a destination province may receive at most
 * this fraction of its own starting-of-month population in one month. This
 * stands in for the transport/housing constraints the GDD describes until those
 * systems exist. PROVISIONAL.
 */
export const MIGRATION_MONTHLY_INFLOW_CAP_FRACTION = 0.01;

/**
 * E6a trade and transport constants. PROVISIONAL structural limits, not calibration.
 *
 * Route capacity, freight, and transit time are derived from authored route data and
 * existing infrastructure; these constants only bound the derived rules and the
 * persisted state.
 */

/**
 * Hard cap on in-transit consignments retained in authoritative state. E6a sized it at
 * 512 for eight goods; P5b (D-148) trades about 45 goods, and at 512 the 1900 world hit
 * the cap within days (every later consignment was refused as "capacity"), so the
 * bound is scaled by eight to 4,096. Structural limit (state size), provisional.
 */
export const MAX_TRADE_SHIPMENTS = 4096;

/** Hard cap on the per-day blocked-shipment diagnostics retained for explanation. */
export const MAX_TRADE_BLOCKED_DIAGNOSTICS = 64;

/**
 * Minimum expected margin over landed cost before a shipment is dispatched. It
 * covers the model's unrepresented commercial risk and stops zero-profit churn.
 * PROVISIONAL.
 */
export const TRADE_MIN_MARGIN_RATE = 0.05;

/** Ad-valorem tariff bounds; a rate is dimensionless in [0, 1]. */
export const MIN_TRADE_TARIFF_RATE = 0;
export const MAX_TRADE_TARIFF_RATE = 1;

/** Neutral per-country trade policy: free trade, no quota, no export restriction. */
export const DEFAULT_TRADE_TARIFF_RATE = 0;

/** Numeric-safety bound for a monthly physical import quota, in good units. */
export const MAX_TRADE_QUOTA_QUANTITY = 1e15;

/** Bounds for authored route content. Distances and capacities must be positive. */
export const MIN_TRADE_ROUTE_DISTANCE = 0.1;
export const MAX_TRADE_ROUTE_DISTANCE = 100;
export const MAX_TRADE_ROUTE_CAPACITY_RUSD_PER_DAY = 1e12;

/**
 * Trade uses only direct authored market pairs, so the route count is bounded by the
 * market-pair count. This guard keeps a malformed scenario from creating an
 * unbounded persisted array.
 */
export const MAX_TRADE_ROUTES = 10_000;

/**
 * E6b price index. The index is a Laspeyres measure over a fixed needs-derived basket,
 * normalized to 100 at the scenario's first processed day. Only month-end observations
 * are stored, bounded to this many; current values are derived (D-080).
 */
export const MAX_PRICE_INDEX_OBSERVATIONS = 24;

/**
 * E6b managed exchange-rate rule. PROVISIONAL structural parameters, not calibrated.
 *
 * `dailyChange = clamp(FX_KAPPA × (FX_TRADE_WEIGHT × tradePressure +
 * FX_PRICE_WEIGHT × priceGap), ±FX_MAX_DAILY_CHANGE)`, where tradePressure is the
 * realized net external position over turnover in [-1, 1] and priceGap is
 * `worldIndex / countryIndex − 1`. The valuation is bounded to
 * [FX_MIN_RATIO, FX_MAX_RATIO] × the declared parity.
 */
export const FX_KAPPA = 0.05;
export const FX_TRADE_WEIGHT = 0.6;
export const FX_PRICE_WEIGHT = 0.4;
export const FX_MAX_DAILY_CHANGE = 0.01;
export const FX_MIN_RATIO = 0.5;
export const FX_MAX_RATIO = 2;

/** Maximum relative parity change per policy action (devaluation or revaluation). */
export const FX_MAX_PARITY_STEP = 0.5;

/** Minimum civil days between parity changes, so a parity is a decision, not a jitter. */
export const FX_PARITY_COOLDOWN_DAYS = 180;

/**
 * Convertibility rule: the authority must hold at least this many months of the most
 * recently completed month's realized imports in RUSD reserves. Below it, convertibility
 * is suspended and imports into the country's market are blocked (D-080).
 */
export const FX_MIN_RESERVE_COVER_MONTHS = 0.5;

/**
 * D-140 / D-149 mint window (`mint.ts`). PROVISIONAL, documented values.
 *
 * MINT_CHARGE (fraction of the mint price, dimensionless): the mint buys metal at
 * mint price x (1 - charge). Bank of England buying price for standard gold in 1900:
 * 77s 9d per ounce against the coinage value 77s 10.5d, 0.16 %; rounded to 0.2 %.
 * Provisional: one charge for every mint and both metals.
 */
export const MINT_CHARGE = 0.002;
/**
 * MINT_EXPORT_POINT (fraction of the mint price): the mint sells reserve metal when the
 * metal's price in the issuer's market reaches mint price x (1 + point). The 1900
 * London-New York gold points lay about 0.5 % either side of par (freight, insurance,
 * interest). Provisional: one point for every mint and both metals.
 */
export const MINT_EXPORT_POINT = 0.005;
/**
 * MINT_MAX_DAILY_SALE_SHARE (fraction of the metal reserve per day): the most the mint
 * sells in one day at the export point, so a reserve drains over weeks, not at once.
 * Structural, provisional: 1/30.
 */
export const MINT_MAX_DAILY_SALE_SHARE = 1 / 30;
/**
 * MINT_RESUME_SALE_DAYS (days): a suspended metal currency becomes convertible again
 * when its reserve covers this many days of its last daily sale and the metal's price is
 * back below the export point (plan §13.5). Provisional.
 */
export const MINT_RESUME_SALE_DAYS = 30;

/**
 * P5b (C-12, D-146 A8, D-148) hydro stations. PROVISIONAL, documented values.
 *
 * HYDRO_TECHNICAL_SHARE (dimensionless, share of a province's gross theoretical
 * potential `ProvinceEconomy.hydroPotentialMWhPerYear`): the most of it the province's
 * hydro stations can generate in a year with any technique. Hoes et al. (2017, PLOS ONE
 * 12(2): e0171844, CC BY 4.0) put the gross theoretical world potential at 52 PWh/year and
 * summarise the literature's technical potential as about 8 to 26 PWh/year; the mid-point
 * 17 / 52 = 0.33. Provisional: one share for every province (terrain, storage and
 * distance to load vary).
 */
export const HYDRO_TECHNICAL_SHARE = 0.33;
/**
 * HYDRO_DAYS_PER_YEAR (days per year): the annual potential is a long-term mean flow
 * (1971–2000 naturalised discharge), spread evenly over the mean Gregorian year, so a
 * province's stations generate at most potential x share / 365.2425 MWh a day. Seasonal
 * flow is not modelled. Structural.
 */
export const HYDRO_DAYS_PER_YEAR = 365.2425;

// M10 (D-081). Provisional strategic constants; none is calibrated.
/** Maximum army formations in one world. */
export const MAX_ARMIES = 200;
/** Maximum retained war records (active and ended). */
export const MAX_WARS = 100;
/** Maximum retained diplomatic relation records. */
export const MAX_MILITARY_RELATIONS = 256;
/** Maximum pending peace offers across all wars. */
export const MAX_PEACE_OFFERS = 100;
/** Recruitment signing cost per soldier, paid to the soldiers' province households. */
export const M10_RECRUITMENT_COST_PER_SOLDIER_RUSD = 5;
/** Imported equipment price per equipment unit, paid to the system supplier. */
export const M10_EQUIPMENT_PRICE_RUSD = 20;
/** Soldiers supported by one equipment unit. */
export const M10_SOLDIERS_PER_EQUIPMENT_UNIT = 50;
/** Daily pay per soldier while the formation exists. */
export const M10_SOLDIER_DAILY_PAY_RUSD = 0.05;
/** Daily equipment upkeep per equipment unit. */
export const M10_EQUIPMENT_DAILY_UPKEEP_RUSD = 0.02;
/** Formation delay after recruitment before deployment is allowed. */
export const M10_ARMY_FORMATION_DAYS = 14;
/** Strategic deployment delay to any legal target province. */
export const M10_DEPLOYMENT_DAYS = 10;
/** Days before wounded soldiers return to the roster. */
export const M10_WOUND_RECOVERY_DAYS = 30;
/** Daily garrison procurement per occupying soldier, paid in the occupied province. */
export const M10_OCCUPATION_GARRISON_COST_PER_SOLDIER_RUSD = 0.02;
/** Daily unrest increment in an occupied province. */
export const M10_OCCUPATION_UNREST_PER_DAY = 0.002;
/** Minimum organization when unpaid supply erodes cohesion. */
export const M10_MIN_ORGANIZATION = 0.2;
/** Organization loss per day of unpaid upkeep. */
export const M10_UNPAID_ORGANIZATION_LOSS = 0.01;
/** Supply recovery per fully paid day. */
export const M10_SUPPLY_RECOVERY_PER_DAY = 0.05;
/** Supply loss per unpaid day. */
export const M10_SUPPLY_LOSS_PER_DAY = 0.1;
/** Base daily casualty fraction at parity strength. */
export const M10_BASE_CASUALTY_FRACTION = 0.006;
/** Extra casualty fraction at maximum enemy strength advantage. */
export const M10_CASUALTY_STRENGTH_SCALE = 0.06;
/** Maximum daily casualty fraction. */
export const M10_MAX_CASUALTY_FRACTION = 0.1;
/** Share of battle losses that are deaths. */
export const M10_DEATH_SHARE = 0.4;
/** Share of battle losses that are wounded (return after recovery). */
export const M10_WOUNDED_SHARE = 0.45;
/** Share of battle losses that are captured (permanent removal). */
export const M10_CAPTURED_SHARE = 0.15;
/** Truce duration after a peace. */
export const M10_TRUCE_DAYS = 365;
/** Relation score set when war is declared. */
export const M10_WAR_RELATION_SCORE = -80;
/** Relation score floor after peace. */
export const M10_PEACE_RELATION_SCORE = -30;
/** Minimum war duration before a deterministic AI accepts a white peace. */
export const M10_AI_PEACE_MIN_WAR_DAYS = 120;

/**
 * M5a profit-allocation policy defaults. PROVISIONAL, not calibrated.
 *
 * Legacy M0–M5 scenarios omit the policy and therefore keep it disabled; the M5
 * historical campaign enables it explicitly. `PRIVATE_PAYOUT_RATE` is the
 * fraction of positive retained profit distributed to a private owner each
 * month; `STATE_REMITTANCE_RATE` is the fraction remitted to a country treasury.
 * Both flows are capped by available operating cash and never create money.
 */
export const DEFAULT_PRIVATE_PAYOUT_RATE = 0.5;
export const DEFAULT_STATE_REMITTANCE_RATE = 1;
export const DEFAULT_PROFIT_DISTRIBUTION_ENABLED = false;

/** Numeric-safety bounds for M5a policy rates. */
export const MIN_PROFIT_ALLOCATION_RATE = 0;
export const MAX_PROFIT_ALLOCATION_RATE = 1;

/**
 * M5b public-debt defaults and numeric-safety bounds. PROVISIONAL.
 *
 * Disabled for legacy fixtures. A disabled policy still permits servicing any
 * existing contracts but never originates new debt.
 */
export const DEFAULT_DEBT_POLICY: Readonly<{
  enabled: boolean;
  creditorKind: "country" | "popBlock";
  creditorId: number;
  annualCouponRate: number;
  termDays: number;
  maxOutstandingPrincipalRUSD: number;
  refinanceOnMaturity: boolean;
  arrearsGraceDays: number;
}> = {
  enabled: false,
  creditorKind: "country",
  creditorId: 0,
  annualCouponRate: 0.03,
  termDays: 1825,
  maxOutstandingPrincipalRUSD: 0,
  refinanceOnMaturity: false,
  arrearsGraceDays: 90,
};

export const MIN_DEBT_COUPON_RATE = 0;
export const MAX_DEBT_COUPON_RATE = 1;
export const MIN_DEBT_TERM_DAYS = 1;
export const MAX_DEBT_TERM_DAYS = 36_500;
export const MAX_DEBT_ARREARS_GRACE_DAYS = 3_650;
export const MAX_DEBT_PRINCIPAL_RUSD = 1e15;

/** Hard cap on simultaneously active/arrears debt contracts. */
export const MAX_ACTIVE_DEBT_CONTRACTS = 64;

/** Number of most recent terminated contracts retained for detailed history. */
export const MAX_RETAINED_TERMINATED_DEBT_CONTRACTS = 32;

/** One aggregate per issuer is expected; this is a defensive storage cap. */
export const MAX_DEBT_HISTORY_AGGREGATES = 256;

/**
 * E3 construction bounds. These are structural safety limits, not tuning.
 *
 * - At most 32 non-terminal construction projects exist at once.
 * - The newest 32 completed/cancelled project records are retained in detail.
 * - Older terminated records are aggregated per country (defensive cap 256).
 * - A completed building is endowed with 30 days of its definition's daily
 *   upkeep as working capital, limited by actual treasury cash. This is
 *   provisional structural content, not calibration.
 */
export const MAX_ACTIVE_CONSTRUCTION_PROJECTS = 32;
export const MAX_RETAINED_TERMINATED_CONSTRUCTION_PROJECTS = 32;
export const MAX_CONSTRUCTION_HISTORY_AGGREGATES = 256;
export const CONSTRUCTION_WORKING_CAPITAL_DAYS = 30;

/**
 * E4 numeric-safety bound for one discretionary public-enterprise capital
 * contribution. This is a structural bound, not a budget target or calibrated
 * policy value; actual affordability remains the country treasury cash balance.
 * P2b (D-136): raised from 1e9 to the general budget bound, because 1900 treasuries
 * reach several billion RUSD and the app offers up to the whole treasury.
 */
export const MAX_PUBLIC_ENTERPRISE_SUPPORT_RUSD = MAX_FISCAL_BUDGET_RUSD_PER_YEAR;

/**
 * M6 country-AI v1 constants. PROVISIONAL policy rules, not calibrated
 * economics. Every rule is deterministic and uses only own-country or public
 * state.
 *
 * Evaluation cadence: each country evaluates at the start of a day every
 * `AI_EVALUATION_PERIOD_DAYS` days. The first evaluation is the first day after
 * the scenario start whose absolute day index is congruent to the stable country
 * id, so all eight sample countries spread across the week.
 *
 * Fiscal targets:
 * - `AI_TREASURY_BUFFER_MONTHS` is the treasury-cash reserve target measured in
 *   months of observed annual outlays (welfare budget plus interest expense).
 * - `AI_WELFARE_REVENUE_SHARE` is the share of annualized income-tax revenue the
 *   AI is willing to commit to welfare. Treasury reserves are a solvency buffer,
 *   not an ongoing spending target in v1; this keeps the welfare target stable
 *   once revenue is observed instead of chasing a growing surplus.
 * - `AI_HARDSHIP_SUBSISTENCE_DAYS` is the consecutive-unmet-subsistence run that
 *   marks a population block as in hardship.
 * - `AI_HARDSHIP_POPULATION_SHARE` is the population share in hardship that
 *   triggers the relief goal.
 * - `AI_UNREST_MILITANCY_THRESHOLD` is the population-weighted militancy level
 *   that triggers the relief goal even when the population share is lower.
 * - `AI_HARDSHIP_MIN_TAX_RATE` is the provisional minimum income-tax rate used
 *   to fund relief; `AI_MAX_TAX_RATE` is the AI's provisional self-imposed cap
 *   (below the hard fiscal validation bound); `AI_TAX_STEP` is the per-evaluation
 *   increase while solvency pressure persists.
 * - `AI_POLICY_RATE_EPSILON` and `AI_POLICY_MONEY_EPSILON` suppress actions that
 *   would only rewrite the policy with floating-point noise.
 * - `AI_WELFARE_ADJUSTMENT_RELATIVE_THRESHOLD` is the minimum relative change in
 *   the welfare target that justifies a new action. It prevents weekly
 *   month-to-month revenue noise from producing an action every evaluation while
 *   still tracking sustained changes.
 */
export const AI_EVALUATION_PERIOD_DAYS = 7;
export const AI_TREASURY_BUFFER_MONTHS = 6;
export const AI_WELFARE_REVENUE_SHARE = 0.25;
export const AI_HARDSHIP_SUBSISTENCE_DAYS = 7;
export const AI_HARDSHIP_POPULATION_SHARE = 0.05;
export const AI_UNREST_MILITANCY_THRESHOLD = 0.15;
export const AI_HARDSHIP_MIN_TAX_RATE = 0.05;
export const AI_MAX_TAX_RATE = 0.25;
export const AI_TAX_STEP = 0.01;
export const AI_POLICY_RATE_EPSILON = 1e-9;
export const AI_POLICY_MONEY_EPSILON = 0.01;
export const AI_WELFARE_ADJUSTMENT_RELATIVE_THRESHOLD = 0.1;
export const AI_TAX_RATE_DECIMALS = 6;
export const AI_MONEY_DECIMALS = 2;
export const MAX_AI_ACTION_SUMMARY_LENGTH = 500;
export const DEFAULT_COUNTRY_AI_ENABLED = false;

/**
 * M8 political-institution constants. PROVISIONAL structural rules and
 * coefficients, not historical calibration. All rates are dimensionless 0..1 or
 * documented RUSD amounts; no value is a spendable political pool.
 */
export const MAX_LAW_TRANSITIONS_PER_COUNTRY = 4;
export const MAX_SCRIPTED_EVENTS = 256;
export const MAX_POLITICS_LOG_ENTRIES = 64;
export const MAX_LAW_SUMMARY_LENGTH = 500;
export const MIN_LAW_ENACTMENT_DAYS = 1;
export const MAX_LAW_ENACTMENT_DAYS = 20 * 365;

/** Influence-weighted support required to begin a law transition, -1..1 scale. */
export const LAW_SUPPORT_THRESHOLD = 0.05;

/**
 * Extra weight on the governing group's own stance when computing law support.
 * This is what makes an election outcome affect policy choices: a law favoured by
 * the governing group is easier to pass and one it opposes is harder, without
 * creating a spendable political resource. Provisional.
 */
export const GOVERNING_GROUP_SUPPORT_WEIGHT = 0.3;

/** Minimum institution quality for an election; below it the election is skipped. */
export const ELECTION_MIN_INSTITUTION_QUALITY = 0.25;

/** Voting age used by the male/universal franchise criteria. */
export const SUFFRAGE_MIN_AGE = 21;

/**
 * Provisional monthly administration-funding benchmark per person per year. The
 * funding-adequacy ratio is `fundedAnnual / (population * benchmark)`, clamped to
 * 1. This is a structural normaliser, not a claim about historical budgets.
 */
export const ADMIN_FUNDING_PER_CAPITA_PER_YEAR_RUSD = 0.002;

/**
 * Provisional target share of clerks in the population. The staffing ratio is
 * `clerkShare / targetShare`, clamped to 1. Not calibrated.
 */
export const ADMIN_TARGET_CLERK_SHARE = 0.2;

/** Institution-quality component weights; documented in D-076 and must sum to 1. */
export const INSTITUTION_STAFFING_WEIGHT = 0.35;
export const INSTITUTION_FUNDING_WEIGHT = 0.2;
export const INSTITUTION_LITERACY_WEIGHT = 0.15;
export const INSTITUTION_INFRASTRUCTURE_WEIGHT = 0.15;
export const INSTITUTION_LAW_WEIGHT = 0.15;

/** Daily disruption penalty decay: quality penalty multiplier until the end day. */
export const INSTITUTION_DISRUPTION_QUALITY_PENALTY = 0.2;

/**
 * Quality penalty from the previous month's unpaid administration request. The
 * memo is read before the new month's reset, so actual cash constraints affect
 * institutional quality rather than only being reported.
 */
export const INSTITUTION_FUNDING_SHORTFALL_PENALTY = 0.1;

/** Derived-effect coefficients (D-076). */
export const TAX_COLLECTION_BASE_EFFICIENCY = 0.6;
export const TAX_COLLECTION_QUALITY_WEIGHT = 0.4;
export const TAX_COLLECTION_OVERLOAD_PENALTY = 0.2;
export const TAX_COLLECTION_MIN_EFFICIENCY = 0.4;
export const CONSTRUCTION_OVERLOAD_PENALTY = 0.3;
export const CONSTRUCTION_QUALITY_PENALTY = 0.2;
export const CONSTRUCTION_MIN_FACTOR = 0.4;
export const STRIKE_OUTPUT_FACTOR = 0.5;
export const STRIKE_UNREST_THRESHOLD = 0.6;

/** Unrest smoothing and pressure coefficients (D-076). */
export const UNREST_DAILY_SMOOTHING = 0.1;
export const UNREST_MILITANCY_WEIGHT = 0.5;
export const UNREST_UNMET_WEIGHT = 0.3;
export const UNREST_UNEMPLOYMENT_WEIGHT = 0.15;
export const UNREST_OVERLOAD_WEIGHT = 0.3;
export const UNREST_INSTITUTION_RELIEF = 0.2;
export const UNREST_GRIEVANCE_WEIGHT = 0.5;

/** Country crisis-pressure weights (documented in D-076; must sum to 1). */
export const CRISIS_MILITANCY_WEIGHT = 0.35;
export const CRISIS_UNREST_WEIGHT = 0.25;
export const CRISIS_UNMET_WEIGHT = 0.2;
export const CRISIS_EXCLUSION_WEIGHT = 0.15;
export const CRISIS_OVERLOAD_WEIGHT = 0.05;
export const CRISIS_PRESSURE_THRESHOLD = 0.55;
export const CRISIS_PRESSURE_DECAY = 2;
export const CRISIS_UNREST_DAYS = 30;
export const CRISIS_STRIKE_DAYS = 90;
export const CRISIS_CRISIS_DAYS = 180;
export const CRISIS_REVOLUTION_DAYS = 360;
export const CRISIS_REVOLUTION_COOLDOWN_DAYS = 5 * 365;
export const CRISIS_DISRUPTION_DAYS = 365;

/** Election result rounding. */
export const POLITICS_RATE_DECIMALS = 6;
export const MAX_ELECTION_TERM_YEARS = 12;
export const MIN_ELECTION_TERM_YEARS = 1;
export const MAX_LAW_OPTIONS_PER_SLOT = 16;
export const MAX_SCRIPTED_EVENT_EFFECTS = 8;
export const MAX_INTEREST_GROUP_PROFESSION_WEIGHTS = 64;

/**
 * M9 technology/education constants. PROVISIONAL structural rules, normalisers,
 * and coefficients, not historical calibration (D-077). Research work is measured
 * in researcher-days; education rates are dimensionless. All RUSD values are
 * nominal and use the same synthetic fiscal scale as the other policy normalisers.
 */

/** Defensive upper bound on authored technology definitions. */
export const MAX_TECHNOLOGY_DEFINITIONS = 256;
/** Defensive upper bound on one technology's required researcher-days. */
export const MAX_TECHNOLOGY_RESEARCH_WORK = 1e12;
/** Dimensionless safety bounds for the derived effect factors. */
export const MAX_TECHNOLOGY_PRODUCTIVITY_BONUS = 2;
export const MIN_TECHNOLOGY_MORTALITY_FACTOR = 0.25;
export const MAX_TECHNOLOGY_EDUCATION_BONUS = 1;
export const TECHNOLOGY_RATE_DECIMALS = 6;

/** Inclusive school-age band used by the M9 literacy model. */
export const EDUCATION_SCHOOL_AGE_MIN = 5;
export const EDUCATION_SCHOOL_AGE_MAX = 14;

/**
 * Students one full-time teacher can serve. A structural capacity normaliser, not
 * a historical classroom-size claim.
 */
export const EDUCATION_STUDENTS_PER_TEACHER = 25;

/**
 * Provisional annual RUSD funding benchmark per academic staff member. Funding
 * adequacy is `fundedAnnual / (academicStaff × benchmark)`, clamped to 1. The
 * authored scenario's nominal fiscal scale is synthetic, so this normalises
 * funding to staff size rather than claiming a historical teacher salary.
 */
export const EDUCATION_FUNDING_PER_STAFF_PER_YEAR_RUSD = 1;

/** Household attendance from wealth: base + weight × (wealthLevel / 99). */
export const EDUCATION_ATTENDANCE_BASE = 0.45;
export const EDUCATION_ATTENDANCE_WEALTH_WEIGHT = 0.55;

/**
 * Education-quality weights over staffing coverage and academic literacy. They
 * sum to 1. Funding adequacy is applied multiplicatively to service output and
 * research work, not added here, so zero funding yields zero service.
 */
export const EDUCATION_QUALITY_COVERAGE_WEIGHT = 0.6;
export const EDUCATION_QUALITY_LITERACY_WEIGHT = 0.4;

/**
 * Maximum literacy share of the remaining gap one fully-schooled person can close
 * per day. At full access and quality 1, a ten-year schooling span closes about
 * 0.997 of the initial gap; at realistic access it closes a fraction, not all.
 */
export const EDUCATION_DAILY_LITERACY_GAIN = 0.0015;

/** Numeric-safety bound for an education funding target. */
export const MAX_EDUCATION_FUNDING_RUSD_PER_YEAR = MAX_FISCAL_BUDGET_RUSD_PER_YEAR;

/**
 * E5 labor/social constants. PROVISIONAL structural rules, normalisers, and
 * coefficients, not historical calibration (D-078).
 */

/** 1900 baseline working week used to scale the hours-standard law. PROVISIONAL. */
export const LABOR_STANDARD_HOURS_PER_WEEK = 60;
/** Shortest recognized statutory week; keeps the hours factor in 0.4..1. */
export const LABOR_MIN_HOURS_PER_WEEK = 24;
/** Numeric-safety bound for an authored minimum-wage floor. */
export const MAX_LABOR_MINIMUM_WAGE_RUSD_PER_YEAR = MAX_FISCAL_BUDGET_RUSD_PER_YEAR;
/** Numeric-safety bound for an authored working week. */
export const MAX_LABOR_HOURS_PER_WEEK = 168;
/** Fraction of output/income lost per hour removed from the baseline week. */
export const LABOR_HOURS_CAPACITY_MIN = 0.4;
/**
 * Provisional mortality improvement at the shortest recognized week. The effect is
 * linear in the hours reduction and bounded so it can never be a dominant bonus.
 */
export const LABOR_HOURS_MORTALITY_IMPROVEMENT = 0.12;

/** Minimum adult literacy for vocational-training eligibility. */
export const TRAINING_MIN_LITERACY = 0.5;
/** Trainees one full-time academic instructor can serve. PROVISIONAL. */
export const TRAINEES_PER_INSTRUCTOR = 20;
/** Maximum share of eligible working-age people in part-time training. */
export const TRAINING_MAX_PARTICIPATION = 0.05;
/**
 * Effective labour time lost by a participating trainee. Training is part-time and
 * in-service, so the same people remain employed; this is the documented time cost.
 */
export const TRAINING_TIME_SHARE = 0.2;
/**
 * Qualification gain per day at full participation, quality 1. At 5% participation
 * and quality 0.5 a block closes about 0.09 of the remaining gap per year.
 */
export const TRAINING_DAILY_QUALIFICATION_GAIN = 0.01;
/** Provisional annual provider cost per academic instructor. */
export const TRAINING_INSTRUCTOR_COST_PER_YEAR_RUSD = 1;
/** Training-quality weights; they sum to 1. */
export const TRAINING_QUALITY_FUNDING_WEIGHT = 0.5;
export const TRAINING_QUALITY_LITERACY_WEIGHT = 0.3;
export const TRAINING_QUALITY_INSTITUTION_WEIGHT = 0.2;
/** Wage premium at qualification 1. PROVISIONAL. */
export const QUALIFICATION_WAGE_PREMIUM = 0.25;
/** Labour-productivity premium at qualification 1. PROVISIONAL. */
export const QUALIFICATION_PRODUCTIVITY_PREMIUM = 0.2;
/** Numeric-safety bounds for training/stipend policy values. */
export const MAX_TRAINING_BUDGET_RUSD_PER_YEAR = MAX_FISCAL_BUDGET_RUSD_PER_YEAR;
export const MAX_TRAINING_STIPEND_RUSD_PER_YEAR = MAX_FISCAL_BUDGET_RUSD_PER_YEAR;

/**
 * E5 public-health constants. Public health is a share of the existing
 * administration clerk base; it adds no new profession or payment (D-078).
 */
/** Target health staff per resident at which staffing coverage reaches 1. */
export const HEALTH_TARGET_STAFF_PER_CAPITA = 0.01;
/** Health-quality weights; they sum to 1. */
export const HEALTH_QUALITY_STAFFING_WEIGHT = 0.5;
export const HEALTH_QUALITY_FUNDING_WEIGHT = 0.25;
export const HEALTH_QUALITY_LITERACY_WEIGHT = 0.25;
/** Maximum mortality reduction at full health service output. PROVISIONAL. */
export const HEALTH_MAX_MORTALITY_REDUCTION = 0.25;
/** Lower bound on the combined mortality factor (technology × health × hours). */
export const MIN_COMBINED_MORTALITY_FACTOR = 0.25;
/** Rate precision for E5 derived values. */
export const E5_RATE_DECIMALS = 6;

/**
 * P2b (D-135): money coefficients of a scenario that authors none. They are the
 * pre-P2b constants, so legacy fixtures (the M5 sample, test worlds) keep their
 * synthetic scale; the 1900 world authors its own sourced values.
 */
export const DEFAULT_MONEY_COEFFICIENTS: Readonly<{
  recruitmentCostPerSoldierRUSD: number;
  equipmentPriceRUSD: number;
  soldierDailyPayRUSD: number;
  equipmentDailyUpkeepRUSD: number;
  garrisonCostPerSoldierPerDayRUSD: number;
  adminFundingPerCapitaPerYearRUSD: number;
  educationFundingPerStaffPerYearRUSD: number;
  trainingInstructorCostPerYearRUSD: number;
}> = {
  recruitmentCostPerSoldierRUSD: M10_RECRUITMENT_COST_PER_SOLDIER_RUSD,
  equipmentPriceRUSD: M10_EQUIPMENT_PRICE_RUSD,
  soldierDailyPayRUSD: M10_SOLDIER_DAILY_PAY_RUSD,
  equipmentDailyUpkeepRUSD: M10_EQUIPMENT_DAILY_UPKEEP_RUSD,
  garrisonCostPerSoldierPerDayRUSD: M10_OCCUPATION_GARRISON_COST_PER_SOLDIER_RUSD,
  adminFundingPerCapitaPerYearRUSD: ADMIN_FUNDING_PER_CAPITA_PER_YEAR_RUSD,
  educationFundingPerStaffPerYearRUSD: EDUCATION_FUNDING_PER_STAFF_PER_YEAR_RUSD,
  trainingInstructorCostPerYearRUSD: TRAINING_INSTRUCTOR_COST_PER_YEAR_RUSD,
};

/** Keys of the money coefficients, in their canonical order. */
export const MONEY_COEFFICIENT_KEYS = [
  "recruitmentCostPerSoldierRUSD",
  "equipmentPriceRUSD",
  "soldierDailyPayRUSD",
  "equipmentDailyUpkeepRUSD",
  "garrisonCostPerSoldierPerDayRUSD",
  "adminFundingPerCapitaPerYearRUSD",
  "educationFundingPerStaffPerYearRUSD",
  "trainingInstructorCostPerYearRUSD",
] as const;

/*
 * P5 (D-143) land, agriculture and harvests. Every coefficient below is PROVISIONAL
 * (P15 calibrates); units and sources are stated with each.
 *
 * Farm output per building and day (cadence: daily, in the production capacity):
 *   P2b output × staffing^FARM_LABOUR_ELASTICITY
 *            × (hectares per level / FARM_REFERENCE_HECTARES_PER_LEVEL)^FARM_LAND_ELASTICITY
 *            × harvest weather × technology,
 * where a province's land of the building's kind is shared among its operational
 * buildings of that kind in proportion to their levels. Constant returns to scale
 * (the two elasticities sum to 1), so the marginal product of labour falls as labour
 * per hectare rises. At world creation each farm's technique is divided by its 1900
 * land factor, so 1900 output is the P2b calibration (D-135) unchanged.
 */

/**
 * Output elasticity of farm labour, dimensionless. Labour's share of pre-industrial
 * farm income (Clark 2002, "Farmland rental values and agrarian history: England
 * 1500-1912", land rent about 0.25-0.4 of output). PROVISIONAL.
 */
export const FARM_LABOUR_ELASTICITY = 0.6;

/** Output elasticity of farm land, dimensionless: 1 − labour (constant returns). PROVISIONAL. */
export const FARM_LAND_ELASTICITY = 0.4;

/**
 * Normalising land per building level, hectares (one level = 1,000 jobs in the 1900
 * definitions, so 1 ha per job). It only fixes the scale of the land factor: world
 * creation divides each farm's technique by its 1900 land factor, so its value does
 * not change any 1900 output. PROVISIONAL (a scale, not a calibration).
 */
export const FARM_REFERENCE_HECTARES_PER_LEVEL = 1_000;

/** Keyed-draw purpose of the yearly harvest weather of a province (GDD §16.1). */
export const HARVEST_WEATHER_PURPOSE = "harvest.weather";

/**
 * Standard deviation of the log harvest weather factor, dimensionless; the factor is
 * lognormal with mean 1 (exp(σZ − σ²/2)), drawn once per (province, calendar year).
 * Weather explains most year-to-year variation of 1850–1913 European grain yields,
 * national coefficients of variation about 0.10–0.15 (Solomou & Wu 1999, "Weather
 * effects on European agricultural output, 1850–1913"); a province varies more than a
 * nation. PROVISIONAL.
 */
export const HARVEST_WEATHER_SIGMA = 0.15;

/** Keyed-draw purpose of the monthly prospecting discovery of a hidden deposit (GDD §16.1). */
export const RESOURCE_DISCOVERY_PURPOSE = "resource.discovery";

/**
 * Monthly probability that prospecting finds a hidden, prospectable deposit in a
 * province with infrastructure 1 (it scales with the province's infrastructure,
 * 0..1: prospectors need access). 1/120 per month = a mean of ten years. Order of
 * magnitude of the 20th-century lag between a prospecting method and the deposits it
 * revealed (seismic reflection from the 1920s and the Gulf giants of 1927–1948;
 * airborne magnetics from the 1950s and the Pilbara iron ores of the 1960s).
 * Cadence: first day of each month. PROVISIONAL.
 */
export const RESOURCE_DISCOVERY_MONTHLY_HAZARD = 1 / 120;

/**
 * P6 (D-153): weight of province crowding above its 1900 level in the unrest target
 * (housing worse than people are used to). Dimensionless; PROVISIONAL.
 */
export const UNREST_CROWDING_WEIGHT = 0.1;

/*
 * P7 (D-154) labour market, wages, social mobility and urbanisation. Every coefficient
 * below is PROVISIONAL (P15 calibrates against wage curves, pre-1914 wage series and
 * occupational change); units, cadence and intended effect are stated with each.
 *
 * Wage rule (cadence: first civil day of a month, from the month's employment refresh):
 *   Δln W_mp = κ↑·max(0, v − u) − κ↓·max(0, u − v) + π·Δln P_m    (customs territory m)
 *   Δln d_rp = κ_d·((v_rp − u_rp) − (v_mp − u_mp)), then d rescaled to a population-weighted
 *   mean of 1 over the territory (a normalisation, not a clamp)
 * with u = unemployed eligible ÷ eligible labour force and v = unfilled offered slots ÷
 * offered slots. Effective wage = max(W·d, floors) (plan §4.2).
 */

/**
 * κ↑, monthly log-wage rise per unit excess of the vacancy rate over the unemployment
 * rate, 1/month. Tight markets raise wages faster than slack ones lower them (downward
 * stickiness). PROVISIONAL.
 */
export const WAGE_RISE_PER_GAP = 0.1;

/**
 * κ↓, monthly log-wage fall per unit excess of unemployment over vacancies, 1/month. At
 * 10 % unemployment and no vacancies a wage falls 0.4 % a month, about 5 % a year: an
 * unemployment elasticity of about −0.1 per year once prices settle (the wage curve,
 * Blanchflower & Oswald 1994). PROVISIONAL.
 */
export const WAGE_FALL_PER_GAP = 0.04;

/** π, share of the month's consumer-price change passed into wages, dimensionless. PROVISIONAL. */
export const WAGE_PRICE_PASS_THROUGH = 0.5;

/** κ_d, monthly log-differential change per unit of the province's relative gap, 1/month. PROVISIONAL. */
export const WAGE_DIFFERENTIAL_PER_GAP = 0.05;

/**
 * Smoothing of the peasant alternative income (plan §4.2), weight of the new month,
 * dimensionless: 1/12 makes it a one-year exponential average. PROVISIONAL.
 */
export const PEASANT_ALTERNATIVE_MONTHLY_WEIGHT = 1 / 12;

/**
 * η, monthly change of a building's staffing ceiling per unit of (R − 1), 1/month, where
 * R is the value added per throughput unit at smoothed prices ÷ its wage bill (plan §4.3).
 * Hiring to the point where revenue covers the wage, over a few months. PROVISIONAL.
 */
export const STAFFING_CEILING_RATE = 0.5;

/**
 * Lowest staffing used to evaluate a land-using building's marginal product, so the
 * marginal product of the first worker stays finite (FARM_LABOUR_ELASTICITY < 1).
 * Dimensionless; a numerical bound, not a behaviour. PROVISIONAL.
 */
export const STAFFING_MARGINAL_FLOOR = 0.05;

/**
 * γ, exponent of minimum-wage compliance in administration quality (plan §4.5):
 * compliance = quality^γ; the paid wage = market + compliance × max(0, floor − market).
 * Dimensionless. PROVISIONAL.
 */
export const MINIMUM_WAGE_COMPLIANCE_EXPONENT = 1;

/*
 * Mobility between professions inside a province (plan §5.2), first civil day of a
 * month after the wage and ceiling updates. Expected income (Harris–Todaro):
 *   E = wage × (1 − u) × H   (wage professions);  measured income per worker × H
 *   (self-employed and owners, whose wage only splits income from profit).
 *   Pressure P = ln(E_b ÷ E_a) − θ;  flow = min(gated movers, ρ·max(0, P)·N_A,
 *   (vacancies_b + β·labour force_b) in persons).
 */

/** θ, log expected-income gap needed before anyone changes profession (moving cost and attachment). PROVISIONAL. */
export const MOBILITY_THRESHOLD = 0.1;

/** ρ, monthly share of a block that moves per unit pressure, 1/month. PROVISIONAL. */
export const MOBILITY_RATE_PER_PRESSURE = 0.02;

/** β, share of the destination's labour force that may arrive ahead of jobs each month. PROVISIONAL. */
export const MOBILITY_AHEAD_OF_JOBS_SHARE = 0.05;

/**
 * Most of a block's population that may leave it by mobility in one month,
 * dimensionless. A bound standing in for frictions the model does not represent
 * (documented, not a repair). PROVISIONAL.
 */
export const MOBILITY_MONTHLY_MAX_FRACTION = 0.02;

/*
 * Training places (plan §5.3) use the E5 TRAINEES_PER_INSTRUCTOR above: a trained
 * profession's monthly entries ≤ its share of the training instructors × trainees per
 * instructor ÷ (course length in years × 12).
 */

/*
 * Migration between provinces in a labour-market world (plan §6.2): same profession,
 * monthly; pressure = ln(E_destination ÷ E_source) − θ_m with the same expected income
 * and housing factor; the D-052 border rule and the 1 % inflow cap stay.
 */

/** θ_m, log expected-income gap needed to move between provinces. PROVISIONAL. */
export const LABOUR_MIGRATION_THRESHOLD = 0.2;

/** ρ_m, monthly share of a block that migrates per unit pressure, 1/month. PROVISIONAL. */
export const LABOUR_MIGRATION_RATE_PER_PRESSURE = 0.01;

/*
 * Housing in the decision (plan §6.3): H = min(1, D ÷ D*)^η_h × (1 + K_h·max(0, c − 1))^−1,
 * D and D* the destination's dwellings and desired dwellings, c its crowding.
 */

/** η_h, elasticity of the pull in the dwelling shortfall, dimensionless. PROVISIONAL. */
export const HOUSING_PULL_ELASTICITY = 0.5;

/** K_h, pull lost per unit crowding above the 1900 level, dimensionless. PROVISIONAL. */
export const HOUSING_PULL_CROWDING_WEIGHT = 0.5;

/**
 * P7 (D-154, docs/P7_EMPLOYERS_PROPOSAL.md §4.1): a domestic servant's cash wage as a share of
 * the paid wage of the servant's profession in the province, dimensionless. Sourced: Historical
 * Statistics of the United States 1975, D 757 (domestic service, 1901) $240 ÷ D 755 (personal
 * services, 1900) $330. Board and lodging come on top in kind (bought by the employer's
 * consumption).
 */
export const DOMESTIC_WAGE_RATIO = 240 / 330;

/** Monthly labour reports kept in `World.labourMarket.history`. */
export const LABOUR_HISTORY_MONTHS = 12;

/** Keyed-draw purposes of the labour market (GDD §16.1). */
export const LABOUR_RETENTION_PURPOSE = "labour.retain";
export const LABOUR_FILL_PURPOSE = "labour.fill";
export const INSTITUTION_PROVINCE_PURPOSE = "labour.institution-province";
export const MOBILITY_ORDER_PURPOSE = "mobility.order";
export const MOBILITY_AGE_REMAINDER_PURPOSE = "mobility.age-remainder";
export const LABOUR_MIGRATION_ORDER_PURPOSE = "labour-migration.order";
export const LABOUR_MIGRATION_DESTINATION_PURPOSE = "labour-migration.destination";

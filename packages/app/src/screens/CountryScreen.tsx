import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import {
  buildEconomicExplanations,
  countryById,
  essentialGoodIds,
  formatCount,
  formatQuantity,
  formatRate,
  latestMonthlyReport,
  marketsForCountry,
  productionCapacityForGood,
  type SimulationSnapshot,
} from "@century/sim-worker";

import { Badge, Disclosure, Headline, Notice, Section, StatRow } from "../components/ui";
import { CountryFlag } from "../components/CountryFlag";
import { TOUCH_TARGET, colors, fonts, radii, spacing, themedSheet, type } from "../theme";
import { statusLabel } from "../components/WorldMap";
import { useMoney } from "../format/useMoney";
import { groupOf, goodsByGroup, matchesSearch } from "../format/goods";

/** The resource a mined good comes from (P5b extraction buildings). */
const RESOURCE_OF_GOOD: Readonly<Record<string, string>> = {
  coal: "coal",
  "crude-oil": "oil",
  "natural-gas": "gas",
  "iron-ore": "iron",
  "copper-ore": "copper",
  bauxite: "bauxite",
  tin: "tin",
  gold: "gold",
  silver: "silver",
  nitrates: "nitrate",
  uranium: "uranium",
  timber: "timber",
};

/** Production capacity by good: every good, grouped and searchable (plan section 11.2). */
function ProductionList({
  snapshot,
  capacity,
  resources,
}: {
  readonly snapshot: SimulationSnapshot;
  readonly capacity: readonly { readonly goodId: number; readonly dailyCapacity: number }[];
  readonly resources: readonly { readonly resource: string; readonly unit: string; readonly remaining: number; readonly extracted: number }[];
}) {
  const [query, setQuery] = useState("");
  const byGood = new Map(capacity.map((entry) => [entry.goodId, entry.dailyCapacity]));
  const groups = goodsByGroup(snapshot.goods)
    .map((group) => ({ ...group, goods: group.goods.filter((good) => matchesSearch(good, query)) }))
    .filter((group) => group.goods.length > 0);
  return (
    <View>
      <View style={styles.searchWrap}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search goods"
          placeholderTextColor={colors.faint}
          style={styles.search}
          accessibilityLabel="Search production by good"
          autoCorrect={false}
          autoCapitalize="none"
        />
      </View>
      {groups.map((group) => {
        const made = group.goods.filter((good) => (byGood.get(good.id) ?? 0) > 0);
        return (
          <Disclosure key={`${group.key}:${query.trim().length > 0 ? "search" : "browse"}`} title={`${groupOf(group.goods[0]!).label} · ${String(made.length)} made`} initiallyOpen={query.trim().length > 0}>
            {made.length === 0 ? <Text style={styles.empty}>Nothing in this group is made here.</Text> : null}
            {made.map((good) => {
              const resource = resources.find((entry) => entry.resource === RESOURCE_OF_GOOD[good.key]);
              return (
                <StatRow
                  key={good.id}
                  label={good.name}
                  value={`${formatQuantity(byGood.get(good.id) ?? 0)} ${good.unitLabel}/day`}
                  detail={
                    resource === undefined
                      ? "estimated capacity"
                      : `known stock ${formatQuantity(resource.remaining)} ${resource.unit} · extracted since 1900 ${formatQuantity(resource.extracted)} ${resource.unit}`
                  }
                />
              );
            })}
          </Disclosure>
        );
      })}
    </View>
  );
}

export function CountryScreen({
  snapshot,
  countryId,
}: {
  readonly snapshot: SimulationSnapshot;
  readonly countryId: number | null;
}) {
  const money = useMoney();
  const country = countryById(snapshot, countryId);
  if (country === null) {
    return (
      <Section title="Economic overview">
        <Text style={styles.empty}>Select a country on the map.</Text>
      </Section>
    );
  }
  const isPlayerCountry = snapshot.playerCountryId === country.id;
  const latest = latestMonthlyReport(country);
  // P3: the closed month converts at its own closing valuation.
  const latestMoney = latest === null ? money : money.atPeriod(latest.periodEndDay);
  const explanations = buildEconomicExplanations(snapshot, country, money);
  const markets = marketsForCountry(snapshot, country);
  const essentialGoods = essentialGoodIds(snapshot);
  const capacity = [...country.productionCapacityByGood]
    .filter((entry) => entry.dailyCapacity > 0)
    .sort((left, right) => right.dailyCapacity - left.dailyCapacity);

  const meta = country.meta;
  const sovereign =
    meta === null
      ? null
      : (snapshot.countrySummaries.find((entry) => entry.id === meta.sovereignCountryId) ?? null);
  return (
    <View>
      <View style={styles.identityPanel}>
        <View style={styles.identityTop}>
          <CountryFlag polityId={country.id} tag={country.tag} size="detail" />
          <View style={styles.identityText}>
            <Text style={styles.identityName}>{country.name}</Text>
            <Text style={styles.identityMeta}>
              {meta === null ? country.tag : `${statusLabel(meta.status)} · ${meta.capitalName}`}
              {meta !== null && meta.historicalName !== country.name ? ` · ${meta.historicalName}` : ""}
            </Text>
            <Text style={styles.identityMeta}>
              {sovereign !== null && sovereign.id !== country.id
                ? `Sovereign power: ${sovereign.name}`
                : "Sovereign state"}
              {" · "}
              {isPlayerCountry ? "Player-controlled" : "AI-controlled"}
            </Text>
          </View>
        </View>
        <View style={styles.identityBadges}>
          <Badge label={isPlayerCountry ? "Player country" : "AI country"} tone={isPlayerCountry ? "accent" : "muted"} />
          {meta === null ? null : <Badge label={meta.status} tone="muted" />}
        </View>
      </View>

      <Headline
        label="Treasury"
        value={money.format(country.treasuryCashRUSD)}
        tone={country.treasuryCashRUSD >= 0 ? "default" : "negative"}
        trend={country.financeHistory.map((period) => period.netFiscalResultRUSD)}
        detail={`${formatCount(country.population)} people · hardship ${(country.hardshipPopulationShare * 100).toFixed(1)}%`}
      />

      <Section
        title="Economic overview"
        subtitle={`${country.name} (${country.tag}) · ${snapshot.date.label} · ${
          isPlayerCountry ? "Player-controlled country" : "AI-controlled country"
        }`}
      >
        <StatRow
          label="Population"
          value={formatCount(country.population)}
          detail="people; stock."
        />
        <StatRow
          label="Working-age population"
          value={formatCount(country.workingAgePopulation)}
          detail="people aged 15–64; stock."
        />
        <StatRow
          label="Employed workers"
          value={formatCount(country.employedWorkers)}
          detail={`${formatCount(
            Math.max(0, country.workingAgePopulation - country.employedWorkers),
          )} working-age people are not in modeled employment (not an unemployment rate).`}
        />
        <StatRow
          label="Household hardship"
          value={formatRate(country.hardshipPopulationShare)}
          detail={`${String(country.blocksWithUnmetSubsistence)} blocks with any unmet subsistence day; ${String(
            country.blocksWithUnmetBasic,
          )} with any unmet basic day.`}
        />
        <StatRow
          label="Treasury cash"
          value={money.format(country.treasuryCashRUSD)}
          detail="Country treasury asset balance; stock."
        />
        <StatRow
          label="Public debt"
          value={money.format(country.debtOutstandingPrincipalRUSD)}
          detail={`Principal outstanding. Interest payable ${money.format(country.debtInterestPayableRUSD)}.`}
        />
      </Section>

      <Section folded
        title="Market and customs"
        subtitle="Market membership is an economic relationship, not a sovereignty claim. A dependent territory keeps its own province and market."
      >
        {markets.length === 0 ? (
          <Text style={styles.empty}>No market is recorded for this country.</Text>
        ) : (
          markets.map((market) => (
            <View key={market.id} style={styles.marketRow}>
              <View style={styles.marketMain}>
                <Text style={styles.marketName}>{market.name}</Text>
                <Text style={styles.marketMeta}>
                  {market.kind === "imperial"
                    ? "Imperial customs area"
                    : market.kind === "shared"
                      ? "Shared multi-country market"
                      : "National market"}{" "}
                  · {market.memberCountryIds.length} member countries ·{" "}
                  {market.provinceIds.length} provinces
                </Text>
                <Text style={styles.marketMeta}>
                  Customs administration:{" "}
                  {market.customsCountryId === null
                    ? "none"
                    : (snapshot.countrySummaries.find(
                        (entry) => entry.id === market.customsCountryId,
                      )?.name ?? "unknown")}
                </Text>
              </View>
              <Badge
                label={`${market.memberCountryIds.length} ${
                  market.memberCountryIds.length === 1 ? "country" : "countries"
                }`}
                tone="accent"
              />
            </View>
          ))
        )}
      </Section>

      <Section folded
        title="What needs attention"
        subtitle="Evidence from the current snapshot. These are observations and supported contributing constraints, not proof of a single cause."
      >
        {explanations.length === 0 ? (
          <Text style={styles.empty}>
            No major supported problem is flagged by the current E1 rules. Check Markets,
            Population, Budget, and Ledger for details.
          </Text>
        ) : (
          explanations.map((explanation) => (
            <Notice
              key={explanation.id}
              title={explanation.title}
              tone={
                explanation.severity === "critical"
                  ? "critical"
                  : explanation.severity === "warning"
                    ? "warning"
                    : "info"
              }
            >
              {explanation.observation}
              {"\n"}
              {explanation.evidence.join("\n")}
              {"\n"}
              Interpretation: {explanation.caveat}
              {"\n"}
              Look under: {labelForTarget(explanation.target)}.
            </Notice>
          ))
        )}
      </Section>

      <Section folded
        title="Production capacity by good"
        subtitle="Estimated current daily output at building level, condition, staffing, and productivity. This is capacity, not realized production or demand."
      >
        {capacity.length === 0 ? (
          <Text style={styles.empty}>No operational production capacity is recorded.</Text>
        ) : (
          <ProductionList snapshot={snapshot} capacity={capacity} resources={country.resources} />
        )}
      </Section>

      <Section folded
        title="Essential goods now"
        subtitle="Current stock and prices in the country's markets. Stock is a balance; capacity is an estimated daily flow. Historical market series are not retained."
      >
        {essentialGoods.length === 0 ? (
          <Text style={styles.empty}>No subsistence/basic need tiers are exposed.</Text>
        ) : (
          essentialGoods.map((goodId) => {
            const good = snapshot.goods.find((entry) => entry.id === goodId);
            if (good === undefined) return null;
            let stock = 0;
            const prices: number[] = [];
            for (const market of markets) {
              const price = market.prices.find((entry) => entry.goodId === goodId);
              if (price === undefined) continue;
              stock += price.stockQuantity;
              prices.push(price.priceRUSD);
            }
            const minPrice = prices.length === 0 ? null : Math.min(...prices);
            const maxPrice = prices.length === 0 ? null : Math.max(...prices);
            const priceText =
              minPrice === null || maxPrice === null
                ? "no market price"
                : minPrice === maxPrice
                  ? money.price(minPrice)
                  : `${money.price(minPrice)}–${money.price(maxPrice)}`;
            return (
              <View key={goodId} style={styles.goodRow}>
                <View style={styles.goodMain}>
                  <Text style={styles.goodName}>{good.name}</Text>
                  <Text style={styles.goodDetail}>
                    Stock {formatQuantity(stock)} {good.unitLabel} · capacity{" "}
                    {formatQuantity(productionCapacityForGood(country, goodId))} {good.unitLabel}/day
                  </Text>
                </View>
                <Text style={styles.goodPrice}>{priceText}</Text>
              </View>
            );
          })
        )}
      </Section>

      <Section folded
        title="Latest closed month"
        subtitle={
          latest === null
            ? "No monthly close has run yet."
            : `${latest.periodStartLabel} to ${latest.periodEndLabel}. Flows are closed-period actuals; balances are end-of-close.`
        }
      >
        {latest === null ? (
          <Text style={styles.empty}>Advance to the end of the first civil month.</Text>
        ) : (
          <>
            <StatRow label="Income tax" value={latestMoney.format(latest.incomeTaxRUSD)} detail="flow" />
            <StatRow
              label="Welfare expense"
              value={latestMoney.format(latest.welfareExpenseRUSD)}
              detail="flow"
            />
            <StatRow
              label="Interest expense"
              value={latestMoney.format(latest.interestExpenseRUSD)}
              detail="flow; distinct from principal"
            />
            <StatRow
              label="Net fiscal result"
              value={latestMoney.format(latest.netFiscalResultRUSD)}
              detail="revenue minus expense for the closed month"
            />
            <StatRow
              label="Treasury at close"
              value={
                latest.treasuryCash?.endRUSD === undefined
                  ? "Not retained"
                  : latestMoney.format(latest.treasuryCash.endRUSD)
              }
              detail={
                latest.treasuryCash?.changeRUSD === undefined ||
                latest.treasuryCash?.changeRUSD === null
                  ? "Balance change not derivable from the retained window"
                  : `Change ${latestMoney.format(latest.treasuryCash.changeRUSD)} vs prior close`
              }
            />
            <Text style={styles.note}>
              A closing balance is not a period flow. Older compacted months retain fiscal
              flows but not account-level balances.
            </Text>
          </>
        )}
      </Section>

      <Section folded title="Where to investigate">
        {country.employedWorkers === 0 && snapshot.dayIndex === 0 ? (
          <Notice title="Workforce assigned on the first simulated day">
            Buildings and population are initialized, but employment and staffing are assigned by
            the first simulated day. Capacity and workforce diagnoses are therefore zero or
            provisional until you advance one day.
          </Notice>
        ) : null}
        <Text style={styles.note}>
          Shortages and prices: Markets. Household conditions and wages: Population. Policy
          affordability and debt: Budget. Closed months and action history: Ledger.
        </Text>
      </Section>
    </View>
  );
}

function labelForTarget(target: "markets" | "population" | "budget" | "ledger"): string {
  switch (target) {
    case "markets":
      return "Markets";
    case "population":
      return "Population";
    case "budget":
      return "Budget";
    case "ledger":
      return "Ledger";
  }
}

const styles = themedSheet(() => ({
  empty: { color: colors.muted, fontFamily: fonts.sans, fontSize: 13, paddingVertical: spacing.sm },
  // A sheet is narrow on a phone: flag and name share a row, the badges get their own.
  identityPanel: {
    gap: spacing.sm,
    padding: spacing.md,
    marginBottom: spacing.md,
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.md,
  },
  identityTop: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  identityText: { flex: 1, minWidth: 0 },
  identityName: { ...type.title, fontSize: 18 },
  identityMeta: { ...type.tiny, marginTop: 1 },
  identityBadges: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  marketRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  marketMain: { flex: 1 },
  marketName: { ...type.body, color: colors.textStrong, fontFamily: fonts.sansSemiBold },
  marketMeta: { ...type.tiny, marginTop: 1 },
  note: { color: colors.faint, fontFamily: fonts.sans, fontSize: 11, lineHeight: 15, marginTop: spacing.sm },
  goodRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: spacing.xs,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  goodMain: { flex: 1, paddingRight: spacing.sm },
  goodName: { color: colors.text, fontSize: 13, fontFamily: fonts.sansSemiBold },
  searchWrap: {
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.xs,
    backgroundColor: colors.surface,
  },
  search: { ...type.body, minHeight: TOUCH_TARGET, color: colors.text },
  goodDetail: { color: colors.faint, fontFamily: fonts.sans, fontSize: 11, marginTop: 2 },
  goodPrice: {
    color: colors.accent,
    fontSize: 11,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
    maxWidth: 130,
  },
}));

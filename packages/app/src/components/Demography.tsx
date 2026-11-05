/**
 * P4 (D-142) demography figures shared by the province panel and the nation's
 * Population ledger: the population pyramid, the current birth and death rates,
 * fertility and life expectancy, and the yearly history chart.
 *
 * Phone first (844 × 390 landscape): every figure is drawn from plain views or SVG
 * sized to the panel width, every colour and type style comes from the design tokens
 * through `theme`, nothing depends on hover, and the only control (the history
 * series switch) is at least `TOUCH_TARGET` points tall.
 */

import { useState } from "react";
import { Pressable, Text, View, type LayoutChangeEvent } from "react-native";
import Svg, { Circle, Line, Polyline } from "react-native-svg";

import {
  formatCount,
  type DemographyIndicatorsSnapshot,
  type DemographyYearSnapshot,
  type PopulationPyramidSnapshot,
} from "@century/sim-worker";

import { colors, fonts, radii, spacing, themedSheet, TOUCH_TARGET, type } from "../theme";
import { StatRow } from "./ui";

const BAND_LABELS = [
  "0–4", "5–9", "10–14", "15–19", "20–24", "25–29", "30–34", "35–39", "40–44",
  "45–49", "50–54", "55–59", "60–64", "65–69", "70–74", "75–79", "80+",
];

export const perThousand = (value: number): string => `${value.toFixed(1)} per 1,000`;
export const percent = (value: number): string => `${(value * 100).toFixed(0)}%`;

/** Population pyramid: men to the left, women to the right, oldest at the top. */
export function PopulationPyramid({
  pyramid,
  compact = false,
}: {
  readonly pyramid: PopulationPyramidSnapshot;
  readonly compact?: boolean;
}) {
  let largest = 0;
  let total = 0;
  for (let band = 0; band < 17; band += 1) {
    largest = Math.max(largest, pyramid.male[band] ?? 0, pyramid.female[band] ?? 0);
    total += (pyramid.male[band] ?? 0) + (pyramid.female[band] ?? 0);
  }
  if (total === 0) return null;
  const children = (pyramid.male[0] ?? 0) + (pyramid.female[0] ?? 0) + (pyramid.male[1] ?? 0) + (pyramid.female[1] ?? 0) + (pyramid.male[2] ?? 0) + (pyramid.female[2] ?? 0);
  const elderly = [13, 14, 15, 16].reduce((sum, band) => sum + (pyramid.male[band] ?? 0) + (pyramid.female[band] ?? 0), 0);
  const rowStyle = compact ? styles.rowCompact : styles.row;
  return (
    <View
      style={styles.pyramid}
      accessible
      accessibilityLabel={`Population pyramid. ${percent(children / total)} under 15, ${percent(elderly / total)} aged 65 and over.`}
    >
      <View style={styles.legend}>
        <Text style={[styles.legendText, { color: colors.blue }]}>Men</Text>
        <Text style={styles.legendCenter}>Age</Text>
        <Text style={[styles.legendText, styles.legendRight, { color: colors.purple }]}>Women</Text>
      </View>
      {BAND_LABELS.map((_label, index) => {
        // Oldest at the top: row 0 is the 80+ band.
        const band = 16 - index;
        const label = BAND_LABELS[band] ?? "";
        const male = pyramid.male[band] ?? 0;
        const female = pyramid.female[band] ?? 0;
        return (
          <View key={label} style={rowStyle}>
            <View style={styles.side}>
              <View style={[styles.barMale, { width: `${largest > 0 ? (male / largest) * 100 : 0}%` }]} />
            </View>
            <Text style={styles.age}>{label}</Text>
            <View style={styles.side}>
              <View style={[styles.barFemale, { width: `${largest > 0 ? (female / largest) * 100 : 0}%` }]} />
            </View>
          </View>
        );
      })}
      <Text style={styles.caption}>
        {`${percent(children / total)} under 15 · ${percent(elderly / total)} aged 65+ · ${formatCount(total)} people`}
      </Text>
    </View>
  );
}

/** The current birth, death, fertility and survival figures as rows. */
export function DemographyRows({
  demography,
  compact = false,
}: {
  readonly demography: DemographyIndicatorsSnapshot;
  readonly compact?: boolean;
}) {
  const growth = (demography.crudeBirthRate - demography.crudeDeathRate) / 10;
  return (
    <>
      <StatRow
        label="Births and deaths"
        value={`${demography.crudeBirthRate.toFixed(1)} / ${demography.crudeDeathRate.toFixed(1)}`}
        detail={`per 1,000 people a year at today's rates · natural growth ${growth >= 0 ? "+" : ""}${growth.toFixed(2)}% a year`}
        tone={growth < 0 ? "negative" : "default"}
      />
      <StatRow
        label="Children per woman"
        value={demography.totalFertility.toFixed(2)}
        detail={`Total fertility rate · literacy of women 15–49 ${percent(demography.femaleLiteracy)}`}
      />
      <StatRow
        label="Life expectancy"
        value={`${demography.lifeExpectancy.toFixed(1)} years`}
        detail={`${demography.under5MortalityPer1000.toFixed(0)} of 1,000 children die before age 5`}
      />
      {compact ? null : (
        <StatRow
          label="Food eaten"
          value={percent(demography.foodSufficiency)}
          detail="Calories actually consumed against need, last month's average"
          tone={demography.foodSufficiency < 0.9 ? "negative" : "default"}
        />
      )}
    </>
  );
}

type Series = "rates" | "fertility" | "life";

const SERIES: readonly { readonly id: Series; readonly label: string }[] = [
  { id: "rates", label: "Births · deaths" },
  { id: "fertility", label: "Children per woman" },
  { id: "life", label: "Life expectancy" },
];

/** Yearly history of realised birth and death rates, fertility and life expectancy. */
export function DemographyTrend({ history }: { readonly history: readonly DemographyYearSnapshot[] }) {
  const [series, setSeries] = useState<Series>("rates");
  const [width, setWidth] = useState(0);
  const onLayout = (event: LayoutChangeEvent): void => setWidth(event.nativeEvent.layout.width);
  if (history.length === 0) {
    return <Text style={styles.caption}>The yearly record starts when the first year closes on 1 January.</Text>;
  }
  const lines: { readonly values: readonly number[]; readonly color: string; readonly name: string }[] =
    series === "rates"
      ? [
          { values: history.map((row) => row.crudeBirthRate), color: colors.blue, name: "births" },
          { values: history.map((row) => row.crudeDeathRate), color: colors.red, name: "deaths" },
        ]
      : series === "fertility"
        ? [{ values: history.map((row) => row.totalFertility), color: colors.accentStrong, name: "children per woman" }]
        : [{ values: history.map((row) => row.lifeExpectancy), color: colors.green, name: "years" }];
  const all = lines.flatMap((line) => line.values);
  const low = Math.min(0, ...all);
  const high = Math.max(...all, low + 1);
  const height = 96;
  const pad = 4;
  const x = (index: number): number =>
    history.length === 1 ? width / 2 : pad + (index / (history.length - 1)) * (width - pad * 2);
  const y = (value: number): number => pad + (1 - (value - low) / (high - low)) * (height - pad * 2);
  const first = history[0]!;
  const last = history[history.length - 1]!;
  const latest = lines.map((line) => `${line.name} ${line.values[line.values.length - 1]!.toFixed(1)}`).join(" · ");
  return (
    <View>
      <View style={styles.switchRow} accessibilityRole="tablist">
        {SERIES.map((entry) => (
          <Pressable
            key={entry.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: entry.id === series }}
            onPress={() => setSeries(entry.id)}
            style={[styles.switchButton, entry.id === series ? styles.switchSelected : null]}
          >
            <Text style={[styles.switchText, entry.id === series ? styles.switchTextSelected : null]}>{entry.label}</Text>
          </Pressable>
        ))}
      </View>
      <View
        onLayout={onLayout}
        style={styles.chart}
        accessible
        accessibilityLabel={`${SERIES.find((entry) => entry.id === series)?.label ?? ""} from ${String(first.year)} to ${String(last.year)}: ${latest}`}
      >
        {width > 0 ? (
          <Svg width={width} height={height}>
            <Line x1={0} y1={height - pad} x2={width} y2={height - pad} stroke={colors.border} strokeWidth={1} />
            {lines.map((line) => (
              <Polyline
                key={line.name}
                points={line.values.map((value, index) => `${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(" ")}
                fill="none"
                stroke={line.color}
                strokeWidth={2}
              />
            ))}
            {/* Year markers keep a short record (one or two years) visible. */}
            {history.length <= 24
              ? lines.flatMap((line) =>
                  line.values.map((value, index) => (
                    <Circle
                      key={`${line.name}-${String(index)}`}
                      cx={x(index)}
                      cy={y(value)}
                      r={3}
                      fill={line.color}
                    />
                  )),
                )
              : null}
          </Svg>
        ) : null}
      </View>
      <View style={styles.axis}>
        <Text style={styles.caption}>{String(first.year)}</Text>
        <Text style={styles.caption}>{latest}</Text>
        <Text style={styles.caption}>{String(last.year)}</Text>
      </View>
    </View>
  );
}

const styles = themedSheet(() => ({
  pyramid: { marginTop: spacing.sm, marginBottom: spacing.xs },
  legend: { flexDirection: "row", alignItems: "center", marginBottom: spacing.xxs },
  legendText: { flex: 1, fontFamily: fonts.sansSemiBold, fontSize: 11 },
  legendRight: { textAlign: "right" },
  legendCenter: { width: 44, textAlign: "center", color: colors.faint, fontFamily: fonts.sans, fontSize: 10 },
  row: { flexDirection: "row", alignItems: "center", height: 9, marginVertical: 0.5 },
  rowCompact: { flexDirection: "row", alignItems: "center", height: 6, marginVertical: 0.5 },
  side: { flex: 1, height: "100%", flexDirection: "row" },
  barMale: { height: "100%", backgroundColor: colors.blue, marginLeft: "auto", borderRadius: 1 },
  barFemale: { height: "100%", backgroundColor: colors.purple, borderRadius: 1 },
  age: { width: 44, textAlign: "center", color: colors.faint, fontFamily: fonts.sans, fontSize: 8, lineHeight: 9 },
  caption: { ...type.tiny, color: colors.muted, marginTop: spacing.xxs },
  switchRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginVertical: spacing.xs },
  switchButton: {
    minHeight: TOUCH_TARGET,
    paddingHorizontal: spacing.md,
    justifyContent: "center",
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  switchSelected: { backgroundColor: colors.accentSoft, borderColor: colors.accentLine },
  switchText: { color: colors.muted, fontFamily: fonts.sans, fontSize: 12 },
  switchTextSelected: { color: colors.textStrong, fontFamily: fonts.sansSemiBold },
  chart: { height: 96, width: "100%" },
  axis: { flexDirection: "row", justifyContent: "space-between" },
}));

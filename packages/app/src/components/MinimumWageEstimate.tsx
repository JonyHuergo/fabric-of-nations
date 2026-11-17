/**
 * P7 (plan §4.5, D-156): the short-run estimate of a minimum-wage law at its floor. D-169:
 * shared by the Labor screen and the Politics screen (next to the law), so both show the same
 * figures from the same snapshot field. Presentation only.
 */
import { Text, View } from "react-native";

import { formatCount, formatRate, type MinimumWagePreviewSnapshot } from "@century/sim-worker";

import type { MoneyFormat } from "../format/money";
import { colors, fonts, spacing, themedSheet } from "../theme";
import { StatRow } from "./ui";

export function MinimumWageEstimate({ preview, money }: { readonly preview: MinimumWagePreviewSnapshot; readonly money: MoneyFormat }) {
  return (
    <View style={styles.estimate}>
      <Text style={styles.estimateTitle}>
        {`${preview.lawName} at ${money.format(preview.floorRUSDPerYear)}/year${preview.enacted ? " (in force)" : ""} · short-run estimate`}
      </Text>
      <StatRow
        label="Covered workers"
        value={formatCount(preview.coveredWorkers)}
        detail="Employees of firms and public institutions; never the self-employed, peasants or owners."
      />
      <StatRow label="Paid below the floor today" value={formatCount(preview.workersBelowFloor)} />
      <StatRow
        label="Jobs at risk"
        value={formatCount(preview.jobsAtRisk)}
        detail="Filled jobs in covered buildings that could not pay their staff at this floor."
        tone={preview.jobsAtRisk > 0 ? "negative" : "default"}
      />
      <StatRow
        label="Compliance"
        value={formatRate(preview.compliance)}
        detail="Share of the gap employers pay; it rises with administration quality."
      />
      <Text style={styles.help}>
        Prices and people are held at today's levels; in time shed output raises prices and people
        move toward work. Monopsony, efficiency wages and pay rises spreading up the wage scale are
        not modelled.
      </Text>
    </View>
  );
}

const styles = themedSheet(() => ({
  estimate: {
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    backgroundColor: colors.surface,
  },
  estimateTitle: {
    fontSize: 13,
    fontFamily: fonts.sansSemiBold,
    color: colors.muted,
    marginBottom: 4,
  },
  help: {
    fontSize: 13,
    color: colors.muted,
    lineHeight: 17,
  },
}));

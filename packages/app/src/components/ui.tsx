import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, radii, spacing } from "../theme";

export function Section({
  title,
  subtitle,
  children,
}: {
  readonly title: string;
  readonly subtitle?: string;
  readonly children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle === undefined ? null : <Text style={styles.sectionSubtitle}>{subtitle}</Text>}
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

export function StatRow({
  label,
  value,
  detail,
}: {
  readonly label: string;
  readonly value: string;
  readonly detail?: string;
}) {
  return (
    <View style={styles.statRow}>
      <View style={styles.statLabelWrap}>
        <Text style={styles.statLabel}>{label}</Text>
        {detail === undefined ? null : <Text style={styles.statDetail}>{detail}</Text>}
      </View>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

export function ActionButton({
  label,
  onPress,
  disabled = false,
  tone = "default",
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly disabled?: boolean;
  readonly tone?: "default" | "accent" | "danger";
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        tone === "accent" ? styles.buttonAccent : null,
        tone === "danger" ? styles.buttonDanger : null,
        pressed ? styles.buttonPressed : null,
        disabled ? styles.buttonDisabled : null,
      ]}
    >
      <Text
        style={[
          styles.buttonLabel,
          tone === "accent" ? styles.buttonLabelAccent : null,
          disabled ? styles.buttonLabelDisabled : null,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function Pill({
  label,
  active,
  onPress,
  disabled = false,
}: {
  readonly label: string;
  readonly active: boolean;
  readonly onPress: () => void;
  readonly disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.pill, active ? styles.pillActive : null, disabled ? styles.buttonDisabled : null]}
    >
      <Text
        style={[
          styles.pillLabel,
          active ? styles.pillLabelActive : null,
          disabled ? styles.buttonLabelDisabled : null,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function MiniBars({
  values,
  positiveColor = colors.green,
  negativeColor = colors.red,
}: {
  readonly values: readonly number[];
  readonly positiveColor?: string;
  readonly negativeColor?: string;
}) {
  const max = Math.max(1, ...values.map((value) => Math.abs(value)));
  return (
    <View style={styles.bars}>
      {values.map((value, index) => (
        <View key={`${String(index)}:${String(value)}`} style={styles.barTrack}>
          <View
            style={{
              height: Math.max(2, (Math.abs(value) / max) * 34),
              backgroundColor: value >= 0 ? positiveColor : negativeColor,
            }}
          />
        </View>
      ))}
    </View>
  );
}

export function Notice({
  title,
  children,
  tone = "info",
}: {
  readonly title?: string;
  readonly children: ReactNode;
  readonly tone?: "info" | "warning" | "critical";
}) {
  return (
    <View
      style={[
        styles.notice,
        tone === "warning" ? styles.noticeWarning : null,
        tone === "critical" ? styles.noticeCritical : null,
      ]}
    >
      {title === undefined ? null : <Text style={styles.noticeTitle}>{title}</Text>}
      <Text style={styles.noticeBody}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  sectionSubtitle: {
    color: colors.muted,
    fontSize: 12,
    marginTop: spacing.xs,
    lineHeight: 17,
  },
  sectionBody: { marginTop: spacing.md },
  statRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: spacing.xs,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  statLabelWrap: { flexShrink: 1, paddingRight: spacing.sm },
  statLabel: { color: colors.muted, fontSize: 13 },
  statDetail: { color: colors.faint, fontSize: 10, marginTop: 1 },
  statValue: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
    textAlign: "right",
  },
  button: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 40,
    justifyContent: "center",
  },
  buttonAccent: { backgroundColor: colors.accent, borderColor: colors.accent },
  buttonDanger: { borderColor: colors.red },
  buttonPressed: { opacity: 0.75 },
  buttonDisabled: { opacity: 0.45 },
  buttonLabel: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
  },
  buttonLabelAccent: { color: colors.accentText },
  buttonLabelDisabled: { color: colors.faint },
  pill: {
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginRight: spacing.xs,
  },
  pillActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  pillLabel: { color: colors.muted, fontSize: 11, fontWeight: "600" },
  pillLabelActive: { color: colors.accentText },
  bars: {
    flexDirection: "row",
    alignItems: "flex-end",
    height: 38,
    gap: 2,
    marginTop: spacing.sm,
  },
  barTrack: { flex: 1, justifyContent: "flex-end" },
  notice: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.md,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  noticeWarning: { borderColor: colors.accent },
  noticeCritical: { borderColor: colors.red },
  noticeTitle: { color: colors.text, fontSize: 12, fontWeight: "700", marginBottom: 3 },
  noticeBody: { color: colors.muted, fontSize: 11, lineHeight: 16 },
});

import type { ReactNode } from "react";
import { Platform, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { colors, radii, spacing, type } from "../theme";

/** Panel: the primary content container of the M11 interface. */
export function Panel({
  title,
  subtitle,
  actions,
  children,
  tone = "default",
  style,
}: {
  readonly title?: string;
  readonly subtitle?: string | undefined;
  readonly actions?: ReactNode | undefined;
  readonly children: ReactNode;
  readonly tone?: "default" | "raised" | "quiet";
  readonly style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        styles.panel,
        tone === "raised" ? styles.panelRaised : null,
        tone === "quiet" ? styles.panelQuiet : null,
        style,
      ]}
    >
      {title === undefined ? null : (
        <View style={styles.panelHeader}>
          <View style={styles.panelHeaderText}>
            <Text style={type.section}>{title}</Text>
            {subtitle === undefined ? null : (
              <Text style={[type.small, styles.panelSubtitle]}>{subtitle}</Text>
            )}
          </View>
          {actions === undefined ? null : <View style={styles.panelActions}>{actions}</View>}
        </View>
      )}
      {title === undefined && subtitle !== undefined ? (
        <Text style={[type.small, styles.panelSubtitle]}>{subtitle}</Text>
      ) : null}
      <View style={styles.panelBody}>{children}</View>
    </View>
  );
}

/** Legacy alias used by the pre-M11 screens; now renders a design-system panel. */
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
    <Panel title={title} subtitle={subtitle}>
      {children}
    </Panel>
  );
}

/** One labelled figure with optional detail and a tone. */
export function StatRow({
  label,
  value,
  detail,
  tone = "default",
  mono = true,
}: {
  readonly label: string;
  readonly value: string;
  readonly detail?: string | undefined;
  readonly tone?: "default" | "positive" | "negative" | "accent" | "muted";
  readonly mono?: boolean;
}) {
  const valueColor =
    tone === "positive"
      ? colors.green
      : tone === "negative"
        ? colors.red
        : tone === "accent"
          ? colors.accentStrong
          : tone === "muted"
            ? colors.muted
            : colors.textStrong;
  return (
    <View style={styles.statRow}>
      <View style={styles.statLabelWrap}>
        <Text style={styles.statLabel}>{label}</Text>
        {detail === undefined ? null : <Text style={styles.statDetail}>{detail}</Text>}
      </View>
      <Text style={[mono ? type.number : type.body, { color: valueColor }, styles.statValue]}>
        {value}
      </Text>
    </View>
  );
}

/** Compact headline figure for the top bar / overview. */
export function Metric({
  label,
  value,
  detail,
  tone = "default",
}: {
  readonly label: string;
  readonly value: string;
  readonly detail?: string | undefined;
  readonly tone?: "default" | "positive" | "negative" | "accent";
}) {
  const color =
    tone === "positive"
      ? colors.green
      : tone === "negative"
        ? colors.red
        : tone === "accent"
          ? colors.accentStrong
          : colors.textStrong;
  return (
    <View style={styles.metric}>
      <Text style={type.label}>{label}</Text>
      <Text style={[type.numberLarge, { color }]} numberOfLines={1}>
        {value}
      </Text>
      {detail === undefined ? null : (
        <Text style={type.tiny} numberOfLines={1}>
          {detail}
        </Text>
      )}
    </View>
  );
}

export function Button({
  label,
  onPress,
  disabled = false,
  tone = "default",
  size = "md",
  accessibilityLabel,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly disabled?: boolean;
  readonly tone?: "default" | "primary" | "accent" | "danger" | "ghost";
  readonly size?: "sm" | "md" | "lg";
  readonly accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        size === "sm" ? styles.buttonSm : size === "lg" ? styles.buttonLg : null,
        tone === "primary" || tone === "accent" ? styles.buttonPrimary : null,
        tone === "danger" ? styles.buttonDanger : null,
        tone === "ghost" ? styles.buttonGhost : null,
        pressed ? styles.buttonPressed : null,
        disabled ? styles.disabled : null,
      ]}
    >
      <Text
        style={[
          styles.buttonLabel,
          tone === "primary" || tone === "accent" ? styles.buttonLabelPrimary : null,
          disabled ? styles.buttonLabelDisabled : null,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** Legacy alias. */
export const ActionButton = Button;

export function Chip({
  label,
  active,
  onPress,
  disabled = false,
  tone = "default",
}: {
  readonly label: string;
  readonly active: boolean;
  readonly onPress: () => void;
  readonly disabled?: boolean;
  readonly tone?: "default" | "accent";
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active, disabled }}
      /*
       * React Native Web drops `accessibilityState.selected` for role=button,
       * so the active filter/layer/speed would be visual-only. aria-pressed is
       * the correct state for a toggle button. The prop is web-only so a native
       * build is not given an unsupported accessibility prop.
       */
      {...(Platform.OS === "web" ? ({ "aria-pressed": active } as object) : {})}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.chip,
        active ? (tone === "accent" ? styles.chipAccent : styles.chipActive) : null,
        disabled ? styles.disabled : null,
      ]}
    >
      <Text
        style={[
          styles.chipLabel,
          active ? (tone === "accent" ? styles.chipLabelAccent : styles.chipLabelActive) : null,
          disabled ? styles.buttonLabelDisabled : null,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** Legacy alias. */
export const Pill = Chip;

export function Badge({
  label,
  tone = "neutral",
}: {
  readonly label: string;
  readonly tone?: "neutral" | "accent" | "positive" | "danger" | "muted";
}) {
  const background =
    tone === "accent"
      ? "rgba(201,162,39,0.16)"
      : tone === "positive"
        ? "rgba(129,169,130,0.16)"
        : tone === "danger"
          ? "rgba(197,122,107,0.18)"
          : tone === "muted"
            ? "rgba(110,125,123,0.14)"
            : "rgba(53,70,79,0.35)";
  const color =
    tone === "accent"
      ? colors.accentStrong
      : tone === "positive"
        ? colors.green
        : tone === "danger"
          ? colors.red
          : tone === "muted"
            ? colors.faint
            : colors.muted;
  return (
    <View style={[styles.badge, { backgroundColor: background }]}>
      <Text style={[styles.badgeLabel, { color }]}>{label}</Text>
    </View>
  );
}

export function Divider({ style }: { readonly style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.divider, style]} />;
}

export function Notice({
  title,
  children,
  tone = "info",
}: {
  readonly title?: string | undefined;
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

export function EmptyState({ title, body }: { readonly title: string; readonly body?: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      {body === undefined ? null : <Text style={styles.emptyBody}>{body}</Text>}
    </View>
  );
}

export function ProgressBar({
  value,
  tone = "default",
}: {
  readonly value: number;
  readonly tone?: "default" | "positive" | "negative" | "accent";
}) {
  const clamped = Math.max(0, Math.min(1, value));
  return (
    <View style={styles.progressTrack}>
      <View
        style={[
          styles.progressFill,
          {
            width: `${clamped * 100}%`,
            backgroundColor:
              tone === "positive"
                ? colors.green
                : tone === "negative"
                  ? colors.red
                  : tone === "accent"
                    ? colors.accent
                    : colors.blue,
          },
        ]}
      />
    </View>
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

/** Small section caption used inside panels. */
export function Caption({ children }: { readonly children: ReactNode }) {
  return <Text style={[type.label, styles.caption]}>{children}</Text>;
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  panelRaised: { backgroundColor: colors.surfaceRaised },
  panelQuiet: { backgroundColor: colors.backgroundAlt, borderColor: colors.border },
  panelHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  panelHeaderText: { flexShrink: 1 },
  panelSubtitle: { marginTop: 3, maxWidth: 760 },
  panelActions: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  panelBody: { marginTop: spacing.md },
  statRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 6,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  statLabelWrap: { flexShrink: 1, paddingRight: spacing.sm, maxWidth: "68%" },
  statLabel: { ...type.body, color: colors.text },
  statDetail: { ...type.tiny, marginTop: 1 },
  statValue: { textAlign: "right", flexShrink: 0 },
  metric: { minWidth: 96, paddingRight: spacing.md },
  button: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.borderStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 36,
    justifyContent: "center",
  },
  buttonSm: { minHeight: 28, paddingVertical: 4, paddingHorizontal: spacing.sm },
  buttonLg: { minHeight: 44, paddingHorizontal: spacing.lg },
  buttonPrimary: { backgroundColor: colors.accent, borderColor: colors.accent },
  buttonDanger: { borderColor: colors.red },
  buttonGhost: { backgroundColor: "transparent", borderColor: "transparent" },
  buttonPressed: { opacity: 0.72 },
  disabled: { opacity: 0.42 },
  buttonLabel: { color: colors.text, fontSize: 11.5, fontWeight: "600", textAlign: "center" },
  buttonLabelPrimary: { color: colors.accentText },
  buttonLabelDisabled: { color: colors.faint },
  chip: {
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  chipActive: { backgroundColor: colors.surfaceHover, borderColor: colors.borderStrong },
  chipAccent: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipLabel: { color: colors.muted, fontSize: 10.5, fontWeight: "600" },
  chipLabelActive: { color: colors.textStrong },
  chipLabelAccent: { color: colors.accentText },
  badge: {
    borderRadius: radii.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: "flex-start",
  },
  badgeLabel: {
    fontSize: 8.5,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
  notice: {
    backgroundColor: colors.backgroundAlt,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderLeftColor: colors.blue,
    borderLeftWidth: 2,
    borderRadius: radii.sm,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  noticeWarning: { borderLeftColor: colors.accent },
  noticeCritical: { borderLeftColor: colors.red },
  noticeTitle: { color: colors.textStrong, fontSize: 11.5, fontWeight: "700", marginBottom: 3 },
  noticeBody: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  empty: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderStyle: "dashed",
    alignItems: "center",
  },
  emptyTitle: { ...type.body, color: colors.muted },
  emptyBody: { ...type.tiny, marginTop: 4, textAlign: "center" },
  progressTrack: {
    height: 4,
    backgroundColor: colors.surfaceRaised,
    borderRadius: 2,
    overflow: "hidden",
    marginVertical: spacing.xs,
  },
  progressFill: { height: 4, borderRadius: 2 },
  bars: {
    flexDirection: "row",
    alignItems: "flex-end",
    height: 38,
    gap: 2,
    marginTop: spacing.sm,
  },
  barTrack: { flex: 1, justifyContent: "flex-end" },
  caption: { marginBottom: spacing.xs },
});

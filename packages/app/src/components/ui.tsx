import { useState, type ReactNode } from "react";
import { Platform, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { colors, fonts, radii, spacing, themedSheet, TOUCH_TARGET, type } from "../theme";

/** Panel: the primary content container inside a sheet. */
export function Panel({
  title,
  subtitle,
  actions,
  children,
  tone = "default",
  folded = false,
  style,
}: {
  readonly title?: string;
  readonly subtitle?: string | undefined;
  readonly actions?: ReactNode | undefined;
  readonly children: ReactNode;
  readonly tone?: "default" | "raised" | "quiet";
  /** Starts closed behind its title: detail a small screen keeps one tap away. */
  readonly folded?: boolean;
  readonly style?: StyleProp<ViewStyle>;
}) {
  const [open, setOpen] = useState(!folded);
  return (
    <View
      style={[
        styles.panel,
        tone === "raised" ? styles.panelRaised : null,
        tone === "quiet" ? styles.panelQuiet : null,
        style,
      ]}
    >
      {title === undefined ? null : folded ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          onPress={() => setOpen((value) => !value)}
          style={styles.foldHead}
        >
          <Text style={[type.section, styles.panelHeaderText]}>{title}</Text>
          <Text style={styles.disclosureMark}>{open ? "–" : "+"}</Text>
        </Pressable>
      ) : (
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
      {folded && open && subtitle !== undefined ? <Text style={type.small}>{subtitle}</Text> : null}
      {open ? <View style={title === undefined ? null : styles.panelBody}>{children}</View> : null}
    </View>
  );
}

/** Legacy alias used by the pre-M11 screens; now renders a design-system panel. */
export function Section({
  title,
  subtitle,
  folded = false,
  children,
}: {
  readonly title: string;
  readonly subtitle?: string;
  readonly folded?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <Panel title={title} subtitle={subtitle} folded={folded}>
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
      <View style={styles.statTop}>
        <Text style={styles.statLabel}>{label}</Text>
        <Text style={[mono ? type.number : type.body, { color: valueColor }, styles.statValue]}>
          {value}
        </Text>
      </View>
      {detail === undefined ? null : <Text style={styles.statDetail}>{detail}</Text>}
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

/**
 * The head of a dense screen on a small display: the number that matters, then
 * its trend when real history exists, then one line of detail. Tables follow it.
 */
export function Headline({
  label,
  value,
  tone = "default",
  trend,
  detail,
}: {
  readonly label: string;
  readonly value: string;
  readonly tone?: "default" | "positive" | "negative" | "accent";
  /** Oldest first; only real recorded values. Fewer than two draws nothing. */
  readonly trend?: readonly number[] | undefined;
  readonly detail?: string | undefined;
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
    <View style={styles.headline}>
      <View style={styles.headlineText}>
        <Text style={type.label}>{label}</Text>
        <Text style={[type.numberLarge, { color }]} numberOfLines={1} adjustsFontSizeToFit>
          {value}
        </Text>
        {detail === undefined ? null : <Text style={type.tiny}>{detail}</Text>}
      </View>
      {trend === undefined || trend.length < 2 ? null : (
        <View style={styles.headlineTrend}>
          <MiniBars values={trend.slice(-12)} />
        </View>
      )}
    </View>
  );
}

/** Detail a small screen keeps one tap away, so nothing is lost and little is shown. */
export function Disclosure({
  title,
  children,
  initiallyOpen = false,
  onToggle,
}: {
  readonly title: string;
  readonly children: ReactNode;
  readonly initiallyOpen?: boolean;
  /** Called with the new state when the user opens or closes it. */
  readonly onToggle?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <View style={styles.disclosure}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => {
          const next = !open;
          setOpen(next);
          onToggle?.(next);
        }}
        style={styles.disclosureHead}
      >
        <Text style={styles.disclosureTitle}>{title}</Text>
        <Text style={styles.disclosureMark}>{open ? "–" : "+"}</Text>
      </Pressable>
      {open ? <View style={styles.disclosureBody}>{children}</View> : null}
    </View>
  );
}

/** One row of a dense table: name, value, and whatever else underneath. */
export function DataRow({
  title,
  value,
  note,
  valueTone = "default",
}: {
  readonly title: string;
  readonly value: string;
  readonly note?: string | undefined;
  readonly valueTone?: "default" | "accent" | "muted";
}) {
  return (
    <View style={styles.dataRow}>
      <View style={styles.statTop}>
        <Text style={styles.dataTitle} numberOfLines={2}>
          {title}
        </Text>
        <Text
          style={[
            type.number,
            valueTone === "accent" ? { color: colors.accentStrong } : null,
            valueTone === "muted" ? { color: colors.muted } : null,
            styles.statValue,
          ]}
        >
          {value}
        </Text>
      </View>
      {note === undefined ? null : <Text style={styles.statDetail}>{note}</Text>}
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
        size === "lg" ? styles.buttonLg : null,
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
          size === "lg" ? styles.buttonLabelLg : null,
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
      ? colors.accentSoft
      : tone === "positive"
        ? colors.greenSoft
        : tone === "danger"
          ? colors.redSoft
          : colors.neutralSoft;
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
  // Warnings stay open; an explanation folds away behind its title.
  const [open, setOpen] = useState(tone !== "info" || title === undefined);
  return (
    <View
      style={[
        styles.notice,
        tone === "warning" ? styles.noticeWarning : null,
        tone === "critical" ? styles.noticeCritical : null,
      ]}
    >
      {title === undefined ? null : (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          onPress={() => setOpen((value) => !value)}
          style={styles.noticeHead}
        >
          <Text style={styles.noticeTitle}>{title}</Text>
          <Text style={styles.disclosureMark}>{open ? "–" : "+"}</Text>
        </Pressable>
      )}
      {open ? <Text style={styles.noticeBody}>{children}</Text> : null}
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
  positiveColor,
  negativeColor,
}: {
  readonly values: readonly number[];
  readonly positiveColor?: string;
  readonly negativeColor?: string;
}) {
  const positive = positiveColor ?? colors.green;
  const negative = negativeColor ?? colors.red;
  const max = Math.max(1, ...values.map((value) => Math.abs(value)));
  return (
    <View style={styles.bars}>
      {values.map((value, index) => (
        <View key={`${String(index)}:${String(value)}`} style={styles.barTrack}>
          <View
            style={{
              height: Math.max(2, (Math.abs(value) / max) * 34),
              backgroundColor: value >= 0 ? positive : negative,
            }}
          />
        </View>
      ))}
    </View>
  );
}

/**
 * The house rule: a hairline in the era accent through a small lozenge. It sits
 * under the game's name, every entry-panel title and every dialog title, which
 * is most of what ties the title screen to the rest of the interface.
 */
export function Ornament({
  align = "start",
  width,
  style,
}: {
  readonly align?: "start" | "center";
  readonly width?: number;
  readonly style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[styles.ornament, width === undefined ? null : { width }, style]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {align === "center" ? <View style={styles.ornamentLine} /> : null}
      <View style={styles.ornamentLozenge} />
      <View style={styles.ornamentLine} />
    </View>
  );
}

/** Small section caption used inside panels. */
export function Caption({ children }: { readonly children: ReactNode }) {
  return <Text style={[type.label, styles.caption]}>{children}</Text>;
}

const styles = themedSheet(() => ({
  panel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  panelRaised: { backgroundColor: colors.surfaceRaised },
  panelQuiet: { backgroundColor: colors.backgroundAlt },
  panelHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  panelHeaderText: { flexShrink: 1 },
  panelSubtitle: { marginTop: 2 },
  panelActions: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  panelBody: { marginTop: spacing.sm },
  foldHead: {
    minHeight: TOUCH_TARGET,
    marginVertical: -spacing.xs,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  statRow: {
    paddingVertical: 6,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  statTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: spacing.sm,
  },
  statLabel: { ...type.small, color: colors.text, flexShrink: 1 },
  statDetail: { ...type.tiny, marginTop: 1 },
  statValue: { textAlign: "right", flexShrink: 0, maxWidth: "62%" },
  metric: { minWidth: 96, paddingRight: spacing.md },
  headline: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  headlineText: { flex: 1, minWidth: 0 },
  headlineTrend: { width: 96 },
  disclosure: {
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  disclosureHead: {
    minHeight: TOUCH_TARGET,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  disclosureTitle: { ...type.small, color: colors.text, fontFamily: fonts.sansMedium, flexShrink: 1 },
  disclosureMark: { ...type.section, color: colors.accentStrong, width: 20, textAlign: "center" },
  disclosureBody: { paddingBottom: spacing.sm },
  dataRow: {
    paddingVertical: 5,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  dataTitle: { ...type.small, color: colors.text, flexShrink: 1 },
  button: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    minHeight: TOUCH_TARGET,
    justifyContent: "center",
  },
  buttonLg: { minHeight: 48, paddingHorizontal: spacing.lg },
  buttonPrimary: { backgroundColor: colors.accent, borderColor: colors.accentStrong },
  buttonDanger: { borderColor: colors.red },
  buttonGhost: { backgroundColor: "transparent", borderColor: "transparent" },
  buttonPressed: { opacity: 0.72 },
  disabled: { opacity: 0.42 },
  buttonLabel: { ...type.small, color: colors.textStrong, fontFamily: fonts.sansSemiBold, textAlign: "center" },
  buttonLabelLg: { fontSize: 13, letterSpacing: 1.6, textTransform: "uppercase" },
  buttonLabelPrimary: { color: colors.accentText },
  buttonLabelDisabled: { color: colors.faint },
  chip: {
    minHeight: TOUCH_TARGET,
    minWidth: TOUCH_TARGET,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.surfaceHover },
  chipAccent: { backgroundColor: colors.accent },
  chipLabel: { ...type.small, color: colors.muted, fontFamily: fonts.sansMedium },
  chipLabelActive: { color: colors.textStrong },
  chipLabelAccent: { color: colors.accentText },
  badge: {
    borderRadius: radii.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: "flex-start",
  },
  badgeLabel: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
  notice: {
    backgroundColor: colors.backgroundAlt,
    borderLeftColor: colors.blue,
    borderLeftWidth: 2,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.xs,
    marginTop: spacing.sm,
  },
  noticeWarning: { borderLeftColor: colors.accent },
  noticeCritical: { borderLeftColor: colors.red },
  noticeHead: {
    minHeight: TOUCH_TARGET,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  noticeTitle: { ...type.small, color: colors.textStrong, fontFamily: fonts.sansSemiBold, flexShrink: 1 },
  noticeBody: { ...type.small, paddingBottom: spacing.xs },
  empty: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderStyle: "dashed",
    alignItems: "center",
  },
  emptyTitle: { ...type.body, color: colors.muted, textAlign: "center" },
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
  },
  barTrack: { flex: 1, justifyContent: "flex-end" },
  caption: { marginBottom: spacing.xs },
  ornament: { flexDirection: "row", alignItems: "center", gap: 6, height: 9 },
  ornamentLine: { flex: 1, height: StyleSheet.hairlineWidth * 2, backgroundColor: colors.accentLine },
  ornamentLozenge: {
    width: 6,
    height: 6,
    borderWidth: 1,
    borderColor: colors.accent,
    transform: [{ rotate: "45deg" }],
  },
}));

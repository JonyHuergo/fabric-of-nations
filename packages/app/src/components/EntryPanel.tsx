import type { ReactNode } from "react";
import { Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { shellMetrics } from "../design/tokens";
import { TOUCH_TARGET, colors, radii, spacing, themedSheet, type } from "../theme";
import { Icon } from "./icons";
import { Ornament } from "./ui";

/** Width of the panel the entry screens slide over the map. */
export function useEntryPanelWidth(): number {
  const { width, height } = useWindowDimensions();
  const safe = useSafeAreaInsets();
  return shellMetrics(width, height).menuPanelWidth + safe.right;
}

/**
 * The panel every screen outside the game uses: main menu, briefing and country
 * selection all slide over the same map, the way the sheets do in play.
 */
export function EntryPanel({
  kicker,
  title,
  onBack,
  backLabel,
  footer,
  scroll = true,
  children,
}: {
  readonly kicker: string;
  readonly title: string;
  readonly onBack?: () => void;
  readonly backLabel?: string;
  readonly footer?: ReactNode;
  readonly scroll?: boolean;
  readonly children: ReactNode;
}) {
  const width = useEntryPanelWidth();
  const safe = useSafeAreaInsets();
  const body = <View style={styles.body}>{children}</View>;
  return (
    <View style={[styles.panel, { width, paddingRight: safe.right, paddingTop: safe.top + spacing.sm }]}>
      <View style={styles.header}>
        {onBack === undefined ? null : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={backLabel ?? "Back"}
            onPress={onBack}
            style={styles.back}
          >
            <Icon name="back" />
          </Pressable>
        )}
        <View style={styles.headerText}>
          <Text style={styles.kicker} numberOfLines={1}>
            {kicker}
          </Text>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <Ornament width={132} style={styles.rule} />
        </View>
      </View>
      {scroll ? (
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {body}
        </ScrollView>
      ) : (
        <View style={styles.scroll}>{body}</View>
      )}
      {footer === undefined ? null : (
        <View style={[styles.footer, { paddingBottom: safe.bottom + spacing.sm }]}>{footer}</View>
      )}
    </View>
  );
}

const styles = themedSheet(() => ({
  panel: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.chrome,
    borderTopLeftRadius: radii.lg,
    borderBottomLeftRadius: radii.lg,
    borderLeftWidth: 1,
    borderLeftColor: colors.accentLine,
  },
  header: {
    minHeight: TOUCH_TARGET + spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xs,
  },
  back: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    marginLeft: -spacing.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: { flex: 1, minWidth: 0 },
  kicker: { ...type.eyebrow },
  title: { ...type.title, marginTop: 1 },
  rule: { marginTop: spacing.xs },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: spacing.md },
  body: { flex: 1, paddingHorizontal: spacing.md, gap: spacing.xs },
  footer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
}));

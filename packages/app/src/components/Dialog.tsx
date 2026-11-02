import type { ReactNode } from "react";
import { Modal, ScrollView, Text, View } from "react-native";

import { colors, radii, spacing, themedSheet, type } from "../theme";
import { Ornament } from "./ui";

/** A modal on iOS rotates the app to portrait unless told otherwise. */
const LANDSCAPE = ["landscape", "landscape-left", "landscape-right"] as const;

/**
 * The one dialog: a card over the dimmed map, titled the way the entry panels
 * are, with an eyebrow, a serif title and the house rule beneath it.
 */
export function Dialog({
  visible,
  kicker,
  title,
  onRequestClose,
  actions,
  wide = false,
  scroll = false,
  children,
}: {
  readonly visible: boolean;
  readonly kicker?: string;
  readonly title: string;
  readonly onRequestClose?: () => void;
  readonly actions?: ReactNode;
  readonly wide?: boolean;
  readonly scroll?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      supportedOrientations={LANDSCAPE}
      {...(onRequestClose === undefined ? {} : { onRequestClose })}
    >
      <View style={styles.backdrop}>
        <View style={[styles.card, wide ? styles.cardWide : null]}>
          <View style={styles.header}>
            {kicker === undefined ? null : <Text style={type.eyebrow}>{kicker}</Text>}
            <Text style={styles.title}>{title}</Text>
            <Ornament style={styles.rule} />
          </View>
          {scroll ? (
            <ScrollView style={styles.scroll} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
              {children}
            </ScrollView>
          ) : (
            <View style={styles.body}>{children}</View>
          )}
          {actions === undefined ? null : <View style={styles.actions}>{actions}</View>}
        </View>
      </View>
    </Modal>
  );
}

const styles = themedSheet(() => ({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  card: {
    width: "100%",
    maxWidth: 520,
    maxHeight: "94%",
    backgroundColor: colors.background,
    borderColor: colors.accentLine,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  cardWide: { maxWidth: 680 },
  header: { gap: 2 },
  title: { ...type.title },
  rule: { marginTop: spacing.xs, width: 140 },
  scroll: { flexShrink: 1 },
  body: { gap: 6 },
  actions: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap", justifyContent: "flex-end" },
}));

/**
 * P3 (D-141): the display-currency selector of the Settings panel.
 *
 * Choosing a currency only changes how amounts are shown; it sends nothing to the
 * simulation and is stored per device, not in the save. Rows are full-width touch targets
 * (at least `TOUCH_TARGET`), styled from the design tokens, with no hover state.
 */

import { Platform, Pressable, Text, View } from "react-native";

import { useDisplayCurrency } from "../format/DisplayCurrency";
import { useSimulation } from "../worker/SimulationProvider";
import {
  RUSD_FORMAT,
  createMoneyFormat,
  displayCurrencyOptions,
  type DisplayCurrencyChoice,
  type DisplayCurrencyOption,
  type MoneySource,
} from "../format/money";
import { colors, fonts, radii, spacing, themedSheet, TOUCH_TARGET, type } from "../theme";
import { Disclosure, Notice } from "./ui";

/** One million RUSD, the amount the selector previews. */
const PREVIEW_RUSD = 1_000_000;

function OptionRow({
  option,
  selected,
  onSelect,
}: {
  readonly option: DisplayCurrencyOption;
  readonly selected: boolean;
  readonly onSelect: (choice: DisplayCurrencyChoice) => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={`Display currency: ${option.label}`}
      accessibilityState={{ checked: selected, selected }}
      {...(Platform.OS === "web" ? ({ "aria-checked": selected } as object) : {})}
      onPress={() => onSelect(option.choice)}
      style={({ pressed }) => [styles.row, selected ? styles.rowSelected : null, pressed ? styles.rowPressed : null]}
    >
      <View style={[styles.mark, selected ? styles.markSelected : null]} />
      <Text style={[styles.label, selected ? styles.labelSelected : null]} numberOfLines={1}>
        {option.label}
      </Text>
      <Text style={styles.detail} numberOfLines={1}>
        {option.detail}
      </Text>
    </Pressable>
  );
}

/** `source` defaults to the live snapshot; the title screen passes the world it shows. */
export function DisplayCurrencySettings({ source }: { readonly source?: MoneySource | null }) {
  const { snapshot } = useSimulation();
  const { choice, setChoice } = useDisplayCurrency();
  const shown = source === undefined ? snapshot : source;
  const options = displayCurrencyOptions(shown);
  const money = createMoneyFormat(shown, choice);
  const [own, rusd, ...registered] = options;
  const chosenIsRegistered = registered.some((option) => option.choice === choice);
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Display currency">
      <Text style={styles.help}>
        The simulation counts in RUSD. Amounts are converted to the currency chosen here when
        they are shown; the choice changes nothing in the world and is kept on this device.
      </Text>
      <Text style={styles.preview} accessibilityLabel="Display currency example">
        {RUSD_FORMAT.format(PREVIEW_RUSD)} shows as {money.format(PREVIEW_RUSD)}
      </Text>
      {money.fallbackReason === null ? null : (
        <Notice title="Shown in RUSD" tone="warning">
          {money.fallbackReason}
        </Notice>
      )}
      {own === undefined ? null : <OptionRow option={own} selected={choice === own.choice} onSelect={setChoice} />}
      {rusd === undefined ? null : <OptionRow option={rusd} selected={choice === rusd.choice} onSelect={setChoice} />}
      <Disclosure title={`Other currencies · ${String(registered.length)}`} initiallyOpen={chosenIsRegistered}>
        {registered.map((option) => (
          <OptionRow key={option.choice} option={option} selected={choice === option.choice} onSelect={setChoice} />
        ))}
      </Disclosure>
    </View>
  );
}

const styles = themedSheet(() => ({
  help: { ...type.small, color: colors.muted, marginBottom: spacing.xs },
  preview: { ...type.mono, color: colors.textStrong, marginBottom: spacing.sm },
  row: {
    minHeight: TOUCH_TARGET,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.sm,
    backgroundColor: colors.surface,
    marginBottom: spacing.xs,
  },
  rowSelected: { backgroundColor: colors.surfaceHover },
  rowPressed: { opacity: 0.72 },
  mark: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: colors.border,
  },
  markSelected: { backgroundColor: colors.accent, borderColor: colors.accentStrong },
  label: { ...type.small, color: colors.text, fontFamily: fonts.sansMedium, flexShrink: 1, flexGrow: 1 },
  labelSelected: { color: colors.textStrong, fontFamily: fonts.sansSemiBold },
  detail: { ...type.mono, color: colors.muted },
}));

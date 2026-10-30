import { Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { fitFlagInBox } from "../flags/flagLayout";
import { flagAssetForPolity } from "../flags/flagRegistry";
import { COUNTRY_FLAG_SIZES, type CountryFlagSize } from "../flags/flagSizes";
import { colors, nationColor } from "../theme";

/**
 * A bundled historical flag for a 1900 polity.
 *
 * The flag is contained in a fixed box so lists and headers stay aligned, and
 * keeps its original proportions. When no verified flag artwork exists the
 * existing monogram (national colour + two-letter tag) is rendered instead.
 */
export function CountryFlag({
  polityId,
  tag,
  monogramTag,
  size = "picker",
  style,
  accessibilityLabel,
}: {
  readonly polityId: number | null | undefined;
  readonly tag: string;
  /** Tag whose national colour backs the monogram (the sovereign for a territory). */
  readonly monogramTag?: string;
  readonly size?: CountryFlagSize;
  readonly style?: StyleProp<ViewStyle>;
  readonly accessibilityLabel?: string;
}) {
  const box = COUNTRY_FLAG_SIZES[size];
  const asset = flagAssetForPolity(polityId);

  if (asset === null) {
    return (
      <View
        style={[
          styles.frame,
          styles.monogram,
          {
            width: box.width,
            height: box.height,
            backgroundColor: nationColor(monogramTag ?? tag),
          },
          style,
        ]}
        accessibilityRole="image"
        accessibilityLabel={accessibilityLabel ?? `${tag} monogram`}
      >
        <Text
          style={[styles.monogramText, { fontSize: monogramFontSize(box.height) }]}
          numberOfLines={1}
        >
          {monogramLabel(tag)}
        </Text>
      </View>
    );
  }

  const layout = fitFlagInBox(box, asset.aspectRatio);
  return (
    <View style={[styles.frame, { width: box.width, height: box.height }, style]}>
      <Image
        source={asset.source}
        style={{ width: layout.width, height: layout.height }}
        resizeMode="contain"
        accessibilityRole="image"
        accessibilityLabel={accessibilityLabel ?? `${tag} historical flag of 1900`}
      />
    </View>
  );
}

function monogramLabel(tag: string): string {
  const trimmed = tag.trim();
  return trimmed.length >= 2 ? trimmed.slice(0, 2).toUpperCase() : "??";
}

function monogramFontSize(height: number): number {
  return Math.max(8, Math.min(Math.round(height * 0.46), 18));
}

const styles = StyleSheet.create({
  frame: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,0,0,0.45)",
    borderRadius: 2,
    overflow: "hidden",
    backgroundColor: colors.backgroundAlt,
  },
  monogram: {
    borderWidth: 1,
  },
  monogramText: {
    color: "#f7f1e1",
    fontWeight: "800",
    letterSpacing: 1,
    textAlign: "center",
  },
});

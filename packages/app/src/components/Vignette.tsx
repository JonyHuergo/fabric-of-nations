import { StyleSheet, View } from "react-native";
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from "react-native-svg";

import { colors } from "../theme";

/**
 * Shade laid over the map so type can sit on it. "title" darkens the left third,
 * where the title screen sets its name and menu, and closes in the corners like a
 * lens; "caption" only darkens the bottom edge under a caption. Drawing only:
 * it never takes a touch.
 */
export function Vignette({ variant }: { readonly variant: "title" | "caption" }) {
  const ink = colors.vignette;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="fon-vignette-side" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={ink} stopOpacity={0.94} />
            <Stop offset="0.3" stopColor={ink} stopOpacity={0.72} />
            <Stop offset="0.58" stopColor={ink} stopOpacity={0.12} />
            <Stop offset="1" stopColor={ink} stopOpacity={0} />
          </LinearGradient>
          <LinearGradient id="fon-vignette-foot" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={ink} stopOpacity={variant === "title" ? 0.45 : 0} />
            <Stop offset={variant === "title" ? "0.22" : "0.62"} stopColor={ink} stopOpacity={0} />
            <Stop offset="0.74" stopColor={ink} stopOpacity={0} />
            <Stop offset="1" stopColor={ink} stopOpacity={0.78} />
          </LinearGradient>
          <RadialGradient id="fon-vignette-lens" cx="58" cy="48" r="70" gradientUnits="userSpaceOnUse">
            <Stop offset="0.55" stopColor={ink} stopOpacity={0} />
            <Stop offset="1" stopColor={ink} stopOpacity={0.6} />
          </RadialGradient>
        </Defs>
        {variant === "title" ? (
          <>
            <Rect x="0" y="0" width="100" height="100" fill="url(#fon-vignette-lens)" />
            <Rect x="0" y="0" width="100" height="100" fill="url(#fon-vignette-side)" />
          </>
        ) : null}
        <Rect x="0" y="0" width="100" height="100" fill="url(#fon-vignette-foot)" />
      </Svg>
    </View>
  );
}

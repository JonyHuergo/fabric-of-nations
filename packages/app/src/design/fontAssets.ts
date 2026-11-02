import type { FontFamily } from "./tokens";

/**
 * The bundled faces, for `expo-font`. Keys match `FONT_FILES` in the tokens, and a
 * test holds the two together. The same files are embedded in the atlas page, so
 * interface and map use one font on every platform.
 */
export const FONT_ASSETS: Readonly<Record<FontFamily, number>> = {
  Newsreader_400Regular: require("../../assets/fonts/Newsreader_400Regular.ttf") as number,
  Newsreader_400Regular_Italic: require("../../assets/fonts/Newsreader_400Regular_Italic.ttf") as number,
  Newsreader_500Medium: require("../../assets/fonts/Newsreader_500Medium.ttf") as number,
  Newsreader_600SemiBold: require("../../assets/fonts/Newsreader_600SemiBold.ttf") as number,
  IBMPlexSansCondensed_400Regular: require("../../assets/fonts/IBMPlexSansCondensed_400Regular.ttf") as number,
  IBMPlexSansCondensed_500Medium: require("../../assets/fonts/IBMPlexSansCondensed_500Medium.ttf") as number,
  IBMPlexSansCondensed_600SemiBold: require("../../assets/fonts/IBMPlexSansCondensed_600SemiBold.ttf") as number,
  IBMPlexSansCondensed_700Bold: require("../../assets/fonts/IBMPlexSansCondensed_700Bold.ttf") as number,
};

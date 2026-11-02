import { Asset } from "expo-asset";

/**
 * On iOS and Android the atlas page ships as a packaged asset. `downloadAsync`
 * copies it to a real file (from the app package in a release build, from the
 * development server otherwise), which is what a WebView can load. It needs no
 * network in a release build.
 */
export async function resolveAtlasUri(): Promise<string> {
  const asset = Asset.fromModule(require("../../../public/map/atlas-v1.html") as number);
  await asset.downloadAsync();
  if (asset.localUri === null) throw new Error("the map asset could not be unpacked");
  return asset.localUri;
}

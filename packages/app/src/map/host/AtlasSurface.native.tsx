import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

import { resolveAtlasUri } from "./atlasAsset";
import type { AtlasSurfaceHandle, AtlasSurfaceProps } from "./AtlasSurface";

interface WebViewHandle {
  injectJavaScript(script: string): void;
}

/**
 * The native host of the atlas page: a WebView under the React Native interface.
 * Every gesture stays inside it, so the camera needs no per-frame bridge. The page
 * is self-contained: it reads no other file and its policy forbids the network, so
 * this view may only ever show local content. The guard compares schemes, not the
 * exact address, because a system may normalise a file path before reporting it.
 */
export const AtlasSurface = forwardRef<AtlasSurfaceHandle, AtlasSurfaceProps>(function AtlasSurface(
  { reloadKey, onMessage, onFailure },
  ref,
) {
  const webView = useRef<WebViewHandle | null>(null);
  const [uri, setUri] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    resolveAtlasUri().then(
      (value) => {
        if (!cancelled) setUri(value);
      },
      (error: unknown) => {
        if (!cancelled) onFailure(error instanceof Error ? error.message : String(error));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [onFailure]);

  useImperativeHandle(
    ref,
    () => ({
      send(message) {
        webView.current?.injectJavaScript(
          `if (typeof window.__fonMapReceive === "function") { window.__fonMapReceive(${JSON.stringify(message)}); } true;`,
        );
      },
    }),
    [],
  );

  if (uri === null) return <View style={styles.surface} />;
  return (
    <WebView
      key={reloadKey}
      ref={(node) => {
        webView.current = node as unknown as WebViewHandle | null;
      }}
      source={{ uri }}
      style={styles.surface}
      containerStyle={styles.surface}
      originWhitelist={["*"]}
      onShouldStartLoadWithRequest={(request) => /^(file|blob|about|data):/u.test(request.url)}
      javaScriptEnabled
      domStorageEnabled={false}
      cacheEnabled={false}
      allowFileAccess
      allowingReadAccessToURL={uri.slice(0, uri.lastIndexOf("/") + 1)}
      allowFileAccessFromFileURLs={false}
      allowUniversalAccessFromFileURLs={false}
      mixedContentMode="never"
      setSupportMultipleWindows={false}
      scrollEnabled={false}
      bounces={false}
      overScrollMode="never"
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
      setBuiltInZoomControls={false}
      setDisplayZoomControls={false}
      textInteractionEnabled={false}
      allowsLinkPreview={false}
      webviewDebuggingEnabled={__DEV__}
      onMessage={(event: WebViewMessageEvent) => onMessage(event.nativeEvent.data)}
      onError={(event) => onFailure(`the map page failed to load: ${event.nativeEvent.description}`)}
      onHttpError={(event) => onFailure(`the map page failed to load: ${String(event.nativeEvent.statusCode)}`)}
      onRenderProcessGone={() => onFailure("process-gone")}
      onContentProcessDidTerminate={() => onFailure("process-gone")}
    />
  );
});

const styles = StyleSheet.create({
  surface: { ...StyleSheet.absoluteFill, backgroundColor: "transparent" },
});

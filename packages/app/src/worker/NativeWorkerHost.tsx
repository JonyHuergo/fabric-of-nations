import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { StyleSheet, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

import {
  parseWorkerEvent,
  PROTOCOL_VERSION,
  type WorkerCommand,
  type WorkerEvent,
} from "@century/sim-worker";

import { SIM_WORKER_HTML } from "../generated/simWorker";

interface WebViewHandle {
  injectJavaScript(script: string): void;
}

export interface NativeWorkerHandle {
  send(command: WorkerCommand): void;
  close(): void;
  /** Remount the hidden WebView with a fresh simulation context. */
  restart(): void;
}

export interface NativeWorkerHostProps {
  readonly onEvent: (event: WorkerEvent) => void;
  readonly onReady: () => void;
  readonly onError: (message: string) => void;
}

function injectCommand(handle: WebViewHandle | null, command: WorkerCommand): void {
  if (handle === null) return;
  const json = JSON.stringify(command);
  handle.injectJavaScript(
    `if (typeof window.__centuryReceive === "function") { window.__centuryReceive(${JSON.stringify(json)}); } true;`,
  );
}

/**
 * The native simulation runs inside a hidden WebView, a separate JavaScript
 * context from the React Native UI thread. It is a proof-of-concept transport;
 * device performance must still be measured in a release build.
 */
export const NativeWorkerHost = forwardRef<NativeWorkerHandle, NativeWorkerHostProps>(
  function NativeWorkerHost({ onEvent, onReady, onError }, ref) {
    const webViewRef = useRef<WebViewHandle | null>(null);
    const readyRef = useRef(false);
    const pendingRef = useRef<WorkerCommand[]>([]);
    const [reloadKey, setReloadKey] = useState(0);

    const send = useCallback((command: WorkerCommand) => {
      if (!readyRef.current) {
        pendingRef.current.push(command);
        return;
      }
      injectCommand(webViewRef.current, command);
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        send,
        close() {
          if (readyRef.current) {
            injectCommand(webViewRef.current, {
              protocolVersion: PROTOCOL_VERSION,
              type: "SHUTDOWN",
              commandId: "app-native-close",
            });
          }
          pendingRef.current = [];
          readyRef.current = false;
        },
        restart() {
          pendingRef.current = [];
          readyRef.current = false;
          setReloadKey((value) => value + 1);
        },
      }),
      [send],
    );

    const handleMessage = useCallback(
      (event: WebViewMessageEvent) => {
        try {
          const parsed: unknown = JSON.parse(event.nativeEvent.data) as unknown;
          onEvent(parseWorkerEvent(parsed));
        } catch (error) {
          onError(error instanceof Error ? error.message : String(error));
        }
      },
      [onError, onEvent],
    );

    const handleLoadEnd = useCallback(() => {
      readyRef.current = true;

      const queued = pendingRef.current;
      pendingRef.current = [];
      for (const command of queued) injectCommand(webViewRef.current, command);
      onReady();
    }, [onReady]);

    return (
      <View style={styles.hidden} pointerEvents="none">
        <WebView
          key={reloadKey}
          ref={(node) => {
            webViewRef.current = node as unknown as WebViewHandle | null;
          }}
          source={{ html: SIM_WORKER_HTML }}
          originWhitelist={["*"]}
          javaScriptEnabled
          domStorageEnabled
          allowFileAccess={false}
          allowUniversalAccessFromFileURLs={false}
          onMessage={handleMessage}
          onLoadEnd={handleLoadEnd}
          onError={() => {
            readyRef.current = false;
            onError("native simulation WebView failed to load");
          }}
          onRenderProcessGone={() => {
            readyRef.current = false;
            pendingRef.current = [];
            onError(
              "native simulation WebView process was terminated by the operating system",
            );
          }}
          onContentProcessDidTerminate={() => {
            readyRef.current = false;
            pendingRef.current = [];
            onError("native simulation WebView content process terminated");
          }}
          style={styles.webView}
        />
      </View>
    );
  },
);

const styles = StyleSheet.create({
  hidden: {
    position: "absolute",
    width: 2,
    height: 2,
    left: -10,
    top: -10,
    opacity: 0,
  },
  webView: { width: 2, height: 2, backgroundColor: "transparent" },
});

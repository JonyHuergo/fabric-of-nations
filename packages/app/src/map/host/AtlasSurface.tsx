import { createElement, forwardRef, useEffect, useImperativeHandle, useRef } from "react";

export interface AtlasSurfaceHandle {
  send(message: string): void;
}

export interface AtlasSurfaceProps {
  /** Bump to load the page again from scratch. */
  readonly reloadKey: number;
  readonly onMessage: (message: string) => void;
  readonly onFailure: (reason: string) => void;
}

/**
 * The web host of the atlas page: an iframe. Native builds use the WebView in
 * `AtlasSurface.native.tsx`; both run the same page and speak the same protocol,
 * so anything verified here exercises the artifact a phone receives.
 */
export const AtlasSurface = forwardRef<AtlasSurfaceHandle, AtlasSurfaceProps>(function AtlasSurface(
  { reloadKey, onMessage },
  ref,
) {
  const frame = useRef<HTMLIFrameElement | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      send(message) {
        frame.current?.contentWindow?.postMessage({ fonMap: message }, "*");
      },
    }),
    [],
  );

  useEffect(() => {
    const listener = (event: MessageEvent<unknown>): void => {
      if (event.source !== frame.current?.contentWindow) return;
      const data = event.data as { fonMap?: unknown } | null;
      if (typeof data?.fonMap === "string") onMessage(data.fonMap);
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, [onMessage]);

  return createElement("iframe", {
    key: reloadKey,
    ref: frame,
    src: "map/atlas-v1.html",
    title: "World map",
    style: { position: "absolute", left: 0, top: 0, width: "100%", height: "100%", border: 0 },
  });
});

/**
 * Worker half of bundle decoding, so inflating and projecting about half a
 * million coordinates never blocks the page that is drawing the map.
 */

import { bundleTransferList } from "../renderBundle";
import { decodeBundle } from "./decodeBundle";

interface DecodeScope {
  onmessage: ((event: { readonly data: unknown }) => void) | null;
  postMessage(message: unknown, transfer?: ArrayBuffer[]): void;
}

const scope = globalThis as unknown as DecodeScope;

scope.onmessage = (event) => {
  decodeBundle(String(event.data)).then(
    (bundle) => scope.postMessage({ bundle }, bundleTransferList(bundle)),
    (error: unknown) => scope.postMessage({ error: String(error) }),
  );
};

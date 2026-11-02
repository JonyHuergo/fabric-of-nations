/**
 * Turns the base64 payload embedded in the atlas page into a render bundle. It
 * has no page dependencies, so the same code runs in a worker and, if a worker
 * cannot start, on the page.
 */

import { parseRenderBundle, type RenderBundle } from "../renderBundle";

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export async function decodeBundle(base64: string): Promise<RenderBundle> {
  if (typeof DecompressionStream !== "function") {
    throw new Error("render bundle: gzip decompression is unavailable");
  }
  const compressed = new Blob([base64ToBytes(base64) as BlobPart]);
  const inflated = compressed.stream().pipeThrough(new DecompressionStream("gzip"));
  return parseRenderBundle(new Uint8Array(await new Response(inflated).arrayBuffer()));
}

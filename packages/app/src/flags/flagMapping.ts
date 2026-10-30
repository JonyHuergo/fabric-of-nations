/**
 * Stable-ID flag resolution.
 *
 * The only key used to look up a flag is the numeric polity ID from the 1900
 * catalog. Display names, common names and capital names are never used, so
 * renaming a polity cannot silently change or break its flag.
 */

function isValidPolityId(polityId: number | null | undefined): polityId is number {
  return (
    polityId !== null &&
    polityId !== undefined &&
    Number.isInteger(polityId) &&
    polityId >= 0
  );
}

export function resolveBundledFlagId(
  polityId: number | null | undefined,
  mapping: Readonly<Record<number, string>>,
): string | null {
  if (!isValidPolityId(polityId)) return null;
  const flagId = mapping[polityId];
  return typeof flagId === "string" && flagId.length > 0 ? flagId : null;
}

/**
 * What the interface wants the map to show, and the smallest set of bridge
 * commands that gets it there. Pure, so the bridge traffic can be tested without
 * a WebView: an idle snapshot sends nothing, and a transfer sends one province.
 */

import type { EraId } from "../../design/tokens";
import type { MapCommand, ProvinceStateChange } from "../bridge/protocol";
import type { ReservedBox } from "../labels";
import type { MapModeId, ProvinceState } from "../mapModes";

export interface MapHostInputs {
  readonly eraId: EraId;
  readonly lens: MapModeId;
  readonly highlightMarketId: number | null;
  readonly states: readonly ProvinceState[];
  readonly selectedTag: string | null;
  readonly playerTag: string | null;
  readonly selectedProvinceIndex: number | null;
  readonly insetLeft: number;
  readonly insetRight: number;
  readonly reserved: readonly ReservedBox[];
  /** Backdrop rotation in degrees of longitude per second; 0 is a still map. */
  readonly drift: number;
}

/** Provinces that differ, in the compact form the protocol carries. */
export function diffProvinceStates(
  previous: readonly ProvinceState[],
  next: readonly ProvinceState[],
): readonly ProvinceStateChange[] {
  if (previous === next) return [];
  const changes: ProvinceStateChange[] = [];
  next.forEach((state, index) => {
    const before = previous[index];
    if (
      before?.ownerTag !== state.ownerTag ||
      before.controllerTag !== state.controllerTag ||
      before.unitTag !== state.unitTag ||
      before.marketId !== state.marketId ||
      before.densityPerKm2 !== state.densityPerKm2 ||
      before.urbanShare !== state.urbanShare ||
      before.literacy !== state.literacy ||
      before.unrest !== state.unrest ||
      before.harvest !== state.harvest ||
      before.crowding !== state.crowding
    ) {
      changes.push([
        index,
        state.ownerTag,
        state.controllerTag,
        state.unitTag,
        state.marketId,
        state.densityPerKm2,
        state.urbanShare,
        state.literacy,
        state.unrest,
        state.harvest,
        state.crowding,
      ]);
    }
  });
  return changes;
}

function sameBoxes(a: readonly ReservedBox[], b: readonly ReservedBox[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every((box, index) => {
    const other = b[index];
    return (
      other !== undefined &&
      box.left === other.left &&
      box.top === other.top &&
      box.width === other.width &&
      box.height === other.height
    );
  });
}

/**
 * Commands that move the runtime from `previous` to `next`. `previous` null is a
 * freshly loaded page, which starts at `baseStates`, the 1900 map, in the first
 * era's colours, so the first frame after a reload needs no animation.
 */
export function planMapCommands(
  previous: MapHostInputs | null,
  next: MapHostInputs,
  baseStates: readonly ProvinceState[],
): readonly MapCommand[] {
  const commands: MapCommand[] = [];
  if (previous?.eraId !== next.eraId) {
    commands.push({ type: "set-theme", eraId: next.eraId, immediate: previous === null });
  }
  if (previous?.lens !== next.lens || previous.highlightMarketId !== next.highlightMarketId) {
    commands.push({ type: "set-lens", lens: next.lens, highlightMarketId: next.highlightMarketId });
  }
  const changes = diffProvinceStates(previous?.states ?? baseStates, next.states);
  if (changes.length > 0) commands.push({ type: "set-states", changes });
  if (
    previous?.selectedTag !== next.selectedTag ||
    previous.playerTag !== next.playerTag ||
    previous.selectedProvinceIndex !== next.selectedProvinceIndex
  ) {
    commands.push({
      type: "set-selection",
      selectedTag: next.selectedTag,
      playerTag: next.playerTag,
      selectedProvinceIndex: next.selectedProvinceIndex,
    });
  }
  if (
    previous?.insetLeft !== next.insetLeft ||
    previous.insetRight !== next.insetRight ||
    !sameBoxes(previous.reserved, next.reserved)
  ) {
    commands.push({
      type: "set-insets",
      left: next.insetLeft,
      right: next.insetRight,
      reserved: next.reserved,
    });
  }
  // A fresh page is still, so only a turning map needs saying.
  if ((previous?.drift ?? 0) !== next.drift) {
    commands.push({ type: "set-drift", degreesPerSecond: next.drift });
  }
  return commands;
}

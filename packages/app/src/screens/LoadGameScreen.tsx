import { useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { SimulationSnapshot } from "@century/sim-worker";

import { CountryFlag } from "../components/CountryFlag";
import { Dialog } from "../components/Dialog";
import { EntryPanel, useEntryPanelWidth } from "../components/EntryPanel";
import { Button, Ornament } from "../components/ui";
import { Vignette } from "../components/Vignette";
import { useReduceMotion } from "../design/useReduceMotion";
import { useMapView } from "../map/host/MapStage";
import type { SaveSlot } from "../storage/saveStorage";
import { TOUCH_TARGET, colors, fonts, spacing, themedSheet, type } from "../theme";
import { BACKDROP_DRIFT_DEGREES_PER_SECOND } from "./MainMenuScreen";
import { longDate, saveEra, saveNation, saveProblem, savedAtLabel } from "./saveDisplay";

/**
 * Every saved campaign. The world behind the list is the selected save's, turning
 * as it does behind the title, in that save's era; loading plays it and deleting
 * asks first.
 */
export function LoadGameScreen({
  saves,
  selected,
  selectedWorld,
  loading,
  onSelect,
  onLoad,
  onDelete,
  onBack,
}: {
  readonly saves: readonly SaveSlot[];
  readonly selected: SaveSlot | null;
  /** The selected save's world once read; null when unreadable. */
  readonly selectedWorld: SimulationSnapshot | null | undefined;
  readonly loading: boolean;
  readonly onSelect: (slotId: string) => void;
  readonly onLoad: (slotId: string) => void;
  readonly onDelete: (slotId: string) => Promise<void>;
  readonly onBack: () => void;
}) {
  const panelWidth = useEntryPanelWidth();
  const safe = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const reduceMotion = useReduceMotion();
  const [confirmDelete, setConfirmDelete] = useState<SaveSlot | null>(null);
  const [deleting, setDeleting] = useState(false);
  // The dialog keeps naming its save while it fades out.
  const lastDeleteTarget = useRef<SaveSlot | null>(null);
  if (confirmDelete !== null) lastDeleteTarget.current = confirmDelete;
  const deleteTarget = confirmDelete ?? lastDeleteTarget.current;

  const nation = saveNation(selected, selectedWorld);
  const captionBox = useMemo(
    () => [{ left: 0, top: height - 130, width: width - panelWidth, height: 130 }],
    [height, panelWidth, width],
  );
  useMapView(
    {
      drift: reduceMotion ? 0 : BACKDROP_DRIFT_DEGREES_PER_SECOND,
      playerTag: nation?.tag ?? null,
      insetRight: panelWidth,
      reserved: captionBox,
    },
    {},
  );

  const era = saveEra(selected);
  const problem = selected === null ? null : saveProblem(selected);
  return (
    <View style={styles.root}>
      <Vignette variant="caption" />
      {selected === null ? null : (
        <View
          pointerEvents="none"
          style={[
            styles.caption,
            { left: safe.left + spacing.xl, right: panelWidth + spacing.lg, bottom: safe.bottom + spacing.lg },
          ]}
        >
          <Text style={type.eyebrow}>
            {era === null ? "Saved world" : `Saved world · ${era.label} era`}
          </Text>
          <Text style={styles.captionDate}>
            {selected.metadata === null ? "Unreadable save" : longDate(selected.metadata.dateLabel)}
          </Text>
          <Ornament width={140} style={styles.captionRule} />
          <Text style={styles.captionMeta}>
            {selectedWorld === undefined && problem === null
              ? "Reading the saved world…"
              : nation === null
                ? (problem ?? "Campaign")
                : `${nation.commonName}, your nation, is outlined on the map`}
          </Text>
        </View>
      )}

      <EntryPanel
        kicker={`Saved games · ${String(saves.length)}`}
        title="Load game"
        onBack={onBack}
        backLabel="Main menu"
        scroll={false}
        footer={
          selected === null ? undefined : (
            <>
              <Button
                label="Delete"
                tone="danger"
                size="lg"
                disabled={loading || deleting}
                onPress={() => setConfirmDelete(selected)}
              />
              <View style={styles.loadButton}>
                <Button
                  label={loading ? "Loading…" : "Load"}
                  tone="primary"
                  size="lg"
                  disabled={loading || deleting || problem !== null}
                  onPress={() => onLoad(selected.id)}
                />
              </View>
            </>
          )
        }
      >
        {saves.length === 0 ? (
          <Text style={styles.empty}>No saved games. A campaign saves itself as you play.</Text>
        ) : (
          <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
            {saves.map((slot) => (
              <SaveRow
                key={slot.id}
                slot={slot}
                world={slot.id === selected?.id ? selectedWorld : undefined}
                active={slot.id === selected?.id}
                onPress={() => onSelect(slot.id)}
              />
            ))}
          </ScrollView>
        )}
      </EntryPanel>

      <Dialog
        visible={confirmDelete !== null}
        kicker="Delete"
        title="Delete this saved game?"
        onRequestClose={() => setConfirmDelete(null)}
        actions={
          <>
            <Button label="Cancel" onPress={() => setConfirmDelete(null)} />
            <Button
              label={deleting ? "Deleting…" : "Delete"}
              tone="danger"
              disabled={deleting}
              onPress={() => {
                if (confirmDelete === null) return;
                setDeleting(true);
                void onDelete(confirmDelete.id).finally(() => {
                  setDeleting(false);
                  setConfirmDelete(null);
                });
              }}
            />
          </>
        }
      >
        <Text style={styles.dialogBody}>
          {deleteTarget === null
            ? ""
            : `${saveNation(deleteTarget, null)?.commonName ?? "This campaign"}${
                deleteTarget.metadata === null ? "" : `, ${longDate(deleteTarget.metadata.dateLabel)}`
              }, and its recovery copy will be removed from this device. This cannot be undone.`}
        </Text>
      </Dialog>
    </View>
  );
}

function SaveRow({
  slot,
  world,
  active,
  onPress,
}: {
  readonly slot: SaveSlot;
  readonly world: SimulationSnapshot | null | undefined;
  readonly active: boolean;
  readonly onPress: () => void;
}) {
  const nation = saveNation(slot, world);
  const era = saveEra(slot);
  const problem = saveProblem(slot);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${nation?.commonName ?? "Campaign"}, ${
        slot.metadata === null ? "unreadable" : longDate(slot.metadata.dateLabel)
      }`}
      onPress={onPress}
      style={[styles.row, active ? styles.rowActive : null]}
    >
      <View style={[styles.marker, active ? styles.markerActive : null]} />
      {nation === null ? (
        <View style={styles.flagBlank} />
      ) : (
        <CountryFlag polityId={nation.id} tag={nation.tag} size="picker" />
      )}
      <View style={styles.rowText}>
        <Text style={[styles.rowNation, active ? styles.rowNationActive : null]} numberOfLines={1}>
          {nation?.commonName ?? "Campaign"}
        </Text>
        <Text style={styles.rowDate} numberOfLines={1}>
          {slot.metadata === null ? "Unreadable save" : longDate(slot.metadata.dateLabel)}
          {era === null ? "" : ` · ${era.label}`}
        </Text>
        <Text style={problem === null ? styles.rowMeta : styles.rowProblem} numberOfLines={1}>
          {problem ?? savedAtLabel(slot)}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = themedSheet(() => ({
  root: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  caption: { position: "absolute", gap: 2 },
  captionDate: { ...type.title, fontSize: 24, lineHeight: 28, fontFamily: fonts.serifMedium },
  captionRule: { marginVertical: spacing.xs },
  captionMeta: { ...type.small, color: colors.text },
  list: { flex: 1 },
  empty: { ...type.body, color: colors.muted, paddingVertical: spacing.sm },
  row: {
    minHeight: TOUCH_TARGET + spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    paddingRight: spacing.xs,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
  },
  rowActive: { backgroundColor: colors.accentSoft },
  marker: { width: 3, alignSelf: "stretch", backgroundColor: colors.border },
  markerActive: { backgroundColor: colors.accent },
  flagBlank: { width: 48, height: 32, borderWidth: 1, borderColor: colors.border },
  rowText: { flex: 1, minWidth: 0, gap: 1 },
  rowNation: { ...type.section },
  rowNationActive: { color: colors.accentStrong },
  rowDate: { ...type.small, color: colors.text },
  rowMeta: { ...type.tiny },
  rowProblem: { ...type.tiny, color: colors.red },
  loadButton: { flex: 1 },
  dialogBody: { ...type.small },
}));

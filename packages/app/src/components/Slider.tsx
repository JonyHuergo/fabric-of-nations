import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type GestureResponderEvent,
} from "react-native";

import { TOUCH_TARGET, colors, radii, spacing, themedSheet, type } from "../theme";
import { Badge } from "./ui";

/**
 * Coalescing helper for authoritative slider commits.
 *
 * Only one action is in flight at a time. While the worker is busy, the latest
 * value is retained and sent when the pending action settles, so rapid drags
 * cannot deliver stale values or race each other.
 */
export function useDeferredCommit(
  commit: (value: number) => void,
  busy: boolean,
): { submit: (value: number) => void; hasPending: boolean } {
  const commitRef = useRef(commit);
  const busyRef = useRef(busy);
  const inFlightRef = useRef(false);
  const latestRef = useRef<number | null>(null);
  const [hasPending, setHasPending] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  commitRef.current = commit;
  busyRef.current = busy;

  const flush = useCallback(() => {
    if (inFlightRef.current || latestRef.current === null) return;
    const value = latestRef.current;
    latestRef.current = null;
    inFlightRef.current = true;
    setHasPending(false);
    commitRef.current(value);
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    // Safety net: if the worker reply was lost, allow a later commit again.
    timerRef.current = setTimeout(() => {
      inFlightRef.current = false;
      setHasPending(latestRef.current !== null);
    }, 4_000);
  }, []);

  useEffect(() => {
    busyRef.current = busy;
    if (!busy) {
      inFlightRef.current = false;
      if (latestRef.current !== null) flush();
    }
  }, [busy, flush]);

  useEffect(
    () => () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    },
    [],
  );

  const submit = useCallback(
    (value: number) => {
      latestRef.current = value;
      if (!busyRef.current && !inFlightRef.current) {
        flush();
      } else {
        setHasPending(true);
      }
    },
    [flush],
  );

  return { submit, hasPending };
}

export interface SliderTick {
  readonly value: number;
  readonly label: string;
}

export interface SliderFieldProps {
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly onChange: (value: number) => void;
  readonly onCommit?: (value: number) => void;
  readonly disabled?: boolean;
  readonly unit?: string;
  readonly precision?: number;
  readonly ticks?: readonly SliderTick[];
  readonly hint?: ReactNode;
  readonly pending?: boolean;
  readonly formatValue?: (value: number) => string;
}

export function clampToStep(value: number, min: number, max: number, step: number): number {
  if (!Number.isFinite(value)) return min;
  const steps = Math.round((value - min) / step);
  const snapped = min + steps * step;
  const bounded = Math.min(max, Math.max(min, snapped));
  // Avoid binary floating point tails such as 0.30000000000000004.
  const decimals = Math.max(0, Math.ceil(-Math.log10(step)) + 1);
  return Number(bounded.toFixed(Math.min(8, decimals + 2)));
}

export function SliderField({
  label,
  value,
  min,
  max,
  step,
  onChange,
  onCommit,
  disabled = false,
  unit = "",
  precision,
  ticks = [],
  hint,
  pending = false,
  formatValue,
}: SliderFieldProps) {
  const [trackWidth, setTrackWidth] = useState(0);
  const [text, setText] = useState<string | null>(null);
  const draggingRef = useRef(false);

  const fraction = max > min ? Math.min(1, Math.max(0, (value - min) / (max - min))) : 0;
  const display = formatValue?.(value) ?? `${value.toFixed(precision ?? 0)}${unit === "" ? "" : ` ${unit}`}`;

  const updateFromX = useCallback(
    (x: number) => {
      if (trackWidth <= 0 || disabled) return;
      const ratio = Math.min(1, Math.max(0, x / trackWidth));
      const next = clampToStep(min + ratio * (max - min), min, max, step);
      onChange(next);
    },
    [disabled, max, min, onChange, step, trackWidth],
  );

  const onResponder = (event: GestureResponderEvent): void => {
    updateFromX(event.nativeEvent.locationX);
  };

  const commit = (): void => {
    draggingRef.current = false;
    onCommit?.(value);
  };

  const adjust = (delta: number): void => {
    if (disabled) return;
    const next = clampToStep(value + delta, min, max, step);
    onChange(next);
    onCommit?.(next);
  };

  const commitText = (): void => {
    if (text === null) return;
    const parsed = Number.parseFloat(text.replace(",", "."));
    if (Number.isFinite(parsed)) {
      const next = clampToStep(parsed, min, max, step);
      onChange(next);
      onCommit?.(next);
    }
    setText(null);
  };

  return (
    <View style={styles.field}>
      <View style={styles.header}>
        <Text style={styles.label}>{label}</Text>
        <View style={styles.valueRow}>
          {pending ? <Badge label="Pending" tone="accent" /> : null}
          <View style={styles.numericWrap}>
            <TextInput
              value={text ?? formatValue?.(value) ?? value.toFixed(precision ?? 0)}
              onChangeText={(next) => setText(next)}
              onBlur={commitText}
              onSubmitEditing={commitText}
              editable={!disabled}
              keyboardType="decimal-pad"
              accessibilityLabel={`${label} value${unit === "" ? "" : ` in ${unit}`}`}
              style={[styles.numeric, disabled ? styles.disabled : null]}
              selectTextOnFocus
            />
            {unit === "" ? null : <Text style={styles.unit}>{unit}</Text>}
          </View>
        </View>
      </View>

      <View style={styles.sliderRow}>
        <Text
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${label}`}
          onPress={() => adjust(-step)}
          style={[styles.stepButton, disabled ? styles.disabled : null]}
        >
          −
        </Text>
        <View
          style={styles.trackHitArea}
          onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
          onStartShouldSetResponder={() => !disabled}
          onMoveShouldSetResponder={() => !disabled}
          onResponderGrant={(event) => {
            draggingRef.current = true;
            onResponder(event);
          }}
          onResponderMove={onResponder}
          onResponderRelease={commit}
          onResponderTerminate={commit}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={label}
          accessibilityValue={{ min, max, now: value, text: display }}
          /*
           * React Native Web reads the flat aria-value* props, not the
           * accessibilityValue object. Without them the rendered slider has
           * role="slider" but no announced value on the web build.
           */
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          aria-valuetext={display}
          accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === "increment") adjust(step);
            if (event.nativeEvent.actionName === "decrement") adjust(-step);
          }}
        >
          <View style={styles.track}>
            <View style={[styles.trackFill, { width: `${fraction * 100}%` }]} />
            {ticks.map((tick) => {
              const tickFraction =
                max > min ? Math.min(1, Math.max(0, (tick.value - min) / (max - min))) : 0;
              return (
                <View
                  key={`${tick.value}:${tick.label}`}
                  style={[styles.trackTick, { left: `${tickFraction * 100}%` }]}
                />
              );
            })}
          </View>
          <View style={[styles.thumb, { left: `${fraction * 100}%` }]} />
        </View>
        <Text
          accessibilityRole="button"
          accessibilityLabel={`Increase ${label}`}
          onPress={() => adjust(step)}
          style={[styles.stepButton, disabled ? styles.disabled : null]}
        >
          +
        </Text>
      </View>

      <View style={styles.scaleRow}>
        <Text style={styles.scaleText}>
          {formatValue?.(min) ?? `${min.toFixed(precision ?? 0)}${unit === "" ? "" : ` ${unit}`}`}
        </Text>
        {ticks.length === 0 ? null : (
          <View style={styles.tickLabels}>
            {ticks.map((tick) => (
              <Text key={`${tick.value}:${tick.label}`} style={styles.tickLabel}>
                {tick.label}
              </Text>
            ))}
          </View>
        )}
        <Text style={styles.scaleText}>
          {formatValue?.(max) ?? `${max.toFixed(precision ?? 0)}${unit === "" ? "" : ` ${unit}`}`}
        </Text>
      </View>
      {hint === undefined ? null : (
        <Text style={styles.hintText}>{hint}</Text>
      )}
    </View>
  );
}

const styles = themedSheet(() => ({
  field: {
    paddingVertical: spacing.sm,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  header: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: spacing.sm },
  label: { ...type.body, flexShrink: 1 },
  valueRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginLeft: "auto" },
  numericWrap: { flexDirection: "row", alignItems: "center", gap: 4 },
  numeric: {
    ...type.number,
    minWidth: 74,
    minHeight: TOUCH_TARGET,
    textAlign: "right",
    paddingHorizontal: 6,
    borderRadius: radii.sm,
    backgroundColor: colors.background,
  },
  unit: { ...type.tiny, minWidth: 18 },
  sliderRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  stepButton: {
    ...type.section,
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    textAlign: "center",
    lineHeight: TOUCH_TARGET,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceRaised,
    overflow: "hidden",
  },
  trackHitArea: { flex: 1, height: TOUCH_TARGET, justifyContent: "center" },
  track: {
    height: 4,
    backgroundColor: colors.surfaceRaised,
    borderRadius: 2,
    overflow: "visible",
  },
  trackFill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: colors.accent,
    borderRadius: 2,
  },
  trackTick: {
    position: "absolute",
    top: -2,
    width: 1,
    height: 8,
    backgroundColor: colors.borderStrong,
  },
  thumb: {
    position: "absolute",
    width: 18,
    height: 18,
    marginLeft: -9,
    borderRadius: 9,
    backgroundColor: colors.accentStrong,
    borderWidth: 2,
    borderColor: colors.background,
  },
  scaleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  scaleText: { ...type.tiny },
  tickLabels: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap", justifyContent: "center" },
  tickLabel: { ...type.tiny, color: colors.faint },
  hintText: { ...type.tiny, marginTop: 2 },
  disabled: { opacity: 0.45 },
}));

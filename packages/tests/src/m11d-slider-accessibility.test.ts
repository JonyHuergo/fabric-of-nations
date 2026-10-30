/**
 * M11d slider accessibility regression.
 *
 * The web build rendered `role="slider"` with no announced value because React
 * Native Web reads the flat `aria-value*` props and ignores the
 * `accessibilityValue` object. Playtesting found the slider unusable with a
 * screen reader even though the native accessibility value was set.
 */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, "../../app");

describe("M11d slider accessibility", () => {
  test("the slider exposes a value, range and text on the web", () => {
    const source = readFileSync(join(APP, "src/components/Slider.tsx"), "utf8");
    expect(source).toContain("accessibilityValue={{ min, max, now: value, text: display }}");
    expect(source).toContain("aria-valuemin={min}");
    expect(source).toContain("aria-valuemax={max}");
    expect(source).toContain("aria-valuenow={value}");
    expect(source).toContain("aria-valuetext={display}");
    expect(source).toContain("accessibilityActions={[{ name: \"increment\" }, { name: \"decrement\" }]}");
  });

  test("toggle chips and navigation expose their active state", () => {
    // React Native Web does not forward accessibilityState.selected for
    // role="button"; without an explicit ARIA state the active filter, layer,
    // speed or screen is visual-only.
    const chips = readFileSync(join(APP, "src/components/ui.tsx"), "utf8");
    expect(chips).toContain('"aria-pressed": active');
    const shell = readFileSync(join(APP, "src/screens/GameShell.tsx"), "utf8");
    expect(shell).toContain('"aria-current": active ? "page" : undefined');
    const selection = readFileSync(join(APP, "src/screens/CountrySelectionScreen.tsx"), "utf8");
    expect(selection).toContain('"aria-pressed": active');
  });
});

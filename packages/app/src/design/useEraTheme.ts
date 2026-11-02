import { useEffect, useRef, useState } from "react";

import { setActiveTheme } from "../theme";
import {
  ERA_TRANSITION_MS,
  ERA_TRANSITION_STEPS,
  blendEras,
  resolveEra,
  type EraTheme,
  type ResolvedTheme,
} from "./tokens";

/**
 * Follows the era with a slow cross-fade and installs the resulting tokens before
 * this render's children read them. The map fades itself inside the atlas page, so
 * only the interface re-renders here, a handful of times per era change.
 */
export function useEraTheme(target: EraTheme): ResolvedTheme {
  const [fade, setFade] = useState({ from: target, to: target, step: ERA_TRANSITION_STEPS });
  const current = useRef(target);

  useEffect(() => {
    if (current.current.id === target.id) return;
    const from = current.current;
    current.current = target;
    setFade({ from, to: target, step: 0 });
  }, [target]);

  useEffect(() => {
    if (fade.step >= ERA_TRANSITION_STEPS) return;
    const timer = setTimeout(
      () => setFade((value) => ({ ...value, step: value.step + 1 })),
      ERA_TRANSITION_MS / ERA_TRANSITION_STEPS,
    );
    return () => clearTimeout(timer);
  }, [fade]);

  const theme =
    fade.step >= ERA_TRANSITION_STEPS
      ? resolveEra(fade.to)
      : blendEras(fade.from, fade.to, fade.step / ERA_TRANSITION_STEPS);
  setActiveTheme(theme);
  return theme;
}

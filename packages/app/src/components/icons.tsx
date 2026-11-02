import Svg, { Circle, Path } from "react-native-svg";

import { colors } from "../theme";

export type IconName =
  | "realm"
  | "economy"
  | "society"
  | "world"
  | "lens"
  | "play"
  | "pause"
  | "step"
  | "close"
  | "back"
  | "forward"
  | "plus"
  | "minus"
  | "home";

/** Stroked outlines on a 24-unit grid, so one drawing serves every platform. */
const PATHS: Readonly<Record<Exclude<IconName, "play" | "pause">, readonly string[]>> = {
  realm: ["M4 18h16", "M4 18 3 8l5 4 4-7 4 7 5-4-1 10"],
  economy: ["M4 19h16", "M6 19v-6", "M11 19V8", "M16 19v-9", "M6 9l5-5 5 3 4-3"],
  society: ["M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19", "M17 14a3.5 3.5 0 0 1 3 3.5V19", "M15 5.3a3.5 3.5 0 0 1 0 6.4"],
  world: ["M3.6 9h16.8", "M3.6 15h16.8", "M12 3a14 14 0 0 1 0 18", "M12 3a14 14 0 0 0 0 18"],
  lens: ["M12 4 3 9l9 5 9-5-9-5Z", "M3 14l9 5 9-5"],
  step: ["M6 5l9 7-9 7V5Z", "M18 5v14"],
  close: ["M6 6l12 12", "M18 6 6 18"],
  back: ["M15 5l-7 7 7 7"],
  forward: ["M9 5l7 7-7 7"],
  plus: ["M12 5v14", "M5 12h14"],
  minus: ["M5 12h14"],
  home: ["M4 11.5 12 4l8 7.5", "M6.5 10v9.5h11V10"],
};

export function Icon({
  name,
  size = 22,
  color,
}: {
  readonly name: IconName;
  readonly size?: number;
  readonly color?: string;
}) {
  const stroke = color ?? colors.text;
  if (name === "play") {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path d="M7 4.5v15l12-7.5-12-7.5Z" fill={stroke} />
      </Svg>
    );
  }
  if (name === "pause") {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path d="M7 5h3.6v14H7zM13.4 5H17v14h-3.6z" fill={stroke} />
      </Svg>
    );
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {name === "world" ? <Circle cx={12} cy={12} r={9} stroke={stroke} strokeWidth={1.6} /> : null}
      {name === "society" ? <Circle cx={10} cy={8} r={3.5} stroke={stroke} strokeWidth={1.6} /> : null}
      {PATHS[name].map((path) => (
        <Path key={path} d={path} stroke={stroke} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </Svg>
  );
}

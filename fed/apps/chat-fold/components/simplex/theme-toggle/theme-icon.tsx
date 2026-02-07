import { Monitor, Moon, Sun } from "lucide-react";
import * as React from "react";

import type { ThemeIconStylesConfig } from "./theme-icon.styles";
import type { Theme } from "./types";

import { ThemeIconStyles } from "./theme-icon.styles";

export const THEME_ICON_MAP = {
  light: Sun,
  dark: Moon,
  system: Monitor,
} as const;

export interface ThemeIconProps extends ThemeIconStylesConfig {
  style?: React.CSSProperties;
  className?: string;
  theme?: Theme;
}

export function ThemeIcon(props: ThemeIconProps) {
  const { style, className, theme = "system", classes } = props;

  const $classes = ThemeIconStyles({ classes }, className);

  const Icon = THEME_ICON_MAP[theme as keyof typeof THEME_ICON_MAP] || THEME_ICON_MAP.system;

  return <Icon style={style} className={$classes.root} />;
}

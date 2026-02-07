"use client";

import { useTheme } from "next-themes";
import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import type { ThemeToggleStylesConfig } from "./theme-toggle.styles";

import { ThemeIcon } from "./theme-icon";
import { ThemeToggleStyles } from "./theme-toggle.styles";

const THEME_OPTIONS = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
] as const;

export interface ThemeToggleProps extends ThemeToggleStylesConfig {
  style?: React.CSSProperties;
  className?: string;
}

export function ThemeToggle(props: ThemeToggleProps) {
  const { style, className, classes } = props;

  const $classes = ThemeToggleStyles({ classes }, className);

  const { theme, setTheme } = useTheme();

  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button style={style} className={$classes.root} variant="ghost" size="icon">
          <ThemeIcon className={$classes.icon} theme={theme} />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className={$classes.menu} align="end">
        {THEME_OPTIONS.map(({ value, label }) => (
          <DropdownMenuItem key={value} className={$classes.option} onClick={() => setTheme(value)}>
            <ThemeIcon className={$classes.icon} theme={value} />
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

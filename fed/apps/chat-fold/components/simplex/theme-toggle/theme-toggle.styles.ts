import type { InferComponentStylesConfig } from "@simplex/aqua-style";

import { createStyles } from "@/lib/aqua.config";

export const ThemeToggleStyles = createStyles({
  classes: {
    root: "",
    icon: "",
    menu: "",
    option: "",
  },
});

export type ThemeToggleStylesConfig = InferComponentStylesConfig<typeof ThemeToggleStyles>;

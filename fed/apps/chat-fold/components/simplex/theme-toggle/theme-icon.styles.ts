import type { InferComponentStylesConfig } from "@simplex/aqua-style";

import { createStyles } from "@/lib/aqua.config";

export const ThemeIconStyles = createStyles({
  classes: {
    root: "",
  },
});

export type ThemeIconStylesConfig = InferComponentStylesConfig<typeof ThemeIconStyles>;

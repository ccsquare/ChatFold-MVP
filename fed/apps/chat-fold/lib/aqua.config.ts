import { twMerge } from "tailwind-merge";

import { create } from "@simplex/aqua-style";

export const { createId, createTokens, createStyles } = create({
  mergeClasses: twMerge,
});

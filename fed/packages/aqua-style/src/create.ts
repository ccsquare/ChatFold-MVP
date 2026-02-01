import { EMPTY_OBJECT, run } from "@simplex/shared";

import type { CreateIdOptions } from "./id";
import type { CreateStylesOptions } from "./styles";
import type { CreateTokensOptions } from "./tokens";

import { createId } from "./id";
import { createStyles } from "./styles";
import { createTokens } from "./tokens";
import { sx } from "./utils";

export interface AquaStyle {
  createId: typeof createId;
  createTokens: typeof createTokens;
  createStyles: typeof createStyles;
}

export interface CreateOptions
  extends
    Pick<CreateIdOptions, "createIdValue">,
    Pick<CreateTokensOptions, "createVariableName">,
    Pick<CreateStylesOptions, "mergeClasses"> {}

export function create(options: CreateOptions = EMPTY_OBJECT): AquaStyle {
  const { createIdValue, createVariableName, mergeClasses } = options;

  return {
    createId: run(() => {
      if (createIdValue) {
        const presets = { createIdValue } satisfies CreateIdOptions;

        return (options) => {
          return createId(sx(presets, options));
        };
      }

      return createId;
    }),
    createTokens: run(() => {
      if (createVariableName) {
        const presets = { createVariableName } satisfies CreateTokensOptions;

        return (tokens, options) => {
          return createTokens(tokens, sx(presets, options));
        };
      }

      return createTokens;
    }),
    createStyles: run(() => {
      if (mergeClasses) {
        const presets = { mergeClasses } satisfies CreateStylesOptions;

        return (styles, options) => {
          return createStyles(styles, sx(presets, options));
        };
      }

      return createStyles;
    }),
  };
}

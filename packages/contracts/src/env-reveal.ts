import { Type } from "@sinclair/typebox";

/** Shared selection limits for saved services and source previews. */
export const MAX_REVEAL_KEYS = 500;
export const MAX_REVEAL_KEY_LENGTH = 512;
export const EnvRevealKeysSchema = Type.Array(
  Type.String({ minLength: 1, maxLength: MAX_REVEAL_KEY_LENGTH }),
  { minItems: 1, maxItems: MAX_REVEAL_KEYS },
);

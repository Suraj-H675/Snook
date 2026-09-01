import { DATA_CATEGORY_IDS } from "../privacy/types.ts";

export const NO_ARGUMENTS_INPUT_SCHEMA = {
  type: "object",
  properties: {},
  additionalProperties: false,
} as const;

export const EXPLAIN_DATA_USE_INPUT_SCHEMA = {
  type: "object",
  properties: {
    categoryId: {
      type: "string",
      enum: [...DATA_CATEGORY_IDS],
    },
  },
  required: ["categoryId"],
  additionalProperties: false,
} as const;

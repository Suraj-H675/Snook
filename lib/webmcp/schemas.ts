import {
  CONSENT_TARGET_STATES,
  DATA_CATEGORY_IDS,
} from "../privacy/types.ts";

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

export const CONSENT_PLAN_INPUT_SCHEMA = {
  type: "object",
  properties: {
    changes: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        properties: {
          categoryId: {
            type: "string",
            enum: [...DATA_CATEGORY_IDS],
          },
          targetConsentState: {
            type: "string",
            enum: [...CONSENT_TARGET_STATES],
          },
        },
        required: ["categoryId", "targetConsentState"],
        additionalProperties: false,
      },
    },
  },
  required: ["changes"],
  additionalProperties: false,
} as const;

export const APPLY_APPROVED_CONSENT_PLAN_INPUT_SCHEMA = {
  type: "object",
  properties: {
    planId: {
      type: "string",
      minLength: 1,
    },
    revision: {
      type: "integer",
      minimum: 1,
    },
    planHash: {
      type: "string",
      pattern: "^[0-9a-f]{64}$",
    },
    baseStateVersion: {
      type: "integer",
      minimum: 1,
    },
  },
  required: ["planId", "revision", "planHash", "baseStateVersion"],
  additionalProperties: false,
} as const;

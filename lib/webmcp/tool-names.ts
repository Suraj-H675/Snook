import { PRIVACY_SUMMARY_TOOL_NAME } from "../privacy/summary.ts";

export const APPLY_APPROVED_CONSENT_PLAN_TOOL_NAME =
  "apply_approved_consent_plan" as const;
export const EXPORT_PRIVACY_RECEIPT_TOOL_NAME =
  "export_privacy_receipt" as const;
export const GET_DATA_MAP_TOOL_NAME = "get_data_map" as const;
export const GET_CONSENT_STATE_TOOL_NAME = "get_consent_state" as const;
export const EXPLAIN_DATA_USE_TOOL_NAME = "explain_data_use" as const;
export const PREVIEW_CONSENT_PLAN_TOOL_NAME = "preview_consent_plan" as const;
export const STAGE_CONSENT_PLAN_TOOL_NAME = "stage_consent_plan" as const;

/** The complete and intentionally small Phase 6 WebMCP inventory. */
export const WEBMCP_TOOL_NAMES = [
  APPLY_APPROVED_CONSENT_PLAN_TOOL_NAME,
  EXPLAIN_DATA_USE_TOOL_NAME,
  EXPORT_PRIVACY_RECEIPT_TOOL_NAME,
  GET_CONSENT_STATE_TOOL_NAME,
  GET_DATA_MAP_TOOL_NAME,
  PRIVACY_SUMMARY_TOOL_NAME,
  PREVIEW_CONSENT_PLAN_TOOL_NAME,
  STAGE_CONSENT_PLAN_TOOL_NAME,
] as const;

export type WebMcpToolName = (typeof WEBMCP_TOOL_NAMES)[number];

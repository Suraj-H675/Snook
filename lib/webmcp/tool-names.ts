import { PRIVACY_SUMMARY_TOOL_NAME } from "../privacy/summary.ts";

export const GET_DATA_MAP_TOOL_NAME = "get_data_map" as const;
export const GET_CONSENT_STATE_TOOL_NAME = "get_consent_state" as const;
export const EXPLAIN_DATA_USE_TOOL_NAME = "explain_data_use" as const;

/** The complete and intentionally small Phase 3 WebMCP inventory. */
export const WEBMCP_TOOL_NAMES = [
  PRIVACY_SUMMARY_TOOL_NAME,
  GET_DATA_MAP_TOOL_NAME,
  GET_CONSENT_STATE_TOOL_NAME,
  EXPLAIN_DATA_USE_TOOL_NAME,
] as const;

export type WebMcpToolName = (typeof WEBMCP_TOOL_NAMES)[number];

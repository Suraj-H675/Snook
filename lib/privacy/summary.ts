import { PRIVACY_CATALOG } from "./catalog.ts";
import { getPrivacySummary } from "./engine.ts";
import { getSeededPrivacyState } from "./seed.ts";
import type { PrivacySummaryResult } from "./types.ts";

export const PRIVACY_SUMMARY_TOOL_NAME = "get_privacy_summary" as const;

export type { PrivacySummaryData, PrivacySummaryResult } from "./types.ts";

export function getSeededPrivacySummary(): PrivacySummaryResult {
  return getPrivacySummary(getSeededPrivacyState(), PRIVACY_CATALOG);
}

import { PRIVACY_SUMMARY_TOOL_NAME } from "../../privacy/summary.ts";
import { getPrivacySummary } from "../../privacy/engine.ts";
import { PRIVACY_CATALOG } from "../../privacy/catalog.ts";
import { getPrivacyStateStore } from "../../state/store.ts";
import type { PrivacyAccountState } from "../../privacy/types.ts";

const NO_INPUT_SCHEMA = {
  type: "object",
  properties: {},
  additionalProperties: false,
} as const;

export function createPrivacySummaryTool(
  onInvoked?: () => void,
  getState: () => PrivacyAccountState = getPrivacyStateStore().getState,
): WebMCP.ModelContextTool {
  return {
    name: PRIVACY_SUMMARY_TOOL_NAME,
    title: "Get privacy summary",
    description:
      "Read the current privacy summary. Takes no arguments, makes no changes, and does not make a network request.",
    inputSchema: NO_INPUT_SCHEMA,
    annotations: {
      readOnlyHint: true,
    },
    execute: () => {
      const result = getPrivacySummary(getState(), PRIVACY_CATALOG);
      onInvoked?.();
      return result;
    },
  };
}

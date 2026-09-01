import {
  getSeededPrivacySummary,
  PRIVACY_SUMMARY_TOOL_NAME,
} from "../../privacy/summary.ts";

const NO_INPUT_SCHEMA = {
  type: "object",
  properties: {},
  additionalProperties: false,
} as const;

export function createPrivacySummaryTool(
  onInvoked?: () => void,
): WebMCP.ModelContextTool {
  return {
    name: PRIVACY_SUMMARY_TOOL_NAME,
    title: "Get privacy summary",
    description:
      "Read the current seeded privacy summary. Takes no arguments, makes no changes, and does not make a network request.",
    inputSchema: NO_INPUT_SCHEMA,
    annotations: {
      readOnlyHint: true,
    },
    execute: () => {
      const result = getSeededPrivacySummary();
      onInvoked?.();
      return result;
    },
  };
}

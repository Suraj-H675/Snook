import { PRIVACY_SUMMARY_TOOL_NAME } from "../../privacy/summary.ts";
import { getPrivacySummary } from "../../privacy/engine.ts";
import { PRIVACY_CATALOG } from "../../privacy/catalog.ts";
import {
  createReadToolRuntime,
  type ReadToolInspectionRecorder,
  type ReadToolStateGetter,
} from "../tool-context.ts";
import { NO_ARGUMENTS_INPUT_SCHEMA } from "../schemas.ts";

export function createPrivacySummaryTool(
  onInvoked?: () => void,
  getState?: ReadToolStateGetter,
  recordInspection?: ReadToolInspectionRecorder,
): WebMCP.ModelContextTool {
  const runtime = createReadToolRuntime({
    onInvoked,
    getState,
    recordInspection,
  });

  return {
    name: PRIVACY_SUMMARY_TOOL_NAME,
    title: "Get privacy summary",
    description:
      "Read the high-level current privacy posture, score, optional counts, active sharing, and privacy opportunities. Takes no arguments and never changes account privacy state.",
    inputSchema: NO_ARGUMENTS_INPUT_SCHEMA,
    annotations: {
      readOnlyHint: true,
    },
    execute: () => {
      const result = getPrivacySummary(runtime.getState(), PRIVACY_CATALOG);
      runtime.complete(PRIVACY_SUMMARY_TOOL_NAME);
      return result;
    },
  };
}

import { PRIVACY_CATALOG } from "../../privacy/catalog.ts";
import { evaluateConsentPlan } from "../../plans/create-plan.ts";
import type {
  ConsentPlanEvaluation,
  PlanErrorCode,
} from "../../plans/types.ts";
import type { PrivacyCatalog } from "../../privacy/types.ts";
import { getPrivacyStateStore } from "../../state/store.ts";
import {
  createToolFailure,
  type ToolFailureResult,
  type ToolSuccessResult,
} from "../results.ts";
import { CONSENT_PLAN_INPUT_SCHEMA } from "../schemas.ts";
import type { ReadToolStateGetter } from "../tool-context.ts";
import { PREVIEW_CONSENT_PLAN_TOOL_NAME } from "../tool-names.ts";

export interface PreviewConsentPlanData extends ConsentPlanEvaluation {
  readonly noChangesApplied: true;
}

export type PreviewConsentPlanResult =
  | ToolSuccessResult<PreviewConsentPlanData>
  | ToolFailureResult<PlanErrorCode>;

export function createPreviewConsentPlanTool(
  onInvoked?: () => void,
  getState?: ReadToolStateGetter,
  catalog: PrivacyCatalog = PRIVACY_CATALOG,
): WebMCP.ModelContextTool {
  const readState = getState ?? (() => getPrivacyStateStore().getState());

  return {
    name: PREVIEW_CONSENT_PLAN_TOOL_NAME,
    title: "Preview consent plan",
    description:
      "Evaluate structured proposed consent changes and return hypothetical score, capability, sharing, and warning consequences without staging or applying them. This tool never changes actual account privacy state.",
    inputSchema: CONSENT_PLAN_INPUT_SCHEMA,
    annotations: {
      readOnlyHint: true,
    },
    execute: (input): PreviewConsentPlanResult => {
      const result = evaluateConsentPlan(input, readState(), catalog);
      if (!result.ok) {
        return createToolFailure(result.error.code, result.error.message);
      }

      onInvoked?.();
      return {
        ok: true,
        data: {
          ...result.data,
          noChangesApplied: true,
        },
      };
    },
  };
}

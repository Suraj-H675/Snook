import { evaluateConsentPlan } from "../../plans/create-plan.ts";
import { PRIVACY_CATALOG } from "../../privacy/catalog.ts";
import type { PrivacyCatalog } from "../../privacy/types.ts";
import { getPrivacyStateStore } from "../../state/store.ts";
import {
  getStagedPlanStore,
  type StagedPlanStore,
} from "../../state/staged-plan-store.ts";
import {
  createToolFailure,
  type ToolFailureResult,
  type ToolSuccessResult,
} from "../results.ts";
import { CONSENT_PLAN_INPUT_SCHEMA } from "../schemas.ts";
import type { ReadToolStateGetter } from "../tool-context.ts";
import { STAGE_CONSENT_PLAN_TOOL_NAME } from "../tool-names.ts";
import type {
  PlanErrorCode,
  StagedConsentPlan,
} from "../../plans/types.ts";

export type StageConsentPlanResult =
  | ToolSuccessResult<StagedConsentPlan>
  | ToolFailureResult<PlanErrorCode>;

export function createStageConsentPlanTool(
  onInvoked?: () => void,
  getState?: ReadToolStateGetter,
  stagedPlanStore: StagedPlanStore = getStagedPlanStore(),
  catalog: PrivacyCatalog = PRIVACY_CATALOG,
): WebMCP.ModelContextTool {
  const readState = getState ?? (() => getPrivacyStateStore().getState());

  return {
    name: STAGE_CONSENT_PLAN_TOOL_NAME,
    title: "Stage consent plan",
    description:
      "Validate and place structured proposed consent changes into the human-visible staged privacy plan for review. Staging does not change actual account privacy state, score, or stateVersion.",
    inputSchema: CONSENT_PLAN_INPUT_SCHEMA,
    annotations: {
      readOnlyHint: false,
    },
    execute: async (input): Promise<StageConsentPlanResult> => {
      const result = evaluateConsentPlan(input, readState(), catalog);
      if (!result.ok) {
        return createToolFailure(result.error.code, result.error.message);
      }

      try {
        const plan = await stagedPlanStore.stage(result.data);
        onInvoked?.();
        return { ok: true, data: plan };
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "The staged plan fingerprint could not be created.";
        return createToolFailure("PLAN_HASH_UNAVAILABLE", message);
      }
    },
  };
}

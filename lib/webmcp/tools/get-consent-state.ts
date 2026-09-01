import {
  getConsentState,
  getDisabledOptionalProcessing,
  getEnabledOptionalProcessing,
  getRequiredProcessingReason,
} from "../../privacy/engine.ts";
import { PRIVACY_CATALOG } from "../../privacy/catalog.ts";
import type {
  ConsentState,
  DataCategoryId,
  PrivacyCatalog,
  PrivacyAccountState,
} from "../../privacy/types.ts";
import { NO_ARGUMENTS_INPUT_SCHEMA } from "../schemas.ts";
import {
  createReadToolRuntime,
  type ReadToolInspectionRecorder,
  type ReadToolStateGetter,
} from "../tool-context.ts";
import { GET_CONSENT_STATE_TOOL_NAME } from "../tool-names.ts";
import type { ToolSuccessResult } from "../results.ts";

export type ConsentProcessingStatus =
  | "mandatory"
  | "optional_enabled"
  | "optional_disabled";

export interface ConsentStateCategoryData {
  readonly categoryId: DataCategoryId;
  readonly name: string;
  readonly processingRequirement: "required" | "optional";
  readonly required: boolean;
  readonly controllable: boolean;
  readonly consentState: ConsentState;
  readonly processingActive: boolean;
  readonly processingStatus: ConsentProcessingStatus;
  readonly requiredReason: string | null;
}

export interface GetConsentStateData {
  readonly stateVersion: number;
  readonly categories: readonly ConsentStateCategoryData[];
  readonly enabledOptionalCount: number;
  readonly disabledOptionalCount: number;
  readonly noChangesMade: true;
}

export type GetConsentStateResult = ToolSuccessResult<GetConsentStateData>;

function getProcessingStatus(
  required: boolean,
  processingActive: boolean,
): ConsentProcessingStatus {
  if (required) {
    return "mandatory";
  }

  return processingActive ? "optional_enabled" : "optional_disabled";
}

export function createConsentStateTool(
  onInvoked?: () => void,
  getState?: ReadToolStateGetter,
  recordInspection?: ReadToolInspectionRecorder,
  catalog: PrivacyCatalog = PRIVACY_CATALOG,
): WebMCP.ModelContextTool {
  const runtime = createReadToolRuntime({
    onInvoked,
    getState,
    recordInspection,
  });

  return {
    name: GET_CONSENT_STATE_TOOL_NAME,
    title: "Get consent state",
    description:
      "Read the current required and optional processing controls, including which optional categories are enabled or disabled. Takes no arguments and never changes account privacy state.",
    inputSchema: NO_ARGUMENTS_INPUT_SCHEMA,
    annotations: {
      readOnlyHint: true,
    },
    execute: (): GetConsentStateResult => {
      const state: PrivacyAccountState = runtime.getState();
      const currentCategories = getConsentState(state, catalog);

      const data: GetConsentStateData = {
        stateVersion: state.stateVersion,
        categories: currentCategories.map((categoryState) => {
          const category = catalog.categories[categoryState.categoryId];
          const required = category.processingRequirement === "required";

          return {
            categoryId: category.id,
            name: category.name,
            processingRequirement: category.processingRequirement,
            required,
            controllable: category.controllable,
            consentState: categoryState.consentState,
            processingActive: categoryState.enabled,
            processingStatus: getProcessingStatus(required, categoryState.enabled),
            requiredReason: getRequiredProcessingReason(category.id, catalog),
          };
        }),
        enabledOptionalCount: getEnabledOptionalProcessing(state, catalog).length,
        disabledOptionalCount: getDisabledOptionalProcessing(state, catalog).length,
        noChangesMade: true,
      };

      runtime.complete(GET_CONSENT_STATE_TOOL_NAME);
      return { ok: true, data };
    },
  };
}

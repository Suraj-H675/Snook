import type {
  DataCategoryId,
  PrivacyAccountState,
} from "../privacy/types.ts";
import { uiInspectionStore } from "../state/inspection-store.ts";
import { getPrivacyStateStore } from "../state/store.ts";
import type { ReadToolInspectionRecorder } from "./tool-context.ts";
import {
  EXPLAIN_DATA_USE_TOOL_NAME,
  GET_CONSENT_STATE_TOOL_NAME,
  GET_DATA_MAP_TOOL_NAME,
  WEBMCP_TOOL_NAMES,
} from "./tool-names.ts";
import { createConsentStateTool } from "./tools/get-consent-state.ts";
import { createDataMapTool } from "./tools/get-data-map.ts";
import { createPrivacySummaryTool } from "./tools/get-privacy-summary.ts";
import { createExplainDataUseTool } from "./tools/explain-data-use.ts";

export type WebMcpRegistrationResult =
  | {
      readonly status: "registered";
      readonly toolNames: typeof WEBMCP_TOOL_NAMES;
    }
  | {
      readonly status: "unavailable";
      readonly reason: string;
    }
  | {
      readonly status: "error";
      readonly reason: string;
    };

export interface WebMcpToolFactoryOptions {
  readonly onToolInvoked?: () => void;
  readonly getState?: () => PrivacyAccountState;
  readonly recordInspection?: ReadToolInspectionRecorder;
}

/**
 * The central Phase 3 inventory. Keeping construction here makes the
 * registered surface auditable and prevents component-level registrations.
 */
export function createWebMcpTools(
  options: WebMcpToolFactoryOptions = {},
): readonly WebMCP.ModelContextTool[] {
  return [
    createPrivacySummaryTool(
      options.onToolInvoked,
      options.getState,
      options.recordInspection,
    ),
    createDataMapTool(
      options.onToolInvoked,
      options.getState,
      options.recordInspection,
    ),
    createConsentStateTool(
      options.onToolInvoked,
      options.getState,
      options.recordInspection,
    ),
    createExplainDataUseTool(
      options.onToolInvoked,
      options.getState,
      options.recordInspection,
    ),
  ];
}

interface RegistrationRecord {
  readonly modelContext: WebMCP.ModelContext;
  promise: Promise<void>;
  onToolInvoked?: () => void;
}

interface WindowWithRegistration extends Window {
  __snookPhase0WebMcpRegistration?: RegistrationRecord;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function isWebMcpAvailable(): boolean {
  return typeof document !== "undefined" && document.modelContext !== undefined;
}

async function registerToolInventory(
  modelContext: WebMCP.ModelContext,
  tools: readonly WebMCP.ModelContextTool[],
): Promise<void> {
  const registrationController = new AbortController();

  try {
    for (const tool of tools) {
      await modelContext.registerTool(tool, {
        signal: registrationController.signal,
      });
    }
  } catch (error) {
    registrationController.abort();
    throw error;
  }
}

export async function registerWebMcpTools(
  onToolInvoked?: () => void,
): Promise<WebMcpRegistrationResult> {
  if (typeof document === "undefined") {
    return {
      status: "unavailable",
      reason: "WebMCP is only available in a browser document.",
    };
  }

  const modelContext = document.modelContext;
  if (!modelContext) {
    return {
      status: "unavailable",
      reason: "document.modelContext is not available in this browser.",
    };
  }

  if (typeof window === "undefined") {
    return {
      status: "error",
      reason: "WebMCP was detected without a browser window.",
    };
  }

  const browserWindow = window as WindowWithRegistration;
  const existingRegistration =
    browserWindow.__snookPhase0WebMcpRegistration;

  if (existingRegistration?.modelContext === modelContext) {
    existingRegistration.onToolInvoked = onToolInvoked;

    try {
      await existingRegistration.promise;
      return {
        status: "registered",
        toolNames: WEBMCP_TOOL_NAMES,
      };
    } catch (error) {
      return {
        status: "error",
        reason: `WebMCP detected, but tool registration failed: ${errorMessage(error)}`,
      };
    }
  }

  const registration: RegistrationRecord = {
    modelContext,
    promise: Promise.resolve(),
    onToolInvoked,
  };
  browserWindow.__snookPhase0WebMcpRegistration = registration;

  try {
    const getState = (): PrivacyAccountState =>
      getPrivacyStateStore().getState();
    const recordInspection: ReadToolInspectionRecorder = (
      toolName,
      categoryId: DataCategoryId | null = null,
    ) => {
      uiInspectionStore.recordInspection(toolName, categoryId);
    };
    const tools = createWebMcpTools({
      onToolInvoked: () => registration.onToolInvoked?.(),
      getState,
      recordInspection,
    });

    // Keep registration sequential so a partial browser implementation cannot
    // observe an arbitrary order of tools.
    registration.promise = registerToolInventory(modelContext, tools);
    await registration.promise;
    return {
      status: "registered",
      toolNames: WEBMCP_TOOL_NAMES,
    };
  } catch (error) {
    if (browserWindow.__snookPhase0WebMcpRegistration === registration) {
      delete browserWindow.__snookPhase0WebMcpRegistration;
    }

    return {
      status: "error",
      reason: `WebMCP detected, but tool registration failed: ${errorMessage(error)}`,
    };
  }
}

export {
  EXPLAIN_DATA_USE_TOOL_NAME,
  GET_CONSENT_STATE_TOOL_NAME,
  GET_DATA_MAP_TOOL_NAME,
  WEBMCP_TOOL_NAMES,
};

import { PRIVACY_SUMMARY_TOOL_NAME } from "../privacy/summary.ts";
import { createPrivacySummaryTool } from "./tools/get-privacy-summary.ts";

export type WebMcpRegistrationResult =
  | {
      readonly status: "registered";
      readonly toolName: typeof PRIVACY_SUMMARY_TOOL_NAME;
    }
  | {
      readonly status: "unavailable";
      readonly reason: string;
    }
  | {
      readonly status: "error";
      readonly reason: string;
    };

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
        toolName: PRIVACY_SUMMARY_TOOL_NAME,
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
    registration.promise = modelContext.registerTool(
      createPrivacySummaryTool(() => registration.onToolInvoked?.()),
    );
    await registration.promise;
    return {
      status: "registered",
      toolName: PRIVACY_SUMMARY_TOOL_NAME,
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

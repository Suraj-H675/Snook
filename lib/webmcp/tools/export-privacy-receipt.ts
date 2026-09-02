import {
  getPrivacyReceiptStore,
  type PrivacyReceiptStore,
} from "../../state/receipt-store.ts";
import { clonePrivacyReceipt } from "../../receipts/persistence.ts";
import {
  createToolFailure,
  type ToolFailureResult,
  type ToolSuccessResult,
} from "../results.ts";
import { NO_ARGUMENTS_INPUT_SCHEMA } from "../schemas.ts";
import { EXPORT_PRIVACY_RECEIPT_TOOL_NAME } from "../tool-names.ts";

export interface ExportPrivacyReceiptData {
  readonly receipt: NonNullable<ReturnType<PrivacyReceiptStore["getState"]>["receipt"]>;
  readonly noChangesMade: true;
}

export type ExportPrivacyReceiptResult =
  | ToolSuccessResult<ExportPrivacyReceiptData>
  | ToolFailureResult<"INVALID_RECEIPT_INPUT" | "NO_PRIVACY_RECEIPT">;

function isEmptyObject(input: unknown): input is Record<string, never> {
  return (
    typeof input === "object" &&
    input !== null &&
    !Array.isArray(input) &&
    Object.keys(input).length === 0
  );
}

/** Return the one latest completed receipt without changing any app state. */
export function createExportPrivacyReceiptTool(
  onInvoked?: () => void,
  receiptStore: PrivacyReceiptStore = getPrivacyReceiptStore(),
): WebMCP.ModelContextTool {
  return {
    name: EXPORT_PRIVACY_RECEIPT_TOOL_NAME,
    title: "Export privacy receipt",
    description:
      "Return the latest completed privacy receipt as structured JSON. This read-only export is available only after an explicitly approved staged plan has been successfully applied; it does not stage, approve, apply, clear, download, or otherwise change account or receipt state.",
    inputSchema: NO_ARGUMENTS_INPUT_SCHEMA,
    annotations: {
      readOnlyHint: true,
    },
    execute: (input): ExportPrivacyReceiptResult => {
      if (!isEmptyObject(input)) {
        return createToolFailure(
          "INVALID_RECEIPT_INPUT",
          "export_privacy_receipt accepts an empty object only.",
        );
      }

      const receipt = receiptStore.getState().receipt;
      if (!receipt) {
        return createToolFailure(
          "NO_PRIVACY_RECEIPT",
          "No completed privacy receipt is available. A receipt is created only after an explicitly approved staged plan is successfully applied.",
        );
      }

      onInvoked?.();
      return {
        ok: true,
        data: {
          receipt: clonePrivacyReceipt(receipt),
          noChangesMade: true,
        },
      };
    },
  };
}

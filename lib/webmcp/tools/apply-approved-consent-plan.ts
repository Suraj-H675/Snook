import {
  APPROVAL_TTL_MINUTES,
  getApprovalBinding,
} from "../../approval/approval.ts";
import type { ApprovalBinding } from "../../approval/types.ts";
import { hashConsentPlan } from "../../plans/hash-plan.ts";
import { evaluateConsentPlan } from "../../plans/create-plan.ts";
import type { ConsentChange, PrivacyCatalog } from "../../privacy/types.ts";
import { PRIVACY_CATALOG } from "../../privacy/catalog.ts";
import { applyConsentChanges } from "../../state/transitions.ts";
import { createPrivacyReceipt } from "../../receipts/create-receipt.ts";
import { serializePrivacyReceipt } from "../../receipts/persistence.ts";
import {
  getPrivacyReceiptStore,
  type PrivacyReceiptStore,
} from "../../state/receipt-store.ts";
import {
  getApprovalStore,
  type ApprovalStore,
} from "../../state/approval-store.ts";
import {
  getStagedPlanStore,
  type StagedPlanStore,
} from "../../state/staged-plan-store.ts";
import {
  getPrivacyStateStore,
  type PrivacyStateStore,
} from "../../state/store.ts";
import type { StagedConsentPlan } from "../../plans/types.ts";
import {
  createToolFailure,
  type ToolFailureResult,
  type ToolSuccessResult,
} from "../results.ts";
import { APPLY_APPROVED_CONSENT_PLAN_INPUT_SCHEMA } from "../schemas.ts";
import { APPLY_APPROVED_CONSENT_PLAN_TOOL_NAME } from "../tool-names.ts";

export type ApplyApprovedConsentPlanInput = ApprovalBinding;

export interface ApplyApprovedConsentPlanSnapshot {
  readonly privacyScore: number;
  readonly enabledOptionalCount: number;
  readonly thirdPartySharing: readonly string[];
}

export interface ApplyApprovedConsentPlanData {
  readonly appliedPlanId: string;
  readonly appliedRevision: number;
  readonly appliedPlanHash: string;
  readonly previousStateVersion: number;
  readonly stateVersion: number;
  readonly appliedChanges: readonly ConsentChange[];
  readonly before: ApplyApprovedConsentPlanSnapshot;
  readonly after: ApplyApprovedConsentPlanSnapshot;
  readonly approvalConsumed: true;
  readonly stagedPlanCleared: true;
  readonly receiptGenerated: true;
  readonly receiptId: string;
}

export type ApplyApprovedConsentPlanErrorCode =
  | "INVALID_PLAN_INPUT"
  | "NO_STAGED_PLAN"
  | "PLAN_NOT_APPROVED"
  | "PLAN_EXPIRED"
  | "STATE_CHANGED_SINCE_PREVIEW"
  | "PLAN_CHANGED_AFTER_APPROVAL"
  | "APPROVAL_ALREADY_USED"
  | "INVALID_DATA_CATEGORY"
  | "REQUIRED_PROCESSING_CANNOT_BE_DISABLED"
  | "NO_VALID_CHANGES"
  | "PLAN_HASH_UNAVAILABLE"
  | "RECEIPT_UNAVAILABLE";

export type ApplyApprovedConsentPlanResult =
  | ToolSuccessResult<ApplyApprovedConsentPlanData>
  | ToolFailureResult<ApplyApprovedConsentPlanErrorCode>;

export interface ApplyApprovedConsentPlanToolOptions {
  readonly onInvoked?: () => void;
  readonly onApplied?: () => void;
  readonly privacyStateStore?: PrivacyStateStore;
  readonly stagedPlanStore?: StagedPlanStore;
  readonly receiptStore?: PrivacyReceiptStore;
  readonly approvalStore?: ApprovalStore;
  readonly catalog?: PrivacyCatalog;
  readonly clock?: () => number;
  readonly generateReceiptId?: () => string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactlyKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
): boolean {
  const actualKeys = Object.keys(value).sort();
  const sortedExpectedKeys = [...expectedKeys].sort();
  return (
    actualKeys.length === sortedExpectedKeys.length &&
    actualKeys.every((key, index) => key === sortedExpectedKeys[index])
  );
}

function isValidPlanHash(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

function isValidPositiveInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 1
  );
}

function parseInput(
  input: unknown,
):
  | { readonly ok: true; readonly data: ApplyApprovedConsentPlanInput }
  | ToolFailureResult<"INVALID_PLAN_INPUT"> {
  if (
    !isRecord(input) ||
    !hasExactlyKeys(input, [
      "planId",
      "revision",
      "planHash",
      "baseStateVersion",
    ])
  ) {
    return createToolFailure(
      "INVALID_PLAN_INPUT",
      "Apply input must contain only planId, revision, planHash, and baseStateVersion.",
    );
  }

  if (typeof input.planId !== "string" || input.planId.length === 0) {
    return createToolFailure(
      "INVALID_PLAN_INPUT",
      "planId must be a non-empty string from the current staged plan.",
    );
  }

  if (!isValidPositiveInteger(input.revision)) {
    return createToolFailure(
      "INVALID_PLAN_INPUT",
      "revision must be a positive safe integer.",
    );
  }

  if (!isValidPlanHash(input.planHash)) {
    return createToolFailure(
      "INVALID_PLAN_INPUT",
      "planHash must be exactly 64 lowercase hexadecimal SHA-256 characters.",
    );
  }

  if (!isValidPositiveInteger(input.baseStateVersion)) {
    return createToolFailure(
      "INVALID_PLAN_INPUT",
      "baseStateVersion must be a positive safe integer.",
    );
  }

  return {
    ok: true,
    data: {
      planId: input.planId,
      revision: input.revision,
      planHash: input.planHash,
      baseStateVersion: input.baseStateVersion,
    },
  };
}

function bindingForPlan(plan: StagedConsentPlan): ApprovalBinding {
  return getApprovalBinding(plan);
}

function bindingsMatch(
  left: ApprovalBinding,
  right: ApprovalBinding,
): boolean {
  return (
    left.planId === right.planId &&
    left.revision === right.revision &&
    left.planHash === right.planHash &&
    left.baseStateVersion === right.baseStateVersion
  );
}

function changesMatch(
  left: readonly ConsentChange[],
  right: readonly ConsentChange[],
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (change, index) =>
        change.categoryId === right[index]?.categoryId &&
        change.targetConsentState === right[index]?.targetConsentState,
    )
  );
}

function expectedFailure(
  code: ApplyApprovedConsentPlanErrorCode,
  message: string,
): ToolFailureResult<ApplyApprovedConsentPlanErrorCode> {
  return createToolFailure(code, message);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function runPostApplyCallbackSafely(callback?: () => void): void {
  try {
    callback?.();
  } catch {
    // UI/telemetry notification is non-authoritative after the mutation.
  }
}

function mapApprovalFailure(
  status: "none" | "expired" | "plan_changed" | "account_state_changed" | "consumed",
): ToolFailureResult<ApplyApprovedConsentPlanErrorCode> {
  switch (status) {
    case "expired":
      return expectedFailure(
        "PLAN_EXPIRED",
        `The website approval for this exact staged plan expired after ${APPROVAL_TTL_MINUTES} minutes. Ask the human to review and approve the current plan again.`,
      );
    case "plan_changed":
      return expectedFailure(
        "PLAN_CHANGED_AFTER_APPROVAL",
        "The staged plan changed after it was approved. Ask the human to review the revised plan and approve it again in the website.",
      );
    case "account_state_changed":
      return expectedFailure(
        "STATE_CHANGED_SINCE_PREVIEW",
        "The account privacy state changed after this plan was created. Re-read the consent state and create a new plan.",
      );
    case "consumed":
      return expectedFailure(
        "APPROVAL_ALREADY_USED",
        "This exact website approval has already been consumed. Stage and approve a new plan if another change is needed.",
      );
    case "none":
      return expectedFailure(
        "PLAN_NOT_APPROVED",
        "This staged plan has not been approved through the Snook website. Ask the human to review the staged plan and use the website approval control.",
      );
  }
}

export function createApplyApprovedConsentPlanTool(
  options: ApplyApprovedConsentPlanToolOptions = {},
): WebMCP.ModelContextTool {
  const stateStore = options.privacyStateStore ?? getPrivacyStateStore();
  const stagedPlanStore = options.stagedPlanStore ?? getStagedPlanStore();
  const receiptStore = options.receiptStore ?? getPrivacyReceiptStore();
  const approvalStore = options.approvalStore ?? getApprovalStore();
  const catalog = options.catalog ?? PRIVACY_CATALOG;

  return {
    name: APPLY_APPROVED_CONSENT_PLAN_TOOL_NAME,
    title: "Apply approved consent plan",
    description:
      "Apply the CURRENT staged privacy plan only after explicit human website approval of that exact plan. Provide planId, revision, planHash, and baseStateVersion exactly as returned by stage_consent_plan. The website verifies an internal short-lived approval grant bound to all four fields; this tool cannot create approval. If authorization and safety checks succeed, this consequential tool mutates actual account privacy state atomically, consumes the approval, creates a completed privacy receipt, and clears the staged plan.",
    inputSchema: APPLY_APPROVED_CONSENT_PLAN_INPUT_SCHEMA,
    annotations: {
      readOnlyHint: false,
    },
    execute: async (input): Promise<ApplyApprovedConsentPlanResult> => {
      const parsed = parseInput(input);
      if (!parsed.ok) {
        return parsed;
      }

      const binding = parsed.data;
      if (approvalStore.hasConsumedBinding(binding)) {
        return mapApprovalFailure("consumed");
      }

      let plan = stagedPlanStore.getState().plan;
      if (!plan) {
        return expectedFailure(
          "NO_STAGED_PLAN",
          "There is no staged consent plan to apply. Ask the human or agent to stage a plan first.",
        );
      }

      const currentBinding = bindingForPlan(plan);
      if (!bindingsMatch(binding, currentBinding)) {
        return mapApprovalFailure("plan_changed");
      }

      let actualState = stateStore.getState();
      if (actualState.stateVersion !== plan.baseStateVersion) {
        return mapApprovalFailure("account_state_changed");
      }

      let canonicalHash: string;
      try {
        canonicalHash = await hashConsentPlan({
          planId: plan.planId,
          revision: plan.revision,
          baseStateVersion: plan.baseStateVersion,
          changes: plan.changes,
        });
      } catch (error) {
        return expectedFailure(
          "PLAN_HASH_UNAVAILABLE",
          error instanceof Error
            ? error.message
            : "The staged plan fingerprint could not be verified.",
        );
      }

      // Hashing is asynchronous. Re-read both live domains before any
      // authorization claim so a human edit, restage, or direct account
      // change that occurred while hashing cannot be applied accidentally.
      const latestPlan = stagedPlanStore.getState().plan;
      if (!latestPlan) {
        if (approvalStore.hasConsumedBinding(binding)) {
          return mapApprovalFailure("consumed");
        }
        return expectedFailure(
          "NO_STAGED_PLAN",
          "There is no staged consent plan to apply. Ask the human or agent to stage a plan first.",
        );
      }
      if (latestPlan !== plan) {
        return mapApprovalFailure("plan_changed");
      }
      plan = latestPlan;

      const latestActualState = stateStore.getState();
      if (latestActualState.stateVersion !== plan.baseStateVersion) {
        return mapApprovalFailure("account_state_changed");
      }
      actualState = latestActualState;
      if (!bindingsMatch(binding, bindingForPlan(plan))) {
        return mapApprovalFailure("plan_changed");
      }

      if (canonicalHash !== plan.planHash) {
        return mapApprovalFailure("plan_changed");
      }

      const revalidated = evaluateConsentPlan(
        { changes: plan.changes },
        actualState,
        catalog,
      );
      if (!revalidated.ok) {
        return createToolFailure(revalidated.error.code, revalidated.error.message);
      }

      if (!changesMatch(revalidated.data.changes, plan.changes)) {
        return mapApprovalFailure("plan_changed");
      }

      const validity = approvalStore.getValidity(
        binding,
        actualState.stateVersion,
      );
      if (validity.status !== "current") {
        return mapApprovalFailure(validity.status);
      }

      // Prepare and validate the complete receipt before claiming approval.
      // This work is not published or persisted; it ensures receipt creation
      // cannot become a new failure point after the irreversible mutation.
      let preparedReceipt: ReturnType<typeof createPrivacyReceipt>;
      let preparedSuccessData: ApplyApprovedConsentPlanData;
      try {
        const projected = applyConsentChanges(
          actualState,
          plan.changes,
          catalog,
        );
        if (!projected.ok) {
          return createToolFailure(
            projected.error.code === "REQUIRED_PROCESSING_CANNOT_BE_DISABLED"
              ? projected.error.code
              : projected.error.code === "INVALID_DATA_CATEGORY"
                ? projected.error.code
                : projected.error.code === "NO_OP"
                  ? "NO_VALID_CHANGES"
                  : "INVALID_PLAN_INPUT",
            projected.error.message,
          );
        }

        preparedReceipt = createPrivacyReceipt(
          actualState,
          projected.state,
          plan,
          {
            catalog,
            clock: options.clock,
            generateReceiptId: options.generateReceiptId,
          },
        );
        // Validate JSON serialization before the mutation. The actual store
        // will serialize again when it records the post-commit artifact.
        serializePrivacyReceipt(preparedReceipt);
        preparedSuccessData = {
          appliedPlanId: plan.planId,
          appliedRevision: plan.revision,
          appliedPlanHash: plan.planHash,
          previousStateVersion: actualState.stateVersion,
          stateVersion: projected.state.stateVersion,
          appliedChanges: plan.changes.map((change) => ({ ...change })),
          before: preparedReceipt.before,
          after: preparedReceipt.after,
          approvalConsumed: true,
          stagedPlanCleared: true,
          receiptGenerated: true,
          receiptId: preparedReceipt.receiptId,
        };
      } catch (error) {
        return expectedFailure(
          "RECEIPT_UNAVAILABLE",
          `The completed privacy receipt could not be prepared, so no account changes were made. ${errorMessage(error)}`,
        );
      }

      // Everything above is async validation or synchronous precomputation.
      // Claiming the approval and writing the already-validated deterministic
      // transition happen without yielding, so a second near-simultaneous call
      // cannot claim the grant.
      const claim = approvalStore.claim(binding);
      if (!claim.ok) {
        return mapApprovalFailure(claim.status);
      }

      const applied = stateStore.applyConsentChanges(plan.changes);
      if (!applied.ok) {
        // This is unreachable after the identical pure revalidation above.
        // If an injected/custom store still rejects the write, restore the
        // claim so an expected failure remains mutation-free.
        approvalStore.release(binding);
        return createToolFailure(
          applied.error.code === "REQUIRED_PROCESSING_CANNOT_BE_DISABLED"
            ? applied.error.code
            : applied.error.code === "INVALID_DATA_CATEGORY"
              ? applied.error.code
              : applied.error.code === "NO_OP"
                ? "NO_VALID_CHANGES"
                : "INVALID_PLAN_INPUT",
          applied.error.message,
        );
      }

      // The state store has synchronously committed and persisted the actual
      // transition. From here onward, receipt and UI work is best effort and
      // cannot change the successful apply result.
      try {
        receiptStore.set(preparedReceipt);
      } catch {
        // Receipt preparation was already validated before mutation. This
        // catch protects the irreversible apply from an unexpected store bug.
      }
      try {
        stagedPlanStore.discard();
      } catch {
        // The built-in store clears before notifying; cleanup cannot undo the
        // committed mutation or turn it into an apply failure.
      }
      runPostApplyCallbackSafely(options.onInvoked);
      runPostApplyCallbackSafely(options.onApplied);

      return { ok: true, data: preparedSuccessData };
    },
  };
}

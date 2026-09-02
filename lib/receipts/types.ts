import type {
  ConsentState,
  DataCategoryId,
  RecipientId,
  StateVersion,
} from "../privacy/types.ts";
import type { PlanCapabilityImpact, PlanSharingChange } from "../plans/types.ts";

export const PRIVACY_RECEIPT_SOURCE = "approved_webmcp_plan" as const;
export type PrivacyReceiptSource = typeof PRIVACY_RECEIPT_SOURCE;

export const PRIVACY_RECEIPT_DEMO_DISCLAIMER =
  "Fictional demo receipt: a structured browser-local record of the exact approved plan Snook applied in this demo. It is not compliance evidence, legal certification, or third-party attestation." as const;

export interface PrivacyReceiptPlanBinding {
  readonly planId: string;
  readonly revision: number;
  readonly planHash: string;
  readonly baseStateVersion: StateVersion;
}

export interface PrivacyReceiptChange {
  readonly categoryId: DataCategoryId;
  readonly categoryName: string;
  readonly previousConsentState: ConsentState;
  readonly appliedConsentState: ConsentState;
}

export interface PrivacyReceiptSnapshot {
  readonly privacyScore: number;
  readonly enabledOptionalCount: number;
  readonly thirdPartySharing: readonly RecipientId[];
}

export interface PrivacyReceipt {
  readonly receiptId: string;
  /** Epoch milliseconds in UTC. */
  readonly generatedAt: number;
  readonly source: PrivacyReceiptSource;
  readonly appliedPlan: PrivacyReceiptPlanBinding;
  readonly previousStateVersion: StateVersion;
  readonly stateVersion: StateVersion;
  readonly changes: readonly PrivacyReceiptChange[];
  readonly before: PrivacyReceiptSnapshot;
  readonly after: PrivacyReceiptSnapshot;
  readonly privacyScoreDelta: number;
  readonly capabilityImpacts: readonly PlanCapabilityImpact[];
  readonly sharingChanges: readonly PlanSharingChange[];
  readonly humanApprovalRequired: true;
  readonly approvalConsumed: true;
  readonly demoDisclaimer: typeof PRIVACY_RECEIPT_DEMO_DISCLAIMER;
}

export interface PrivacyReceiptState {
  readonly receipt: PrivacyReceipt | null;
}

import type {
  CapabilityId,
  ConsentChange,
  ConsequenceEffect,
  DataCategoryId,
  RecipientId,
  PurposeId,
} from "../privacy/types.ts";

export type PlanErrorCode =
  | "INVALID_DATA_CATEGORY"
  | "REQUIRED_PROCESSING_CANNOT_BE_DISABLED"
  | "NO_VALID_CHANGES"
  | "INVALID_PLAN_INPUT"
  | "STATE_CHANGED_SINCE_PREVIEW"
  | "PLAN_HASH_UNAVAILABLE";

export interface PlanError {
  readonly code: PlanErrorCode;
  readonly message: string;
}

export interface PlanFailureResult {
  readonly ok: false;
  readonly error: PlanError;
}

export interface PlanStateSnapshot {
  readonly privacyScore: number;
  readonly enabledOptionalCount: number;
  readonly thirdPartySharing: readonly RecipientId[];
}

export type PlanImpactEffect =
  | ConsequenceEffect
  | "collection_resumes"
  | "feature_restored"
  | "quality_restored"
  | "sharing_resumes";

export interface PlanImpact {
  readonly id: string;
  readonly categoryId: DataCategoryId;
  readonly categoryName: string;
  readonly targetConsentState: ConsentChange["targetConsentState"];
  readonly effect: PlanImpactEffect;
  /** The catalog effect this impact is derived from. */
  readonly sourceEffect: ConsequenceEffect;
  readonly purposeId: PurposeId | null;
  readonly purposeName: string | null;
  readonly capabilityId: CapabilityId | null;
  readonly capabilityName: string | null;
  readonly recipientId: RecipientId | null;
  readonly recipientName: string | null;
  readonly description: string;
}

export type CapabilityAvailability = "available" | "degraded" | "unavailable";

export type CapabilityImpactChange =
  | "unaffected"
  | "degraded"
  | "unavailable"
  | "improved";

export interface PlanCapabilityImpact {
  readonly capabilityId: CapabilityId;
  readonly capabilityName: string;
  readonly before: CapabilityAvailability;
  readonly after: CapabilityAvailability;
  readonly change: CapabilityImpactChange;
  readonly affectedByCategoryIds: readonly DataCategoryId[];
  readonly dependencyDescriptions: readonly string[];
}

export interface PlanSharingChange {
  readonly id: string;
  readonly categoryId: DataCategoryId;
  readonly categoryName: string;
  readonly recipientId: RecipientId;
  readonly recipientName: string;
  readonly purposeIds: readonly PurposeId[];
  readonly beforeActive: boolean;
  readonly afterActive: boolean;
  readonly change: "stops" | "starts";
}

export type PlanWarningSeverity = "warning" | "notice";

export interface PlanWarning {
  readonly id: string;
  readonly severity: PlanWarningSeverity;
  readonly categoryId: DataCategoryId;
  readonly categoryName: string;
  readonly effect: "feature_unavailable" | "quality_reduced";
  readonly purposeId: PurposeId | null;
  readonly purposeName: string | null;
  readonly capabilityId: CapabilityId;
  readonly capabilityName: string;
  readonly message: string;
}

export interface ConsentPlanEvaluation {
  readonly baseStateVersion: number;
  readonly changes: readonly ConsentChange[];
  readonly before: PlanStateSnapshot;
  readonly after: PlanStateSnapshot;
  readonly privacyScoreDelta: number;
  readonly impacts: readonly PlanImpact[];
  readonly capabilityImpacts: readonly PlanCapabilityImpact[];
  readonly sharingChanges: readonly PlanSharingChange[];
  readonly warnings: readonly PlanWarning[];
}

export type ConsentPlanEvaluationResult =
  | { readonly ok: true; readonly data: ConsentPlanEvaluation }
  | PlanFailureResult;

export interface StagedConsentPlan extends ConsentPlanEvaluation {
  readonly planId: string;
  readonly revision: number;
  readonly planHash: string;
}

export interface StagedPlanState {
  readonly plan: StagedConsentPlan | null;
}

export type StagedPlanEditResult =
  | { readonly ok: true; readonly data: StagedConsentPlan | null }
  | PlanFailureResult;

export interface PlanHashInput {
  readonly planId: string;
  readonly revision: number;
  readonly baseStateVersion: number;
  readonly changes: readonly ConsentChange[];
}

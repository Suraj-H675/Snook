import type { StateVersion } from "../privacy/types.ts";

/**
 * Public plan-binding data used by the apply tool. The approval identifier is
 * deliberately absent: it is an internal website grant, not an agent input.
 */
export interface ApprovalBinding {
  readonly planId: string;
  readonly revision: number;
  readonly planHash: string;
  readonly baseStateVersion: StateVersion;
}

export type ApprovalGrantStatus = "active" | "consumed";

/**
 * An in-memory human authorization for one exact staged plan. The binding is
 * kept on the record so the website can prove what the human reviewed.
 */
export interface ApprovalGrant extends ApprovalBinding {
  readonly approvalId: string;
  readonly status: ApprovalGrantStatus;
  readonly issuedAt: number;
  readonly expiresAt: number;
  readonly consumedAt?: number;
}

export interface ApprovalState {
  readonly grant: ApprovalGrant | null;
  readonly consumedBindings: readonly ApprovalBinding[];
}

export type ApprovalValidityStatus =
  | "none"
  | "current"
  | "expired"
  | "plan_changed"
  | "account_state_changed"
  | "consumed";

export interface ApprovalValidity {
  readonly status: ApprovalValidityStatus;
  readonly grant: ApprovalGrant | null;
}

export interface ApprovalClaimSuccess {
  readonly ok: true;
  readonly grant: ApprovalGrant;
}

export interface ApprovalClaimFailure {
  readonly ok: false;
  readonly status: Exclude<ApprovalValidityStatus, "current">;
}

export type ApprovalClaimResult = ApprovalClaimSuccess | ApprovalClaimFailure;

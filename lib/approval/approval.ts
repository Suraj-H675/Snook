import type {
  ApprovalBinding,
  ApprovalGrant,
  ApprovalValidity,
} from "./types.ts";

/** The one authoritative human approval lifetime for the demo. */
export const APPROVAL_TTL_MINUTES = 5 as const;
export const APPROVAL_TTL_MS = APPROVAL_TTL_MINUTES * 60 * 1000;

export function getApprovalBinding(
  plan: ApprovalBinding,
): ApprovalBinding {
  return {
    planId: plan.planId,
    revision: plan.revision,
    planHash: plan.planHash,
    baseStateVersion: plan.baseStateVersion,
  };
}

export function isApprovalBindingEqual(
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

export function createApprovalGrant(
  binding: ApprovalBinding,
  approvalId: string,
  issuedAt: number,
): ApprovalGrant {
  return {
    ...getApprovalBinding(binding),
    approvalId,
    status: "active",
    issuedAt,
    expiresAt: issuedAt + APPROVAL_TTL_MS,
  };
}

export function hasConsumedApprovalBinding(
  consumedBindings: readonly ApprovalBinding[],
  binding: ApprovalBinding,
): boolean {
  return consumedBindings.some((consumedBinding) =>
    isApprovalBindingEqual(consumedBinding, binding),
  );
}

/**
 * Derive user-facing approval validity from the current plan, account version,
 * and clock. Time and state are inputs so expiry can be tested without waits.
 */
export function getApprovalValidity(
  grant: ApprovalGrant | null,
  currentPlan: ApprovalBinding | null,
  actualStateVersion: number,
  now: number,
): ApprovalValidity {
  if (!grant || !currentPlan) {
    return { status: "none", grant };
  }

  if (grant.status === "consumed") {
    return isApprovalBindingEqual(grant, currentPlan)
      ? { status: "consumed", grant }
      : { status: "none", grant };
  }

  if (grant.planId !== currentPlan.planId) {
    return { status: "none", grant };
  }

  if (!isApprovalBindingEqual(grant, currentPlan)) {
    return { status: "plan_changed", grant };
  }

  if (actualStateVersion !== currentPlan.baseStateVersion) {
    return { status: "account_state_changed", grant };
  }

  if (now >= grant.expiresAt) {
    return { status: "expired", grant };
  }

  return { status: "current", grant };
}

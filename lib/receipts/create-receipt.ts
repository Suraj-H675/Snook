import { evaluateConsentPlan } from "../plans/create-plan.ts";
import type {
  PlanCapabilityImpact,
  PlanSharingChange,
  StagedConsentPlan,
} from "../plans/types.ts";
import { PRIVACY_CATALOG } from "../privacy/catalog.ts";
import {
  getEnabledOptionalProcessing,
  getThirdPartySharing,
} from "../privacy/queries.ts";
import { calculatePrivacyScore } from "../privacy/scoring.ts";
import {
  DATA_CATEGORY_IDS,
} from "../privacy/types.ts";
import type {
  PrivacyAccountState,
  PrivacyCatalog,
} from "../privacy/types.ts";
import {
  PRIVACY_RECEIPT_DEMO_DISCLAIMER,
  PRIVACY_RECEIPT_SOURCE,
  type PrivacyReceipt,
  type PrivacyReceiptChange,
  type PrivacyReceiptSnapshot,
} from "./types.ts";

export interface PrivacyReceiptCreationOptions {
  readonly catalog?: PrivacyCatalog;
  readonly clock?: () => number;
  readonly generateReceiptId?: () => string;
}

function createDefaultReceiptId(): string {
  const browserCrypto = globalThis.crypto;
  if (browserCrypto?.randomUUID) {
    return `receipt_${browserCrypto.randomUUID()}`;
  }

  if (browserCrypto?.getRandomValues) {
    const bytes = new Uint8Array(16);
    browserCrypto.getRandomValues(bytes);
    return `receipt_${Array.from(bytes, (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("")}`;
  }

  throw new Error("A secure platform random ID is required for a receipt.");
}

function snapshotForState(
  state: PrivacyAccountState,
  catalog: PrivacyCatalog,
): PrivacyReceiptSnapshot {
  return {
    privacyScore: calculatePrivacyScore(state, catalog),
    enabledOptionalCount: getEnabledOptionalProcessing(state, catalog).length,
    thirdPartySharing: [...getThirdPartySharing(state, catalog)],
  };
}

function snapshotsMatch(
  left: PrivacyReceiptSnapshot,
  right: PrivacyReceiptSnapshot,
): boolean {
  return (
    left.privacyScore === right.privacyScore &&
    left.enabledOptionalCount === right.enabledOptionalCount &&
    left.thirdPartySharing.length === right.thirdPartySharing.length &&
    left.thirdPartySharing.every(
      (recipientId, index) => recipientId === right.thirdPartySharing[index],
    )
  );
}

function cloneCapabilityImpacts(
  impacts: readonly PlanCapabilityImpact[],
): readonly PlanCapabilityImpact[] {
  return impacts.map((impact) => ({
    ...impact,
    affectedByCategoryIds: [...impact.affectedByCategoryIds],
    dependencyDescriptions: [...impact.dependencyDescriptions],
  }));
}

function cloneSharingChanges(
  changes: readonly PlanSharingChange[],
): readonly PlanSharingChange[] {
  return changes.map((change) => ({
    ...change,
    purposeIds: [...change.purposeIds],
  }));
}

function changesMatch(
  left: readonly { categoryId: string; targetConsentState: string }[],
  right: readonly { categoryId: string; targetConsentState: string }[],
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

function statesMatch(
  left: PrivacyAccountState,
  right: PrivacyAccountState,
): boolean {
  return (
    left.stateVersion === right.stateVersion &&
    DATA_CATEGORY_IDS.every(
      (categoryId) =>
        left.categories[categoryId].consentState ===
        right.categories[categoryId].consentState,
    )
  );
}

function createReceiptChanges(
  beforeState: PrivacyAccountState,
  afterState: PrivacyAccountState,
  plan: StagedConsentPlan,
  catalog: PrivacyCatalog,
): readonly PrivacyReceiptChange[] {
  return plan.changes.map((change) => {
    const category = catalog.categories[change.categoryId];
    const previous = beforeState.categories[change.categoryId]?.consentState;
    const applied = afterState.categories[change.categoryId]?.consentState;

    if (!category || !previous || !applied) {
      throw new Error("A receipt change referenced an invalid account category.");
    }

    if (applied !== change.targetConsentState || previous === applied) {
      throw new Error(
        `The applied state for ${category.name} does not match the approved plan.`,
      );
    }

    return {
      categoryId: category.id,
      categoryName: category.name,
      previousConsentState: previous,
      appliedConsentState: applied,
    };
  });
}

function assertReceiptInputs(
  beforeState: PrivacyAccountState,
  afterState: PrivacyAccountState,
  plan: StagedConsentPlan,
  evaluatedAfter: PrivacyReceiptSnapshot,
  actualAfter: PrivacyReceiptSnapshot,
): void {
  if (plan.planId.length === 0 || !/^[0-9a-f]{64}$/.test(plan.planHash)) {
    throw new Error("The approved plan identity is not valid for a receipt.");
  }

  if (
    plan.baseStateVersion !== beforeState.stateVersion ||
    afterState.stateVersion !== beforeState.stateVersion + 1
  ) {
    throw new Error("A receipt requires one successful state-version transition.");
  }

  if (!snapshotsMatch(evaluatedAfter, actualAfter)) {
    throw new Error(
      "The actual applied state does not match the approved plan receipt.",
    );
  }
}

/**
 * Build a receipt from the actual states on either side of one successful
 * approved application. This function does not persist or publish the record.
 */
export function createPrivacyReceipt(
  beforeState: PrivacyAccountState,
  afterState: PrivacyAccountState,
  plan: StagedConsentPlan,
  options: PrivacyReceiptCreationOptions = {},
): PrivacyReceipt {
  const catalog = options.catalog ?? PRIVACY_CATALOG;
  const before = snapshotForState(beforeState, catalog);
  const after = snapshotForState(afterState, catalog);
  const evaluated = evaluateConsentPlan(
    { changes: plan.changes },
    beforeState,
    catalog,
  );

  if (!evaluated.ok) {
    throw new Error(evaluated.error.message);
  }

  const expectedAfterState = {
    stateVersion: beforeState.stateVersion + 1,
    categories: Object.fromEntries(
      Object.entries(beforeState.categories).map(([categoryId, categoryState]) => {
        const change = plan.changes.find(
          (candidate) => candidate.categoryId === categoryId,
        );
        return [
          categoryId,
          change
            ? { consentState: change.targetConsentState }
            : { consentState: categoryState.consentState },
        ];
      }),
    ) as PrivacyAccountState["categories"],
  } satisfies PrivacyAccountState;

  if (
    !changesMatch(evaluated.data.changes, plan.changes) ||
    !statesMatch(expectedAfterState, afterState)
  ) {
    throw new Error(
      "The actual applied state does not match the approved plan receipt.",
    );
  }

  assertReceiptInputs(
    beforeState,
    afterState,
    plan,
    evaluated.data.after,
    after,
  );

  const clock = options.clock ?? (() => Date.now());
  const generatedAt = clock();
  if (
    !Number.isSafeInteger(generatedAt) ||
    generatedAt < 0 ||
    !Number.isFinite(new Date(generatedAt).getTime())
  ) {
    throw new Error("Receipt time must be a valid nonnegative epoch timestamp.");
  }

  const generateReceiptId =
    options.generateReceiptId ?? createDefaultReceiptId;
  const receiptId = generateReceiptId();
  if (!/^receipt_[A-Za-z0-9_-]+$/.test(receiptId)) {
    throw new Error("Receipt ID must be a non-empty string.");
  }

  return {
    receiptId,
    generatedAt,
    source: PRIVACY_RECEIPT_SOURCE,
    appliedPlan: {
      planId: plan.planId,
      revision: plan.revision,
      planHash: plan.planHash,
      baseStateVersion: plan.baseStateVersion,
    },
    previousStateVersion: beforeState.stateVersion,
    stateVersion: afterState.stateVersion,
    changes: createReceiptChanges(beforeState, afterState, plan, catalog),
    before,
    after,
    privacyScoreDelta: after.privacyScore - before.privacyScore,
    capabilityImpacts: cloneCapabilityImpacts(evaluated.data.capabilityImpacts),
    sharingChanges: cloneSharingChanges(evaluated.data.sharingChanges),
    humanApprovalRequired: true,
    approvalConsumed: true,
    demoDisclaimer: PRIVACY_RECEIPT_DEMO_DISCLAIMER,
  };
}

export function hasAccountChangedSinceReceipt(
  currentStateVersion: number,
  receipt: PrivacyReceipt | null,
): boolean {
  return receipt !== null && currentStateVersion !== receipt.stateVersion;
}

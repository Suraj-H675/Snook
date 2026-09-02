import { PRIVACY_CATALOG } from "../privacy/catalog.ts";
import {
  CAPABILITY_IDS,
  DATA_CATEGORY_IDS,
  PURPOSE_IDS,
  RECIPIENT_IDS,
} from "../privacy/types.ts";
import type {
  CapabilityId,
  ConsentState,
  DataCategoryId,
  RecipientId,
} from "../privacy/types.ts";
import {
  PRIVACY_RECEIPT_DEMO_DISCLAIMER,
  PRIVACY_RECEIPT_SOURCE,
  type PrivacyReceipt,
  type PrivacyReceiptChange,
  type PrivacyReceiptSnapshot,
} from "./types.ts";
import type {
  CapabilityAvailability,
  CapabilityImpactChange,
  PlanCapabilityImpact,
  PlanSharingChange,
} from "../plans/types.ts";

export const PRIVACY_RECEIPT_STORAGE_KEY = "snook:privacy-receipt" as const;
export const PRIVACY_RECEIPT_STORAGE_SCHEMA_VERSION = 1 as const;

interface PersistedPrivacyReceiptEnvelope {
  readonly schemaVersion: typeof PRIVACY_RECEIPT_STORAGE_SCHEMA_VERSION;
  readonly receipt: PrivacyReceipt;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
): boolean {
  const keys = Object.keys(value).sort();
  const sortedExpectedKeys = [...expectedKeys].sort();
  return (
    keys.length === sortedExpectedKeys.length &&
    keys.every((key, index) => key === sortedExpectedKeys[index])
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isSafePositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}

function isSafeNonnegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isReceiptTimestamp(value: unknown): value is number {
  return (
    isSafeNonnegativeInteger(value) &&
    Number.isFinite(new Date(value).getTime())
  );
}

function isDataCategoryId(value: unknown): value is DataCategoryId {
  return (
    typeof value === "string" &&
    DATA_CATEGORY_IDS.some((categoryId) => categoryId === value)
  );
}

function isPurposeId(value: unknown): boolean {
  return typeof value === "string" && PURPOSE_IDS.some((id) => id === value);
}

function isCapabilityId(value: unknown): value is CapabilityId {
  return typeof value === "string" && CAPABILITY_IDS.some((id) => id === value);
}

function isRecipientId(value: unknown): value is RecipientId {
  return (
    typeof value === "string" && RECIPIENT_IDS.some((id) => id === value)
  );
}

function isConsentState(value: unknown): value is ConsentState {
  return value === "required" || value === "enabled" || value === "disabled";
}

function isControllableConsentState(value: unknown): value is "enabled" | "disabled" {
  return value === "enabled" || value === "disabled";
}

function isPlanHash(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

function isUniqueStringArray(
  value: unknown,
  predicate: (item: unknown) => boolean,
  options: { readonly allowEmpty: boolean } = { allowEmpty: true },
): value is readonly string[] {
  if (!Array.isArray(value)) {
    return false;
  }

  if (!options.allowEmpty && value.length === 0) {
    return false;
  }

  const seen = new Set<string>();
  return value.every((item) => {
    if (!predicate(item) || typeof item !== "string" || seen.has(item)) {
      return false;
    }
    seen.add(item);
    return true;
  });
}

function isThirdPartyRecipientId(value: unknown): value is RecipientId {
  return isRecipientId(value) && PRIVACY_CATALOG.recipients[value].kind === "third_party";
}

function isReceiptId(value: unknown): value is string {
  return typeof value === "string" && /^receipt_[A-Za-z0-9_-]+$/.test(value);
}

function isReceiptSnapshot(value: unknown): value is PrivacyReceiptSnapshot {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "privacyScore",
      "enabledOptionalCount",
      "thirdPartySharing",
    ]) ||
    !isSafeNonnegativeInteger(value.privacyScore) ||
    value.privacyScore > 100 ||
    !isSafeNonnegativeInteger(value.enabledOptionalCount) ||
    value.enabledOptionalCount >
      Object.values(PRIVACY_CATALOG.categories).filter(
        (category) => category.processingRequirement === "optional",
      ).length ||
    !isUniqueStringArray(value.thirdPartySharing, isThirdPartyRecipientId)
  ) {
    return false;
  }

  return true;
}

function isReceiptChange(value: unknown): value is PrivacyReceiptChange {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "categoryId",
      "categoryName",
      "previousConsentState",
      "appliedConsentState",
    ]) ||
    !isDataCategoryId(value.categoryId) ||
    !isNonEmptyString(value.categoryName) ||
    value.categoryName !== PRIVACY_CATALOG.categories[value.categoryId].name ||
    !isConsentState(value.previousConsentState) ||
    !isConsentState(value.appliedConsentState) ||
    !isControllableConsentState(value.previousConsentState) ||
    !isControllableConsentState(value.appliedConsentState) ||
    value.previousConsentState === value.appliedConsentState
  ) {
    return false;
  }

  return PRIVACY_CATALOG.categories[value.categoryId].processingRequirement === "optional";
}

function isCapabilityAvailability(value: unknown): value is CapabilityAvailability {
  return value === "available" || value === "degraded" || value === "unavailable";
}

function isCapabilityImpactChange(value: unknown): value is CapabilityImpactChange {
  return (
    value === "unaffected" ||
    value === "degraded" ||
    value === "unavailable" ||
    value === "improved"
  );
}

function expectedCapabilityChange(
  before: CapabilityAvailability,
  after: CapabilityAvailability,
): CapabilityImpactChange {
  if (before === after) {
    return "unaffected";
  }
  if (after === "unavailable") {
    return "unavailable";
  }
  if (after === "degraded") {
    return "degraded";
  }
  return "improved";
}

function isCapabilityImpact(value: unknown): value is PlanCapabilityImpact {
  const capabilityId = isRecord(value) ? value.capabilityId : undefined;
  const capability = isCapabilityId(capabilityId)
    ? PRIVACY_CATALOG.capabilities[capabilityId]
    : undefined;
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "capabilityId",
      "capabilityName",
      "before",
      "after",
      "change",
      "affectedByCategoryIds",
      "dependencyDescriptions",
    ]) ||
    !capability ||
    !isNonEmptyString(value.capabilityName) ||
    value.capabilityName !== capability.name ||
    !isCapabilityAvailability(value.before) ||
    !isCapabilityAvailability(value.after) ||
    !isCapabilityImpactChange(value.change) ||
    value.change !== expectedCapabilityChange(value.before, value.after) ||
    !isUniqueStringArray(value.affectedByCategoryIds, isDataCategoryId) ||
    !Array.isArray(value.dependencyDescriptions) ||
    !value.dependencyDescriptions.every(isNonEmptyString)
  ) {
    return false;
  }

  return true;
}

function isSharingChange(value: unknown): value is PlanSharingChange {
  const categoryId = isRecord(value) ? value.categoryId : undefined;
  const recipientId = isRecord(value) ? value.recipientId : undefined;
  const category = isDataCategoryId(categoryId)
    ? PRIVACY_CATALOG.categories[categoryId]
    : undefined;
  const recipient = isThirdPartyRecipientId(recipientId)
    ? PRIVACY_CATALOG.recipients[recipientId]
    : undefined;
  const purposeIds = isRecord(value) ? value.purposeIds : undefined;
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "id",
      "categoryId",
      "categoryName",
      "recipientId",
      "recipientName",
      "purposeIds",
      "beforeActive",
      "afterActive",
      "change",
    ]) ||
    !isNonEmptyString(value.id) ||
    !category ||
    !isNonEmptyString(value.categoryName) ||
    value.categoryName !== category.name ||
    !recipient ||
    !isNonEmptyString(value.recipientName) ||
    value.recipientName !== recipient.name ||
    !isUniqueStringArray(purposeIds, isPurposeId, { allowEmpty: false }) ||
    typeof value.beforeActive !== "boolean" ||
    typeof value.afterActive !== "boolean" ||
    value.beforeActive === value.afterActive ||
    (value.change !== "stops" && value.change !== "starts") ||
    value.change !== (value.afterActive ? "starts" : "stops") ||
    value.id !== `${categoryId}:recipient:${recipientId}`
  ) {
    return false;
  }

  const destination = category.sharedWith.find(
    (candidate) => candidate.recipientId === recipientId,
  );
  return (
    destination !== undefined &&
    destination.purposeIds.length === purposeIds.length &&
    destination.purposeIds.every((purposeId) => purposeIds.includes(purposeId))
  );
}

function hasEveryCapabilityOnce(
  impacts: readonly PlanCapabilityImpact[],
): boolean {
  const ids = impacts.map((impact) => impact.capabilityId);
  return (
    ids.length === CAPABILITY_IDS.length &&
    new Set(ids).size === ids.length &&
    CAPABILITY_IDS.every((capabilityId) => ids.includes(capabilityId))
  );
}

function isPrivacyReceipt(value: unknown): value is PrivacyReceipt {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "receiptId",
      "generatedAt",
      "source",
      "appliedPlan",
      "previousStateVersion",
      "stateVersion",
      "changes",
      "before",
      "after",
      "privacyScoreDelta",
      "capabilityImpacts",
      "sharingChanges",
      "humanApprovalRequired",
      "approvalConsumed",
      "demoDisclaimer",
    ]) ||
    !isReceiptId(value.receiptId) ||
    !isReceiptTimestamp(value.generatedAt) ||
    value.source !== PRIVACY_RECEIPT_SOURCE ||
    !isRecord(value.appliedPlan) ||
    !hasOnlyKeys(value.appliedPlan, [
      "planId",
      "revision",
      "planHash",
      "baseStateVersion",
    ]) ||
    !isNonEmptyString(value.appliedPlan.planId) ||
    !isSafePositiveInteger(value.appliedPlan.revision) ||
    !isPlanHash(value.appliedPlan.planHash) ||
    !isSafePositiveInteger(value.appliedPlan.baseStateVersion) ||
    !isSafePositiveInteger(value.previousStateVersion) ||
    !isSafePositiveInteger(value.stateVersion) ||
    value.stateVersion !== value.previousStateVersion + 1 ||
    value.appliedPlan.baseStateVersion !== value.previousStateVersion ||
    !Array.isArray(value.changes) ||
    value.changes.length === 0 ||
    !value.changes.every(isReceiptChange) ||
    new Set(value.changes.map((change) => change.categoryId)).size !==
      value.changes.length ||
    !isReceiptSnapshot(value.before) ||
    !isReceiptSnapshot(value.after) ||
    !isSafeIntegerDelta(value.privacyScoreDelta) ||
    value.privacyScoreDelta !== value.after.privacyScore - value.before.privacyScore ||
    !Array.isArray(value.capabilityImpacts) ||
    !value.capabilityImpacts.every(isCapabilityImpact) ||
    !hasEveryCapabilityOnce(value.capabilityImpacts) ||
    !Array.isArray(value.sharingChanges) ||
    !value.sharingChanges.every(isSharingChange) ||
    new Set(
      value.sharingChanges.map(
        (change) => `${change.categoryId}:${change.recipientId}`,
      ),
    ).size !== value.sharingChanges.length ||
    value.humanApprovalRequired !== true ||
    value.approvalConsumed !== true ||
    value.demoDisclaimer !== PRIVACY_RECEIPT_DEMO_DISCLAIMER
  ) {
    return false;
  }

  return true;
}

function isSafeIntegerDelta(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

function cloneSnapshot(snapshot: PrivacyReceiptSnapshot): PrivacyReceiptSnapshot {
  return {
    privacyScore: snapshot.privacyScore,
    enabledOptionalCount: snapshot.enabledOptionalCount,
    thirdPartySharing: [...snapshot.thirdPartySharing],
  };
}

function cloneReceiptChange(change: PrivacyReceiptChange): PrivacyReceiptChange {
  return { ...change };
}

function cloneCapabilityImpact(impact: PlanCapabilityImpact): PlanCapabilityImpact {
  return {
    ...impact,
    affectedByCategoryIds: [...impact.affectedByCategoryIds],
    dependencyDescriptions: [...impact.dependencyDescriptions],
  };
}

function cloneSharingChange(change: PlanSharingChange): PlanSharingChange {
  return { ...change, purposeIds: [...change.purposeIds] };
}

export function clonePrivacyReceipt(receipt: PrivacyReceipt): PrivacyReceipt {
  return {
    ...receipt,
    appliedPlan: { ...receipt.appliedPlan },
    changes: receipt.changes.map(cloneReceiptChange),
    before: cloneSnapshot(receipt.before),
    after: cloneSnapshot(receipt.after),
    capabilityImpacts: receipt.capabilityImpacts.map(cloneCapabilityImpact),
    sharingChanges: receipt.sharingChanges.map(cloneSharingChange),
  };
}

export function isValidPrivacyReceipt(value: unknown): value is PrivacyReceipt {
  return isPrivacyReceipt(value);
}

export function serializePrivacyReceipt(receipt: PrivacyReceipt): string {
  if (!isPrivacyReceipt(receipt)) {
    throw new Error("Cannot serialize an invalid privacy receipt.");
  }

  const envelope: PersistedPrivacyReceiptEnvelope = {
    schemaVersion: PRIVACY_RECEIPT_STORAGE_SCHEMA_VERSION,
    receipt: clonePrivacyReceipt(receipt),
  };
  return JSON.stringify(envelope);
}

export function parsePersistedPrivacyReceipt(
  raw: string | null,
): PrivacyReceipt | null {
  if (raw === null) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      !isRecord(parsed) ||
      !hasOnlyKeys(parsed, ["schemaVersion", "receipt"]) ||
      parsed.schemaVersion !== PRIVACY_RECEIPT_STORAGE_SCHEMA_VERSION ||
      !isPrivacyReceipt(parsed.receipt)
    ) {
      return null;
    }

    return clonePrivacyReceipt(parsed.receipt);
  } catch {
    return null;
  }
}

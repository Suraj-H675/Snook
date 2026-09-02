import { DATA_CATEGORY_IDS, CONSENT_TARGET_STATES } from "../privacy/types.ts";
import { getDataCategory } from "../privacy/queries.ts";
import { PRIVACY_CATALOG } from "../privacy/catalog.ts";
import type {
  ConsentChange,
  ConsentTargetState,
  DataCategoryId,
  PrivacyAccountState,
  PrivacyCatalog,
} from "../privacy/types.ts";
import type { PlanError, PlanFailureResult } from "./types.ts";

export type NormalizePlanChangesResult =
  | { readonly ok: true; readonly changes: readonly ConsentChange[] }
  | PlanFailureResult;

function failure(
  code: PlanError["code"],
  message: string,
): PlanFailureResult {
  return { ok: false, error: { code, message } };
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

function isDataCategoryId(value: unknown): value is DataCategoryId {
  return (
    typeof value === "string" &&
    DATA_CATEGORY_IDS.some((categoryId) => categoryId === value)
  );
}

function isConsentTargetState(value: unknown): value is ConsentTargetState {
  return (
    typeof value === "string" &&
    CONSENT_TARGET_STATES.some((targetState) => targetState === value)
  );
}

function displayInput(value: unknown): string {
  if (value === undefined) {
    return "missing";
  }
  if (typeof value === "string") {
    return value;
  }
  return String(value);
}

function invalidCategory(value: unknown): PlanFailureResult {
  return failure(
    "INVALID_DATA_CATEGORY",
    `Unknown data category ID “${displayInput(value)}”. Use one of the canonical category IDs.`,
  );
}

function normalizeCategoryChange(
  rawChange: unknown,
  index: number,
  state: PrivacyAccountState,
  catalog: PrivacyCatalog,
  seenCategoryIds: Set<DataCategoryId>,
): { readonly ok: true; readonly change: ConsentChange | null } | PlanFailureResult {
  if (!isRecord(rawChange) || !hasExactlyKeys(rawChange, ["categoryId", "targetConsentState"])) {
    return failure(
      "INVALID_PLAN_INPUT",
      `Change ${index + 1} must contain only categoryId and targetConsentState.`,
    );
  }

  const rawCategoryId = rawChange.categoryId;
  if (!isDataCategoryId(rawCategoryId)) {
    if (typeof rawCategoryId === "string") {
      return invalidCategory(rawCategoryId);
    }

    return failure(
      "INVALID_PLAN_INPUT",
      `Change ${index + 1} must include a canonical categoryId.`,
    );
  }

  const category = getDataCategory(rawCategoryId, catalog);
  if (!category) {
    return invalidCategory(rawCategoryId);
  }

  if (seenCategoryIds.has(category.id)) {
    return failure(
      "INVALID_PLAN_INPUT",
      `Only one proposed change is allowed for each data category. “${category.name}” appears more than once.`,
    );
  }
  seenCategoryIds.add(category.id);

  const rawTargetState = rawChange.targetConsentState;
  if (!isConsentTargetState(rawTargetState)) {
    return failure(
      "INVALID_PLAN_INPUT",
      `Change ${index + 1} must target either enabled or disabled consent state.`,
    );
  }

  const currentCategoryState = state.categories[category.id];
  if (!currentCategoryState) {
    return failure(
      "INVALID_PLAN_INPUT",
      `The current state is missing “${category.name}”.`,
    );
  }

  if (
    rawTargetState === "disabled" &&
    category.processingRequirement === "required"
  ) {
    return failure(
      "REQUIRED_PROCESSING_CANNOT_BE_DISABLED",
      `${category.name} is required for core account or security operation and cannot be disabled.`,
    );
  }

  if (
    category.processingRequirement === "optional" &&
    !category.controllable
  ) {
    return failure(
      "INVALID_PLAN_INPUT",
      `${category.name} is not a controllable optional processing category.`,
    );
  }

  const currentTargetState: ConsentTargetState | null =
    category.processingRequirement === "required"
      ? "enabled"
      : currentCategoryState.consentState === "enabled" ||
          currentCategoryState.consentState === "disabled"
        ? currentCategoryState.consentState
        : null;

  if (currentTargetState === null) {
    return failure(
      "INVALID_PLAN_INPUT",
      `The current state for “${category.name}” is invalid.`,
    );
  }

  if (currentTargetState === rawTargetState) {
    return { ok: true, change: null };
  }

  return {
    ok: true,
    change: {
      categoryId: category.id,
      targetConsentState: rawTargetState,
    },
  };
}

/**
 * Validate the exact planning input shape and normalize meaningful changes
 * into canonical catalog order. This is intentionally independent of JSON
 * Schema validation so direct callers receive the same safety guarantees as
 * WebMCP callers.
 */
export function normalizePlanChanges(
  input: unknown,
  state: PrivacyAccountState,
  catalog: PrivacyCatalog = PRIVACY_CATALOG,
): NormalizePlanChangesResult {
  if (!isRecord(input) || !hasExactlyKeys(input, ["changes"])) {
    return failure(
      "INVALID_PLAN_INPUT",
      "Plan input must be an object containing only a non-empty changes array.",
    );
  }

  const rawChanges = input.changes;
  if (!Array.isArray(rawChanges) || rawChanges.length === 0) {
    return failure(
      "INVALID_PLAN_INPUT",
      "Plan changes must be a non-empty array.",
    );
  }

  const seenCategoryIds = new Set<DataCategoryId>();
  const normalizedChanges: ConsentChange[] = [];

  for (const [index, rawChange] of rawChanges.entries()) {
    const result = normalizeCategoryChange(
      rawChange,
      index,
      state,
      catalog,
      seenCategoryIds,
    );
    if (!result.ok) {
      return result;
    }
    if (result.change) {
      normalizedChanges.push(result.change);
    }
  }

  normalizedChanges.sort(
    (left, right) =>
      DATA_CATEGORY_IDS.indexOf(left.categoryId) -
      DATA_CATEGORY_IDS.indexOf(right.categoryId),
  );

  if (normalizedChanges.length === 0) {
    return failure(
      "NO_VALID_CHANGES",
      "Every requested category is already in the requested state; there is nothing to preview or stage.",
    );
  }

  return { ok: true, changes: normalizedChanges };
}

export function normalizeConsentChanges(
  changes: unknown,
  state: PrivacyAccountState,
  catalog: PrivacyCatalog = PRIVACY_CATALOG,
): NormalizePlanChangesResult {
  return normalizePlanChanges({ changes }, state, catalog);
}

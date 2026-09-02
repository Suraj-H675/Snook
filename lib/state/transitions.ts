import { PRIVACY_CATALOG } from "../privacy/catalog.ts";
import { getDataCategory } from "../privacy/queries.ts";
import type {
  ConsentChange,
  ConsentState,
  DataCategoryId,
  PrivacyAccountState,
  PrivacyCatalog,
} from "../privacy/types.ts";

export type PrivacyTransitionErrorCode =
  | "INVALID_DATA_CATEGORY"
  | "INVALID_CONSENT_STATE"
  | "INVALID_PRIVACY_STATE"
  | "REQUIRED_PROCESSING_CANNOT_BE_DISABLED"
  | "NO_OP";

export interface PrivacyTransitionError {
  readonly code: PrivacyTransitionErrorCode;
  readonly message: string;
}

export interface PrivacyTransitionSuccess {
  readonly ok: true;
  readonly state: PrivacyAccountState;
  readonly categoryId: DataCategoryId;
  readonly previousState: ConsentState;
  readonly nextState: "enabled" | "disabled";
}

export interface PrivacyTransitionFailure {
  readonly ok: false;
  readonly state: PrivacyAccountState;
  readonly error: PrivacyTransitionError;
}

export type PrivacyTransitionResult =
  | PrivacyTransitionSuccess
  | PrivacyTransitionFailure;

export interface PrivacyBatchTransitionSuccess {
  readonly ok: true;
  readonly state: PrivacyAccountState;
}

export interface PrivacyBatchTransitionFailure {
  readonly ok: false;
  readonly state: PrivacyAccountState;
  readonly error: PrivacyTransitionError;
}

export type PrivacyBatchTransitionResult =
  | PrivacyBatchTransitionSuccess
  | PrivacyBatchTransitionFailure;

function failure(
  state: PrivacyAccountState,
  code: PrivacyTransitionErrorCode,
  message: string,
): PrivacyTransitionFailure {
  return {
    ok: false,
    state,
    error: { code, message },
  };
}

/**
 * Apply one direct human setting change without mutating the input state.
 *
 * This is deliberately narrower than a future plan/apply transition: Phase 2
 * only permits direct changes to optional, controllable categories.
 */
export function setCategoryConsentState(
  state: PrivacyAccountState,
  categoryId: string,
  desiredState: string,
  catalog: PrivacyCatalog = PRIVACY_CATALOG,
): PrivacyTransitionResult {
  const category = getDataCategory(categoryId, catalog);
  if (!category) {
    return failure(
      state,
      "INVALID_DATA_CATEGORY",
      `The data category “${categoryId}” does not exist.`,
    );
  }

  if (desiredState !== "enabled" && desiredState !== "disabled") {
    return failure(
      state,
      "INVALID_CONSENT_STATE",
      "A controllable privacy setting must be enabled or disabled.",
    );
  }

  const currentCategoryState = state.categories[category.id];
  if (!currentCategoryState) {
    return failure(
      state,
      "INVALID_PRIVACY_STATE",
      `The current state is missing “${category.name}”.`,
    );
  }

  if (category.processingRequirement === "required" || !category.controllable) {
    if (desiredState === "disabled") {
      return failure(
        state,
        "REQUIRED_PROCESSING_CANNOT_BE_DISABLED",
        `${category.name} is required for core account or security operation and cannot be disabled.`,
      );
    }

    return failure(
      state,
      "INVALID_CONSENT_STATE",
      `${category.name} is required and cannot be changed through an optional setting.`,
    );
  }

  if (currentCategoryState.consentState === desiredState) {
    return failure(
      state,
      "NO_OP",
      `${category.name} is already ${desiredState}.`,
    );
  }

  return {
    ok: true,
    state: {
      stateVersion: state.stateVersion + 1,
      categories: {
        ...state.categories,
        [category.id]: { consentState: desiredState },
      },
    },
    categoryId: category.id,
    previousState: currentCategoryState.consentState,
    nextState: desiredState,
  };
}

/**
 * Apply a previously validated set of category changes to an immutable
 * working state. Each individual transition reuses the same invariant checks
 * as the direct human control path; callers decide whether the returned state
 * should be committed to a real store.
 */
export function applyConsentChanges(
  state: PrivacyAccountState,
  changes: readonly ConsentChange[],
  catalog: PrivacyCatalog = PRIVACY_CATALOG,
): PrivacyBatchTransitionResult {
  let nextState = state;

  for (const change of changes) {
    const result = setCategoryConsentState(
      nextState,
      change.categoryId,
      change.targetConsentState,
      catalog,
    );
    if (!result.ok) {
      return {
        ok: false,
        state,
        error: result.error,
      };
    }

    nextState = result.state;
  }

  return { ok: true, state: nextState };
}

import { PRIVACY_CATALOG } from "../privacy/catalog.ts";
import { getSeededPrivacyState } from "../privacy/seed.ts";
import { DATA_CATEGORY_IDS } from "../privacy/types.ts";
import type {
  ConsentState,
  DataCategoryId,
  PrivacyAccountState,
} from "../privacy/types.ts";

export const PRIVACY_STATE_STORAGE_KEY = "snook:privacy-state" as const;
export const PRIVACY_STATE_STORAGE_SCHEMA_VERSION = 1 as const;

interface PersistedPrivacyStateEnvelope {
  readonly schemaVersion: typeof PRIVACY_STATE_STORAGE_SCHEMA_VERSION;
  readonly state: PrivacyAccountState;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
): boolean {
  const keys = Object.keys(value).sort();
  return (
    keys.length === expectedKeys.length &&
    keys.every((key, index) => key === [...expectedKeys].sort()[index])
  );
}

function isConsentState(value: unknown): value is ConsentState {
  return value === "required" || value === "enabled" || value === "disabled";
}

function clonePrivacyState(state: PrivacyAccountState): PrivacyAccountState {
  return {
    stateVersion: state.stateVersion,
    categories: Object.fromEntries(
      DATA_CATEGORY_IDS.map((categoryId) => [
        categoryId,
        { consentState: state.categories[categoryId].consentState },
      ]),
    ) as Record<DataCategoryId, { consentState: ConsentState }>,
  };
}

function isValidPrivacyAccountState(
  value: unknown,
): value is PrivacyAccountState {
  if (!isRecord(value)) {
    return false;
  }

  const categories = value.categories;

  if (
    typeof value.stateVersion !== "number" ||
    !Number.isSafeInteger(value.stateVersion) ||
    value.stateVersion < 1 ||
    !isRecord(categories) ||
    !hasOnlyKeys(categories, DATA_CATEGORY_IDS)
  ) {
    return false;
  }

  return DATA_CATEGORY_IDS.every((categoryId) => {
    const categoryState = categories[categoryId];
    if (!isRecord(categoryState) || !hasOnlyKeys(categoryState, ["consentState"])) {
      return false;
    }

    const consentState = categoryState.consentState;
    if (!isConsentState(consentState)) {
      return false;
    }

    const category = PRIVACY_CATALOG.categories[categoryId];
    return category.processingRequirement === "required"
      ? consentState === "required"
      : consentState === "enabled" || consentState === "disabled";
  });
}

export function serializePrivacyState(state: PrivacyAccountState): string {
  const envelope: PersistedPrivacyStateEnvelope = {
    schemaVersion: PRIVACY_STATE_STORAGE_SCHEMA_VERSION,
    state: clonePrivacyState(state),
  };

  return JSON.stringify(envelope);
}

/**
 * Parse and validate only the current demo account state. Invalid data is
 * rejected rather than partially repaired so a stale or corrupted setting can
 * never weaken the required-processing invariant.
 */
export function parsePersistedPrivacyState(
  raw: string | null,
): PrivacyAccountState | null {
  if (raw === null) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    const parsedState = isRecord(parsed) ? parsed.state : undefined;
    if (
      !isRecord(parsed) ||
      parsed.schemaVersion !== PRIVACY_STATE_STORAGE_SCHEMA_VERSION ||
      !isValidPrivacyAccountState(parsedState)
    ) {
      return null;
    }

    return clonePrivacyState(parsedState);
  } catch {
    return null;
  }
}

export function restorePrivacyState(raw: string | null): PrivacyAccountState {
  return parsePersistedPrivacyState(raw) ?? getSeededPrivacyState();
}

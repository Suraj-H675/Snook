import assert from "node:assert/strict";
import test from "node:test";
import { getPrivacySummary } from "../lib/privacy/engine.ts";
import { getSeededPrivacyState } from "../lib/privacy/seed.ts";
import { getThirdPartySharingRelationships } from "../lib/privacy/queries.ts";
import {
  parsePersistedPrivacyState,
  restorePrivacyState,
  serializePrivacyState,
} from "../lib/state/persistence.ts";
import { setCategoryConsentState } from "../lib/state/transitions.ts";
import type { PrivacyAccountState } from "../lib/privacy/types.ts";
import { createPrivacySummaryTool } from "../lib/webmcp/tools/get-privacy-summary.ts";
import type { PrivacySummaryResult } from "../lib/privacy/types.ts";

const seed = getSeededPrivacyState();

function changedState(
  categoryId: keyof PrivacyAccountState["categories"],
  consentState: "enabled" | "disabled",
): PrivacyAccountState {
  const result = setCategoryConsentState(seed, categoryId, consentState);
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.state;
}

test("disabling an enabled optional category creates an immutable next state", () => {
  const result = setCategoryConsentState(seed, "location_history", "disabled");

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.state.stateVersion, 2);
  assert.equal(result.state.categories.location_history.consentState, "disabled");
  assert.equal(seed.stateVersion, 1);
  assert.equal(seed.categories.location_history.consentState, "enabled");
  assert.notEqual(result.state, seed);
  assert.notEqual(result.state.categories, seed.categories);
});

test("enabling a disabled optional category succeeds and advances the version", () => {
  const disabled = changedState("location_history", "disabled");
  const result = setCategoryConsentState(disabled, "location_history", "enabled");

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.state.stateVersion, 3);
  assert.equal(result.state.categories.location_history.consentState, "enabled");
});

test("required processing cannot be disabled by the state transition layer", () => {
  const result = setCategoryConsentState(
    seed,
    "fraud_abuse_signals",
    "disabled",
  );

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.equal(result.error.code, "REQUIRED_PROCESSING_CANNOT_BE_DISABLED");
  assert.equal(result.state.stateVersion, 1);
  assert.equal(result.state.categories.fraud_abuse_signals.consentState, "required");
});

test("no-op and invalid category changes are rejected without changing state", () => {
  const noOp = setCategoryConsentState(seed, "location_history", "enabled");
  assert.equal(noOp.ok, false);
  if (!noOp.ok) {
    assert.equal(noOp.error.code, "NO_OP");
    assert.equal(noOp.state.stateVersion, 1);
  }

  const invalid = setCategoryConsentState(seed, "not_a_category", "disabled");
  assert.equal(invalid.ok, false);
  if (!invalid.ok) {
    assert.equal(invalid.error.code, "INVALID_DATA_CATEGORY");
    assert.deepEqual(invalid.state, seed);
  }
});

test("invalid consent states are rejected without changing state", () => {
  const result = setCategoryConsentState(
    seed,
    "location_history",
    "required" as "enabled" | "disabled",
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "INVALID_CONSENT_STATE");
    assert.equal(result.state.stateVersion, 1);
  }
});

test("current summaries and third-party sharing derive from the changed state", () => {
  const withoutAnalytics = changedState("analytics_data", "disabled");
  const summary = getPrivacySummary(withoutAnalytics).data;

  assert.equal(summary.stateVersion, 2);
  assert.equal(summary.privacyScore, 55);
  assert.equal(summary.enabledOptionalProcessingCount, 5);
  assert.ok(!summary.enabledOptionalProcessingCategories.includes("analytics_data"));
  assert.deepEqual(
    getThirdPartySharingRelationships(withoutAnalytics).filter(
      ({ dataCategoryId }) => dataCategoryId === "analytics_data",
    ),
    [],
  );

  const withoutAllAnalyticsSharingSources = [
    "activity_history",
    "location_history",
    "analytics_data",
  ].reduce<PrivacyAccountState>(
    (current, categoryId) => {
      const result = setCategoryConsentState(current, categoryId, "disabled");
      if (!result.ok) {
        throw new Error(result.error.message);
      }
      return result.state;
    },
    seed,
  );

  assert.deepEqual(getThirdPartySharingRelationships(withoutAllAnalyticsSharingSources), []);
});

test("the read-only WebMCP adapter can read the current shared state", async () => {
  const currentState = changedState("marketing_profile", "disabled");
  const tool = createPrivacySummaryTool(undefined, () => currentState);
  const result = (await tool.execute(
    {},
    { signal: new AbortController().signal },
  )) as PrivacySummaryResult;

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.stateVersion, 2);
    assert.equal(result.data.privacyScore, 64);
    assert.equal(result.data.enabledOptionalProcessingCount, 5);
    assert.ok(!result.data.enabledOptionalProcessingCategories.includes("marketing_profile"));
  }
});

test("persisted privacy state is serialized with a schema and accepted when valid", () => {
  const serialized = serializePrivacyState(changedState("marketing_profile", "disabled"));
  const parsed = parsePersistedPrivacyState(serialized);

  assert.deepEqual(parsed, {
    stateVersion: 2,
    categories: {
      account_profile: { consentState: "required" },
      activity_history: { consentState: "enabled" },
      location_history: { consentState: "enabled" },
      recommendation_profile: { consentState: "enabled" },
      product_preferences: { consentState: "enabled" },
      analytics_data: { consentState: "enabled" },
      marketing_profile: { consentState: "disabled" },
      fraud_abuse_signals: { consentState: "required" },
    },
  });
});

test("malformed, incompatible, incomplete, and invalid persisted states fall back to the seed", () => {
  const invalidInputs = [
    null,
    "not json",
    JSON.stringify({ schemaVersion: 999, state: seed }),
    JSON.stringify({ schemaVersion: 1, state: { stateVersion: 2 } }),
    JSON.stringify({
      schemaVersion: 1,
      state: {
        stateVersion: 2,
        categories: {
          ...seed.categories,
          fraud_abuse_signals: { consentState: "disabled" },
        },
      },
    }),
    JSON.stringify({
      schemaVersion: 1,
      state: {
        stateVersion: 2,
        categories: {
          ...seed.categories,
          location_history: { consentState: "required" },
        },
      },
    }),
  ];

  for (const input of invalidInputs) {
    assert.equal(parsePersistedPrivacyState(input), null);
    assert.deepEqual(restorePrivacyState(input), seed);
  }
});

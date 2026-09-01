import assert from "node:assert/strict";
import test from "node:test";
import {
  getCategoryConsequences,
  getCategoryPurposes,
  getCategoryRetention,
  getCategorySharing,
  getCategoryState,
  getConsentState,
  getDataCategory,
  getDisabledOptionalProcessing,
  getEnabledOptionalProcessing,
  getHighestImpactPrivacyOpportunities,
  getPrivacySummary,
  getProductDependencies,
  getRequiredProcessing,
  getThirdPartySharing,
  getThirdPartySharingRelationships,
  isProcessingEnabled,
  isUserControllable,
} from "../lib/privacy/engine.ts";
import { PRIVACY_CATALOG } from "../lib/privacy/catalog.ts";
import { getPrivacyScoreBreakdown } from "../lib/privacy/scoring.ts";
import {
  getSeededPrivacyState,
  SEEDED_PRIVACY_STATE,
} from "../lib/privacy/seed.ts";
import {
  DATA_CATEGORY_IDS,
  type ConsentState,
  type DataCategoryId,
  type PrivacyAccountState,
} from "../lib/privacy/types.ts";
import {
  getSeededPrivacySummary,
  PRIVACY_SUMMARY_TOOL_NAME,
} from "../lib/privacy/summary.ts";
import { createPrivacySummaryTool } from "../lib/webmcp/tools/get-privacy-summary.ts";

function withConsentState(
  state: PrivacyAccountState,
  categoryId: DataCategoryId,
  consentState: ConsentState,
): PrivacyAccountState {
  return {
    ...state,
    categories: {
      ...state.categories,
      [categoryId]: { consentState },
    },
  };
}

test("seed has eight stable canonical categories and state version one", () => {
  const categories = Object.values(PRIVACY_CATALOG.categories);
  const categoryIds = categories.map((category) => category.id);

  assert.deepEqual(categoryIds, DATA_CATEGORY_IDS);
  assert.equal(new Set(categoryIds).size, categoryIds.length);
  assert.equal(categories.length, 8);
  assert.equal(SEEDED_PRIVACY_STATE.stateVersion, 1);
  const futureState: PrivacyAccountState = {
    ...SEEDED_PRIVACY_STATE,
    stateVersion: 2,
  };
  assert.equal(futureState.stateVersion, 2);
  for (const definitions of [
    Object.values(PRIVACY_CATALOG.purposes),
    Object.values(PRIVACY_CATALOG.capabilities),
    Object.values(PRIVACY_CATALOG.recipients),
  ]) {
    const ids = definitions.map((definition) => definition.id);
    assert.equal(new Set(ids).size, ids.length);
  }
  assert.deepEqual(
    getRequiredProcessing().map((category) => category.id),
    ["account_profile", "fraud_abuse_signals"],
  );
  assert.deepEqual(
    getEnabledOptionalProcessing().map((category) => category.id),
    [
      "activity_history",
      "location_history",
      "recommendation_profile",
      "product_preferences",
      "analytics_data",
      "marketing_profile",
    ],
  );
});

test("consent queries distinguish required, enabled, disabled, and controllable processing", () => {
  const seededConsent = getConsentState();

  assert.deepEqual(
    seededConsent.map(({ categoryId, consentState, required, controllable }) => ({
      categoryId,
      consentState,
      required,
      controllable,
    })),
    [
      {
        categoryId: "account_profile",
        consentState: "required",
        required: true,
        controllable: false,
      },
      {
        categoryId: "activity_history",
        consentState: "enabled",
        required: false,
        controllable: true,
      },
      {
        categoryId: "location_history",
        consentState: "enabled",
        required: false,
        controllable: true,
      },
      {
        categoryId: "recommendation_profile",
        consentState: "enabled",
        required: false,
        controllable: true,
      },
      {
        categoryId: "product_preferences",
        consentState: "enabled",
        required: false,
        controllable: true,
      },
      {
        categoryId: "analytics_data",
        consentState: "enabled",
        required: false,
        controllable: true,
      },
      {
        categoryId: "marketing_profile",
        consentState: "enabled",
        required: false,
        controllable: true,
      },
      {
        categoryId: "fraud_abuse_signals",
        consentState: "required",
        required: true,
        controllable: false,
      },
    ],
  );

  const disabledState = withConsentState(
    SEEDED_PRIVACY_STATE,
    "location_history",
    "disabled",
  );

  assert.equal(isProcessingEnabled(disabledState, "location_history"), false);
  assert.equal(isProcessingEnabled(disabledState, "fraud_abuse_signals"), true);
  assert.equal(isUserControllable("location_history"), true);
  assert.equal(isUserControllable("fraud_abuse_signals"), false);
  assert.deepEqual(getCategoryState("location_history"), {
    categoryId: "location_history",
    consentState: "enabled",
    enabled: true,
    required: false,
    controllable: true,
  });
  assert.equal(getCategoryState("unknown_category"), undefined);
  assert.deepEqual(
    getDisabledOptionalProcessing(disabledState).map((category) => category.id),
    ["location_history"],
  );
});

test("domain queries expose purposes and product capability dependencies", () => {
  assert.deepEqual(
    getCategoryPurposes("location_history").map((purpose) => purpose.id),
    ["local_discovery", "recommendations", "product_analytics"],
  );
  assert.deepEqual(
    getProductDependencies("location_history").map((dependency) => ({
      capabilityId: dependency.capabilityId,
      purposeId: dependency.purposeId,
      strength: dependency.strength,
      impact: dependency.impact,
    })),
    [
      {
        capabilityId: "nearby_discovery",
        purposeId: "local_discovery",
        strength: "required",
        impact: "unavailable",
      },
      {
        capabilityId: "recommendation_feed",
        purposeId: "recommendations",
        strength: "quality",
        impact: "degraded",
      },
      {
        capabilityId: "product_improvement",
        purposeId: "product_analytics",
        strength: "quality",
        impact: "degraded",
      },
    ],
  );
  assert.deepEqual(getCategoryPurposes("unknown_category"), []);
  assert.equal(getDataCategory("unknown_category"), undefined);
});

test("retention remains structured and formats the seeded highlights", () => {
  assert.deepEqual(getCategoryRetention("location_history"), {
    kind: "fixed_period",
    amount: 12,
    unit: "months",
    summaryPriority: 1,
  });
  assert.deepEqual(getCategoryRetention("activity_history"), {
    kind: "fixed_period",
    amount: 90,
    unit: "days",
    summaryPriority: 2,
  });
  assert.deepEqual(getCategoryRetention("fraud_abuse_signals"), {
    kind: "security_minimum",
  });

  const summary = getPrivacySummary().data;
  assert.deepEqual(summary.retentionHighlights, [
    "Location history is retained for 12 months.",
    "Activity history is retained for 90 days.",
  ]);
});

test("sharing is represented as category-purpose-recipient relationships", () => {
  assert.deepEqual(getCategorySharing("analytics_data"), [
    {
      recipientId: "first_party_service",
      purposeIds: ["product_analytics"],
    },
    {
      recipientId: "analytics_partner",
      purposeIds: ["product_analytics"],
    },
  ]);
  assert.deepEqual(getThirdPartySharing(), ["analytics_partner"]);
  assert.ok(
    getThirdPartySharingRelationships().some(
      (relationship) =>
        relationship.dataCategoryId === "analytics_data" &&
        relationship.purposeId === "product_analytics" &&
        relationship.recipientId === "analytics_partner",
    ),
  );
});

test("consequence queries expose structured privacy trade-offs", () => {
  assert.ok(
    getCategoryConsequences("location_history").some(
      (consequence) =>
        consequence.effect === "feature_unavailable" &&
        consequence.capabilityId === "nearby_discovery",
    ),
  );
  assert.ok(
    getCategoryConsequences("analytics_data").some(
      (consequence) =>
        consequence.effect === "sharing_stops" &&
        consequence.recipientId === "analytics_partner",
    ),
  );
  assert.ok(
    getCategoryConsequences("marketing_profile").some(
      (consequence) => consequence.effect === "core_service_unchanged",
    ),
  );
});

test("score breakdown applies transparent seeded weights", () => {
  const breakdown = getPrivacyScoreBreakdown();

  assert.equal(breakdown.baseScore, 100);
  assert.deepEqual(
    breakdown.optionalCategoryDeductions.map(({ categoryId, points }) => ({
      categoryId,
      points,
    })),
    [
      { categoryId: "activity_history", points: 7 },
      { categoryId: "location_history", points: 12 },
      { categoryId: "recommendation_profile", points: 8 },
      { categoryId: "product_preferences", points: 5 },
      { categoryId: "analytics_data", points: 1 },
      { categoryId: "marketing_profile", points: 10 },
    ],
  );
  assert.deepEqual(
    breakdown.thirdPartySharingDeductions.map(({ recipientId, points }) => ({
      recipientId,
      points,
    })),
    [
      {
        recipientId: "analytics_partner",
        points: 3,
      },
    ],
  );
  assert.equal(breakdown.totalDeduction, 46);
  assert.equal(breakdown.score, 54);

  const withoutMarketing = withConsentState(
    SEEDED_PRIVACY_STATE,
    "marketing_profile",
    "disabled",
  );
  assert.equal(getPrivacyScoreBreakdown(withoutMarketing).score, 64);

  const withoutOptionalProcessing = DATA_CATEGORY_IDS.reduce<PrivacyAccountState>(
    (state, categoryId) =>
      categoryId === "account_profile" || categoryId === "fraud_abuse_signals"
        ? state
        : withConsentState(state, categoryId, "disabled"),
    SEEDED_PRIVACY_STATE,
  );
  assert.equal(getPrivacyScoreBreakdown(withoutOptionalProcessing).score, 100);
});

test("privacy summary derives the Phase 0-compatible result from seeded state", () => {
  const summary = getPrivacySummary();

  assert.equal(summary.ok, true);
  assert.equal(summary.data.stateVersion, 1);
  assert.equal(summary.data.privacyScore, 54);
  assert.equal(
    summary.data.privacyStatus,
    "Moderate privacy: optional personalization, analytics, and marketing processing are enabled.",
  );
  assert.equal(summary.data.dataCategoryCount, 8);
  assert.equal(summary.data.enabledOptionalProcessingCount, 6);
  assert.deepEqual(summary.data.enabledOptionalProcessingCategories, [
    "activity_history",
    "location_history",
    "recommendation_profile",
    "product_preferences",
    "analytics_data",
    "marketing_profile",
  ]);
  assert.equal(summary.data.requiredProcessingCount, 2);
  assert.deepEqual(summary.data.requiredProcessingCategories, [
    "account_profile",
    "fraud_abuse_signals",
  ]);
  assert.deepEqual(summary.data.thirdPartySharing, ["analytics_partner"]);
  assert.deepEqual(
    getHighestImpactPrivacyOpportunities().map((opportunity) => opportunity.label),
    [
      "Disable optional marketing profile.",
      "Disable optional analytics data.",
      "Disable optional location history.",
    ],
  );
  assert.deepEqual(
    getHighestImpactPrivacyOpportunities().map(({ kind, categoryId }) => ({
      kind,
      categoryId,
    })),
    [
      { kind: "disable_processing", categoryId: "marketing_profile" },
      { kind: "disable_processing", categoryId: "analytics_data" },
      { kind: "disable_processing", categoryId: "location_history" },
    ],
  );
  assert.equal(summary.data.noChangesMade, true);
});

test("seed and summary generation are deterministic", () => {
  assert.deepEqual(getSeededPrivacyState(), getSeededPrivacyState());
  assert.deepEqual(getPrivacySummary(), getPrivacySummary());
  assert.deepEqual(getSeededPrivacySummary(), getSeededPrivacySummary());
});

test("the existing WebMCP tool remains a no-argument read-only contract", async () => {
  let invocationCount = 0;
  const tool = createPrivacySummaryTool(() => {
    invocationCount += 1;
  });

  assert.equal(tool.name, PRIVACY_SUMMARY_TOOL_NAME);
  assert.deepEqual(tool.inputSchema, {
    type: "object",
    properties: {},
    additionalProperties: false,
  });
  assert.deepEqual(tool.annotations, { readOnlyHint: true });
  assert.deepEqual(
    await tool.execute({}, { signal: new AbortController().signal }),
    getSeededPrivacySummary(),
  );
  assert.equal(invocationCount, 1);
});

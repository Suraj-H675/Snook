export {
  getAllDataCategories,
  getCapability,
  getCategoryConsequences,
  getCategoryState,
  getCategoryPurposes,
  getCategoryRetention,
  getCategorySharing,
  getDataCategory,
  getCategoryIds,
  getConsentState,
  getDisabledOptionalProcessing,
  getEnabledOptionalProcessing,
  getPurpose,
  getProductDependencies,
  getRequiredProcessing,
  getThirdPartySharing,
  getThirdPartySharingRelationships,
  isProcessingEnabled,
  isUserControllable,
} from "./queries.ts";
export {
  calculatePrivacyScore,
  getPrivacyScoreBreakdown,
  PRIVACY_SCORE_BASE,
  PRIVACY_SCORE_MINIMUM,
} from "./scoring.ts";
export { PRIVACY_CATALOG } from "./catalog.ts";
export { getSeededPrivacyState, SEEDED_PRIVACY_STATE } from "./seed.ts";

import { PRIVACY_CATALOG } from "./catalog.ts";
import { SEEDED_PRIVACY_STATE } from "./seed.ts";
import {
  getAllDataCategories,
  getCategoryIds,
  getDataCategory,
  getEnabledOptionalProcessing,
  getRequiredProcessing,
  getThirdPartySharing,
  getThirdPartySharingRelationships,
  isProcessingEnabled,
} from "./queries.ts";
import {
  calculatePrivacyScore,
  getPrivacyScoreBreakdown,
} from "./scoring.ts";
import type {
  PrivacyAccountState,
  PrivacyCatalog,
  PrivacyOpportunity,
  PrivacySummaryResult,
  PurposeId,
  RetentionPolicy,
  DataCategoryDefinition,
} from "./types.ts";

const SUMMARY_PURPOSE_IDS = [
  "personalization",
  "product_analytics",
  "marketing",
] as const satisfies readonly PurposeId[];

function formatList(items: readonly string[]): string {
  if (items.length === 0) {
    return "";
  }
  if (items.length === 1) {
    return items[0];
  }
  if (items.length === 2) {
    return items.join(" and ");
  }

  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

function privacyPosture(score: number): string {
  if (score >= 70) {
    return "Strong privacy";
  }
  if (score >= 40) {
    return "Moderate privacy";
  }
  return "Low privacy";
}

function privacyStatusForScore(
  score: number,
  state: PrivacyAccountState,
  catalog: PrivacyCatalog,
): string {
  const enabledPurposeIds = new Set(
    getEnabledOptionalProcessing(state, catalog).flatMap(
      (category) => category.purposeIds,
    ),
  );
  const enabledSummaryPurposes = SUMMARY_PURPOSE_IDS.flatMap((purposeId) => {
    const purpose = catalog.purposes[purposeId];
    return purpose && enabledPurposeIds.has(purposeId)
      ? [purpose.shortName]
      : [];
  });

  if (enabledSummaryPurposes.length === 0) {
    return `${privacyPosture(score)}: no optional processing is enabled.`;
  }

  return `${privacyPosture(score)}: optional ${formatList(enabledSummaryPurposes)} processing are enabled.`;
}

export function getPrivacyStatus(
  state: PrivacyAccountState = SEEDED_PRIVACY_STATE,
  catalog: PrivacyCatalog = PRIVACY_CATALOG,
): string {
  return privacyStatusForScore(
    calculatePrivacyScore(state, catalog),
    state,
    catalog,
  );
}

export function formatRetention(retention: RetentionPolicy): string {
  switch (retention.kind) {
    case "fixed_period":
      return `${retention.amount} ${retention.unit}`;
    case "account_lifetime":
      return "Account lifetime";
    case "security_minimum":
      return "Security/legal minimums";
  }
}

export function getRetentionHighlights(
  state: PrivacyAccountState = SEEDED_PRIVACY_STATE,
  catalog: PrivacyCatalog = PRIVACY_CATALOG,
): readonly string[] {
  return getAllDataCategories(catalog)
    .filter(
      (category) =>
        category.retention.summaryPriority !== undefined &&
        isProcessingEnabled(state, category.id, catalog),
    )
    .sort(
      (left, right) =>
        (left.retention.summaryPriority ?? Number.MAX_SAFE_INTEGER) -
        (right.retention.summaryPriority ?? Number.MAX_SAFE_INTEGER),
    )
    .map(
      (category) =>
        `${category.name} is retained for ${formatRetention(category.retention)}.`,
    );
}

function createDisableOpportunity(
  category: DataCategoryDefinition,
  rationale: string,
): PrivacyOpportunity {
  return {
    id: `disable_${category.id}`,
    kind: "disable_processing",
    categoryId: category.id,
    impactWeight: category.privacyImpact.scoreWeight,
    label: `Disable optional ${category.name.toLowerCase()}.`,
    rationale,
  };
}

export function getHighestImpactPrivacyOpportunities(
  state: PrivacyAccountState = SEEDED_PRIVACY_STATE,
  catalog: PrivacyCatalog = PRIVACY_CATALOG,
): readonly PrivacyOpportunity[] {
  const opportunities: PrivacyOpportunity[] = [];
  const marketingProfile = getDataCategory("marketing_profile", catalog);

  if (
    marketingProfile &&
    isProcessingEnabled(state, marketingProfile.id, catalog)
  ) {
    opportunities.push(
      createDisableOpportunity(
        marketingProfile,
        "Marketing profiling is optional and has no effect on core account operation.",
      ),
    );
  }

  const analyticsData = getDataCategory("analytics_data", catalog);
  const analyticsSharing = getThirdPartySharingRelationships(state, catalog).some(
    (relationship) =>
      relationship.dataCategoryId === analyticsData?.id &&
      relationship.purposeId === "product_analytics",
  );
  if (analyticsData && analyticsSharing) {
    opportunities.push(
      createDisableOpportunity(
        analyticsData,
        "Disabling optional analytics data also stops this category's third-party analytics sharing.",
      ),
    );
  }

  const locationHistory = getDataCategory("location_history", catalog);
  if (
    locationHistory &&
    isProcessingEnabled(state, locationHistory.id, catalog)
  ) {
    opportunities.push(
      createDisableOpportunity(
        locationHistory,
        "Disabling optional location history stops new location-history retention and may reduce nearby recommendations.",
      ),
    );
  }

  return opportunities;
}

export function getPrivacySummary(
  state: PrivacyAccountState = SEEDED_PRIVACY_STATE,
  catalog: PrivacyCatalog = PRIVACY_CATALOG,
): PrivacySummaryResult {
  const enabledOptionalProcessing = getEnabledOptionalProcessing(state, catalog);
  const requiredProcessing = getRequiredProcessing(catalog);
  const privacyScore = getPrivacyScoreBreakdown(state, catalog).score;

  return {
    ok: true,
    data: {
      stateVersion: state.stateVersion,
      privacyScore,
      privacyStatus: privacyStatusForScore(privacyScore, state, catalog),
      dataCategoryCount: getAllDataCategories(catalog).length,
      enabledOptionalProcessingCount: enabledOptionalProcessing.length,
      enabledOptionalProcessingCategories: getCategoryIds(
        enabledOptionalProcessing,
      ),
      requiredProcessingCount: requiredProcessing.length,
      requiredProcessingCategories: getCategoryIds(requiredProcessing),
      thirdPartySharing: getThirdPartySharing(state, catalog),
      retentionHighlights: getRetentionHighlights(state, catalog),
      highestImpactPrivacyOpportunities: getHighestImpactPrivacyOpportunities(
        state,
        catalog,
      ).map((opportunity) => opportunity.label),
      noChangesMade: true,
    },
  };
}

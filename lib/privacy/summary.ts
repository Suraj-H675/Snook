export const PRIVACY_SUMMARY_TOOL_NAME = "get_privacy_summary" as const;

export interface PrivacySummaryData {
  readonly stateVersion: 1;
  readonly privacyScore: 54;
  readonly privacyStatus: string;
  readonly dataCategoryCount: 8;
  readonly enabledOptionalProcessingCount: 6;
  readonly enabledOptionalProcessingCategories: readonly string[];
  readonly requiredProcessingCount: 2;
  readonly requiredProcessingCategories: readonly string[];
  readonly thirdPartySharing: readonly string[];
  readonly retentionHighlights: readonly string[];
  readonly highestImpactPrivacyOpportunities: readonly string[];
  readonly noChangesMade: true;
}

export interface PrivacySummaryResult {
  readonly ok: true;
  readonly data: PrivacySummaryData;
}

const SEEDED_PRIVACY_SUMMARY: PrivacySummaryData = {
  stateVersion: 1,
  privacyScore: 54,
  privacyStatus:
    "Moderate privacy: optional personalization, analytics, and marketing processing are enabled.",
  dataCategoryCount: 8,
  enabledOptionalProcessingCount: 6,
  enabledOptionalProcessingCategories: [
    "activity_history",
    "location_history",
    "recommendation_profile",
    "product_preferences",
    "analytics_data",
    "marketing_profile",
  ],
  requiredProcessingCount: 2,
  requiredProcessingCategories: ["account_profile", "fraud_abuse_signals"],
  thirdPartySharing: ["analytics_partner"],
  retentionHighlights: [
    "Location history is retained for 12 months.",
    "Activity history is retained for 90 days.",
  ],
  highestImpactPrivacyOpportunities: [
    "Disable marketing profiling.",
    "Disable third-party analytics sharing.",
    "Reduce location-history retention.",
  ],
  noChangesMade: true,
};

export function getSeededPrivacySummary(): PrivacySummaryResult {
  return {
    ok: true,
    data: {
      ...SEEDED_PRIVACY_SUMMARY,
      enabledOptionalProcessingCategories: [
        ...SEEDED_PRIVACY_SUMMARY.enabledOptionalProcessingCategories,
      ],
      requiredProcessingCategories: [
        ...SEEDED_PRIVACY_SUMMARY.requiredProcessingCategories,
      ],
      thirdPartySharing: [...SEEDED_PRIVACY_SUMMARY.thirdPartySharing],
      retentionHighlights: [...SEEDED_PRIVACY_SUMMARY.retentionHighlights],
      highestImpactPrivacyOpportunities: [
        ...SEEDED_PRIVACY_SUMMARY.highestImpactPrivacyOpportunities,
      ],
    },
  };
}

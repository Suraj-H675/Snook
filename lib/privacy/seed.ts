import type { PrivacyAccountState } from "./types.ts";

/**
 * The single fictional account state used by the Phase 0/1 demonstration.
 * Catalog metadata lives in catalog.ts; this source owns only current state.
 */
export const SEEDED_PRIVACY_STATE: PrivacyAccountState = {
  stateVersion: 1,
  categories: {
    account_profile: { consentState: "required" },
    activity_history: { consentState: "enabled" },
    location_history: { consentState: "enabled" },
    recommendation_profile: { consentState: "enabled" },
    product_preferences: { consentState: "enabled" },
    analytics_data: { consentState: "enabled" },
    marketing_profile: { consentState: "enabled" },
    fraud_abuse_signals: { consentState: "required" },
  },
};

export function getSeededPrivacyState(): PrivacyAccountState {
  return {
    stateVersion: SEEDED_PRIVACY_STATE.stateVersion,
    categories: { ...SEEDED_PRIVACY_STATE.categories },
  };
}

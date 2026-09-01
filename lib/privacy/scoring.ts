import { PRIVACY_CATALOG } from "./catalog.ts";
import { SEEDED_PRIVACY_STATE } from "./seed.ts";
import {
  getEnabledOptionalProcessing,
  getThirdPartySharing,
} from "./queries.ts";
import type {
  PrivacyAccountState,
  PrivacyCatalog,
  PrivacyScoreBreakdown,
  PrivacyScoreCategoryDeduction,
  PrivacyScoreSharingDeduction,
} from "./types.ts";

export const PRIVACY_SCORE_BASE = 100;
export const PRIVACY_SCORE_MINIMUM = 0;

/**
 * Score formula:
 *
 *   score = clamp(100 - enabled optional category weights
 *                    - unique third-party recipient weights, 0, 100)
 *
 * Required processing is deliberately excluded because this score measures
 * the user's controllable optional exposure, not whether the service has any
 * privacy obligations at all. The returned breakdown keeps every deduction
 * inspectable for later explanations and plan comparisons.
 */
export function getPrivacyScoreBreakdown(
  state: PrivacyAccountState = SEEDED_PRIVACY_STATE,
  catalog: PrivacyCatalog = PRIVACY_CATALOG,
): PrivacyScoreBreakdown {
  const optionalCategoryDeductions: readonly PrivacyScoreCategoryDeduction[] =
    getEnabledOptionalProcessing(state, catalog).map((category) => ({
      categoryId: category.id,
      points: category.privacyImpact.scoreWeight,
      rationale: category.privacyImpact.rationale,
    }));

  const thirdPartySharingDeductions: readonly PrivacyScoreSharingDeduction[] =
    getThirdPartySharing(state, catalog).flatMap((recipientId) => {
      const recipient = catalog.recipients[recipientId];
      return recipient
        ? [
            {
              recipientId,
              points: recipient.privacyImpactWeight,
              rationale: `Sharing with ${recipient.name} adds optional third-party exposure.`,
            },
          ]
        : [];
    });

  const totalDeduction = [
    ...optionalCategoryDeductions,
    ...thirdPartySharingDeductions,
  ].reduce((total, deduction) => total + deduction.points, 0);
  const score = Math.max(
    PRIVACY_SCORE_MINIMUM,
    Math.min(PRIVACY_SCORE_BASE, PRIVACY_SCORE_BASE - totalDeduction),
  );

  return {
    baseScore: PRIVACY_SCORE_BASE,
    optionalCategoryDeductions,
    thirdPartySharingDeductions,
    totalDeduction,
    score,
  };
}

export function calculatePrivacyScore(
  state: PrivacyAccountState = SEEDED_PRIVACY_STATE,
  catalog: PrivacyCatalog = PRIVACY_CATALOG,
): number {
  return getPrivacyScoreBreakdown(state, catalog).score;
}

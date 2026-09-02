import { PRIVACY_CATALOG } from "../privacy/catalog.ts";
import type {
  PrivacyAccountState,
  PrivacyCatalog,
} from "../privacy/types.ts";
import { evaluateNormalizedConsentPlan } from "./impact.ts";
import type { ConsentPlanEvaluationResult } from "./types.ts";
import { normalizePlanChanges } from "./validate-plan.ts";

/**
 * Validate, normalize, and evaluate a proposed plan against one immutable
 * account-state snapshot. The returned hypothetical state is never committed
 * by this function.
 */
export function evaluateConsentPlan(
  input: unknown,
  state: PrivacyAccountState,
  catalog: PrivacyCatalog = PRIVACY_CATALOG,
): ConsentPlanEvaluationResult {
  const normalized = normalizePlanChanges(input, state, catalog);
  if (!normalized.ok) {
    return normalized;
  }

  const evaluated = evaluateNormalizedConsentPlan(
    state,
    normalized.changes,
    catalog,
  );
  if ("ok" in evaluated) {
    return evaluated;
  }

  return { ok: true, data: evaluated };
}

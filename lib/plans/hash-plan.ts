import type { PlanHashInput } from "./types.ts";

/**
 * Serialize only exact plan identity and consequential content. Changes are
 * already normalized into canonical category order before this function is
 * called, but the explicit mapping keeps the hash contract stable and
 * independent of object-property insertion elsewhere in the app.
 */
export function serializePlanHashInput(input: PlanHashInput): string {
  return JSON.stringify({
    planId: input.planId,
    revision: input.revision,
    baseStateVersion: input.baseStateVersion,
    changes: input.changes.map((change) => ({
      categoryId: change.categoryId,
      targetConsentState: change.targetConsentState,
    })),
  });
}

export async function hashConsentPlan(input: PlanHashInput): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("Web Crypto is required to fingerprint a staged plan.");
  }

  const encoded = new TextEncoder().encode(serializePlanHashInput(input));
  const digest = await subtle.digest("SHA-256", encoded);

  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

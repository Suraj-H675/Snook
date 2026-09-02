import { applyConsentChanges } from "../state/transitions.ts";
import {
  getAllDataCategories,
  getEnabledOptionalProcessing,
  getThirdPartySharing,
  isProcessingEnabled,
} from "../privacy/queries.ts";
import { calculatePrivacyScore } from "../privacy/scoring.ts";
import { PRIVACY_CATALOG } from "../privacy/catalog.ts";
import type {
  CapabilityId,
  ConsentChange,
  ConsequenceEffect,
  DataCategoryDefinition,
  FeatureDependency,
  PrivacyAccountState,
  PrivacyCatalog,
  ProcessingConsequence,
} from "../privacy/types.ts";
import type {
  CapabilityAvailability,
  CapabilityImpactChange,
  ConsentPlanEvaluation,
  PlanCapabilityImpact,
  PlanFailureResult,
  PlanImpact,
  PlanImpactEffect,
  PlanSharingChange,
  PlanStateSnapshot,
  PlanWarning,
} from "./types.ts";

function getName(
  collection: Readonly<Record<string, { readonly name: string }>>,
  id: string | null | undefined,
): string | null {
  return id === null || id === undefined ? null : collection[id]?.name ?? null;
}

function createSnapshot(
  state: PrivacyAccountState,
  catalog: PrivacyCatalog,
): PlanStateSnapshot {
  return {
    privacyScore: calculatePrivacyScore(state, catalog),
    enabledOptionalCount: getEnabledOptionalProcessing(state, catalog).length,
    thirdPartySharing: [...getThirdPartySharing(state, catalog)],
  };
}

function getCapabilityAvailabilitySafe(
  state: PrivacyAccountState,
  capabilityId: CapabilityId,
  catalog: PrivacyCatalog,
): CapabilityAvailability {
  const dependencies = getAllDataCategories(catalog).flatMap((category) =>
    category.featureDependencies
      .filter((dependency) => dependency.capabilityId === capabilityId)
      .map((dependency) => ({ category, dependency })),
  );

  if (
    dependencies.some(
      ({ category, dependency }) =>
        dependency.strength === "required" &&
        !isProcessingEnabled(state, category.id, catalog),
    )
  ) {
    return "unavailable";
  }

  if (
    dependencies.some(
      ({ category, dependency }) =>
        dependency.strength === "quality" &&
        !isProcessingEnabled(state, category.id, catalog),
    )
  ) {
    return "degraded";
  }

  return "available";
}

function getCapabilityChange(
  before: CapabilityAvailability,
  after: CapabilityAvailability,
): CapabilityImpactChange {
  if (before === after) {
    return "unaffected";
  }
  if (after === "unavailable") {
    return "unavailable";
  }
  if (after === "degraded") {
    return "degraded";
  }
  return "improved";
}

function createCapabilityImpacts(
  beforeState: PrivacyAccountState,
  afterState: PrivacyAccountState,
  changes: readonly ConsentChange[],
  catalog: PrivacyCatalog,
): readonly PlanCapabilityImpact[] {
  return Object.values(catalog.capabilities).map((capability) => {
    const before = getCapabilityAvailabilitySafe(
      beforeState,
      capability.id,
      catalog,
    );
    const after = getCapabilityAvailabilitySafe(
      afterState,
      capability.id,
      catalog,
    );
    const affectedDependencies = changes.flatMap((change) => {
      const category = catalog.categories[change.categoryId];
      if (!category) {
        return [];
      }

      return category.featureDependencies
        .filter((dependency) => dependency.capabilityId === capability.id)
        .map((dependency) => ({ category, dependency }));
    });

    return {
      capabilityId: capability.id,
      capabilityName: capability.name,
      before,
      after,
      change: getCapabilityChange(before, after),
      affectedByCategoryIds: affectedDependencies.map(
        ({ category }) => category.id,
      ),
      dependencyDescriptions: affectedDependencies.map(
        ({ dependency }) => dependency.description,
      ),
    };
  });
}

function inverseImpactEffect(effect: ConsequenceEffect): PlanImpactEffect {
  switch (effect) {
    case "stops_collection":
      return "collection_resumes";
    case "feature_unavailable":
      return "feature_restored";
    case "quality_reduced":
      return "quality_restored";
    case "sharing_stops":
      return "sharing_resumes";
    case "core_service_unchanged":
      return "core_service_unchanged";
  }
}

function impactDescription(
  targetConsentState: ConsentChange["targetConsentState"],
  category: DataCategoryDefinition,
  consequence: ProcessingConsequence,
  catalog: PrivacyCatalog,
): string {
  if (targetConsentState === "disabled") {
    return consequence.description;
  }

  const capabilityName = getName(
    catalog.capabilities,
    consequence.capabilityId,
  );
  const recipientName = getName(catalog.recipients, consequence.recipientId);

  switch (consequence.effect) {
    case "stops_collection":
      return `Optional ${category.name.toLowerCase()} collection resumes for this use.`;
    case "feature_unavailable":
      return `${capabilityName ?? "This capability"} becomes available again.`;
    case "quality_reduced":
      return `${capabilityName ?? "This capability"} can use this signal again and may improve.`;
    case "sharing_stops":
      return `Sharing with ${recipientName ?? "this recipient"} resumes for ${category.name.toLowerCase()}.`;
    case "core_service_unchanged":
      return consequence.description;
  }
}

function featureImpactDescription(
  targetConsentState: ConsentChange["targetConsentState"],
  category: DataCategoryDefinition,
  dependency: FeatureDependency,
  catalog: PrivacyCatalog,
): string {
  if (targetConsentState === "disabled") {
    return dependency.description;
  }

  const capabilityName = getName(catalog.capabilities, dependency.capabilityId);
  return dependency.strength === "required"
    ? `${capabilityName ?? "This capability"} becomes available again because ${category.name.toLowerCase()} is enabled.`
    : `${capabilityName ?? "This capability"} can use ${category.name.toLowerCase()} again, so the quality limitation is removed.`;
}

function createImpact(
  id: string,
  category: DataCategoryDefinition,
  targetConsentState: ConsentChange["targetConsentState"],
  sourceEffect: ConsequenceEffect,
  purposeId: ProcessingConsequence["purposeId"] | null,
  capabilityId: ProcessingConsequence["capabilityId"] | null,
  recipientId: ProcessingConsequence["recipientId"] | null,
  description: string,
  catalog: PrivacyCatalog,
): PlanImpact {
  return {
    id,
    categoryId: category.id,
    categoryName: category.name,
    targetConsentState,
    effect:
      targetConsentState === "disabled"
        ? sourceEffect
        : inverseImpactEffect(sourceEffect),
    sourceEffect,
    purposeId: purposeId ?? null,
    purposeName: getName(catalog.purposes, purposeId),
    capabilityId: capabilityId ?? null,
    capabilityName: getName(catalog.capabilities, capabilityId),
    recipientId: recipientId ?? null,
    recipientName: getName(catalog.recipients, recipientId),
    description,
  };
}

function createImpacts(
  changes: readonly ConsentChange[],
  catalog: PrivacyCatalog,
): readonly PlanImpact[] {
  const impacts: PlanImpact[] = [];

  for (const change of changes) {
    const category = catalog.categories[change.categoryId];
    if (!category) {
      continue;
    }

    const dependencyImpactKeys = new Set<string>();
    for (const dependency of category.featureDependencies) {
      const key = `${dependency.purposeId}:${dependency.capabilityId}`;
      dependencyImpactKeys.add(key);
      impacts.push(
        createImpact(
          `${category.id}:capability:${dependency.capabilityId}:${dependency.purposeId}`,
          category,
          change.targetConsentState,
          dependency.impact === "unavailable"
            ? "feature_unavailable"
            : "quality_reduced",
          dependency.purposeId,
          dependency.capabilityId,
          null,
          featureImpactDescription(
            change.targetConsentState,
            category,
            dependency,
            catalog,
          ),
          catalog,
        ),
      );
    }

    category.consequencesIfDisabled.forEach((consequence, index) => {
      const featureKey = consequence.capabilityId
        ? `${consequence.purposeId ?? ""}:${consequence.capabilityId}`
        : null;
      if (
        (consequence.effect === "feature_unavailable" ||
          consequence.effect === "quality_reduced") &&
        featureKey !== null &&
        dependencyImpactKeys.has(featureKey)
      ) {
        return;
      }

      impacts.push(
        createImpact(
          `${category.id}:consequence:${index}`,
          category,
          change.targetConsentState,
          consequence.effect,
          consequence.purposeId,
          consequence.capabilityId,
          consequence.recipientId,
          impactDescription(
            change.targetConsentState,
            category,
            consequence,
            catalog,
          ),
          catalog,
        ),
      );
    });
  }

  return impacts;
}

function createSharingChanges(
  beforeState: PrivacyAccountState,
  afterState: PrivacyAccountState,
  changes: readonly ConsentChange[],
  catalog: PrivacyCatalog,
): readonly PlanSharingChange[] {
  const sharingChanges: PlanSharingChange[] = [];

  for (const change of changes) {
    const category = catalog.categories[change.categoryId];
    if (!category) {
      continue;
    }

    for (const destination of category.sharedWith) {
      const recipient = catalog.recipients[destination.recipientId];
      if (!recipient || recipient.kind !== "third_party") {
        continue;
      }

      const beforeActive = isProcessingEnabled(
        beforeState,
        category.id,
        catalog,
      );
      const afterActive = isProcessingEnabled(afterState, category.id, catalog);
      if (beforeActive === afterActive) {
        continue;
      }

      sharingChanges.push({
        id: `${category.id}:recipient:${recipient.id}`,
        categoryId: category.id,
        categoryName: category.name,
        recipientId: recipient.id,
        recipientName: recipient.name,
        purposeIds: [...destination.purposeIds],
        beforeActive,
        afterActive,
        change: afterActive ? "starts" : "stops",
      });
    }
  }

  return sharingChanges;
}

function createWarnings(
  impacts: readonly PlanImpact[],
): readonly PlanWarning[] {
  return impacts.flatMap((impact) => {
    if (
      (impact.effect !== "feature_unavailable" &&
        impact.effect !== "quality_reduced") ||
      impact.capabilityId === null ||
      impact.capabilityName === null
    ) {
      return [];
    }

    return [
      {
        id: `warning:${impact.id}`,
        severity:
          impact.effect === "feature_unavailable" ? "warning" : "notice",
        categoryId: impact.categoryId,
        categoryName: impact.categoryName,
        effect: impact.effect,
        purposeId: impact.purposeId,
        purposeName: impact.purposeName,
        capabilityId: impact.capabilityId,
        capabilityName: impact.capabilityName,
        message: impact.description,
      },
    ];
  });
}

function mapTransitionFailure(
  failureResult: Extract<ReturnType<typeof applyConsentChanges>, { ok: false }>,
): PlanFailureResult {
  if (failureResult.error.code === "REQUIRED_PROCESSING_CANNOT_BE_DISABLED") {
    return {
      ok: false,
      error: {
        code: failureResult.error.code,
        message: failureResult.error.message,
      },
    };
  }

  return {
    ok: false,
    error: {
      code: "INVALID_PLAN_INPUT",
      message: failureResult.error.message,
    },
  };
}

export function evaluateNormalizedConsentPlan(
  state: PrivacyAccountState,
  changes: readonly ConsentChange[],
  catalog: PrivacyCatalog = PRIVACY_CATALOG,
): ConsentPlanEvaluation | PlanFailureResult {
  const transition = applyConsentChanges(state, changes, catalog);
  if (!transition.ok) {
    return mapTransitionFailure(transition);
  }

  const before = createSnapshot(state, catalog);
  const after = createSnapshot(transition.state, catalog);
  const impacts = createImpacts(changes, catalog);

  return {
    baseStateVersion: state.stateVersion,
    changes: changes.map((change) => ({ ...change })),
    before,
    after,
    privacyScoreDelta: after.privacyScore - before.privacyScore,
    impacts,
    capabilityImpacts: createCapabilityImpacts(
      state,
      transition.state,
      changes,
      catalog,
    ),
    sharingChanges: createSharingChanges(
      state,
      transition.state,
      changes,
      catalog,
    ),
    warnings: createWarnings(impacts),
  };
}

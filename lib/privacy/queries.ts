import { PRIVACY_CATALOG } from "./catalog.ts";
import { SEEDED_PRIVACY_STATE } from "./seed.ts";
import type {
  CapabilityDefinition,
  DataCategoryDefinition,
  DataCategoryId,
  DataSharingRelationship,
  FeatureDependency,
  PrivacyAccountState,
  PrivacyCatalog,
  PrivacyCategoryStateView,
  ProcessingConsequence,
  PurposeDefinition,
  RecipientId,
  RetentionPolicy,
  SharingDestination,
} from "./types.ts";

export function getAllDataCategories(
  catalog: PrivacyCatalog = PRIVACY_CATALOG,
): readonly DataCategoryDefinition[] {
  return Object.values(catalog.categories);
}

export function getDataCategory(
  categoryId: string,
  catalog: PrivacyCatalog = PRIVACY_CATALOG,
): DataCategoryDefinition | undefined {
  return getAllDataCategories(catalog).find(
    (category) => category.id === categoryId,
  );
}

export function getPurpose(
  purposeId: string,
  catalog: PrivacyCatalog = PRIVACY_CATALOG,
): PurposeDefinition | undefined {
  return Object.values(catalog.purposes).find(
    (purpose) => purpose.id === purposeId,
  );
}

export function getCapability(
  capabilityId: string,
  catalog: PrivacyCatalog = PRIVACY_CATALOG,
): CapabilityDefinition | undefined {
  return Object.values(catalog.capabilities).find(
    (capability) => capability.id === capabilityId,
  );
}

export function getCategoryPurposes(
  categoryId: string,
  catalog: PrivacyCatalog = PRIVACY_CATALOG,
): readonly PurposeDefinition[] {
  const category = getDataCategory(categoryId, catalog);
  if (!category) {
    return [];
  }

  return category.purposeIds.flatMap((purposeId) => {
    const purpose = catalog.purposes[purposeId];
    return purpose ? [purpose] : [];
  });
}

export function getProductDependencies(
  categoryId: string,
  catalog: PrivacyCatalog = PRIVACY_CATALOG,
): readonly FeatureDependency[] {
  return getDataCategory(categoryId, catalog)?.featureDependencies ?? [];
}

export function getCategoryRetention(
  categoryId: string,
  catalog: PrivacyCatalog = PRIVACY_CATALOG,
): RetentionPolicy | undefined {
  return getDataCategory(categoryId, catalog)?.retention;
}

export function getCategorySharing(
  categoryId: string,
  catalog: PrivacyCatalog = PRIVACY_CATALOG,
): readonly SharingDestination[] {
  return getDataCategory(categoryId, catalog)?.sharedWith ?? [];
}

export function getCategoryConsequences(
  categoryId: string,
  catalog: PrivacyCatalog = PRIVACY_CATALOG,
): readonly ProcessingConsequence[] {
  return getDataCategory(categoryId, catalog)?.consequencesIfDisabled ?? [];
}

export function isProcessingEnabled(
  state: PrivacyAccountState,
  categoryId: string,
  catalog: PrivacyCatalog = PRIVACY_CATALOG,
): boolean {
  const category = getDataCategory(categoryId, catalog);
  if (!category) {
    return false;
  }

  if (category.processingRequirement === "required") {
    return true;
  }

  return state.categories[category.id]?.consentState === "enabled";
}

export function isUserControllable(
  categoryId: string,
  catalog: PrivacyCatalog = PRIVACY_CATALOG,
): boolean {
  return getDataCategory(categoryId, catalog)?.controllable ?? false;
}

export function getCategoryState(
  categoryId: string,
  state: PrivacyAccountState = SEEDED_PRIVACY_STATE,
  catalog: PrivacyCatalog = PRIVACY_CATALOG,
): PrivacyCategoryStateView | undefined {
  const category = getDataCategory(categoryId, catalog);
  if (!category) {
    return undefined;
  }

  const categoryState = state.categories[category.id];
  if (!categoryState) {
    return undefined;
  }

  return {
    categoryId: category.id,
    consentState: categoryState.consentState,
    enabled: isProcessingEnabled(state, category.id, catalog),
    required: category.processingRequirement === "required",
    controllable: category.controllable,
  };
}

export function getConsentState(
  state: PrivacyAccountState = SEEDED_PRIVACY_STATE,
  catalog: PrivacyCatalog = PRIVACY_CATALOG,
): readonly PrivacyCategoryStateView[] {
  return getAllDataCategories(catalog).map((category) => ({
    categoryId: category.id,
    consentState: state.categories[category.id].consentState,
    enabled: isProcessingEnabled(state, category.id, catalog),
    required: category.processingRequirement === "required",
    controllable: category.controllable,
  }));
}

export function getEnabledOptionalProcessing(
  state: PrivacyAccountState = SEEDED_PRIVACY_STATE,
  catalog: PrivacyCatalog = PRIVACY_CATALOG,
): readonly DataCategoryDefinition[] {
  return getAllDataCategories(catalog).filter(
    (category) =>
      category.processingRequirement === "optional" &&
      isProcessingEnabled(state, category.id, catalog),
  );
}

export function getDisabledOptionalProcessing(
  state: PrivacyAccountState = SEEDED_PRIVACY_STATE,
  catalog: PrivacyCatalog = PRIVACY_CATALOG,
): readonly DataCategoryDefinition[] {
  return getAllDataCategories(catalog).filter(
    (category) =>
      category.processingRequirement === "optional" &&
      !isProcessingEnabled(state, category.id, catalog),
  );
}

export function getRequiredProcessing(
  catalog: PrivacyCatalog = PRIVACY_CATALOG,
): readonly DataCategoryDefinition[] {
  return getAllDataCategories(catalog).filter(
    (category) => category.processingRequirement === "required",
  );
}

export function getThirdPartySharingRelationships(
  state: PrivacyAccountState = SEEDED_PRIVACY_STATE,
  catalog: PrivacyCatalog = PRIVACY_CATALOG,
): readonly DataSharingRelationship[] {
  return getAllDataCategories(catalog).flatMap((category) => {
    if (!isProcessingEnabled(state, category.id, catalog)) {
      return [];
    }

    return category.sharedWith.flatMap((destination) => {
      const recipient = catalog.recipients[destination.recipientId];
      if (!recipient || recipient.kind !== "third_party") {
        return [];
      }

      return destination.purposeIds.map((purposeId) => ({
        dataCategoryId: category.id,
        purposeId,
        recipientId: destination.recipientId,
        recipientKind: recipient.kind,
      }));
    });
  });
}

export function getThirdPartySharing(
  state: PrivacyAccountState = SEEDED_PRIVACY_STATE,
  catalog: PrivacyCatalog = PRIVACY_CATALOG,
): readonly RecipientId[] {
  const recipientIds: RecipientId[] = [];

  for (const relationship of getThirdPartySharingRelationships(state, catalog)) {
    if (!recipientIds.includes(relationship.recipientId)) {
      recipientIds.push(relationship.recipientId);
    }
  }

  return recipientIds;
}

export function getCategoryIds(
  categories: readonly DataCategoryDefinition[],
): readonly DataCategoryId[] {
  return categories.map((category) => category.id);
}

export const DATA_CATEGORY_IDS = [
  "account_profile",
  "activity_history",
  "location_history",
  "recommendation_profile",
  "product_preferences",
  "analytics_data",
  "marketing_profile",
  "fraud_abuse_signals",
] as const;

export type DataCategoryId = (typeof DATA_CATEGORY_IDS)[number];

export const PURPOSE_IDS = [
  "account_operation",
  "fraud_security",
  "recommendations",
  "local_discovery",
  "personalization",
  "product_analytics",
  "marketing",
  "advertising_profile_enrichment",
] as const;

export type PurposeId = (typeof PURPOSE_IDS)[number];

export const CAPABILITY_IDS = [
  "account_access",
  "recommendation_feed",
  "nearby_discovery",
  "personalized_ranking",
  "product_improvement",
  "marketing_messages",
  "fraud_protection",
] as const;

export type CapabilityId = (typeof CAPABILITY_IDS)[number];

export const RECIPIENT_IDS = [
  "first_party_service",
  "analytics_partner",
] as const;

export type RecipientId = (typeof RECIPIENT_IDS)[number];

export type ProcessingRequirement = "required" | "optional";

export type ConsentState = "required" | "enabled" | "disabled";

export const CONSENT_TARGET_STATES = ["enabled", "disabled"] as const;

export type ConsentTargetState = (typeof CONSENT_TARGET_STATES)[number];

/**
 * The only category-level change shape accepted by Phase 4 planning tools.
 * Required processing remains represented as `ConsentState` on account state;
 * plans can only request the two controllable target states.
 */
export interface ConsentChange {
  readonly categoryId: DataCategoryId;
  readonly targetConsentState: ConsentTargetState;
}

export type DataSource =
  | "user_provided"
  | "service_observed"
  | "service_derived"
  | "security_telemetry";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export type RetentionPolicy =
  | {
      readonly kind: "fixed_period";
      readonly amount: number;
      readonly unit: "days" | "months";
      readonly summaryPriority?: number;
    }
  | {
      readonly kind: "account_lifetime";
      readonly summaryPriority?: number;
    }
  | {
      readonly kind: "security_minimum";
      readonly summaryPriority?: number;
    };

export interface PurposeDefinition {
  readonly id: PurposeId;
  readonly name: string;
  readonly shortName: string;
  readonly description: string;
}

export interface CapabilityDefinition {
  readonly id: CapabilityId;
  readonly name: string;
  readonly description: string;
}

export type RecipientKind = "first_party" | "third_party";

export interface RecipientDefinition {
  readonly id: RecipientId;
  readonly name: string;
  readonly kind: RecipientKind;
  readonly description: string;
  readonly privacyImpactWeight: number;
}

export interface SharingDestination {
  readonly recipientId: RecipientId;
  readonly purposeIds: readonly PurposeId[];
}

export type DependencyStrength = "required" | "quality";

export type DependencyImpact = "unavailable" | "degraded";

export interface FeatureDependency {
  readonly capabilityId: CapabilityId;
  readonly purposeId: PurposeId;
  readonly strength: DependencyStrength;
  readonly impact: DependencyImpact;
  readonly description: string;
}

export type ConsequenceEffect =
  | "stops_collection"
  | "feature_unavailable"
  | "quality_reduced"
  | "sharing_stops"
  | "core_service_unchanged";

export interface ProcessingConsequence {
  readonly effect: ConsequenceEffect;
  readonly purposeId?: PurposeId;
  readonly capabilityId?: CapabilityId;
  readonly recipientId?: RecipientId;
  readonly description: string;
}

export interface PrivacyImpact {
  readonly scoreWeight: number;
  readonly rationale: string;
}

export interface DataCategoryDefinition {
  readonly id: DataCategoryId;
  readonly name: string;
  readonly description: string;
  readonly collected: boolean;
  readonly processingRequirement: ProcessingRequirement;
  readonly controllable: boolean;
  readonly purposeIds: readonly PurposeId[];
  readonly retention: RetentionPolicy;
  readonly sharedWith: readonly SharingDestination[];
  readonly featureDependencies: readonly FeatureDependency[];
  readonly consequencesIfDisabled: readonly ProcessingConsequence[];
  readonly riskOrSensitivity: RiskLevel;
  readonly privacyImpact: PrivacyImpact;
  readonly source: DataSource;
}

export interface PrivacyCategoryState {
  readonly consentState: ConsentState;
}

/**
 * State versions are nonnegative integers by domain invariant. A plain number
 * keeps Phase 1 simple while allowing later mutation code to increment 1 to 2.
 */
export type StateVersion = number;

export interface PrivacyAccountState {
  readonly stateVersion: StateVersion;
  readonly categories: Readonly<
    Record<DataCategoryId, PrivacyCategoryState>
  >;
}

export interface PrivacyCatalog {
  readonly categories: Readonly<
    Record<DataCategoryId, DataCategoryDefinition>
  >;
  readonly purposes: Readonly<Record<PurposeId, PurposeDefinition>>;
  readonly capabilities: Readonly<
    Record<CapabilityId, CapabilityDefinition>
  >;
  readonly recipients: Readonly<Record<RecipientId, RecipientDefinition>>;
}

export interface PrivacyCategoryStateView {
  readonly categoryId: DataCategoryId;
  readonly consentState: ConsentState;
  readonly enabled: boolean;
  readonly required: boolean;
  readonly controllable: boolean;
}

export interface DataSharingRelationship {
  readonly dataCategoryId: DataCategoryId;
  readonly purposeId: PurposeId;
  readonly recipientId: RecipientId;
  readonly recipientKind: RecipientKind;
}

export type DataMapRelationshipType =
  | "category_to_purpose"
  | "purpose_to_capability"
  | "category_to_recipient";

export type DataMapRelationshipStatus = "active" | "paused";

export interface DataMapCategoryNode {
  readonly id: DataCategoryId;
  readonly name: string;
  readonly status: DataMapRelationshipStatus;
}

export interface DataMapPurposeNode {
  readonly id: PurposeId;
  readonly name: string;
  readonly description: string;
}

export interface DataMapCapabilityNode {
  readonly id: CapabilityId;
  readonly name: string;
  readonly description: string;
}

export interface DataMapRecipientNode {
  readonly id: RecipientId;
  readonly name: string;
  readonly kind: RecipientKind;
}

/**
 * A normalized relationship edge. Names and descriptions live on the node
 * collections so a tool consumer can join stable IDs without repeated prose.
 */
export interface DataMapRelationship {
  readonly id: string;
  readonly relationshipType: DataMapRelationshipType;
  readonly dataCategoryId: DataCategoryId;
  readonly purposeId: PurposeId;
  readonly capabilityId: CapabilityId | null;
  readonly recipientId: RecipientId | null;
  readonly dependencyStrength: DependencyStrength | null;
  readonly dependencyImpact: DependencyImpact | null;
  readonly status: DataMapRelationshipStatus;
}

export interface PrivacyDataMap {
  readonly stateVersion: StateVersion;
  readonly categories: readonly DataMapCategoryNode[];
  readonly purposes: readonly DataMapPurposeNode[];
  readonly capabilities: readonly DataMapCapabilityNode[];
  readonly recipients: readonly DataMapRecipientNode[];
  readonly relationships: readonly DataMapRelationship[];
}

export interface PrivacyScoreCategoryDeduction {
  readonly categoryId: DataCategoryId;
  readonly points: number;
  readonly rationale: string;
}

export interface PrivacyScoreSharingDeduction {
  readonly recipientId: RecipientId;
  readonly points: number;
  readonly rationale: string;
}

export interface PrivacyScoreBreakdown {
  readonly baseScore: number;
  readonly optionalCategoryDeductions: readonly PrivacyScoreCategoryDeduction[];
  readonly thirdPartySharingDeductions: readonly PrivacyScoreSharingDeduction[];
  readonly totalDeduction: number;
  readonly score: number;
}

export type PrivacyOpportunityKind = "disable_processing";

export interface PrivacyOpportunity {
  readonly id: string;
  readonly kind: PrivacyOpportunityKind;
  readonly categoryId: DataCategoryId;
  readonly impactWeight: number;
  readonly label: string;
  readonly rationale: string;
}

export interface PrivacySummaryData {
  readonly stateVersion: StateVersion;
  readonly privacyScore: number;
  readonly privacyStatus: string;
  readonly dataCategoryCount: number;
  readonly enabledOptionalProcessingCount: number;
  readonly enabledOptionalProcessingCategories: readonly DataCategoryId[];
  readonly requiredProcessingCount: number;
  readonly requiredProcessingCategories: readonly DataCategoryId[];
  readonly thirdPartySharing: readonly RecipientId[];
  readonly retentionHighlights: readonly string[];
  readonly highestImpactPrivacyOpportunities: readonly string[];
  readonly noChangesMade: boolean;
}

export interface PrivacySummaryResult {
  readonly ok: true;
  readonly data: PrivacySummaryData;
}

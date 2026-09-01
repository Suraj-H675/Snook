import type {
  CapabilityDefinition,
  CapabilityId,
  DataCategoryDefinition,
  DataCategoryId,
  FeatureDependency,
  PrivacyCatalog,
  PurposeDefinition,
  PurposeId,
  RecipientDefinition,
  RecipientId,
} from "./types.ts";

export const PURPOSE_DEFINITIONS = {
  account_operation: {
    id: "account_operation",
    name: "Account operation",
    shortName: "account operation",
    description: "Providing account access and the core service.",
  },
  fraud_security: {
    id: "fraud_security",
    name: "Fraud and security protection",
    shortName: "fraud/security protection",
    description: "Detecting abuse and protecting accounts and the service.",
  },
  recommendations: {
    id: "recommendations",
    name: "Recommendations",
    shortName: "recommendations",
    description: "Selecting and ranking useful content or products.",
  },
  local_discovery: {
    id: "local_discovery",
    name: "Local and nearby functionality",
    shortName: "local/nearby functionality",
    description: "Showing results and suggestions relevant to the user's area.",
  },
  personalization: {
    id: "personalization",
    name: "Personalization",
    shortName: "personalization",
    description: "Adapting the experience to a user's preferences and behavior.",
  },
  product_analytics: {
    id: "product_analytics",
    name: "Product improvement and analytics",
    shortName: "analytics",
    description: "Measuring service use to improve the fictional service.",
  },
  marketing: {
    id: "marketing",
    name: "Marketing",
    shortName: "marketing",
    description: "Selecting and measuring optional marketing communications.",
  },
  advertising_profile_enrichment: {
    id: "advertising_profile_enrichment",
    name: "Advertising and profile enrichment",
    shortName: "advertising/profile enrichment",
    description: "Building an optional profile for targeted advertising decisions.",
  },
} satisfies Readonly<Record<PurposeId, PurposeDefinition>>;

export const CAPABILITY_DEFINITIONS = {
  account_access: {
    id: "account_access",
    name: "Account access",
    description: "Signing in and using the core account service.",
  },
  recommendation_feed: {
    id: "recommendation_feed",
    name: "Recommendation feed",
    description: "Showing ranked recommendations.",
  },
  nearby_discovery: {
    id: "nearby_discovery",
    name: "Nearby discovery",
    description: "Showing local or nearby results.",
  },
  personalized_ranking: {
    id: "personalized_ranking",
    name: "Personalized ranking",
    description: "Ordering the experience around known preferences.",
  },
  product_improvement: {
    id: "product_improvement",
    name: "Product improvement",
    description: "Using aggregate usage signals to improve the service.",
  },
  marketing_messages: {
    id: "marketing_messages",
    name: "Marketing messages",
    description: "Selecting optional marketing communications.",
  },
  fraud_protection: {
    id: "fraud_protection",
    name: "Fraud protection",
    description: "Protecting accounts and the service from abuse.",
  },
} satisfies Readonly<Record<CapabilityId, CapabilityDefinition>>;

export const RECIPIENT_DEFINITIONS = {
  first_party_service: {
    id: "first_party_service",
    name: "Snook service",
    kind: "first_party",
    description: "The fictional Snook service operating the account.",
    privacyImpactWeight: 0,
  },
  analytics_partner: {
    id: "analytics_partner",
    name: "Analytics partner",
    kind: "third_party",
    description: "A fictional third-party service used for optional analytics.",
    privacyImpactWeight: 3,
  },
} satisfies Readonly<Record<RecipientId, RecipientDefinition>>;

const ACCOUNT_ACCESS_DEPENDENCY: FeatureDependency = {
  capabilityId: "account_access",
  purposeId: "account_operation",
  strength: "required",
  impact: "unavailable",
  description: "The service cannot provide account access without this data.",
};

const FRAUD_PROTECTION_DEPENDENCY: FeatureDependency = {
  capabilityId: "fraud_protection",
  purposeId: "fraud_security",
  strength: "required",
  impact: "unavailable",
  description: "Fraud protection cannot operate without these security signals.",
};

export const DATA_CATEGORY_DEFINITIONS = {
  account_profile: {
    id: "account_profile",
    name: "Account profile",
    description: "Basic profile details used to create and operate the account.",
    collected: true,
    processingRequirement: "required",
    controllable: false,
    purposeIds: ["account_operation"],
    retention: { kind: "account_lifetime" },
    sharedWith: [
      {
        recipientId: "first_party_service",
        purposeIds: ["account_operation"],
      },
    ],
    featureDependencies: [ACCOUNT_ACCESS_DEPENDENCY],
    consequencesIfDisabled: [
      {
        effect: "feature_unavailable",
        purposeId: "account_operation",
        capabilityId: "account_access",
        description: "Account access and core service operation would stop.",
      },
    ],
    riskOrSensitivity: "medium",
    privacyImpact: {
      scoreWeight: 0,
      rationale: "Required account operation is outside the optional exposure score.",
    },
    source: "user_provided",
  },
  activity_history: {
    id: "activity_history",
    name: "Activity history",
    description: "Recent interactions used to understand what the user engages with.",
    collected: true,
    processingRequirement: "optional",
    controllable: true,
    purposeIds: ["recommendations", "personalization", "product_analytics"],
    retention: { kind: "fixed_period", amount: 90, unit: "days", summaryPriority: 2 },
    sharedWith: [
      {
        recipientId: "first_party_service",
        purposeIds: ["recommendations", "personalization", "product_analytics"],
      },
      {
        recipientId: "analytics_partner",
        purposeIds: ["product_analytics"],
      },
    ],
    featureDependencies: [
      {
        capabilityId: "recommendation_feed",
        purposeId: "recommendations",
        strength: "quality",
        impact: "degraded",
        description: "Recommendations have less recent behavior context.",
      },
      {
        capabilityId: "personalized_ranking",
        purposeId: "personalization",
        strength: "quality",
        impact: "degraded",
        description: "Personalized ranking has less recent behavior context.",
      },
      {
        capabilityId: "product_improvement",
        purposeId: "product_analytics",
        strength: "quality",
        impact: "degraded",
        description: "Product improvement receives less usage signal data.",
      },
    ],
    consequencesIfDisabled: [
      {
        effect: "stops_collection",
        purposeId: "recommendations",
        description: "New activity is no longer retained for optional uses.",
      },
      {
        effect: "quality_reduced",
        purposeId: "recommendations",
        capabilityId: "recommendation_feed",
        description: "Recommendations may become less relevant to recent interests.",
      },
      {
        effect: "quality_reduced",
        purposeId: "personalization",
        capabilityId: "personalized_ranking",
        description: "Personalized ranking has less behavior context.",
      },
      {
        effect: "sharing_stops",
        purposeId: "product_analytics",
        recipientId: "analytics_partner",
        description: "Activity history is no longer sent to the analytics partner.",
      },
    ],
    riskOrSensitivity: "high",
    privacyImpact: {
      scoreWeight: 7,
      rationale: "Recent behavior can reveal interests and routines.",
    },
    source: "service_observed",
  },
  location_history: {
    id: "location_history",
    name: "Location history",
    description: "Past location signals used for nearby relevance and optional analysis.",
    collected: true,
    processingRequirement: "optional",
    controllable: true,
    purposeIds: ["local_discovery", "recommendations", "product_analytics"],
    retention: { kind: "fixed_period", amount: 12, unit: "months", summaryPriority: 1 },
    sharedWith: [
      {
        recipientId: "first_party_service",
        purposeIds: ["local_discovery", "recommendations", "product_analytics"],
      },
      {
        recipientId: "analytics_partner",
        purposeIds: ["product_analytics"],
      },
    ],
    featureDependencies: [
      {
        capabilityId: "nearby_discovery",
        purposeId: "local_discovery",
        strength: "required",
        impact: "unavailable",
        description: "Nearby discovery cannot use location history when it is disabled.",
      },
      {
        capabilityId: "recommendation_feed",
        purposeId: "recommendations",
        strength: "quality",
        impact: "degraded",
        description: "Recommendations lose local context.",
      },
      {
        capabilityId: "product_improvement",
        purposeId: "product_analytics",
        strength: "quality",
        impact: "degraded",
        description: "Product improvement receives less location-related signal data.",
      },
    ],
    consequencesIfDisabled: [
      {
        effect: "stops_collection",
        purposeId: "local_discovery",
        description: "New location history is no longer retained for optional uses.",
      },
      {
        effect: "feature_unavailable",
        purposeId: "local_discovery",
        capabilityId: "nearby_discovery",
        description: "Nearby discovery that relies on stored location history is unavailable.",
      },
      {
        effect: "quality_reduced",
        purposeId: "recommendations",
        capabilityId: "recommendation_feed",
        description: "Recommendations may be less relevant to local context.",
      },
      {
        effect: "sharing_stops",
        purposeId: "product_analytics",
        recipientId: "analytics_partner",
        description: "Location history is no longer sent to the analytics partner.",
      },
    ],
    riskOrSensitivity: "high",
    privacyImpact: {
      scoreWeight: 12,
      rationale: "Location history can reveal movements, routines, and sensitive places.",
    },
    source: "service_observed",
  },
  recommendation_profile: {
    id: "recommendation_profile",
    name: "Recommendation profile",
    description: "A derived profile of interests used to tailor recommendations.",
    collected: true,
    processingRequirement: "optional",
    controllable: true,
    purposeIds: ["recommendations", "personalization"],
    retention: { kind: "account_lifetime" },
    sharedWith: [
      {
        recipientId: "first_party_service",
        purposeIds: ["recommendations", "personalization"],
      },
    ],
    featureDependencies: [
      {
        capabilityId: "recommendation_feed",
        purposeId: "recommendations",
        strength: "quality",
        impact: "degraded",
        description: "Recommendations lose a derived interest signal.",
      },
      {
        capabilityId: "personalized_ranking",
        purposeId: "personalization",
        strength: "required",
        impact: "unavailable",
        description: "Personalized ranking cannot use the recommendation profile.",
      },
    ],
    consequencesIfDisabled: [
      {
        effect: "stops_collection",
        purposeId: "recommendations",
        description: "The service stops maintaining a derived recommendation profile.",
      },
      {
        effect: "feature_unavailable",
        purposeId: "personalization",
        capabilityId: "personalized_ranking",
        description: "Personalized ranking is unavailable without this profile.",
      },
      {
        effect: "quality_reduced",
        purposeId: "recommendations",
        capabilityId: "recommendation_feed",
        description: "The general recommendation feed has less interest context.",
      },
    ],
    riskOrSensitivity: "medium",
    privacyImpact: {
      scoreWeight: 8,
      rationale: "A derived interest profile summarizes behavior across interactions.",
    },
    source: "service_derived",
  },
  product_preferences: {
    id: "product_preferences",
    name: "Product preferences",
    description: "Choices the user makes about product or content preferences.",
    collected: true,
    processingRequirement: "optional",
    controllable: true,
    purposeIds: ["recommendations", "personalization"],
    retention: { kind: "account_lifetime" },
    sharedWith: [
      {
        recipientId: "first_party_service",
        purposeIds: ["recommendations", "personalization"],
      },
    ],
    featureDependencies: [
      {
        capabilityId: "personalized_ranking",
        purposeId: "personalization",
        strength: "required",
        impact: "unavailable",
        description: "Personalized ranking cannot apply saved preferences.",
      },
      {
        capabilityId: "recommendation_feed",
        purposeId: "recommendations",
        strength: "quality",
        impact: "degraded",
        description: "Recommendations lose explicit preference signals.",
      },
    ],
    consequencesIfDisabled: [
      {
        effect: "stops_collection",
        purposeId: "personalization",
        description: "New optional product preferences are no longer retained.",
      },
      {
        effect: "feature_unavailable",
        purposeId: "personalization",
        capabilityId: "personalized_ranking",
        description: "Personalized ranking cannot apply saved preferences.",
      },
      {
        effect: "quality_reduced",
        purposeId: "recommendations",
        capabilityId: "recommendation_feed",
        description: "Recommendations have fewer explicit preference signals.",
      },
    ],
    riskOrSensitivity: "medium",
    privacyImpact: {
      scoreWeight: 5,
      rationale: "Preferences disclose chosen interests and product affinities.",
    },
    source: "user_provided",
  },
  analytics_data: {
    id: "analytics_data",
    name: "Analytics data",
    description: "Usage measurements used to improve the fictional service.",
    collected: true,
    processingRequirement: "optional",
    controllable: true,
    purposeIds: ["product_analytics"],
    retention: { kind: "fixed_period", amount: 90, unit: "days" },
    sharedWith: [
      {
        recipientId: "first_party_service",
        purposeIds: ["product_analytics"],
      },
      {
        recipientId: "analytics_partner",
        purposeIds: ["product_analytics"],
      },
    ],
    featureDependencies: [
      {
        capabilityId: "product_improvement",
        purposeId: "product_analytics",
        strength: "required",
        impact: "unavailable",
        description: "Optional product-improvement analytics cannot run without this data.",
      },
    ],
    consequencesIfDisabled: [
      {
        effect: "stops_collection",
        purposeId: "product_analytics",
        description: "Optional product analytics collection stops.",
      },
      {
        effect: "sharing_stops",
        purposeId: "product_analytics",
        recipientId: "analytics_partner",
        description: "Analytics data is no longer shared with the analytics partner.",
      },
      {
        effect: "core_service_unchanged",
        description: "Core account operation and recommendations continue.",
      },
    ],
    riskOrSensitivity: "medium",
    privacyImpact: {
      scoreWeight: 1,
      rationale: "Optional usage measurements create a small additional exposure.",
    },
    source: "service_observed",
  },
  marketing_profile: {
    id: "marketing_profile",
    name: "Marketing profile",
    description: "An optional profile used to select relevant marketing messages.",
    collected: true,
    processingRequirement: "optional",
    controllable: true,
    purposeIds: ["marketing", "advertising_profile_enrichment"],
    retention: { kind: "fixed_period", amount: 12, unit: "months" },
    sharedWith: [
      {
        recipientId: "first_party_service",
        purposeIds: ["marketing", "advertising_profile_enrichment"],
      },
    ],
    featureDependencies: [
      {
        capabilityId: "marketing_messages",
        purposeId: "marketing",
        strength: "required",
        impact: "unavailable",
        description: "Optional targeted marketing messages cannot use this profile.",
      },
    ],
    consequencesIfDisabled: [
      {
        effect: "stops_collection",
        purposeId: "marketing",
        description: "The service stops maintaining the optional marketing profile.",
      },
      {
        effect: "feature_unavailable",
        purposeId: "marketing",
        capabilityId: "marketing_messages",
        description: "Targeted marketing messages are no longer selected from this profile.",
      },
      {
        effect: "core_service_unchanged",
        description: "Core account operation and recommendations are unaffected.",
      },
    ],
    riskOrSensitivity: "high",
    privacyImpact: {
      scoreWeight: 10,
      rationale: "A marketing profile can expose inferred interests to targeting decisions.",
    },
    source: "service_derived",
  },
  fraud_abuse_signals: {
    id: "fraud_abuse_signals",
    name: "Fraud and abuse signals",
    description: "Security signals used to detect abuse and protect accounts.",
    collected: true,
    processingRequirement: "required",
    controllable: false,
    purposeIds: ["fraud_security"],
    retention: { kind: "security_minimum" },
    sharedWith: [
      {
        recipientId: "first_party_service",
        purposeIds: ["fraud_security"],
      },
    ],
    featureDependencies: [FRAUD_PROTECTION_DEPENDENCY],
    consequencesIfDisabled: [
      {
        effect: "feature_unavailable",
        purposeId: "fraud_security",
        capabilityId: "fraud_protection",
        description: "The service could not provide its required fraud and abuse protection.",
      },
    ],
    riskOrSensitivity: "high",
    privacyImpact: {
      scoreWeight: 0,
      rationale: "Required security processing is outside the optional exposure score.",
    },
    source: "security_telemetry",
  },
} satisfies Readonly<Record<DataCategoryId, DataCategoryDefinition>>;

export const PRIVACY_CATALOG: PrivacyCatalog = {
  categories: DATA_CATEGORY_DEFINITIONS,
  purposes: PURPOSE_DEFINITIONS,
  capabilities: CAPABILITY_DEFINITIONS,
  recipients: RECIPIENT_DEFINITIONS,
};

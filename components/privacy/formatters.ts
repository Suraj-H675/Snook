import type {
  ConsequenceEffect,
  DataSource,
  DependencyImpact,
  DependencyStrength,
  RiskLevel,
} from "@/lib/privacy/types";

export function formatDataSource(source: DataSource): string {
  switch (source) {
    case "user_provided":
      return "Provided by you";
    case "service_observed":
      return "Observed while using Snook";
    case "service_derived":
      return "Derived by Snook";
    case "security_telemetry":
      return "Security telemetry";
  }
}

export function formatRiskLevel(risk: RiskLevel): string {
  switch (risk) {
    case "low":
      return "Low sensitivity";
    case "medium":
      return "Medium sensitivity";
    case "high":
      return "High sensitivity";
    case "critical":
      return "Very high sensitivity";
  }
}

export function formatDependencyStrength(strength: DependencyStrength): string {
  return strength === "required" ? "Needed for" : "Improves";
}

export function formatDependencyImpact(impact: DependencyImpact): string {
  return impact === "unavailable" ? "unavailable without it" : "quality reduced without it";
}

export function formatConsequenceEffect(effect: ConsequenceEffect): string {
  switch (effect) {
    case "stops_collection":
      return "Collection stops";
    case "feature_unavailable":
      return "Feature unavailable";
    case "quality_reduced":
      return "Quality may be reduced";
    case "sharing_stops":
      return "Sharing stops";
    case "core_service_unchanged":
      return "Core service unchanged";
  }
}

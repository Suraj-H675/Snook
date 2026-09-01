import {
  formatRetention,
  getDataCategory,
  isProcessingEnabled,
} from "../../privacy/engine.ts";
import { PRIVACY_CATALOG } from "../../privacy/catalog.ts";
import { DATA_CATEGORY_IDS } from "../../privacy/types.ts";
import type {
  CapabilityId,
  ConsentState,
  ConsequenceEffect,
  DataCategoryId,
  DataSource,
  DependencyImpact,
  DependencyStrength,
  PrivacyAccountState,
  PrivacyCatalog,
  PurposeId,
  RecipientId,
  RecipientKind,
  RetentionPolicy,
  RiskLevel,
} from "../../privacy/types.ts";
import { createToolFailure, type ToolFailureResult, type ToolSuccessResult } from "../results.ts";
import { EXPLAIN_DATA_USE_INPUT_SCHEMA } from "../schemas.ts";
import {
  createReadToolRuntime,
  type ReadToolInspectionRecorder,
  type ReadToolStateGetter,
} from "../tool-context.ts";
import { EXPLAIN_DATA_USE_TOOL_NAME } from "../tool-names.ts";

export interface ExplainDataUsePurpose {
  readonly purposeId: PurposeId;
  readonly name: string;
  readonly description: string;
  readonly status: "active" | "paused";
}

export interface ExplainDataUseRetention {
  readonly kind: RetentionPolicy["kind"];
  readonly amount: number | null;
  readonly unit: "days" | "months" | null;
  readonly summary: string;
}

export interface ExplainDataUseSharing {
  readonly recipientId: RecipientId;
  readonly name: string;
  readonly kind: RecipientKind;
  readonly purposeIds: readonly PurposeId[];
  readonly status: "active" | "paused";
}

export interface ExplainDataUseDependency {
  readonly capabilityId: CapabilityId;
  readonly capabilityName: string;
  readonly purposeId: PurposeId;
  readonly purposeName: string;
  readonly strength: DependencyStrength;
  readonly impact: DependencyImpact;
  readonly description: string;
  readonly status: "active" | "paused";
}

export interface ExplainDataUseConsequence {
  readonly effect: ConsequenceEffect;
  readonly purposeId: PurposeId | null;
  readonly purposeName: string | null;
  readonly capabilityId: CapabilityId | null;
  readonly capabilityName: string | null;
  readonly recipientId: RecipientId | null;
  readonly recipientName: string | null;
  readonly description: string;
}

export interface ExplainDataUseCategory {
  readonly categoryId: DataCategoryId;
  readonly name: string;
  readonly description: string;
  readonly consentState: ConsentState;
  readonly processingActive: boolean;
  readonly processingStatus:
    | "mandatory"
    | "optional_enabled"
    | "optional_disabled";
  readonly required: boolean;
  readonly controllable: boolean;
  readonly source: DataSource;
  readonly riskOrSensitivity: RiskLevel;
  readonly privacyImpact: {
    readonly scoreWeight: number;
    readonly rationale: string;
  };
  readonly purposes: readonly ExplainDataUsePurpose[];
  readonly retention: ExplainDataUseRetention;
  readonly sharing: readonly ExplainDataUseSharing[];
  readonly productDependencies: readonly ExplainDataUseDependency[];
  readonly consequencesIfDisabled: readonly ExplainDataUseConsequence[];
}

export interface ExplainDataUseData {
  readonly stateVersion: number;
  readonly category: ExplainDataUseCategory;
  readonly noChangesMade: true;
}

export type ExplainDataUseResult =
  | ToolSuccessResult<ExplainDataUseData>
  | ToolFailureResult<"INVALID_DATA_CATEGORY">;

function isCanonicalDataCategoryId(
  value: unknown,
): value is DataCategoryId {
  return (
    typeof value === "string" &&
    DATA_CATEGORY_IDS.some((categoryId) => categoryId === value)
  );
}

function displayInput(value: unknown): string {
  if (value === undefined) {
    return "missing";
  }
  if (typeof value === "string") {
    return value;
  }
  return String(value);
}

function invalidCategoryResult(value: unknown): ExplainDataUseResult {
  return createToolFailure(
    "INVALID_DATA_CATEGORY",
    `Unknown data category ID “${displayInput(value)}”. Use one of the canonical category IDs.`,
  );
}

function explainRetention(retention: RetentionPolicy): ExplainDataUseRetention {
  switch (retention.kind) {
    case "fixed_period":
      return {
        kind: retention.kind,
        amount: retention.amount,
        unit: retention.unit,
        summary: formatRetention(retention),
      };
    case "account_lifetime":
      return {
        kind: retention.kind,
        amount: null,
        unit: null,
        summary: formatRetention(retention),
      };
    case "security_minimum":
      return {
        kind: retention.kind,
        amount: null,
        unit: null,
        summary: formatRetention(retention),
      };
  }
}

function getName<T extends { id: string; name: string }>(
  collection: Readonly<Record<string, T>>,
  id: string | null,
): string | null {
  return id === null ? null : collection[id]?.id === id ? collection[id].name : null;
}

function createExplainData(
  categoryId: DataCategoryId,
  state: PrivacyAccountState,
  catalog: PrivacyCatalog,
): ExplainDataUseData {
  const category = catalog.categories[categoryId];
  const processingActive = isProcessingEnabled(state, categoryId, catalog);
  const required = category.processingRequirement === "required";
  const status = processingActive ? "active" : "paused";

  return {
    stateVersion: state.stateVersion,
    category: {
      categoryId: category.id,
      name: category.name,
      description: category.description,
      consentState: state.categories[category.id].consentState,
      processingActive,
      processingStatus: required
        ? "mandatory"
        : processingActive
          ? "optional_enabled"
          : "optional_disabled",
      required,
      controllable: category.controllable,
      source: category.source,
      riskOrSensitivity: category.riskOrSensitivity,
      privacyImpact: {
        scoreWeight: category.privacyImpact.scoreWeight,
        rationale: category.privacyImpact.rationale,
      },
      purposes: category.purposeIds.flatMap((purposeId) => {
        const purpose = catalog.purposes[purposeId];
        return purpose
          ? [
              {
                purposeId: purpose.id,
                name: purpose.name,
                description: purpose.description,
                status,
              },
            ]
          : [];
      }),
      retention: explainRetention(category.retention),
      sharing: category.sharedWith.flatMap((destination) => {
        const recipient = catalog.recipients[destination.recipientId];
        return recipient
          ? [
              {
                recipientId: recipient.id,
                name: recipient.name,
                kind: recipient.kind,
                purposeIds: [...destination.purposeIds],
                status,
              },
            ]
          : [];
      }),
      productDependencies: category.featureDependencies.flatMap((dependency) => {
        const capability = catalog.capabilities[dependency.capabilityId];
        const purpose = catalog.purposes[dependency.purposeId];
        return capability && purpose
          ? [
              {
                capabilityId: capability.id,
                capabilityName: capability.name,
                purposeId: purpose.id,
                purposeName: purpose.name,
                strength: dependency.strength,
                impact: dependency.impact,
                description: dependency.description,
                status,
              },
            ]
          : [];
      }),
      consequencesIfDisabled: category.consequencesIfDisabled.map(
        (consequence) => ({
          effect: consequence.effect,
          purposeId: consequence.purposeId ?? null,
          purposeName: consequence.purposeId
            ? getName(catalog.purposes, consequence.purposeId)
            : null,
          capabilityId: consequence.capabilityId ?? null,
          capabilityName: consequence.capabilityId
            ? getName(catalog.capabilities, consequence.capabilityId)
            : null,
          recipientId: consequence.recipientId ?? null,
          recipientName: consequence.recipientId
            ? getName(catalog.recipients, consequence.recipientId)
            : null,
          description: consequence.description,
        }),
      ),
    },
    noChangesMade: true,
  };
}

function getInputCategoryId(input: unknown): unknown {
  if (typeof input !== "object" || input === null) {
    return undefined;
  }

  return (input as { readonly categoryId?: unknown }).categoryId;
}

export function createExplainDataUseTool(
  onInvoked?: () => void,
  getState?: ReadToolStateGetter,
  recordInspection?: ReadToolInspectionRecorder,
  catalog: PrivacyCatalog = PRIVACY_CATALOG,
): WebMCP.ModelContextTool {
  const runtime = createReadToolRuntime({
    onInvoked,
    getState,
    recordInspection,
  });

  return {
    name: EXPLAIN_DATA_USE_TOOL_NAME,
    title: "Explain data use",
    description:
      "Explain one canonical data category in depth, including its current state, sensitivity, purposes, retention, sharing, product dependencies, and consequences if disabled. Requires categoryId and never changes account privacy state.",
    inputSchema: EXPLAIN_DATA_USE_INPUT_SCHEMA,
    annotations: {
      readOnlyHint: true,
    },
    execute: (input): ExplainDataUseResult => {
      const rawCategoryId = getInputCategoryId(input);
      if (!isCanonicalDataCategoryId(rawCategoryId)) {
        return invalidCategoryResult(rawCategoryId);
      }

      const category = getDataCategory(rawCategoryId, catalog);
      if (!category) {
        return invalidCategoryResult(rawCategoryId);
      }

      const data = createExplainData(rawCategoryId, runtime.getState(), catalog);
      runtime.complete(EXPLAIN_DATA_USE_TOOL_NAME, rawCategoryId);
      return { ok: true, data };
    },
  };
}

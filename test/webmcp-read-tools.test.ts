import assert from "node:assert/strict";
import test from "node:test";
import { PRIVACY_CATALOG } from "../lib/privacy/catalog.ts";
import { getPrivacyScoreBreakdown } from "../lib/privacy/scoring.ts";
import {
  DATA_CATEGORY_IDS,
  type PrivacyAccountState,
} from "../lib/privacy/types.ts";
import {
  createUiInspectionStore,
  type UiInspectionStore,
} from "../lib/state/inspection-store.ts";
import {
  createPrivacyStateStore,
  type PrivacyStateStore,
} from "../lib/state/store.ts";
import {
  createWebMcpTools,
  registerWebMcpTools,
  WEBMCP_TOOL_NAMES,
} from "../lib/webmcp/register-tools.ts";
import type { GetConsentStateResult } from "../lib/webmcp/tools/get-consent-state.ts";
import type { GetDataMapResult } from "../lib/webmcp/tools/get-data-map.ts";
import type { ExplainDataUseResult } from "../lib/webmcp/tools/explain-data-use.ts";
import type { PrivacySummaryResult } from "../lib/privacy/types.ts";

function createMemoryStorage() {
  let value: string | null = null;

  return {
    getItem(): string | null {
      return value;
    },
    setItem(_key: string, nextValue: string): void {
      value = nextValue;
    },
    get value(): string | null {
      return value;
    },
  };
}

function createTestRuntime(): {
  readonly inspectionStore: UiInspectionStore;
  readonly privacyStore: PrivacyStateStore;
  readonly tools: readonly WebMCP.ModelContextTool[];
} {
  const privacyStore = createPrivacyStateStore({
    storage: createMemoryStorage(),
  });
  const inspectionStore = createUiInspectionStore();

  return {
    inspectionStore,
    privacyStore,
    tools: createWebMcpTools({
      getState: privacyStore.getState,
      recordInspection: (tool, categoryId) =>
        inspectionStore.recordInspection(tool, categoryId),
    }),
  };
}

async function executeTool<T>(
  tool: WebMCP.ModelContextTool,
  input: Record<string, unknown>,
): Promise<T> {
  return (await tool.execute(input, {
    signal: new AbortController().signal,
  })) as T;
}

function findTool(
  tools: readonly WebMCP.ModelContextTool[],
  name: string,
): WebMCP.ModelContextTool {
  const tool = tools.find((candidate) => candidate.name === name);
  assert.ok(tool, `expected tool ${name}`);
  return tool;
}

function assertSuccess<T extends { ok: true; data: unknown }>(
  result: T | { ok: false; error: unknown },
): asserts result is T {
  assert.equal(result.ok, true);
}

test("Phase 3 inventory contains exactly four read-only tools", () => {
  const { tools } = createTestRuntime();
  const names = tools.map((tool) => tool.name);

  assert.deepEqual(names, [
    "get_privacy_summary",
    "get_data_map",
    "get_consent_state",
    "explain_data_use",
  ]);
  assert.deepEqual(names, WEBMCP_TOOL_NAMES);
  assert.equal(new Set(names).size, 4);

  for (const tool of tools) {
    assert.deepEqual(tool.annotations, { readOnlyHint: true });
    assert.equal("untrustedContentHint" in (tool.annotations ?? {}), false);
  }

  assert.deepEqual(findTool(tools, "get_privacy_summary").inputSchema, {
    type: "object",
    properties: {},
    additionalProperties: false,
  });
  assert.deepEqual(findTool(tools, "get_data_map").inputSchema, {
    type: "object",
    properties: {},
    additionalProperties: false,
  });
  assert.deepEqual(findTool(tools, "get_consent_state").inputSchema, {
    type: "object",
    properties: {},
    additionalProperties: false,
  });
  assert.deepEqual(findTool(tools, "explain_data_use").inputSchema, {
    type: "object",
    properties: {
      categoryId: {
        type: "string",
        enum: [...DATA_CATEGORY_IDS],
      },
    },
    required: ["categoryId"],
    additionalProperties: false,
  });
});

test("get_privacy_summary preserves its compatible contract and reads live state", async () => {
  const { privacyStore, tools } = createTestRuntime();
  const tool = findTool(tools, "get_privacy_summary");

  const seeded = (await executeTool<PrivacySummaryResult>(tool, {}));
  assert.equal(seeded.ok, true);
  if (seeded.ok) {
    assert.equal(seeded.data.stateVersion, 1);
    assert.equal(seeded.data.privacyScore, 54);
    assert.equal(seeded.data.enabledOptionalProcessingCount, 6);
    assert.equal(seeded.data.noChangesMade, true);
  }

  const change = privacyStore.setCategoryConsentState(
    "location_history",
    "disabled",
  );
  assert.equal(change.ok, true);

  const current = await executeTool<PrivacySummaryResult>(tool, {});
  assert.equal(current.ok, true);
  if (current.ok) {
    assert.equal(current.data.stateVersion, 2);
    assert.equal(current.data.privacyScore, 66);
    assert.equal(current.data.enabledOptionalProcessingCount, 5);
    assert.ok(
      !current.data.enabledOptionalProcessingCategories.includes(
        "location_history",
      ),
    );
  }
});

test("get_consent_state exposes compact current controls and required processing context", async () => {
  const { privacyStore, tools } = createTestRuntime();
  const tool = findTool(tools, "get_consent_state");

  const seeded = await executeTool<GetConsentStateResult>(tool, {});
  assertSuccess(seeded);
  assert.equal(seeded.data.stateVersion, 1);
  assert.equal(seeded.data.enabledOptionalCount, 6);
  assert.equal(seeded.data.disabledOptionalCount, 0);
  assert.equal(seeded.data.categories.length, 8);
  assert.deepEqual(
    seeded.data.categories.map((category) => category.categoryId),
    DATA_CATEGORY_IDS,
  );

  const accountProfile = seeded.data.categories.find(
    (category) => category.categoryId === "account_profile",
  );
  assert.deepEqual(accountProfile, {
    categoryId: "account_profile",
    name: "Account profile",
    processingRequirement: "required",
    required: true,
    controllable: false,
    consentState: "required",
    processingActive: true,
    processingStatus: "mandatory",
    requiredReason:
      "The service cannot provide account access without this data.",
  });

  const disableLocation = privacyStore.setCategoryConsentState(
    "location_history",
    "disabled",
  );
  assert.equal(disableLocation.ok, true);

  const current = await executeTool<GetConsentStateResult>(tool, {});
  assertSuccess(current);
  assert.equal(current.data.stateVersion, 2);
  assert.equal(current.data.enabledOptionalCount, 5);
  assert.equal(current.data.disabledOptionalCount, 1);
  assert.deepEqual(
    current.data.categories.find(
      (category) => category.categoryId === "location_history",
    ),
    {
      categoryId: "location_history",
      name: "Location history",
      processingRequirement: "optional",
      required: false,
      controllable: true,
      consentState: "disabled",
      processingActive: false,
      processingStatus: "optional_disabled",
      requiredReason: null,
    },
  );
});

test("get_data_map is normalized, catalog-derived, and pauses only disabled paths", async () => {
  const { privacyStore, tools } = createTestRuntime();
  const tool = findTool(tools, "get_data_map");

  const seeded = await executeTool<GetDataMapResult>(tool, {});
  assertSuccess(seeded);
  assert.equal(seeded.data.stateVersion, 1);
  assert.equal(seeded.data.noChangesMade, true);
  assert.deepEqual(
    seeded.data.categories.map((category) => category.id),
    DATA_CATEGORY_IDS,
  );
  assert.equal(
    new Set(seeded.data.relationships.map((relationship) => relationship.id))
      .size,
    seeded.data.relationships.length,
  );

  for (const category of Object.values(PRIVACY_CATALOG.categories)) {
    for (const purposeId of category.purposeIds) {
      assert.ok(
        seeded.data.relationships.some(
          (relationship) =>
            relationship.relationshipType === "category_to_purpose" &&
            relationship.dataCategoryId === category.id &&
            relationship.purposeId === purposeId &&
            relationship.status === "active",
        ),
      );
    }

    for (const dependency of category.featureDependencies) {
      assert.ok(
        seeded.data.relationships.some(
          (relationship) =>
            relationship.relationshipType === "purpose_to_capability" &&
            relationship.dataCategoryId === category.id &&
            relationship.purposeId === dependency.purposeId &&
            relationship.capabilityId === dependency.capabilityId &&
            relationship.dependencyStrength === dependency.strength &&
            relationship.dependencyImpact === dependency.impact &&
            relationship.status === "active",
        ),
      );
    }
  }

  const disableLocation = privacyStore.setCategoryConsentState(
    "location_history",
    "disabled",
  );
  assert.equal(disableLocation.ok, true);

  const current = await executeTool<GetDataMapResult>(tool, {});
  assertSuccess(current);
  assert.equal(current.data.stateVersion, 2);
  assert.equal(
    current.data.categories.find((category) => category.id === "location_history")
      ?.status,
    "paused",
  );
  assert.ok(
    current.data.relationships
      .filter((relationship) => relationship.dataCategoryId === "location_history")
      .every((relationship) => relationship.status === "paused"),
  );
  assert.equal(
    current.data.relationships.find(
      (relationship) =>
        relationship.relationshipType === "category_to_recipient" &&
        relationship.dataCategoryId === "activity_history" &&
        relationship.recipientId === "analytics_partner",
    )?.status,
    "active",
  );
  assert.equal(
    current.data.relationships.find(
      (relationship) =>
        relationship.relationshipType === "category_to_recipient" &&
        relationship.dataCategoryId === "location_history" &&
        relationship.recipientId === "analytics_partner",
    )?.status,
    "paused",
  );
});

test("explain_data_use returns one focused category and updates presentation selection", async () => {
  const { inspectionStore, privacyStore, tools } = createTestRuntime();
  const tool = findTool(tools, "explain_data_use");

  const seeded = await executeTool<ExplainDataUseResult>(tool, {
    categoryId: "location_history",
  });
  assertSuccess(seeded);
  assert.equal(seeded.data.stateVersion, 1);
  assert.equal(seeded.data.noChangesMade, true);
  assert.equal(seeded.data.category.categoryId, "location_history");
  assert.equal(seeded.data.category.name, "Location history");
  assert.equal(seeded.data.category.description, "Past location signals used for nearby relevance and optional analysis.");
  assert.equal(seeded.data.category.consentState, "enabled");
  assert.equal(seeded.data.category.processingStatus, "optional_enabled");
  assert.equal(seeded.data.category.required, false);
  assert.equal(seeded.data.category.controllable, true);
  assert.equal(seeded.data.category.source, "service_observed");
  assert.equal(seeded.data.category.riskOrSensitivity, "high");
  assert.deepEqual(seeded.data.category.retention, {
    kind: "fixed_period",
    amount: 12,
    unit: "months",
    summary: "12 months",
  });
  assert.deepEqual(
    seeded.data.category.purposes.map((purpose) => purpose.purposeId),
    ["local_discovery", "recommendations", "product_analytics"],
  );
  assert.ok(
    seeded.data.category.productDependencies.some(
      (dependency) =>
        dependency.capabilityId === "nearby_discovery" &&
        dependency.purposeId === "local_discovery" &&
        dependency.strength === "required" &&
        dependency.impact === "unavailable" &&
        dependency.status === "active",
    ),
  );
  assert.deepEqual(
    seeded.data.category.sharing.find(
      (sharing) => sharing.recipientId === "analytics_partner",
    ),
    {
      recipientId: "analytics_partner",
      name: "Analytics partner",
      kind: "third_party",
      purposeIds: ["product_analytics"],
      status: "active",
    },
  );
  assert.ok(
    seeded.data.category.consequencesIfDisabled.some(
      (consequence) =>
        consequence.effect === "feature_unavailable" &&
        consequence.capabilityId === "nearby_discovery",
    ),
  );
  assert.deepEqual(inspectionStore.getState(), {
    tool: "explain_data_use",
    categoryId: "location_history",
    selectedCategoryId: "location_history",
    sequence: 1,
  });

  const disableLocation = privacyStore.setCategoryConsentState(
    "location_history",
    "disabled",
  );
  assert.equal(disableLocation.ok, true);

  const current = await executeTool<ExplainDataUseResult>(tool, {
    categoryId: "location_history",
  });
  assertSuccess(current);
  assert.equal(current.data.stateVersion, 2);
  assert.equal(current.data.category.consentState, "disabled");
  assert.equal(current.data.category.processingActive, false);
  assert.equal(current.data.category.processingStatus, "optional_disabled");
  assert.ok(
    current.data.category.purposes.every((purpose) => purpose.status === "paused"),
  );
  assert.ok(
    current.data.category.productDependencies.every(
      (dependency) => dependency.status === "paused",
    ),
  );
  assert.ok(
    current.data.category.sharing.every((sharing) => sharing.status === "paused"),
  );
  assert.equal(inspectionStore.getState().sequence, 2);
});

test("explain_data_use rejects invalid IDs without inspecting or changing privacy state", async () => {
  const { inspectionStore, privacyStore, tools } = createTestRuntime();
  const tool = findTool(tools, "explain_data_use");
  const beforeState: PrivacyAccountState = privacyStore.getState();
  const beforeInspection = inspectionStore.getState();

  const invalid = await executeTool<ExplainDataUseResult>(tool, {
    categoryId: "location",
  });

  assert.deepEqual(invalid, {
    ok: false,
    error: {
      code: "INVALID_DATA_CATEGORY",
      message:
        "Unknown data category ID “location”. Use one of the canonical category IDs.",
    },
  });
  assert.deepEqual(privacyStore.getState(), beforeState);
  assert.equal(privacyStore.getState().stateVersion, 1);
  assert.equal(getPrivacyScoreBreakdown(privacyStore.getState()).score, 54);
  assert.deepEqual(inspectionStore.getState(), beforeInspection);
});

test("all Phase 3 tools remain read-only for account state and persistence", async () => {
  const storage = createMemoryStorage();
  const privacyStore = createPrivacyStateStore({ storage });
  const inspectionStore = createUiInspectionStore();
  const tools = createWebMcpTools({
    getState: privacyStore.getState,
    recordInspection: (tool, categoryId) =>
      inspectionStore.recordInspection(tool, categoryId),
  });
  const beforeState = privacyStore.getState();
  const beforeSerialized = storage.value;
  const beforeScore = getPrivacyScoreBreakdown(beforeState).score;

  await executeTool(findTool(tools, "get_privacy_summary"), {});
  await executeTool(findTool(tools, "get_data_map"), {});
  await executeTool(findTool(tools, "get_consent_state"), {});
  await executeTool(findTool(tools, "explain_data_use"), {
    categoryId: "location_history",
  });

  assert.deepEqual(privacyStore.getState(), beforeState);
  assert.equal(privacyStore.getState().stateVersion, 1);
  assert.equal(
    getPrivacyScoreBreakdown(privacyStore.getState()).score,
    beforeScore,
  );
  assert.equal(storage.value, beforeSerialized);
  assert.equal(privacyStore.getState().categories.location_history.consentState, "enabled");
  assert.equal(inspectionStore.getState().sequence, 4);
});

test("central registration registers the inventory once for a model context", async () => {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  const registeredTools: WebMCP.ModelContextTool[] = [];
  const modelContext = {
    registerTool: async (tool: WebMCP.ModelContextTool): Promise<void> => {
      registeredTools.push(tool);
    },
  } as unknown as WebMCP.ModelContext;

  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { modelContext },
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {},
  });

  try {
    const first = await registerWebMcpTools();
    const second = await registerWebMcpTools();

    assert.equal(first.status, "registered");
    assert.equal(second.status, "registered");
    assert.deepEqual(registeredTools.map((tool) => tool.name), WEBMCP_TOOL_NAMES);
    assert.equal(registeredTools.length, 4);
  } finally {
    if (previousDocument === undefined) {
      delete (globalThis as { document?: Document }).document;
    } else {
      Object.defineProperty(globalThis, "document", {
        configurable: true,
        value: previousDocument,
      });
    }

    if (previousWindow === undefined) {
      delete (globalThis as { window?: Window }).window;
    } else {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: previousWindow,
      });
    }
  }
});

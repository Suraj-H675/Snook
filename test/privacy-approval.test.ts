import assert from "node:assert/strict";
import test from "node:test";
import { APPROVAL_TTL_MS } from "../lib/approval/approval.ts";
import {
  createApprovalStore,
  getInitialApprovalState,
  type ApprovalStore,
} from "../lib/state/approval-store.ts";
import { PRIVACY_CATALOG } from "../lib/privacy/catalog.ts";
import { getPrivacySummary } from "../lib/privacy/engine.ts";
import { getSeededPrivacyState } from "../lib/privacy/seed.ts";
import { getPrivacyScoreBreakdown } from "../lib/privacy/scoring.ts";
import {
  createStagedPlanStore,
  type StagedPlanStore,
} from "../lib/state/staged-plan-store.ts";
import {
  createPrivacyStateStore,
  type PrivacyStateStore,
} from "../lib/state/store.ts";
import {
  createPrivacyReceiptStore,
  type PrivacyReceiptStore,
} from "../lib/state/receipt-store.ts";
import {
  applyConsentChanges,
} from "../lib/state/transitions.ts";
import {
  createWebMcpTools,
  WEBMCP_TOOL_NAMES,
} from "../lib/webmcp/register-tools.ts";
import type { StagedConsentPlan } from "../lib/plans/types.ts";
import type { ToolFailureResult, ToolSuccessResult } from "../lib/webmcp/results.ts";

function createMemoryStorage() {
  let value: string | null = null;

  return {
    getItem(): string | null {
      return value;
    },
    setItem(_key: string, nextValue: string): void {
      void _key;
      value = nextValue;
    },
    removeItem(key: string): void {
      void key;
      value = null;
    },
    get value(): string | null {
      return value;
    },
  };
}

interface TestClock {
  value: number;
}

interface ApprovalTestRuntime {
  readonly clock: TestClock;
  readonly storage: ReturnType<typeof createMemoryStorage>;
  readonly privacyStore: PrivacyStateStore;
  readonly receiptStore: PrivacyReceiptStore;
  readonly stagedPlanStore: StagedPlanStore;
  readonly approvalStore: ApprovalStore;
  readonly tools: readonly WebMCP.ModelContextTool[];
}

function createTestRuntime(startTime = 1_000): ApprovalTestRuntime {
  const clock = { value: startTime };
  const storage = createMemoryStorage();
  const receiptStore = createPrivacyReceiptStore({
    storage: createMemoryStorage(),
  });
  const privacyStore = createPrivacyStateStore({ storage });
  const stagedPlanStore = createStagedPlanStore();
  let approvalSequence = 0;
  let receiptSequence = 0;
  const approvalStore = createApprovalStore({
    clock: () => clock.value,
    generateApprovalId: () => {
      approvalSequence += 1;
      return `approval_test_${approvalSequence}`;
    },
  });

  return {
    clock,
    storage,
    privacyStore,
    receiptStore,
    stagedPlanStore,
    approvalStore,
    tools: createWebMcpTools({
      getState: privacyStore.getState,
      privacyStateStore: privacyStore,
      receiptStore,
      stagedPlanStore,
      approvalStore,
      clock: () => clock.value,
      generateReceiptId: () => {
        receiptSequence += 1;
        return `receipt_test_${receiptSequence}`;
      },
    }),
  };
}

async function executeTool<T>(
  tool: WebMCP.ModelContextTool,
  input: unknown,
): Promise<T> {
  return (await tool.execute(input as Record<string, unknown>, {
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

function assertSuccess<T>(
  result: ToolSuccessResult<T> | ToolFailureResult,
): asserts result is ToolSuccessResult<T> {
  assert.equal(result.ok, true);
}

function assertFailure(
  result: ToolSuccessResult<unknown> | ToolFailureResult,
  code: string,
): asserts result is ToolFailureResult {
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, code);
  }
}

async function stageLocationPlan(
  runtime: ApprovalTestRuntime,
): Promise<StagedConsentPlan> {
  const result = await executeTool<ToolSuccessResult<StagedConsentPlan> | ToolFailureResult>(
    findTool(runtime.tools, "stage_consent_plan"),
    {
      changes: [
        {
          categoryId: "location_history",
          targetConsentState: "disabled",
        },
      ],
    },
  );
  assertSuccess(result);
  return result.data;
}

function bindingFor(plan: StagedConsentPlan) {
  return {
    planId: plan.planId,
    revision: plan.revision,
    planHash: plan.planHash,
    baseStateVersion: plan.baseStateVersion,
  };
}

function stateSnapshot(runtime: ApprovalTestRuntime) {
  const state = runtime.privacyStore.getState();
  return {
    state,
    serialized: runtime.storage.value,
    score: getPrivacyScoreBreakdown(state).score,
    stagedPlan: runtime.stagedPlanStore.getState().plan,
  };
}

test("human approval creation binds every exact plan field and changes no actual state", async () => {
  const runtime = createTestRuntime();
  const plan = await stageLocationPlan(runtime);
  const before = stateSnapshot(runtime);

  const grant = runtime.approvalStore.createApproval(bindingFor(plan));

  assert.deepEqual(grant, {
    approvalId: "approval_test_1",
    planId: plan.planId,
    revision: plan.revision,
    planHash: plan.planHash,
    baseStateVersion: plan.baseStateVersion,
    status: "active",
    issuedAt: 1_000,
    expiresAt: 1_000 + APPROVAL_TTL_MS,
  });
  assert.equal(
    runtime.approvalStore.getValidity(
      bindingFor(plan),
      runtime.privacyStore.getState().stateVersion,
    ).status,
    "current",
  );
  assert.deepEqual(stateSnapshot(runtime), before);
  assert.equal(runtime.privacyStore.getState().stateVersion, 1);
  assert.equal(runtime.privacyStore.getState().categories.location_history.consentState, "enabled");
  assert.equal(runtime.stagedPlanStore.getState().plan?.planId, plan.planId);
});

test("repeated human approval clicks do not create a redundant active grant", async () => {
  const runtime = createTestRuntime();
  const plan = await stageLocationPlan(runtime);
  const binding = bindingFor(plan);

  const first = runtime.approvalStore.createApproval(binding);
  runtime.clock.value += 1_000;
  const second = runtime.approvalStore.createApproval(binding);

  assert.equal(second.approvalId, first.approvalId);
  assert.equal(second.issuedAt, first.issuedAt);
  assert.equal(runtime.approvalStore.getState().grant?.status, "active");
});

test("plan edit preserves the proposal identity but invalidates the old approval binding", async () => {
  const runtime = createTestRuntime();
  const plan = await stageLocationPlan(runtime);
  const binding = bindingFor(plan);
  runtime.approvalStore.createApproval(binding);

  const edited = await runtime.stagedPlanStore.edit(
    {
      changes: [
        {
          categoryId: "marketing_profile",
          targetConsentState: "disabled",
        },
      ],
    },
    runtime.privacyStore.getState(),
  );
  assert.equal(edited.ok, true);
  if (!edited.ok || edited.data === null) {
    return;
  }

  assert.equal(edited.data.planId, plan.planId);
  assert.equal(edited.data.revision, 2);
  assert.notEqual(edited.data.planHash, plan.planHash);
  assert.equal(
    runtime.approvalStore.getValidity(
      bindingFor(edited.data),
      runtime.privacyStore.getState().stateVersion,
    ).status,
    "plan_changed",
  );

  const result = await executeTool<ToolSuccessResult<unknown> | ToolFailureResult>(
    findTool(runtime.tools, "apply_approved_consent_plan"),
    bindingFor(edited.data),
  );
  assertFailure(result, "PLAN_CHANGED_AFTER_APPROVAL");
  assert.deepEqual(stateSnapshot(runtime), {
    state: getSeededPrivacyState(),
    serialized: null,
    score: 54,
    stagedPlan: edited.data,
  });
});

test("a direct human account change makes an approved plan stale without changing it", async () => {
  const runtime = createTestRuntime();
  const plan = await stageLocationPlan(runtime);
  const binding = bindingFor(plan);
  runtime.approvalStore.createApproval(binding);

  const directChange = runtime.privacyStore.setCategoryConsentState(
    "marketing_profile",
    "disabled",
  );
  assert.equal(directChange.ok, true);
  assert.equal(runtime.privacyStore.getState().stateVersion, 2);
  assert.equal(
    runtime.approvalStore.getValidity(
      binding,
      runtime.privacyStore.getState().stateVersion,
    ).status,
    "account_state_changed",
  );
  const beforeApply = stateSnapshot(runtime);

  const result = await executeTool<ToolSuccessResult<unknown> | ToolFailureResult>(
    findTool(runtime.tools, "apply_approved_consent_plan"),
    binding,
  );
  assertFailure(result, "STATE_CHANGED_SINCE_PREVIEW");
  assert.deepEqual(stateSnapshot(runtime), beforeApply);
});

test("apply rechecks the live account after asynchronous hashing", async () => {
  const runtime = createTestRuntime();
  const plan = await stageLocationPlan(runtime);
  const binding = bindingFor(plan);
  runtime.approvalStore.createApproval(binding);

  const pendingApply = executeTool<ToolSuccessResult<unknown> | ToolFailureResult>(
    findTool(runtime.tools, "apply_approved_consent_plan"),
    binding,
  );
  const directChange = runtime.privacyStore.setCategoryConsentState(
    "marketing_profile",
    "disabled",
  );
  assert.equal(directChange.ok, true);

  const result = await pendingApply;
  assertFailure(result, "STATE_CHANGED_SINCE_PREVIEW");
  assert.equal(runtime.privacyStore.getState().stateVersion, 2);
  assert.equal(runtime.privacyStore.getState().categories.location_history.consentState, "enabled");
  assert.equal(runtime.approvalStore.getState().grant?.status, "active");
  assert.equal(runtime.stagedPlanStore.getState().plan?.planId, plan.planId);
});

test("approval expires at the exact five-minute boundary and cannot apply", async () => {
  const runtime = createTestRuntime();
  const plan = await stageLocationPlan(runtime);
  const binding = bindingFor(plan);
  runtime.approvalStore.createApproval(binding);

  runtime.clock.value = 1_000 + APPROVAL_TTL_MS - 1;
  assert.equal(
    runtime.approvalStore.getValidity(binding, 1).status,
    "current",
  );
  runtime.clock.value = 1_000 + APPROVAL_TTL_MS;
  assert.equal(
    runtime.approvalStore.getValidity(binding, 1).status,
    "expired",
  );
  const before = stateSnapshot(runtime);

  const result = await executeTool<ToolSuccessResult<unknown> | ToolFailureResult>(
    findTool(runtime.tools, "apply_approved_consent_plan"),
    binding,
  );
  assertFailure(result, "PLAN_EXPIRED");
  assert.deepEqual(stateSnapshot(runtime), before);
});

test("verbal approval without the website approval action fails with PLAN_NOT_APPROVED", async () => {
  const runtime = createTestRuntime();
  const plan = await stageLocationPlan(runtime);
  const before = stateSnapshot(runtime);

  const result = await executeTool<ToolSuccessResult<unknown> | ToolFailureResult>(
    findTool(runtime.tools, "apply_approved_consent_plan"),
    bindingFor(plan),
  );

  assertFailure(result, "PLAN_NOT_APPROVED");
  assert.deepEqual(stateSnapshot(runtime), before);
  assert.equal(runtime.approvalStore.getState().grant, null);
});

test("stage_consent_plan does not approve its own plan", async () => {
  const runtime = createTestRuntime();
  const plan = await stageLocationPlan(runtime);

  assert.deepEqual(runtime.approvalStore.getState(), getInitialApprovalState());
  const result = await executeTool<ToolSuccessResult<unknown> | ToolFailureResult>(
    findTool(runtime.tools, "apply_approved_consent_plan"),
    bindingFor(plan),
  );
  assertFailure(result, "PLAN_NOT_APPROVED");
});

test("preview_consent_plan does not create a staged plan or approval", async () => {
  const runtime = createTestRuntime();
  const preview = await executeTool<ToolSuccessResult<unknown> | ToolFailureResult>(
    findTool(runtime.tools, "preview_consent_plan"),
    {
      changes: [
        {
          categoryId: "location_history",
          targetConsentState: "disabled",
        },
      ],
    },
  );

  assertSuccess(preview);
  assert.deepEqual(runtime.stagedPlanStore.getState(), { plan: null });
  assert.deepEqual(runtime.approvalStore.getState(), getInitialApprovalState());
});

test("apply accepts only the strict exact-plan binding shape at runtime", async () => {
  const runtime = createTestRuntime();
  const invalidInputs: unknown[] = [
    {},
    {
      planId: "plan_1",
      revision: 1,
      planHash: "A".repeat(64),
      baseStateVersion: 1,
    },
    {
      planId: "plan_1",
      revision: 0,
      planHash: "a".repeat(64),
      baseStateVersion: 1,
    },
    {
      planId: "plan_1",
      revision: 1.5,
      planHash: "a".repeat(64),
      baseStateVersion: 1,
    },
    {
      planId: "plan_1",
      revision: 1,
      planHash: "a".repeat(64),
      baseStateVersion: 0,
    },
    {
      planId: "plan_1",
      revision: 1,
      planHash: "a".repeat(64),
      baseStateVersion: 1,
      extra: true,
    },
    {
      planId: "plan_1",
      revision: 1,
      planHash: "a".repeat(64),
      baseStateVersion: 1,
      approvalToken: "not accepted",
    },
  ];

  for (const input of invalidInputs) {
    const result = await executeTool<ToolSuccessResult<unknown> | ToolFailureResult>(
      findTool(runtime.tools, "apply_approved_consent_plan"),
      input,
    );
    assertFailure(result, "INVALID_PLAN_INPUT");
  }
  assert.equal(runtime.privacyStore.getState().stateVersion, 1);
  assert.equal(runtime.storage.value, null);
});

test("an exact approved location plan applies once, clears staging, persists actual state, and reports its receipt", async () => {
  const runtime = createTestRuntime();
  const plan = await stageLocationPlan(runtime);
  const binding = bindingFor(plan);
  runtime.approvalStore.createApproval(binding);

  const result = await executeTool<ToolSuccessResult<Record<string, unknown>> | ToolFailureResult>(
    findTool(runtime.tools, "apply_approved_consent_plan"),
    binding,
  );
  assertSuccess(result);
  assert.deepEqual(result.data, {
    appliedPlanId: plan.planId,
    appliedRevision: 1,
    appliedPlanHash: plan.planHash,
    previousStateVersion: 1,
    stateVersion: 2,
    appliedChanges: [
      {
        categoryId: "location_history",
        targetConsentState: "disabled",
      },
    ],
    before: {
      privacyScore: 54,
      enabledOptionalCount: 6,
      thirdPartySharing: ["analytics_partner"],
    },
    after: {
      privacyScore: 66,
      enabledOptionalCount: 5,
      thirdPartySharing: ["analytics_partner"],
    },
    approvalConsumed: true,
    stagedPlanCleared: true,
    receiptGenerated: true,
    receiptId: "receipt_test_1",
  });
  assert.equal(runtime.privacyStore.getState().categories.location_history.consentState, "disabled");
  assert.equal(getPrivacySummary(runtime.privacyStore.getState()).data.privacyScore, 66);
  assert.equal(runtime.privacyStore.getState().stateVersion, 2);
  assert.equal(runtime.stagedPlanStore.getState().plan, null);
  assert.equal(runtime.approvalStore.getState().grant?.status, "consumed");
  assert.deepEqual(
    JSON.parse(runtime.storage.value ?? "null").state,
    runtime.privacyStore.getState(),
  );
});

test("approval click alone never applies actual privacy changes", async () => {
  const runtime = createTestRuntime();
  const plan = await stageLocationPlan(runtime);
  const before = stateSnapshot(runtime);

  runtime.approvalStore.createApproval(bindingFor(plan));

  assert.deepEqual(stateSnapshot(runtime), before);
  assert.equal(runtime.approvalStore.getState().grant?.status, "active");
  assert.equal(runtime.privacyStore.getState().stateVersion, 1);
});

test("a successful three-change plan increments actual stateVersion exactly once", async () => {
  const runtime = createTestRuntime();
  const stage = await executeTool<ToolSuccessResult<StagedConsentPlan> | ToolFailureResult>(
    findTool(runtime.tools, "stage_consent_plan"),
    {
      changes: [
        { categoryId: "activity_history", targetConsentState: "disabled" },
        { categoryId: "location_history", targetConsentState: "disabled" },
        { categoryId: "analytics_data", targetConsentState: "disabled" },
      ],
    },
  );
  assertSuccess(stage);
  const plan = stage.data;
  runtime.approvalStore.createApproval(bindingFor(plan));

  const result = await executeTool<ToolSuccessResult<Record<string, unknown>> | ToolFailureResult>(
    findTool(runtime.tools, "apply_approved_consent_plan"),
    bindingFor(plan),
  );
  assertSuccess(result);
  assert.equal(result.data.previousStateVersion, 1);
  assert.equal(result.data.stateVersion, 2);
  assert.equal(runtime.privacyStore.getState().stateVersion, 2);
  assert.equal(runtime.privacyStore.getState().categories.activity_history.consentState, "disabled");
  assert.equal(runtime.privacyStore.getState().categories.location_history.consentState, "disabled");
  assert.equal(runtime.privacyStore.getState().categories.analytics_data.consentState, "disabled");
  assert.equal(getPrivacySummary(runtime.privacyStore.getState()).data.privacyScore, 77);
  assert.equal(JSON.parse(runtime.storage.value ?? "null").state.stateVersion, 2);
});

test("read tools report the new actual state after an approved apply, never the old staged hypothetical", async () => {
  const runtime = createTestRuntime();
  const plan = await stageLocationPlan(runtime);
  const binding = bindingFor(plan);
  runtime.approvalStore.createApproval(binding);
  const applied = await executeTool<ToolSuccessResult<unknown> | ToolFailureResult>(
    findTool(runtime.tools, "apply_approved_consent_plan"),
    binding,
  );
  assertSuccess(applied);

  const summary = await executeTool<ToolSuccessResult<{ privacyScore: number; stateVersion: number }> | ToolFailureResult>(
    findTool(runtime.tools, "get_privacy_summary"),
    {},
  );
  assertSuccess(summary);
  assert.equal(summary.data.privacyScore, 66);
  assert.equal(summary.data.stateVersion, 2);

  const consent = await executeTool<ToolSuccessResult<{ stateVersion: number; categories: readonly { categoryId: string; consentState: string }[] }> | ToolFailureResult>(
    findTool(runtime.tools, "get_consent_state"),
    {},
  );
  assertSuccess(consent);
  assert.equal(consent.data.stateVersion, 2);
  assert.equal(
    consent.data.categories.find((category) => category.categoryId === "location_history")?.consentState,
    "disabled",
  );

  const dataMap = await executeTool<ToolSuccessResult<{ stateVersion: number; categories: readonly { id: string; status: string }[] }> | ToolFailureResult>(
    findTool(runtime.tools, "get_data_map"),
    {},
  );
  assertSuccess(dataMap);
  assert.equal(dataMap.data.stateVersion, 2);
  assert.equal(
    dataMap.data.categories.find((category) => category.id === "location_history")?.status,
    "paused",
  );

  const explanation = await executeTool<ToolSuccessResult<{ stateVersion: number; category: { consentState: string; processingActive: boolean } }> | ToolFailureResult>(
    findTool(runtime.tools, "explain_data_use"),
    { categoryId: "location_history" },
  );
  assertSuccess(explanation);
  assert.equal(explanation.data.stateVersion, 2);
  assert.equal(explanation.data.category.consentState, "disabled");
  assert.equal(explanation.data.category.processingActive, false);
});

test("wrong revision, hash, plan ID, or base state binding is rejected without mutation", async () => {
  const runtime = createTestRuntime();
  const plan = await stageLocationPlan(runtime);
  const binding = bindingFor(plan);
  runtime.approvalStore.createApproval(binding);
  const before = stateSnapshot(runtime);

  const mismatches = [
    { ...binding, revision: 2 },
    { ...binding, planHash: "b".repeat(64) },
    { ...binding, planId: "plan_other" },
    { ...binding, baseStateVersion: 2 },
  ];
  for (const mismatch of mismatches) {
    const result = await executeTool<ToolSuccessResult<unknown> | ToolFailureResult>(
      findTool(runtime.tools, "apply_approved_consent_plan"),
      mismatch,
    );
    assertFailure(result, "PLAN_CHANGED_AFTER_APPROVAL");
    assert.deepEqual(stateSnapshot(runtime), before);
  }
});

test("defensive apply validation still protects required processing if a staged object is malformed", async () => {
  const runtime = createTestRuntime();
  const legitimate = await stageLocationPlan(runtime);
  const maliciousChanges = [
    {
      categoryId: "account_profile" as const,
      targetConsentState: "disabled" as const,
    },
    {
      categoryId: "fraud_abuse_signals" as const,
      targetConsentState: "disabled" as const,
    },
  ];
  const { hashConsentPlan } = await import("../lib/plans/hash-plan.ts");
  const maliciousPlan: StagedConsentPlan = {
    ...legitimate,
    changes: maliciousChanges,
    planHash: await hashConsentPlan({
      planId: legitimate.planId,
      revision: legitimate.revision,
      baseStateVersion: legitimate.baseStateVersion,
      changes: maliciousChanges,
    }),
  };
  const malformedStagedPlanStore = {
    ...runtime.stagedPlanStore,
    getState: () => ({ plan: maliciousPlan }),
    getSnapshot: () => ({ plan: maliciousPlan }),
  } as StagedPlanStore;
  const maliciousBinding = bindingFor(maliciousPlan);
  runtime.approvalStore.createApproval(maliciousBinding);
  const tools = createWebMcpTools({
    getState: runtime.privacyStore.getState,
    privacyStateStore: runtime.privacyStore,
    stagedPlanStore: malformedStagedPlanStore,
    approvalStore: runtime.approvalStore,
  });

  const before = stateSnapshot(runtime);
  const result = await executeTool<ToolSuccessResult<unknown> | ToolFailureResult>(
    findTool(tools, "apply_approved_consent_plan"),
    maliciousBinding,
  );
  assertFailure(result, "REQUIRED_PROCESSING_CANNOT_BE_DISABLED");
  assert.equal(runtime.privacyStore.getState().categories.account_profile.consentState, "required");
  assert.equal(runtime.privacyStore.getState().categories.fraud_abuse_signals.consentState, "required");
  assert.deepEqual(stateSnapshot(runtime), before);
});

test("apply recomputes the canonical plan hash instead of trusting stored staged metadata", async () => {
  const runtime = createTestRuntime();
  const legitimate = await stageLocationPlan(runtime);
  const tamperedPlan: StagedConsentPlan = {
    ...legitimate,
    planHash: "a".repeat(64),
  };
  const tamperedStagedPlanStore = {
    ...runtime.stagedPlanStore,
    getState: () => ({ plan: tamperedPlan }),
    getSnapshot: () => ({ plan: tamperedPlan }),
  } as StagedPlanStore;
  const binding = bindingFor(tamperedPlan);
  runtime.approvalStore.createApproval(binding);
  const tools = createWebMcpTools({
    getState: runtime.privacyStore.getState,
    privacyStateStore: runtime.privacyStore,
    stagedPlanStore: tamperedStagedPlanStore,
    approvalStore: runtime.approvalStore,
  });

  const before = stateSnapshot(runtime);
  const result = await executeTool<ToolSuccessResult<unknown> | ToolFailureResult>(
    findTool(tools, "apply_approved_consent_plan"),
    binding,
  );
  assertFailure(result, "PLAN_CHANGED_AFTER_APPROVAL");
  assert.equal(runtime.approvalStore.getState().grant?.status, "active");
  assert.deepEqual(stateSnapshot(runtime), before);
});

test("an unexpected post-claim transition failure releases the approval and preserves state", async () => {
  const runtime = createTestRuntime();
  const plan = await stageLocationPlan(runtime);
  const binding = bindingFor(plan);
  runtime.approvalStore.createApproval(binding);
  const failingStateStore = {
    ...runtime.privacyStore,
    applyConsentChanges: () => ({
      ok: false as const,
      state: runtime.privacyStore.getState(),
      error: {
        code: "REQUIRED_PROCESSING_CANNOT_BE_DISABLED" as const,
        message: "Injected transition failure for purity testing.",
      },
    }),
  } as PrivacyStateStore;
  const tools = createWebMcpTools({
    getState: runtime.privacyStore.getState,
    privacyStateStore: failingStateStore,
    stagedPlanStore: runtime.stagedPlanStore,
    approvalStore: runtime.approvalStore,
  });

  const before = stateSnapshot(runtime);
  const result = await executeTool<ToolSuccessResult<unknown> | ToolFailureResult>(
    findTool(tools, "apply_approved_consent_plan"),
    binding,
  );
  assertFailure(result, "REQUIRED_PROCESSING_CANNOT_BE_DISABLED");
  assert.equal(runtime.approvalStore.getState().grant?.status, "active");
  assert.deepEqual(runtime.approvalStore.getState().consumedBindings, []);
  assert.deepEqual(stateSnapshot(runtime), before);
});

test("a consumed approval rejects an exact replay without a second mutation", async () => {
  const runtime = createTestRuntime();
  const plan = await stageLocationPlan(runtime);
  const binding = bindingFor(plan);
  runtime.approvalStore.createApproval(binding);
  const first = await executeTool<ToolSuccessResult<unknown> | ToolFailureResult>(
    findTool(runtime.tools, "apply_approved_consent_plan"),
    binding,
  );
  assertSuccess(first);
  const afterFirst = stateSnapshot(runtime);

  const replay = await executeTool<ToolSuccessResult<unknown> | ToolFailureResult>(
    findTool(runtime.tools, "apply_approved_consent_plan"),
    binding,
  );
  assertFailure(replay, "APPROVAL_ALREADY_USED");
  assert.deepEqual(stateSnapshot(runtime), afterFirst);
  assert.equal(runtime.privacyStore.getState().stateVersion, 2);
});

test("concurrent-ish apply attempts can consume one approval only", async () => {
  const runtime = createTestRuntime();
  const plan = await stageLocationPlan(runtime);
  const binding = bindingFor(plan);
  runtime.approvalStore.createApproval(binding);

  const results = await Promise.all([
    executeTool<ToolSuccessResult<unknown> | ToolFailureResult>(
      findTool(runtime.tools, "apply_approved_consent_plan"),
      binding,
    ),
    executeTool<ToolSuccessResult<unknown> | ToolFailureResult>(
      findTool(runtime.tools, "apply_approved_consent_plan"),
      binding,
    ),
  ]);

  assert.equal(results.filter((result) => result.ok).length, 1);
  assert.equal(
    results.filter((result) => !result.ok)[0].error.code,
    "APPROVAL_ALREADY_USED",
  );
  assert.equal(runtime.privacyStore.getState().stateVersion, 2);
  assert.equal(runtime.privacyStore.getState().categories.location_history.consentState, "disabled");
});

test("explicit reapproval of an edited plan permits only the revised plan", async () => {
  const runtime = createTestRuntime();
  const plan = await stageLocationPlan(runtime);
  runtime.approvalStore.createApproval(bindingFor(plan));
  const edited = await runtime.stagedPlanStore.edit(
    {
      changes: [
        {
          categoryId: "marketing_profile",
          targetConsentState: "disabled",
        },
      ],
    },
    runtime.privacyStore.getState(),
  );
  assert.equal(edited.ok, true);
  if (!edited.ok || edited.data === null) {
    return;
  }
  runtime.approvalStore.createApproval(bindingFor(edited.data));

  const applied = await executeTool<ToolSuccessResult<Record<string, unknown>> | ToolFailureResult>(
    findTool(runtime.tools, "apply_approved_consent_plan"),
    bindingFor(edited.data),
  );
  assertSuccess(applied);
  assert.equal(runtime.privacyStore.getState().categories.marketing_profile.consentState, "disabled");
  assert.equal(runtime.privacyStore.getState().categories.location_history.consentState, "enabled");
  assert.equal(runtime.privacyStore.getState().stateVersion, 2);
});

test("restaging a new plan never reuses approval for the previous plan", async () => {
  const runtime = createTestRuntime();
  const first = await stageLocationPlan(runtime);
  runtime.approvalStore.createApproval(bindingFor(first));
  const secondResult = await executeTool<ToolSuccessResult<StagedConsentPlan> | ToolFailureResult>(
    findTool(runtime.tools, "stage_consent_plan"),
    {
      changes: [
        {
          categoryId: "marketing_profile",
          targetConsentState: "disabled",
        },
      ],
    },
  );
  assertSuccess(secondResult);
  assert.notEqual(secondResult.data.planId, first.planId);
  assert.equal(secondResult.data.revision, 1);

  const applySecond = await executeTool<ToolSuccessResult<unknown> | ToolFailureResult>(
    findTool(runtime.tools, "apply_approved_consent_plan"),
    bindingFor(secondResult.data),
  );
  assertFailure(applySecond, "PLAN_NOT_APPROVED");
  assert.equal(runtime.privacyStore.getState().stateVersion, 1);
  assert.equal(runtime.privacyStore.getState().categories.marketing_profile.consentState, "enabled");
});

test("reset clears actual, staged, approval, and replay state", async () => {
  const runtime = createTestRuntime();
  const plan = await stageLocationPlan(runtime);
  const binding = bindingFor(plan);
  runtime.approvalStore.createApproval(binding);
  const directChange = runtime.privacyStore.setCategoryConsentState(
    "marketing_profile",
    "disabled",
  );
  assert.equal(directChange.ok, true);

  runtime.privacyStore.reset();
  runtime.stagedPlanStore.reset();
  runtime.approvalStore.reset();

  assert.equal(getPrivacySummary(runtime.privacyStore.getState()).data.privacyScore, 54);
  assert.equal(runtime.privacyStore.getState().stateVersion, 1);
  assert.equal(runtime.stagedPlanStore.getState().plan, null);
  assert.deepEqual(runtime.approvalStore.getState(), getInitialApprovalState());
  const replay = await executeTool<ToolSuccessResult<unknown> | ToolFailureResult>(
    findTool(runtime.tools, "apply_approved_consent_plan"),
    binding,
  );
  assertFailure(replay, "NO_STAGED_PLAN");
  assert.equal(runtime.privacyStore.getState().stateVersion, 1);
});

test("reload lifecycle persists actual account state but starts with empty staged and approval stores", () => {
  const storage = createMemoryStorage();
  const firstPrivacyStore = createPrivacyStateStore({ storage });
  const directChange = firstPrivacyStore.setCategoryConsentState(
    "location_history",
    "disabled",
  );
  assert.equal(directChange.ok, true);

  const secondPrivacyStore = createPrivacyStateStore({ storage });
  const secondStagedPlanStore = createStagedPlanStore();
  const secondApprovalStore = createApprovalStore({
    clock: () => 1_000,
    generateApprovalId: () => "approval_reload",
  });
  secondPrivacyStore.hydrate();

  assert.equal(secondPrivacyStore.getState().stateVersion, 2);
  assert.equal(secondPrivacyStore.getState().categories.location_history.consentState, "disabled");
  assert.deepEqual(secondStagedPlanStore.getState(), { plan: null });
  assert.deepEqual(secondApprovalStore.getState(), getInitialApprovalState());
});

test("all eight tools have the final Phase 6 inventory and honest annotations", () => {
  const runtime = createTestRuntime();
  const names = runtime.tools.map((tool) => tool.name);

  assert.deepEqual(names, [
    "apply_approved_consent_plan",
    "explain_data_use",
    "export_privacy_receipt",
    "get_consent_state",
    "get_data_map",
    "get_privacy_summary",
    "preview_consent_plan",
    "stage_consent_plan",
  ]);
  assert.deepEqual(names, WEBMCP_TOOL_NAMES);
  assert.equal(new Set(names).size, 8);
  assert.deepEqual(
    runtime.tools.filter((tool) => tool.annotations?.readOnlyHint === true).map((tool) => tool.name),
    [
      "explain_data_use",
      "export_privacy_receipt",
      "get_consent_state",
      "get_data_map",
      "get_privacy_summary",
      "preview_consent_plan",
    ],
  );
  assert.deepEqual(
    runtime.tools.filter((tool) => tool.annotations?.readOnlyHint === false).map((tool) => tool.name),
    ["apply_approved_consent_plan", "stage_consent_plan"],
  );
  assert.equal(
    runtime.tools.find((tool) => tool.name === "apply_approved_consent_plan")?.annotations?.untrustedContentHint,
    undefined,
  );
  assert.equal(
    runtime.tools.some((tool) =>
      [
        "approve_plan",
        "approve_consent_plan",
        "confirm_plan",
        "mint_approval",
        "create_approval",
        "grant_approval",
        "approve",
        "confirm",
      ].includes(tool.name),
    ),
    false,
  );
});

test("apply description explains exact current-plan approval and its consequential side effect", () => {
  const runtime = createTestRuntime();
  const apply = findTool(runtime.tools, "apply_approved_consent_plan");

  assert.match(apply.description, /CURRENT staged privacy plan/i);
  assert.match(apply.description, /explicit human website/i);
  assert.match(apply.description, /planId.*revision.*planHash.*baseStateVersion/i);
  assert.match(apply.description, /cannot create approval/i);
  assert.match(apply.description, /mutat(e|es).*actual/i);
});

test("pure atomic transition applies three changes with one version increment and rejects required disables", () => {
  const state = getSeededPrivacyState();
  const result = applyConsentChanges(
    state,
    [
      { categoryId: "activity_history", targetConsentState: "disabled" },
      { categoryId: "location_history", targetConsentState: "disabled" },
      { categoryId: "analytics_data", targetConsentState: "disabled" },
    ],
    PRIVACY_CATALOG,
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.state.stateVersion, 2);
    assert.equal(result.state.categories.activity_history.consentState, "disabled");
    assert.equal(result.state.categories.location_history.consentState, "disabled");
    assert.equal(result.state.categories.analytics_data.consentState, "disabled");
  }
  assert.equal(state.stateVersion, 1);
  assert.equal(state.categories.activity_history.consentState, "enabled");

  const requiredResult = applyConsentChanges(
    state,
    [
      { categoryId: "activity_history", targetConsentState: "disabled" },
      { categoryId: "fraud_abuse_signals", targetConsentState: "disabled" },
    ],
    PRIVACY_CATALOG,
  );
  assert.equal(requiredResult.ok, false);
  if (!requiredResult.ok) {
    assert.equal(requiredResult.error.code, "REQUIRED_PROCESSING_CANNOT_BE_DISABLED");
    assert.deepEqual(requiredResult.state, state);
  }
  assert.equal(state.categories.fraud_abuse_signals.consentState, "required");
});

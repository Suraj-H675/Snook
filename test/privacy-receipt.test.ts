import assert from "node:assert/strict";
import test from "node:test";
import { APPROVAL_TTL_MS } from "../lib/approval/approval.ts";
import { getSeededPrivacyState } from "../lib/privacy/seed.ts";
import {
  parsePersistedPrivacyReceipt,
  PRIVACY_RECEIPT_STORAGE_KEY,
  PRIVACY_RECEIPT_STORAGE_SCHEMA_VERSION,
} from "../lib/receipts/persistence.ts";
import { hasAccountChangedSinceReceipt } from "../lib/receipts/create-receipt.ts";
import {
  createPrivacyReceiptStore,
  type PrivacyReceiptStore,
} from "../lib/state/receipt-store.ts";
import {
  createApprovalStore,
  getInitialApprovalState,
  type ApprovalStore,
} from "../lib/state/approval-store.ts";
import {
  createStagedPlanStore,
  type StagedPlanStore,
} from "../lib/state/staged-plan-store.ts";
import {
  createPrivacyStateStore,
  type PrivacyStateStore,
} from "../lib/state/store.ts";
import {
  createWebMcpTools,
} from "../lib/webmcp/register-tools.ts";
import type { StagedConsentPlan } from "../lib/plans/types.ts";
import type {
  ToolFailureResult,
  ToolSuccessResult,
} from "../lib/webmcp/results.ts";
import type { PrivacyReceipt } from "../lib/receipts/types.ts";

function createMemoryStorage() {
  const values = new Map<string, string>();

  return {
    getItem(key: string): string | null {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string): void {
      values.set(key, value);
    },
    removeItem(key: string): void {
      values.delete(key);
    },
    get value(): string | null {
      return values.values().next().value ?? null;
    },
  };
}

function createThrowingReceiptStorage() {
  return {
    getItem(_key: string): string | null {
      void _key;
      return null;
    },
    setItem(): void {
      throw new Error("receipt storage is unavailable");
    },
    removeItem(): void {
      throw new Error("receipt storage is unavailable");
    },
  };
}

interface ReceiptTestRuntime {
  readonly clock: { value: number };
  readonly stateStorage: ReturnType<typeof createMemoryStorage>;
  readonly receiptStorage: ReturnType<typeof createMemoryStorage>;
  readonly privacyStore: PrivacyStateStore;
  readonly receiptStore: PrivacyReceiptStore;
  readonly stagedPlanStore: StagedPlanStore;
  readonly approvalStore: ApprovalStore;
  readonly tools: readonly WebMCP.ModelContextTool[];
}

function createTestRuntime(): ReceiptTestRuntime {
  const clock = { value: 1_000 };
  const stateStorage = createMemoryStorage();
  const receiptStorage = createMemoryStorage();
  const privacyStore = createPrivacyStateStore({
    storage: stateStorage,
  });
  const receiptStore = createPrivacyReceiptStore({
    storage: receiptStorage,
  });
  const stagedPlanStore = createStagedPlanStore();
  let approvalSequence = 0;
  const approvalStore = createApprovalStore({
    clock: () => clock.value,
    generateApprovalId: () => {
      approvalSequence += 1;
      return `approval_test_${approvalSequence}`;
    },
  });
  let receiptSequence = 0;

  return {
    clock,
    stateStorage,
    receiptStorage,
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

function bindingFor(plan: StagedConsentPlan) {
  return {
    planId: plan.planId,
    revision: plan.revision,
    planHash: plan.planHash,
    baseStateVersion: plan.baseStateVersion,
  };
}

async function stageAndApprove(
  runtime: ReceiptTestRuntime,
): Promise<StagedConsentPlan> {
  const staged = await executeTool<
    ToolSuccessResult<StagedConsentPlan> | ToolFailureResult
  >(findTool(runtime.tools, "stage_consent_plan"), {
    changes: [
      {
        categoryId: "location_history",
        targetConsentState: "disabled",
      },
    ],
  });
  assertSuccess(staged);
  runtime.approvalStore.createApproval(bindingFor(staged.data));
  return staged.data;
}

async function exportReceipt(
  runtime: ReceiptTestRuntime,
): Promise<PrivacyReceipt | null> {
  const result = await executeTool<
    ToolSuccessResult<{ receipt: PrivacyReceipt; noChangesMade: true }> | ToolFailureResult
  >(findTool(runtime.tools, "export_privacy_receipt"), {});
  if (!result.ok) {
    assert.equal(result.error.code, "NO_PRIVACY_RECEIPT");
    return null;
  }
  return result.data.receipt;
}

async function applyApprovedLocationPlan(
  runtime: ReceiptTestRuntime,
): Promise<{ plan: StagedConsentPlan; receipt: PrivacyReceipt }> {
  const plan = await stageAndApprove(runtime);
  const applied = await executeTool<
    ToolSuccessResult<{ receiptGenerated: true; receiptId: string }> | ToolFailureResult
  >(findTool(runtime.tools, "apply_approved_consent_plan"), bindingFor(plan));
  assertSuccess(applied);
  const receipt = await exportReceipt(runtime);
  assert.ok(receipt);
  return { plan, receipt };
}

test("export_privacy_receipt returns a deterministic no-receipt error before apply", async () => {
  const runtime = createTestRuntime();

  const result = await executeTool<ToolFailureResult>(
    findTool(runtime.tools, "export_privacy_receipt"),
    {},
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "NO_PRIVACY_RECEIPT");
    assert.equal(
      result.error.message,
      "No completed privacy receipt is available. A receipt is created only after an explicitly approved staged plan is successfully applied.",
    );
  }
});

test("a successful approved location application creates an exact receipt", async () => {
  const runtime = createTestRuntime();
  const plan = await stageAndApprove(runtime);

  const applied = await executeTool<
    ToolSuccessResult<{ receiptGenerated: true; receiptId: string }> | ToolFailureResult
  >(findTool(runtime.tools, "apply_approved_consent_plan"), bindingFor(plan));

  assertSuccess(applied);
  assert.equal(applied.data.receiptGenerated, true);
  assert.equal(applied.data.receiptId, "receipt_test_1");

  const exported = await executeTool<
    ToolSuccessResult<{ receipt: PrivacyReceipt; noChangesMade: true }> | ToolFailureResult
  >(findTool(runtime.tools, "export_privacy_receipt"), {});

  assertSuccess(exported);
  assert.equal(exported.data.noChangesMade, true);
  assert.deepEqual(exported.data.receipt, {
    receiptId: "receipt_test_1",
    generatedAt: 1_000,
    source: "approved_webmcp_plan",
    appliedPlan: {
      planId: plan.planId,
      revision: 1,
      planHash: plan.planHash,
      baseStateVersion: 1,
    },
    previousStateVersion: 1,
    stateVersion: 2,
    changes: [
      {
        categoryId: "location_history",
        categoryName: "Location history",
        previousConsentState: "enabled",
        appliedConsentState: "disabled",
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
    privacyScoreDelta: 12,
    capabilityImpacts: plan.capabilityImpacts,
    sharingChanges: plan.sharingChanges,
    humanApprovalRequired: true,
    approvalConsumed: true,
    demoDisclaimer:
      "Fictional demo receipt: a structured browser-local record of the exact approved plan Snook applied in this demo. It is not compliance evidence, legal certification, or third-party attestation.",
  });
});

test("preview, staging, and approval do not create a receipt", async () => {
  const runtime = createTestRuntime();
  const preview = await executeTool<ToolSuccessResult<unknown> | ToolFailureResult>(
    findTool(runtime.tools, "preview_consent_plan"),
    {
      changes: [
        { categoryId: "location_history", targetConsentState: "disabled" },
      ],
    },
  );
  assertSuccess(preview);
  assert.equal(await exportReceipt(runtime), null);

  const plan = await stageAndApprove(runtime);
  assert.equal(await exportReceipt(runtime), null);
  assert.equal(runtime.approvalStore.getState().grant?.status, "active");
  assert.equal(plan.baseStateVersion, 1);
  assert.equal(await exportReceipt(runtime), null);
});

test("failed apply without approval creates no receipt", async () => {
  const runtime = createTestRuntime();
  const staged = await executeTool<
    ToolSuccessResult<StagedConsentPlan> | ToolFailureResult
  >(findTool(runtime.tools, "stage_consent_plan"), {
    changes: [
      { categoryId: "location_history", targetConsentState: "disabled" },
    ],
  });
  assertSuccess(staged);

  const result = await executeTool<ToolSuccessResult<unknown> | ToolFailureResult>(
    findTool(runtime.tools, "apply_approved_consent_plan"),
    bindingFor(staged.data),
  );
  assertFailure(result, "PLAN_NOT_APPROVED");
  assert.equal(await exportReceipt(runtime), null);
  assert.equal(runtime.privacyStore.getState().stateVersion, 1);
});

test("stale, edited, and expired failed applies create no receipt", async () => {
  const staleRuntime = createTestRuntime();
  const stalePlan = await stageAndApprove(staleRuntime);
  const directChange = staleRuntime.privacyStore.setCategoryConsentState(
    "marketing_profile",
    "disabled",
  );
  assert.equal(directChange.ok, true);
  const staleResult = await executeTool<ToolSuccessResult<unknown> | ToolFailureResult>(
    findTool(staleRuntime.tools, "apply_approved_consent_plan"),
    bindingFor(stalePlan),
  );
  assertFailure(staleResult, "STATE_CHANGED_SINCE_PREVIEW");
  assert.equal(await exportReceipt(staleRuntime), null);

  const editedRuntime = createTestRuntime();
  await stageAndApprove(editedRuntime);
  const edit = await editedRuntime.stagedPlanStore.edit(
    {
      changes: [
        { categoryId: "marketing_profile", targetConsentState: "disabled" },
      ],
    },
    editedRuntime.privacyStore.getState(),
  );
  assert.equal(edit.ok, true);
  if (edit.ok && edit.data) {
    const editedResult = await executeTool<
      ToolSuccessResult<unknown> | ToolFailureResult
    >(findTool(editedRuntime.tools, "apply_approved_consent_plan"), bindingFor(edit.data));
    assertFailure(editedResult, "PLAN_CHANGED_AFTER_APPROVAL");
  }
  assert.equal(await exportReceipt(editedRuntime), null);

  const expiredRuntime = createTestRuntime();
  const expiredPlan = await stageAndApprove(expiredRuntime);
  expiredRuntime.clock.value = 1_000 + APPROVAL_TTL_MS;
  const expiredResult = await executeTool<
    ToolSuccessResult<unknown> | ToolFailureResult
  >(findTool(expiredRuntime.tools, "apply_approved_consent_plan"), bindingFor(expiredPlan));
  assertFailure(expiredResult, "PLAN_EXPIRED");
  assert.equal(await exportReceipt(expiredRuntime), null);
});

test("a failed later apply preserves the previous completed receipt", async () => {
  const runtime = createTestRuntime();
  const first = await applyApprovedLocationPlan(runtime);

  const secondStage = await executeTool<
    ToolSuccessResult<StagedConsentPlan> | ToolFailureResult
  >(findTool(runtime.tools, "stage_consent_plan"), {
    changes: [
      { categoryId: "marketing_profile", targetConsentState: "disabled" },
    ],
  });
  assertSuccess(secondStage);
  const failed = await executeTool<ToolSuccessResult<unknown> | ToolFailureResult>(
    findTool(runtime.tools, "apply_approved_consent_plan"),
    bindingFor(secondStage.data),
  );
  assertFailure(failed, "PLAN_NOT_APPROVED");

  assert.deepEqual(await exportReceipt(runtime), first.receipt);
});

test("post-mutation receipt and callback failures do not report a false apply failure", async () => {
  const runtime = createTestRuntime();
  const plan = await stageAndApprove(runtime);
  const receiptStorage = createThrowingReceiptStorage();
  const receiptStore = createPrivacyReceiptStore({
    storage: receiptStorage,
  });
  let receiptNotifications = 0;
  receiptStore.subscribe(() => {
    receiptNotifications += 1;
    throw new Error("receipt notification failed");
  });
  let stagedNotifications = 0;
  runtime.stagedPlanStore.subscribe(() => {
    stagedNotifications += 1;
    throw new Error("staged-plan notification failed");
  });
  let privacyNotifications = 0;
  runtime.privacyStore.subscribe(() => {
    privacyNotifications += 1;
    throw new Error("privacy-state notification failed");
  });
  let approvalNotifications = 0;
  runtime.approvalStore.subscribe(() => {
    approvalNotifications += 1;
    throw new Error("approval notification failed");
  });
  let invocationNotifications = 0;
  let appliedNotifications = 0;

  const tools = createWebMcpTools({
    getState: runtime.privacyStore.getState,
    privacyStateStore: runtime.privacyStore,
    receiptStore,
    stagedPlanStore: runtime.stagedPlanStore,
    approvalStore: runtime.approvalStore,
    onToolInvoked: () => {
      invocationNotifications += 1;
      throw new Error("invocation notification failed");
    },
    onPlanApplied: () => {
      appliedNotifications += 1;
      throw new Error("apply notification failed");
    },
    clock: () => runtime.clock.value,
    generateReceiptId: () => "receipt_post_commit_failure",
  });

  const applied = await executeTool<
    ToolSuccessResult<{
      receiptGenerated: true;
      receiptId: string;
    }> | ToolFailureResult
  >(findTool(tools, "apply_approved_consent_plan"), bindingFor(plan));

  assertSuccess(applied);
  assert.equal(applied.data.receiptGenerated, true);
  assert.equal(applied.data.receiptId, "receipt_post_commit_failure");
  assert.equal(approvalNotifications, 1);
  assert.equal(privacyNotifications, 1);
  assert.equal(receiptNotifications, 1);
  assert.equal(stagedNotifications, 1);
  assert.equal(invocationNotifications, 1);
  assert.equal(appliedNotifications, 1);
  assert.equal(runtime.privacyStore.getState().stateVersion, 2);
  assert.equal(
    JSON.parse(runtime.stateStorage.value ?? "null").state.stateVersion,
    2,
  );
  assert.equal(
    runtime.privacyStore.getState().categories.location_history.consentState,
    "disabled",
  );
  assert.equal(runtime.approvalStore.getState().grant?.status, "consumed");
  assert.equal(runtime.stagedPlanStore.getState().plan, null);
  assert.equal(receiptStore.getState().receipt?.receiptId, "receipt_post_commit_failure");
  assert.equal(receiptStorage.getItem(PRIVACY_RECEIPT_STORAGE_KEY), null);

  const replay = await executeTool<
    ToolSuccessResult<unknown> | ToolFailureResult
  >(findTool(tools, "apply_approved_consent_plan"), bindingFor(plan));
  assertFailure(replay, "APPROVAL_ALREADY_USED");
  assert.equal(runtime.privacyStore.getState().stateVersion, 2);
});

test("receipt construction failure is reported before mutation and approval claim", async () => {
  const runtime = createTestRuntime();
  const plan = await stageAndApprove(runtime);
  const tools = createWebMcpTools({
    getState: runtime.privacyStore.getState,
    privacyStateStore: runtime.privacyStore,
    receiptStore: runtime.receiptStore,
    stagedPlanStore: runtime.stagedPlanStore,
    approvalStore: runtime.approvalStore,
    clock: () => {
      throw new Error("test clock failed");
    },
  });

  const result = await executeTool<
    ToolSuccessResult<unknown> | ToolFailureResult
  >(findTool(tools, "apply_approved_consent_plan"), bindingFor(plan));

  assertFailure(result, "RECEIPT_UNAVAILABLE");
  assert.equal(runtime.privacyStore.getState().stateVersion, 1);
  assert.equal(
    runtime.privacyStore.getState().categories.location_history.consentState,
    "enabled",
  );
  assert.equal(runtime.approvalStore.getState().grant?.status, "active");
  assert.equal(runtime.stagedPlanStore.getState().plan?.planId, plan.planId);
  assert.equal(runtime.receiptStore.getState().receipt, null);
});

test("the completed receipt agrees with all post-apply read tools", async () => {
  const runtime = createTestRuntime();
  const { receipt } = await applyApprovedLocationPlan(runtime);

  const summary = await executeTool<
    ToolSuccessResult<{ privacyScore: number; stateVersion: number }> | ToolFailureResult
  >(findTool(runtime.tools, "get_privacy_summary"), {});
  assertSuccess(summary);
  assert.equal(summary.data.privacyScore, receipt.after.privacyScore);
  assert.equal(summary.data.stateVersion, receipt.stateVersion);

  const consent = await executeTool<
    ToolSuccessResult<{
      stateVersion: number;
      categories: readonly { categoryId: string; consentState: string }[];
    }> | ToolFailureResult
  >(findTool(runtime.tools, "get_consent_state"), {});
  assertSuccess(consent);
  assert.equal(consent.data.stateVersion, receipt.stateVersion);
  assert.equal(
    consent.data.categories.find(
      (category) => category.categoryId === "location_history",
    )?.consentState,
    "disabled",
  );

  const dataMap = await executeTool<
    ToolSuccessResult<{
      stateVersion: number;
      categories: readonly { id: string; status: string }[];
    }> | ToolFailureResult
  >(findTool(runtime.tools, "get_data_map"), {});
  assertSuccess(dataMap);
  assert.equal(dataMap.data.stateVersion, receipt.stateVersion);
  assert.equal(
    dataMap.data.categories.find((category) => category.id === "location_history")?.status,
    "paused",
  );

  const explanation = await executeTool<
    ToolSuccessResult<{
      stateVersion: number;
      category: { consentState: string; processingActive: boolean };
    }> | ToolFailureResult
  >(findTool(runtime.tools, "explain_data_use"), {
    categoryId: "location_history",
  });
  assertSuccess(explanation);
  assert.equal(explanation.data.stateVersion, receipt.stateVersion);
  assert.equal(explanation.data.category.consentState, "disabled");
  assert.equal(explanation.data.category.processingActive, false);
});

test("a multi-change application creates one receipt for one version increment", async () => {
  const runtime = createTestRuntime();
  const staged = await executeTool<
    ToolSuccessResult<StagedConsentPlan> | ToolFailureResult
  >(findTool(runtime.tools, "stage_consent_plan"), {
    changes: [
      { categoryId: "activity_history", targetConsentState: "disabled" },
      { categoryId: "location_history", targetConsentState: "disabled" },
      { categoryId: "analytics_data", targetConsentState: "disabled" },
    ],
  });
  assertSuccess(staged);
  runtime.approvalStore.createApproval(bindingFor(staged.data));

  const applied = await executeTool<
    ToolSuccessResult<{ receiptGenerated: true }> | ToolFailureResult
  >(findTool(runtime.tools, "apply_approved_consent_plan"), bindingFor(staged.data));
  assertSuccess(applied);
  const receipt = await exportReceipt(runtime);
  assert.ok(receipt);
  assert.equal(runtime.privacyStore.getState().stateVersion, 2);
  assert.equal(receipt.previousStateVersion, 1);
  assert.equal(receipt.stateVersion, 2);
  assert.equal(receipt.before.privacyScore, 54);
  assert.equal(receipt.after.privacyScore, 77);
  assert.deepEqual(
    receipt.changes.map((change) => [change.categoryId, change.appliedConsentState]),
    [
      ["activity_history", "disabled"],
      ["location_history", "disabled"],
      ["analytics_data", "disabled"],
    ],
  );
});

test("the latest receipt and actual state hydrate independently while staging and approval stay empty", async () => {
  const runtime = createTestRuntime();
  const { receipt } = await applyApprovedLocationPlan(runtime);

  const secondReceiptStore = createPrivacyReceiptStore({
    storage: runtime.receiptStorage,
  });
  const secondPrivacyStore = createPrivacyStateStore({
    storage: runtime.stateStorage,
  });
  secondReceiptStore.hydrate();
  secondPrivacyStore.hydrate();

  assert.deepEqual(secondReceiptStore.getState().receipt, receipt);
  assert.equal(secondPrivacyStore.getState().stateVersion, 2);
  assert.equal(
    secondPrivacyStore.getState().categories.location_history.consentState,
    "disabled",
  );
  assert.equal(createStagedPlanStore().getState().plan, null);
  assert.deepEqual(
    createApprovalStore({
      clock: () => 1_000,
      generateApprovalId: () => "approval_reload",
    }).getState(),
    getInitialApprovalState(),
  );
});

test("malformed or incompatible persisted receipts fall back to no receipt", async () => {
  const validRuntime = createTestRuntime();
  const { receipt } = await applyApprovedLocationPlan(validRuntime);
  const invalidRawValues = [
    "not json",
    JSON.stringify({
      schemaVersion: PRIVACY_RECEIPT_STORAGE_SCHEMA_VERSION + 1,
      receipt,
    }),
    JSON.stringify({
      schemaVersion: PRIVACY_RECEIPT_STORAGE_SCHEMA_VERSION,
      receipt: { ...receipt, stateVersion: 99 },
    }),
    JSON.stringify({
      schemaVersion: PRIVACY_RECEIPT_STORAGE_SCHEMA_VERSION,
      receipt: { ...receipt, appliedPlan: { ...receipt.appliedPlan, planHash: "bad" } },
    }),
    JSON.stringify({
      schemaVersion: PRIVACY_RECEIPT_STORAGE_SCHEMA_VERSION,
      receipt: { ...receipt, generatedAt: Number.MAX_SAFE_INTEGER },
    }),
    JSON.stringify({
      schemaVersion: PRIVACY_RECEIPT_STORAGE_SCHEMA_VERSION,
      receipt: { ...receipt, approvalId: "must-not-persist" },
    }),
  ];

  for (const raw of invalidRawValues) {
    const storage = createMemoryStorage();
    storage.setItem(PRIVACY_RECEIPT_STORAGE_KEY, raw);
    const store = createPrivacyReceiptStore({ storage });
    store.hydrate();
    assert.equal(store.getState().receipt, null);
    assert.equal(parsePersistedPrivacyReceipt(raw), null);
    assert.equal(storage.getItem(PRIVACY_RECEIPT_STORAGE_KEY), null);
  }
});

test("a second successful application replaces the one latest receipt", async () => {
  const runtime = createTestRuntime();
  const first = await applyApprovedLocationPlan(runtime);

  const staged = await executeTool<
    ToolSuccessResult<StagedConsentPlan> | ToolFailureResult
  >(findTool(runtime.tools, "stage_consent_plan"), {
    changes: [
      { categoryId: "marketing_profile", targetConsentState: "disabled" },
    ],
  });
  assertSuccess(staged);
  runtime.approvalStore.createApproval(bindingFor(staged.data));
  const applied = await executeTool<ToolSuccessResult<unknown> | ToolFailureResult>(
    findTool(runtime.tools, "apply_approved_consent_plan"),
    bindingFor(staged.data),
  );
  assertSuccess(applied);
  const second = await exportReceipt(runtime);
  assert.ok(second);
  assert.notEqual(second.receiptId, first.receipt.receiptId);
  assert.equal(second.appliedPlan.planId, staged.data.planId);
  assert.equal(second.stateVersion, 3);
  assert.equal(JSON.parse(runtime.receiptStorage.value ?? "null").history, undefined);
});

test("direct human toggles do not rewrite a completed receipt and expose its historical status", async () => {
  const runtime = createTestRuntime();
  const { receipt } = await applyApprovedLocationPlan(runtime);
  assert.equal(hasAccountChangedSinceReceipt(2, receipt), false);

  const directChange = runtime.privacyStore.setCategoryConsentState(
    "marketing_profile",
    "disabled",
  );
  assert.equal(directChange.ok, true);
  assert.equal(runtime.privacyStore.getState().stateVersion, 3);
  assert.equal(hasAccountChangedSinceReceipt(3, receipt), true);
  assert.deepEqual(await exportReceipt(runtime), receipt);
});

test("reset clears the actual account and persisted latest receipt", async () => {
  const runtime = createTestRuntime();
  await applyApprovedLocationPlan(runtime);
  const staged = await executeTool<
    ToolSuccessResult<StagedConsentPlan> | ToolFailureResult
  >(findTool(runtime.tools, "stage_consent_plan"), {
    changes: [
      { categoryId: "marketing_profile", targetConsentState: "disabled" },
    ],
  });
  assertSuccess(staged);
  runtime.approvalStore.createApproval(bindingFor(staged.data));

  runtime.privacyStore.reset();
  runtime.stagedPlanStore.reset();
  runtime.approvalStore.reset();
  runtime.receiptStore.reset();

  assert.deepEqual(runtime.privacyStore.getState(), getSeededPrivacyState());
  assert.equal(runtime.stagedPlanStore.getState().plan, null);
  assert.deepEqual(runtime.approvalStore.getState(), getInitialApprovalState());
  assert.equal(runtime.receiptStore.getState().receipt, null);
  assert.equal(runtime.receiptStorage.getItem(PRIVACY_RECEIPT_STORAGE_KEY), null);
  assert.equal(await exportReceipt(runtime), null);
});

test("replaying a successful apply fails and preserves its original receipt", async () => {
  const runtime = createTestRuntime();
  const { plan, receipt } = await applyApprovedLocationPlan(runtime);
  const replay = await executeTool<ToolSuccessResult<unknown> | ToolFailureResult>(
    findTool(runtime.tools, "apply_approved_consent_plan"),
    bindingFor(plan),
  );
  assertFailure(replay, "APPROVAL_ALREADY_USED");
  assert.deepEqual(await exportReceipt(runtime), receipt);
  assert.equal(runtime.privacyStore.getState().stateVersion, 2);
});

test("export accepts only an empty object and is read-only", async () => {
  const runtime = createTestRuntime();
  const invalid = await executeTool<ToolSuccessResult<unknown> | ToolFailureResult>(
    findTool(runtime.tools, "export_privacy_receipt"),
    { receiptId: "anything" },
  );
  assertFailure(invalid, "INVALID_RECEIPT_INPUT");

  const { receipt } = await applyApprovedLocationPlan(runtime);
  const beforeState = runtime.privacyStore.getState();
  const beforeStateStorage = runtime.stateStorage.value;
  const beforeReceiptStorage = runtime.receiptStorage.value;
  const beforeApproval = runtime.approvalStore.getState();
  const beforeStaged = runtime.stagedPlanStore.getState();
  const exported = await exportReceipt(runtime);
  assert.deepEqual(exported, receipt);
  assert.deepEqual(runtime.privacyStore.getState(), beforeState);
  assert.equal(runtime.stateStorage.value, beforeStateStorage);
  assert.equal(runtime.receiptStorage.value, beforeReceiptStorage);
  assert.deepEqual(runtime.approvalStore.getState(), beforeApproval);
  assert.deepEqual(runtime.stagedPlanStore.getState(), beforeStaged);
  assert.deepEqual(runtime.receiptStore.getState().receipt, receipt);
});

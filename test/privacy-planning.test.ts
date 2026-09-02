import assert from "node:assert/strict";
import test from "node:test";
import { PRIVACY_CATALOG } from "../lib/privacy/catalog.ts";
import { getPrivacyScoreBreakdown } from "../lib/privacy/scoring.ts";
import { getSeededPrivacyState } from "../lib/privacy/seed.ts";
import {
  createStagedPlanStore,
  getStagedPlanValidity,
} from "../lib/state/staged-plan-store.ts";
import { createPrivacyStateStore } from "../lib/state/store.ts";
import { setCategoryConsentState } from "../lib/state/transitions.ts";
import { createPreviewConsentPlanTool } from "../lib/webmcp/tools/preview-consent-plan.ts";
import { createStageConsentPlanTool } from "../lib/webmcp/tools/stage-consent-plan.ts";
import { createPrivacySummaryTool } from "../lib/webmcp/tools/get-privacy-summary.ts";
import type { PrivacySummaryResult } from "../lib/privacy/types.ts";
import type { PreviewConsentPlanResult } from "../lib/webmcp/tools/preview-consent-plan.ts";
import type { StageConsentPlanResult } from "../lib/webmcp/tools/stage-consent-plan.ts";

async function executePreview(
  input: unknown,
  state = getSeededPrivacyState(),
): Promise<PreviewConsentPlanResult> {
  const tool = createPreviewConsentPlanTool(undefined, () => state);
  return (await tool.execute(input as Record<string, unknown>, {
    signal: new AbortController().signal,
  })) as PreviewConsentPlanResult;
}

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

test("preview_consent_plan estimates disabling location without mutating account state", async () => {
  const state = getSeededPrivacyState();
  const result = await executePreview({
    changes: [
      {
        categoryId: "location_history",
        targetConsentState: "disabled",
      },
    ],
  }, state);

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.data.baseStateVersion, 1);
  assert.equal(result.data.before.privacyScore, 54);
  assert.equal(result.data.after.privacyScore, 66);
  assert.equal(result.data.privacyScoreDelta, 12);
  assert.deepEqual(result.data.changes, [
    {
      categoryId: "location_history",
      targetConsentState: "disabled",
    },
  ]);
  assert.equal(result.data.noChangesApplied, true);
  assert.equal(state.stateVersion, 1);
  assert.equal(state.categories.location_history.consentState, "enabled");
  assert.equal(getPrivacyScoreBreakdown(state).score, 54);
});

test("preview is pure across account, staged-plan, and persistence state", async () => {
  const storage = createMemoryStorage();
  const privacyStore = createPrivacyStateStore({ storage });
  const stagedPlanStore = createStagedPlanStore();
  const beforeState = privacyStore.getState();
  const preview = createPreviewConsentPlanTool(
    undefined,
    privacyStore.getState,
  );

  const result = (await preview.execute(
    {
      changes: [
        { categoryId: "location_history", targetConsentState: "disabled" },
      ],
    },
    { signal: new AbortController().signal },
  )) as PreviewConsentPlanResult;

  assert.equal(result.ok, true);
  assert.deepEqual(privacyStore.getState(), beforeState);
  assert.equal(getPrivacyScoreBreakdown(privacyStore.getState()).score, 54);
  assert.equal(storage.value, null);
  assert.deepEqual(stagedPlanStore.getState(), { plan: null });
});

test("read tools continue to report actual state after a hypothetical plan is staged", async () => {
  const privacyStore = createPrivacyStateStore({ storage: createMemoryStorage() });
  const stagedPlanStore = createStagedPlanStore();
  const stage = createStageConsentPlanTool(
    undefined,
    privacyStore.getState,
    stagedPlanStore,
  );
  const staged = (await stage.execute(
    {
      changes: [
        { categoryId: "location_history", targetConsentState: "disabled" },
      ],
    },
    { signal: new AbortController().signal },
  )) as StageConsentPlanResult;
  assert.equal(staged.ok, true);
  if (!staged.ok) {
    return;
  }

  const summaryTool = createPrivacySummaryTool(undefined, privacyStore.getState);
  const actual = (await summaryTool.execute(
    {},
    { signal: new AbortController().signal },
  )) as PrivacySummaryResult;

  assert.equal(actual.ok, true);
  if (actual.ok) {
    assert.equal(actual.data.privacyScore, 54);
    assert.equal(actual.data.stateVersion, 1);
    assert.ok(
      actual.data.enabledOptionalProcessingCategories.includes(
        "location_history",
      ),
    );
  }
  assert.equal(staged.data.after.privacyScore, 66);
  assert.equal(privacyStore.getState().stateVersion, 1);
});

test("stage_consent_plan creates a reviewable plan without changing actual state", async () => {
  const storage = createMemoryStorage();
  const privacyStore = createPrivacyStateStore({ storage });
  const state = privacyStore.getState();
  const stagedPlanStore = createStagedPlanStore();
  const tool = createStageConsentPlanTool(
    undefined,
    privacyStore.getState,
    stagedPlanStore,
  );

  const result = (await tool.execute(
    {
      changes: [
        {
          categoryId: "location_history",
          targetConsentState: "disabled",
        },
      ],
    },
    { signal: new AbortController().signal },
  )) as StageConsentPlanResult;

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.data.planId, "plan_1");
  assert.equal(result.data.revision, 1);
  assert.equal(result.data.baseStateVersion, 1);
  assert.match(result.data.planHash, /^[0-9a-f]{64}$/);
  assert.equal(result.data.after.privacyScore, 66);
  assert.deepEqual(stagedPlanStore.getState().plan, result.data);
  assert.equal(state.stateVersion, 1);
  assert.equal(state.categories.location_history.consentState, "enabled");
  assert.equal(getPrivacyScoreBreakdown(state).score, 54);
  assert.equal(storage.value, null);
  assert.equal(PRIVACY_CATALOG.categories.location_history.controllable, true);
});

test("planning accepts an optional enable request from a disabled account state", async () => {
  const seeded = getSeededPrivacyState();
  const disabledResult = setCategoryConsentState(
    seeded,
    "location_history",
    "disabled",
  );
  assert.equal(disabledResult.ok, true);
  if (!disabledResult.ok) {
    return;
  }

  const result = await executePreview(
    {
      changes: [
        {
          categoryId: "location_history",
          targetConsentState: "enabled",
        },
      ],
    },
    disabledResult.state,
  );

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.deepEqual(result.data.changes, [
    {
      categoryId: "location_history",
      targetConsentState: "enabled",
    },
  ]);
  assert.equal(result.data.before.privacyScore, 66);
  assert.equal(result.data.after.privacyScore, 54);
  assert.equal(result.data.privacyScoreDelta, -12);
  assert.ok(
    result.data.impacts.some(
      (impact) =>
        impact.effect === "quality_restored" &&
        impact.description.includes("again"),
    ),
  );
});

test("planning validation rejects invalid, unsafe, duplicate, empty, and malformed changes", async () => {
  const invalidCategory = await executePreview({
    changes: [
      { categoryId: "location", targetConsentState: "disabled" },
    ],
  });
  assert.equal(invalidCategory.ok, false);
  if (!invalidCategory.ok) {
    assert.equal(invalidCategory.error.code, "INVALID_DATA_CATEGORY");
  }

  const requiredDisable = await executePreview({
    changes: [
      {
        categoryId: "fraud_abuse_signals",
        targetConsentState: "disabled",
      },
    ],
  });
  assert.equal(requiredDisable.ok, false);
  if (!requiredDisable.ok) {
    assert.equal(
      requiredDisable.error.code,
      "REQUIRED_PROCESSING_CANNOT_BE_DISABLED",
    );
  }

  const accountRequiredDisable = await executePreview({
    changes: [
      {
        categoryId: "account_profile",
        targetConsentState: "disabled",
      },
    ],
  });
  assert.equal(accountRequiredDisable.ok, false);
  if (!accountRequiredDisable.ok) {
    assert.equal(
      accountRequiredDisable.error.code,
      "REQUIRED_PROCESSING_CANNOT_BE_DISABLED",
    );
  }

  const duplicate = await executePreview({
    changes: [
      { categoryId: "location_history", targetConsentState: "disabled" },
      { categoryId: "location_history", targetConsentState: "enabled" },
    ],
  });
  assert.equal(duplicate.ok, false);
  if (!duplicate.ok) {
    assert.equal(duplicate.error.code, "INVALID_PLAN_INPUT");
  }

  const empty = await executePreview({ changes: [] });
  assert.equal(empty.ok, false);
  if (!empty.ok) {
    assert.equal(empty.error.code, "INVALID_PLAN_INPUT");
  }

  const malformedTarget = await executePreview({
    changes: [
      { categoryId: "location_history", targetConsentState: "paused" },
    ],
  });
  assert.equal(malformedTarget.ok, false);
  if (!malformedTarget.ok) {
    assert.equal(malformedTarget.error.code, "INVALID_PLAN_INPUT");
  }

  const malformedStructure = await executePreview({
    changes: [{ categoryId: "location_history" }],
  });
  assert.equal(malformedStructure.ok, false);
  if (!malformedStructure.ok) {
    assert.equal(malformedStructure.error.code, "INVALID_PLAN_INPUT");
  }

  const extraProperty = await executePreview({
    changes: [
      {
        categoryId: "location_history",
        targetConsentState: "disabled",
        rationale: "not accepted by the Phase 4 contract",
      },
    ],
  });
  assert.equal(extraProperty.ok, false);
  if (!extraProperty.ok) {
    assert.equal(extraProperty.error.code, "INVALID_PLAN_INPUT");
  }
});

test("normalization removes mixed no-ops and rejects all-no-op plans", async () => {
  const mixed = await executePreview({
    changes: [
      { categoryId: "marketing_profile", targetConsentState: "enabled" },
      { categoryId: "location_history", targetConsentState: "disabled" },
    ],
  });
  assert.equal(mixed.ok, true);
  if (mixed.ok) {
    assert.deepEqual(mixed.data.changes, [
      { categoryId: "location_history", targetConsentState: "disabled" },
    ]);
  }

  const allNoOp = await executePreview({
    changes: [
      { categoryId: "marketing_profile", targetConsentState: "enabled" },
      { categoryId: "location_history", targetConsentState: "enabled" },
    ],
  });
  assert.equal(allNoOp.ok, false);
  if (!allNoOp.ok) {
    assert.equal(allNoOp.error.code, "NO_VALID_CHANGES");
  }
});

test("preview exposes catalog-derived capability and sharing trade-offs", async () => {
  const result = await executePreview({
    changes: [
      { categoryId: "location_history", targetConsentState: "disabled" },
    ],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.deepEqual(result.data.after.thirdPartySharing, ["analytics_partner"]);
  assert.deepEqual(result.data.sharingChanges, [
    {
      id: "location_history:recipient:analytics_partner",
      categoryId: "location_history",
      categoryName: "Location history",
      recipientId: "analytics_partner",
      recipientName: "Analytics partner",
      purposeIds: ["product_analytics"],
      beforeActive: true,
      afterActive: false,
      change: "stops",
    },
  ]);

  assert.deepEqual(
    result.data.capabilityImpacts
      .filter((impact) =>
        [
          "recommendation_feed",
          "nearby_discovery",
          "personalized_ranking",
        ].includes(impact.capabilityId),
      )
      .map(({ capabilityId, before, after, change }) => ({
        capabilityId,
        before,
        after,
        change,
      })),
    [
      {
        capabilityId: "recommendation_feed",
        before: "available",
        after: "degraded",
        change: "degraded",
      },
      {
        capabilityId: "nearby_discovery",
        before: "available",
        after: "unavailable",
        change: "unavailable",
      },
      {
        capabilityId: "personalized_ranking",
        before: "available",
        after: "available",
        change: "unaffected",
      },
    ],
  );
  assert.ok(
    result.data.warnings.some(
      (warning) =>
        warning.capabilityId === "recommendation_feed" &&
        warning.effect === "quality_reduced",
    ),
  );
});

test("disabling every analytics sharing source removes the partner from hypothetical sharing", async () => {
  const result = await executePreview({
    changes: [
      { categoryId: "activity_history", targetConsentState: "disabled" },
      { categoryId: "location_history", targetConsentState: "disabled" },
      { categoryId: "analytics_data", targetConsentState: "disabled" },
    ],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.data.before.privacyScore, 54);
  assert.equal(result.data.after.privacyScore, 77);
  assert.equal(result.data.privacyScoreDelta, 23);
  assert.deepEqual(result.data.after.thirdPartySharing, []);
  assert.deepEqual(
    result.data.sharingChanges.map(({ categoryId, change }) => ({
      categoryId,
      change,
    })),
    [
      { categoryId: "activity_history", change: "stops" },
      { categoryId: "location_history", change: "stops" },
      { categoryId: "analytics_data", change: "stops" },
    ],
  );
});

test("restaging replaces the active plan with a new identity and fresh revision", async () => {
  const state = getSeededPrivacyState();
  const stagedPlanStore = createStagedPlanStore();
  const tool = createStageConsentPlanTool(
    undefined,
    () => state,
    stagedPlanStore,
  );

  const first = (await tool.execute(
    {
      changes: [
        { categoryId: "location_history", targetConsentState: "disabled" },
      ],
    },
    { signal: new AbortController().signal },
  )) as StageConsentPlanResult;
  const second = (await tool.execute(
    {
      changes: [
        { categoryId: "marketing_profile", targetConsentState: "disabled" },
      ],
    },
    { signal: new AbortController().signal },
  )) as StageConsentPlanResult;

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  if (!first.ok || !second.ok) {
    return;
  }

  assert.equal(first.data.planId, "plan_1");
  assert.equal(first.data.revision, 1);
  assert.equal(second.data.planId, "plan_2");
  assert.equal(second.data.revision, 1);
  assert.notEqual(first.data.planHash, second.data.planHash);
  assert.deepEqual(stagedPlanStore.getState().plan, second.data);
  assert.equal(state.stateVersion, 1);
  assert.equal(getStagedPlanValidity(second.data, state.stateVersion), "current");
});

test("equivalent change order normalizes to the same plan content and hash", async () => {
  const state = getSeededPrivacyState();
  const firstStore = createStagedPlanStore();
  const secondStore = createStagedPlanStore();
  const firstTool = createStageConsentPlanTool(undefined, () => state, firstStore);
  const secondTool = createStageConsentPlanTool(undefined, () => state, secondStore);

  const first = (await firstTool.execute(
    {
      changes: [
        { categoryId: "marketing_profile", targetConsentState: "disabled" },
        { categoryId: "location_history", targetConsentState: "disabled" },
      ],
    },
    { signal: new AbortController().signal },
  )) as StageConsentPlanResult;
  const second = (await secondTool.execute(
    {
      changes: [
        { categoryId: "location_history", targetConsentState: "disabled" },
        { categoryId: "marketing_profile", targetConsentState: "disabled" },
      ],
    },
    { signal: new AbortController().signal },
  )) as StageConsentPlanResult;

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  if (!first.ok || !second.ok) {
    return;
  }

  assert.deepEqual(first.data.changes, second.data.changes);
  assert.equal(first.data.planHash, second.data.planHash);
});

test("human editing keeps plan identity, increments revision, and recalculates the proposal", async () => {
  const state = getSeededPrivacyState();
  const stagedPlanStore = createStagedPlanStore();
  const tool = createStageConsentPlanTool(
    undefined,
    () => state,
    stagedPlanStore,
  );

  const staged = (await tool.execute(
    {
      changes: [
        { categoryId: "marketing_profile", targetConsentState: "disabled" },
        { categoryId: "analytics_data", targetConsentState: "disabled" },
        { categoryId: "recommendation_profile", targetConsentState: "disabled" },
      ],
    },
    { signal: new AbortController().signal },
  )) as StageConsentPlanResult;
  assert.equal(staged.ok, true);
  if (!staged.ok) {
    return;
  }

  const edited = await stagedPlanStore.edit(
    {
      changes: [
        { categoryId: "marketing_profile", targetConsentState: "disabled" },
        { categoryId: "analytics_data", targetConsentState: "disabled" },
      ],
    },
    state,
  );

  assert.equal(edited.ok, true);
  if (!edited.ok || edited.data === null) {
    return;
  }

  assert.equal(edited.data.planId, staged.data.planId);
  assert.equal(edited.data.revision, 2);
  assert.notEqual(edited.data.planHash, staged.data.planHash);
  assert.deepEqual(edited.data.changes, [
    { categoryId: "analytics_data", targetConsentState: "disabled" },
    { categoryId: "marketing_profile", targetConsentState: "disabled" },
  ]);
  assert.equal(staged.data.after.privacyScore, 73);
  assert.equal(edited.data.after.privacyScore, 65);
  assert.equal(edited.data.capabilityImpacts.find(
    (impact) => impact.capabilityId === "personalized_ranking",
  )?.after, "available");
  assert.equal(state.stateVersion, 1);
  assert.equal(getPrivacyScoreBreakdown(state).score, 54);
});

test("removing the final proposal clears the staged plan", async () => {
  const state = getSeededPrivacyState();
  const stagedPlanStore = createStagedPlanStore();
  const tool = createStageConsentPlanTool(
    undefined,
    () => state,
    stagedPlanStore,
  );

  const staged = (await tool.execute(
    {
      changes: [
        { categoryId: "location_history", targetConsentState: "disabled" },
      ],
    },
    { signal: new AbortController().signal },
  )) as StageConsentPlanResult;
  assert.equal(staged.ok, true);

  const edited = await stagedPlanStore.edit(
    {
      changes: [
        { categoryId: "location_history", targetConsentState: "enabled" },
      ],
    },
    state,
  );

  assert.deepEqual(edited, { ok: true, data: null });
  assert.deepEqual(stagedPlanStore.getState(), { plan: null });
  assert.equal(state.stateVersion, 1);
});

test("a staged plan becomes stale after a direct human account change and cannot be edited", async () => {
  let state = getSeededPrivacyState();
  const stagedPlanStore = createStagedPlanStore();
  const tool = createStageConsentPlanTool(
    undefined,
    () => state,
    stagedPlanStore,
  );

  const staged = (await tool.execute(
    {
      changes: [
        { categoryId: "location_history", targetConsentState: "disabled" },
      ],
    },
    { signal: new AbortController().signal },
  )) as StageConsentPlanResult;
  assert.equal(staged.ok, true);
  if (!staged.ok) {
    return;
  }

  const directChange = setCategoryConsentState(
    state,
    "marketing_profile",
    "disabled",
  );
  assert.equal(directChange.ok, true);
  if (!directChange.ok) {
    return;
  }
  state = directChange.state;

  assert.equal(
    getStagedPlanValidity(stagedPlanStore.getState().plan, state.stateVersion),
    "stale",
  );
  const edit = await stagedPlanStore.edit(
    {
      changes: [
        { categoryId: "location_history", targetConsentState: "disabled" },
      ],
    },
    state,
  );
  assert.equal(edit.ok, false);
  if (!edit.ok) {
    assert.equal(edit.error.code, "STATE_CHANGED_SINCE_PREVIEW");
  }
  assert.equal(stagedPlanStore.getState().plan?.revision, 1);
  assert.equal(stagedPlanStore.getState().plan?.planHash, staged.data.planHash);
  assert.equal(state.stateVersion, 2);
});

test("reset restores the seed, clears the staged plan, and leaves plan state unpersisted", async () => {
  const storage = createMemoryStorage();
  const privacyStore = createPrivacyStateStore({ storage });
  const stagedPlanStore = createStagedPlanStore();
  const stage = createStageConsentPlanTool(
    undefined,
    privacyStore.getState,
    stagedPlanStore,
  );

  const changed = privacyStore.setCategoryConsentState(
    "marketing_profile",
    "disabled",
  );
  assert.equal(changed.ok, true);

  const staged = (await stage.execute(
    {
      changes: [
        { categoryId: "location_history", targetConsentState: "disabled" },
      ],
    },
    { signal: new AbortController().signal },
  )) as StageConsentPlanResult;
  assert.equal(staged.ok, true);
  assert.notEqual(stagedPlanStore.getState().plan, null);

  privacyStore.reset();
  stagedPlanStore.reset();

  assert.deepEqual(privacyStore.getState(), getSeededPrivacyState());
  assert.equal(storage.value !== null, true);
  assert.deepEqual(JSON.parse(storage.value ?? "null").state, getSeededPrivacyState());
  assert.deepEqual(stagedPlanStore.getState(), { plan: null });
  assert.deepEqual(createStagedPlanStore().getState(), { plan: null });

  const restaged = (await stage.execute(
    {
      changes: [
        { categoryId: "location_history", targetConsentState: "disabled" },
      ],
    },
    { signal: new AbortController().signal },
  )) as StageConsentPlanResult;
  assert.equal(restaged.ok, true);
  if (restaged.ok) {
    assert.equal(restaged.data.planId, "plan_2");
    assert.equal(restaged.data.revision, 1);
  }
});

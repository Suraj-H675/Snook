import assert from "node:assert/strict";
import test from "node:test";
import { getPrivacySummary } from "../lib/privacy/engine.ts";
import { getSeededPrivacyState } from "../lib/privacy/seed.ts";
import {
  PRIVACY_STATE_STORAGE_KEY,
  parsePersistedPrivacyState,
} from "../lib/state/persistence.ts";
import {
  createPrivacyStateStore,
  privacyStateStore,
} from "../lib/state/store.ts";
import { createPrivacySummaryTool } from "../lib/webmcp/tools/get-privacy-summary.ts";
import type { PrivacySummaryResult } from "../lib/privacy/types.ts";

function createMemoryStorage() {
  let value: string | null = null;

  return {
    getItem(key: string): string | null {
      assert.equal(key, PRIVACY_STATE_STORAGE_KEY);
      return value;
    },
    setItem(key: string, nextValue: string): void {
      assert.equal(key, PRIVACY_STATE_STORAGE_KEY);
      value = nextValue;
    },
    get value(): string | null {
      return value;
    },
  };
}

test("the store persists validated human changes and hydrates them into a new store", () => {
  const storage = createMemoryStorage();
  const firstStore = createPrivacyStateStore({ storage });

  const result = firstStore.setCategoryConsentState(
    "location_history",
    "disabled",
  );
  assert.equal(result.ok, true);
  assert.equal(firstStore.getState().stateVersion, 2);
  assert.equal(getPrivacySummary(firstStore.getState()).data.privacyScore, 66);
  assert.ok(storage.value);
  assert.deepEqual(parsePersistedPrivacyState(storage.value), firstStore.getState());

  const secondStore = createPrivacyStateStore({ storage });
  assert.equal(secondStore.getState().stateVersion, 1);
  secondStore.hydrate();
  assert.deepEqual(secondStore.getState(), firstStore.getState());
});

test("reset writes the canonical seed and notifies subscribers", () => {
  const storage = createMemoryStorage();
  const store = createPrivacyStateStore({ storage });
  let notifications = 0;
  const unsubscribe = store.subscribe(() => {
    notifications += 1;
  });

  store.setCategoryConsentState("marketing_profile", "disabled");
  const resetState = store.reset();
  unsubscribe();

  assert.deepEqual(resetState, getSeededPrivacyState());
  assert.deepEqual(store.getState(), getSeededPrivacyState());
  assert.deepEqual(parsePersistedPrivacyState(storage.value), getSeededPrivacyState());
  assert.equal(notifications, 2);
});

test("the default WebMCP adapter follows the default shared browser store", async () => {
  privacyStateStore.reset();
  const change = privacyStateStore.setCategoryConsentState(
    "marketing_profile",
    "disabled",
  );
  assert.equal(change.ok, true);

  const tool = createPrivacySummaryTool();
  const result = (await tool.execute(
    {},
    { signal: new AbortController().signal },
  )) as PrivacySummaryResult;

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.stateVersion, 2);
    assert.equal(result.data.privacyScore, 64);
  }

  privacyStateStore.reset();
});

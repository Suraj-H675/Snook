import assert from "node:assert/strict";
import test from "node:test";
import {
  createUiInspectionStore,
  INITIAL_UI_INSPECTION_STATE,
} from "../lib/state/inspection-store.ts";

test("inspection state records, replaces, and preserves the shared selection", () => {
  const store = createUiInspectionStore();

  assert.deepEqual(store.getState(), INITIAL_UI_INSPECTION_STATE);

  store.recordInspection("get_privacy_summary");
  assert.deepEqual(store.getState(), {
    tool: "get_privacy_summary",
    categoryId: null,
    selectedCategoryId: "activity_history",
    sequence: 1,
  });

  store.recordInspection("explain_data_use", "location_history");
  assert.deepEqual(store.getState(), {
    tool: "explain_data_use",
    categoryId: "location_history",
    selectedCategoryId: "location_history",
    sequence: 2,
  });

  store.recordInspection("get_data_map");
  assert.deepEqual(store.getState(), {
    tool: "get_data_map",
    categoryId: null,
    selectedCategoryId: "location_history",
    sequence: 3,
  });

  store.selectCategory("activity_history");
  assert.deepEqual(store.getState(), {
    tool: "get_data_map",
    categoryId: null,
    selectedCategoryId: "activity_history",
    sequence: 3,
  });
});

test("reset clears presentation state without representing an account reset", () => {
  const store = createUiInspectionStore();
  store.recordInspection("explain_data_use", "location_history");

  const resetState = store.reset();

  assert.deepEqual(resetState, INITIAL_UI_INSPECTION_STATE);
  assert.deepEqual(store.getState(), INITIAL_UI_INSPECTION_STATE);
});

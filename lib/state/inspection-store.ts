import type { DataCategoryId } from "../privacy/types.ts";
import type { WebMcpToolName } from "../webmcp/tool-names.ts";

export interface UiInspectionState {
  readonly tool: WebMcpToolName | null;
  readonly categoryId: DataCategoryId | null;
  readonly selectedCategoryId: DataCategoryId;
  readonly sequence: number;
}

export interface UiInspectionStore {
  readonly getState: () => UiInspectionState;
  readonly subscribe: (listener: () => void) => () => void;
  readonly recordInspection: (
    tool: WebMcpToolName,
    categoryId?: DataCategoryId | null,
  ) => UiInspectionState;
  readonly selectCategory: (categoryId: DataCategoryId) => UiInspectionState;
  readonly reset: () => UiInspectionState;
}

export const INITIAL_UI_INSPECTION_STATE: UiInspectionState = {
  tool: null,
  categoryId: null,
  selectedCategoryId: "activity_history",
  sequence: 0,
};

export function getInitialUiInspectionState(): UiInspectionState {
  return INITIAL_UI_INSPECTION_STATE;
}

/**
 * Presentation-only state shared by the UI and read tools. It is intentionally
 * separate from the persisted account state and has no privacy side effects.
 */
export function createUiInspectionStore(): UiInspectionStore {
  const listeners = new Set<() => void>();
  let state = INITIAL_UI_INSPECTION_STATE;

  function notify(): void {
    for (const listener of listeners) {
      listener();
    }
  }

  function getState(): UiInspectionState {
    return state;
  }

  function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  function recordInspection(
    tool: WebMcpToolName,
    categoryId?: DataCategoryId | null,
  ): UiInspectionState {
    state = {
      tool,
      categoryId: categoryId ?? null,
      selectedCategoryId: categoryId ?? state.selectedCategoryId,
      sequence: state.sequence + 1,
    };
    notify();
    return state;
  }

  function selectCategory(categoryId: DataCategoryId): UiInspectionState {
    state = {
      ...state,
      selectedCategoryId: categoryId,
    };
    notify();
    return state;
  }

  function reset(): UiInspectionState {
    state = INITIAL_UI_INSPECTION_STATE;
    notify();
    return state;
  }

  return {
    getState,
    subscribe,
    recordInspection,
    selectCategory,
    reset,
  };
}

export const uiInspectionStore = createUiInspectionStore();

import { getPrivacyStateStore } from "../state/store.ts";
import { uiInspectionStore } from "../state/inspection-store.ts";
import type {
  DataCategoryId,
  PrivacyAccountState,
} from "../privacy/types.ts";
import type { WebMcpToolName } from "./tool-names.ts";

export type ReadToolStateGetter = () => PrivacyAccountState;

export type ReadToolInspectionRecorder = (
  tool: WebMcpToolName,
  categoryId?: DataCategoryId | null,
) => void;

export interface ReadToolRuntimeOptions {
  readonly onInvoked?: () => void;
  readonly getState?: ReadToolStateGetter;
  readonly recordInspection?: ReadToolInspectionRecorder;
}

export interface ReadToolRuntime {
  readonly getState: ReadToolStateGetter;
  readonly complete: (
    tool: WebMcpToolName,
    categoryId?: DataCategoryId | null,
  ) => void;
}

/**
 * Keeps live-state access and presentation effects consistent across read
 * adapters while leaving each adapter responsible for its own result shape.
 */
export function createReadToolRuntime(
  options: ReadToolRuntimeOptions = {},
): ReadToolRuntime {
  const getState =
    options.getState ?? (() => getPrivacyStateStore().getState());
  const recordInspection =
    options.recordInspection ??
    ((tool: WebMcpToolName, categoryId?: DataCategoryId | null) => {
      uiInspectionStore.recordInspection(tool, categoryId);
    });

  return {
    getState,
    complete(tool, categoryId) {
      recordInspection(tool, categoryId);
      options.onInvoked?.();
    },
  };
}

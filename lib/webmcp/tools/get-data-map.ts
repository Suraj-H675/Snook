import { getDataMap } from "../../privacy/engine.ts";
import { PRIVACY_CATALOG } from "../../privacy/catalog.ts";
import type {
  PrivacyAccountState,
  PrivacyCatalog,
  PrivacyDataMap,
} from "../../privacy/types.ts";
import { NO_ARGUMENTS_INPUT_SCHEMA } from "../schemas.ts";
import {
  createReadToolRuntime,
  type ReadToolInspectionRecorder,
  type ReadToolStateGetter,
} from "../tool-context.ts";
import { GET_DATA_MAP_TOOL_NAME } from "../tool-names.ts";
import type { ToolSuccessResult } from "../results.ts";

export interface GetDataMapData extends PrivacyDataMap {
  readonly noChangesMade: true;
}

export type GetDataMapResult = ToolSuccessResult<GetDataMapData>;

export function createDataMapTool(
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
    name: GET_DATA_MAP_TOOL_NAME,
    title: "Get data map",
    description:
      "Read the current relationships from each data category through purposes to product capabilities and recipients, including active and paused paths. Takes no arguments and never changes account privacy state.",
    inputSchema: NO_ARGUMENTS_INPUT_SCHEMA,
    annotations: {
      readOnlyHint: true,
    },
    execute: (): GetDataMapResult => {
      const state: PrivacyAccountState = runtime.getState();
      const data: GetDataMapData = {
        ...getDataMap(state, catalog),
        noChangesMade: true,
      };

      runtime.complete(GET_DATA_MAP_TOOL_NAME);
      return { ok: true, data };
    },
  };
}

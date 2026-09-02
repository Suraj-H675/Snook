import { PRIVACY_CATALOG } from "../privacy/catalog.ts";
import { evaluateConsentPlan } from "../plans/create-plan.ts";
import { hashConsentPlan } from "../plans/hash-plan.ts";
import type {
  ConsentPlanEvaluation,
  PlanFailureResult,
  StagedConsentPlan,
  StagedPlanEditResult,
  StagedPlanState,
} from "../plans/types.ts";
import type {
  PrivacyAccountState,
  PrivacyCatalog,
} from "../privacy/types.ts";

export interface StagedPlanStoreOptions {
  readonly catalog?: PrivacyCatalog;
}

export interface StagedPlanStore {
  readonly getState: () => StagedPlanState;
  readonly getSnapshot: () => StagedPlanState;
  readonly subscribe: (listener: () => void) => () => void;
  readonly stage: (evaluation: ConsentPlanEvaluation) => Promise<StagedConsentPlan>;
  readonly edit: (
    input: unknown,
    actualState: PrivacyAccountState,
  ) => Promise<StagedPlanEditResult>;
  readonly discard: () => StagedPlanState;
  readonly reset: () => StagedPlanState;
}

export const INITIAL_STAGED_PLAN_STATE: StagedPlanState = {
  plan: null,
};

export function getInitialStagedPlanState(): StagedPlanState {
  return INITIAL_STAGED_PLAN_STATE;
}

export type StagedPlanValidity = "empty" | "current" | "stale";

export function getStagedPlanValidity(
  plan: StagedConsentPlan | null,
  actualStateVersion: number,
): StagedPlanValidity {
  if (!plan) {
    return "empty";
  }

  return plan.baseStateVersion === actualStateVersion ? "current" : "stale";
}

function failure(
  code: PlanFailureResult["error"]["code"],
  message: string,
): PlanFailureResult {
  return { ok: false, error: { code, message } };
}

export function createStagedPlanStore(
  options: StagedPlanStoreOptions = {},
): StagedPlanStore {
  const catalog = options.catalog ?? PRIVACY_CATALOG;
  const listeners = new Set<() => void>();
  let state: StagedPlanState = INITIAL_STAGED_PLAN_STATE;
  let planSequence = 0;

  function notify(): void {
    for (const listener of listeners) {
      listener();
    }
  }

  function notifyAfterDiscard(): void {
    for (const listener of listeners) {
      try {
        listener();
      } catch {
        // Discard is post-commit cleanup; an observer cannot make the apply
        // appear to fail after the actual state transition has succeeded.
      }
    }
  }

  function getState(): StagedPlanState {
    return state;
  }

  function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  async function stage(
    evaluation: ConsentPlanEvaluation,
  ): Promise<StagedConsentPlan> {
    planSequence += 1;
    const planId = `plan_${planSequence}`;
    const revision = 1;
    const planHash = await hashConsentPlan({
      planId,
      revision,
      baseStateVersion: evaluation.baseStateVersion,
      changes: evaluation.changes,
    });
    const plan: StagedConsentPlan = {
      ...evaluation,
      planId,
      revision,
      planHash,
    };

    state = { plan };
    notify();
    return plan;
  }

  async function edit(
    input: unknown,
    actualState: PrivacyAccountState,
  ): Promise<StagedPlanEditResult> {
    const currentPlan = state.plan;
    if (!currentPlan) {
      return failure(
        "INVALID_PLAN_INPUT",
        "There is no staged plan to edit.",
      );
    }

    if (getStagedPlanValidity(currentPlan, actualState.stateVersion) === "stale") {
      return failure(
        "STATE_CHANGED_SINCE_PREVIEW",
        "Your actual privacy settings changed after this plan was staged. Restage the plan before editing it.",
      );
    }

    const evaluated = evaluateConsentPlan(input, actualState, catalog);
    if (!evaluated.ok) {
      if (evaluated.error.code === "NO_VALID_CHANGES") {
        state = INITIAL_STAGED_PLAN_STATE;
        notify();
        return { ok: true, data: null };
      }

      return evaluated;
    }

    const revision = currentPlan.revision + 1;
    const planHash = await hashConsentPlan({
      planId: currentPlan.planId,
      revision,
      baseStateVersion: evaluated.data.baseStateVersion,
      changes: evaluated.data.changes,
    });
    const plan: StagedConsentPlan = {
      ...evaluated.data,
      planId: currentPlan.planId,
      revision,
      planHash,
    };

    state = { plan };
    notify();
    return { ok: true, data: plan };
  }

  function discard(): StagedPlanState {
    if (state.plan !== null) {
      state = INITIAL_STAGED_PLAN_STATE;
      notifyAfterDiscard();
    }
    return state;
  }

  return {
    getState,
    getSnapshot: getState,
    subscribe,
    stage,
    edit,
    discard,
    reset: discard,
  };
}

export const stagedPlanStore = createStagedPlanStore();

export function getStagedPlanStore(): StagedPlanStore {
  return stagedPlanStore;
}

import {
  createApprovalGrant,
  getApprovalValidity,
  hasConsumedApprovalBinding,
  isApprovalBindingEqual,
} from "../approval/approval.ts";
import type {
  ApprovalBinding,
  ApprovalClaimResult,
  ApprovalGrant,
  ApprovalState,
  ApprovalValidity,
} from "../approval/types.ts";

export interface ApprovalStoreOptions {
  readonly clock?: () => number;
  readonly generateApprovalId?: () => string;
}

export interface ApprovalStore {
  readonly getState: () => ApprovalState;
  readonly subscribe: (listener: () => void) => () => void;
  readonly createApproval: (binding: ApprovalBinding) => ApprovalGrant;
  readonly getValidity: (
    currentPlan: ApprovalBinding | null,
    actualStateVersion: number,
  ) => ApprovalValidity;
  readonly hasConsumedBinding: (binding: ApprovalBinding) => boolean;
  readonly claim: (binding: ApprovalBinding) => ApprovalClaimResult;
  readonly release: (binding: ApprovalBinding) => void;
  readonly clear: () => ApprovalState;
  readonly reset: () => ApprovalState;
}

export const INITIAL_APPROVAL_STATE: ApprovalState = {
  grant: null,
  consumedBindings: [],
};

export function getInitialApprovalState(): ApprovalState {
  return INITIAL_APPROVAL_STATE;
}

function createDefaultApprovalId(): string {
  const browserCrypto = globalThis.crypto;
  if (browserCrypto?.randomUUID) {
    return browserCrypto.randomUUID();
  }

  if (browserCrypto?.getRandomValues) {
    const bytes = new Uint8Array(16);
    browserCrypto.getRandomValues(bytes);
    return `approval_${Array.from(bytes, (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("")}`;
  }

  throw new Error("A secure browser random ID is required for approval.");
}

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function createApprovalStore(
  options: ApprovalStoreOptions = {},
): ApprovalStore {
  const clock = options.clock ?? (() => Date.now());
  const generateApprovalId =
    options.generateApprovalId ?? createDefaultApprovalId;
  const listeners = new Set<() => void>();
  let state: ApprovalState = INITIAL_APPROVAL_STATE;
  let expiryTimer: ReturnType<typeof setTimeout> | null = null;

  function notify(): void {
    for (const listener of listeners) {
      try {
        listener();
      } catch {
        // Approval observers are non-authoritative and cannot change the
        // single-use authorization state or interrupt the apply boundary.
      }
    }
  }

  function clearExpiryTimer(): void {
    if (expiryTimer !== null) {
      clearTimeout(expiryTimer);
      expiryTimer = null;
    }
  }

  function scheduleExpiry(grant: ApprovalGrant): void {
    clearExpiryTimer();
    if (!isBrowser() || grant.status !== "active") {
      return;
    }

    const delay = Math.max(0, grant.expiresAt - clock());
    expiryTimer = setTimeout(() => {
      expiryTimer = null;
      if (
        state.grant?.status === "active" &&
        state.grant.expiresAt <= clock()
      ) {
        // Keep the snapshot identity current so useSyncExternalStore users
        // re-render and derive the now-expired status from the injected clock.
        state = {
          grant: state.grant,
          consumedBindings: state.consumedBindings,
        };
        notify();
      }
    }, delay);
  }

  function getState(): ApprovalState {
    return state;
  }

  function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  function createApproval(binding: ApprovalBinding): ApprovalGrant {
    const now = clock();
    const existingGrant = state.grant;
    if (
      existingGrant?.status === "active" &&
      isApprovalBindingEqual(existingGrant, binding) &&
      now < existingGrant.expiresAt
    ) {
      return existingGrant;
    }

    const grant = createApprovalGrant(
      binding,
      generateApprovalId(),
      now,
    );
    state = {
      grant,
      consumedBindings: state.consumedBindings,
    };
    scheduleExpiry(grant);
    notify();
    return grant;
  }

  function getValidity(
    currentPlan: ApprovalBinding | null,
    actualStateVersion: number,
  ): ApprovalValidity {
    return getApprovalValidity(
      state.grant,
      currentPlan,
      actualStateVersion,
      clock(),
    );
  }

  function hasConsumedBinding(binding: ApprovalBinding): boolean {
    return (
      hasConsumedApprovalBinding(state.consumedBindings, binding) ||
      (state.grant?.status === "consumed" &&
        isApprovalBindingEqual(state.grant, binding))
    );
  }

  function claim(binding: ApprovalBinding): ApprovalClaimResult {
    if (hasConsumedBinding(binding)) {
      return { ok: false, status: "consumed" };
    }

    const grant = state.grant;
    if (!grant) {
      return { ok: false, status: "none" };
    }

    if (grant.planId !== binding.planId) {
      return { ok: false, status: "none" };
    }

    if (!isApprovalBindingEqual(grant, binding)) {
      return { ok: false, status: "plan_changed" };
    }

    const now = clock();
    if (now >= grant.expiresAt) {
      return { ok: false, status: "expired" };
    }

    const consumedGrant: ApprovalGrant = {
      ...grant,
      status: "consumed",
      consumedAt: now,
    };
    state = {
      grant: consumedGrant,
      consumedBindings: [
        ...state.consumedBindings,
        {
          planId: binding.planId,
          revision: binding.revision,
          planHash: binding.planHash,
          baseStateVersion: binding.baseStateVersion,
        },
      ],
    };
    clearExpiryTimer();
    notify();
    return { ok: true, grant: consumedGrant };
  }

  function release(binding: ApprovalBinding): void {
    const grant = state.grant;
    if (
      !grant ||
      grant.status !== "consumed" ||
      !isApprovalBindingEqual(grant, binding)
    ) {
      return;
    }

    const activeGrant: ApprovalGrant = {
      approvalId: grant.approvalId,
      planId: grant.planId,
      revision: grant.revision,
      planHash: grant.planHash,
      baseStateVersion: grant.baseStateVersion,
      status: "active",
      issuedAt: grant.issuedAt,
      expiresAt: grant.expiresAt,
    };
    state = {
      grant: activeGrant,
      consumedBindings: state.consumedBindings.filter(
        (consumedBinding) => !isApprovalBindingEqual(consumedBinding, binding),
      ),
    };
    scheduleExpiry(activeGrant);
    notify();
  }

  function clear(): ApprovalState {
    clearExpiryTimer();
    if (
      state.grant !== null ||
      state.consumedBindings.length > 0
    ) {
      state = INITIAL_APPROVAL_STATE;
      notify();
    }
    return state;
  }

  return {
    getState,
    subscribe,
    createApproval,
    getValidity,
    hasConsumedBinding,
    claim,
    release,
    clear,
    reset: clear,
  };
}

export const approvalStore = createApprovalStore();

export function getApprovalStore(): ApprovalStore {
  return approvalStore;
}

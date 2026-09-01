import { PRIVACY_CATALOG } from "../privacy/catalog.ts";
import { getSeededPrivacyState } from "../privacy/seed.ts";
import { setCategoryConsentState } from "./transitions.ts";
import {
  parsePersistedPrivacyState,
  PRIVACY_STATE_STORAGE_KEY,
  serializePrivacyState,
} from "./persistence.ts";
import type {
  PrivacyAccountState,
  PrivacyCatalog,
} from "../privacy/types.ts";
import type {
  PrivacyTransitionResult,
} from "./transitions.ts";

export interface PrivacyStateStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface PrivacyStateStoreOptions {
  readonly storage?: PrivacyStateStorage | null;
  readonly catalog?: PrivacyCatalog;
}

export interface PrivacyStateStore {
  readonly getState: () => PrivacyAccountState;
  readonly subscribe: (listener: () => void) => () => void;
  readonly setCategoryConsentState: (
    categoryId: string,
    desiredState: string,
  ) => PrivacyTransitionResult;
  readonly reset: () => PrivacyAccountState;
  readonly hydrate: () => void;
}

function getBrowserStorage(): PrivacyStateStorage | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * A deliberately small external store shared by the human UI and browser
 * WebMCP read adapters. It owns persistence and exposes only validated domain
 * transitions to callers.
 */
export function createPrivacyStateStore(
  options: PrivacyStateStoreOptions = {},
): PrivacyStateStore {
  const catalog = options.catalog ?? PRIVACY_CATALOG;
  const hasExplicitStorage = Object.prototype.hasOwnProperty.call(
    options,
    "storage",
  );
  const storage = hasExplicitStorage ? options.storage ?? null : undefined;
  const listeners = new Set<() => void>();
  let state = getSeededPrivacyState();
  let hydrated = false;

  function getStorage(): PrivacyStateStorage | null {
    return storage === undefined ? getBrowserStorage() : storage;
  }

  function notify(): void {
    for (const listener of listeners) {
      listener();
    }
  }

  function persist(nextState: PrivacyAccountState): void {
    const currentStorage = getStorage();
    if (!currentStorage) {
      return;
    }

    try {
      currentStorage.setItem(
        PRIVACY_STATE_STORAGE_KEY,
        serializePrivacyState(nextState),
      );
    } catch {
      // The UI remains useful when browser storage is blocked or unavailable.
    }
  }

  function getState(): PrivacyAccountState {
    return state;
  }

  function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  function updateCategory(
    categoryId: string,
    desiredState: string,
  ): PrivacyTransitionResult {
    const result = setCategoryConsentState(
      state,
      categoryId,
      desiredState,
      catalog,
    );
    if (!result.ok) {
      return result;
    }

    state = result.state;
    persist(state);
    notify();
    return result;
  }

  function reset(): PrivacyAccountState {
    state = getSeededPrivacyState();
    persist(state);
    notify();
    return state;
  }

  function hydrate(): void {
    if (hydrated) {
      return;
    }
    hydrated = true;

    const currentStorage = getStorage();
    if (!currentStorage) {
      return;
    }

    let raw: string | null;
    try {
      raw = currentStorage.getItem(PRIVACY_STATE_STORAGE_KEY);
    } catch {
      return;
    }

    const restored = parsePersistedPrivacyState(raw);
    if (restored) {
      state = restored;
      notify();
      return;
    }

    if (raw !== null) {
      // Self-heal malformed or stale demo data so subsequent reloads are
      // deterministic and never reintroduce an invalid required state.
      persist(state);
    }
  }

  return {
    getState,
    subscribe,
    setCategoryConsentState: updateCategory,
    reset,
    hydrate,
  };
}

export const privacyStateStore = createPrivacyStateStore();

export function getPrivacyStateStore(): PrivacyStateStore {
  return privacyStateStore;
}

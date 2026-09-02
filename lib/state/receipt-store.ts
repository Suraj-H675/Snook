import {
  clonePrivacyReceipt,
  parsePersistedPrivacyReceipt,
  PRIVACY_RECEIPT_STORAGE_KEY,
  serializePrivacyReceipt,
} from "../receipts/persistence.ts";
import type { PrivacyReceipt, PrivacyReceiptState } from "../receipts/types.ts";

export interface PrivacyReceiptStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface PrivacyReceiptStoreOptions {
  readonly storage?: PrivacyReceiptStorage | null;
}

export interface PrivacyReceiptStore {
  readonly getState: () => PrivacyReceiptState;
  readonly getSnapshot: () => PrivacyReceiptState;
  readonly subscribe: (listener: () => void) => () => void;
  readonly set: (receipt: PrivacyReceipt) => PrivacyReceipt;
  readonly clear: () => PrivacyReceiptState;
  readonly reset: () => PrivacyReceiptState;
  readonly hydrate: () => void;
}

export const INITIAL_PRIVACY_RECEIPT_STATE: PrivacyReceiptState = {
  receipt: null,
};

export function getInitialPrivacyReceiptState(): PrivacyReceiptState {
  return INITIAL_PRIVACY_RECEIPT_STATE;
}

function getBrowserStorage(): PrivacyReceiptStorage | null {
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
 * A focused latest-only receipt store. It deliberately has no collection or
 * history API because a receipt is a completed artifact, not a work queue.
 */
export function createPrivacyReceiptStore(
  options: PrivacyReceiptStoreOptions = {},
): PrivacyReceiptStore {
  const hasExplicitStorage = Object.prototype.hasOwnProperty.call(
    options,
    "storage",
  );
  const storage = hasExplicitStorage ? options.storage ?? null : undefined;
  const listeners = new Set<() => void>();
  let state: PrivacyReceiptState = INITIAL_PRIVACY_RECEIPT_STATE;
  let hydrated = false;

  function getStorage(): PrivacyReceiptStorage | null {
    return storage === undefined ? getBrowserStorage() : storage;
  }

  function notify(): void {
    for (const listener of listeners) {
      try {
        listener();
      } catch {
        // Receipt observers are non-authoritative and cannot invalidate a
        // completed apply or prevent the in-memory artifact from being kept.
      }
    }
  }

  function getState(): PrivacyReceiptState {
    return state;
  }

  function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  function set(receipt: PrivacyReceipt): PrivacyReceipt {
    // Serialization validates the complete record before it becomes visible.
    const storedReceipt = clonePrivacyReceipt(receipt);
    const serialized = serializePrivacyReceipt(storedReceipt);
    const currentStorage = getStorage();
    if (currentStorage) {
      try {
        currentStorage.setItem(PRIVACY_RECEIPT_STORAGE_KEY, serialized);
      } catch {
        // Keep the receipt available in memory when storage is unavailable.
      }
    }

    state = {
      receipt: storedReceipt,
    };
    notify();
    return storedReceipt;
  }

  function clear(): PrivacyReceiptState {
    const currentStorage = getStorage();
    if (currentStorage) {
      try {
        currentStorage.removeItem(PRIVACY_RECEIPT_STORAGE_KEY);
      } catch {
        // Clearing memory still keeps reset safe when storage is blocked.
      }
    }

    if (state.receipt !== null) {
      state = INITIAL_PRIVACY_RECEIPT_STATE;
      notify();
    }
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
      raw = currentStorage.getItem(PRIVACY_RECEIPT_STORAGE_KEY);
    } catch {
      return;
    }

    const restored = parsePersistedPrivacyReceipt(raw);
    if (restored) {
      state = { receipt: restored };
      notify();
      return;
    }

    if (raw !== null) {
      // Reject and discard malformed or incompatible records safely.
      try {
        currentStorage.removeItem(PRIVACY_RECEIPT_STORAGE_KEY);
      } catch {
        // The invalid value is still ignored for this page session.
      }
    }
  }

  return {
    getState,
    getSnapshot: getState,
    subscribe,
    set,
    clear,
    reset: clear,
    hydrate,
  };
}

export const privacyReceiptStore = createPrivacyReceiptStore();

export function getPrivacyReceiptStore(): PrivacyReceiptStore {
  return privacyReceiptStore;
}

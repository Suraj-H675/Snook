"use client";

import { useState } from "react";

interface ResetDemoButtonProps {
  readonly onReset: () => void;
}

export default function ResetDemoButton({ onReset }: ResetDemoButtonProps) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <div
        aria-label="Confirm demo reset"
        className="flex flex-wrap items-center justify-end gap-2 rounded-xl border border-amber-200 bg-amber-50 p-2"
        role="group"
      >
        <span className="px-1 text-xs font-medium text-amber-900">
          Discard your demo changes?
        </span>
        <button
          className="rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-800"
          onClick={() => {
            onReset();
            setConfirming(false);
          }}
          type="button"
        >
          Reset account
        </button>
        <button
          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
          onClick={() => setConfirming(false)}
          type="button"
        >
          Keep changes
        </button>
      </div>
    );
  }

  return (
    <button
      className="rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:border-slate-400 hover:bg-slate-50"
      onClick={() => setConfirming(true)}
      type="button"
    >
      Reset demo
    </button>
  );
}

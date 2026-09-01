import type { DataCategoryDefinition } from "@/lib/privacy/types";

interface ConsentControlProps {
  readonly category: DataCategoryDefinition;
  readonly enabled: boolean;
  readonly onChange: () => void;
}

export default function ConsentControl({
  category,
  enabled,
  onChange,
}: ConsentControlProps) {
  if (category.processingRequirement === "required" || !category.controllable) {
    return (
      <div
        aria-label={`${category.name} is required and locked`}
        className="inline-flex shrink-0 items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-800"
      >
        <span aria-hidden="true" className="text-sm leading-none">
          •
        </span>
        Required
        <span className="font-normal text-sky-600">Locked</span>
      </div>
    );
  }

  return (
    <button
      aria-checked={enabled}
      aria-label={`${enabled ? "Disable" : "Enable"} ${category.name}`}
      className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-2 py-1.5 text-xs font-semibold transition-colors ${
        enabled
          ? "border-emerald-200 bg-emerald-50 text-emerald-800 hover:border-emerald-300 hover:bg-emerald-100"
          : "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 hover:bg-slate-100"
      }`}
      onClick={onChange}
      role="switch"
      type="button"
    >
      <span
        aria-hidden="true"
        className={`relative h-5 w-9 rounded-full transition-colors ${
          enabled ? "bg-emerald-500" : "bg-slate-300"
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
            enabled ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </span>
      <span>{enabled ? "Enabled" : "Disabled"}</span>
    </button>
  );
}

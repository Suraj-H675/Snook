import { isProcessingEnabled } from "@/lib/privacy/engine";
import type {
  ConsentChange,
  DataCategoryDefinition,
  PrivacyAccountState,
  PrivacyCatalog,
} from "@/lib/privacy/types";
import type { PlanImpact, PlanImpactEffect } from "@/lib/plans/types";

interface PlanChangeRowProps {
  readonly change: ConsentChange;
  readonly category: DataCategoryDefinition;
  readonly catalog: PrivacyCatalog;
  readonly currentState: PrivacyAccountState;
  readonly impacts: readonly PlanImpact[];
  readonly disabled: boolean;
  readonly onRemove: (categoryId: ConsentChange["categoryId"]) => void;
  readonly onTargetChange: (
    categoryId: ConsentChange["categoryId"],
    targetConsentState: ConsentChange["targetConsentState"],
  ) => void;
}

function formatImpactEffect(effect: PlanImpactEffect): string {
  switch (effect) {
    case "stops_collection":
      return "Collection stops";
    case "collection_resumes":
      return "Collection resumes";
    case "feature_unavailable":
      return "Capability unavailable";
    case "feature_restored":
      return "Capability restored";
    case "quality_reduced":
      return "Quality may be reduced";
    case "quality_restored":
      return "Quality may improve";
    case "sharing_stops":
      return "Sharing stops";
    case "sharing_resumes":
      return "Sharing resumes";
    case "core_service_unchanged":
      return "Core service unchanged";
  }
}

function formatConsentState(
  category: DataCategoryDefinition,
  enabled: boolean,
): string {
  if (category.processingRequirement === "required") {
    return "Required and active";
  }

  return enabled ? "Enabled" : "Disabled";
}

export default function PlanChangeRow({
  change,
  category,
  catalog,
  currentState,
  impacts,
  disabled,
  onRemove,
  onTargetChange,
}: PlanChangeRowProps) {
  const currentEnabled = isProcessingEnabled(
    currentState,
    category.id,
    catalog,
  );
  const currentLabel = formatConsentState(category, currentEnabled);
  const proposedLabel =
    change.targetConsentState === "enabled" ? "Enabled" : "Disabled";

  return (
    <li className="rounded-2xl border border-amber-200 bg-amber-50/55 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-slate-950">{category.name}</h3>
            <span className="rounded-full border border-amber-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-800">
              Proposed
            </span>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            This is a proposal for review. The live account setting is still {currentLabel.toLowerCase()}.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-xs font-semibold text-slate-600" htmlFor={`plan-target-${category.id}`}>
            Proposed state
            <select
              aria-label={`${category.name} proposed state`}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm font-semibold text-slate-800 shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
              disabled={disabled}
              id={`plan-target-${category.id}`}
              onChange={(event) =>
                onTargetChange(
                  category.id,
                  event.target.value as ConsentChange["targetConsentState"],
                )
              }
              value={change.targetConsentState}
            >
              <option value="enabled">Enabled</option>
              <option value="disabled">Disabled</option>
            </select>
          </label>
          <button
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={disabled}
            onClick={() => onRemove(category.id)}
            type="button"
          >
            Keep {currentLabel.toLowerCase()}
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="section-label">Current account state</p>
          <p className="mt-2 text-sm font-semibold text-slate-900">{currentLabel}</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">Unchanged until a future approved action.</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-white p-3">
          <p className="section-label">Proposed state</p>
          <p className="mt-2 text-sm font-semibold text-slate-900">{proposedLabel}</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">Estimated only; this plan has not been applied.</p>
        </div>
      </div>

      <div className="mt-4 border-t border-amber-200 pt-3">
        <p className="section-label">Catalog-derived consequences</p>
        <ul className="mt-2 space-y-2">
          {impacts.map((impact) => (
            <li className="flex gap-2 text-xs leading-5 text-slate-700" key={impact.id}>
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
              <span>
                <span className="font-semibold text-slate-900">{formatImpactEffect(impact.effect)}:</span>{" "}
                {impact.description}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </li>
  );
}

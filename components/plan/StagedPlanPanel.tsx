import { getStagedPlanValidity } from "@/lib/state/staged-plan-store";
import type {
  ConsentChange,
  DataCategoryDefinition,
  PrivacyAccountState,
  PrivacyCatalog,
} from "@/lib/privacy/types";
import type {
  CapabilityAvailability,
  StagedConsentPlan,
} from "@/lib/plans/types";
import PlanChangeRow from "./PlanChangeRow";

interface StagedPlanPanelProps {
  readonly plan: StagedConsentPlan;
  readonly actualState: PrivacyAccountState;
  readonly currentPrivacyScore: number;
  readonly catalog: PrivacyCatalog;
  readonly categories: readonly DataCategoryDefinition[];
  readonly editPending: boolean;
  readonly onEdit: (
    changes: readonly ConsentChange[],
  ) => void;
  readonly onDiscard: () => void;
}

function formatDelta(delta: number): string {
  return delta > 0 ? `+${delta}` : String(delta);
}

function formatCapabilityStatus(status: CapabilityAvailability): string {
  switch (status) {
    case "available":
      return "Available";
    case "degraded":
      return "Quality may be reduced";
    case "unavailable":
      return "Unavailable";
  }
}

function capabilityStatusTone(status: CapabilityAvailability): string {
  switch (status) {
    case "available":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "degraded":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "unavailable":
      return "border-rose-200 bg-rose-50 text-rose-800";
  }
}

export default function StagedPlanPanel({
  plan,
  actualState,
  currentPrivacyScore,
  catalog,
  categories,
  editPending,
  onEdit,
  onDiscard,
}: StagedPlanPanelProps) {
  const validity = getStagedPlanValidity(plan, actualState.stateVersion);
  const stale = validity === "stale";

  function removeChange(categoryId: ConsentChange["categoryId"]): void {
    onEdit(plan.changes.filter((change) => change.categoryId !== categoryId));
  }

  function updateTarget(
    categoryId: ConsentChange["categoryId"],
    targetConsentState: ConsentChange["targetConsentState"],
  ): void {
    onEdit(
      plan.changes.map((change) =>
        change.categoryId === categoryId
          ? { ...change, targetConsentState }
          : change,
      ),
    );
  }

  const currentSharingNames = plan.after.thirdPartySharing.flatMap((recipientId) => {
    const recipient = catalog.recipients[recipientId];
    return recipient ? [recipient.name] : [];
  });

  return (
    <section
      aria-labelledby="staged-plan-heading"
      className="surface-card overflow-hidden border-2 border-amber-200"
      id="staged-plan"
    >
      <div className="border-b border-amber-200 bg-amber-50/70 px-5 py-5 sm:px-7 sm:py-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="eyebrow">Agent proposal</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950" id="staged-plan-heading">
              Staged privacy plan
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-700">
              Review and edit the proposed category changes below. This is shared review state, separate from your live account settings.
            </p>
          </div>
          <span className="rounded-full border border-amber-300 bg-white px-3 py-1.5 text-xs font-bold text-amber-900">
            Proposed — not applied
          </span>
        </div>

        <p className="mt-5 rounded-xl border border-amber-300 bg-white px-4 py-3 text-sm font-semibold leading-6 text-amber-950">
          Nothing in this plan has been applied to your account.
        </p>

        {stale ? (
          <div
            className="mt-3 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-950"
            role="alert"
          >
            Your actual privacy settings changed after this plan was staged. Restage the plan before continuing. Editing is disabled until then.
          </div>
        ) : null}
      </div>

      <div className="grid gap-3 border-b border-slate-200 p-5 sm:grid-cols-3 sm:p-7">
        <PlanStat label="Current privacy score" value={`${currentPrivacyScore}/100`} detail={`Account state v${actualState.stateVersion}`} />
        <PlanStat label="Estimated after score" value={`${plan.after.privacyScore}/100`} detail={`At staged state v${plan.baseStateVersion}`} />
        <PlanStat label="Estimated score change" value={formatDelta(plan.privacyScoreDelta)} detail={`${plan.changes.length} proposed ${plan.changes.length === 1 ? "change" : "changes"}`} />
      </div>

      <div className="space-y-6 p-5 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="section-label">Plan identity</p>
            <p className="mt-2 text-sm font-semibold text-slate-900">
              <code className="rounded bg-slate-100 px-1.5 py-1 text-xs">{plan.planId}</code>
              <span className="mx-2 text-slate-400">·</span>
              revision {plan.revision}
            </p>
            <p className="mt-2 break-all text-xs leading-5 text-slate-500">
              Fingerprint <code className="font-mono text-slate-700">{plan.planHash}</code>
            </p>
          </div>
          <p className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600">
            Based on live account state v{plan.baseStateVersion}
          </p>
        </div>

        <div>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="section-label">Proposed changes</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Choose a different proposed state, or keep the current setting to remove that proposal.
              </p>
            </div>
            {editPending ? (
              <span className="text-xs font-semibold text-amber-800" role="status">Updating proposal…</span>
            ) : null}
          </div>
          <ul className="mt-4 space-y-3">
            {plan.changes.map((change) => {
              const category = categories.find((candidate) => candidate.id === change.categoryId);
              if (!category) {
                return null;
              }

              return (
                <PlanChangeRow
                  category={category}
                  catalog={catalog}
                  currentState={actualState}
                  disabled={stale || editPending}
                  impacts={plan.impacts.filter((impact) => impact.categoryId === change.categoryId)}
                  key={change.categoryId}
                  onRemove={removeChange}
                  onTargetChange={updateTarget}
                  change={change}
                />
              );
            })}
          </ul>
        </div>

        <div className="border-t border-slate-200 pt-6">
          <p className="section-label">Product impact</p>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {plan.capabilityImpacts.map((impact) => (
              <li className="rounded-xl border border-slate-200 bg-slate-50 p-3" key={impact.capabilityId}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">{impact.capabilityName}</p>
                  <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${capabilityStatusTone(impact.after)}`}>
                    {formatCapabilityStatus(impact.after)}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-600">
                  {impact.change === "unaffected"
                    ? "Unaffected by this proposal."
                    : `${formatCapabilityStatus(impact.before)} → ${formatCapabilityStatus(impact.after)}.`}
                </p>
                {impact.affectedByCategoryIds.length > 0 ? (
                  <p className="mt-1 text-[11px] leading-5 text-slate-500">
                    Related category: {impact.affectedByCategoryIds.join(", ")}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>

        <div className="grid gap-6 border-t border-slate-200 pt-6 lg:grid-cols-2">
          <div>
            <p className="section-label">Third-party sharing</p>
            {plan.sharingChanges.length > 0 ? (
              <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
                {plan.sharingChanges.map((change) => (
                  <li className="rounded-xl border border-slate-200 bg-white p-3" key={change.id}>
                    <span className="font-semibold text-slate-900">{change.categoryName}</span>
                    <span className="mx-1 text-slate-400">→</span>
                    <span>{change.recipientName}</span>
                    <span className="ml-2 rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">
                      Sharing {change.change}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm leading-6 text-slate-600">This plan does not change a third-party sharing path.</p>
            )}
            <p className="mt-3 text-xs leading-5 text-slate-500">
              Hypothetical active recipients after this plan: {currentSharingNames.length > 0 ? currentSharingNames.join(", ") : "none"}.
            </p>
          </div>

          <div>
            <p className="section-label">Warnings and notes</p>
            {plan.warnings.length > 0 ? (
              <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
                {plan.warnings.map((warning) => (
                  <li className="rounded-xl border border-amber-200 bg-amber-50/60 p-3" key={warning.id}>
                    <span className="font-semibold text-amber-950">{warning.capabilityName}:</span>{" "}
                    {warning.message}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm leading-6 text-slate-600">No capability warnings were found for these changes.</p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-5">
          <p className="text-xs leading-5 text-slate-500">
            Human review can keep any current setting. Actual account controls remain authoritative.
          </p>
          <button
            className="rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:border-slate-400 hover:bg-slate-50"
            onClick={onDiscard}
            type="button"
          >
            Discard staged plan
          </button>
        </div>
      </div>
    </section>
  );
}

function PlanStat({
  detail,
  label,
  value,
}: {
  readonly detail: string;
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.13em] text-slate-500">{label}</p>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">{value}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p>
    </div>
  );
}

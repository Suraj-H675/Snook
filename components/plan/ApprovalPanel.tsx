import type { ApprovalValidity } from "@/lib/approval/types";
import { APPROVAL_TTL_MINUTES } from "@/lib/approval/approval";
import type { StagedConsentPlan } from "@/lib/plans/types";

interface ApprovalPanelProps {
  readonly plan: StagedConsentPlan;
  readonly validity: ApprovalValidity;
  readonly disabled: boolean;
  readonly message: string | null;
  readonly onApprove: () => void;
  readonly onUntrustedApproval: () => void;
}

function statusLabel(validity: ApprovalValidity["status"]): string {
  switch (validity) {
    case "current":
      return "Approved for agent application";
    case "expired":
      return "Approval expired — approve again";
    case "plan_changed":
      return "Plan changed — approve the revised plan again";
    case "account_state_changed":
      return "Account changed — this plan is stale";
    case "consumed":
      return "Approval already used";
    case "none":
      return "Awaiting your approval";
  }
}

function statusStyles(validity: ApprovalValidity["status"]): string {
  switch (validity) {
    case "current":
      return "border-emerald-200 bg-emerald-50 text-emerald-900";
    case "expired":
    case "plan_changed":
    case "account_state_changed":
      return "border-rose-200 bg-rose-50 text-rose-950";
    case "consumed":
      return "border-slate-200 bg-slate-100 text-slate-700";
    case "none":
      return "border-violet-200 bg-violet-50 text-violet-950";
  }
}

function statusDescription(validity: ApprovalValidity["status"]): string {
  switch (validity) {
    case "current":
      return `Approval does not apply the changes by itself. It authorizes your agent to apply this exact plan for the next ${APPROVAL_TTL_MINUTES} minutes. Your actual settings are still unchanged.`;
    case "expired":
      return `The ${APPROVAL_TTL_MINUTES}-minute website approval window ended. Review this exact plan and approve it again before your agent applies it.`;
    case "plan_changed":
      return "This plan no longer matches the plan that was approved. Review the revised proposal and approve it again.";
    case "account_state_changed":
      return "The actual account changed after this plan was created. Restage against the current account state before approving it.";
    case "consumed":
      return "This approval was already used. A completed application cannot be replayed.";
    case "none":
      return `Review the exact changes below. Approval does not apply anything; it only authorizes your agent to apply this exact plan for ${APPROVAL_TTL_MINUTES} minutes.`;
  }
}

function abbreviatedHash(hash: string): string {
  if (hash.length <= 24) {
    return hash;
  }

  return `${hash.slice(0, 12)}…${hash.slice(-8)}`;
}

export default function ApprovalPanel({
  plan,
  validity,
  disabled,
  message,
  onApprove,
  onUntrustedApproval,
}: ApprovalPanelProps) {
  const planHashAvailable = /^[0-9a-f]{64}$/.test(plan.planHash);
  const hasValidPlan =
    plan.changes.length > 0 &&
    Number.isSafeInteger(plan.revision) &&
    plan.revision >= 1 &&
    Number.isSafeInteger(plan.baseStateVersion) &&
    plan.baseStateVersion >= 1 &&
    planHashAvailable;
  const alreadyApproved = validity.status === "current";
  const buttonDisabled = disabled || !hasValidPlan || alreadyApproved;

  return (
    <div className="rounded-2xl border border-violet-200 bg-violet-50/70 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="section-label text-violet-900">Website approval</p>
          <p className="mt-2 text-sm font-semibold text-slate-950">
            This exact proposal needs a deliberate human decision.
          </p>
        </div>
        <span
          className={`rounded-full border px-3 py-1.5 text-xs font-bold ${statusStyles(validity.status)}`}
          role="status"
        >
          {statusLabel(validity.status)}
        </span>
      </div>

      <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-700">
        {statusDescription(validity.status)}
      </p>

      <p className="mt-3 rounded-xl border border-violet-200 bg-white px-3 py-2 text-xs leading-5 text-slate-600">
        Exact plan: <code className="font-semibold text-slate-800">{plan.planId}</code>
        <span className="mx-1.5 text-slate-400">·</span>
        revision <code className="font-semibold text-slate-800">{plan.revision}</code>
        <span className="mx-1.5 text-slate-400">·</span>
        hash <code className="font-mono text-slate-800">{abbreviatedHash(plan.planHash)}</code>
        <span className="ml-1.5">· approval window: {APPROVAL_TTL_MINUTES} minutes</span>
      </p>

      {message ? (
        <p
          className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-950"
          role="alert"
        >
          {message}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          className="rounded-xl bg-violet-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-violet-950 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
          disabled={buttonDisabled}
          onClick={(event) => {
            if (!event.isTrusted) {
              onUntrustedApproval();
              return;
            }
            onApprove();
          }}
          type="button"
        >
          {alreadyApproved ? "Already approved" : "Approve this exact plan"}
        </button>
        <p className="text-xs leading-5 text-slate-600">
          Your agent still has to call the apply tool after approval.
        </p>
      </div>
    </div>
  );
}

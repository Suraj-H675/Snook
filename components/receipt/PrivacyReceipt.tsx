import { hasAccountChangedSinceReceipt } from "@/lib/receipts/create-receipt";
import type { PrivacyReceipt } from "@/lib/receipts/types";
import type { PrivacyCatalog } from "@/lib/privacy/types";
import type {
  CapabilityAvailability,
  PlanCapabilityImpact,
} from "@/lib/plans/types";

interface PrivacyReceiptProps {
  readonly receipt: PrivacyReceipt;
  readonly catalog: PrivacyCatalog;
  readonly currentStateVersion: number;
}

function formatConsentState(state: string): string {
  switch (state) {
    case "enabled":
      return "Enabled";
    case "disabled":
      return "Disabled";
    case "required":
      return "Required";
    default:
      return state;
  }
}

function formatDelta(delta: number): string {
  return delta > 0 ? `+${delta}` : String(delta);
}

function formatAvailability(status: CapabilityAvailability): string {
  switch (status) {
    case "available":
      return "Available";
    case "degraded":
      return "Quality reduced";
    case "unavailable":
      return "Unavailable";
  }
}

function formatReceiptTimestamp(epochMilliseconds: number): string {
  return new Date(epochMilliseconds).toISOString();
}

function capabilityTone(impact: PlanCapabilityImpact): string {
  switch (impact.change) {
    case "unavailable":
      return "border-rose-200 bg-rose-50 text-rose-900";
    case "degraded":
      return "border-amber-200 bg-amber-50 text-amber-900";
    case "improved":
      return "border-emerald-200 bg-emerald-50 text-emerald-900";
    case "unaffected":
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

export default function PrivacyReceipt({
  receipt,
  catalog,
  currentStateVersion,
}: PrivacyReceiptProps) {
  const affectedCapabilities = receipt.capabilityImpacts.filter(
    (impact) => impact.change !== "unaffected",
  );
  const preservedCapabilities = receipt.capabilityImpacts.filter(
    (impact) => impact.change === "unaffected",
  );
  const accountChangedSinceReceipt = hasAccountChangedSinceReceipt(
    currentStateVersion,
    receipt,
  );

  return (
    <section
      aria-labelledby="privacy-receipt-heading"
      className="surface-card overflow-hidden border-2 border-emerald-200"
      id="privacy-receipt"
    >
      <div className="border-b border-emerald-200 bg-emerald-50/70 px-5 py-5 sm:px-7 sm:py-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="eyebrow text-emerald-800">Completed action</p>
            <h2
              className="mt-2 text-2xl font-semibold tracking-tight text-slate-950"
              id="privacy-receipt-heading"
            >
              Privacy change receipt
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
              This is the completed result of the approved agent plan. It records what Snook actually applied to the account.
            </p>
          </div>
          <span className="rounded-full border border-emerald-300 bg-white px-3 py-1.5 text-xs font-bold text-emerald-900">
            Completed · applied
          </span>
        </div>

        {accountChangedSinceReceipt ? (
          <p
            className="mt-5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950"
            role="status"
          >
            Account settings have changed since this receipt. This receipt remains the record of the earlier agent application.
          </p>
        ) : null}
      </div>

      <div className="grid gap-3 border-b border-slate-200 p-5 sm:grid-cols-3 sm:p-7">
        <ReceiptStat
          label="Privacy score"
          value={`${receipt.before.privacyScore} → ${receipt.after.privacyScore}`}
          detail={`Change ${formatDelta(receipt.privacyScoreDelta)}`}
        />
        <ReceiptStat
          label="Account state"
          value={`v${receipt.previousStateVersion} → v${receipt.stateVersion}`}
          detail="One completed privacy transaction"
        />
        <ReceiptStat
          label="Optional processing"
          value={`${receipt.before.enabledOptionalCount} → ${receipt.after.enabledOptionalCount}`}
          detail="Enabled categories"
        />
      </div>

      <div className="space-y-6 p-5 sm:p-7">
        <div className="grid gap-4 sm:grid-cols-2">
          <ReceiptFact label="Receipt ID">
            <code className="break-all font-mono text-xs text-slate-800">
              {receipt.receiptId}
            </code>
          </ReceiptFact>
          <ReceiptFact label="Completed at (UTC)">
            <time dateTime={new Date(receipt.generatedAt).toISOString()}>
              {formatReceiptTimestamp(receipt.generatedAt)}
            </time>
          </ReceiptFact>
          <ReceiptFact label="Applied plan">
            <span>
              <code className="font-mono text-xs text-slate-800">
                {receipt.appliedPlan.planId}
              </code>
              <span className="mx-1.5 text-slate-400">·</span>
              revision {receipt.appliedPlan.revision}
            </span>
          </ReceiptFact>
          <ReceiptFact label="Plan fingerprint">
            <code className="break-all font-mono text-xs text-slate-800">
              {receipt.appliedPlan.planHash}
            </code>
          </ReceiptFact>
        </div>

        <ReceiptSection heading="Applied category changes">
          <ul className="space-y-3">
            {receipt.changes.map((change) => (
              <li
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-100 bg-emerald-50/50 p-3"
                key={change.categoryId}
              >
                <div>
                  <p className="text-sm font-semibold text-slate-950">
                    {change.categoryName}
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    {change.categoryId}
                  </p>
                </div>
                <p className="text-sm font-semibold text-slate-800">
                  {formatConsentState(change.previousConsentState)}
                  <span className="mx-2 text-emerald-700" aria-hidden="true">
                    →
                  </span>
                  {formatConsentState(change.appliedConsentState)}
                </p>
              </li>
            ))}
          </ul>
        </ReceiptSection>

        <div className="grid gap-6 border-t border-slate-200 pt-6 lg:grid-cols-2">
          <ReceiptSection heading="Capability effects">
            {affectedCapabilities.length > 0 ? (
              <ul className="space-y-3">
                {affectedCapabilities.map((impact) => (
                  <li
                    className="rounded-xl border border-slate-200 bg-white p-3"
                    key={impact.capabilityId}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-900">
                        {impact.capabilityName}
                      </p>
                      <span
                        className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${capabilityTone(impact)}`}
                      >
                        {formatAvailability(impact.before)} → {formatAvailability(impact.after)}
                      </span>
                    </div>
                    {impact.dependencyDescriptions.length > 0 ? (
                      <ul className="mt-2 space-y-1 text-xs leading-5 text-slate-600">
                        {impact.dependencyDescriptions.map((description) => (
                          <li key={description}>{description}</li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm leading-6 text-slate-600">
                No capability availability or quality changed.
              </p>
            )}
            <p className="mt-3 text-xs leading-5 text-slate-500">
              Preserved capabilities: {preservedCapabilities.length > 0
                ? preservedCapabilities.map((impact) => impact.capabilityName).join(", ")
                : "none"}.
            </p>
          </ReceiptSection>

          <ReceiptSection heading="Sharing changes">
            {receipt.sharingChanges.length > 0 ? (
              <ul className="space-y-3">
                {receipt.sharingChanges.map((change) => {
                  const purposeNames = change.purposeIds.flatMap((purposeId) => {
                    const purpose = catalog.purposes[purposeId];
                    return purpose ? [purpose.name] : [];
                  });
                  return (
                    <li
                      className="rounded-xl border border-slate-200 bg-white p-3 text-sm leading-6"
                      key={change.id}
                    >
                      <p className="font-semibold text-slate-900">
                        {change.categoryName} → {change.recipientName}
                      </p>
                      <p className="mt-1 text-xs text-slate-600">
                        {change.change === "stops" ? "Sharing stopped" : "Sharing resumed"}
                        {purposeNames.length > 0 ? ` for ${purposeNames.join(", ")}.` : "."}
                      </p>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm leading-6 text-slate-600">
                This application did not change a third-party sharing path.
              </p>
            )}
            <p className="mt-3 text-xs leading-5 text-slate-500">
              External recipients after application: {receipt.after.thirdPartySharing.length > 0
                ? receipt.after.thirdPartySharing
                    .flatMap((recipientId) => {
                      const recipient = catalog.recipients[recipientId];
                      return recipient ? [recipient.name] : [];
                    })
                    .join(", ")
                : "none"}.
            </p>
          </ReceiptSection>
        </div>

        <div className="border-t border-slate-200 pt-6">
          <div className="rounded-xl border border-violet-200 bg-violet-50/70 p-4">
            <p className="text-sm font-semibold text-violet-950">
              Human approval was required and consumed
            </p>
            <p className="mt-1 text-xs leading-5 text-violet-900">
              The website approved this exact plan before the browser agent could apply it. The approval was single-use; this receipt is the completed result.
            </p>
          </div>
        </div>

        <p className="border-t border-slate-200 pt-5 text-xs leading-5 text-slate-500">
          {receipt.demoDisclaimer}
        </p>
      </div>
    </section>
  );
}

function ReceiptStat({
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
      <p className="text-xs font-semibold uppercase tracking-[0.13em] text-slate-500">
        {label}
      </p>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
        {value}
      </p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p>
    </div>
  );
}

function ReceiptFact({
  children,
  label,
}: {
  readonly children: React.ReactNode;
  readonly label: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-medium leading-5 text-slate-800">{children}</p>
    </div>
  );
}

function ReceiptSection({
  children,
  heading,
}: {
  readonly children: React.ReactNode;
  readonly heading: string;
}) {
  return (
    <section>
      <h3 className="section-label">{heading}</h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

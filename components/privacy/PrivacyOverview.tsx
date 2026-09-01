import type {
  PrivacyCatalog,
  PrivacySummaryData,
} from "@/lib/privacy/types";

interface PrivacyOverviewProps {
  readonly catalog: PrivacyCatalog;
  readonly optionalCategoryCount: number;
  readonly summary: PrivacySummaryData;
}

export default function PrivacyOverview({
  catalog,
  optionalCategoryCount,
  summary,
}: PrivacyOverviewProps) {
  const sharingNames = summary.thirdPartySharing.flatMap((recipientId) => {
    const recipient = catalog.recipients[recipientId];
    return recipient ? [recipient.name] : [];
  });

  return (
    <section
      aria-labelledby="overview-heading"
      className="surface-card overflow-hidden"
      id="privacy-overview"
    >
      <div className="border-b border-slate-200 px-5 py-5 sm:px-7 sm:py-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="eyebrow">Current posture</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950" id="overview-heading">
              A clear view of your privacy choices
            </h2>
          </div>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600">
            Transparent demo indicator
          </span>
        </div>
      </div>

      <div className="grid gap-5 p-5 sm:p-7 lg:grid-cols-[1.05fr_1fr]">
        <div className="rounded-2xl bg-slate-950 p-5 text-white sm:p-6">
          <div className="flex items-start justify-between gap-5">
            <div>
              <p className="text-sm font-medium text-slate-300">Privacy posture</p>
              <p className="mt-4 text-6xl font-semibold tracking-[-0.07em] text-white">
                {summary.privacyScore}
                <span className="ml-2 text-xl font-normal tracking-normal text-slate-400">
                  / 100
                </span>
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-right">
              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">
                Live state
              </p>
              <p className="mt-1 font-mono text-sm text-emerald-300">
                v{summary.stateVersion}
              </p>
            </div>
          </div>
          <p className="mt-4 max-w-xl text-sm leading-6 text-slate-300">
            {summary.privacyStatus}
          </p>
          <div className="mt-6">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Optional exposure indicator</span>
              <span>{summary.privacyScore}%</span>
            </div>
            <div
              aria-label="Privacy posture indicator"
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={summary.privacyScore}
              className="mt-2 h-2 overflow-hidden rounded-full bg-white/10"
              role="progressbar"
            >
              <div
                className="h-full rounded-full bg-emerald-400 transition-[width] duration-300 motion-reduce:transition-none"
                style={{ width: `${summary.privacyScore}%` }}
              />
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <OverviewStat
            label="Optional processing"
            value={`${summary.enabledOptionalProcessingCount}/${optionalCategoryCount}`}
            detail="enabled right now"
          />
          <OverviewStat
            label="Required processing"
            value={String(summary.requiredProcessingCount)}
            detail="protected core uses"
          />
          <OverviewStat
            label="External sharing"
            value={sharingNames.length === 0 ? "None" : String(sharingNames.length)}
            detail={
              sharingNames.length === 0
                ? "no optional recipient active"
                : sharingNames.join(" · ")
            }
          />
          <OverviewStat
            label="Retention"
            value="Visible"
            detail="informational, not editable"
          />
        </div>
      </div>

      <div className="grid gap-5 border-t border-slate-200 px-5 py-5 sm:px-7 sm:py-6 lg:grid-cols-[0.85fr_1.15fr]">
        <div>
          <p className="section-label">Sharing right now</p>
          {sharingNames.length > 0 ? (
            <p className="mt-2 text-sm leading-6 text-slate-700">
              Optional data currently reaches {sharingNames.join(" and ")}.
            </p>
          ) : (
            <p className="mt-2 text-sm leading-6 text-slate-700">
              No optional data is currently shared with an external recipient.
            </p>
          )}
        </div>
        <div>
          <p className="section-label">Retention highlights</p>
          {summary.retentionHighlights.length > 0 ? (
            <ul className="mt-2 space-y-1 text-sm leading-6 text-slate-700">
              {summary.retentionHighlights.map((highlight) => (
                <li key={highlight}>{highlight}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm leading-6 text-slate-700">
              No optional retention highlights are active right now.
            </p>
          )}
        </div>
      </div>

      <p className="border-t border-slate-200 bg-slate-50 px-5 py-4 text-xs leading-5 text-slate-500 sm:px-7">
        This score is a transparent demo heuristic based on enabled optional processing and active external sharing. It is not a security score, legal compliance result, certification, or regulatory advice.
      </p>
    </section>
  );
}

function OverviewStat({
  detail,
  label,
  value,
}: {
  readonly detail: string;
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
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

import { formatRetention, isProcessingEnabled } from "@/lib/privacy/engine";
import type {
  DataCategoryDefinition,
  PrivacyAccountState,
  PrivacyCatalog,
} from "@/lib/privacy/types";
import {
  formatConsequenceEffect,
  formatDataSource,
  formatDependencyImpact,
  formatDependencyStrength,
  formatRiskLevel,
} from "./formatters";

interface CategoryDetailPanelProps {
  readonly agentInspected: boolean;
  readonly category: DataCategoryDefinition;
  readonly catalog: PrivacyCatalog;
  readonly state: PrivacyAccountState;
}

export default function CategoryDetailPanel({
  agentInspected,
  category,
  catalog,
  state,
}: CategoryDetailPanelProps) {
  const enabled = isProcessingEnabled(state, category.id, catalog);
  const purposeDefinitions = category.purposeIds.flatMap((purposeId) => {
    const purpose = catalog.purposes[purposeId];
    return purpose ? [purpose] : [];
  });

  return (
    <aside
      aria-labelledby="category-detail-heading"
      className="surface-card lg:sticky lg:top-5"
      id="category-detail"
    >
      <div className="border-b border-slate-200 px-5 py-5 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <p className="eyebrow">Selected category</p>
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
              category.processingRequirement === "required"
                ? "bg-sky-100 text-sky-800"
                : enabled
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-slate-100 text-slate-600"
            }`}
          >
            {category.processingRequirement === "required"
              ? "Required · locked"
              : enabled
                ? "Optional · enabled"
              : "Optional · disabled"}
          </span>
          {agentInspected ? (
            <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-800">
              Agent inspected
            </span>
          ) : null}
        </div>
        <h3
          className="mt-3 text-2xl font-semibold tracking-tight text-slate-950"
          id="category-detail-heading"
        >
          {category.name}
        </h3>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {category.description}
        </p>
      </div>

      <div className="space-y-6 px-5 py-5 sm:px-6 sm:py-6">
        <dl className="grid grid-cols-2 gap-3">
          <DetailFact label="Current state">
            {category.processingRequirement === "required"
              ? "Required and active"
              : enabled
                ? "Enabled"
                : "Disabled"}
          </DetailFact>
          <DetailFact label="Source">{formatDataSource(category.source)}</DetailFact>
          <DetailFact label="Sensitivity">{formatRiskLevel(category.riskOrSensitivity)}</DetailFact>
          <DetailFact label="Retention">
            {formatRetention(category.retention)}
          </DetailFact>
        </dl>

        <DetailSection heading="What it is used for">
          <div className="space-y-3">
            {purposeDefinitions.map((purpose) => (
              <div key={purpose.id} className="rounded-xl bg-slate-50 p-3">
                <p className="text-sm font-semibold text-slate-900">{purpose.name}</p>
                <p className="mt-1 text-xs leading-5 text-slate-600">
                  {purpose.description}
                </p>
              </div>
            ))}
          </div>
        </DetailSection>

        <DetailSection heading="Sharing and recipients">
          <ul className="space-y-3">
            {category.sharedWith.map((destination) => {
              const recipient = catalog.recipients[destination.recipientId];
              if (!recipient) {
                return null;
              }

              const purposeNames = destination.purposeIds.flatMap((purposeId) => {
                const purpose = catalog.purposes[purposeId];
                return purpose ? [purpose.name] : [];
              });

              return (
                <li
                  className={`rounded-xl border p-3 ${
                    enabled
                      ? "border-slate-200 bg-white"
                      : "border-dashed border-slate-200 bg-slate-50 text-slate-500"
                  }`}
                  key={destination.recipientId}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900">
                      {recipient.name}
                    </p>
                    <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
                      {recipient.kind === "third_party" ? "External" : "Snook"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    For {purposeNames.join(", ")}
                  </p>
                  <p className="mt-2 text-xs font-medium">
                    {enabled ? "Active in the current state" : "Paused while this category is disabled"}
                  </p>
                </li>
              );
            })}
          </ul>
        </DetailSection>

        <DetailSection heading="Product capabilities and dependencies">
          <ul className="space-y-3">
            {category.featureDependencies.map((dependency) => {
              const capability = catalog.capabilities[dependency.capabilityId];
              const purpose = catalog.purposes[dependency.purposeId];
              if (!capability || !purpose) {
                return null;
              }

              return (
                <li key={`${dependency.capabilityId}-${dependency.purposeId}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-slate-900">
                      {capability.name}
                    </p>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                      {formatDependencyStrength(dependency.strength)} {purpose.shortName}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    {dependency.description} {formatDependencyImpact(dependency.impact)}.
                  </p>
                </li>
              );
            })}
          </ul>
        </DetailSection>

        <DetailSection
          heading={
            category.processingRequirement === "required"
              ? "Why this stays on"
              : "If you turn this off"
          }
        >
          <ul className="space-y-3">
            {category.consequencesIfDisabled.map((consequence, index) => (
              <li className="flex gap-3" key={`${consequence.effect}-${index}`}>
                <span
                  aria-hidden="true"
                  className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-amber-400"
                />
                <div>
                  <p className="text-xs font-semibold text-slate-700">
                    {formatConsequenceEffect(consequence.effect)}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    {consequence.description}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </DetailSection>

        <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-3 text-xs leading-5 text-emerald-900">
          Retention is shown for transparency. This demo does not offer a control for changing how long data is kept.
        </div>
      </div>
    </aside>
  );
}

function DetailFact({
  children,
  label,
}: {
  readonly children: React.ReactNode;
  readonly label: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
        {label}
      </dt>
      <dd className="mt-1 text-xs font-medium leading-5 text-slate-800">{children}</dd>
    </div>
  );
}

function DetailSection({
  children,
  heading,
}: {
  readonly children: React.ReactNode;
  readonly heading: string;
}) {
  return (
    <section>
      <h4 className="section-label">{heading}</h4>
      <div className="mt-3">{children}</div>
    </section>
  );
}

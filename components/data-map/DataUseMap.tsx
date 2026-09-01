import { isProcessingEnabled } from "@/lib/privacy/engine";
import type {
  DataCategoryDefinition,
  PrivacyAccountState,
  PrivacyCatalog,
} from "@/lib/privacy/types";

interface DataUseMapProps {
  readonly category: DataCategoryDefinition;
  readonly catalog: PrivacyCatalog;
  readonly state: PrivacyAccountState;
}

export default function DataUseMap({
  category,
  catalog,
  state,
}: DataUseMapProps) {
  const active = isProcessingEnabled(state, category.id, catalog);

  return (
    <section
      aria-labelledby="data-map-heading"
      className="surface-card overflow-hidden"
      id="data-use-map"
    >
      <div className="border-b border-slate-200 px-5 py-5 sm:px-7 sm:py-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="eyebrow">Data-use map</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950" id="data-map-heading">
              Follow one category through the product
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              This readable relationship view is derived from the service model. Select another category above to inspect its live paths.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-medium">
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-emerald-800">
              Active current path
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-slate-600">
              Paused optional path
            </span>
          </div>
        </div>
      </div>

      <div className="grid gap-4 p-5 sm:p-7 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <div
          className={`rounded-2xl border p-5 ${
            active
              ? "border-emerald-200 bg-emerald-50/60"
              : "border-dashed border-slate-300 bg-slate-50"
          }`}
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-500">
            Data category
          </p>
          <h3 className="mt-3 text-lg font-semibold leading-6 text-slate-950">
            {category.name}
          </h3>
          <p className="mt-3 text-xs leading-5 text-slate-600">
            {active
              ? "This category is active in the current account state."
              : "This optional category is disabled in the current account state."}
          </p>
          <span
            className={`mt-5 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
              active
                ? "bg-emerald-100 text-emerald-800"
                : "bg-slate-200 text-slate-700"
            }`}
          >
            {active ? "Processing active" : "Processing paused"}
          </span>
        </div>

        <ol className="space-y-3" aria-label={`${category.name} data-use relationships`}>
          {category.purposeIds.map((purposeId) => {
            const purpose = catalog.purposes[purposeId];
            if (!purpose) {
              return null;
            }

            const dependencies = category.featureDependencies.filter(
              (dependency) => dependency.purposeId === purposeId,
            );
            const destinations = category.sharedWith.flatMap((destination) => {
              if (!destination.purposeIds.includes(purposeId)) {
                return [];
              }

              const recipient = catalog.recipients[destination.recipientId];
              return recipient ? [{ recipient, destination }] : [];
            });

            return (
              <li
                className={`rounded-2xl border p-4 sm:p-5 ${
                  active
                    ? "border-slate-200 bg-white"
                    : "border-dashed border-slate-200 bg-slate-50/80 opacity-80"
                }`}
                key={purposeId}
              >
                <div className="grid gap-4 sm:grid-cols-[minmax(9rem,0.7fr)_minmax(0,1.3fr)] sm:items-start">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-slate-500">
                      Purpose
                    </p>
                    <h4 className="mt-2 font-semibold text-slate-950">{purpose.name}</h4>
                    <p className="mt-1 text-xs leading-5 text-slate-600">
                      {purpose.description}
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <FlowEndpoint label="Product capability">
                      {dependencies.length > 0 ? (
                        dependencies.map((dependency) => {
                          const capability = catalog.capabilities[dependency.capabilityId];
                          return capability ? (
                            <FlowBadge key={dependency.capabilityId} muted={!active}>
                              {capability.name}
                            </FlowBadge>
                          ) : null;
                        })
                      ) : (
                        <span className="text-xs text-slate-500">No separate capability</span>
                      )}
                    </FlowEndpoint>
                    <FlowEndpoint label="Recipient">
                      {destinations.length > 0 ? (
                        destinations.map(({ recipient }) => (
                          <FlowBadge
                            key={recipient.id}
                            muted={!active}
                            external={recipient.kind === "third_party"}
                          >
                            {recipient.name}
                            <span className="ml-1 font-normal">
                              · {active ? "active" : "paused"}
                            </span>
                          </FlowBadge>
                        ))
                      ) : (
                        <span className="text-xs text-slate-500">No recipient listed</span>
                      )}
                    </FlowEndpoint>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      <p className="border-t border-slate-200 bg-slate-50 px-5 py-4 text-xs leading-5 text-slate-500 sm:px-7">
        A paused path remains visible so you can understand the trade-off. It is not an active data flow, and the catalog itself has not been changed.
      </p>
    </section>
  );
}

function FlowEndpoint({
  children,
  label,
}: {
  readonly children: React.ReactNode;
  readonly label: string;
}) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        {label}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function FlowBadge({
  children,
  external = false,
  muted,
}: {
  readonly children: React.ReactNode;
  readonly external?: boolean;
  readonly muted: boolean;
}) {
  return (
    <span
      className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${
        muted
          ? "border-slate-200 bg-white text-slate-500"
          : external
            ? "border-amber-200 bg-amber-50 text-amber-800"
            : "border-emerald-200 bg-emerald-50 text-emerald-800"
      }`}
    >
      {children}
    </span>
  );
}

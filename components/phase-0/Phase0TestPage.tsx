"use client";

import { useEffect, useState } from "react";
import { getSeededPrivacySummary } from "@/lib/privacy/summary";
import {
  registerWebMcpTools,
  type WebMcpRegistrationResult,
} from "@/lib/webmcp/register-tools";

const seededSummary = getSeededPrivacySummary().data;

type PageStatus = "checking" | WebMcpRegistrationResult["status"];

function statusLabel(status: PageStatus): string {
  switch (status) {
    case "registered":
      return "WebMCP available — get_privacy_summary is registered";
    case "unavailable":
      return "WebMCP unavailable in this browser";
    case "error":
      return "WebMCP detected, but registration failed";
    default:
      return "Checking WebMCP browser support…";
  }
}

function statusClasses(status: PageStatus): string {
  switch (status) {
    case "registered":
      return "border-emerald-400/30 bg-emerald-400/10 text-emerald-100";
    case "unavailable":
      return "border-amber-300/30 bg-amber-300/10 text-amber-100";
    case "error":
      return "border-rose-300/30 bg-rose-300/10 text-rose-100";
    default:
      return "border-slate-500/40 bg-slate-500/10 text-slate-200";
  }
}

export default function Phase0TestPage() {
  const [status, setStatus] = useState<PageStatus>("checking");
  const [statusReason, setStatusReason] = useState(
    "The page checks for the real document.modelContext API after hydration.",
  );
  const [invocationCount, setInvocationCount] = useState(0);

  useEffect(() => {
    let isMounted = true;

    void registerWebMcpTools(() => {
      if (isMounted) {
        setInvocationCount((count) => count + 1);
      }
    }).then((result) => {
      if (!isMounted) {
        return;
      }

      setStatus(result.status);
      setStatusReason(
        result.status === "registered"
          ? "The page registered exactly one read-only browser tool."
          : result.reason,
      );
    });

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <main className="min-h-screen px-6 py-12 sm:px-10 lg:px-16">
      <div className="mx-auto max-w-5xl">
        <header className="mb-10 max-w-3xl">
          <p className="mb-4 font-mono text-xs uppercase tracking-[0.28em] text-emerald-300">
            Snook · Phase 0
          </p>
          <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            WebMCP Phase 0 Test
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
            A minimal proof that this webpage can register a real browser WebMCP
            tool for an agent to discover and invoke.
          </p>
        </header>

        <section
          aria-live="polite"
          className={`mb-8 rounded-2xl border px-5 py-4 ${statusClasses(status)}`}
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 rounded-full bg-current"
            />
            <p className="font-medium">{statusLabel(status)}</p>
          </div>
          <p className="mt-2 text-sm opacity-80">{statusReason}</p>
          {status === "unavailable" && (
            <p className="mt-2 text-sm opacity-80">
              The human-facing page remains usable. No fake tool or alternate
              MCP mechanism is being used.
            </p>
          )}
          {status === "error" && (
            <p className="mt-2 text-sm opacity-80">
              Resolve the browser registration issue before treating WebMCP as
              proven.
            </p>
          )}
        </section>

        <section className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <article className="rounded-2xl border border-white/10 bg-white/[0.045] p-5">
            <p className="text-sm text-slate-400">Privacy score</p>
            <p className="mt-3 text-3xl font-semibold text-white">
              {seededSummary.privacyScore}
              <span className="ml-1 text-base font-normal text-slate-400">
                / 100
              </span>
            </p>
            <p className="mt-2 text-sm text-slate-300">
              {seededSummary.privacyStatus}
            </p>
          </article>

          <article className="rounded-2xl border border-white/10 bg-white/[0.045] p-5">
            <p className="text-sm text-slate-400">Data categories</p>
            <p className="mt-3 text-3xl font-semibold text-white">
              {seededSummary.dataCategoryCount}
            </p>
            <p className="mt-2 text-sm text-slate-300">
              {seededSummary.enabledOptionalProcessingCount} optional uses
              enabled
            </p>
          </article>

          <article className="rounded-2xl border border-white/10 bg-white/[0.045] p-5">
            <p className="text-sm text-slate-400">Required processing</p>
            <p className="mt-3 text-3xl font-semibold text-white">
              {seededSummary.requiredProcessingCount}
            </p>
            <p className="mt-2 text-sm text-slate-300">
              Account profile and fraud protection
            </p>
          </article>

          <article className="rounded-2xl border border-white/10 bg-white/[0.045] p-5">
            <p className="text-sm text-slate-400">Tool invocations</p>
            <p className="mt-3 text-3xl font-semibold text-white">
              {invocationCount}
            </p>
            <p className="mt-2 text-sm text-slate-300">
              {invocationCount === 0
                ? "Waiting for a browser agent"
                : "get_privacy_summary calls observed"}
            </p>
          </article>
        </section>

        <section className="mt-5 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          <article className="rounded-2xl border border-white/10 bg-white/[0.045] p-6">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="text-lg font-medium text-white">
                Seeded privacy summary
              </h2>
              <span className="font-mono text-xs text-slate-500">
                state v{seededSummary.stateVersion}
              </span>
            </div>

            <div className="mt-6 space-y-6 text-sm">
              <div>
                <h3 className="font-medium text-slate-200">
                  Enabled optional processing
                </h3>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {seededSummary.enabledOptionalProcessingCategories.map(
                    (category) => (
                      <li
                        className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 font-mono text-xs text-emerald-100"
                        key={category}
                      >
                        {category}
                      </li>
                    ),
                  )}
                </ul>
              </div>

              <div>
                <h3 className="font-medium text-slate-200">
                  Required processing
                </h3>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {seededSummary.requiredProcessingCategories.map(
                    (category) => (
                      <li
                        className="rounded-full border border-sky-300/20 bg-sky-300/10 px-3 py-1 font-mono text-xs text-sky-100"
                        key={category}
                      >
                        {category}
                      </li>
                    ),
                  )}
                </ul>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <h3 className="font-medium text-slate-200">
                    Third-party sharing
                  </h3>
                  <p className="mt-2 text-slate-300">
                    {seededSummary.thirdPartySharing.join(", ")}
                  </p>
                </div>
                <div>
                  <h3 className="font-medium text-slate-200">
                    Privacy opportunities
                  </h3>
                  <ul className="mt-2 space-y-1 text-slate-300">
                    {seededSummary.highestImpactPrivacyOpportunities.map(
                      (opportunity) => (
                        <li key={opportunity}>· {opportunity}</li>
                      ),
                    )}
                  </ul>
                </div>
              </div>
            </div>
          </article>

          <article className="rounded-2xl border border-white/10 bg-slate-950/60 p-6">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="text-lg font-medium text-white">
                Real tool contract
              </h2>
              <span className="rounded-full border border-emerald-300/20 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-emerald-200">
                read only
              </span>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              The browser receives one tool with an empty object input schema.
              The result below is deterministic and explicitly reports that no
              changes were made.
            </p>
            <pre className="mt-5 max-h-[27rem] overflow-auto rounded-xl border border-white/10 bg-black/20 p-4 text-xs leading-6 text-emerald-100">
              {JSON.stringify(
                {
                  input: {},
                  output: getSeededPrivacySummary(),
                },
                null,
                2,
              )}
            </pre>
          </article>
        </section>

        <footer className="mt-8 border-t border-white/10 pt-5 text-sm text-slate-500">
          Tool name: <code className="text-slate-300">get_privacy_summary</code>
          . This Phase 0 page does not implement planning, approval, mutation,
          or any later privacy-product tools.
        </footer>
      </div>
    </main>
  );
}

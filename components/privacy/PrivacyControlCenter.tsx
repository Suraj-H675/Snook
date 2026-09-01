"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { getAllDataCategories, getDataCategory, getPrivacySummary } from "@/lib/privacy/engine";
import { PRIVACY_CATALOG } from "@/lib/privacy/catalog";
import { SEEDED_PRIVACY_STATE } from "@/lib/privacy/seed";
import type { DataCategoryId } from "@/lib/privacy/types";
import {
  getPrivacyStateStore,
  privacyStateStore,
} from "@/lib/state/store";
import {
  registerWebMcpTools,
  type WebMcpRegistrationResult,
} from "@/lib/webmcp/register-tools";
import DataUseMap from "@/components/data-map/DataUseMap";
import ResetDemoButton from "@/components/demo/ResetDemoButton";
import CategoryDetailPanel from "./CategoryDetailPanel";
import PrivacyCategoryCard from "./PrivacyCategoryCard";
import PrivacyOverview from "./PrivacyOverview";

type PageStatus = "checking" | WebMcpRegistrationResult["status"];

function statusLabel(status: PageStatus): string {
  switch (status) {
    case "registered":
      return "Browser agent connected · read-only tool ready";
    case "unavailable":
      return "WebMCP unavailable in this browser";
    case "error":
      return "WebMCP detected, but registration failed";
    default:
      return "Checking browser agent support…";
  }
}

function statusStyles(status: PageStatus): string {
  switch (status) {
    case "registered":
      return "border-emerald-200 bg-emerald-50 text-emerald-900";
    case "unavailable":
      return "border-amber-200 bg-amber-50 text-amber-900";
    case "error":
      return "border-rose-200 bg-rose-50 text-rose-900";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

export default function PrivacyControlCenter() {
  const currentState = useSyncExternalStore(
    privacyStateStore.subscribe,
    privacyStateStore.getState,
    () => SEEDED_PRIVACY_STATE,
  );
  const [selectedCategoryId, setSelectedCategoryId] =
    useState<DataCategoryId>("activity_history");
  const [status, setStatus] = useState<PageStatus>("checking");
  const [statusReason, setStatusReason] = useState(
    "The page checks for WebMCP after the human interface is ready.",
  );
  const [invocationCount, setInvocationCount] = useState(0);
  const [feedback, setFeedback] = useState(
    "Choose any optional setting to see the posture and data-use map update instantly.",
  );

  const categories = getAllDataCategories(PRIVACY_CATALOG);
  const optionalCategoryCount = categories.filter(
    (category) => category.processingRequirement === "optional",
  ).length;
  const selectedCategory =
    getDataCategory(selectedCategoryId, PRIVACY_CATALOG) ?? categories[0];
  const summary = getPrivacySummary(currentState, PRIVACY_CATALOG).data;

  useEffect(() => {
    let isMounted = true;

    // Hydrate before registration so the read-only tool and the first human
    // render share the same persisted current state.
    getPrivacyStateStore().hydrate();

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
          ? "get_privacy_summary can read the same live state shown on this page."
          : result.reason,
      );
    });

    return () => {
      isMounted = false;
    };
  }, []);

  function handleToggle(categoryId: DataCategoryId): void {
    const category = PRIVACY_CATALOG.categories[categoryId];
    const currentConsent = currentState.categories[categoryId].consentState;
    const desiredState = currentConsent === "enabled" ? "disabled" : "enabled";
    const result = privacyStateStore.setCategoryConsentState(
      categoryId,
      desiredState,
    );

    if (!result.ok) {
      setFeedback(result.error.message);
      return;
    }

    const nextSummary = getPrivacySummary(result.state, PRIVACY_CATALOG).data;
    setFeedback(
      `${category.name} is now ${desiredState}. Privacy posture is ${nextSummary.privacyScore}/100 · live state v${nextSummary.stateVersion}.`,
    );
  }

  function handleReset(): void {
    const resetState = privacyStateStore.reset();
    setSelectedCategoryId("activity_history");
    const resetSummary = getPrivacySummary(resetState, PRIVACY_CATALOG).data;
    setFeedback(
      `Demo reset to the canonical account: ${resetSummary.privacyScore}/100 and live state v${resetSummary.stateVersion}.`,
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f8f7] text-slate-900">
      <header className="border-b border-slate-200/90 bg-white/90">
        <div className="page-shell flex flex-wrap items-center justify-between gap-4 py-4">
          <div className="flex items-center gap-3">
            <div
              aria-hidden="true"
              className="grid h-10 w-10 place-items-center rounded-xl bg-slate-950 text-lg font-semibold text-emerald-300"
            >
              S
            </div>
            <div>
              <p className="font-semibold tracking-tight text-slate-950">Snook</p>
              <p className="text-xs text-slate-500">Privacy Control Center</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <div
              aria-live="polite"
              className={`flex max-w-full items-center gap-2 rounded-xl border px-3 py-2 text-xs ${statusStyles(status)}`}
            >
              <span
                aria-hidden="true"
                className={`h-2 w-2 shrink-0 rounded-full ${
                  status === "registered"
                    ? "bg-emerald-500"
                    : status === "error"
                      ? "bg-rose-500"
                      : status === "unavailable"
                        ? "bg-amber-500"
                        : "bg-slate-400"
                }`}
              />
              <span className="min-w-0">
                <span className="font-semibold">{statusLabel(status)}</span>
                <span className="ml-2 hidden text-current/70 sm:inline">
                  {statusReason}
                </span>
              </span>
            </div>
            <ResetDemoButton onReset={handleReset} />
          </div>
        </div>
      </header>

      <main className="page-shell pb-12">
        <section className="grid gap-8 py-10 lg:grid-cols-[minmax(0,1.25fr)_minmax(18rem,0.75fr)] lg:items-end lg:py-14">
          <div>
            <p className="eyebrow">A calmer way to understand data</p>
            <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-[-0.045em] text-slate-950 sm:text-5xl lg:text-6xl">
              See what your data does. Choose what stays on.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
              Snook turns a fictional account&apos;s privacy settings into a readable map of purposes, features, sharing, and retention. You stay in control of every optional choice.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a
                className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
                href="#privacy-controls"
              >
                Review privacy controls
              </a>
              <a
                className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:border-slate-400 hover:bg-slate-50"
                href="#data-use-map"
              >
                Explore the data-use map
              </a>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_12px_35px_rgba(15,23,42,0.05)]">
            <div className="flex items-center justify-between gap-4">
              <p className="section-label">Demo account</p>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                Fictional data only
              </span>
            </div>
            <p className="mt-4 text-lg font-semibold tracking-tight text-slate-950">
              Your choices stay in this browser
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Optional settings persist across reloads for this demo. Reset returns everything to the known starting point.
            </p>
            <p className="mt-4 border-t border-slate-200 pt-4 text-xs leading-5 text-slate-500">
              The current browser integration is read-only: the agent may inspect this state, while optional changes here are made directly by you.
            </p>
          </div>
        </section>

        <div
          aria-live="polite"
          className="mb-6 rounded-xl border border-emerald-100 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-950"
          role="status"
        >
          {feedback}
        </div>

        <PrivacyOverview
          catalog={PRIVACY_CATALOG}
          optionalCategoryCount={optionalCategoryCount}
          summary={summary}
        />

        <section
          aria-labelledby="controls-heading"
          className="mt-8"
          id="privacy-controls"
        >
          <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow">Privacy controls</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950" id="controls-heading">
                Manage the uses you can change
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                All eight categories are shown below. Required processing is protected; optional processing can be changed directly by a human.
              </p>
            </div>
            <p className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600">
              {summary.requiredProcessingCount} required · {optionalCategoryCount} optional
            </p>
          </div>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.08fr)_minmax(20rem,0.92fr)] lg:items-start">
            <div className="grid gap-3 sm:grid-cols-2">
              {categories.map((category) => (
                <PrivacyCategoryCard
                  category={category}
                  catalog={PRIVACY_CATALOG}
                  enabled={currentState.categories[category.id].consentState !== "disabled"}
                  key={category.id}
                  onSelect={() => setSelectedCategoryId(category.id)}
                  onToggle={() => handleToggle(category.id)}
                  selected={category.id === selectedCategory.id}
                />
              ))}
            </div>

            <CategoryDetailPanel
              category={selectedCategory}
              catalog={PRIVACY_CATALOG}
              state={currentState}
            />
          </div>
        </section>

        <div className="mt-8">
          <DataUseMap
            category={selectedCategory}
            catalog={PRIVACY_CATALOG}
            state={currentState}
          />
        </div>

        <footer className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 py-5 text-xs text-slate-500">
          <p>
            Snook · live privacy state v{summary.stateVersion} · {invocationCount} read-only tool {invocationCount === 1 ? "call" : "calls"} observed
          </p>
          <p>Optional changes are human UI actions. No agent mutation is exposed in this phase.</p>
        </footer>
      </main>
    </div>
  );
}

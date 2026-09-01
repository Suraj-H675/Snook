import { formatRetention } from "@/lib/privacy/engine";
import type {
  DataCategoryDefinition,
  PrivacyCatalog,
} from "@/lib/privacy/types";
import ConsentControl from "./ConsentControl";
import { formatDataSource } from "./formatters";

interface PrivacyCategoryCardProps {
  readonly category: DataCategoryDefinition;
  readonly catalog: PrivacyCatalog;
  readonly enabled: boolean;
  readonly onSelect: () => void;
  readonly onToggle: () => void;
  readonly selected: boolean;
}

export default function PrivacyCategoryCard({
  category,
  catalog,
  enabled,
  onSelect,
  onToggle,
  selected,
}: PrivacyCategoryCardProps) {
  const purposeNames = category.purposeIds.flatMap((purposeId) => {
    const purpose = catalog.purposes[purposeId];
    return purpose ? [purpose.name] : [];
  });

  return (
    <article
      className={`rounded-2xl border p-4 transition-[border-color,box-shadow,background-color] motion-reduce:transition-none sm:p-5 ${
        selected
          ? "border-emerald-300 bg-emerald-50/40 shadow-[0_0_0_3px_rgba(16,185,129,0.08)]"
          : "border-slate-200 bg-white hover:border-slate-300"
      }`}
    >
      <div className="flex items-start gap-3">
        <button
          aria-current={selected ? "true" : undefined}
          aria-label={`Inspect ${category.name}`}
          className="min-w-0 flex-1 text-left"
          onClick={onSelect}
          type="button"
        >
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-slate-950">{category.name}</h3>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                category.processingRequirement === "required"
                  ? "bg-sky-100 text-sky-800"
                  : enabled
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-slate-100 text-slate-600"
              }`}
            >
              {category.processingRequirement === "required"
                ? "Required"
                : enabled
                  ? "Optional · enabled"
                  : "Optional · disabled"}
            </span>
          </div>
          <p className="mt-2 text-sm leading-5 text-slate-600">
            {category.description}
          </p>
        </button>

        <ConsentControl
          category={category}
          enabled={enabled}
          onChange={onToggle}
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t border-slate-200/80 pt-3 text-xs text-slate-500">
        <span>{formatDataSource(category.source)}</span>
        <span>Retained {formatRetention(category.retention)}</span>
        <span>{purposeNames.length} {purposeNames.length === 1 ? "purpose" : "purposes"}</span>
      </div>
    </article>
  );
}

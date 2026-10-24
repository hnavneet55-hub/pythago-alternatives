"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { useProgress } from "@/lib/progress";

type Bucket = { count: number; spend: number };
type Props = {
  summary: Record<"ARCHIVE" | "IMPROVE" | "KEEP" | "TOO_EARLY" | "REVIEW", Bucket>;
  currency: string;
  needsNiche: boolean;
};

const ITEMS = [
  { key: "ARCHIVE", label: "Archive", tone: "border-red-200 bg-red-50 text-red-800", active: "ring-2 ring-red-400" },
  { key: "IMPROVE", label: "Improve", tone: "border-amber-200 bg-amber-50 text-amber-800", active: "ring-2 ring-amber-400" },
  { key: "KEEP", label: "Keep / scale", tone: "border-emerald-200 bg-emerald-50 text-emerald-800", active: "ring-2 ring-emerald-400" },
  { key: "TOO_EARLY", label: "Too early", tone: "border-slate-200 bg-slate-50 text-slate-700", active: "ring-2 ring-slate-400" },
  { key: "REVIEW", label: "For review", tone: "border-violet-200 bg-violet-50 text-violet-800", active: "ring-2 ring-violet-400" },
] as const;

/** Archive / improve counts that double as a filter for the product table. */
export function DecisionStrip({ summary, currency, needsNiche }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  useProgress(pending);
  const current = sp.get("decision")?.toUpperCase() ?? "";
  const fmt = new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 });

  function pick(key: string) {
    const next = new URLSearchParams(sp.toString());
    if (current === key) next.delete("decision");
    else next.set("decision", key);
    next.delete("page");
    start(() => router.push(`${pathname}?${next.toString()}`));
  }

  return (
    <div className={`flex flex-wrap items-stretch gap-2 ${pending ? "opacity-70" : ""}`}>
      {ITEMS.map((it) => {
        const b = summary[it.key];
        return (
          <button
            key={it.key}
            type="button"
            onClick={() => pick(it.key)}
            aria-pressed={current === it.key}
            className={`min-w-36 rounded-lg border px-3 py-2 text-left transition hover:shadow-xs ${it.tone} ${current === it.key ? it.active : ""}`}
          >
            <div className="text-xs font-semibold uppercase tracking-wide">{it.label}</div>
            <div className="text-lg font-semibold tabular-nums">{b.count}</div>
            <div className="text-[11px] opacity-80">{fmt.format(b.spend)} ad spend</div>
          </button>
        );
      })}
      <div className="flex min-w-60 flex-1 items-center px-2 text-xs text-slate-500">
        {current ? "Click the selected box again to show all products." : "Click a box to show only those products."}{" "}
        {needsNiche && (
          <a href="/settings#targets" className="ml-1 font-medium text-violet-700 hover:underline">
            Set the store&apos;s niche for break-even and COGS checks →
          </a>
        )}
      </div>
    </div>
  );
}

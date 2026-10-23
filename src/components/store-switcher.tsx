"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

type Props = {
  stores: { id: number; name: string; currency: string }[];
  selectedIds: number[]; // empty = all stores
  currency: string;
  currencyOptions: string[];
  mixed: boolean;
};

export function StoreSwitcher({ stores, selectedIds, currency, currencyOptions, mixed }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();
  const all = selectedIds.length === 0;

  function go(ids: number[], cur?: string) {
    const next = new URLSearchParams(sp.toString());
    next.delete("store");
    next.delete("page");
    if (ids.length === 0) next.delete("stores");
    else next.set("stores", ids.join(","));
    if (cur !== undefined) {
      if (cur) next.set("cur", cur);
      else next.delete("cur");
    }
    const qs = next.toString();
    startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname));
  }

  // From "All stores", clicking a store shows just that store; after that, clicks add or remove stores.
  function toggle(id: number) {
    if (all) return go([id]);
    go(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  }

  const pill = (active: boolean) =>
    `inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${
      active
        ? "border-violet-600 bg-violet-600 text-white shadow-xs"
        : "border-slate-300 bg-white text-slate-700 hover:border-violet-300 hover:bg-violet-50"
    }`;

  return (
    <div className={`flex flex-wrap items-center gap-2 ${pending ? "opacity-70" : ""}`}>
      <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Stores</span>
      <button type="button" onClick={() => go([])} className={pill(all)} aria-pressed={all}>
        All stores
      </button>
      {stores.map((s) => {
        const active = !all && selectedIds.includes(s.id);
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => toggle(s.id)}
            className={pill(active)}
            aria-pressed={active}
            title={active ? `Remove ${s.name} from the selection` : `Add ${s.name} to the selection`}
          >
            {active && <span aria-hidden>✓</span>}
            {s.name}
            <span className={`rounded px-1 text-[10px] font-semibold ${active ? "bg-white/20" : "bg-slate-100 text-slate-500"}`}>
              {s.currency}
            </span>
          </button>
        );
      })}
      <span className="ml-auto flex items-center gap-2 text-sm text-slate-600">
        {mixed ? (
          <>
            <span>Mixed currencies, shown in</span>
            <select
              value={currency}
              onChange={(e) => go(all ? [] : selectedIds, e.target.value)}
              className="h-8 rounded-md border border-slate-300 bg-white px-2 text-sm font-medium"
            >
              {currencyOptions.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </>
        ) : (
          <span>
            Values in <strong className="text-slate-900">{currency}</strong> (Google Ads currency)
          </span>
        )}
      </span>
    </div>
  );
}

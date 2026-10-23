"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

type Props = {
  countries: string[];
  tags: string[];
  showProductFilters?: boolean;
};

const day = (offset: number) => new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10);
const PRESETS = [
  { label: "Today", from: 0, to: 0 },
  { label: "Yesterday", from: 1, to: 1 },
  { label: "Last 7 days", from: 7, to: 1 },
  { label: "Last 14 days", from: 14, to: 1 },
  { label: "Last 30 days", from: 30, to: 1 },
  { label: "Last 90 days", from: 90, to: 1 },
];

const field =
  "h-9 rounded-md border border-slate-300 bg-white px-2.5 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-200";

export function FilterBar({ countries, tags, showProductFilters = true }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();

  function update(changes: Record<string, string | null>) {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    next.delete("page");
    startTransition(() => router.push(`${pathname}?${next.toString()}`));
  }

  const from = sp.get("from") ?? day(30);
  const to = sp.get("to") ?? day(1);

  return (
    <div className={`space-y-3 ${pending ? "opacity-70" : ""}`}>
      {showProductFilters && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            update({ q: String(new FormData(e.currentTarget).get("q") ?? "") });
          }}
        >
          <input
            name="q"
            defaultValue={sp.get("q") ?? ""}
            placeholder="Search by name, product ID or variant ID…  (press Enter)"
            className={`${field} w-full`}
          />
        </form>
      )}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {showProductFilters && (
          <select className={field} value={sp.get("status") ?? ""} onChange={(e) => update({ status: e.target.value })}>
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="DRAFT">Draft</option>
            <option value="ARCHIVED">Archived</option>
            <option value="DELETED">Deleted</option>
          </select>
        )}
        <select className={field} value={sp.get("country") ?? ""} onChange={(e) => update({ country: e.target.value })}>
          <option value="">All countries</option>
          {countries.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        {showProductFilters && (
          <select className={field} value={sp.get("tag") ?? ""} onChange={(e) => update({ tag: e.target.value })}>
            <option value="">All tags</option>
            {tags.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        )}
        <span className="mx-1 h-6 w-px bg-slate-200" />
        <select
          className={field}
          value=""
          onChange={(e) => {
            const p = PRESETS[Number(e.target.value)];
            if (p) update({ from: day(p.from), to: day(p.to) });
          }}
        >
          <option value="">Date preset…</option>
          {PRESETS.map((p, i) => (
            <option key={p.label} value={i}>
              {p.label}
            </option>
          ))}
        </select>
        <input type="date" className={field} value={from} max={to} onChange={(e) => update({ from: e.target.value })} />
        <span className="text-slate-400">→</span>
        <input type="date" className={field} value={to} min={from} onChange={(e) => update({ to: e.target.value })} />
      </div>
    </div>
  );
}

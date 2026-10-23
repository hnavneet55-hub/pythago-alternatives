"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function PageSize({ per }: { per: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  return (
    <label className="flex items-center gap-2 text-sm text-slate-600">
      Products per page
      <select
        value={per}
        onChange={(e) => {
          const next = new URLSearchParams(sp.toString());
          next.set("per", e.target.value);
          next.delete("page");
          router.push(`${pathname}?${next.toString()}`, { scroll: false });
        }}
        className="h-8 rounded-md border border-slate-300 bg-white px-2 font-medium"
      >
        {[25, 50, 75, 100].map((n) => (
          <option key={n}>{n}</option>
        ))}
      </select>
    </label>
  );
}

"use client";

import { useActionState } from "react";
import { useProgress } from "@/lib/progress";
import { bulkSetStatus } from "@/app/(dash)/product-actions";

const OPTIONS = [
  { value: "ACTIVE", label: "Active" },
  { value: "DRAFT", label: "Draft" },
  { value: "ARCHIVED", label: "Archived" },
  { value: "UNLISTED", label: "Unlisted" },
];

/** Status switch for a single product, on its SKU page. */
export function ProductStatusButtons({ storeId, productId, status }: { storeId: number; productId: string; status: string | null }) {
  const [state, action, pending] = useActionState(bulkSetStatus, null);
  useProgress(pending);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2 text-sm">
      <input type="hidden" name="sel" value={`${storeId}:${productId}`} />
      <span className="text-slate-500">Status in Shopify:</span>
      <div className="inline-flex overflow-hidden rounded-md border border-slate-300">
        {OPTIONS.map((o) => {
          const active = status === o.value;
          return (
            <button
              key={o.value}
              name="status"
              value={o.value}
              disabled={pending || active}
              onClick={(e) => {
                if (!window.confirm(`Set this product to ${o.label} in Shopify?`)) e.preventDefault();
              }}
              className={`px-3 py-1.5 font-medium ${
                active ? "bg-violet-600 text-white" : "bg-white text-slate-700 hover:bg-violet-50 disabled:opacity-50"
              } border-l border-slate-300 first:border-l-0`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      {pending && <span className="text-slate-500">Updating Shopify…</span>}
      {state?.ok && <span className="text-emerald-700">{state.ok}</span>}
      {state?.error && <span className="text-red-600">{state.failed?.[0]?.message ?? state.error}</span>}
    </form>
  );
}

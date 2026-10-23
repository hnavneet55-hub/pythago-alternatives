"use client";

import { useActionState, useEffect, useState } from "react";
import { bulkSetStatus } from "@/app/(dash)/product-actions";

export const BULK_FORM_ID = "bulk-status";
const SELECTOR = `input[name="sel"][form="${BULK_FORM_ID}"]`;

const STATUSES = [
  { value: "ACTIVE", label: "Active", hint: "for sale on your sales channels" },
  { value: "DRAFT", label: "Draft", hint: "hidden from customers" },
  { value: "ARCHIVED", label: "Archived", hint: "no longer sold, hidden" },
  { value: "UNLISTED", label: "Unlisted", hint: "live, but only reachable by direct link" },
];

function countSelected() {
  return document.querySelectorAll<HTMLInputElement>(`${SELECTOR}:checked`).length;
}

/** Action bar for the product checkboxes in the table (they belong to this form via form="bulk-status"). */
export function BulkStatusBar() {
  const [state, action, pending] = useActionState(bulkSetStatus, null);
  const [selected, setSelected] = useState(0);
  const [status, setStatus] = useState("DRAFT");

  useEffect(() => {
    const update = () => setSelected(countSelected());
    document.addEventListener("change", update);
    return () => document.removeEventListener("change", update);
  }, []);

  // After a successful update the page refreshes; clear the ticks.
  useEffect(() => {
    if (state?.ok) {
      document.querySelectorAll<HTMLInputElement>(SELECTOR).forEach((el) => (el.checked = false));
      document.querySelectorAll<HTMLInputElement>("input[data-select-all]").forEach((el) => (el.checked = false));
      document.dispatchEvent(new Event("change"));
    }
  }, [state]);

  const chosen = STATUSES.find((s) => s.value === status)!;

  return (
    <form
      id={BULK_FORM_ID}
      action={action}
      onSubmit={(e) => {
        const n = countSelected();
        if (!window.confirm(`Set ${n} ${n === 1 ? "product" : "products"} to ${chosen.label} in Shopify (${chosen.hint})?`)) e.preventDefault();
      }}
      className="flex flex-wrap items-center gap-2 text-sm"
    >
      <span className={selected ? "font-medium text-violet-700" : "text-slate-500"}>
        {selected ? `${selected} selected` : "Tick products to change their status"}
      </span>
      <select
        name="status"
        value={status}
        onChange={(e) => setStatus(e.target.value)}
        disabled={!selected || pending}
        className="h-8 rounded-md border border-slate-300 bg-white px-2 disabled:opacity-50"
        aria-label="New status"
      >
        {STATUSES.map((s) => (
          <option key={s.value} value={s.value}>
            Set to {s.label}
          </option>
        ))}
      </select>
      <button
        disabled={!selected || pending}
        className="h-8 rounded-md bg-violet-600 px-3 font-medium text-white hover:bg-violet-700 disabled:opacity-50"
      >
        {pending ? "Updating Shopify…" : "Apply"}
      </button>
      {state?.ok && <span className="text-emerald-700">{state.ok}</span>}
      {state?.error && (
        <span className="text-red-600" title={state.failed?.map((f) => `${f.product}: ${f.message}`).join("\n")}>
          {state.error}
          {state.failed?.[0] && `: ${state.failed[0].message}`}
        </span>
      )}
    </form>
  );
}

export function SelectAllCheckbox() {
  return (
    <input
      type="checkbox"
      data-select-all
      aria-label="Select all products on this page"
      className="h-4 w-4 accent-violet-600"
      onChange={(e) => {
        document.querySelectorAll<HTMLInputElement>(SELECTOR).forEach((el) => (el.checked = e.target.checked));
        document.dispatchEvent(new Event("change"));
      }}
    />
  );
}

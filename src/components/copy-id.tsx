"use client";

import { useState } from "react";

/** Small icon button that copies an ID to the clipboard. */
export function CopyId({ value, label = "product ID" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      data-freeze-allow
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      title={copied ? "Copied" : `Copy ${label} ${value}`}
      aria-label={`Copy ${label} ${value}`}
      className={`inline-flex h-5 items-center gap-1 rounded px-1 align-middle text-[10px] font-medium transition ${
        copied ? "bg-emerald-100 text-emerald-700" : "text-slate-400 hover:bg-slate-100 hover:text-violet-700"
      }`}
    >
      {copied ? (
        <>
          <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M3 8.5l3 3 7-7" />
          </svg>
          Copied
        </>
      ) : (
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
          <rect x="5" y="5" width="9" height="9" rx="1.5" />
          <path d="M11 5V3.5A1.5 1.5 0 009.5 2h-6A1.5 1.5 0 002 3.5v6A1.5 1.5 0 003.5 11H5" />
        </svg>
      )}
    </button>
  );
}

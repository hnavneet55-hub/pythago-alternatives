"use client";

import { useEffect } from "react";
import { restoreFrozen, setFrozen, useFrozen } from "@/lib/freeze";

const INTERACTIVE = "a, button, input, select, textarea, label, summary, [role=button], [contenteditable], [tabindex]";

/** While frozen, swallow clicks, form submits and key presses so nothing navigates or changes; text selection still works. */
export function FreezeGuard() {
  const frozen = useFrozen();

  useEffect(restoreFrozen, []);

  useEffect(() => {
    if (!frozen) return;
    const allowed = (e: Event) => !!(e.target as Element | null)?.closest?.("[data-freeze-allow]");
    const block = (e: Event) => {
      if (allowed(e)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    // Pressing on a field would focus it or open a dropdown; pressing on plain text must still start a selection.
    const blockPress = (e: Event) => {
      if (!allowed(e) && (e.target as Element | null)?.closest?.("input, select, textarea, label, [contenteditable]")) block(e);
    };
    const blockKey = (e: KeyboardEvent) => {
      if (allowed(e)) return;
      if (e.key === "Tab" || (e.target as Element | null)?.closest?.(INTERACTIVE)) block(e);
    };
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    const opts = { capture: true };
    const clicks = ["click", "auxclick", "submit"];
    clicks.forEach((t) => window.addEventListener(t, block, opts));
    ["mousedown", "pointerdown", "touchstart"].forEach((t) => window.addEventListener(t, blockPress, opts));
    window.addEventListener("keydown", blockKey, opts);
    window.addEventListener("beforeunload", warn);
    return () => {
      clicks.forEach((t) => window.removeEventListener(t, block, opts));
      ["mousedown", "pointerdown", "touchstart"].forEach((t) => window.removeEventListener(t, blockPress, opts));
      window.removeEventListener("keydown", blockKey, opts);
      window.removeEventListener("beforeunload", warn);
    };
  }, [frozen]);

  return null;
}

export function FreezeToggle() {
  const frozen = useFrozen();
  return (
    <button
      type="button"
      data-freeze-allow
      onClick={() => setFrozen(!frozen)}
      aria-pressed={frozen}
      title={frozen ? "Unfreeze: make the page clickable again" : "Freeze the page: nothing can be clicked, only text selected and copied"}
      className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-sm font-medium transition ${
        frozen
          ? "border-sky-600 bg-sky-600 text-white shadow-xs hover:bg-sky-700"
          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
      }`}
    >
      <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
        <rect x="3" y="7" width="10" height="7" rx="1.5" />
        {frozen ? <path d="M5.5 7V5a2.5 2.5 0 015 0v2" /> : <path d="M5.5 7V5a2.5 2.5 0 014.9-.7" />}
      </svg>
      {frozen ? "Frozen — click to unfreeze" : "Freeze page"}
    </button>
  );
}

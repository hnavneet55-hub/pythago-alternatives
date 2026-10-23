"use client";

import { useEffect, useRef, useState } from "react";

/** Wraps a panel with a button that expands it to fill the screen (Esc or the button to exit). */
export function FullscreenPanel({ toolbar, children }: { toolbar: React.ReactNode; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);

  useEffect(() => {
    const onChange = () => setFull(document.fullscreenElement === ref.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !document.fullscreenElement && setFull(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [full]);

  async function toggle() {
    if (full) {
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
      setFull(false);
      return;
    }
    setFull(true);
    // Real full screen where the browser allows it; the fixed overlay covers the window otherwise.
    await ref.current?.requestFullscreen?.().catch(() => {});
  }

  return (
    <div
      ref={ref}
      data-fullscreen={full || undefined}
      className={`group/full rounded-xl border border-slate-200 bg-white shadow-xs ${
        full ? "fixed inset-0 z-50 flex flex-col overflow-hidden rounded-none border-0" : ""
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        {toolbar}
        <button
          type="button"
          onClick={toggle}
          title={full ? "Exit full screen (Esc)" : "Full screen"}
          className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
            {full ? (
              <path d="M6 1v5H1M10 1v5h5M6 15v-5H1M10 15v-5h5" />
            ) : (
              <path d="M1 6V1h5M15 6V1h-5M1 10v5h5M15 10v5h-5" />
            )}
          </svg>
          {full ? "Exit full screen" : "Full screen"}
        </button>
      </div>
      <div className={full ? "min-h-0 flex-1 [&>div]:max-h-none [&>div]:h-full" : ""}>{children}</div>
    </div>
  );
}

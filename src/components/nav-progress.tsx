"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { beginProgress, useProgressActive } from "@/lib/progress";

/** Top-of-page loading bar for page changes, store/filter switches and server actions. */
export function NavProgress() {
  const pathname = usePathname();
  const sp = useSearchParams();
  const url = `${pathname}?${sp.toString()}`;
  const active = useProgressActive();
  const endNav = useRef<(() => void) | null>(null);
  const [width, setWidth] = useState(0);
  // In full screen only the full-screen element is drawn, so render the bar inside it.
  const host = useSyncExternalStore(
    (l) => {
      document.addEventListener("fullscreenchange", l);
      return () => document.removeEventListener("fullscreenchange", l);
    },
    () => document.fullscreenElement ?? document.body,
    () => null,
  );

  // Link clicks: start on click, finish when the URL changes (or after 30s, in case nothing changed).
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      const to = new URL(a.href, location.href);
      if (to.origin !== location.origin || (to.pathname === location.pathname && to.search === location.search)) return;
      endNav.current?.();
      const end = beginProgress();
      const timer = setTimeout(end, 30_000);
      endNav.current = () => {
        clearTimeout(timer);
        end();
        endNav.current = null;
      };
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  useEffect(() => {
    endNav.current?.();
  }, [url]);

  // Creep towards 90% while loading, then jump to 100% and fade out.
  useEffect(() => {
    if (active) {
      const kick = setTimeout(() => setWidth((w) => (w > 0 && w < 90 ? w : 8)), 0);
      const t = setInterval(() => setWidth((w) => w + (90 - w) * 0.08), 200);
      return () => {
        clearTimeout(kick);
        clearInterval(t);
      };
    }
    const finish = setTimeout(() => setWidth((w) => (w > 0 ? 100 : 0)), 0);
    const reset = setTimeout(() => setWidth(0), 400);
    return () => {
      clearTimeout(finish);
      clearTimeout(reset);
    };
  }, [active]);

  useEffect(() => {
    document.documentElement.classList.toggle("cursor-progress", active);
  }, [active]);

  if (!host) return null;
  return createPortal(
    <div aria-hidden={!active} className={`pointer-events-none fixed inset-x-0 top-0 z-[100] transition-opacity duration-300 ${active ? "opacity-100" : "opacity-0"}`}>
      <div
        role="progressbar"
        aria-label="Loading"
        className="h-[3px] bg-violet-600 shadow-[0_0_8px_rgba(124,58,237,0.6)] transition-[width] duration-200 ease-out"
        style={{ width: `${width}%` }}
      />
      {active && (
        <div className="absolute right-4 top-2 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-medium text-violet-700 shadow-md ring-1 ring-violet-200">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-violet-200 border-t-violet-600" />
          Loading…
        </div>
      )}
    </div>,
    host,
  );
}

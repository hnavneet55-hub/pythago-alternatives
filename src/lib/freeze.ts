"use client";

import { useSyncExternalStore } from "react";

// "Freeze" locks the page: nothing can be clicked or typed into, only text can be selected and copied.
const KEY = "adprofit:frozen";
const listeners = new Set<() => void>();

function read() {
  return typeof document !== "undefined" && document.documentElement.dataset.frozen === "true";
}

export function setFrozen(on: boolean) {
  if (on) {
    document.documentElement.dataset.frozen = "true";
    (document.activeElement as HTMLElement | null)?.blur?.();
  } else delete document.documentElement.dataset.frozen;
  try {
    if (on) sessionStorage.setItem(KEY, "1");
    else sessionStorage.removeItem(KEY);
  } catch {}
  listeners.forEach((l) => l());
}

/** Restores the freeze after a reload in the same tab. */
export function restoreFrozen() {
  try {
    if (sessionStorage.getItem(KEY) === "1") setFrozen(true);
  } catch {}
}

export function useFrozen() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    read,
    () => false,
  );
}

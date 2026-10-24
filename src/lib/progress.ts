"use client";

import { useEffect, useSyncExternalStore } from "react";

// How many things are loading right now (navigations, server actions). The top progress bar shows while it's > 0.
let active = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function beginProgress() {
  active++;
  emit();
  let done = false;
  return () => {
    if (done) return;
    done = true;
    active--;
    emit();
  };
}

export function useProgressActive() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => active > 0,
    () => false,
  );
}

/** Shows the top progress bar while `pending` is true (pass a useTransition / useActionState pending flag). */
export function useProgress(pending: boolean) {
  useEffect(() => (pending ? beginProgress() : undefined), [pending]);
}

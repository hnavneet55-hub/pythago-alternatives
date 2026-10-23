"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { login } from "./actions";

export function LoginForm() {
  const [error, action, pending] = useActionState(login, null);
  const next = useSearchParams().get("next") ?? "/";
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <label className="block text-sm font-medium text-slate-700">
        Team password
        <input
          name="password"
          type="password"
          required
          autoFocus
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
        />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        disabled={pending}
        className="w-full rounded-md bg-violet-600 px-4 py-2 font-medium text-white hover:bg-violet-700 disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

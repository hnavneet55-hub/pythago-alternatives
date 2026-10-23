"use client";

import { useActionState, useState, useTransition } from "react";
import { addStore, addStoresBulk, importCogsNow, removeStore, rotateIngestKey, setDefaultCogs, setTargets, syncStore, type ActionState } from "./actions";
import { NICHES } from "@/lib/decisions";

const input =
  "mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-200";

function Message({ state }: { state: ActionState }) {
  if (!state) return null;
  return <p className={`text-sm ${state.error ? "text-red-600" : "text-emerald-700"}`}>{state.error ?? state.ok}</p>;
}

export function AddStoreForm() {
  const [state, action, pending] = useActionState(addStore, null);
  const [mode, setMode] = useState<"client" | "token">("client");
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">
          Store name
          <input name="name" required placeholder="e.g. Boots DE" className={input} />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Shopify domain
          <input name="shopDomain" required placeholder="your-store.myshopify.com" className={input} />
        </label>
      </div>
      <div className="flex gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="radio" checked={mode === "client"} onChange={() => setMode("client")} /> Dev Dashboard app (Client ID + secret)
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" checked={mode === "token"} onChange={() => setMode("token")} /> Existing Admin API access token
        </label>
      </div>
      {mode === "client" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">
            Client ID
            <input name="clientId" required className={input} autoComplete="off" />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Client secret
            <input name="clientSecret" type="password" required className={input} autoComplete="off" />
          </label>
        </div>
      ) : (
        <label className="block text-sm font-medium text-slate-700">
          Admin API access token (shpat_…)
          <input name="accessToken" type="password" required className={input} autoComplete="off" />
        </label>
      )}
      <div className="flex items-center gap-4">
        <button disabled={pending} className="rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-60">
          {pending ? "Adding…" : "Add store"}
        </button>
        <Message state={state} />
      </div>
      <p className="text-xs text-slate-500">Secrets are encrypted before they are stored.</p>
    </form>
  );
}

export function StoreActions({ storeId, storeName }: { storeId: number; storeName: string }) {
  const [state, setState] = useState<ActionState>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        disabled={pending}
        onClick={() => start(async () => setState(await syncStore(storeId)))}
        className="rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-60"
      >
        {pending ? "Syncing…" : "Sync now"}
      </button>
      <button
        disabled={pending}
        onClick={() => {
          if (window.confirm(`Generate a new script key for ${storeName}? The old Google Ads script stops working until you paste the new one.`))
            start(() => rotateIngestKey(storeId));
        }}
        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
      >
        New script key
      </button>
      <button
        disabled={pending}
        onClick={() => {
          if (window.confirm(`Remove ${storeName} and all of its data from the dashboard?`)) start(() => removeStore(storeId));
        }}
        className="rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
      >
        Remove
      </button>
      <Message state={state} />
    </div>
  );
}

export function CopyBlock({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="absolute right-2 top-2 rounded-md bg-white px-2.5 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50"
      >
        {copied ? "Copied" : "Copy script"}
      </button>
      <pre className="max-h-72 overflow-auto rounded-lg bg-slate-900 p-4 text-[12px] leading-relaxed text-slate-100">{text}</pre>
    </div>
  );
}

export function CogsForm({ storeId, value }: { storeId: number; value: string }) {
  const [state, action, pending] = useActionState(setDefaultCogs, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="storeId" value={storeId} />
      <div className="relative">
        <input
          name="pct"
          defaultValue={value}
          inputMode="decimal"
          placeholder="e.g. 35"
          aria-label="Default cost of goods percent"
          className="h-9 w-28 rounded-md border border-slate-300 pl-3 pr-7 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
        />
        <span className="pointer-events-none absolute right-2.5 top-2 text-sm text-slate-400">%</span>
      </div>
      <button disabled={pending} className="h-9 rounded-md bg-violet-600 px-3 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-60">
        {pending ? "Saving…" : "Save"}
      </button>
      <Message state={state} />
    </form>
  );
}

export function ImportCogsButton() {
  const [state, setState] = useState<ActionState>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        disabled={pending}
        onClick={() => start(async () => setState(await importCogsNow()))}
        className="rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-60"
      >
        {pending ? "Importing…" : "Import costs now"}
      </button>
      <Message state={state} />
    </div>
  );
}

export function TargetsForm({ storeId, niche, cogs, roas }: { storeId: number; niche: string; cogs: string; roas: string }) {
  const [state, action, pending] = useActionState(setTargets, null);
  const [nicheValue, setNiche] = useState(niche);
  const [cogsValue, setCogs] = useState(cogs);
  const preset = NICHES.find((n) => n.name === nicheValue);
  const field = "h-9 rounded-md border border-slate-300 bg-white px-2.5 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-200";
  return (
    <form action={action} className="flex flex-wrap items-center gap-2 text-sm">
      <input type="hidden" name="storeId" value={storeId} />
      <select
        name="niche"
        value={nicheValue}
        onChange={(e) => {
          setNiche(e.target.value);
          const p = NICHES.find((n) => n.name === e.target.value);
          if (p) setCogs(String(p.cogs));
        }}
        className={field}
        aria-label="Niche"
      >
        <option value="">Niche…</option>
        {NICHES.map((n) => (
          <option key={n.name} value={n.name}>
            {n.name} ({n.range ? `${n.range[0]}–${n.range[1]}` : n.cogs}%)
          </option>
        ))}
        <option value="Custom">Custom</option>
      </select>
      <label className="flex items-center gap-1.5 text-slate-600">
        Target COGS
        <input name="cogs" value={cogsValue} onChange={(e) => setCogs(e.target.value)} inputMode="decimal" className={`${field} w-20`} placeholder="33" />%
      </label>
      <label className="flex items-center gap-1.5 text-slate-600">
        Target ROAS
        <input name="roas" defaultValue={roas} inputMode="decimal" className={`${field} w-20`} />
      </label>
      <button disabled={pending} className="h-9 rounded-md bg-violet-600 px-3 font-medium text-white hover:bg-violet-700 disabled:opacity-60">
        {pending ? "Saving…" : "Save"}
      </button>
      {preset?.range && (
        <span className="text-xs text-amber-700">
          Range {preset.range[0]}–{preset.range[1]}%: adjust to the product mix if needed
        </span>
      )}
      <Message state={state} />
    </form>
  );
}

export function BulkAddForm() {
  const [state, action, pending] = useActionState(addStoresBulk, null);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        // Keep the secrets out of the page once they're saved.
        const area = e.currentTarget.elements.namedItem("text") as HTMLTextAreaElement;
        setTimeout(() => (area.value = ""), 0);
      }}
      className="space-y-3"
    >
      <textarea
        name="text"
        required
        rows={10}
        spellCheck={false}
        autoComplete="off"
        placeholder={"Store name\nyour-store.myshopify.com\nClient ID - ...\nSecret - shpss_...\n\nNext store name\n..."}
        className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-[13px] outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
      />
      <div className="flex flex-wrap items-center gap-4">
        <button disabled={pending} className="rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-60">
          {pending ? "Saving…" : "Add stores"}
        </button>
        {state?.ok && <span className="text-sm text-emerald-700">{state.ok}</span>}
        {state?.error && <span className="text-sm text-red-600">{state.error}</span>}
      </div>
      {state?.lines && state.lines.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-5 text-sm text-slate-700">
          {state.lines.map((l) => (
            <li key={l} className={l.startsWith("Skipped") ? "text-amber-700" : ""}>
              {l}
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}

import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { CopyButton } from "@/components/copy-button";
import { sql } from "@/lib/db";
import { timeAgo } from "@/lib/format";
import { appOrigin } from "@/lib/origin";

export const metadata = { title: "Setup guide · AdProfit" };

const SCOPES = "read_products,write_products,read_orders,read_all_orders,read_inventory";

// ---------------------------------------------------------------- building blocks

function Part({ id, n, title, when, children }: { id: string; n: number; title: string; when: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 rounded-xl border border-slate-200 bg-white shadow-xs">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-slate-100 px-6 py-4">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-violet-600 text-sm font-semibold text-white">{n}</span>
        <h2 className="text-lg font-semibold">{title}</h2>
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">{when}</span>
      </header>
      <ol className="divide-y divide-slate-100">{children}</ol>
    </section>
  );
}

function Step({ id, n, title, children }: { id?: string; n: string; title: string; children: React.ReactNode }) {
  return (
    <li id={id} className="scroll-mt-20 px-6 py-5">
      <div className="flex gap-4">
        <span className="mt-0.5 shrink-0 font-mono text-sm font-semibold text-violet-700">{n}</span>
        <div className="min-w-0 flex-1 space-y-3 text-sm leading-relaxed text-slate-700">
          <h3 className="text-[15px] font-semibold text-slate-900">{title}</h3>
          {children}
        </div>
      </div>
    </li>
  );
}

function Path({ children }: { children: React.ReactNode }) {
  return <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-900">{children}</span>;
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[12.5px] text-slate-900">{children}</code>;
}

function Note({ tone = "info", title, children }: { tone?: "info" | "warn" | "ok"; title?: string; children: React.ReactNode }) {
  const styles = {
    info: "border-sky-200 bg-sky-50 text-sky-900",
    warn: "border-amber-200 bg-amber-50 text-amber-900",
    ok: "border-emerald-200 bg-emerald-50 text-emerald-900",
  }[tone];
  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${styles}`}>
      {title && <div className="mb-1 font-semibold">{title}</div>}
      {children}
    </div>
  );
}

function CopyLine({ value }: { value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <code className="min-w-0 flex-1 break-all font-mono text-[12.5px] text-slate-900">{value}</code>
      <CopyButton text={value} />
    </div>
  );
}

function Problem({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <details className="group px-6 py-4">
      <summary className="flex cursor-pointer list-none items-start gap-3 font-medium text-slate-900">
        <span className="mt-0.5 text-violet-600 transition group-open:rotate-90">▸</span>
        {q}
      </summary>
      <div className="mt-3 space-y-2 pl-6 text-sm leading-relaxed text-slate-700">{children}</div>
    </details>
  );
}

// ---------------------------------------------------------------- page

export default function GuidePage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-16">
      <div>
        <h1 className="text-2xl font-semibold">Setup guide</h1>
        <p className="mt-1 text-slate-600">
          How to connect a Shopify store and its Google Ads account to AdProfit. Do the parts in order.
        </p>
      </div>

      <nav className="grid gap-3 sm:grid-cols-2">
        {[
          ["#before", "Before you start", "What you need ready", "2 min"],
          ["#part-1", "1. Create the Shopify app", "Only once, for all stores", "5 min"],
          ["#part-2", "2. Connect a Shopify store", "Repeat for every store", "3 min per store"],
          ["#part-3", "3. Connect Google Ads (script)", "Repeat for every store", "5 min per store"],
          ["#part-4", "4. Check the numbers", "After the first sync", "5 min"],
          ["#help", "Troubleshooting", "Error messages and fixes", ""],
        ].map(([href, title, sub, time]) => (
          <a key={href} href={href} className="rounded-lg border border-slate-200 bg-white px-4 py-3 hover:border-violet-300 hover:bg-violet-50">
            <div className="flex items-center justify-between">
              <span className="font-medium text-slate-900">{title}</span>
              {time && <span className="text-xs text-slate-500">{time}</span>}
            </div>
            <div className="text-sm text-slate-500">{sub}</div>
          </a>
        ))}
      </nav>

      <Suspense fallback={<div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading your stores…</div>}>
        <Progress />
      </Suspense>

      {/* ------------------------------------------------------------ before */}
      <section id="before" className="scroll-mt-20 rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
        <h2 className="mb-4 text-lg font-semibold">Before you start</h2>
        <ul className="space-y-3 text-sm leading-relaxed text-slate-700">
          <li>
            <strong>Shopify access:</strong> you need to be the store owner, or a staff member allowed to develop apps. To check, go to{" "}
            <Path>Shopify admin → Settings → Users</Path>, open your user, and confirm <em>Develop apps</em> is allowed.
          </li>
          <li>
            <strong>Each store&apos;s .myshopify.com address</strong>, for example <Code>boots-de.myshopify.com</Code>. Your normal shop domain
            (like <Code>mybrand.com</Code>) won&apos;t work. To find it, open the Shopify admin: the URL looks like{" "}
            <Code>admin.shopify.com/store/boots-de</Code>, which means the address is <Code>boots-de.myshopify.com</Code>. It&apos;s also shown in{" "}
            <Path>Settings → Domains</Path>.
          </li>
          <li>
            <strong>Google Ads access:</strong> <em>Admin</em> or <em>Standard</em> access to the Google Ads account that runs the Performance Max
            campaign for that store.
          </li>
          <li>
            <strong>Product feed from Shopify:</strong> products must reach Google through Shopify&apos;s <em>Google &amp; YouTube</em> app, so
            product IDs in Google Ads look like <Code>shopify_us_8490812702767_47004975956015</Code>. To check, go to{" "}
            <Path>Google Ads → Campaigns → your PMax campaign → Products</Path> (or Merchant Center → Products) and look at the item ID. If yours
            look different, read <a className="text-violet-700 hover:underline" href="#help-ids">this troubleshooting item</a> first.
          </li>
          <li>
            <strong>Product costs (for profit):</strong> fill in <Path>Shopify admin → Products → a product → Cost per item</Path> for every product
            (or variant). Without it, cost of goods counts as 0 and profit looks too high.
          </li>
        </ul>
      </section>

      {/* ------------------------------------------------------------ part 1 */}
      <Part id="part-1" n={1} title="Create the Shopify app" when="Once, for all stores">
        <Step n="1.1" title="Open the Shopify Dev Dashboard">
          <p>
            Go to{" "}
            <a href="https://dev.shopify.com" target="_blank" rel="noreferrer" className="font-medium text-violet-700 hover:underline">
              dev.shopify.com ↗
            </a>{" "}
            and log in with the <strong>same Shopify login</strong> you use for your stores.
          </p>
          <p>
            If you belong to more than one organization, Shopify asks which one to open. Pick the one that <strong>owns your stores</strong>.
          </p>
          <p>
            Click <Path>Stores</Path> in the left menu and check that <strong>all the stores you want to connect are listed</strong>.
          </p>
          <Note tone="warn" title="Important">
            The app only works for stores that appear in this list (the same organization as the app). If a store is missing, see{" "}
            <a className="font-medium underline" href="#help-org">“A store isn&apos;t in my organization”</a> before continuing.
          </Note>
        </Step>

        <Step n="1.2" title="Create the app">
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              Click <Path>Apps</Path> in the left menu.
            </li>
            <li>
              Click <Path>Create app</Path> (top right).
            </li>
            <li>
              Choose <Path>Start from Dev Dashboard</Path>.
            </li>
            <li>
              Name it <Code>AdProfit</Code> and click <Path>Create</Path>.
            </li>
          </ol>
          <p>Shopify opens the new app&apos;s page.</p>
        </Step>

        <Step n="1.3" title="Create and release a version (this sets the app's permissions)">
          <p>
            Open the app&apos;s <Path>Versions</Path> tab and fill in the form:
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>App URL:</strong> leave the default.
            </li>
            <li>
              <strong>Embed app in Shopify admin:</strong> turn this <strong>off</strong> if you see it. AdProfit runs on its own website.
            </li>
            <li>
              <strong>Webhooks API version:</strong> leave the default (newest).
            </li>
            <li>
              <strong>Scopes:</strong> add exactly these five:
              <div className="mt-2">
                <CopyLine value={SCOPES} />
              </div>
              <div className="mt-2 grid gap-1 text-[13px] text-slate-600 sm:grid-cols-2">
                <span>
                  <Code>read_products</Code>: products, variants, prices
                </span>
                <span>
                  <Code>read_orders</Code>: orders and refunds
                </span>
                <span>
                  <Code>read_all_orders</Code>: orders older than 60 days
                </span>
                <span>
                  <Code>read_inventory</Code>: “Cost per item” for profit
                </span>
                <span>
                  <Code>write_products</Code>: change a product&apos;s status (active, draft, archived, unlisted)
                </span>
              </div>
              <p className="mt-2 text-[13px] text-slate-600">
                The only thing AdProfit changes in your store is a product&apos;s <strong>status</strong>, and only when someone on your team
                clicks <em>Apply</em> and confirms. Everything else is read-only.
              </p>
            </li>
            <li>
              <strong>Protected customer data</strong> (if Shopify asks): AdProfit only uses the order&apos;s <em>shipping country</em>, for the
              country filter. If you&apos;re offered access, select it and the <em>Address</em> field, with the reason{" "}
              <Code>Reporting sales and ad spend by country</Code>. This is optional: without it everything still works, but orders won&apos;t
              have a country.
            </li>
          </ul>
          <p>
            Click <Path>Release</Path>. The version now shows as <em>Active</em>.
          </p>
        </Step>

        <Step n="1.4" title="Copy the Client ID and Client secret">
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              In the app, open <Path>Settings</Path>.
            </li>
            <li>
              Under <strong>Credentials</strong>, copy the <strong>Client ID</strong>.
            </li>
            <li>
              Reveal and copy the <strong>Client secret</strong>.
            </li>
          </ol>
          <p>
            Keep both somewhere safe, like your team&apos;s password manager. You&apos;ll paste the <strong>same pair for every store</strong> in
            part 2.
          </p>
          <Note tone="warn">
            The Client secret works like a password. Only paste it into AdProfit, which encrypts it before saving. Never send it in chat or
            email.
          </Note>
        </Step>
      </Part>

      {/* ------------------------------------------------------------ part 2 */}
      <Part id="part-2" n={2} title="Connect a Shopify store" when="Repeat for every store">
        <Step n="2.1" title="Install the app on the store">
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              In the Dev Dashboard, open <Path>Apps → AdProfit</Path>.
            </li>
            <li>
              Click <Path>Install app</Path> (on the <em>Installs</em> card).
            </li>
            <li>Choose the store. A new tab opens in that store&apos;s Shopify admin.</li>
            <li>
              Shopify lists what the app can read (products, orders, inventory). Click <Path>Install</Path>.
            </li>
          </ol>
          <p>
            To check it worked: in that store&apos;s admin, go to <Path>Settings → Apps</Path>. <em>AdProfit</em> should be listed.
          </p>
        </Step>

        <Step n="2.2" title="Add the store in AdProfit">
          <p>
            Open{" "}
            <Link href="/settings" className="font-medium text-violet-700 hover:underline">
              Stores &amp; setup
            </Link>{" "}
            and scroll to <strong>Connect a Shopify store</strong>. Fill in:
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>Store name:</strong> any name your team recognizes, like <Code>Boots DE</Code>. It appears in the store filter on the
              dashboard.
            </li>
            <li>
              <strong>Shopify domain:</strong> the <Code>.myshopify.com</Code> address from <a className="text-violet-700 hover:underline" href="#before">Before you start</a>.
            </li>
            <li>
              Keep <strong>Dev Dashboard app (Client ID + secret)</strong> selected.
            </li>
            <li>
              <strong>Client ID</strong> and <strong>Client secret:</strong> paste the values from step 1.4.
            </li>
          </ul>
          <p>
            Click <Path>Add store</Path>. A green message confirms it was added.
          </p>
          <Note>
            Made a typo? Submit the form again with the <strong>same Shopify domain</strong>. That updates the credentials and keeps all the
            store&apos;s data. Don&apos;t use <em>Remove</em> to fix a typo: removing deletes the store&apos;s data.
          </Note>
        </Step>

        <Step n="2.3" title="Run the first sync">
          <ol className="list-decimal space-y-1 pl-5">
            <li>On the Stores &amp; setup page, click the store&apos;s name to open it.</li>
            <li>
              Click <Path>Sync now</Path> and wait. It can take up to a minute.
            </li>
          </ol>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Success:</strong> “Synced 1,151 products and 2,340 orders”.
            </li>
            <li>
              <strong>“…more remaining”:</strong> normal for big stores. Click <em>Sync now</em> again until it stops saying that, or leave it:
              the automatic hourly sync finishes the rest.
            </li>
            <li>
              <strong>A red error:</strong> find the message under{" "}
              <a className="text-violet-700 hover:underline" href="#help">
                Troubleshooting
              </a>
              .
            </li>
          </ul>
          <p>
            Once synced, the store shows its <strong>shop currency</strong>, <strong>timezone</strong> and <strong>product count</strong>. The
            first sync imports the last 60 days of orders. After that, the store updates <strong>every hour</strong> by itself.
          </p>
        </Step>
      </Part>

      {/* ------------------------------------------------------------ part 3 */}
      <Part id="part-3" n={3} title="Connect Google Ads with the script" when="Repeat for every store">
        <li className="px-6 pt-5">
          <Note>
            Every store has its <strong>own script with its own secret key</strong>. The key tells AdProfit which store the ad data belongs to.
            Always paste a store&apos;s script into the Google Ads account that advertises <strong>that store</strong>. Never reuse one
            store&apos;s script in another account.
          </Note>
        </li>

        <Step n="3.1" title="Copy the store's script">
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              Open{" "}
              <Link href="/settings" className="font-medium text-violet-700 hover:underline">
                Stores &amp; setup
              </Link>{" "}
              and click the store&apos;s name to open it.
            </li>
            <li>
              Under <strong>Google Ads script for this store</strong>, click <Path>Copy script</Path>.
            </li>
          </ol>
        </Step>

        <Step n="3.2" title="Open the right Google Ads account">
          <p>
            Go to{" "}
            <a href="https://ads.google.com" target="_blank" rel="noreferrer" className="font-medium text-violet-700 hover:underline">
              ads.google.com ↗
            </a>
            . At the top of the page, check that the <strong>account name and customer ID</strong> are the account running this store&apos;s
            Performance Max campaign.
          </p>
          <Note tone="warn" title="Using a manager (MCC) account?">
            Click into the <strong>individual client account</strong> first. A script added at manager level reads the manager account, not the
            store&apos;s account.
          </Note>
        </Step>

        <Step n="3.3" title="Create a new script">
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              Click <Path>Tools</Path> (wrench icon) in the left menu.
            </li>
            <li>
              Go to <Path>Bulk actions → Scripts</Path>.
            </li>
            <li>
              Click the blue <Path>+</Path> button, then <Path>New script</Path>.
            </li>
          </ol>
        </Step>

        <Step n="3.4" title="Name it and paste the script">
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              At the top, replace “Untitled” with a name such as <Code>AdProfit – Boots DE</Code>.
            </li>
            <li>
              Click inside the code editor, select everything (<Code>Ctrl+A</Code> on Windows, <Code>Cmd+A</Code> on Mac) and delete it.
            </li>
            <li>
              Paste the script (<Code>Ctrl+V</Code> / <Code>Cmd+V</Code>).
            </li>
          </ol>
          <p>
            The first lines should start with <Code>AdProfit – sends product-level (SKU)…</Code> and include your app&apos;s web address.
          </p>
        </Step>

        <Step n="3.5" title="Authorize the script">
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              A banner says the script needs authorization. Click <Path>Authorize</Path>.
            </li>
            <li>In the pop-up, pick your Google account.</li>
            <li>
              Click <Path>Allow</Path>. The script needs to read your Google Ads data and send it to AdProfit (“connect to an external
              service”).
            </li>
          </ol>
          <p>
            Then click <Path>Save</Path>. You don&apos;t need to change anything inside the script.
          </p>
        </Step>

        <Step n="3.6" title="Run it once and check the log">
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              Click <Path>Run</Path> (bottom right). If asked, confirm you want to run it, not just preview it.
            </li>
            <li>
              Wait until the status says <strong>Completed</strong>. The first run loads the <strong>last 35 days</strong>, which takes{" "}
              <strong>5–20 minutes</strong> for big catalogs (thousands of variants). That&apos;s normal. Later hourly runs only refresh the last 3
              days and take a minute or two.
            </li>
            <li>
              Open the <Path>Logs</Path>. You should see lines like:
              <div className="mt-2">
                <code className="block whitespace-pre rounded-lg bg-slate-900 px-3 py-2 font-mono text-[12.5px] text-emerald-300">
                  {"AdProfit full refresh: 2026-09-19 to 2026-10-23\nSent 315000 rows for 2026-09-19 to 2026-10-23 in 640s"}
                </code>
              </div>
            </li>
          </ol>
          <p>
            If you see <Code>AdProfit upload failed (401)</Code>, <Code>AdProfit check failed</Code> or <Code>Sent 0 rows</Code>, see{" "}
            <a className="text-violet-700 hover:underline" href="#help">
              Troubleshooting
            </a>
            .
          </p>
        </Step>

        <Step n="3.7" title="Schedule it (daily or hourly)">
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              Go back to the list at <Path>Tools → Bulk actions → Scripts</Path>.
            </li>
            <li>
              In the <strong>Frequency</strong> column for your script, click the pencil icon.
            </li>
            <li>
              Choose <Path>Daily</Path> at an early hour such as <strong>3am</strong> (our team&apos;s setting), or <Path>Hourly</Path> if you
              want same-day ad spend. Click <Path>Save</Path>.
            </li>
          </ol>
          <Note>
            <strong>Daily at 3–5am</strong> means yesterday is complete each morning. In the dashboard, use ranges that end{" "}
            <em>yesterday</em> (the default). <em>Today</em> includes Shopify sales but not yet today&apos;s ad spend, so ROAS would look too
            high.
          </Note>
          <p>If you choose Hourly, the new script handles it by itself:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Every hour:</strong> refreshes the last 3 days (quick).
            </li>
            <li>
              <strong>Once a day at 3am</strong> (Google Ads account time): refreshes the last 35 days, so late Google conversions are counted.
            </li>
            <li>
              <strong>After a pause of more than 3 days:</strong> automatically does a 35-day refresh to fill the gap.
            </li>
          </ul>
          <Note tone="warn">
            Skipping the schedule is the most common mistake. Without it, data only updates when someone runs the script by hand.
          </Note>
        </Step>

        <Step n="3.8" title="Confirm in AdProfit">
          <p>
            Open{" "}
            <Link href="/settings" className="font-medium text-violet-700 hover:underline">
              Stores &amp; setup
            </Link>
            . The store&apos;s line should now show <strong>Ads EUR (123-456-7890)</strong>, with your currency and customer ID, and{" "}
            <strong>Google Ads: x min ago</strong>. The progress table at the top of this guide also turns green.
          </p>
          <p>
            The dashboard now shows this store&apos;s numbers in the <strong>Google Ads account&apos;s currency</strong>.
          </p>
        </Step>

        <Step n="3.9" title="Optional: import older history (more than 35 days)">
          <p>Only needed if you want to look at date ranges older than 35 days. Do this once, by hand:</p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Open the script in Google Ads.</li>
            <li>Find this line near the top:</li>
          </ol>
          <CopyLine value="var BACKFILL_FROM = '';" />
          <p>Put the first day you want inside the quotes, for example:</p>
          <CopyLine value="var BACKFILL_FROM = '2026-07-01';" />
          <ol className="list-decimal space-y-1 pl-5" start={3}>
            <li>
              Click <Path>Save</Path>, then <Path>Run</Path>.
            </li>
            <li>
              <strong>If the log says “Stopped early to stay under the 30-minute limit”:</strong> Google stops scripts after 30 minutes, so
              big imports are done in parts. The log tells you exactly what to type for <Code>BACKFILL_FROM</Code> and{" "}
              <Code>BACKFILL_TO</Code> next. Change them, Save, and Run again until the log shows <em>Sent … rows</em> with no “Stopped early”
              line.
            </li>
            <li>
              <strong>Important:</strong> set both back to empty (<Code>{"''"}</Code>) and Save. Otherwise every hourly run repeats the import.
            </li>
          </ol>
        </Step>
      </Part>

      {/* ------------------------------------------------------------ part 4 */}
      <Part id="part-4" n={4} title="Check the numbers" when="After the first sync">
        <Step n="4.1" title="Compare ad spend with Google Ads">
          <p>
            On the{" "}
            <Link href="/" className="font-medium text-violet-700 hover:underline">
              Dashboard
            </Link>
            , pick the store and set the dates to <em>Last 7 days</em>. In Google Ads, open <Path>Campaigns</Path> with the same dates. The{" "}
            <strong>Ad spend</strong> card should match the cost of your Performance Max / Shopping campaigns.
          </p>
        </Step>
        <Step n="4.2" title="Compare revenue with Shopify">
          <p>
            In Shopify, go to <Path>Analytics → Reports → Sales by product</Path> for the same dates. AdProfit&apos;s <strong>Shopify revenue</strong>{" "}
            should be close to <em>gross sales − discounts</em>.
          </p>
          <p>Small differences are normal, because AdProfit revenue:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>excludes tax and shipping,</li>
            <li>excludes cancelled and test orders,</li>
            <li>shows refunds separately (Refunds card),</li>
            <li>may be missing up to 1 hour of the newest orders.</li>
          </ul>
        </Step>
        <Step n="4.3" title="How the main numbers are calculated">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>ROAS</strong> = Shopify revenue ÷ ad spend. It uses real Shopify sales, not Google&apos;s conversion value, which is shown
              separately as <em>Conv. value</em>.
            </li>
            <li>
              <strong>Net profit</strong> = revenue − refunds − cost of goods − ad spend.
            </li>
            <li>
              <strong>POAS</strong> = net profit ÷ ad spend. Above 0 means the product makes money after ads.
            </li>
            <li>
              All SKUs (variants) of a product are added together. Click the variant count to see each SKU.
            </li>
          </ul>
        </Step>
      </Part>

      {/* ------------------------------------------------------------ decisions */}
      <section id="decisions" className="scroll-mt-20 rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
        <h2 className="mb-1 text-lg font-semibold">How the Archive / Improve decisions work</h2>
        <p className="mb-4 text-sm text-slate-600">
          The dashboard applies the team&apos;s product archive / improve framework to every product, for the selected stores and dates.
          Set each store&apos;s niche and target ROAS in{" "}
          <Link href="/settings#targets" className="font-medium text-violet-700 hover:underline">
            Stores &amp; setup → Archive / improve targets
          </Link>
          .
        </p>
        <div className="grid gap-4 text-sm text-slate-700 md:grid-cols-2">
          <div className="space-y-1.5">
            <div>
              <strong>Target CPA</strong> = selling price ÷ target ROAS (2.5 → 40% of price)
            </div>
            <div>
              <strong>CPA</strong> = ad spend ÷ Shopify orders
            </div>
            <div>
              <strong>Net ROAS</strong> = (revenue − refunds) ÷ ad spend
            </div>
            <div>
              <strong>Archive threshold</strong> = target CPA × 1.5 (price &gt; 20% below the store&apos;s AOV), 1.75 (within ±20%) or 2 (&gt; 20%
              above)
            </div>
            <div>
              <strong>Break-even ROAS</strong> = 1 ÷ (1 − niche target COGS %)
            </div>
          </div>
          <ul className="space-y-1.5">
            <li>
              <strong className="text-red-700">Archive</strong>: has sales and CPA ≥ threshold, or no sales and spend ≥ threshold
            </li>
            <li>
              <strong className="text-amber-700">Improve</strong>: has sales, CPA between target CPA and the threshold
            </li>
            <li>
              <strong className="text-emerald-700">Keep / scale</strong>: CPA ≤ target CPA (ROAS ≥ target)
            </li>
            <li>
              <strong className="text-slate-700">Too early</strong>: no sales yet, spend under the threshold (shows how much is left)
            </li>
            <li>
              <strong className="text-violet-700">Review</strong>: a judgment call for a person: within 5% of the threshold, below break-even
              but not archivable, COGS well above the niche target, refunds wiping out revenue, or a missing price or cost. Hover the badge to see
              why.
            </li>
          </ul>
        </div>
        <p className="mt-4 text-sm text-slate-600">
          Typical flow: click <strong>Archive</strong> in the decision boxes, check the <em>Review</em> ones by hand, tick the products, and set
          them to <em>Archived</em> with the status bar.
        </p>
      </section>

      {/* ------------------------------------------------------------ troubleshooting */}
      <section id="help" className="scroll-mt-20 rounded-xl border border-slate-200 bg-white shadow-xs">
        <header className="border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-semibold">Troubleshooting</h2>
          <p className="text-sm text-slate-500">Click a problem to see the fix. Error messages appear in red on the Stores &amp; setup page.</p>
        </header>
        <div className="divide-y divide-slate-100">
          <Problem q="“Shopify refused the Client ID/secret for this store…”">
            <p>The app can&apos;t reach this store. Two possible causes:</p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>
                <strong>The app isn&apos;t installed on this store.</strong> Do <a className="text-violet-700 hover:underline" href="#part-2">step 2.1</a>.
              </li>
              <li>
                <strong>The store is in a different organization.</strong> See the next item.
              </li>
            </ol>
            <p>
              Also check that the domain is exactly the <Code>.myshopify.com</Code> address.
            </p>
          </Problem>
          <Problem q="A store isn't in my organization (missing from the Dev Dashboard's Stores list)">
            <span id="help-org" className="block scroll-mt-24" />
            <p>Pick one of these options:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <strong>Switch organization:</strong> at dev.shopify.com, switch to the organization that owns this store (top-left menu). Then
                repeat <a className="text-violet-700 hover:underline" href="#part-1">part 1</a> there. That organization gets its own app and its
                own Client ID and secret.
              </li>
              <li>
                <strong>Existing access token:</strong> if the store already has an older custom app (created in the store admin) with an{" "}
                <Code>shpat_…</Code> token and the read scopes above, choose <em>Existing Admin API access token</em> in the form and paste it.
              </li>
            </ul>
          </Problem>
          <Problem q="“Shopify rejected the Client ID or Client secret”">
            <p>
              One of the two values was copied incorrectly, or the secret was regenerated in the Dev Dashboard. Copy both again from{" "}
              <Path>Dev Dashboard → Apps → AdProfit → Settings</Path>. Then submit the <em>Connect a Shopify store</em> form again with the{" "}
              <strong>same domain</strong>, which updates the credentials and keeps the data, and press <em>Sync now</em>.
            </p>
          </Problem>
          <Problem q="“Shopify denied access (403)” or a message about missing scopes">
            <p>The released app version is missing one of the five scopes, or the store hasn&apos;t approved them yet.</p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>
                In the Dev Dashboard, create a new version with all five scopes (<a className="text-violet-700 hover:underline" href="#part-1">step 1.3</a>) and release it.
              </li>
              <li>
                Scope changes aren&apos;t applied to installed stores automatically. In each store&apos;s admin, go to{" "}
                <Path>Settings → Apps → AdProfit</Path> and approve the updated permissions.
              </li>
              <li>
                Press <em>Sync now</em> again.
              </li>
            </ol>
          </Problem>
          <Problem q="Changing a product's status fails with “add the write_products scope”">
            <p>Stores connected before status changes existed don&apos;t have this permission yet.</p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>
                In the Dev Dashboard, open <Path>Apps → AdProfit → Versions</Path>, create a new version with all five scopes (step 1.3) and{" "}
                <Path>Release</Path> it.
              </li>
              <li>
                In each store&apos;s admin, go to <Path>Settings → Apps → AdProfit</Path> and approve the updated permissions.
              </li>
              <li>Try the status change again. No re-sync is needed.</li>
            </ol>
          </Problem>
          <Problem q="Only the last 60 days of orders show up">
            <p>
              The <Code>read_all_orders</Code> scope is missing. Add it the same way as described for missing scopes above. The first sync covers 60 days by
              design; older history needs this scope plus a change to the setting <Code>SHOPIFY_INITIAL_SYNC_DAYS</Code> (ask the person who
              manages the app).
            </p>
          </Problem>
          <Problem q="Google Ads log says “AdProfit upload failed (401)” or “AdProfit check failed (401)”: invalid key">
            <p>
              The key in the script doesn&apos;t match any store. Either someone clicked <em>New script key</em>, the store was removed, or the
              script was copied from another store. Copy the store&apos;s script again (<a className="text-violet-700 hover:underline" href="#part-3">step 3.1</a>), replace the whole script in Google Ads, then Save and Run.
            </p>
          </Problem>
          <Problem q="The script takes a long time to run">
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <strong>First run and the daily 3am run</strong> read 35 days, which can take 5–20 minutes for catalogs with thousands of
                variants. That&apos;s expected.
              </li>
              <li>
                <strong>Normal hourly runs</strong> should take a minute or two. If every run is slow, check the first log line. It should say{" "}
                <Code>quick refresh</Code>. If it says <Code>backfill</Code>, set <Code>BACKFILL_FROM</Code> and <Code>BACKFILL_TO</Code> back to{" "}
                <Code>{"''"}</Code> (step 3.9).
              </li>
              <li>
                <strong>Old version of the script?</strong> If your script contains <Code>DAYS_BACK</Code>, it&apos;s the old version, which
                re-reads 35 days every hour. Copy the script again from Stores &amp; setup and replace the whole script in Google Ads.
              </li>
              <li>
                Google sometimes queues scripts for a few minutes before they start. That waiting time isn&apos;t the script itself.
              </li>
            </ul>
          </Problem>
          <Problem q="Google Ads log says “Sent 0 rows”">
            <ul className="list-disc space-y-1 pl-5">
              <li>You may be in the wrong Google Ads account, or at manager (MCC) level. See step 3.2.</li>
              <li>The account may have no Performance Max or Shopping campaigns with product data in the date range.</li>
              <li>The campaign may not be linked to a Merchant Center product feed, so Google has no product-level data.</li>
            </ul>
          </Problem>
          <Problem q="Spend shows up, but products appear as “Unknown product” or spend isn't matched to products">
            <span id="help-ids" className="block scroll-mt-24" />
            <p>
              AdProfit matches ad spend to products using the item ID format <Code>shopify_us_PRODUCTID_VARIANTID</Code>.
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <strong>“Unknown product …”</strong>: the product hasn&apos;t synced from Shopify yet, or was deleted. Press <em>Sync now</em>.
              </li>
              <li>
                <strong>Spend missing from every product</strong>: your feed uses a different ID format (for example SKUs from a third-party feed
                app). Spend can&apos;t be matched until the feed uses Shopify&apos;s IDs. Contact the person who manages the app; matching by SKU
                can be added.
              </li>
            </ul>
          </Problem>
          <Problem q="Profit looks too high">
            <p>
              Products are probably missing <em>Cost per item</em> in Shopify, so their cost of goods counts as 0. Fill in{" "}
              <Path>Products → product → Cost per item</Path>. It updates at the next sync.
            </p>
          </Problem>
          <Problem q="Daily numbers are shifted by a day compared with Google Ads or Shopify">
            <p>
              The Google Ads account and the Shopify store use different time zones. Both are shown on the Stores &amp; setup page (Shopify
              timezone) and in Google Ads under <Path>Admin → Account settings</Path>. Totals over a week or month still match; individual days
              can shift.
            </p>
          </Problem>
          <Problem q="The country filter only shows some countries for Shopify orders">
            <p>
              Shopify didn&apos;t grant access to the shipping address (protected customer data), so orders have no country. Google Ads data is
              still split by country. To fix it, grant protected customer data with the <em>Address</em> field (<a className="text-violet-700 hover:underline" href="#part-1">step 1.3</a>), release, approve in the store, and sync again.
            </p>
          </Problem>
          <Problem q="“Last Google Ads sync” is more than a day old">
            <p>
              The script hasn&apos;t run on schedule. In Google Ads, go to <Path>Tools → Bulk actions → Scripts</Path>, check the{" "}
              <strong>Frequency</strong> is set (<em>Daily</em> or <em>Hourly</em>, step 3.7), and open the script&apos;s run history for errors.
            </p>
          </Problem>
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- live progress

async function Progress() {
  await connection();
  const stores = await sql<
    {
      id: number;
      name: string;
      shop_domain: string;
      shop_currency: string | null;
      ads_currency: string | null;
      ads_customer_id: string | null;
      products_synced_at: Date | null;
      orders_synced_at: Date | null;
      ads_synced_at: Date | null;
      last_sync_error: string | null;
      ads_stale: boolean;
    }[]
  >`select id, name, shop_domain, shop_currency, ads_currency, ads_customer_id, products_synced_at,
           orders_synced_at, ads_synced_at, last_sync_error,
           coalesce(ads_synced_at < now() - interval '26 hours', false) as ads_stale
    from stores order by name`;
  const endpoint = `${await appOrigin()}/api/ingest/google-ads`;

  const next = (s: (typeof stores)[number]) => {
    if (s.last_sync_error) return { text: "Fix the sync error (see Troubleshooting)", href: "#help", tone: "text-red-600" };
    if (!s.products_synced_at) return { text: "Press “Sync now” (step 2.3)", href: "#part-2", tone: "text-amber-700" };
    if (!s.ads_synced_at) return { text: "Add the Google Ads script (part 3)", href: "#part-3", tone: "text-amber-700" };
    if (s.ads_stale)
      return { text: "No Google Ads data for over a day: is the script scheduled? (step 3.7)", href: "#part-3", tone: "text-amber-700" };
    return { text: "All set ✓", href: "", tone: "text-emerald-700" };
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-xs">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-6 py-4">
        <div>
          <h2 className="text-lg font-semibold">Your progress</h2>
          <p className="text-sm text-slate-500">Updates automatically as each store is connected.</p>
        </div>
        <Link href="/settings" className="rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-700">
          Go to Stores &amp; setup
        </Link>
      </header>
      {stores.length === 0 ? (
        <p className="px-6 py-5 text-sm text-slate-600">
          No stores connected yet. Start with <a className="font-medium text-violet-700 hover:underline" href="#part-1">part 1</a>.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-500">
              <tr className="[&>th]:px-6 [&>th]:py-2">
                <th>Store</th>
                <th>Shopify</th>
                <th>Google Ads</th>
                <th>Next step</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {stores.map((s) => {
                const n = next(s);
                return (
                  <tr key={s.id} className="[&>td]:px-6 [&>td]:py-3">
                    <td>
                      <div className="font-medium">{s.name}</div>
                      <div className="text-xs text-slate-500">{s.shop_domain}</div>
                    </td>
                    <td>
                      {s.products_synced_at ? (
                        <span className="text-emerald-700">
                          ✓ {s.shop_currency} · synced {timeAgo(s.orders_synced_at ?? s.products_synced_at)}
                        </span>
                      ) : (
                        <span className="text-slate-400">Not synced yet</span>
                      )}
                    </td>
                    <td>
                      {s.ads_synced_at ? (
                        <span className="text-emerald-700">
                          ✓ {s.ads_currency} {s.ads_customer_id ? `· ${s.ads_customer_id}` : ""} · {timeAgo(s.ads_synced_at)}
                        </span>
                      ) : (
                        <span className="text-slate-400">No data yet</span>
                      )}
                    </td>
                    <td className={`font-medium ${n.tone}`}>{n.href ? <a href={n.href} className="hover:underline">{n.text}</a> : n.text}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="border-t border-slate-100 px-6 py-3 text-xs text-slate-500">
        Google Ads scripts send data to: <Code>{endpoint}</Code>
      </div>
    </section>
  );
}

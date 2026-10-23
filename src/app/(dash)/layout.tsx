import Link from "next/link";
import { logout } from "../login/actions";

export default function DashLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="flex h-14 items-center gap-6 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-violet-600 text-sm text-white">A</span>
            AdProfit
          </Link>
          <nav className="flex gap-1 text-sm">
            <Link href="/" className="rounded-md px-3 py-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900">
              Dashboard
            </Link>
            <Link href="/settings" className="rounded-md px-3 py-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900">
              Stores &amp; setup
            </Link>
          </nav>
          <form action={logout} className="ml-auto">
            <button className="text-sm text-slate-500 hover:text-slate-900">Sign out</button>
          </form>
        </div>
      </header>
      <main className="px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}

import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in · AdProfit" };

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold text-slate-900">AdProfit</h1>
        <p className="mb-6 text-sm text-slate-500">Product profit for Shopify + Google Ads</p>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}

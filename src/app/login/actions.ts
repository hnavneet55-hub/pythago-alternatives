"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSessionToken, safeEqual, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/crypto";

export async function login(_prev: string | null, form: FormData) {
  const password = String(form.get("password") ?? "");
  const expected = process.env.DASHBOARD_PASSWORD;
  if (!expected || !safeEqual(password, expected)) return "Wrong password";

  (await cookies()).set(SESSION_COOKIE, createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });
  const next = String(form.get("next") ?? "/");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

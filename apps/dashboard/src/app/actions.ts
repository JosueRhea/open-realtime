"use server";

import {
  parseSetCookieHeader,
  splitSetCookieHeader,
  toCookieOptions,
} from "better-auth/cookies";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth, ensureAuthSchema } from "@/lib/auth";
import { getDashboardOrchestratorStore } from "@/lib/orchestrator/store";
import { requireDashboardSession } from "@/lib/security";

export async function createAppAction(formData: FormData) {
  const authContext = await requireDashboardSession();
  const name = String(formData.get("name") ?? "").trim();

  if (!name) {
    return;
  }

  await getDashboardOrchestratorStore().createApp({
    tenantId: authContext.tenantId,
    name,
  });
  revalidatePath("/", "layout");
}

export async function createWebhookAction(formData: FormData) {
  const authContext = await requireDashboardSession();
  const appId = String(formData.get("appId") ?? "").trim();
  const url = String(formData.get("url") ?? "").trim();
  const events = formData
    .getAll("events")
    .map(String)
    .filter(Boolean);

  if (!appId || !url) {
    return;
  }

  await getDashboardOrchestratorStore().createWebhook({
    tenantId: authContext.tenantId,
    appId,
    url,
    enabledEvents: events.length
      ? events
      : ["channel_occupied", "channel_vacated", "member_added", "member_removed"],
  });
  revalidatePath("/webhooks");
}

export async function signUpAction(formData: FormData) {
  await ensureAuthSchema();

  const result = await auth.api.signUpEmail({
    body: {
      name: String(formData.get("name") ?? ""),
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
    },
    headers: await headers(),
    returnHeaders: true,
  });

  await applyAuthCookies(result.headers);
  redirect("/");
}

export async function signInAction(formData: FormData) {
  await ensureAuthSchema();

  const result = await auth.api.signInEmail({
    body: {
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
    },
    headers: await headers(),
    returnHeaders: true,
  });

  await applyAuthCookies(result.headers);
  redirect("/");
}

async function applyAuthCookies(responseHeaders: Headers) {
  const cookieStore = await cookies();
  const setCookieHeader = responseHeaders.get("set-cookie");

  if (!setCookieHeader) {
    return;
  }

  for (const cookieHeader of splitSetCookieHeader(setCookieHeader)) {
    const parsedCookies = parseSetCookieHeader(cookieHeader);

    parsedCookies.forEach((attributes, name) => {
      cookieStore.set(name, attributes.value, toCookieOptions(attributes));
    });
  }
}

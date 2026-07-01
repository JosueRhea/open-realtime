"use client";

import { ChevronDown } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { RealtimeApp } from "@/lib/orchestrator/types";

export function AppSwitcher({
  apps,
  currentAppId,
}: {
  apps: RealtimeApp[];
  currentAppId: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  function selectApp(appId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("app", appId);
    router.push(`${pathname}?${params.toString()}`);
  }

  if (apps.length === 0) {
    return (
      <div className="rounded-md border border-[#dde5ef] bg-[#f7fafc] p-3">
        <p className="truncate text-sm font-medium">No app yet</p>
        <p className="mt-2 text-xs text-[#6b7280]">Create an app to issue keys</p>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-[#dde5ef] bg-[#f7fafc] p-3">
      <div className="relative">
        <select
          aria-label="Select app"
          className="h-10 w-full appearance-none truncate rounded-md border border-[#cfd8e3] bg-white px-3 pr-8 text-sm font-medium outline-none focus:border-[#2f80ed]"
          onChange={(event) => selectApp(event.target.value)}
          value={currentAppId ?? apps[0]?.appId ?? ""}
        >
          {apps.map((app) => (
            <option key={app.appId} value={app.appId}>
              {app.name}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[#8a9099]"
          size={16}
        />
      </div>
      <div className="mt-2 flex min-w-0 items-center gap-2 text-xs text-[#6b7280]">
        <span className="size-2 shrink-0 rounded-full bg-[#19a974]" />
        <span className="truncate">
          {apps.find((app) => app.appId === currentAppId)?.cluster ?? apps[0]?.cluster}
        </span>
      </div>
    </div>
  );
}

"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
      <div className="rounded-md border bg-muted/40 p-3">
        <p className="truncate text-sm font-medium">No app yet</p>
        <p className="mt-2 text-xs text-muted-foreground">Create an app to issue keys</p>
      </div>
    );
  }

  const selectedApp = apps.find((app) => app.appId === currentAppId) ?? apps[0];

  return (
    <div className="rounded-md border bg-muted/40 p-3">
      <Select
        onValueChange={selectApp}
        value={currentAppId ?? apps[0]?.appId ?? ""}
      >
        <SelectTrigger aria-label="Select app" className="w-full rounded-md">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {apps.map((app) => (
            <SelectItem key={app.appId} value={app.appId}>
              {app.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
        <span className="size-2 rounded-full bg-primary" />
        {selectedApp?.cluster}
      </div>
    </div>
  );
}

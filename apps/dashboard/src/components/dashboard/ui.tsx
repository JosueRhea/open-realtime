import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Clipboard } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function Panel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("min-w-0 rounded-md", className)}>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function EmptyState({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div className="flex min-h-40 items-center justify-center rounded-md border border-dashed bg-muted/40 p-5 text-center">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-1 max-w-md text-sm leading-6 text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}

export function CredentialRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(58px,80px)_minmax(0,1fr)_auto] items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm sm:grid-cols-[88px_minmax(0,1fr)_auto]">
      <span className="text-xs text-muted-foreground">{label}</span>
      <code className="min-w-0 break-all text-xs leading-5">{value}</code>
      <Clipboard size={14} className="shrink-0 text-muted-foreground" />
    </div>
  );
}

export function SetupRow({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-md border bg-muted/40 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <span className="inline-flex min-w-0 items-center gap-2 text-muted-foreground">
        <Icon size={15} />
        {label}
      </span>
      <span className="min-w-0 break-words font-medium sm:text-right">{value}</span>
    </div>
  );
}

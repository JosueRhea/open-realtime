import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Clipboard } from "lucide-react";

export function Panel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-md border border-[#e7e9ec] bg-white p-5 ${className}`}>
      {children}
    </section>
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
    <div className="flex min-h-40 items-center justify-center rounded-md border border-dashed border-[#d4d7db] bg-[#fafbfc] p-5 text-center">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-1 max-w-md text-sm leading-6 text-[#8a9099]">{body}</p>
      </div>
    </div>
  );
}

export function CredentialRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[88px_1fr_auto] items-center gap-2 rounded-md border border-[#eceef0] bg-[#fafbfc] px-3 py-2 text-sm">
      <span className="text-xs text-[#6b7280]">{label}</span>
      <code className="truncate text-xs">{value}</code>
      <Clipboard size={14} className="text-[#8a9099]" />
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
    <div className="flex items-center justify-between gap-4 rounded-md border border-[#eceef0] bg-[#fafbfc] px-3 py-2 text-sm">
      <span className="inline-flex items-center gap-2 text-[#6b7280]">
        <Icon size={15} />
        {label}
      </span>
      <span className="truncate font-medium">{value}</span>
    </div>
  );
}

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
    <section
      className={`min-w-0 rounded-md border border-[#e2e7ee] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${className}`}
    >
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
    <div className="grid min-w-0 grid-cols-[80px_minmax(0,1fr)_auto] items-center gap-2 rounded-md border border-[#eceef0] bg-[#fafbfc] px-3 py-2 text-sm sm:grid-cols-[88px_minmax(0,1fr)_auto]">
      <span className="text-xs text-[#6b7280]">{label}</span>
      <code className="min-w-0 break-all text-xs leading-5">{value}</code>
      <Clipboard size={14} className="shrink-0 text-[#8a9099]" />
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
    <div className="flex min-w-0 items-center justify-between gap-4 rounded-md border border-[#eceef0] bg-[#fafbfc] px-3 py-2 text-sm">
      <span className="inline-flex min-w-0 items-center gap-2 text-[#6b7280]">
        <Icon size={15} />
        {label}
      </span>
      <span className="min-w-0 break-words text-right font-medium">{value}</span>
    </div>
  );
}

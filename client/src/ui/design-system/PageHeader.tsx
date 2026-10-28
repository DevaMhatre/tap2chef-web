import type { ReactNode } from "react";

export function PageHeader({ title, actions }: { title: string; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex min-h-11 items-center justify-between gap-3">
      <h1 className="text-[28px] leading-tight font-bold tracking-tight">{title}</h1>
      {actions && <div className="flex items-center gap-1">{actions}</div>}
    </div>
  );
}

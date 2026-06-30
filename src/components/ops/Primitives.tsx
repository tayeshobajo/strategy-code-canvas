import * as React from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  subtitle,
  right,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-end justify-between gap-6", className)}>
      <div>
        <h1 className="font-serif text-[34px] leading-tight tracking-tight text-[#171c38]">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-2 max-w-3xl text-sm text-[#5d6079]">{subtitle}</p>
        ) : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}

export function Card({
  children,
  className,
  padded = true,
}: {
  children: React.ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-[#e7e6df] bg-white shadow-[0_1px_0_rgba(23,28,56,0.03)]",
        padded ? "p-5" : "",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function StatTile({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <Card className="flex items-start gap-4">
      {icon ? (
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-[#eef1fb] text-[#3a4fcf]">
          {icon}
        </div>
      ) : null}
      <div>
        <div className="text-3xl font-semibold leading-none tracking-tight text-[#171c38]">
          {value}
        </div>
        <div className="mt-2 text-sm font-medium text-[#171c38]">{label}</div>
        {sub ? <div className="mt-1 text-xs text-[#7d8095]">{sub}</div> : null}
      </div>
    </Card>
  );
}

export function EmptyState({
  title,
  body,
}: {
  title: string;
  body?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-[#d8d8cf] bg-white/50 px-6 py-12 text-center">
      <div className="text-sm font-medium text-[#171c38]">{title}</div>
      {body ? <div className="mx-auto mt-2 max-w-sm text-sm text-[#5d6079]">{body}</div> : null}
    </div>
  );
}

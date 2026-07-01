import { ReactNode } from "react";

/**
 * Shared portal container. Ensures every authenticated portal page uses the
 * same max width, spacing rhythm, and typography scale.
 */
export function PortalPage({
  children,
  width = "3xl",
  className = "",
}: {
  children: ReactNode;
  width?: "3xl" | "4xl" | "5xl";
  className?: string;
}) {
  const widthClass =
    width === "5xl" ? "max-w-5xl" : width === "4xl" ? "max-w-4xl" : "max-w-3xl";
  return (
    <div className={`${widthClass} mx-auto space-y-8 ${className}`}>
      {children}
    </div>
  );
}

/**
 * Shared premium card used across every portal surface. Matches the site's
 * ivory paper + border + shadow rhythm.
 */
export function PortalCard({
  children,
  className = "",
  as: Tag = "section",
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "article" | "div";
}) {
  return (
    <Tag
      className={`rounded-2xl bg-card border border-border shadow-sm p-6 sm:p-8 lg:p-10 ${className}`}
    >
      {children}
    </Tag>
  );
}

/**
 * Small section eyebrow + title used for consistent portal page headers.
 */
export function PortalPageHeader({
  eyebrow,
  title,
  description,
  right,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-6">
      <div>
        {eyebrow ? (
          <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal">
            {eyebrow}
          </div>
        ) : null}
        <h1 className="font-display text-2xl sm:text-3xl text-ink mt-2">
          {title}
        </h1>
        {description ? (
          <p className="text-[15px] leading-[1.75] text-ink/70 mt-3 max-w-2xl">
            {description}
          </p>
        ) : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}

export function NarrativeHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <header className="space-y-3 pt-1">
      <div className="flex items-center gap-3">
        <span aria-hidden className="h-px w-8 bg-ink" />
        <div className="font-mono text-[10px] font-medium uppercase tracking-[0.32em] text-ink">
          Project Spine
        </div>
      </div>
      <p className="text-[15px] font-normal leading-relaxed text-ink/70">
        {title}
      </p>
      {subtitle ? (
        <p className="text-[15px] font-normal leading-relaxed text-ink/70">
          {subtitle}
        </p>
      ) : null}
    </header>
  );
}

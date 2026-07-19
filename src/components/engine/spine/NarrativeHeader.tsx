export function NarrativeHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <header className="space-y-4 pt-1">
      <div className="flex items-center gap-3">
        <span aria-hidden className="h-px w-8 bg-[#0A0F1F]" />
        <div className="font-mono text-[10px] font-medium uppercase tracking-[0.32em] text-[#0A0F1F]">
          Project Spine
        </div>
      </div>
      <p
        className="max-w-5xl text-[21px] font-normal leading-[1.55] tracking-[-0.01em] text-[#1f2937]"
        style={{ fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif" }}
      >
        {title}
      </p>
      {subtitle ? (
        <p
          className="max-w-4xl text-[15px] leading-[1.6] text-[#4b5563]"
          style={{ fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif" }}
        >
          {subtitle}
        </p>
      ) : null}
    </header>
  );
}

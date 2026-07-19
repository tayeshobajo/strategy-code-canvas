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
        <span aria-hidden className="h-px w-8 bg-[#0A0F1F]" />
        <div className="font-mono text-[10px] font-medium uppercase tracking-[0.32em] text-[#0A0F1F]">
          Project Spine
        </div>
      </div>
      <h1
        className="text-[56px] font-normal leading-[1.02] tracking-[-0.02em] text-[#0A0F1F]"
        style={{ fontFamily: "'Instrument Serif', ui-serif, Georgia, serif" }}
      >
        {title}
      </h1>
      {subtitle ? (
        <p
          className="text-[17px] leading-[1.55] text-[#3f4a5e]"
          style={{ fontFamily: "'Instrument Serif', ui-serif, Georgia, serif" }}
        >
          {subtitle}
        </p>
      ) : null}
    </header>
  );
}

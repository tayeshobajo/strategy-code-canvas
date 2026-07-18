export function NarrativeHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <header className="space-y-1.5">
      <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-[#3E68B2]">
        Project Spine
      </div>
      <h1
        className="text-[34px] leading-[1.1] tracking-tight text-[#0A0F1F]"
        style={{ fontFamily: "'Instrument Serif', ui-serif, Georgia, serif" }}
      >
        {title}
      </h1>
      {subtitle ? (
        <p className="max-w-3xl text-[14px] leading-relaxed text-[#3f4a5e]">{subtitle}</p>
      ) : null}
    </header>
  );
}

export function TrustTaiLogo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-baseline font-display text-[1.75rem] leading-none tracking-tight ${className}`}>
      <span className="uppercase">Trust&nbsp;Tai</span>
      <sup className="ml-0.5 text-[0.5em] font-sans">®</sup>
    </span>
  );
}

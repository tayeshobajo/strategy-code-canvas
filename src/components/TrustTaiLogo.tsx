import logoAsset from "@/assets/trust-tai-logo-white.png.asset.json";

export function TrustTaiLogo({ className = "" }: { className?: string }) {
  return (
    <img
      src={logoAsset.url}
      alt="Trust Tai — Consultancy + AI Agency"
      className={`h-6 w-auto sm:h-7 ${className}`}
    />
  );
}

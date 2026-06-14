import logoDark from "@/assets/trust-tai-logo.png.asset.json";
import logoWhite from "@/assets/trust-tai-logo-white.png.asset.json";

export function TrustTaiLogo({
  className = "",
  variant = "dark",
}: {
  className?: string;
  variant?: "dark" | "white";
}) {
  const asset = variant === "white" ? logoWhite : logoDark;
  return (
    <img
      src={asset.url}
      alt="Trust Tai — Consultancy + AI Agency"
      className={`h-6 w-auto sm:h-7 ${className}`}
    />
  );
}

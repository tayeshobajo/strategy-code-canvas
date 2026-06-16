import { useEffect, useRef, useState } from "react";
import logoDark from "@/assets/trust-tai-logo.png.asset.json";
import logoWhite from "@/assets/trust-tai-logo-white.png.asset.json";

type Variant = "dark" | "white";

// Parse any CSS color the browser resolves into [r,g,b,a].
function parseColor(input: string): [number, number, number, number] | null {
  if (!input) return null;
  const m = input.match(/rgba?\(([^)]+)\)/i);
  if (!m) return null;
  const parts = m[1].split(",").map((p) => parseFloat(p.trim()));
  const [r, g, b, a = 1] = parts;
  if ([r, g, b].some((n) => Number.isNaN(n))) return null;
  return [r, g, b, a];
}

// Walk up the DOM to find the first non-transparent background color.
function resolveBackground(el: HTMLElement | null): [number, number, number] {
  let node: HTMLElement | null = el;
  while (node) {
    const bg = getComputedStyle(node).backgroundColor;
    const parsed = parseColor(bg);
    if (parsed && parsed[3] > 0.1) return [parsed[0], parsed[1], parsed[2]];
    node = node.parentElement;
  }
  return [255, 255, 255];
}

// Relative luminance per WCAG.
function luminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(lumA: number, lumB: number): number {
  const [hi, lo] = lumA > lumB ? [lumA, lumB] : [lumB, lumA];
  return (hi + 0.05) / (lo + 0.05);
}

const MIN_CONTRAST = 3; // WCAG AA for large/graphical elements

export function TrustTaiLogo({
  className = "",
  variant = "dark",
}: {
  className?: string;
  variant?: Variant;
}) {
  const wrapRef = useRef<HTMLSpanElement>(null);
  const [resolved, setResolved] = useState<Variant>(variant);

  useEffect(() => {
    if (typeof window === "undefined" || !wrapRef.current) return;
    const bg = resolveBackground(wrapRef.current);
    const bgLum = luminance(bg);
    // The dark logo is near-black; the white logo is near-white.
    const darkLum = luminance([20, 20, 20]);
    const whiteLum = luminance([255, 255, 255]);
    const preferred: Variant = variant;
    const preferredContrast = contrast(
      bgLum,
      preferred === "white" ? whiteLum : darkLum,
    );
    if (preferredContrast >= MIN_CONTRAST) {
      setResolved(preferred);
      return;
    }
    // Fall back to whichever variant has better contrast against the bg.
    const fallback: Variant =
      contrast(bgLum, whiteLum) > contrast(bgLum, darkLum) ? "white" : "dark";
    setResolved(fallback);
  }, [variant]);

  const asset = resolved === "white" ? logoWhite : logoDark;
  return (
    <span ref={wrapRef} className="inline-flex">
      <img
        src={asset.url}
        alt="Trust Tai | Consultancy + AI Agency"
        className={`h-6 w-auto sm:h-7 ${className}`}
      />
    </span>
  );
}

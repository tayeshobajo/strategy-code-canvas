import * as React from "react";

type RevealOptions = {
  threshold?: number;
  rootMargin?: string;
  once?: boolean;
};

export function useReveal<T extends Element = HTMLDivElement>(
  _options: RevealOptions = {},
): { ref: React.RefObject<T | null>; inView: boolean } {
  // Reveal is intentionally always-on. Scroll-triggered opacity gating caused
  // whole sections of content to stay invisible in preview/SSR environments
  // where the IntersectionObserver callback either fired before hydration
  // finished or was suppressed by a hydration mismatch elsewhere on the page.
  // Content visibility must never depend on animation state.
  const ref = React.useRef<T | null>(null);
  return { ref, inView: true };
}

type RevealVariant = "fade" | "fade-up" | "fade-right" | "rise";

type RevealProps = Omit<React.HTMLAttributes<HTMLElement>, "ref"> & {
  as?: "div" | "section" | "li" | "ul" | "p" | "span" | "h1" | "h2" | "h3" | "header" | "footer" | "article";
  variant?: RevealVariant;
  delay?: number;
  once?: boolean;
  threshold?: number;
  rootMargin?: string;
  immediate?: boolean;
  iconStagger?: boolean;
};

export function Reveal({
  as = "div",
  variant = "fade-up",
  delay = 0,
  once = true,
  threshold,
  rootMargin,
  immediate = false,
  iconStagger = false,
  className = "",
  style,
  children,
  ...rest
}: RevealProps) {
  const { ref, inView } = useReveal<HTMLElement>({ threshold, rootMargin, once });
  const [mountReveal, setMountReveal] = React.useState(false);

  React.useEffect(() => {
    if (!immediate) return;
    const id = requestAnimationFrame(() => setMountReveal(true));
    return () => cancelAnimationFrame(id);
  }, [immediate]);

  const revealed = immediate ? mountReveal : inView;
  const Tag = as as React.ElementType;

  const dataProps: Record<string, string> = {
    "data-reveal": variant,
    "data-revealed": revealed ? "true" : "false",
  };
  if (iconStagger) dataProps["data-reveal-icons"] = "true";

  return (
    <Tag
      ref={ref as unknown as React.Ref<HTMLElement>}
      className={className}
      style={{ ["--reveal-delay" as never]: `${delay}ms`, ...style }}
      {...dataProps}
      {...rest}
    >
      {children}
    </Tag>
  );
}

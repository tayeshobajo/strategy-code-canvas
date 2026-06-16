import * as React from "react";

type RevealOptions = {
  threshold?: number;
  rootMargin?: string;
  once?: boolean;
};

export function useReveal<T extends Element = HTMLDivElement>(
  options: RevealOptions = {},
): { ref: React.RefObject<T | null>; inView: boolean } {
  const { threshold = 0.15, rootMargin = "0px 0px -10% 0px", once = true } = options;
  const ref = React.useRef<T | null>(null);
  const [inView, setInView] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setInView(true);
      return;
    }
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true);
            if (once) io.disconnect();
          } else if (!once) {
            setInView(false);
          }
        }
      },
      { threshold, rootMargin },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [threshold, rootMargin, once]);

  return { ref, inView };
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

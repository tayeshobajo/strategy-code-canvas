import { useEffect, useState, useRef } from "react";
import { ChevronLeft, ChevronRight, X, Download, Copy, Check } from "lucide-react";
import type { WorkspaceProject } from "@/lib/engine-workspace";
import { exportClientRoadmapPdf } from "@/lib/roadmap-pdf";

type Slide = {
  kicker: string;
  title: string;
  body?: string;
  bullets?: string[];
  meta?: string;
};

function buildSlides(project: WorkspaceProject): Slide[] {
  const point_a = project.point_a as { key_diagnosis?: string };
  const point_b = project.point_b as Record<string, string | undefined>;
  const phases = ((project.investment as { phases?: Array<{ name: string; outcome?: string; timeline?: string; range?: string }> })?.phases) ?? [];
  const nodes = ((project.blueprint as { nodes?: Array<{ name: string; group: string }> })?.nodes) ?? [];
  const milestones = ((project.roadmap as { milestones?: Array<{ name: string; phase?: string; client_facing?: string; purpose?: string }> })?.milestones) ?? [];

  const slides: Slide[] = [
    {
      kicker: `${project.client_company} · Roadmap`,
      title: project.name,
      meta: new Date().toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }),
    },
    {
      kicker: "Executive summary",
      title: "Where we stand today",
      body: point_a.key_diagnosis ?? "—",
    },
    {
      kicker: "Point B",
      title: "Where we're going",
      body: point_b["24_month_destination"] ?? "—",
      meta: point_b["10_year_position"] ? `Ten-year: ${point_b["10_year_position"]}` : undefined,
    },
    ...phases.map((p) => ({
      kicker: "Phase",
      title: p.name,
      body: p.outcome ?? "",
      bullets: [p.timeline, p.range].filter(Boolean) as string[],
    })),
    {
      kicker: "System blueprint",
      title: "The operating system we're building",
      bullets: nodes.map((n) => n.name).slice(0, 10),
    },
    ...(milestones.length
      ? [{
          kicker: "Milestones",
          title: "The order of work",
          bullets: milestones.slice(0, 8).map((m) => m.name),
        }]
      : []),
    {
      kicker: "Next",
      title: "One conversation. No slides. No pitch.",
      meta: "trusttai.com",
    },
  ];
  return slides;
}

export function PresentationMode({
  project,
  onClose,
}: {
  project: WorkspaceProject;
  onClose: () => void;
}) {
  const slides = buildSlides(project);
  const [idx, setIdx] = useState(0);
  const [copied, setCopied] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const calc = () => {
      const w = window.innerWidth, h = window.innerHeight;
      setScale(Math.min(w / 1920, h / 1080));
    };
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" || e.key === " ") setIdx((i) => Math.min(i + 1, slides.length - 1));
      if (e.key === "ArrowLeft") setIdx((i) => Math.max(i - 1, 0));
      if (e.key.toLowerCase() === "f") rootRef.current?.requestFullscreen?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, slides.length]);

  const slide = slides[idx];

  const share = async () => {
    const url = new URL(window.location.href);
    url.searchParams.set("present", "1");
    await navigator.clipboard.writeText(url.toString());
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div ref={rootRef} className="fixed inset-0 z-[80] bg-black text-white overflow-hidden">
      <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
        <div
          className="absolute left-1/2 top-1/2 bg-[#F8F5EE] text-[#171a23]"
          style={{
            width: 1920,
            height: 1080,
            marginLeft: -960,
            marginTop: -540,
            transform: `scale(${scale})`,
            transformOrigin: "center center",
          }}
        >
          <div className="slide-content w-full h-full flex flex-col justify-between p-24 relative">
            <style>{`
              .slide-content { font-family: system-ui, sans-serif; }
              .slide-kicker { font-size: 22px; letter-spacing: 0.28em; text-transform: uppercase; color: #253791; }
              .slide-title { font-family: 'Cormorant Garamond', 'Times New Roman', serif; font-size: 108px; line-height: 1.02; letter-spacing: -0.03em; }
              .slide-body { font-size: 40px; line-height: 1.32; max-width: 1400px; }
              .slide-bullet { font-size: 34px; line-height: 1.4; }
              .slide-meta { font-size: 22px; color: #6e7482; letter-spacing: 0.06em; }
            `}</style>
            <div>
              <div className="slide-kicker">{slide.kicker}</div>
              <h2 className="slide-title mt-10">{slide.title}</h2>
              {slide.body ? <p className="slide-body mt-10">{slide.body}</p> : null}
              {slide.bullets && slide.bullets.length > 0 ? (
                <ul className="mt-10 space-y-4">
                  {slide.bullets.map((b, i) => (
                    <li key={i} className="slide-bullet flex items-start gap-4">
                      <span className="text-[#253791]">·</span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <div className="flex items-end justify-between">
              <div className="slide-meta">{slide.meta ?? "Trust Tai · trusttai.com"}</div>
              <div className="slide-meta">{idx + 1} / {slides.length}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Chrome */}
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <button onClick={share} className="inline-flex items-center gap-1.5 text-xs bg-white/10 hover:bg-white/20 rounded-md px-3 py-1.5">
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? "Copied" : "Share link"}
        </button>
        <button onClick={() => exportClientRoadmapPdf(project)} className="inline-flex items-center gap-1.5 text-xs bg-white/10 hover:bg-white/20 rounded-md px-3 py-1.5">
          <Download className="w-3.5 h-3.5" /> PDF
        </button>
        <button onClick={onClose} className="inline-flex items-center gap-1.5 text-xs bg-white/10 hover:bg-white/20 rounded-md px-3 py-1.5" aria-label="Close presentation">
          <X className="w-3.5 h-3.5" /> Esc
        </button>
      </div>
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2">
        <button
          onClick={() => setIdx((i) => Math.max(i - 1, 0))}
          disabled={idx === 0}
          className="p-2 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30"
          aria-label="Previous slide"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="text-xs text-white/70 min-w-[60px] text-center">{idx + 1} / {slides.length}</div>
        <button
          onClick={() => setIdx((i) => Math.min(i + 1, slides.length - 1))}
          disabled={idx === slides.length - 1}
          className="p-2 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30"
          aria-label="Next slide"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

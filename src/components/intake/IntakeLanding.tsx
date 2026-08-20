import {
  ArrowRight,
  CheckCircle2,
  Compass,
  Home,
  Lightbulb,
  ListChecks,
  MessagesSquare,
  Mic,
  Network,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Lock,
} from "lucide-react";
import * as React from "react";
import { Reveal } from "@/hooks/use-reveal";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import heroRoom from "@/assets/roadmap-intake-hero.png.asset.json";

const STEPS = [
  {
    icon: MessagesSquare,
    title: "Tell us your world",
    body: "Share where you are today, what's working, what's hard, and what you want to build.",
  },
  {
    icon: Sparkles,
    title: "Imagine what's possible",
    body: "We'll ask thoughtful questions to help you explore your goals, constraints, and opportunities.",
  },
  {
    icon: ListChecks,
    title: "We make sense of it",
    body: "We turn your answers into clear insights and a draft view of the path ahead.",
  },
  {
    icon: Compass,
    title: "Next steps, clearly",
    body: "We'll follow up with what matters most and the right next move for your business.",
  },
];

const AUDIENCES = [
  {
    icon: Home,
    title: "Service & Local Businesses",
    body: "Get more customers and streamline operations so you can grow.",
  },
  {
    icon: TrendingUp,
    title: "Scaling Companies",
    body: "Align strategy, systems, and team to unlock the next level.",
  },
  {
    icon: Lightbulb,
    title: "New Ideas & Products",
    body: "Validate faster, build smarter, and launch with confidence.",
  },
  {
    icon: Users,
    title: "Founder-Led Teams",
    body: "Get clear direction and the right support to move forward.",
  },
];

const APPROACH = [
  {
    icon: Target,
    title: "See the whole picture",
    body: "We look above the maze to understand what truly matters.",
  },
  {
    icon: Network,
    title: "Sequence what matters",
    body: "We build a clear path with priorities, milestones, and focus.",
  },
  {
    icon: CheckCircle2,
    title: "Deliver what moves you",
    body: "We execute with you and your team until it's real.",
  },
];

const ASSURANCES = [
  {
    icon: ShieldCheck,
    title: "Your information is safe",
    body: "We respect your time and your business. We'll never spam you, sell your information, or share your conversation.",
  },
  {
    icon: Lock,
    title: "Confidential",
    body: "Your answers are private and protected.",
  },
  {
    icon: Sparkles,
    title: "Thoughtful follow-up",
    body: "We'll get back to you if we can add real value.",
  },
  {
    icon: CheckCircle2,
    title: "No pressure",
    body: "This isn't a sales pitch. It's a clarity conversation.",
  },
];

export function IntakeLanding(props: {
  resuming: boolean;
  resumed: boolean;
  onStart: () => void;
  onStartVoice?: () => void;
}) {
  const startLabel = props.resumed ? "Pick up where we left off" : "Start the conversation";

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-paper">
        <div className="grid lg:grid-cols-[1fr_1fr]">
          <div className="flex items-center px-6 py-16 md:py-24 lg:pl-[max(1.5rem,calc((100vw-1280px)/2))] lg:pr-16">
            <Reveal className="max-w-xl">
              <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal">
                Build Your Roadmap
              </p>
              <h1 className="mt-5 font-display text-[2.75rem] leading-[1.05] md:text-[4rem]">
                Start with the business you want to build.
              </h1>
              <div className="mt-7 h-[3px] w-16 bg-royal" />
              <p className="mt-7 text-base leading-relaxed text-ink/70">
                Tell us where you are, what you've been thinking about, and what you'd
                love the business to become.
              </p>
              <p className="mt-4 text-base leading-relaxed text-ink/70">
                We'll listen, ask smart questions, and turn the picture into a clear,
                sequenced path forward.
              </p>

              <div className="mt-9 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={props.resuming}
                  onClick={props.onStart}
                  className="inline-flex items-center gap-2 rounded-full bg-ink px-7 py-4 text-sm text-paper transition hover:bg-royal disabled:opacity-60"
                >
                  <Sparkles className="h-4 w-4" />
                  {startLabel}
                </button>
                <button
                  type="button"
                  disabled={props.resuming}
                  onClick={props.onStartVoice ?? props.onStart}
                  className="inline-flex items-center gap-2 rounded-full border border-ink/15 bg-white px-7 py-4 text-sm text-ink transition hover:border-royal hover:text-royal disabled:opacity-60"
                >
                  <Mic className="h-4 w-4 text-royal" />
                  Use your voice
                </button>
              </div>

              <p className="mt-6 inline-flex items-center gap-2 text-sm text-ink/70">
                <Lock className="h-3.5 w-3.5" />
                About 7 to 12 minutes. You can stop anytime.
              </p>
            </Reveal>
          </div>

          <div className="relative min-h-[380px] lg:min-h-[620px]">
            <img
              src={heroRoom.url}
              alt="A quiet table by a window, set for a conversation"
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-paper/70 via-paper/0 to-transparent lg:from-paper/80" />

            <HeroConversation />

          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="bg-white px-6 py-20 md:py-24">
        <div className="mx-auto max-w-6xl text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal">
            How it works
          </p>
          <h2 className="mt-4 font-display text-3xl md:text-[2.5rem]">
            A conversation that creates clarity.
          </h2>

          <ol className="mt-14 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, i) => (
              <li key={step.title} className="relative text-left">
                <div className="flex flex-col items-center text-center">
                  <span className="grid h-16 w-16 place-items-center rounded-full border border-royal/20 bg-white">
                    <step.icon className="h-6 w-6 text-royal" strokeWidth={1.5} />
                  </span>
                  <span className="mt-4 font-mono text-[11px] tracking-[0.24em] text-royal">
                    0{i + 1}
                  </span>
                </div>
                <h3 className="mt-4 font-sans text-[15px] font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink/65">{step.body}</p>
                {i < STEPS.length - 1 && (
                  <span className="absolute left-[calc(50%+2.5rem)] right-[-2.5rem] top-8 hidden border-t border-dashed border-ink/20 lg:block" />
                )}
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Who it's for */}
      <section className="bg-paper px-6 py-20 md:py-24">
        <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal">
              Who it's for
            </p>
            <h2 className="mt-4 font-display text-3xl leading-tight md:text-[2.5rem]">
              Founders building something meaningful.
            </h2>
            <p className="mt-6 text-base leading-relaxed text-ink/70">
              Whether you're starting out, scaling up, or stuck in the middle, this is
              for you.
            </p>
            <a
              href="/about"
              className="mt-6 inline-flex items-center gap-2 text-sm text-royal hover:underline"
            >
              Learn more about us <ArrowRight className="h-4 w-4" />
            </a>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {AUDIENCES.map((item) => (
              <div
                key={item.title}
                className="flex gap-4 rounded-lg border border-ink/10 bg-white p-6"
              >
                <item.icon className="h-6 w-6 shrink-0 text-royal" strokeWidth={1.5} />
                <div>
                  <h3 className="font-sans text-[15px] font-semibold">{item.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink/65">
                    {item.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Approach */}
      <section className="bg-ink px-6 py-20 text-paper md:py-24">
        <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal-soft">
              Our approach
            </p>
            <h2 className="mt-4 font-display text-3xl leading-tight md:text-[2.5rem]">
              Roadmap Thinking.
              <br />
              <em className="italic">Real outcomes.</em>
            </h2>
          </div>

          <div className="grid gap-8 sm:grid-cols-3 sm:divide-x sm:divide-paper/15">
            {APPROACH.map((item) => (
              <div key={item.title} className="sm:px-6 sm:first:pl-0 sm:last:pr-0">
                <item.icon className="h-6 w-6 text-paper" strokeWidth={1.5} />
                <h3 className="mt-4 font-sans text-[15px] font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-paper/70">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonial */}
      <section className="bg-white px-6 py-20 text-center md:py-24">
        <div className="mx-auto max-w-3xl">
          <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal">
            What founders say
          </p>
          <blockquote className="mt-6 font-display text-2xl leading-snug md:text-[2rem]">
            “Trust Tai helped us see the path we couldn't see ourselves. They brought
            clarity, focus, and real results.”
          </blockquote>
          <p className="mt-5 text-sm text-ink/60">J. Adams, Founder</p>
        </div>
      </section>

      {/* Assurances */}
      <section className="bg-white px-6 pb-24">
        <div className="mx-auto max-w-6xl rounded-xl border border-royal/15 bg-royal/[0.04] p-8">
          <div className="grid gap-8 md:grid-cols-4 md:divide-x md:divide-ink/10">
            {ASSURANCES.map((item) => (
              <div key={item.title} className="flex gap-3 md:px-5 md:first:pl-0">
                <item.icon className="h-5 w-5 shrink-0 text-royal" strokeWidth={1.5} />
                <div>
                  <h3 className="font-sans text-sm font-semibold">{item.title}</h3>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-ink/65">
                    {item.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-8 flex justify-end border-t border-ink/10 pt-6">
            <button
              type="button"
              onClick={props.onStart}
              className="inline-flex items-center gap-2 text-sm text-royal hover:underline"
            >
              {startLabel} <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>
    </>
  );
}

const HERO_LINES: { mine?: boolean; text: string; typing: number; pause: number }[] = [
  {
    text: "Let's start with your world. Tell me about your business the way you would tell a friend over coffee.",
    typing: 1100,
    pause: 700,
  },
  {
    mine: true,
    text: "We help local service businesses get more customers and run more smoothly.",
    typing: 600,
    pause: 800,
  },
  {
    text: "Nice. What does the business look like two years from now if everything is working the way you want?",
    typing: 1300,
    pause: 500,
  },
];

function formatClock(date: Date) {
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function HeroConversation() {
  const reduced = useReducedMotion();
  const [shown, setShown] = React.useState(0);
  const [streamText, setStreamText] = React.useState("");
  const [streamIndex, setStreamIndex] = React.useState(-1);
  const [typing, setTyping] = React.useState<"none" | "them" | "me">("none");
  const [receipt, setReceipt] = React.useState<"none" | "delivered" | "seen">(
    "none",
  );
  const [stamps, setStamps] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (reduced) {
      setShown(HERO_LINES.length);
      setTyping("them");
      setReceipt("seen");
      setStamps(HERO_LINES.map(() => formatClock(new Date())));
      return;
    }
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const wait = (ms: number) =>
      new Promise<void>((resolve) => timers.push(setTimeout(resolve, ms)));

    const stamp = (i: number) =>
      setStamps((prev) => {
        const next = [...prev];
        next[i] = formatClock(new Date());
        return next;
      });

    void (async () => {
      await wait(500);
      for (let i = 0; i < HERO_LINES.length; i++) {
        const line = HERO_LINES[i]!;
        if (cancelled) return;
        setTyping(line.mine ? "me" : "them");
        await wait(line.typing);
        if (cancelled) return;
        setTyping("none");

        if (line.mine) {
          setShown(i + 1);
          stamp(i);
          setReceipt("delivered");
          await wait(900);
          if (cancelled) return;
          setReceipt("seen");
        } else {
          // stream the assistant line character by character
          setStreamIndex(i);
          setStreamText("");
          for (let c = 1; c <= line.text.length; c++) {
            if (cancelled) return;
            setStreamText(line.text.slice(0, c));
            await wait(line.text[c - 1] === " " ? 12 : 18);
          }
          if (cancelled) return;
          setStreamIndex(-1);
          setStreamText("");
          setShown(i + 1);
          stamp(i);
        }
        await wait(line.pause);
      }
      if (cancelled) return;
      setTyping("them");
    })();

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [reduced]);

  return (
    <div className="relative z-10 flex h-full min-h-[320px] flex-col justify-center gap-3 px-6 py-12 md:px-10">
      {HERO_LINES.slice(0, shown).map((line, i) => (
        <div key={line.text} className="flex flex-col gap-1">
          <Bubble mine={line.mine} animate={!reduced}>
            {line.text}
          </Bubble>
          <span
            className={[
              "px-1 font-mono text-[10px] tracking-wide text-ink/70",
              line.mine ? "ml-auto" : "",
            ].join(" ")}
          >
            {stamps[i] ?? ""}
            {line.mine && receipt !== "none" ? (
              <span className="ml-1.5 text-ink/70">
                · {receipt === "seen" ? "Seen" : "Delivered"}
              </span>
            ) : null}
          </span>
        </div>
      ))}

      {streamIndex >= 0 && (
        <Bubble mine={HERO_LINES[streamIndex]!.mine} animate={false}>
          {streamText}
          <span className="ml-0.5 inline-block h-[0.95em] w-[2px] translate-y-[2px] animate-pulse bg-ink/50 align-baseline" />
        </Bubble>
      )}

      {typing !== "none" && (
        <div
          className={[
            "mt-1 inline-flex w-fit items-center gap-1.5 rounded-full px-3.5 py-2.5 shadow-sm backdrop-blur",
            typing === "me" ? "ml-auto bg-royal/90" : "bg-white/85",
            reduced ? "" : "animate-fade-in",
          ].join(" ")}
        >
          <Dot mine={typing === "me"} delay="0ms" />
          <Dot mine={typing === "me"} delay="150ms" />
          <Dot mine={typing === "me"} delay="300ms" />
        </div>
      )}
    </div>
  );
}


function Bubble(props: {
  children: React.ReactNode;
  mine?: boolean;
  animate?: boolean;
}) {
  return (
    <div
      className={[
        "max-w-[19rem] rounded-xl px-4 py-3 text-[13px] leading-relaxed shadow-sm",
        props.mine
          ? "ml-auto bg-royal text-white"
          : "bg-white/95 text-ink backdrop-blur",
        props.animate ? "animate-fade-in" : "",
      ].join(" ")}
    >
      {props.children}
    </div>
  );
}

function Dot(props: { mine?: boolean; delay?: string }) {
  return (
    <span
      className={[
        "h-1.5 w-1.5 animate-pulse rounded-full",
        props.mine ? "bg-white/70" : "bg-ink/30",
      ].join(" ")}
      style={props.delay ? { animationDelay: props.delay } : undefined}
    />
  );
}


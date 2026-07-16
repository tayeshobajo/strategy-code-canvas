import { createFileRoute } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";

/**
 * Sprint 1 · Wave 1 — Strategic Sales stub route.
 * The full Strategic Sales module lands after Spine 2.0 is validated.
 * This placeholder exists so the global nav honors the eight-item shell
 * from the design brief without linking to a 404.
 */
export const Route = createFileRoute("/engine/strategic-sales")({
  component: StrategicSalesStub,
});

function StrategicSalesStub() {
  return (
    <div className="mx-auto max-w-3xl p-8">
      <div className="rounded-2xl border border-[#E8E1D6] bg-white p-8 shadow-sm">
        <div className="inline-flex items-center gap-1.5 rounded-full border border-[#E8E1D6] bg-[#FBF9F4] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.22em] text-[#3E68B2]">
          <Sparkles className="h-3 w-3" />
          Coming after Spine 2.0
        </div>
        <h1 className="mt-4 font-display text-3xl text-[#0A0F1F]">Strategic Sales</h1>
        <p className="mt-3 text-sm text-[#3f4a63] max-w-xl">
          The proprietary Strategic Sales method lands as its own module once the
          Project Spine, Milestone Delivery, and Client Roadmap experiences are
          validated. Freezing the operating frame first keeps Strategic Sales
          from pouring more intelligence into an interface that hasn't earned it.
        </p>
      </div>
    </div>
  );
}

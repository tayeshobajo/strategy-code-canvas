import { createFileRoute } from "@tanstack/react-router";
import { Settings } from "lucide-react";

/**
 * Sprint 1 · Wave 1 — Engine Settings stub route.
 * Real settings surfaces (roles, brand, billing, permissions) land after
 * Spine 2.0. This exists so the global nav resolves without a 404.
 */
export const Route = createFileRoute("/engine/settings")({
  component: EngineSettingsStub,
});

function EngineSettingsStub() {
  return (
    <div className="mx-auto max-w-3xl p-8">
      <div className="rounded-2xl border border-[#E8E1D6] bg-white p-8 shadow-sm">
        <div className="inline-flex items-center gap-1.5 rounded-full border border-[#E8E1D6] bg-[#FBF9F4] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.22em] text-[#3E68B2]">
          <Settings className="h-3 w-3" />
          Placeholder
        </div>
        <h1 className="mt-4 font-display text-3xl text-[#0A0F1F]">Settings</h1>
        <p className="mt-3 text-sm text-[#3f4a63] max-w-xl">
          Engine-wide settings — roles, brand, billing, integrations — will
          live here. For now, project-scoped settings remain on each project's
          Project Actions menu.
        </p>
      </div>
    </div>
  );
}

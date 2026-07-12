/**
 * admin.platform-config.tsx
 *
 * Phase 1C — Platform Configuration UI
 *
 * Engine operators (admin role) configure:
 *  1. Workspace-level defaults: project type, governance gates, staleness window
 *  2. Global delivery checklist items
 *  3. Project type template catalogue (read-only view)
 */

import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  getPlatformConfig,
  savePlatformConfig,
  getProjectTypeTemplates,
  type WorkspaceConfig,
  type GovernanceGateThreshold,
  type DeliveryChecklistItem,
  type ProjectTypeTemplate,
} from "@/lib/engine-platform-config.functions";
import { CheckCircle2, AlertCircle, ChevronDown, ChevronUp, Settings2, List, Layers } from "lucide-react";

export const Route = createFileRoute("/admin/platform-config")({
  ssr: false,
  component: PlatformConfigPage,
});

// ---------------------------------------------------------------------------
// Small shared components
// ---------------------------------------------------------------------------

function SectionCard({ title, icon: Icon, children }: {
  title: string;
  icon?: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-6 mb-6">
      <div className="flex items-center gap-2 mb-5 pb-3 border-b border-white/10">
        {Icon && <Icon className="w-4 h-4 text-amber-400 shrink-0" />}
        <h2 className="text-sm font-semibold uppercase tracking-widest text-amber-400">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-4 border-b border-white/10 py-3 items-start last:border-b-0">
      <div className="text-xs font-mono text-white/60 pt-1">{label}</div>
      <div className="col-span-2">{children}</div>
    </div>
  );
}

function Toggle({
  value,
  onChange,
  disabled,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!value)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
        value ? "bg-amber-500" : "bg-white/20"
      } ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
          value ? "translate-x-4" : "translate-x-1"
        }`}
      />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Governance Gate editor row
// ---------------------------------------------------------------------------

function GateRow({
  gate,
  onChange,
}: {
  gate: GovernanceGateThreshold;
  onChange: (updated: GovernanceGateThreshold) => void;
}) {
  return (
    <div className="rounded border border-white/10 bg-white/[0.03] p-3 mb-2">
      <div className="flex items-center gap-2 mb-2">
        <span className="font-mono text-xs text-amber-300 bg-amber-400/10 px-2 py-0.5 rounded">
          {gate.step}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
        <label className="flex items-center gap-2 text-white/70">
          <span className="font-mono w-40">max open decisions</span>
          <input
            type="number"
            min={0}
            max={99}
            value={gate.max_open_decisions}
            onChange={(e) =>
              onChange({ ...gate, max_open_decisions: Math.max(0, parseInt(e.target.value) || 0) })
            }
            className="w-16 rounded bg-white/10 border border-white/20 px-2 py-1 text-white font-mono text-xs"
          />
        </label>
        <label className="flex items-center gap-2 text-white/70">
          <Toggle
            value={gate.require_client_ack}
            onChange={(v) => onChange({ ...gate, require_client_ack: v })}
          />
          <span>require client ack</span>
        </label>
        <div />
        <label className="flex items-center gap-2 text-white/70">
          <Toggle
            value={gate.require_delivery_readiness}
            onChange={(v) => onChange({ ...gate, require_delivery_readiness: v })}
          />
          <span>require delivery readiness</span>
        </label>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Delivery checklist editor
// ---------------------------------------------------------------------------

function ChecklistEditor({
  items,
  onChange,
}: {
  items: DeliveryChecklistItem[];
  onChange: (items: DeliveryChecklistItem[]) => void;
}) {
  return (
    <div className="space-y-2">
      {items.map((item, idx) => (
        <div
          key={item.id}
          className="flex items-center gap-3 rounded border border-white/10 bg-white/[0.03] px-3 py-2"
        >
          <Toggle
            value={item.required}
            onChange={(v) => {
              const next = [...items];
              next[idx] = { ...item, required: v };
              onChange(next);
            }}
          />
          <input
            type="text"
            value={item.label}
            onChange={(e) => {
              const next = [...items];
              next[idx] = { ...item, label: e.target.value };
              onChange(next);
            }}
            className="flex-1 bg-transparent text-sm text-white/80 outline-none border-b border-transparent focus:border-amber-400/50 font-mono"
          />
          <span className="text-xs text-white/30 font-mono">{item.required ? "required" : "optional"}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Project type template card (read-only)
// ---------------------------------------------------------------------------

function TemplateCard({ template }: { template: ProjectTypeTemplate }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded border border-white/10 bg-white/[0.03] mb-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5"
      >
        <div className="flex-1">
          <div className="text-sm font-semibold text-white">{template.name}</div>
          <div className="text-xs text-white/50 mt-0.5">{template.description}</div>
        </div>
        <div className="flex gap-1 mr-2">
          {template.tags.map((t) => (
            <span
              key={t}
              className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-400/10 text-amber-300"
            >
              {t}
            </span>
          ))}
        </div>
        {open ? (
          <ChevronUp className="w-4 h-4 text-white/40 shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-white/40 shrink-0" />
        )}
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-white/10">
          <div className="grid grid-cols-2 gap-6">
            {/* Steps */}
            <div>
              <div className="text-xs font-mono uppercase text-white/40 mb-2">Default steps</div>
              <div className="space-y-1">
                {template.default_steps.map((s) => (
                  <div key={s.key} className="flex items-center gap-2 text-xs">
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        s.required ? "bg-amber-400" : "bg-white/20"
                      }`}
                    />
                    <span className="font-mono text-white/70">{s.key}</span>
                    <span className="text-white/40">— {s.label}</span>
                    {!s.required && (
                      <span className="text-white/30 italic">(optional)</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
            {/* Governance */}
            <div>
              <div className="text-xs font-mono uppercase text-white/40 mb-2">Default governance</div>
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      template.default_governance.require_client_ack_before_delivery
                        ? "bg-green-400"
                        : "bg-white/20"
                    }`}
                  />
                  <span className="text-white/60">Require client ack before delivery</span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      template.default_governance.require_delivery_readiness_gate
                        ? "bg-green-400"
                        : "bg-white/20"
                    }`}
                  />
                  <span className="text-white/60">Delivery readiness gate</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  <span className="text-white/60">
                    Max open decisions before delivery:{" "}
                    <strong className="text-white">
                      {template.default_governance.max_open_decisions_before_delivery}
                    </strong>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

const WORKSPACE_ID = "default";

function PlatformConfigPage() {
  const fetchConfig = useServerFn(getPlatformConfig);
  const fetchTemplates = useServerFn(getProjectTypeTemplates);
  const saveConfig = useServerFn(savePlatformConfig);
  const qc = useQueryClient();

  const configQ = useQuery({
    queryKey: ["platform-config", WORKSPACE_ID],
    queryFn: () => fetchConfig({ data: { workspaceId: WORKSPACE_ID } }),
    refetchOnWindowFocus: false,
  });

  const templatesQ = useQuery({
    queryKey: ["project-type-templates"],
    queryFn: () => fetchTemplates(),
    refetchOnWindowFocus: false,
  });

  // Local draft state
  const [draft, setDraft] = useState<WorkspaceConfig | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const config = draft ?? configQ.data?.config ?? null;

  const saveMutation = useMutation({
    mutationFn: async (cfg: WorkspaceConfig) => {
      setSaveStatus("saving");
      return saveConfig({
        data: {
          workspaceId: WORKSPACE_ID,
          config: {
            default_project_type: cfg.default_project_type,
            require_proposal_approval: cfg.require_proposal_approval,
            roadmap_staleness_days: cfg.roadmap_staleness_days,
            governance_gates: cfg.governance_gates,
            delivery_checklist: cfg.delivery_checklist,
          },
        },
      });
    },
    onSuccess: (result) => {
      qc.setQueryData(["platform-config", WORKSPACE_ID], { config: result.config });
      setDraft(null);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 3000);
    },
    onError: () => {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 4000);
    },
  });

  function updateGate(idx: number, updated: GovernanceGateThreshold) {
    if (!config) return;
    const gates = [...config.governance_gates];
    gates[idx] = updated;
    setDraft({ ...config, governance_gates: gates });
  }

  function updateChecklist(items: DeliveryChecklistItem[]) {
    if (!config) return;
    setDraft({ ...config, delivery_checklist: items });
  }

  const isDirty = draft !== null;

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold mb-1">Platform configuration</h1>
          <p className="text-white/50 text-sm">
            Workspace-wide defaults and governance rules. Changes apply to all new projects.
          </p>
        </div>
        {isDirty && (
          <button
            type="button"
            disabled={saveMutation.isPending}
            onClick={() => config && saveMutation.mutate(config)}
            className="flex items-center gap-2 rounded bg-amber-500 hover:bg-amber-400 text-black text-sm font-semibold px-4 py-2 disabled:opacity-50 transition-colors"
          >
            {saveStatus === "saving" ? "Saving…" : "Save changes"}
          </button>
        )}
      </div>

      {/* Save status bar */}
      {saveStatus === "saved" && (
        <div className="flex items-center gap-2 rounded border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-300 mb-4">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          Configuration saved.
        </div>
      )}
      {saveStatus === "error" && (
        <div className="flex items-center gap-2 rounded border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300 mb-4">
          <AlertCircle className="w-4 h-4 shrink-0" />
          Save failed. Check your permissions and try again.
        </div>
      )}

      {configQ.isLoading && (
        <div className="text-white/40 text-sm py-10 text-center">Loading…</div>
      )}

      {config && (
        <>
          {/* === Section 1: Workspace defaults === */}
          <SectionCard title="Workspace defaults" icon={Settings2}>
            <FieldRow label="default_project_type">
              <select
                value={config.default_project_type}
                onChange={(e) => setDraft({ ...config, default_project_type: e.target.value })}
                className="rounded bg-white/10 border border-white/20 text-white text-sm px-3 py-1.5 font-mono"
              >
                <option value="web-app">web-app</option>
                <option value="marketing-site">marketing-site</option>
                <option value="mobile-app">mobile-app</option>
                <option value="api-integration">api-integration</option>
              </select>
            </FieldRow>
            <FieldRow label="require_proposal_approval">
              <div className="flex items-center gap-3">
                <Toggle
                  value={config.require_proposal_approval}
                  onChange={(v) => setDraft({ ...config, require_proposal_approval: v })}
                />
                <span className="text-xs text-white/50">
                  {config.require_proposal_approval
                    ? "Proposals require explicit approval before spine write"
                    : "Proposals can be applied directly"}
                </span>
              </div>
            </FieldRow>
            <FieldRow label="roadmap_staleness_days">
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={7}
                  max={365}
                  value={config.roadmap_staleness_days}
                  onChange={(e) =>
                    setDraft({
                      ...config,
                      roadmap_staleness_days: Math.max(7, parseInt(e.target.value) || 30),
                    })
                  }
                  className="w-20 rounded bg-white/10 border border-white/20 px-2 py-1 text-white font-mono text-sm"
                />
                <span className="text-xs text-white/50">days before a roadmap is flagged stale</span>
              </div>
            </FieldRow>
            {config.updated_by && (
              <FieldRow label="last_saved_by">
                <span className="font-mono text-xs text-white/40">
                  {config.updated_by} · {new Date(config.updated_at).toLocaleString()}
                </span>
              </FieldRow>
            )}
          </SectionCard>

          {/* === Section 2: Governance gates === */}
          <SectionCard title="Governance gate thresholds" icon={List}>
            <p className="text-xs text-white/40 mb-4">
              These gates block advancement at specific steps until the conditions are met.
            </p>
            {config.governance_gates.map((gate, idx) => (
              <GateRow key={gate.step} gate={gate} onChange={(updated) => updateGate(idx, updated)} />
            ))}
          </SectionCard>

          {/* === Section 3: Delivery checklist === */}
          <SectionCard title="Global delivery checklist" icon={List}>
            <p className="text-xs text-white/40 mb-4">
              These items appear on every project's delivery readiness panel. Toggle required/optional.
            </p>
            <ChecklistEditor
              items={config.delivery_checklist}
              onChange={updateChecklist}
            />
          </SectionCard>
        </>
      )}

      {/* === Section 4: Project type templates (read-only catalogue) === */}
      <SectionCard title="Project type templates" icon={Layers}>
        <p className="text-xs text-white/40 mb-4">
          Available project types and their default step sequences and governance rules.
          Hardcoded in the engine; custom templates require a code deploy.
        </p>
        {templatesQ.isLoading && (
          <div className="text-white/40 text-xs">Loading templates…</div>
        )}
        {(templatesQ.data?.templates ?? []).map((t) => (
          <TemplateCard key={t.id} template={t} />
        ))}
      </SectionCard>
    </div>
  );
}

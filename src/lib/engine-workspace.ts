export const WORKSPACE_STEPS = [
  { num: 1, key: "intelligence", label: "Intelligence Layer", to: "/engine/projects/$projectId/intelligence" },
  { num: 2, key: "signal-room", label: "Signal Room", to: "/engine/projects/$projectId/signal-room" },
  { num: 3, key: "extraction", label: "Signal Extraction", to: "/engine/projects/$projectId/extraction" },
  { num: 4, key: "point-a", label: "Point A Diagnosis", to: "/engine/projects/$projectId/point-a" },
  { num: 5, key: "point-b", label: "Point B Definition", to: "/engine/projects/$projectId/point-b" },
  { num: 6, key: "hidden-assets", label: "Hidden Asset Map", to: "/engine/projects/$projectId/hidden-assets" },
  { num: 7, key: "gap-map", label: "Gap Map", to: "/engine/projects/$projectId/gap-map" },
  { num: 8, key: "blueprint", label: "System Blueprint", to: "/engine/projects/$projectId/blueprint" },
  { num: 9, key: "builder", label: "Roadmap Builder", to: "/engine/projects/$projectId/builder" },
  { num: 10, key: "sequencing", label: "Sequencing View", to: "/engine/projects/$projectId/sequencing" },
  { num: 11, key: "deadlines", label: "Deadline Plan", to: "/engine/projects/$projectId/deadlines" },
  { num: 12, key: "investment", label: "Investment Builder", to: "/engine/projects/$projectId/investment" },
  { num: 13, key: "preview", label: "Client Preview", to: "/engine/projects/$projectId/preview" },
  { num: 14, key: "delivery", label: "Delivery Prep", to: "/engine/projects/$projectId/delivery" },
] as const;

export type WorkspaceStepKey = (typeof WORKSPACE_STEPS)[number]["key"];

export type Json = string | number | boolean | null | { [k: string]: Json } | Json[];

export type WorkspaceProject = {
  id: string;
  name: string;
  status: string;
  current_step_num: number;
  progress_pct: number;
  health_score: number;
  roadmap_version: string | null;
  approved_version: string | null;
  agent_status: string;
  agent_budget_monthly_cents: number;
  agent_spend_month_cents: number;
  open_decisions: number;
  next_action: string | null;
  last_activity_at: string;
  client_company: string;
  client_owner_email: string | null;
  signal_room: Json;
  extraction: Json;
  point_a: Json;
  point_b: Json;
  hidden_assets: Json;
  gap_map: Json;
  blueprint: Json;
  roadmap: Json;
  sequencing: Json;
  deadlines: Json;
  investment: Json;
  client_preview: Json;
  delivery: Json;
};

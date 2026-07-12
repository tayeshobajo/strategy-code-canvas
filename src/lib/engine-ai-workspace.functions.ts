/**
 * engine-ai-workspace.functions.ts
 *
 * Phase 3D — Project AI Workspace
 *
 * Stores and retrieves AI workspace links (ChatGPT conversation URL,
 * Claude project URL) and context notes per engine project.
 *
 * Storage strategy: metadata JSONB column on engine_projects.
 * No new tables required. The `ai_workspace` key is reserved inside
 * engine_projects.metadata for this feature.
 *
 * Server functions:
 *   getAiWorkspace(projectId)          — read current workspace config
 *   saveAiWorkspace(projectId, data)   — persist links + notes
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createServiceClient } from "@/integrations/supabase/service-client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AiWorkspaceProvider = {
  /** Human label */
  name: string;
  /** The conversation/project URL */
  url: string;
  /** Optional short note about what this conversation covers */
  notes?: string;
  /** ISO timestamp when this was last updated */
  updated_at: string;
};

export type AiWorkspace = {
  project_id: string;
  /** ChatGPT conversation URL (typically a chat.openai.com/c/... link) */
  chatgpt?: AiWorkspaceProvider;
  /** Claude project URL (typically a claude.ai/project/... link) */
  claude?: AiWorkspaceProvider;
  /** Any other AI tools (Gemini, Perplexity, etc.) */
  other: AiWorkspaceProvider[];
  /** General context note for the AI workspace — what the operator
   *  has loaded into context, key decisions made inside AI tools, etc. */
  context_note: string;
  /** ISO timestamp of last save */
  saved_at: string;
};

function emptyWorkspace(projectId: string): AiWorkspace {
  return {
    project_id: projectId,
    chatgpt: undefined,
    claude: undefined,
    other: [],
    context_note: "",
    saved_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const ProviderSchema = z.object({
  name: z.string().min(1).max(100),
  url: z.string().url("Must be a valid URL"),
  notes: z.string().max(500).optional(),
  updated_at: z.string(),
});

const SaveAiWorkspaceSchema = z.object({
  projectId: z.string().uuid(),
  chatgpt: ProviderSchema.optional(),
  claude: ProviderSchema.optional(),
  other: z.array(ProviderSchema).max(10).default([]),
  context_note: z.string().max(2000).default(""),
});

// ---------------------------------------------------------------------------
// Server functions
// ---------------------------------------------------------------------------

/**
 * getAiWorkspace — read AI workspace config for a project.
 * Returns an empty workspace if none has been saved yet.
 */
export const getAiWorkspace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ projectId: z.string().uuid() }).parse(raw),
  )
  .handler(async ({ data }): Promise<{ workspace: AiWorkspace }> => {
    const supabase = createServiceClient();
    const { data: row, error } = await supabase
      .from("engine_projects")
      .select("id, metadata")
      .eq("id", data.projectId)
      .single();

    if (error || !row) {
      return { workspace: emptyWorkspace(data.projectId) };
    }

    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    const stored = meta["ai_workspace"] as AiWorkspace | undefined;

    if (!stored) {
      return { workspace: emptyWorkspace(data.projectId) };
    }

    return { workspace: { ...emptyWorkspace(data.projectId), ...stored, project_id: data.projectId } };
  });

/**
 * saveAiWorkspace — persist AI workspace links + context note.
 * Merges into engine_projects.metadata under the `ai_workspace` key.
 */
export const saveAiWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => SaveAiWorkspaceSchema.parse(raw))
  .handler(async ({ data }): Promise<{ ok: true; workspace: AiWorkspace }> => {
    const supabase = createServiceClient();

    // Read current metadata first (to merge, not clobber)
    const { data: row } = await supabase
      .from("engine_projects")
      .select("metadata")
      .eq("id", data.projectId)
      .single();

    const existingMeta = (row?.metadata ?? {}) as Record<string, unknown>;

    const workspace: AiWorkspace = {
      project_id: data.projectId,
      chatgpt: data.chatgpt
        ? { ...data.chatgpt, updated_at: new Date().toISOString() }
        : undefined,
      claude: data.claude
        ? { ...data.claude, updated_at: new Date().toISOString() }
        : undefined,
      other: data.other.map((o) => ({ ...o, updated_at: new Date().toISOString() })),
      context_note: data.context_note,
      saved_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("engine_projects")
      .update({
        metadata: {
          ...existingMeta,
          ai_workspace: workspace,
        },
      })
      .eq("id", data.projectId);

    if (error) {
      throw new Error(`Failed to save AI workspace: ${error.message}`);
    }

    return { ok: true, workspace };
  });

import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_project",
  title: "Get project",
  description:
    "Return a Trust Tai engine project's summary — Point A, Point B, roadmap, deadlines, and open decisions — scoped by the signed-in user's access (RLS).",
  inputSchema: {
    projectId: z.string().uuid().describe("The engine_projects.id UUID."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ projectId }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const sb = supabaseForUser(ctx);
    const { data, error } = await sb
      .from("engine_projects")
      .select(
        "id,name,roadmap_version,approved_version,point_a,point_b,roadmap,deadlines,open_decisions, engine_clients(company,industry)",
      )
      .eq("id", projectId)
      .maybeSingle();
    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    if (!data) {
      return { content: [{ type: "text", text: "Not found or not accessible" }], isError: true };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: { project: data },
    };
  },
});

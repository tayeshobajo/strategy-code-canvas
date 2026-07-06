import { auth, defineMcp } from "@lovable.dev/mcp-js";
import whoami from "./tools/whoami";
import listMyProjects from "./tools/list-my-projects";
import getProject from "./tools/get-project";

// Direct Supabase issuer (never the .lovable.cloud proxy — RFC 8414 issuer must match discovery).
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "trust-tai-mcp",
  title: "Trust Tai",
  version: "0.1.0",
  instructions:
    "Trust Tai strategy workspace. Use `whoami` to confirm the signed-in user, `list_my_projects` to see accessible engine projects, and `get_project` to fetch a project's Point A/B, roadmap, deadlines, and open decisions. All reads are scoped by the user's access (RLS).",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [whoami, listMyProjects, getProject],
});

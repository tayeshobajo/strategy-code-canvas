export type PortalWorkspaceState =
  | "payment_confirmed"
  | "portal_access_granted"
  | "workspace_provisioning"
  | "workspace_ready"
  | "engagement_active"
  | "engagement_completed"
  | "access_paused"
  | "access_revoked";

export type PortalRoadmapState =
  | "roadmap_not_published"
  | "roadmap_published";

export type PortalDocumentType =
  | "roadmap_preview"
  | "roadmap_pdf"
  | "approved_file"
  | "delivery_note";

export type PortalWorkspace = {
  client_name: string | null;
  company_name: string | null;
  workspace_state: PortalWorkspaceState;
  roadmap_state: PortalRoadmapState;
  portal_access_granted_at: string | null;
  workspace_ready_at: string | null;
  roadmap_published_at: string | null;
};

export type PortalDocument = {
  id: string;
  title: string;
  body_md: string | null;
  file_url: string | null;
  published_at: string | null;
  document_type: PortalDocumentType;
};

export type PortalExperience = {
  workspaceTitle: string;
  workspaceDetail: string;
  displayName: string;
  companyLabel: string | null;
  roadmapLocked: boolean;
  filesLocked: boolean;
  roadmapDocs: PortalDocument[];
  fileDocs: PortalDocument[];
};

function fallbackName(email: string): string {
  const local = email.split("@")[0] ?? "Client";
  if (!local) return "Client";
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

export function derivePortalExperience(args: {
  email: string;
  workspace: PortalWorkspace | null;
  docs: PortalDocument[];
}): PortalExperience {
  const workspace =
    args.workspace ??
    ({
      client_name: null,
      company_name: null,
      workspace_state: "workspace_provisioning",
      roadmap_state: "roadmap_not_published",
      portal_access_granted_at: null,
      workspace_ready_at: null,
      roadmap_published_at: null,
    } satisfies PortalWorkspace);

  const roadmapDocs = args.docs.filter((doc) =>
    ["roadmap_preview", "roadmap_pdf", "delivery_note"].includes(doc.document_type),
  );
  const fileDocs = args.docs.filter((doc) => doc.document_type === "approved_file");

  const workspaceTitleByState: Record<PortalWorkspaceState, string> = {
    payment_confirmed: "Payment confirmed",
    portal_access_granted: "Portal access granted",
    workspace_provisioning: "Workspace is being prepared",
    workspace_ready: "Workspace is ready",
    engagement_active: "Engagement is active",
    engagement_completed: "Engagement completed",
    access_paused: "Access is paused",
    access_revoked: "Access is revoked",
  };

  const workspaceDetailByState: Record<PortalWorkspaceState, string> = {
    payment_confirmed:
      "Payment is confirmed. Tai is preparing the workspace and delivery flow.",
    portal_access_granted:
      "Your portal is open. Tai is still preparing the workspace behind it.",
    workspace_provisioning:
      "We are setting up your client workspace. Messages are available while roadmap and files stay locked.",
    workspace_ready:
      "Your workspace is ready. Roadmap and files appear as Tai publishes approved items.",
    engagement_active:
      "Your roadmap is active and the engagement is underway.",
    engagement_completed:
      "The engagement is complete. Your approved records remain here for reference.",
    access_paused:
      "Portal access is temporarily paused. Contact Tai if you need the workspace reopened.",
    access_revoked:
      "Portal access is no longer active.",
  };

  const roadmapLocked =
    workspace.workspace_state === "payment_confirmed" ||
    workspace.workspace_state === "portal_access_granted" ||
    workspace.workspace_state === "workspace_provisioning" ||
    workspace.workspace_state === "access_paused" ||
    workspace.workspace_state === "access_revoked" ||
    workspace.roadmap_state !== "roadmap_published";

  const filesLocked =
    workspace.workspace_state === "payment_confirmed" ||
    workspace.workspace_state === "portal_access_granted" ||
    workspace.workspace_state === "workspace_provisioning" ||
    workspace.workspace_state === "access_paused" ||
    workspace.workspace_state === "access_revoked";

  return {
    workspaceTitle: workspaceTitleByState[workspace.workspace_state],
    workspaceDetail: workspaceDetailByState[workspace.workspace_state],
    displayName: workspace.client_name?.trim() || fallbackName(args.email),
    companyLabel: workspace.company_name?.trim() || null,
    roadmapLocked,
    filesLocked,
    roadmapDocs,
    fileDocs,
  };
}

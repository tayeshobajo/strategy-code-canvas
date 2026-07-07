import { describe, expect, it } from "vitest";
import { derivePortalExperience } from "./portal-state";

describe("derivePortalExperience", () => {
  it("locks roadmap and files while the workspace is provisioning", () => {
    const experience = derivePortalExperience({
      email: "jane@example.com",
      workspace: {
        client_name: "Jane",
        company_name: "Northstar",
        workspace_state: "workspace_provisioning",
        roadmap_state: "roadmap_not_published",
        portal_access_granted_at: null,
        workspace_ready_at: null,
        roadmap_published_at: null,
      },
      docs: [],
    });

    expect(experience.workspaceTitle).toBe("Workspace is being prepared");
    expect(experience.roadmapLocked).toBe(true);
    expect(experience.filesLocked).toBe(true);
    expect(experience.displayName).toBe("Jane");
    expect(experience.companyLabel).toBe("Northstar");
  });

  it("shows only published roadmap and approved file buckets once ready", () => {
    const experience = derivePortalExperience({
      email: "avery@example.com",
      workspace: {
        client_name: null,
        company_name: null,
        workspace_state: "workspace_ready",
        roadmap_state: "roadmap_published",
        portal_access_granted_at: null,
        workspace_ready_at: "2026-07-02T00:00:00.000Z",
        roadmap_published_at: "2026-07-02T00:00:00.000Z",
      },
      docs: [
        {
          id: "1",
          title: "Roadmap Preview",
          body_md: "Approved roadmap body",
          file_url: null,
          published_at: "2026-07-02T00:00:00.000Z",
          document_type: "roadmap_preview",
        },
        {
          id: "2",
          title: "Implementation Packet",
          body_md: null,
          file_url: "https://example.com/file.pdf",
          published_at: "2026-07-02T00:00:00.000Z",
          document_type: "approved_file",
        },
      ],
    });

    expect(experience.roadmapLocked).toBe(false);
    expect(experience.filesLocked).toBe(false);
    expect(experience.roadmapDocs).toHaveLength(1);
    expect(experience.fileDocs).toHaveLength(1);
    expect(experience.displayName).toBe("Avery");
  });
});

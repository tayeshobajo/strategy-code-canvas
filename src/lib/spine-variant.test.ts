import { describe, expect, it } from "vitest";
import {
  composeSpineView,
  deriveSpineVariant,
  sectionsForVariant,
  type SpineViewInputs,
} from "./spine-variant";

const noPub = null;

describe("deriveSpineVariant", () => {
  it("incomplete when Point A not approved", () => {
    expect(deriveSpineVariant(false, true, [], noPub)).toBe("incomplete");
  });
  it("incomplete when Point B not approved", () => {
    expect(deriveSpineVariant(true, false, [], noPub)).toBe("incomplete");
  });
  it("active when both approved and no milestones", () => {
    expect(deriveSpineVariant(true, true, [], noPub)).toBe("active");
  });
  it("active when both approved but a milestone is not approved", () => {
    expect(
      deriveSpineVariant(
        true,
        true,
        [{ approval_status: "approved" }, { approval_status: "pending" }],
        noPub,
      ),
    ).toBe("active");
  });
  it("client_ready when all milestones approved", () => {
    expect(
      deriveSpineVariant(
        true,
        true,
        [{ approval_status: "approved" }, { approval_status: "approved" }],
        noPub,
      ),
    ).toBe("client_ready");
  });
  it.each(["published", "ready_to_publish", "acknowledged"])(
    "client_ready when portal publish is %s (even with unapproved milestone)",
    (status) => {
      expect(
        deriveSpineVariant(
          true,
          true,
          [{ approval_status: "pending" }],
          { status },
        ),
      ).toBe("client_ready");
    },
  );
  it("stays active for other publish statuses", () => {
    expect(
      deriveSpineVariant(
        true,
        true,
        [{ approval_status: "pending" }],
        { status: "draft" },
      ),
    ).toBe("active");
  });
});

describe("sectionsForVariant", () => {
  it("incomplete has focus, truth, contradictions, notifications", () => {
    const s = sectionsForVariant("incomplete");
    expect(s).toContain("incomplete_focus");
    expect(s).toContain("truth");
    expect(s).toContain("incomplete_contradictions");
    expect(s).toContain("notifications");
    expect(s).not.toContain("milestone_readiness");
  });
  it("client_ready has publish + approved-milestones sections", () => {
    const s = sectionsForVariant("client_ready");
    expect(s).toContain("client_ready_publish");
    expect(s).toContain("client_ready_approved_milestones");
    expect(s).not.toContain("hero");
  });
  it("active has the full operating layout", () => {
    const s = sectionsForVariant("active");
    for (const k of [
      "hero",
      "snapshot",
      "milestone_readiness",
      "approvals_inline",
      "foundation",
      "captain_brief",
      "footer_stats",
      "working_focus",
      "approval_history",
      "modules_expandable",
      "evidence_history",
    ]) {
      expect(s).toContain(k);
    }
  });
  it("every variant starts with header + variant_banner", () => {
    for (const v of ["incomplete", "active", "client_ready"] as const) {
      const s = sectionsForVariant(v);
      expect(s[0]).toBe("header");
      expect(s[1]).toBe("variant_banner");
    }
  });
});

const baseInputs: SpineViewInputs = {
  pointAApproved: true,
  pointBApproved: true,
  milestones: [],
  portal_publish: null,
  reviews: [],
  activity: [],
  sources: { total: 0 },
};

describe("composeSpineView", () => {
  it("active default with zero counts and safe source total", () => {
    const view = composeSpineView(baseInputs);
    expect(view.variant).toBe("active");
    expect(view.counts).toEqual({
      pending_approvals: 0,
      approved_milestones: 0,
      total_milestones: 0,
      blocked_items: 0,
      source_total_safe: 1,
    });
    expect(view.next_milestone).toBeNull();
    expect(view.missing_for_client_ready).toEqual([
      // no milestones → "some not approved" is false (length 0), no publish → missing
      "portal publish check",
    ]);
  });

  it("counts pending approvals from reviews and blocked from milestones + critical activity", () => {
    const view = composeSpineView({
      ...baseInputs,
      reviews: [{}, {}, {}],
      milestones: [
        { id: "1", name: "A", approval_status: "approved", status: "blocked", due_date: null },
        { id: "2", name: "B", approval_status: "rejected", status: "draft", due_date: null },
        { id: "3", name: "C", approval_status: "approved", status: "active", due_date: null },
      ],
      activity: [
        { severity: "critical" },
        { severity: "info" },
        { severity: "critical" },
      ],
      sources: { total: 4 },
    });
    expect(view.counts.pending_approvals).toBe(3);
    expect(view.counts.approved_milestones).toBe(2);
    expect(view.counts.total_milestones).toBe(3);
    // 2 milestones flagged blocked/rejected + 2 critical activity = 4
    expect(view.counts.blocked_items).toBe(4);
    expect(view.counts.source_total_safe).toBe(4);
  });

  it("picks earliest due-dated milestone as next_milestone", () => {
    const view = composeSpineView({
      ...baseInputs,
      milestones: [
        { id: "a", name: "Later", approval_status: "approved", status: "active", due_date: "2026-12-01" },
        { id: "b", name: "Sooner", approval_status: "approved", status: "active", due_date: "2026-08-15" },
        { id: "c", name: "Undated", approval_status: "approved", status: "active", due_date: null },
      ],
    });
    expect(view.next_milestone).toEqual({
      id: "b",
      name: "Sooner",
      due_date: "2026-08-15",
    });
  });

  it("incomplete variant when Point A not approved", () => {
    const view = composeSpineView({ ...baseInputs, pointAApproved: false });
    expect(view.variant).toBe("incomplete");
    // missing_for_client_ready only populated for active
    expect(view.missing_for_client_ready).toEqual([]);
    expect(view.sections).toEqual(sectionsForVariant("incomplete"));
  });

  it("client_ready when portal published even with an unapproved milestone", () => {
    const view = composeSpineView({
      ...baseInputs,
      milestones: [
        { id: "1", name: "A", approval_status: "pending", status: "active", due_date: null },
      ],
      portal_publish: { status: "published" },
    });
    expect(view.variant).toBe("client_ready");
    expect(view.missing_for_client_ready).toEqual([]);
    expect(view.sections).toEqual(sectionsForVariant("client_ready"));
  });

  it("active with all milestones approved and no publish → missing publish only", () => {
    const view = composeSpineView({
      ...baseInputs,
      milestones: [
        { id: "1", name: "A", approval_status: "approved", status: "active", due_date: null },
      ],
      portal_publish: null,
    });
    // all milestones approved flips to client_ready
    expect(view.variant).toBe("client_ready");
    expect(view.missing_for_client_ready).toEqual([]);
  });

  it("active variant surfaces both promotion gaps when neither is satisfied", () => {
    const view = composeSpineView({
      ...baseInputs,
      milestones: [
        { id: "1", name: "A", approval_status: "pending", status: "active", due_date: null },
      ],
      portal_publish: null,
    });
    expect(view.variant).toBe("active");
    expect(view.missing_for_client_ready).toEqual([
      "all milestones approved",
      "portal publish check",
    ]);
  });
});

import { describe, expect, it } from "vitest";
import {
  ROADMAP_REVIEW_ARTIFACT_ANSWER_KEY,
  buildRoadmapReviewArtifact,
  buildRoadmapReviewArtifactAnswer,
} from "./roadmap-review";

describe("buildRoadmapReviewArtifact", () => {
  it("creates a review-gated draft/gap artifact from intake answers", () => {
    const artifact = buildRoadmapReviewArtifact({
      generatedAt: "2026-06-30T12:00:00.000Z",
      contact: {
        name: "Avery",
        business: "Northstar Co",
        website: "https://northstar.example",
        email: "avery@example.com",
        timeline: "This quarter",
        decision_makers: "Founder and COO",
        reply_preference: "email",
      },
      answers: [
        {
          key: "current_state",
          question: "What is the business today?",
          response: "We have demand but delivery still depends on the founder.",
          reflected_offered: null,
        },
        {
          key: "the_weight",
          question: "What feels heavier than it should?",
          response: "Every project needs founder review before it can move.",
          reflected_offered: "Every project still waits on founder judgment before it can move.",
        },
        {
          key: "point_b",
          question: "Where do you need the business to be in 24 months?",
          response: "A leadership team can run delivery without bottlenecking on me.",
          reflected_offered: null,
        },
        {
          key: "practical",
          question: "What would need to change first?",
          response: "We need a clearer operating system.",
          reflected_offered: null,
        },
      ],
    });

    expect(artifact.version).toBe("roadmap-intake-review-v1");
    expect(artifact.summary.answer_count).toBe(4);
    expect(artifact.draft.point_a).toContain("delivery still depends");
    expect(artifact.draft.gap_hypothesis).toContain("leadership team");
    expect(artifact.gap_analysis.current_weight).toContain("founder judgment");
    expect(artifact.gap_analysis.missing_context).toContain("possible unbuilt asset");
    expect(artifact.review_gate).toMatchObject({
      state: "needs_human_review",
      approval_required: true,
      outbound_blocked: true,
    });
  });

  it("serializes the review artifact as an internal intake answer", () => {
    const artifact = buildRoadmapReviewArtifact({
      generatedAt: "2026-06-30T12:00:00.000Z",
      contact: {
        name: "Avery",
        business: "Northstar Co",
        email: "avery@example.com",
      },
      answers: [
        {
          key: "current_state",
          question: "What is the business today?",
          response: "The business runs, but everything still routes through me.",
          reflected_offered: null,
        },
      ],
    });

    const answer = buildRoadmapReviewArtifactAnswer(artifact);

    expect(answer.key).toBe(ROADMAP_REVIEW_ARTIFACT_ANSWER_KEY);
    expect(answer.question).toBe("Internal roadmap review artifact");
    expect(JSON.parse(answer.response)).toMatchObject({
      version: "roadmap-intake-review-v1",
      review_gate: {
        approval_required: true,
        outbound_blocked: true,
      },
    });
  });
});

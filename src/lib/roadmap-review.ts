export type ReviewIntakeAnswer = {
  key: string;
  question: string;
  response: string;
  reflected_offered?: string | null;
};

export type ReviewIntakeContact = {
  name: string;
  business?: string;
  website?: string;
  email: string;
  role?: string;
  timeline?: string;
  decision_makers?: string;
  reply_preference?: string;
};

export type RoadmapReviewArtifact = {
  version: "roadmap-intake-review-v1";
  source: "website/build-my-roadmap";
  generated_at: string;
  summary: {
    founder_name: string;
    business: string | null;
    website: string | null;
    reply_preference: string | null;
    timeline: string | null;
    decision_makers: string | null;
    answer_count: number;
  };
  draft: {
    point_a: string;
    point_b: string;
    point_c: string;
    unbuilt_asset: string;
    gap_hypothesis: string;
    first_move: string;
  };
  gap_analysis: {
    current_weight: string;
    why_now: string;
    attempted_fixes: string;
    missing_context: string[];
    review_questions: string[];
  };
  review_gate: {
    state: "needs_human_review";
    approval_required: true;
    outbound_blocked: true;
    allowed_next_actions: string[];
  };
};

export const ROADMAP_REVIEW_ARTIFACT_ANSWER_KEY = "_roadmap_review_artifact";

type BuildReviewArtifactInput = {
  contact: ReviewIntakeContact;
  answers: ReviewIntakeAnswer[];
  generatedAt?: string;
};

const NOT_ANSWERED = "Not answered yet. Needs human review.";

function clean(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function nullableClean(value: string | null | undefined): string | null {
  const cleaned = clean(value);
  return cleaned.length > 0 ? cleaned : null;
}

function answerMap(answers: ReviewIntakeAnswer[]): Map<string, ReviewIntakeAnswer> {
  return new Map(answers.map((answer) => [answer.key, answer]));
}

function answerText(
  answersByKey: Map<string, ReviewIntakeAnswer>,
  key: string,
  fallback = NOT_ANSWERED,
): string {
  const answer = answersByKey.get(key);
  const reflected = clean(answer?.reflected_offered);
  const response = clean(answer?.response);
  return reflected || response || fallback;
}

function missingContext(answersByKey: Map<string, ReviewIntakeAnswer>): string[] {
  const missing: string[] = [];
  const required = [
    ["current_state", "current business state"],
    ["the_weight", "recurring weight or bottleneck"],
    ["point_b", "24-month target state"],
    ["practical", "suspected first move"],
  ] as const;

  for (const [key, label] of required) {
    if (!clean(answersByKey.get(key)?.response)) missing.push(label);
  }

  if (!clean(answersByKey.get("unbuilt_asset")?.response)) {
    missing.push("possible unbuilt asset");
  }

  if (!clean(answersByKey.get("point_c")?.response)) {
    missing.push("decade-scale Point C");
  }

  return missing;
}

export function buildRoadmapReviewArtifact({
  contact,
  answers,
  generatedAt = new Date().toISOString(),
}: BuildReviewArtifactInput): RoadmapReviewArtifact {
  const answersByKey = answerMap(answers);
  const weight = answerText(answersByKey, "the_weight");
  const pointB = answerText(answersByKey, "point_b");
  const firstMove = answerText(answersByKey, "practical");
  const missing = missingContext(answersByKey);

  const gapHypothesis =
    pointB === NOT_ANSWERED || weight === NOT_ANSWERED
      ? NOT_ANSWERED
      : `The likely gap is between the business state described in the intake and the 24-month reality the founder wants: ${pointB}. The recurring weight to pressure-test first is: ${weight}`;

  return {
    version: "roadmap-intake-review-v1",
    source: "website/build-my-roadmap",
    generated_at: generatedAt,
    summary: {
      founder_name: clean(contact.name),
      business: nullableClean(contact.business),
      website: nullableClean(contact.website),
      reply_preference: nullableClean(contact.reply_preference),
      timeline: nullableClean(contact.timeline),
      decision_makers: nullableClean(contact.decision_makers),
      answer_count: answers.filter((answer) => clean(answer.response).length > 0).length,
    },
    draft: {
      point_a: answerText(answersByKey, "current_state"),
      point_b: pointB,
      point_c: answerText(answersByKey, "point_c"),
      unbuilt_asset: answerText(answersByKey, "unbuilt_asset"),
      gap_hypothesis: gapHypothesis,
      first_move: firstMove,
    },
    gap_analysis: {
      current_weight: weight,
      why_now: answerText(answersByKey, "why_now"),
      attempted_fixes: answerText(answersByKey, "what_didnt_hold"),
      missing_context: missing,
      review_questions: [
        "What is the real Point A once we compare the intake against the business's public surface?",
        "Is the suspected first move actually foundational, or is there a quieter dependency underneath it?",
        "What must be true before Tai/Captain can approve a reply, booking link, or paid roadmap next step?",
      ],
    },
    review_gate: {
      state: "needs_human_review",
      approval_required: true,
      outbound_blocked: true,
      allowed_next_actions: [
        "review intake",
        "enrich draft/gap analysis",
        "approve reply",
        "approve booking link",
        "approve paid roadmap next step",
      ],
    },
  };
}

export function buildRoadmapReviewArtifactAnswer(
  artifact: RoadmapReviewArtifact,
): ReviewIntakeAnswer {
  return {
    key: ROADMAP_REVIEW_ARTIFACT_ANSWER_KEY,
    question: "Internal roadmap review artifact",
    response: JSON.stringify(artifact),
    reflected_offered: null,
  };
}

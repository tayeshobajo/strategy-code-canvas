/**
 * The adaptive intake — anchor-question library.
 *
 * Client-safe. No server calls, no secrets. The route file imports this to
 * pick the next unmet objective for the active frame and render its anchor
 * question when a generative version is not (yet) available.
 *
 * Voice law: sentence case, no em-dashes, no exclamation points, no banned
 * words (just, very, really, simply, solutions), no vendor verbs (help,
 * deliver, provide, offer), no hype adjectives. Every string below is a
 * client-facing surface.
 */

export type IntakeFrame =
  | "roadmap"
  | "project.event_site"
  | "project.internal_tool"
  | "project.client_portal"
  | "project.redesign"
  | "project.automation"
  | "project.lms"
  | "project.crm"
  | "project.ecommerce"
  | "project.ai_assistant"
  | "project.content_engine"
  | "project.generic"
  | "not_a_fit";

export type IntakeObjective = {
  /** Stable key stored in answers[].key. */
  key: string;
  /** Anchor question. Falls back to this whenever generation is unavailable. */
  anchor: string;
  /** Short label shown on the review screen and the objective progress. */
  label: string;
  /** If true, missing this objective blocks moving to review. */
  required: boolean;
};

export type FrameDefinition = {
  frame: IntakeFrame;
  /** Human label used in the "sounds like…" confirmation line. */
  label: string;
  /** Short confirmation phrase, no leading capital. */
  confirmSuffix: string;
  /** Anchor questions in a sensible default order. */
  objectives: IntakeObjective[];
  /** Optional invitation shown at the top of the first question. */
  opener?: string;
};

/* ---------- Roadmap frame ---------- */

const roadmap: FrameDefinition = {
  frame: "roadmap",
  label: "a full roadmap",
  confirmSuffix: "you are asking us to map the road from where you are to where you want the business to be",
  objectives: [
    {
      key: "point_a",
      label: "point A, the current state",
      anchor: "In your own words, where is the business right now.",
      required: true,
    },
    {
      key: "weight",
      label: "the weight you carry",
      anchor: "What runs through you as the founder that should not.",
      required: true,
    },
    {
      key: "point_b",
      label: "point B, the 24-month reality",
      anchor: "If we sit here in 24 months and the business is in the right place, what is true.",
      required: true,
    },
    {
      key: "unbuilt_asset",
      label: "the unbuilt asset",
      anchor: "What does the business already own or have that it has not built on yet.",
      required: true,
    },
    {
      key: "point_c",
      label: "point C, the decade position",
      anchor: "If it could not fail, what would you build over the next ten years.",
      required: false,
    },
    {
      key: "practical",
      label: "who decides and the timeline",
      anchor: "Who else decides with you, and what timeline are you working against.",
      required: false,
    },
  ],
};

/* ---------- Project frames ---------- */

const projectBase: IntakeObjective[] = [
  { key: "goal", label: "the goal", anchor: "What does a win look like for this build.", required: true },
  { key: "deadline", label: "the deadline", anchor: "When does it need to be live, and what makes that date the date.", required: true },
  { key: "audience", label: "the audience", anchor: "Who is this for, and what do they need from it.", required: true },
  { key: "features", label: "the required features", anchor: "What must it do. List the pieces that matter most.", required: true },
  { key: "assets", label: "the existing assets", anchor: "What do you already have. Copy, photos, brand, data, systems.", required: true },
  { key: "constraints", label: "the constraints", anchor: "What are the limits we should know about. Privacy, budget signals, technical.", required: false },
];

const project = (
  frame: IntakeFrame,
  label: string,
  confirmSuffix: string,
  extras: IntakeObjective[] = [],
): FrameDefinition => ({
  frame,
  label,
  confirmSuffix,
  objectives: [...projectBase, ...extras],
});

const eventSite = project(
  "project.event_site",
  "a scoped event site",
  "you are planning an event site",
  [
    { key: "event_date", label: "the event date", anchor: "What is the event date.", required: true },
    { key: "privacy", label: "the privacy level", anchor: "Should the site be public, private, or password protected.", required: true },
    { key: "rsvp_fields", label: "the RSVP fields", anchor: "What should a guest submit when they RSVP.", required: true },
    { key: "guest_count", label: "the guest count", anchor: "Roughly how many guests will you invite.", required: true },
    { key: "extras", label: "extras", anchor: "What else belongs on the site. Registry, dress code, schedule, directions.", required: false },
  ],
);

const internalTool = project(
  "project.internal_tool",
  "a scoped internal tool",
  "you are building an internal tool",
  [
    { key: "users", label: "who uses it", anchor: "Who inside the business uses this tool.", required: true },
    { key: "task", label: "the task it eases", anchor: "What single task should this tool make easier.", required: true },
    { key: "today", label: "what happens without it", anchor: "How does this get done today, and what breaks.", required: false },
    { key: "data", label: "the data it touches", anchor: "What data does it read from or write to.", required: false },
  ],
);

const clientPortal = project(
  "project.client_portal",
  "a scoped client portal",
  "you are building a client portal",
  [
    { key: "who_logs_in", label: "who logs in", anchor: "Who is meant to log in to the portal.", required: true },
    { key: "portal_actions", label: "what they see and do", anchor: "What do they see when they log in, and what can they do.", required: true },
    { key: "replaces", label: "what it replaces", anchor: "What does the portal replace or make cleaner.", required: false },
  ],
);

const redesign = project(
  "project.redesign",
  "a scoped redesign",
  "you are redesigning an existing site",
  [
    { key: "current_site", label: "the current site", anchor: "Share the current site URL and a few lines about it.", required: true },
    { key: "not_working", label: "what is not working", anchor: "What about the current site is not working for you.", required: true },
    { key: "brand_assets", label: "brand assets", anchor: "What brand assets do you already have. Logo, colors, typography.", required: false },
  ],
);

const automation = project(
  "project.automation",
  "a scoped automation",
  "you are automating a manual process",
  [
    { key: "manual_today", label: "the manual process today", anchor: "Walk me through the manual process as it runs today.", required: true },
    { key: "trigger", label: "the trigger", anchor: "What kicks off the process. A form, an email, a time, an event.", required: true },
    { key: "volume", label: "the volume", anchor: "How often does this run. Rough numbers are fine.", required: false },
    { key: "systems", label: "the systems to connect", anchor: "Which systems does the automation need to touch.", required: false },
  ],
);

const lms = project(
  "project.lms",
  "a scoped learning system",
  "you are building a learning system",
  [
    { key: "learners", label: "the learners", anchor: "Who are the learners. Adults, students, staff, a mix.", required: true },
    { key: "structure", label: "the course structure", anchor: "How is the material shaped. Cohorts, self-paced, single course, a library.", required: true },
    { key: "assessment", label: "progress and assessment", anchor: "How do you know a learner has understood.", required: false },
  ],
);

const crm = project(
  "project.crm",
  "a scoped CRM or lead system",
  "you are building a CRM or lead system",
  [
    { key: "pipeline_today", label: "the pipeline today", anchor: "What does the pipeline look like today, from first touch to close.", required: true },
    { key: "sources", label: "the sources", anchor: "Where do leads come from.", required: true },
    { key: "follow_up_gap", label: "the follow-up gap", anchor: "Where do leads currently fall through the cracks.", required: false },
  ],
);

const ecommerce = project(
  "project.ecommerce",
  "a scoped ecommerce build",
  "you are building an ecommerce store",
  [
    { key: "products", label: "the products", anchor: "What are you selling. Physical, digital, subscriptions, a mix.", required: true },
    { key: "volume", label: "the volume", anchor: "Rough monthly order volume today and in twelve months.", required: false },
    { key: "fulfillment", label: "fulfillment", anchor: "How do orders get to customers.", required: false },
    { key: "payment", label: "payment", anchor: "Which payment processors are you already using.", required: false },
  ],
);

const aiAssistant = project(
  "project.ai_assistant",
  "a scoped AI assistant",
  "you are building an AI assistant",
  [
    { key: "task", label: "the task", anchor: "What single task should the assistant do well.", required: true },
    { key: "audience", label: "the audience", anchor: "Who talks to it. Customers, staff, both.", required: true },
    { key: "data_source", label: "the data source", anchor: "What does it read from. Docs, database, live systems.", required: false },
    { key: "boundary", label: "the boundary", anchor: "What must it never do or answer.", required: true },
  ],
);

const contentEngine = project(
  "project.content_engine",
  "a scoped content engine",
  "you are building a content engine",
  [
    { key: "authority_goal", label: "the authority goal", anchor: "What position in your market should the content build.", required: true },
    { key: "cadence", label: "the cadence", anchor: "How often can you realistically publish.", required: true },
    { key: "assets", label: "the assets", anchor: "What content do you already have that we can build on.", required: false },
  ],
);

const genericProject = project(
  "project.generic",
  "a scoped project",
  "this is a scoped project",
);

/* ---------- Not a fit ---------- */

const notAFit: FrameDefinition = {
  frame: "not_a_fit",
  label: "outside our lane",
  confirmSuffix: "this may sit outside what we do best",
  objectives: [],
};

/* ---------- Registry ---------- */

export const FRAME_DEFINITIONS: Record<IntakeFrame, FrameDefinition> = {
  roadmap,
  "project.event_site": eventSite,
  "project.internal_tool": internalTool,
  "project.client_portal": clientPortal,
  "project.redesign": redesign,
  "project.automation": automation,
  "project.lms": lms,
  "project.crm": crm,
  "project.ecommerce": ecommerce,
  "project.ai_assistant": aiAssistant,
  "project.content_engine": contentEngine,
  "project.generic": genericProject,
  not_a_fit: notAFit,
};

export function getFrame(frame: IntakeFrame): FrameDefinition {
  return FRAME_DEFINITIONS[frame];
}

/** Hard cap on questions in any adaptive path. Spec §5. */
export const HARD_CAP_QUESTIONS = 10;

/**
 * Simple keyword classifier used as a safety net when the LLM classifier is
 * unavailable. Deliberately conservative — falls to `project.generic` rather
 * than misroute someone into a specific sub-type.
 */
export function heuristicClassify(openAnswer: string): IntakeFrame {
  const text = openAnswer.toLowerCase();
  const has = (re: RegExp) => re.test(text);

  if (has(/\b(wedding|birthday|gala|fundrais|event site|rsvp|guest list)\b/)) return "project.event_site";
  if (has(/\b(client portal|dashboard for clients|logins? for clients)\b/)) return "project.client_portal";
  if (has(/\b(internal tool|staff tool|admin panel|back ?office)\b/)) return "project.internal_tool";
  if (has(/\b(redesign|refresh(ed)? site|new website for)\b/)) return "project.redesign";
  if (has(/\b(automat(e|ion)|zapier|make\.com|n8n|workflow)\b/)) return "project.automation";
  if (has(/\b(course|cohort|lms|learning|students|curricul)\b/)) return "project.lms";
  if (has(/\b(crm|pipeline|leads?|sales team)\b/)) return "project.crm";
  if (has(/\b(shop|store|ecommerce|e-commerce|checkout|products?)\b/)) return "project.ecommerce";
  if (has(/\b(chatbot|ai assistant|copilot|agent that)\b/)) return "project.ai_assistant";
  if (has(/\b(content engine|newsletter|blog cadence|thought leadership)\b/)) return "project.content_engine";

  // Roadmap signals: full-business, growth, positioning, strategy language.
  if (has(/\b(roadmap|strategy|position|grow(th)?|scale|next 12|next 24|founder|business is|company is)\b/)) {
    return "roadmap";
  }

  // Cheap-fast-only signals → not a fit.
  if (has(/\b(cheapest|as cheap as|quick and dirty|just need it fast|no plan needed)\b/)) {
    return "not_a_fit";
  }

  return "project.generic";
}

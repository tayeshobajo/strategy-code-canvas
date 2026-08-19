/**
 * The conversational spine for trusttai.com's Build My Roadmap.
 *
 * Open questions in plain language. No jargon, no forms, no scoring language
 * shown to the person answering. Each question maps to one objective so the
 * conversation can skip anything the person already covered in their own
 * words, and carries a short human bridge so topic changes don't feel
 * mechanical.
 *
 * Client-safe: pure data plus pure helpers. No secrets, no server calls.
 */

export type IntakeObjectiveKey =
  | "who_you_are"
  | "the_business"
  | "future_day"
  | "future_you"
  | "future_customer"
  | "future_team"
  | "whats_working"
  | "recurring_problem"
  | "cost_of_standing_still"
  | "already_tried"
  | "whats_in_the_way"
  | "existing_assets"
  | "unacted_idea"
  | "ninety_day_wish"
  | "how_youd_know"
  | "anything_missed";

export type IntakeQuestion = {
  /** Stable key stored with every answer. */
  key: IntakeObjectiveKey;
  /** The question as it is spoken to the person. */
  prompt: string;
  /**
   * A short human bridge shown above the question when the topic changes.
   * Never praise, never filler.
   */
  transition?: string;
  /** Short label used in the review list. */
  label: string;
  /**
   * Ground this question must not leave unexplored. Essentials are always
   * asked unless the person's own words already covered them.
   */
  essential: boolean;
  /** Words that, when they show up elsewhere, suggest this ground is covered. */
  signals: string[];
  /** Which bucket of the structured understanding this answer feeds. */
  bucket:
    | "current_state"
    | "desired_future"
    | "pains"
    | "goals"
    | "constraints"
    | "existing_assets"
    | "ideas"
    | "open_questions";
};

export const INTAKE_QUESTIONS: IntakeQuestion[] = [
  {
    key: "who_you_are",
    prompt: "Who are you, and what do you do?",
    label: "Who you are",
    essential: false,
    signals: ["i run", "i own", "founder", "i started", "my role", "managing director", "i took over"],
    bucket: "current_state",
  },
  {
    key: "the_business",
    prompt:
      "Tell me about the business the way you'd tell a friend at dinner. What is it, and who's it for?",
    label: "The business",
    essential: true,
    signals: ["we sell", "our customers", "clients", "we make", "we serve", "we supply", "we do"],
    bucket: "current_state",
  },
  {
    key: "future_day",
    prompt:
      "Imagine the business two years from now and it's working exactly the way you hoped. Walk me through an ordinary Tuesday. What's happening?",
    transition: "That gives me a good picture of today. Let me ask about where you want this to go.",
    label: "Two years from now",
    essential: true,
    signals: ["two years", "in the future", "ideally", "one day", "i'd want", "i would want"],
    bucket: "desired_future",
  },
  {
    key: "future_you",
    prompt:
      "In that version, what are you spending your time on, and what are you finally not doing anymore?",
    label: "What it feels like to be you",
    essential: false,
    signals: ["my time", "step back", "not doing", "off my plate", "spending my time", "instead of"],
    bucket: "desired_future",
  },
  {
    key: "future_customer",
    prompt:
      "What does it feel like to be your customer in that version? What do they say about you when you're not in the room?",
    label: "The customer's experience",
    essential: false,
    signals: ["customers say", "they tell", "reviews", "word of mouth", "they'd say", "recommend"],
    bucket: "desired_future",
  },
  {
    key: "future_team",
    prompt: "And your team, if you have one, what's different about how they work?",
    label: "The team",
    essential: false,
    signals: ["my team", "the team", "staff", "employees", "we hired", "contractors", "apprentice", "no team"],
    bucket: "desired_future",
  },
  {
    key: "whats_working",
    prompt:
      "Come back to today. What's actually working well right now, the parts you'd never want to lose?",
    transition: "Let me come back to today for a moment.",
    label: "What's working",
    essential: false,
    signals: ["works well", "going well", "proud of", "strength", "never had to", "keep coming back", "retention"],
    bucket: "current_state",
  },
  {
    key: "recurring_problem",
    prompt: "What's the thing that keeps landing back on your desk no matter how many times you handle it?",
    label: "The recurring problem",
    essential: true,
    signals: [
      "keeps happening",
      "again and again",
      "every week",
      "over and over",
      "comes back to me",
      "bottleneck",
      "all in my head",
    ],
    bucket: "pains",
  },
  {
    key: "cost_of_standing_still",
    prompt: "If nothing changed for the next twelve months, what would that mean for you or the business?",
    label: "Cost of standing still",
    essential: false,
    signals: ["burn out", "burnout", "lose", "stuck", "plateau", "can't grow", "sell up", "shelve it"],
    bucket: "pains",
  },
  {
    key: "already_tried",
    prompt: "What have you already tried? What happened?",
    label: "What you've tried",
    essential: false,
    signals: ["we tried", "i tried", "we hired", "didn't work", "agency", "consultant", "freelancer"],
    bucket: "current_state",
  },
  {
    key: "whats_in_the_way",
    prompt: "What's getting in the way right now? Time, money, people, clarity, something else?",
    label: "What's in the way",
    essential: true,
    signals: ["no time", "budget", "money is tight", "people", "not sure", "clarity", "capacity"],
    bucket: "constraints",
  },
  {
    key: "existing_assets",
    prompt: "What have you already built or collected that might be more valuable than you're treating it?",
    label: "What you already have",
    essential: false,
    signals: [
      "email list",
      "waiting list",
      "audience",
      "database",
      "content",
      "we built",
      "we have",
      "order history",
      "back catalogue",
      "past customers",
    ],
    bucket: "existing_assets",
  },
  {
    key: "unacted_idea",
    prompt: "Is there an idea you keep coming back to but haven't acted on yet?",
    label: "The idea you keep returning to",
    essential: false,
    signals: ["i keep thinking", "keep thinking about", "always wanted", "someday", "never done it"],
    bucket: "ideas",
  },
  {
    key: "ninety_day_wish",
    prompt:
      "If one thing could be true ninety days from now that would make everything else easier, what would it be?",
    transition: "One more on the near term, then I'll show you what I've heard.",
    label: "Ninety days",
    essential: true,
    signals: ["ninety days", "three months", "if i could just"],
    bucket: "goals",
  },
  {
    key: "how_youd_know",
    prompt: "How would you know this worked? It doesn't have to be a number. What would be different?",
    label: "How you'd know",
    essential: false,
    signals: ["i'd know", "i could take", "success", "measure", "would be different", "stop working weekends"],
    bucket: "goals",
  },
  {
    key: "anything_missed",
    prompt: "Is there anything I didn't ask that you wish I had?",
    label: "Anything else",
    essential: false,
    signals: [],
    bucket: "open_questions",
  },
];

export const QUESTION_BY_KEY: Record<IntakeObjectiveKey, IntakeQuestion> =
  Object.fromEntries(INTAKE_QUESTIONS.map((q) => [q.key, q])) as Record<
    IntakeObjectiveKey,
    IntakeQuestion
  >;

export const ESSENTIAL_KEYS: IntakeObjectiveKey[] = INTAKE_QUESTIONS.filter((q) => q.essential).map(
  (q) => q.key,
);

/** Warm one-time follow-ups. Never more than one per trigger. */
export type FollowUpKey = "thin_dream" | "past_failure" | "hidden_asset";

export const FOLLOW_UPS: Record<FollowUpKey, string> = {
  thin_dream: "Stay with that for a second. What would an actual day look like?",
  past_failure: "What went wrong with that? I'd rather not repeat it.",
  hidden_asset: "What would become possible if you actually used that well?",
};

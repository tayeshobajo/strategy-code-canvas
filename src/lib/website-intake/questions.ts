/**
 * The conversational spine for trusttai.com's Build My Roadmap.
 *
 * This is an objective map, not a script. Each entry names one piece of
 * ground worth understanding, in the order a curious person would naturally
 * get there: the person, then the business as it actually runs today, then
 * where they want it to go, then what would make the work worthwhile.
 *
 * Rich answers satisfy several objectives at once. Anything already said in
 * the founder's own words is never asked again.
 *
 * Client-safe: pure data plus pure helpers. No secrets, no server calls.
 */

export type IntakeObjectiveKey =
  // Person
  | "who_you_are"
  | "what_brought_you"
  // Business identity
  | "the_business"
  | "who_you_serve"
  | "market_and_stage"
  // Team and operating model
  | "who_carries_the_work"
  | "your_own_day"
  | "how_work_arrives"
  | "how_work_gets_delivered"
  | "tools_and_systems"
  // Current reality
  | "whats_working"
  | "recurring_problem"
  | "cost_of_standing_still"
  | "already_tried"
  | "whats_in_the_way"
  | "existing_assets"
  | "unacted_idea"
  // Direction
  | "ninety_day_wish"
  | "future_day"
  | "future_you"
  | "future_customer"
  | "future_team"
  | "how_youd_know"
  // Success and decision context
  | "what_makes_it_worthwhile"
  | "dont_want_to_lose"
  | "anything_missed";

/** The four quiet phases the founder sees in the rail. */
export type IntakePhaseKey =
  | "getting_to_know_you"
  | "inside_the_business"
  | "where_you_want_to_go"
  | "putting_it_together";

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
  /** Which conversational phase this ground belongs to. */
  phase: IntakePhaseKey;
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
    prompt: "Before anything else, what should I call you, and what's your role in the business?",
    label: "Who you are",
    phase: "getting_to_know_you",
    essential: true,
    signals: ["i run", "i own", "founder", "i started", "my role", "managing director", "i took over", "my name is", "i'm the"],
    bucket: "current_state",
  },
  {
    key: "what_brought_you",
    prompt: "What made you come looking for this now, rather than six months ago?",
    label: "What brought you here",
    phase: "getting_to_know_you",
    essential: false,
    signals: ["i came here", "i've been meaning", "right now", "this year", "finally", "reached a point"],
    bucket: "current_state",
  },
  {
    key: "the_business",
    prompt:
      "Tell me about the business the way you'd tell a friend at dinner. What is it, and what's it called?",
    label: "The business",
    phase: "inside_the_business",
    essential: true,
    signals: ["we sell", "we make", "we serve", "we supply", "we do", "the business", "we're a", "we run"],
    bucket: "current_state",
  },
  {
    key: "who_you_serve",
    prompt: "Who buys from you, and what are they usually trying to solve when they come to you?",
    label: "Who you serve",
    phase: "inside_the_business",
    essential: true,
    signals: ["our customers", "our clients", "they come to us", "people who", "businesses who", "homeowners", "patients"],
    bucket: "current_state",
  },
  {
    key: "market_and_stage",
    prompt: "Where do you operate, and how long has the business been going?",
    label: "Market and stage",
    phase: "inside_the_business",
    essential: false,
    signals: ["years", "founded", "started in", "based in", "across the", "nationwide", "local", "we cover"],
    bucket: "current_state",
  },
  {
    key: "who_carries_the_work",
    prompt: "Who's carrying the work with you today?",
    transition: "Let me get a feel for how the business actually runs day to day.",
    label: "Who carries the work",
    phase: "inside_the_business",
    essential: true,
    signals: ["my team", "the team", "staff", "employees", "we hired", "contractors", "apprentice", "no team", "just me", "people"],
    bucket: "current_state",
  },
  {
    key: "your_own_day",
    prompt: "What does a normal Tuesday look like for you right now, start to finish?",
    label: "Your normal day",
    phase: "inside_the_business",
    essential: true,
    signals: ["my day", "i spend", "mornings", "most of my time", "typical day", "day to day", "i'm on site"],
    bucket: "current_state",
  },
  {
    key: "how_work_arrives",
    prompt: "How does new work usually find you?",
    label: "How work arrives",
    phase: "inside_the_business",
    essential: true,
    signals: ["referral", "word of mouth", "google", "leads", "enquiries", "inquiries", "repeat", "instagram", "recommendations"],
    bucket: "current_state",
  },
  {
    key: "how_work_gets_delivered",
    prompt: "Walk me through what happens after someone says yes. Where does it usually get messy?",
    label: "How work gets delivered",
    phase: "inside_the_business",
    essential: true,
    signals: ["onboarding", "process", "handover", "we book", "delivery", "install", "after they sign", "kick off"],
    bucket: "current_state",
  },
  {
    key: "tools_and_systems",
    prompt: "What are you running the business on right now? Anything from spreadsheets to proper software.",
    label: "Tools and systems",
    phase: "inside_the_business",
    essential: false,
    signals: ["spreadsheet", "excel", "xero", "quickbooks", "crm", "hubspot", "whatsapp", "notion", "airtable", "software", "paper"],
    bucket: "current_state",
  },
  {
    key: "whats_working",
    prompt: "What's genuinely working, the parts you'd never want to lose?",
    label: "What's working",
    phase: "inside_the_business",
    essential: false,
    signals: ["works well", "going well", "proud of", "strength", "keep coming back", "retention", "never had to"],
    bucket: "current_state",
  },
  {
    key: "recurring_problem",
    prompt: "What keeps landing back on your desk no matter how many times you handle it?",
    label: "The recurring problem",
    phase: "inside_the_business",
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
    key: "already_tried",
    prompt: "What have you already tried here, and what happened?",
    label: "What you've tried",
    phase: "inside_the_business",
    essential: false,
    signals: ["we tried", "i tried", "we hired", "didn't work", "agency", "consultant", "freelancer"],
    bucket: "current_state",
  },
  {
    key: "existing_assets",
    prompt: "What have you already built or collected that might be worth more than you're treating it?",
    label: "What you already have",
    phase: "inside_the_business",
    essential: true,
    signals: [
      "email list",
      "waiting list",
      "audience",
      "database",
      "content",
      "we built",
      "order history",
      "back catalogue",
      "past customers",
      "testimonials",
    ],
    bucket: "existing_assets",
  },
  {
    key: "whats_in_the_way",
    prompt: "What's actually in the way right now? Time, money, people, clarity, something else?",
    label: "What's in the way",
    phase: "inside_the_business",
    essential: true,
    signals: ["no time", "budget", "money is tight", "people", "not sure", "clarity", "capacity", "compliance", "seasonal"],
    bucket: "constraints",
  },
  {
    key: "cost_of_standing_still",
    prompt: "If nothing changed for the next twelve months, what would that mean for you?",
    label: "Cost of standing still",
    phase: "inside_the_business",
    essential: true,
    signals: ["burn out", "burnout", "lose", "stuck", "plateau", "can't grow", "sell up", "shelve it"],
    bucket: "pains",
  },
  {
    key: "unacted_idea",
    prompt: "Is there an idea you keep coming back to but haven't acted on?",
    label: "The idea you keep returning to",
    phase: "inside_the_business",
    essential: false,
    signals: ["i keep thinking", "keep thinking about", "always wanted", "someday", "never done it"],
    bucket: "ideas",
  },
  {
    key: "ninety_day_wish",
    prompt:
      "If one thing could be true ninety days from now that would make everything else easier, what would it be?",
    transition: "That gives me a solid picture of today. Now the direction.",
    label: "Ninety days",
    phase: "where_you_want_to_go",
    essential: true,
    signals: ["ninety days", "three months", "if i could just", "by christmas", "by the summer"],
    bucket: "goals",
  },
  {
    key: "future_day",
    prompt:
      "Now take me two years ahead. If the business is working the way you hoped, what does an ordinary Tuesday look like then?",
    label: "Two years from now",
    phase: "where_you_want_to_go",
    essential: true,
    signals: ["two years", "in the future", "ideally", "one day", "i'd want", "i would want"],
    bucket: "desired_future",
  },
  {
    key: "future_you",
    prompt: "In that version, what are you spending your time on, and what are you finally not doing?",
    label: "What it feels like to be you",
    phase: "where_you_want_to_go",
    essential: false,
    signals: ["my time", "step back", "not doing", "off my plate", "spending my time", "instead of"],
    bucket: "desired_future",
  },
  {
    key: "future_customer",
    prompt: "What do your customers say about you in that version, when you're not in the room?",
    label: "The customer's experience",
    phase: "where_you_want_to_go",
    essential: false,
    signals: ["customers say", "they tell", "reviews", "word of mouth", "they'd say", "recommend"],
    bucket: "desired_future",
  },
  {
    key: "future_team",
    prompt: "And the team, what's different about how they work by then?",
    label: "The team ahead",
    phase: "where_you_want_to_go",
    essential: false,
    signals: ["my team", "the team", "staff", "employees", "we hired", "contractors", "no team"],
    bucket: "desired_future",
  },
  {
    key: "how_youd_know",
    prompt: "How would you know this worked? It doesn't have to be a number.",
    label: "How you'd know",
    phase: "where_you_want_to_go",
    essential: false,
    signals: ["i'd know", "i could take", "success", "measure", "would be different", "stop working weekends"],
    bucket: "goals",
  },
  {
    key: "what_makes_it_worthwhile",
    prompt: "What would make this worth doing for you personally, not just for the business?",
    transition: "Last couple, then I'll show you the picture I've built.",
    label: "What makes it worthwhile",
    phase: "putting_it_together",
    essential: false,
    signals: ["for me", "personally", "my family", "peace of mind", "time back", "worth it"],
    bucket: "goals",
  },
  {
    key: "dont_want_to_lose",
    prompt: "As things change, what do you not want to lose?",
    label: "What to protect",
    phase: "putting_it_together",
    essential: false,
    signals: ["don't want to lose", "keep the", "protect", "stays the same", "personal touch"],
    bucket: "constraints",
  },
  {
    key: "anything_missed",
    prompt: "Anything I didn't ask that you wish I had?",
    label: "Anything else",
    phase: "putting_it_together",
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

export function keysForPhase(phase: IntakePhaseKey): IntakeObjectiveKey[] {
  return INTAKE_QUESTIONS.filter((q) => q.phase === phase).map((q) => q.key);
}

/** Warm one-time follow-ups. Never more than one per trigger. */
export type FollowUpKey = "thin_dream" | "past_failure" | "hidden_asset" | "team_size";

export const FOLLOW_UPS: Record<FollowUpKey, string> = {
  thin_dream: "Stay with that for a second. What would an actual day look like?",
  past_failure: "What went wrong with that? I'd rather not repeat it.",
  hidden_asset: "What would become possible if you actually used that well?",
  team_size: "How many people is that altogether?",
};

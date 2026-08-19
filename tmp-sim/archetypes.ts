type Key = string;
export type Archetype = { name: string; reply: (key: Key, followUp: string | null) => string | null };

const A1: Record<string, string> = {
  who_you_are: "I'm Dave, I own a plumbing and heating company in Bristol. Been running it for eleven years, twelve people now.",
  the_business: "We do boiler installs, servicing and emergency callouts for homeowners, and a bit of landlord work. Most of our customers are within about twenty miles. People come to us because we turn up when we say we will.",
  future_day: "Honestly I'd like to walk in, have a coffee, look at the board and know the day is already sorted without me touching it.",
  future_you: "I'd be doing the bits I'm actually good at, quoting the bigger jobs and looking after the lads, not answering the phone at half seven at night.",
  future_customer: "They'd say we're the ones who actually call you back. Same as now really but they'd never be left wondering.",
  future_team: "The lads would sort their own days out. Right now they ring me about everything.",
  whats_working: "Referrals. Nearly all our work is word of mouth and repeat customers, we've never spent a penny on advertising and we're always busy.",
  recurring_problem: "Scheduling and quotes. Everything comes back to me, every single job change, every price question. I'm the bottleneck.",
  cost_of_standing_still: "I'd probably burn out or just cap the business where it is. My wife's already said something.",
  already_tried: "We hired an agency to sort the website and they never delivered anything useful, waste of money. Tried a scheduling app too, nobody used it.",
  whats_in_the_way: "Time mostly. And I'm not a computer person.",
  existing_assets: "We've got about four thousand past customers on a spreadsheet, and loads of reviews we've never done anything with.",
  unacted_idea: "Servicing plans on a subscription. Keep thinking about it, never done it.",
  ninety_day_wish: "Jobs booked and quoted without me being in the middle of it.",
  how_youd_know: "My phone would stop ringing in the evenings and the lads would still know what they're doing.",
  anything_missed: "Not really, you've covered it.",
};

const A2: Record<string, string> = {
  who_you_are: "I'm Priya. I've been building a thing on the side for about eight months while still working.",
  the_business: "It's sort of a platform for helping people find good local tutors, though I'm still figuring out exactly who pays. Right now it's a landing page and some spreadsheets.",
  future_day: "I'd wake up and it would just be running. People signing up, matches happening, me working on the interesting parts.",
  future_you: "Doing this full time instead of squeezing it into evenings.",
  future_customer: "They'd say it was the easiest way to find someone decent.",
  future_team: "No team yet. Maybe one person helping with support.",
  whats_working: "People genuinely want it, everyone I talk to says yes.",
  recurring_problem: "I keep changing my mind about the model. Subscription, commission, ads. I go round in circles.",
  cost_of_standing_still: "I'd lose momentum and probably shelve it.",
  already_tried: "I tried a freelancer to build the booking bit and it fell through.",
  whats_in_the_way: "Clarity honestly. And money is tight.",
  existing_assets: "I've got a waiting list of about three hundred people who signed up.",
  unacted_idea: "Charging tutors instead of parents.",
  ninety_day_wish: "Knowing which model actually works, with real money coming in.",
  how_youd_know: "First ten paying customers.",
  anything_missed: "Maybe how to know when to quit my job.",
};

const A3: Record<string, string> = {
  who_you_are: "I'm Marcus, managing director of a chartered accountancy practice. Twenty-eight staff across two offices.",
  the_business: "We do compliance, audit and advisory work for owner-managed businesses turning over one to twenty million. Been going nineteen years. Clients stay a long time, average tenure is over eight years, and we've grown mostly by acquisition of smaller practices.",
  future_day: "The partners would spend the day with clients on advisory work instead of chasing internal deadlines and reviewing files at eleven at night.",
  future_you: "Less firefighting. I'd be looking at the next acquisition rather than which job is late.",
  future_customer: "Clients would feel like we're ahead of them rather than reacting to their year end.",
  future_team: "Managers would own their portfolios properly. Right now the process differs by office and by person, which creates rework.",
  whats_working: "Client retention and reputation. And the advisory arm is growing faster than compliance.",
  recurring_problem: "Work in progress and review bottlenecks. Everything piles onto three senior people and nothing moves until they touch it.",
  cost_of_standing_still: "We'd stop growing and probably lose two of our best managers.",
  already_tried: "We brought in a consultant to redesign the workflow, we got a big document and nothing changed.",
  whats_in_the_way: "People capacity and honestly a lack of agreement between the partners.",
  existing_assets: "Nineteen years of client data and a very strong referral network with local solicitors.",
  unacted_idea: "A fixed-fee advisory product for our existing client base.",
  ninety_day_wish: "One consistent way of working across both offices.",
  how_youd_know: "Review turnaround would drop and the seniors would stop working weekends.",
  anything_missed: "How other firms our size handle this.",
};

const A4: Record<string, string | null> = {
  who_you_are: "Sam, I do photography.",
  the_business: "Weddings mostly.",
  future_day: "Busier.",
  future_you: null,
  future_customer: null,
  future_team: "No team.",
  whats_working: "Bookings are ok.",
  recurring_problem: "Editing takes forever.",
  cost_of_standing_still: null,
  already_tried: "Nothing really.",
  whats_in_the_way: "Time.",
  existing_assets: "Got a big back catalogue of photos.",
  unacted_idea: null,
  ninety_day_wish: "More time.",
  how_youd_know: "Less late nights.",
  anything_missed: null,
};

const A5rich = "I run a family bakery in Norwich that my mum started in 1988 and I took over six years ago. We sell to the public from two shops and we also supply about forty cafés and restaurants across the county, which is now more than half the revenue. Our customers are chefs who care about consistency and locals who've been coming since they were kids. What works well is the wholesale side, chefs recommend us to each other constantly and we've never had to sell, and the fact we make everything in house from scratch. What doesn't work is that every wholesale order still comes in by text message to my personal phone, at all hours, and I'm the only one who knows what everyone orders. My team is nine people plus two apprentices we hired last year, and they're brilliant but they can't take an order because it's all in my head. If nothing changed I'd honestly just keep working seven days and eventually sell up, which I don't want. In two years I'd want the ordering to run without me, the wholesale side doubled, and me actually developing new products again which is the part I love. I'd know it worked if I could take a fortnight off and the orders still went out right.";

const A5: Record<string, string | null> = {
  who_you_are: "I'm Ellie, I run a bakery.",
  the_business: A5rich,
  future_day: "Like I said, ordering runs itself, wholesale doubled, and I'm back developing new things. An ordinary Tuesday I'd be in at six baking, out by two, and the afternoon orders would already be handled.",
  future_you: "Creative again. Not the order-taking machine.",
  future_customer: null,
  future_team: "They'd be able to take and fulfil an order without asking me.",
  whats_working: "Wholesale word of mouth, and the product.",
  recurring_problem: "Orders coming to my personal phone by text. Everything comes back to me.",
  cost_of_standing_still: "I'd sell up, which I don't want.",
  already_tried: "We tried a shared spreadsheet, nobody kept it updated.",
  whats_in_the_way: "Time and the fact it's all in my head.",
  existing_assets: "Six years of order history in my phone and forty trade customers who'd buy more.",
  unacted_idea: "A standing order thing so cafés get the same delivery weekly.",
  ninety_day_wish: "Orders out of my phone and into something the team can see.",
  how_youd_know: "I could take a fortnight off.",
  anything_missed: null,
};

function fromMap(name: string, map: Record<string, string | null>, followUps: Record<string, string | null> = {}): Archetype {
  return {
    name,
    reply: (key, fu) => (fu ? (followUps[fu] ?? `More detail on that: ${map[key] ?? ""}`.trim()) : (map[key] ?? null)),
  };
}

export const archetypes: Archetype[] = [
  fromMap("1. Established local service business", A1, { thin_dream: "Realistically I'd be out on site two days a week and the office would run without me.", past_failure: "They took the money, sent some mockups, and stopped replying.", hidden_asset: "We could probably fill the quiet months with service reminders." }),
  fromMap("2. Early-stage vague model", A2, { thin_dream: "Maybe a hundred matches a week happening without me touching anything.", past_failure: "He disappeared halfway through and I lost the deposit.", hidden_asset: "I could actually email them and see who'd pay." }),
  fromMap("3. Growing professional services", A3, { thin_dream: null, past_failure: "It was all theory, nothing anyone could actually follow.", hidden_asset: "We could market to our own client base instead of chasing new ones." }),
  fromMap("4. Thin answers and skips", A4, { thin_dream: "Dunno. Just less stress.", past_failure: null, hidden_asset: "Could sell prints maybe." }),
  fromMap("5. Rich long answers", A5, { thin_dream: null, past_failure: "People just went back to texting me.", hidden_asset: "Standing orders off the back of the history." }),
];

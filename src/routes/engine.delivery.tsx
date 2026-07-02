import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { SectionCard, MetricCard } from "@/components/engine/primitives";
import { cn } from "@/lib/utils";
import { Send, Eye, MessageCircle, CheckCircle2, Archive, Calendar, AlertCircle, PlusCircle } from "lucide-react";

export const Route = createFileRoute("/engine/delivery")({
  component: DeliveryRoomPage,
});

type DStatus =
  | "ready"
  | "scheduled"
  | "sent"
  | "viewed"
  | "responded"
  | "follow_up"
  | "accepted"
  | "execution"
  | "archived";

const STATUS_META: Record<DStatus, { label: string; cls: string }> = {
  ready: { label: "Ready to Send", cls: "bg-[#efe9fb] text-[#5435a4] border-[#dccdf3]" },
  scheduled: { label: "Scheduled", cls: "bg-[#e9eefb] text-[#2842a4] border-[#cdd6f3]" },
  sent: { label: "Sent", cls: "bg-[#e6f5ec] text-[#1f6b3b] border-[#c4e6d2]" },
  viewed: { label: "Viewed", cls: "bg-[#e9eefb] text-[#2842a4] border-[#cdd6f3]" },
  responded: { label: "Client Responded", cls: "bg-[#e6f5ec] text-[#1f6b3b] border-[#c4e6d2]" },
  follow_up: { label: "Follow-up Needed", cls: "bg-[#fbf3e0] text-[#8a6713] border-[#f1e3b9]" },
  accepted: { label: "Accepted", cls: "bg-[#e6f5ec] text-[#1f6b3b] border-[#c4e6d2]" },
  execution: { label: "Moved to Execution", cls: "bg-[#e6f5ec] text-[#1f6b3b] border-[#c4e6d2]" },
  archived: { label: "Archived", cls: "bg-[#ecedf0] text-[#5a5d70] border-[#d6d8df]" },
};

type Delivery = {
  id: string;
  client: string;
  roadmap: string;
  version: string;
  status: DStatus;
  channel: string;
  recipient: string;
  recipientRole: string;
  preparedBy: string;
  approvedBy: string;
  lastAction: string;
  nextStep: string;
};

const DELIVERIES: Delivery[] = [
  { id: "d1", client: "Mental Dental Academy", roadmap: "Scale Dental Board Prep", version: "v1.0", status: "ready", channel: "Email + Portal", recipient: "Ryan Driscoll", recipientRole: "Founder & CEO", preparedBy: "Tai Shobajo", approvedBy: "Tai Shobajo", lastAction: "Approved today, 9:41 AM", nextStep: "Send" },
  { id: "d2", client: "Gradient Group", roadmap: "Job Board Growth Engine", version: "v2.1", status: "scheduled", channel: "Live Presentation", recipient: "Love Malone", recipientRole: "COO", preparedBy: "Tai Shobajo", approvedBy: "Tai Shobajo", lastAction: "Scheduled tomorrow, 10:00 AM", nextStep: "Prepare" },
  { id: "d3", client: "SBREADS", roadmap: "Digital Platform Upgrade", version: "v1.3", status: "sent", channel: "Email", recipient: "Andrew M.", recipientRole: "Executive Director", preparedBy: "Tai Shobajo", approvedBy: "Tai Shobajo", lastAction: "Sent Jun 10, 2025", nextStep: "Follow Up" },
  { id: "d4", client: "Temple Emanu-El", roadmap: "Event & Community Hub", version: "v1.0", status: "viewed", channel: "Client Portal", recipient: "Kim Cohen", recipientRole: "Ops Director", preparedBy: "Tai Shobajo", approvedBy: "Tai Shobajo", lastAction: "Viewed Jun 11, 2025", nextStep: "Check In" },
  { id: "d5", client: "SpaExecutive", roadmap: "Magazine Platform", version: "v1.2", status: "follow_up", channel: "Email", recipient: "Elizabeth H.", recipientRole: "Publisher", preparedBy: "Tai Shobajo", approvedBy: "Tai Shobajo", lastAction: "Opened Jun 10, 2025", nextStep: "Follow Up" },
  { id: "d6", client: "Thriving Minds AZ", roadmap: "LMS & Community Build", version: "v1.0", status: "follow_up", channel: "Live Presentation", recipient: "Dr. Sarah T.", recipientRole: "Founder", preparedBy: "Tai Shobajo", approvedBy: "Tai Shobajo", lastAction: "No response 5 days", nextStep: "Follow Up" },
  { id: "d7", client: "Valley Precision Painting", roadmap: "Operations & Lead Engine", version: "v1.0", status: "execution", channel: "Client Portal", recipient: "Jason V.", recipientRole: "Owner", preparedBy: "Tai Shobajo", approvedBy: "Tai Shobajo", lastAction: "Moved to Execution Jun 6", nextStep: "Open Tracker" },
  { id: "d8", client: "Innago", roadmap: "Platform Modernization", version: "v1.1", status: "archived", channel: "Client Portal", recipient: "Derrick I.", recipientRole: "CTO", preparedBy: "Tai Shobajo", approvedBy: "Tai Shobajo", lastAction: "Archived May 30, 2025", nextStep: "View" },
];

const TABS: { key: DStatus | "all"; label: string; count: number }[] = [
  { key: "all", label: "All Deliveries", count: 36 },
  { key: "ready", label: "Ready to Send", count: 7 },
  { key: "scheduled", label: "Scheduled", count: 4 },
  { key: "sent", label: "Sent", count: 12 },
  { key: "viewed", label: "Viewed", count: 11 },
  { key: "follow_up", label: "Follow-up", count: 5 },
  { key: "execution", label: "Moved to Execution", count: 3 },
  { key: "archived", label: "Archived", count: 2 },
];

function DeliveryRoomPage() {
  const [tab, setTab] = useState<DStatus | "all">("all");
  const rows = tab === "all" ? DELIVERIES : DELIVERIES.filter((d) => d.status === tab);

  return (
    <div className="max-w-[1500px]">
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal">Handoff</div>
          <h1 className="font-display text-4xl text-ink mt-1">Delivery Room</h1>
          <p className="text-ink/60 mt-1">Manage all approved roadmap deliveries. Track status, client engagement, and next actions.</p>
        </div>
        <button className="inline-flex items-center gap-1.5 text-sm bg-ink text-white rounded-md px-3 py-2 hover:bg-ink/90">
          <PlusCircle className="w-4 h-4" /> New Delivery
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <MetricCard label="Ready to Send" value={7} tone="purple" hint="↑ 2 from last week" />
        <MetricCard label="Scheduled" value={4} tone="blue" hint="↑ 1 from last week" />
        <MetricCard label="Viewed by Client" value={11} tone="green" hint="↑ 4 from last week" />
        <MetricCard label="Awaiting Response" value={6} tone="orange" hint="↓ 1 from last week" />
        <MetricCard label="Moved to Execution" value={3} tone="green" hint="↑ 1 from last week" />
        <MetricCard label="Follow-up Needed" value={5} tone="red" hint="↓ 2 from last week" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        <SectionCard
          title={
            <div className="flex items-center gap-1 flex-wrap">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={cn(
                    "text-xs px-2.5 py-1 rounded-md border",
                    tab === t.key ? "bg-ink text-white border-ink" : "border-transparent text-ink/70 hover:border-border",
                  )}
                >
                  {t.label} <span className="opacity-60">{t.count}</span>
                </button>
              ))}
            </div>
          }
        >
          <div className="overflow-x-auto -mx-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] font-mono uppercase tracking-[0.2em] text-ink/50 border-b border-border">
                  <th className="px-5 py-2.5">Client</th>
                  <th className="px-3 py-2.5">Roadmap</th>
                  <th className="px-3 py-2.5">Ver</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5">Channel</th>
                  <th className="px-3 py-2.5">Recipient</th>
                  <th className="px-3 py-2.5">Last Action</th>
                  <th className="px-5 py-2.5 text-right">Next Step</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => (
                  <tr key={d.id} className="border-b border-border/60 hover:bg-paper-soft/40">
                    <td className="px-5 py-3 font-medium text-ink whitespace-nowrap">{d.client}</td>
                    <td className="px-3 py-3">
                      <div className="text-ink">{d.roadmap}</div>
                      <div className="text-xs text-ink/60">Prepared by {d.preparedBy}</div>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-ink/70">{d.version}</td>
                    <td className="px-3 py-3">
                      <span className={cn("inline-flex items-center text-[11px] px-2 py-0.5 rounded-full border whitespace-nowrap", STATUS_META[d.status].cls)}>
                        {STATUS_META[d.status].label}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-ink/70 whitespace-nowrap">{d.channel}</td>
                    <td className="px-3 py-3">
                      <div className="text-ink">{d.recipient}</div>
                      <div className="text-xs text-ink/60">{d.recipientRole}</div>
                    </td>
                    <td className="px-3 py-3 text-xs text-ink/70 whitespace-nowrap">{d.lastAction}</td>
                    <td className="px-5 py-3 text-right">
                      <button className="inline-flex items-center gap-1 text-xs border border-border rounded px-2 py-1 hover:border-royal/50 text-ink">
                        {iconForStep(d.nextStep)} {d.nextStep}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <div className="space-y-4">
          <SectionCard title="Upcoming Presentations">
            <ul className="space-y-3 text-sm">
              <RailItem icon={<Calendar className="w-3.5 h-3.5 text-royal" />} title="Gradient Group" hint="Tomorrow, Jun 13 · 10:00 AM CT" />
              <RailItem icon={<Calendar className="w-3.5 h-3.5 text-royal" />} title="Thriving Minds AZ" hint="Jun 16 · 2:00 PM CT" />
              <RailItem icon={<Calendar className="w-3.5 h-3.5 text-royal" />} title="CanterVR" hint="Jun 18 · 11:00 AM CT" />
            </ul>
          </SectionCard>
          <SectionCard title="Needs Follow-up">
            <ul className="space-y-3 text-sm">
              <RailItem tone="red" title="Thriving Minds AZ" hint="No response yet · 5d" />
              <RailItem tone="orange" title="SpaExecutive" hint="Opened email · 3d" />
              <RailItem tone="red" title="SBREADS" hint="Opened email · 3d" />
              <RailItem tone="red" title="Castle Vineyard" hint="No response yet · 7d" />
            </ul>
          </SectionCard>
          <SectionCard title="Delivery Issues">
            <ul className="space-y-2 text-sm">
              <li className="flex gap-2 text-ink/80"><AlertCircle className="w-3.5 h-3.5 text-[#a4283c] shrink-0 mt-0.5" />2 emails bounced — recipient invalid</li>
              <li className="flex gap-2 text-ink/80"><AlertCircle className="w-3.5 h-3.5 text-[#8a6713] shrink-0 mt-0.5" />1 portal invite pending acceptance</li>
            </ul>
          </SectionCard>
          <SectionCard title="Next Best Actions">
            <ul className="space-y-2 text-sm">
              <li className="flex justify-between text-ink/80">Send roadmaps ready to deliver <span className="font-medium text-ink">7</span></li>
              <li className="flex justify-between text-ink/80">Prepare for presentations <span className="font-medium text-ink">4</span></li>
              <li className="flex justify-between text-ink/80">Follow up with clients <span className="font-medium text-ink">5</span></li>
              <li className="flex justify-between text-ink/80">Move to execution <span className="font-medium text-ink">3</span></li>
            </ul>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

function iconForStep(step: string) {
  if (step === "Send") return <Send className="w-3 h-3" />;
  if (step === "Prepare") return <Calendar className="w-3 h-3" />;
  if (step === "Follow Up") return <MessageCircle className="w-3 h-3" />;
  if (step === "Check In") return <Eye className="w-3 h-3" />;
  if (step === "Open Tracker") return <CheckCircle2 className="w-3 h-3" />;
  return <Archive className="w-3 h-3" />;
}

function RailItem({ icon, title, hint, tone }: { icon?: React.ReactNode; title: string; hint: string; tone?: "red" | "orange" }) {
  const dot = tone === "red" ? "bg-[#a4283c]" : tone === "orange" ? "bg-[#c99a20]" : "";
  return (
    <li className="flex items-start gap-2">
      {icon ?? (dot ? <span className={cn("w-2 h-2 rounded-full mt-1.5", dot)} /> : null)}
      <div className="min-w-0">
        <div className="text-ink font-medium">{title}</div>
        <div className="text-xs text-ink/60">{hint}</div>
      </div>
    </li>
  );
}

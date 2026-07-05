import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { z } from "zod";
import {
  createProjectFromSource,
  listClientsForPicker,
} from "@/lib/engine-project-intake.functions";
import { SectionCard } from "@/components/engine/primitives";
import { toast } from "sonner";
import { Loader2, Upload, Link2, FileText, StickyNote, ArrowRight } from "lucide-react";

const PrefillSearchSchema = z.object({
  // Pillar 1 — intake bridge. When present, the New Project form is pre-filled
  // from an ops/intake submission and the user just confirms + submits.
  submissionId: z.string().uuid().optional(),
  company: z.string().max(200).optional(),
  contactEmail: z.string().max(255).optional(),
  projectName: z.string().max(200).optional(),
  notes: z.string().max(20000).optional(),
});

export const Route = createFileRoute("/engine/projects/new")({
  validateSearch: (search) => PrefillSearchSchema.parse(search),
  component: NewProjectPage,
});

type SourceTab = "paste" | "url" | "upload" | "blank";

const SourceTypeMap: Record<SourceTab, string> = {
  paste: "transcript",
  url: "website_url",
  upload: "document",
  blank: "brief",
};

function NewProjectPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const createFn = useServerFn(createProjectFromSource);
  const listClients = useServerFn(listClientsForPicker);

  const { data: clientsData } = useQuery({
    queryKey: ["engine", "clients-picker"],
    queryFn: () => listClients(),
  });

  const [projectName, setProjectName] = useState(search.projectName ?? "");
  const [clientMode, setClientMode] = useState<"existing" | "new">("new");
  const [clientId, setClientId] = useState<string>("");
  const [newCompany, setNewCompany] = useState(search.company ?? "");
  const [newIndustry, setNewIndustry] = useState("");
  const [newContactEmail, setNewContactEmail] = useState(search.contactEmail ?? "");
  const [engagementType, setEngagementType] = useState("");
  const [roadmapType, setRoadmapType] = useState("");
  const [primaryGoal, setPrimaryGoal] = useState("");
  const [criticalDate, setCriticalDate] = useState("");

  const [sourceTab, setSourceTab] = useState<SourceTab>(search.notes ? "paste" : "paste");
  const [sourceName, setSourceName] = useState(
    search.submissionId ? `Intake submission ${search.submissionId.slice(0, 8)}` : "",
  );
  const [rawText, setRawText] = useState(search.notes ?? "");
  const [sourceUrl, setSourceUrl] = useState("");


  const mutation = useMutation({
    mutationFn: async () => {
      const payload: {
        projectName: string;
        engagementType?: string;
        roadmapType?: string;
        primaryGoal?: string;
        criticalDate?: string;
        clientId?: string;
        newClient?: { company: string; industry?: string; contact_email?: string };
        source: { type: string; name: string; raw_text?: string; url?: string };
      } = {
        projectName: projectName.trim(),
        engagementType: engagementType.trim() || undefined,
        roadmapType: roadmapType.trim() || undefined,
        primaryGoal: primaryGoal.trim() || undefined,
        criticalDate: criticalDate.trim() || undefined,
        source: {
          type: SourceTypeMap[sourceTab],
          name: sourceName.trim() || "Untitled source",
          raw_text: sourceTab === "paste" ? rawText : undefined,
          url: sourceTab === "url" ? sourceUrl : undefined,
        },
      };
      if (clientMode === "existing") {
        payload.clientId = clientId;
      } else {
        payload.newClient = {
          company: newCompany.trim(),
          industry: newIndustry.trim() || undefined,
          contact_email: newContactEmail.trim() || undefined,
        };
      }
      return await createFn({ data: payload });
    },
    onSuccess: (res) => {
      if (res.status === "processing") {
        toast.success("Project created — extracting signals now");
      } else {
        toast.success("Blank project created");
      }
      navigate({
        to: "/engine/projects/$projectId/overview",
        params: { projectId: res.project_id },
      });
    },
    onError: (e: Error) => toast.error(e.message || "Failed to create project"),
  });

  const canSubmit =
    projectName.trim().length > 0 &&
    ((clientMode === "existing" && !!clientId) ||
      (clientMode === "new" && newCompany.trim().length > 0)) &&
    (sourceTab === "blank" ||
      (sourceTab === "paste" && rawText.trim().length > 0) ||
      (sourceTab === "url" && sourceUrl.trim().length > 0) ||
      sourceTab === "upload");

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <header>
        <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal">Intake</div>
        <h1 className="font-display text-4xl text-ink mt-1">New Roadmap Project</h1>
        <p className="text-sm text-ink/60 mt-2">
          Upload the truth. The engine drafts the map. Tai validates the path.
        </p>
      </header>

      <SectionCard title="1. Client">
        <div className="space-y-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setClientMode("new")}
              className={`px-3 py-1.5 rounded-full text-xs border ${
                clientMode === "new"
                  ? "bg-ink text-white border-ink"
                  : "bg-card text-ink/70 border-border"
              }`}
            >
              New client
            </button>
            <button
              type="button"
              onClick={() => setClientMode("existing")}
              className={`px-3 py-1.5 rounded-full text-xs border ${
                clientMode === "existing"
                  ? "bg-ink text-white border-ink"
                  : "bg-card text-ink/70 border-border"
              }`}
            >
              Existing client
            </button>
          </div>
          {clientMode === "new" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Company">
                <input
                  value={newCompany}
                  onChange={(e) => setNewCompany(e.target.value)}
                  className={inputClass}
                  placeholder="Mental Dental"
                />
              </Field>
              <Field label="Industry">
                <input
                  value={newIndustry}
                  onChange={(e) => setNewIndustry(e.target.value)}
                  className={inputClass}
                  placeholder="Dental education"
                />
              </Field>
              <Field label="Primary contact email">
                <input
                  value={newContactEmail}
                  onChange={(e) => setNewContactEmail(e.target.value)}
                  className={inputClass}
                  placeholder="ryan@example.com"
                />
              </Field>
            </div>
          ) : (
            <Field label="Select client">
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className={inputClass}
              >
                <option value="">— select —</option>
                {(clientsData?.rows ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.company}
                    {c.industry ? ` · ${c.industry}` : ""}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>
      </SectionCard>

      <SectionCard title="2. Project details">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Project name" required>
            <input
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              className={inputClass}
              placeholder="Q-Bank Launch Engine"
            />
          </Field>
          <Field label="Engagement type">
            <input
              value={engagementType}
              onChange={(e) => setEngagementType(e.target.value)}
              className={inputClass}
              placeholder="Roadmap + Build"
            />
          </Field>
          <Field label="Roadmap type">
            <input
              value={roadmapType}
              onChange={(e) => setRoadmapType(e.target.value)}
              className={inputClass}
              placeholder="Growth / Systems / Product"
            />
          </Field>
          <Field label="Critical date">
            <input
              value={criticalDate}
              onChange={(e) => setCriticalDate(e.target.value)}
              className={inputClass}
              placeholder="Oct 1 board deadline"
            />
          </Field>
          <div className="md:col-span-2">
            <Field label="Primary goal">
              <textarea
                value={primaryGoal}
                onChange={(e) => setPrimaryGoal(e.target.value)}
                rows={2}
                className={inputClass}
                placeholder="Ship a working Q-Bank platform before October 1."
              />
            </Field>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="3. Source material">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <TabButton icon={<FileText className="w-4 h-4" />} active={sourceTab === "paste"} onClick={() => setSourceTab("paste")}>
              Paste text
            </TabButton>
            <TabButton icon={<Link2 className="w-4 h-4" />} active={sourceTab === "url"} onClick={() => setSourceTab("url")}>
              Website URL
            </TabButton>
            <TabButton icon={<Upload className="w-4 h-4" />} active={sourceTab === "upload"} onClick={() => setSourceTab("upload")}>
              Upload file
            </TabButton>
            <TabButton icon={<StickyNote className="w-4 h-4" />} active={sourceTab === "blank"} onClick={() => setSourceTab("blank")}>
              Start blank
            </TabButton>
          </div>

          {sourceTab !== "blank" && (
            <Field label="Source name">
              <input
                value={sourceName}
                onChange={(e) => setSourceName(e.target.value)}
                className={inputClass}
                placeholder={
                  sourceTab === "paste"
                    ? "Discovery call transcript · Ryan · Aug 12"
                    : sourceTab === "url"
                    ? "Client website"
                    : "Uploaded brief"
                }
              />
            </Field>
          )}

          {sourceTab === "paste" && (
            <Field label="Transcript / brief / notes">
              <textarea
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                rows={10}
                className={`${inputClass} font-mono text-xs`}
                placeholder="Paste the discovery transcript, Plaud transcript, brief, or spec here."
              />
              <div className="text-xs text-ink/40 mt-1">
                {rawText.length.toLocaleString()} / 200,000 chars
              </div>
            </Field>
          )}

          {sourceTab === "url" && (
            <Field label="Website / doc URL">
              <input
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                className={inputClass}
                placeholder="https://example.com"
              />
            </Field>
          )}

          {sourceTab === "upload" && (
            <div className="text-sm text-ink/60 border border-dashed border-border rounded-md p-6 text-center">
              File upload lands in a follow-up build. Use <b>Paste text</b> or <b>Website URL</b> for
              this project, or add the file after creation from the Signal Room.
            </div>
          )}

          {sourceTab === "blank" && (
            <div className="text-sm text-ink/60 border border-dashed border-border rounded-md p-6 text-center">
              Blank project. Add sources from the Signal Room to run the intelligence pipeline.
            </div>
          )}
        </div>
      </SectionCard>

      <div className="flex items-center justify-between gap-3 pt-2">
        <Link
          to="/engine/projects"
          className="text-sm text-ink/60 hover:text-ink underline underline-offset-4"
        >
          Cancel
        </Link>
        <button
          onClick={() => mutation.mutate()}
          disabled={!canSubmit || mutation.isPending}
          className="bg-ink text-white px-5 py-2.5 rounded-md text-sm hover:bg-ink/90 disabled:opacity-50 flex items-center gap-2"
        >
          {mutation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Creating…
            </>
          ) : (
            <>
              Create project and extract <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}

const inputClass =
  "w-full px-3 py-2 bg-paper-soft border border-border rounded-md text-sm text-ink focus:outline-none focus:border-royal";

function Field({ label, children, required }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs font-medium text-ink/70 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </div>
      {children}
    </label>
  );
}

function TabButton({
  icon,
  children,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-md text-xs border flex items-center gap-1.5 ${
        active ? "bg-ink text-white border-ink" : "bg-card text-ink/70 border-border hover:border-royal/50"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  checkPortalAccess,
  getPortalOnboarding,
  savePortalOnboardingSection,
  submitPortalOnboarding,
} from "@/lib/portal.functions";
import { usePortalContext } from "@/hooks/use-portal-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  PortalPage,
  PortalCard,
  PortalPageHeader,
} from "@/components/portal/PortalPage";

export const Route = createFileRoute("/portal/onboarding")({
  ssr: false,
  beforeLoad: async () => {
    const res = await checkPortalAccess();
    if (res.status === "revoked") throw redirect({ to: "/portal/access-denied" });
    if (res.status === "none") throw redirect({ to: "/portal/login" });
  },
  head: () => ({
    meta: [
      { title: "Onboarding — Trust Tai portal" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OnboardingPage,
});

type SectionKey =
  | "business_basics"
  | "current_state"
  | "goals_priorities"
  | "assets_docs";

type FormShape = Record<SectionKey, Record<string, string>>;

const EMPTY: FormShape = {
  business_basics: {},
  current_state: {},
  goals_priorities: {},
  assets_docs: {},
};

const STEP_LABELS = [
  "Business basics",
  "Current state",
  "Goals & priorities",
  "Assets & docs",
  "Review & submit",
];

const BUCKET = "client-portal-files";
const MAX_BYTES = 25 * 1024 * 1024;

function OnboardingPage() {
  const ctx = usePortalContext();
  const project = ctx.data?.hasAccess ? ctx.data.project : undefined;
  const email = ctx.data?.email ?? null;
  const portalProjectId = project?.id;

  const getFn = useServerFn(getPortalOnboarding);
  const saveFn = useServerFn(savePortalOnboardingSection);
  const submitFn = useServerFn(submitPortalOnboarding);

  const onboardingQ = useQuery({
    queryKey: ["portal", "onboarding", portalProjectId],
    enabled: !!portalProjectId,
    queryFn: () => getFn({ data: { portalProjectId: portalProjectId! } }),
  });

  const initial = onboardingQ.data?.onboarding as
    | (Record<string, unknown> & { status?: string; current_step?: number })
    | undefined;

  const [form, setForm] = useState<FormShape>(EMPTY);
  const [step, setStep] = useState(1);
  const hydrated = useRef(false);

  useEffect(() => {
    if (!initial || hydrated.current) return;
    setForm({
      business_basics: (initial.business_basics as Record<string, string>) ?? {},
      current_state: (initial.current_state as Record<string, string>) ?? {},
      goals_priorities: (initial.goals_priorities as Record<string, string>) ?? {},
      assets_docs: (initial.assets_docs as Record<string, string>) ?? {},
    });
    if (initial.current_step) setStep(Math.min(5, Math.max(1, initial.current_step)));
    hydrated.current = true;
  }, [initial]);

  const submitted = initial?.status === "submitted";

  const setField = useCallback(
    (section: SectionKey, key: string, value: string) => {
      setForm((prev) => ({
        ...prev,
        [section]: { ...prev[section], [key]: value },
      }));
    },
    [],
  );

  const saveMut = useMutation({
    mutationFn: async (opts: { section: SectionKey; nextStep: number }) => {
      if (!portalProjectId) throw new Error("Workspace not ready");
      // Prune empty strings before sending.
      const cleaned: Record<string, string> = {};
      for (const [k, v] of Object.entries(form[opts.section])) {
        if (v && v.trim().length > 0) cleaned[k] = v.trim();
      }
      return saveFn({
        data: {
          portalProjectId,
          section: opts.section,
          data: cleaned,
          currentStep: opts.nextStep,
        },
      });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const qc = useQueryClient();
  const submitMut = useMutation({
    mutationFn: async () => {
      if (!portalProjectId) throw new Error("Workspace not ready");
      return submitFn({ data: { portalProjectId } });
    },
    onSuccess: () => {
      toast.success("Intake submitted. Tai will take it from here.");
      qc.invalidateQueries({ queryKey: ["portal", "onboarding", portalProjectId] });
      qc.invalidateQueries({ queryKey: ["portal", "context"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Submit failed"),
  });

  const goNext = async (currentSection: SectionKey | null) => {
    if (currentSection) {
      await saveMut.mutateAsync({ section: currentSection, nextStep: step + 1 });
    }
    setStep((s) => Math.min(5, s + 1));
  };
  const goBack = () => setStep((s) => Math.max(1, s - 1));

  if (!portalProjectId || onboardingQ.isLoading) {
    return (
      <PortalPage>
        <PortalCard>
          <p className="text-ink/60">Loading intake…</p>
        </PortalCard>
      </PortalPage>
    );
  }

  return (
    <PortalPage width="4xl">
      <PortalCard>
        <PortalPageHeader
          eyebrow={`Step ${step} of 5`}
          title={submitted ? "Intake submitted" : STEP_LABELS[step - 1]}
          description={
            submitted
              ? "Thank you. Your intake is with Tai. We'll reach out with the next step within one business day."
              : "Answer what you can. You can save and come back — nothing is sent until you review and submit."
          }
        />

        <ol className="mt-6 flex flex-wrap gap-2 text-[11px] font-mono uppercase tracking-[0.2em]">
          {STEP_LABELS.map((label, i) => {
            const n = i + 1;
            const active = n === step;
            const done = n < step;
            return (
              <li
                key={label}
                className={`px-3 py-1.5 rounded-full border ${
                  active
                    ? "border-royal text-royal bg-royal/5"
                    : done
                      ? "border-emerald-600/40 text-emerald-700 bg-emerald-50"
                      : "border-border text-ink/50"
                }`}
              >
                {n}. {label}
              </li>
            );
          })}
        </ol>

        <div className="mt-8">
          {submitted ? (
            <SubmittedView />
          ) : step === 1 ? (
            <BusinessBasicsStep value={form.business_basics} onChange={(k, v) => setField("business_basics", k, v)} />
          ) : step === 2 ? (
            <CurrentStateStep value={form.current_state} onChange={(k, v) => setField("current_state", k, v)} />
          ) : step === 3 ? (
            <GoalsStep value={form.goals_priorities} onChange={(k, v) => setField("goals_priorities", k, v)} />
          ) : step === 4 ? (
            <AssetsStep
              value={form.assets_docs}
              onChange={(k, v) => setField("assets_docs", k, v)}
              portalProjectId={portalProjectId}
              email={email}
            />
          ) : (
            <ReviewStep form={form} />
          )}
        </div>

        {!submitted ? (
          <div className="mt-10 flex items-center justify-between gap-4">
            <Button variant="ghost" onClick={goBack} disabled={step === 1 || saveMut.isPending}>
              Back
            </Button>
            <div className="flex items-center gap-3">
              {step < 5 ? (
                <>
                  <Button
                    variant="outline"
                    disabled={saveMut.isPending}
                    onClick={() =>
                      saveMut.mutate({
                        section: currentSectionForStep(step) ?? "business_basics",
                        nextStep: step,
                      })
                    }
                  >
                    Save
                  </Button>
                  <Button
                    onClick={() => goNext(currentSectionForStep(step))}
                    disabled={saveMut.isPending}
                  >
                    {saveMut.isPending ? "Saving…" : "Continue"}
                  </Button>
                </>
              ) : (
                <Button
                  onClick={() => submitMut.mutate()}
                  disabled={submitMut.isPending}
                >
                  {submitMut.isPending ? "Submitting…" : "Submit intake"}
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="mt-10">
            <Button asChild variant="outline">
              <Link to="/portal/home">Back to portal home</Link>
            </Button>
          </div>
        )}
      </PortalCard>
    </PortalPage>
  );
}

function currentSectionForStep(step: number): SectionKey | null {
  if (step === 1) return "business_basics";
  if (step === 2) return "current_state";
  if (step === 3) return "goals_priorities";
  if (step === 4) return "assets_docs";
  return null;
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-ink">{label}</Label>
      {children}
      {hint ? <p className="text-xs text-ink/50">{hint}</p> : null}
    </div>
  );
}

function BusinessBasicsStep({
  value,
  onChange,
}: {
  value: Record<string, string>;
  onChange: (k: string, v: string) => void;
}) {
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <Field label="Company name">
        <Input
          value={value.company ?? ""}
          onChange={(e) => onChange("company", e.target.value)}
          maxLength={200}
        />
      </Field>
      <Field label="Website">
        <Input
          value={value.website ?? ""}
          onChange={(e) => onChange("website", e.target.value)}
          placeholder="https://"
          maxLength={500}
        />
      </Field>
      <Field label="Industry">
        <Input
          value={value.industry ?? ""}
          onChange={(e) => onChange("industry", e.target.value)}
          maxLength={200}
        />
      </Field>
      <Field label="Team size">
        <Input
          value={value.team_size ?? ""}
          onChange={(e) => onChange("team_size", e.target.value)}
          maxLength={80}
        />
      </Field>
      <Field label="Your role" hint="e.g. Founder, COO">
        <Input
          value={value.role ?? ""}
          onChange={(e) => onChange("role", e.target.value)}
          maxLength={200}
        />
      </Field>
      <Field label="Best number or channel to reach you">
        <Input
          value={value.contact ?? ""}
          onChange={(e) => onChange("contact", e.target.value)}
          maxLength={200}
        />
      </Field>
      <div className="sm:col-span-2">
        <Field label="One sentence: what does the business actually do?">
          <Textarea
            value={value.elevator ?? ""}
            onChange={(e) => onChange("elevator", e.target.value)}
            rows={3}
            maxLength={1000}
          />
        </Field>
      </div>
    </div>
  );
}

function CurrentStateStep({
  value,
  onChange,
}: {
  value: Record<string, string>;
  onChange: (k: string, v: string) => void;
}) {
  return (
    <div className="grid gap-5">
      <Field label="What's working well right now?">
        <Textarea
          value={value.strengths ?? ""}
          onChange={(e) => onChange("strengths", e.target.value)}
          rows={3}
          maxLength={2000}
        />
      </Field>
      <Field label="Where are you stuck or slower than you'd like?">
        <Textarea
          value={value.blockers ?? ""}
          onChange={(e) => onChange("blockers", e.target.value)}
          rows={3}
          maxLength={2000}
        />
      </Field>
      <Field label="What have you already tried that didn't quite land?">
        <Textarea
          value={value.tried ?? ""}
          onChange={(e) => onChange("tried", e.target.value)}
          rows={3}
          maxLength={2000}
        />
      </Field>
      <Field label="Tools & systems in play (CRM, ops, data, agency, etc.)">
        <Textarea
          value={value.stack ?? ""}
          onChange={(e) => onChange("stack", e.target.value)}
          rows={2}
          maxLength={1500}
        />
      </Field>
    </div>
  );
}

function GoalsStep({
  value,
  onChange,
}: {
  value: Record<string, string>;
  onChange: (k: string, v: string) => void;
}) {
  return (
    <div className="grid gap-5">
      <Field label="If this roadmap works, what changes in 90 days?">
        <Textarea
          value={value.ninety_day ?? ""}
          onChange={(e) => onChange("ninety_day", e.target.value)}
          rows={3}
          maxLength={2000}
        />
      </Field>
      <Field label="What does success look like in 12 months?">
        <Textarea
          value={value.twelve_month ?? ""}
          onChange={(e) => onChange("twelve_month", e.target.value)}
          rows={3}
          maxLength={2000}
        />
      </Field>
      <Field label="Top 3 priorities (in your words)">
        <Textarea
          value={value.priorities ?? ""}
          onChange={(e) => onChange("priorities", e.target.value)}
          rows={3}
          maxLength={2000}
        />
      </Field>
      <Field
        label="Constraints we need to respect"
        hint="Budget ceilings, no-go tools, capacity, timing, compliance."
      >
        <Textarea
          value={value.constraints ?? ""}
          onChange={(e) => onChange("constraints", e.target.value)}
          rows={2}
          maxLength={1500}
        />
      </Field>
      <Field label="Anything urgent or time-boxed we should know?">
        <Textarea
          value={value.urgency ?? ""}
          onChange={(e) => onChange("urgency", e.target.value)}
          rows={2}
          maxLength={1000}
        />
      </Field>
    </div>
  );
}

function AssetsStep({
  value,
  onChange,
  portalProjectId,
  email,
}: {
  value: Record<string, string>;
  onChange: (k: string, v: string) => void;
  portalProjectId: string;
  email: string | null;
}) {
  const qc = useQueryClient();
  const filesQ = useQuery({
    queryKey: ["portal", "onboarding-files", portalProjectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_portal_files")
        .select("id, file_name, size_bytes, storage_path, created_at")
        .eq("project_id", portalProjectId)
        .eq("category", "onboarding_assets")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = useCallback(
    async (file: File) => {
      if (file.size === 0) return toast.error("File is empty");
      if (file.size > MAX_BYTES) return toast.error("File exceeds 25 MB limit");
      setUploading(true);
      try {
        const path = `${portalProjectId}/onboarding/${crypto.randomUUID()}-${file.name}`;
        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(path, file, { upsert: false, contentType: file.type || undefined });
        if (upErr) throw upErr;
        const { error: rowErr } = await supabase.from("client_portal_files").insert({
          project_id: portalProjectId,
          bucket_id: BUCKET,
          storage_path: path,
          file_name: file.name,
          category: "onboarding_assets",
          file_type: file.name.split(".").pop() ?? null,
          mime_type: file.type || null,
          size_bytes: file.size,
          uploaded_by_email: email,
          uploaded_by_role: "client",
          client_visible: true,
          is_internal: false,
        });
        if (rowErr) {
          await supabase.storage.from(BUCKET).remove([path]);
          throw rowErr;
        }
        toast.success(`Uploaded ${file.name}`);
        qc.invalidateQueries({
          queryKey: ["portal", "onboarding-files", portalProjectId],
        });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Upload failed");
      } finally {
        setUploading(false);
      }
    },
    [portalProjectId, email, qc],
  );

  return (
    <div className="space-y-6">
      <Field
        label="What should we look at?"
        hint="Links, docs, dashboards, decks. Paste URLs on separate lines."
      >
        <Textarea
          value={value.links ?? ""}
          onChange={(e) => onChange("links", e.target.value)}
          rows={4}
          maxLength={3000}
        />
      </Field>

      <div className="rounded-xl border border-border bg-muted/30 p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-royal">
              File uploads
            </div>
            <p className="text-sm text-ink/70 mt-1">
              PDFs, docs, decks, screenshots — up to 25 MB per file.
            </p>
          </div>
          <div>
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void upload(f);
                if (inputRef.current) inputRef.current.value = "";
              }}
            />
            <Button
              variant="outline"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? "Uploading…" : "Attach a file"}
            </Button>
          </div>
        </div>

        <ul className="mt-4 divide-y divide-border/60">
          {(filesQ.data ?? []).map((f) => (
            <li
              key={f.id}
              className="flex items-center justify-between py-2 text-sm"
            >
              <span className="truncate text-ink">{f.file_name}</span>
              <span className="text-ink/50 tabular-nums">
                {formatSize(f.size_bytes)}
              </span>
            </li>
          ))}
          {(filesQ.data ?? []).length === 0 ? (
            <li className="py-2 text-sm text-ink/50">No files attached yet.</li>
          ) : null}
        </ul>
      </div>

      <Field label="Anything else about these assets we should know?">
        <Textarea
          value={value.notes ?? ""}
          onChange={(e) => onChange("notes", e.target.value)}
          rows={3}
          maxLength={2000}
        />
      </Field>
    </div>
  );
}

function ReviewStep({ form }: { form: FormShape }) {
  const rows = useMemo(() => {
    const entries: Array<{ section: string; k: string; v: string }> = [];
    const sections: Array<[SectionKey, string]> = [
      ["business_basics", "Business basics"],
      ["current_state", "Current state"],
      ["goals_priorities", "Goals & priorities"],
      ["assets_docs", "Assets & docs"],
    ];
    for (const [key, label] of sections) {
      for (const [k, v] of Object.entries(form[key] ?? {})) {
        if (v && v.trim().length > 0) entries.push({ section: label, k, v });
      }
    }
    return entries;
  }, [form]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink/70">
        Here's what you'll send to Tai. Go back to any step to edit. Nothing is
        sent until you press submit.
      </p>
      <div className="rounded-xl border border-border bg-muted/20 p-5">
        {rows.length === 0 ? (
          <p className="text-sm text-ink/60">
            Nothing filled in yet. Go back and add what you can.
          </p>
        ) : (
          <dl className="space-y-4">
            {rows.map((r, i) => (
              <div key={i}>
                <dt className="font-mono text-[10px] uppercase tracking-[0.22em] text-royal">
                  {r.section} · {r.k}
                </dt>
                <dd className="mt-1 text-sm text-ink whitespace-pre-wrap">
                  {r.v}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </div>
  );
}

function SubmittedView() {
  return (
    <div className="rounded-xl border border-emerald-600/30 bg-emerald-50/60 p-5 text-sm text-ink/80">
      Your intake is with Tai. You'll get an update in the portal when the next
      step is ready.
    </div>
  );
}

function formatSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

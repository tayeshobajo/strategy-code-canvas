import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Brain, Check, Loader2, Pencil, Plus, Search, ThumbsUp, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getPmMemory,
  addPmNote,
  answerPmQuestion,
  removePmEntry,
  updatePmEntry,
  approvePmAssumption,
} from "@/lib/engine-pm-memory.functions";
import { getProjectCeremonyStatus } from "@/lib/engine-ceremony-status.functions";

type Kind = "fact" | "assumption" | "question" | "decision";

export function PmMemoryDrawer({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [questionFilter, setQuestionFilter] = useState<"open" | "answered" | "all">("open");
  const [confidenceFilter, setConfidenceFilter] = useState<"all" | "low" | "medium" | "high">("all");
  const qc = useQueryClient();
  const getMem = useServerFn(getPmMemory);
  const addNote = useServerFn(addPmNote);
  const answerQ = useServerFn(answerPmQuestion);
  const removeE = useServerFn(removePmEntry);
  const updateE = useServerFn(updatePmEntry);
  const approveA = useServerFn(approvePmAssumption);

  const { data, isLoading } = useQuery({
    queryKey: ["pm-memory", projectId],
    queryFn: () => getMem({ data: { projectId } }),
    enabled: open,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["pm-memory", projectId] });

  const addMut = useMutation({
    mutationFn: (v: { kind: Kind; text: string }) =>
      addNote({ data: { projectId, kind: v.kind, text: v.text } }),
    onSuccess: () => {
      invalidate();
      toast.success("Saved to PM memory");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const answerMut = useMutation({
    mutationFn: (v: { questionId: string; answer: string }) =>
      answerQ({ data: { projectId, ...v } }),
    onSuccess: () => {
      invalidate();
      toast.success("Answer recorded");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeMut = useMutation({
    mutationFn: (v: { kind: Kind; id: string }) =>
      removeE({ data: { projectId, ...v } }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: (v: { kind: Kind; id: string; text: string; confidence?: "low" | "medium" | "high" }) =>
      updateE({ data: { projectId, ...v } }),
    onSuccess: () => {
      invalidate();
      toast.success("Updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const approveMut = useMutation({
    mutationFn: (v: { assumptionId: string; text?: string }) =>
      approveA({ data: { projectId, ...v } }),
    onSuccess: () => {
      invalidate();
      toast.success("Approved — promoted to known fact");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const q = query.trim().toLowerCase();
  const match = (t: string) => !q || t.toLowerCase().includes(q);

  const filtered = useMemo(() => {
    return {
      facts: (data?.known_facts ?? []).filter((f) => match(f.text) || match(f.source ?? "")),
      assumptions: (data?.working_assumptions ?? []).filter(
        (a) => match(a.text) && (confidenceFilter === "all" || a.confidence === confidenceFilter),
      ),
      questions: (data?.open_questions ?? []).filter((qq) => {
        if (!match(qq.text) && !match(qq.answer ?? "")) return false;
        if (questionFilter === "open") return !qq.answered_at;
        if (questionFilter === "answered") return !!qq.answered_at;
        return true;
      }),
      decisions: (data?.decisions_log ?? []).filter(
        (d) => match(d.text) || match(d.actor_email ?? ""),
      ),
    };
  }, [data, q, questionFilter, confidenceFilter]);

  const openCount = (data?.open_questions ?? []).filter((qq) => !qq.answered_at).length;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5">
          <Brain className="h-3.5 w-3.5" />
          PM Memory
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>AI Product Manager memory</SheetTitle>
          <SheetDescription>
            What the AI PM currently knows, assumes, and is still asking about
            this project. Facts and answers feed the next synthesis run.
          </SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading memory…
          </div>
        ) : (
          <>
            <div className="mt-4 relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search facts, assumptions, questions…"
                className="pl-8 h-9 text-sm"
              />
            </div>

            <Tabs defaultValue="ceremonies" className="mt-3">
              <TabsList className="grid grid-cols-5 w-full">
                <TabsTrigger value="ceremonies">Ceremonies</TabsTrigger>
                <TabsTrigger value="questions">
                  Questions{openCount ? ` (${openCount})` : ""}
                </TabsTrigger>
                <TabsTrigger value="facts">Facts</TabsTrigger>
                <TabsTrigger value="assumptions">Assumptions</TabsTrigger>
                <TabsTrigger value="decisions">Decisions</TabsTrigger>
              </TabsList>

              <TabsContent value="ceremonies" className="space-y-3 mt-4">
                <CeremonyChecklist projectId={projectId} />
              </TabsContent>


              <TabsContent value="questions" className="space-y-3 mt-4">
                <FilterRow>
                  <Select value={questionFilter} onValueChange={(v) => setQuestionFilter(v as typeof questionFilter)}>
                    <SelectTrigger className="h-8 w-[140px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="answered">Answered</SelectItem>
                      <SelectItem value="all">All</SelectItem>
                    </SelectContent>
                  </Select>
                  <ResultCount n={filtered.questions.length} />
                </FilterRow>
                {filtered.questions.length ? (
                  filtered.questions.map((qq) => (
                    <QuestionItem
                      key={qq.id}
                      question={qq}
                      onAnswer={(answer) => answerMut.mutate({ questionId: qq.id, answer })}
                      onRemove={() => removeMut.mutate({ kind: "question", id: qq.id })}
                      onEdit={(text) => updateMut.mutate({ kind: "question", id: qq.id, text })}
                    />
                  ))
                ) : (
                  <EmptyRow text={q ? "No questions match your search." : "No open questions."} />
                )}
                <AddNoteForm
                  kind="question"
                  placeholder="Add a question the AI PM should track…"
                  onSubmit={(text) => addMut.mutate({ kind: "question", text })}
                />
              </TabsContent>

              <TabsContent value="facts" className="space-y-3 mt-4">
                <FilterRow>
                  <ResultCount n={filtered.facts.length} />
                </FilterRow>
                {filtered.facts.length ? (
                  filtered.facts.map((f) => (
                    <EditableRow
                      key={f.id}
                      text={f.text}
                      subtitle={`${f.source} · ${new Date(f.captured_at).toLocaleDateString()}`}
                      onSave={(text) => updateMut.mutate({ kind: "fact", id: f.id, text })}
                      onRemove={() => removeMut.mutate({ kind: "fact", id: f.id })}
                    />
                  ))
                ) : (
                  <EmptyRow text={q ? "No facts match your search." : "No facts captured yet."} />
                )}
                <AddNoteForm
                  kind="fact"
                  placeholder="Add a known fact about this project…"
                  onSubmit={(text) => addMut.mutate({ kind: "fact", text })}
                />
              </TabsContent>

              <TabsContent value="assumptions" className="space-y-3 mt-4">
                <FilterRow>
                  <Select value={confidenceFilter} onValueChange={(v) => setConfidenceFilter(v as typeof confidenceFilter)}>
                    <SelectTrigger className="h-8 w-[160px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All confidence</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                  <ResultCount n={filtered.assumptions.length} />
                </FilterRow>
                {filtered.assumptions.length ? (
                  filtered.assumptions.map((a) => (
                    <AssumptionItem
                      key={a.id}
                      assumption={a}
                      onApprove={(text) => approveMut.mutate({ assumptionId: a.id, text })}
                      onEdit={(text, confidence) =>
                        updateMut.mutate({ kind: "assumption", id: a.id, text, confidence })
                      }
                      onRemove={() => removeMut.mutate({ kind: "assumption", id: a.id })}
                    />
                  ))
                ) : (
                  <EmptyRow text={q ? "No assumptions match your search." : "No working assumptions."} />
                )}
                <AddNoteForm
                  kind="assumption"
                  placeholder="Add a working assumption…"
                  onSubmit={(text) => addMut.mutate({ kind: "assumption", text })}
                />
              </TabsContent>

              <TabsContent value="decisions" className="space-y-3 mt-4">
                <FilterRow>
                  <ResultCount n={filtered.decisions.length} />
                </FilterRow>
                {filtered.decisions.length ? (
                  filtered.decisions.map((d) => (
                    <EditableRow
                      key={d.id}
                      text={d.text}
                      subtitle={`${d.actor_email ?? "system"} · ${new Date(d.decided_at).toLocaleString()}`}
                      onSave={(text) => updateMut.mutate({ kind: "decision", id: d.id, text })}
                      onRemove={() => removeMut.mutate({ kind: "decision", id: d.id })}
                    />
                  ))
                ) : (
                  <EmptyRow text={q ? "No decisions match your search." : "No decisions recorded yet."} />
                )}
                <AddNoteForm
                  kind="decision"
                  placeholder="Log a decision…"
                  onSubmit={(text) => addMut.mutate({ kind: "decision", text })}
                />
              </TabsContent>
            </Tabs>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function CeremonyChecklist({ projectId }: { projectId: string }) {
  const getStatus = useServerFn(getProjectCeremonyStatus);
  const { data, isLoading } = useQuery({
    queryKey: ["ceremony-status", projectId],
    queryFn: () => getStatus({ data: { projectId } }),
  });
  const { data, isLoading } = useQuery({
    queryKey: ["ceremony-status", projectId],
    queryFn: () => getStatus({ data: { projectId } }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Loading ceremonies…
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="space-y-2">
      <div className="text-[11px] text-muted-foreground">
        {data.completed_count}/{data.total_count} ceremonies approved
      </div>
      {data.ceremonies.map((c) => {
        const stateTone =
          c.state === "approved"
            ? "text-emerald-700"
            : c.state === "awaiting_review"
              ? "text-amber-700"
              : c.state === "rejected"
                ? "text-red-700"
                : "text-muted-foreground";
        return (
          <div key={c.key} className="rounded-md border border-border p-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-medium text-ink">{c.label}</div>
              <span className={`text-[10px] font-medium ${stateTone}`}>
                {c.state.replace(/_/g, " ")}
              </span>
            </div>
            {c.detail && (
              <div className="mt-1 text-[11px] text-muted-foreground truncate">
                {c.detail}
              </div>
            )}
            <div className="mt-1.5 flex items-center justify-between">
              <ul className="flex-1 text-[10px] text-muted-foreground space-y-0.5">
                {c.evidence_required.slice(0, 3).map((e) => (
                  <li key={e}>• {e}</li>
                ))}
              </ul>
              <a
                href={c.deep_link}
                className="text-[11px] text-royal hover:underline shrink-0 ml-2"
              >
                Open →
              </a>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FilterRow({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-2 justify-between">{children}</div>;
}

function ResultCount({ n }: { n: number }) {
  return <span className="text-[11px] text-muted-foreground">{n} result{n === 1 ? "" : "s"}</span>;
}

function EmptyRow({ text }: { text: string }) {
  return (
    <div className="text-sm text-muted-foreground border border-dashed rounded-md p-4">
      {text}
    </div>
  );
}

function EditableRow({
  text,
  subtitle,
  onSave,
  onRemove,
}: {
  text: string;
  subtitle?: string;
  onSave: (text: string) => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  if (editing) {
    return (
      <div className="border rounded-md p-3 bg-card space-y-2">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="min-h-[70px] text-sm"
        />
        <div className="flex gap-2 justify-end">
          <Button size="sm" variant="ghost" onClick={() => { setDraft(text); setEditing(false); }}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!draft.trim() || draft.trim() === text}
            onClick={() => { onSave(draft.trim()); setEditing(false); }}
          >
            Save
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="group flex gap-2 items-start border rounded-md p-3 bg-card">
      <div className="flex-1 min-w-0">
        <div className="text-sm">{text}</div>
        {subtitle && (
          <div className="text-xs text-muted-foreground mt-0.5">{subtitle}</div>
        )}
      </div>
      <Button
        size="icon"
        variant="ghost"
        className="h-6 w-6 opacity-0 group-hover:opacity-100"
        onClick={() => setEditing(true)}
        title="Correct"
      >
        <Pencil className="h-3.5 w-3.5" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="h-6 w-6 opacity-0 group-hover:opacity-100"
        onClick={onRemove}
        title="Remove"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function AssumptionItem({
  assumption,
  onApprove,
  onEdit,
  onRemove,
}: {
  assumption: { id: string; text: string; confidence: "low" | "medium" | "high"; rationale?: string };
  onApprove: (text: string) => void;
  onEdit: (text: string, confidence: "low" | "medium" | "high") => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(assumption.text);
  const [conf, setConf] = useState(assumption.confidence);

  if (editing) {
    return (
      <div className="border rounded-md p-3 bg-card space-y-2">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="min-h-[70px] text-sm"
        />
        <div className="flex items-center gap-2 justify-between">
          <Select value={conf} onValueChange={(v) => setConf(v as typeof conf)}>
            <SelectTrigger className="h-8 w-[130px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="high">High confidence</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => {
              setDraft(assumption.text);
              setConf(assumption.confidence);
              setEditing(false);
            }}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!draft.trim()}
              onClick={() => { onEdit(draft.trim(), conf); setEditing(false); }}
            >
              Save correction
            </Button>
            <Button
              size="sm"
              disabled={!draft.trim()}
              onClick={() => { onApprove(draft.trim()); setEditing(false); }}
            >
              <ThumbsUp className="h-3.5 w-3.5 mr-1" /> Approve
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="group border rounded-md p-3 bg-card space-y-2">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-sm">{assumption.text}</div>
          {assumption.rationale && (
            <div className="text-xs text-muted-foreground mt-1 italic">
              {assumption.rationale}
            </div>
          )}
        </div>
        <Badge variant="secondary" className="text-[10px] capitalize">
          {assumption.confidence}
        </Badge>
      </div>
      <div className="flex gap-2 justify-end pt-1 border-t">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs"
          onClick={onRemove}
        >
          <X className="h-3.5 w-3.5 mr-1" /> Discard
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={() => setEditing(true)}
        >
          <Pencil className="h-3.5 w-3.5 mr-1" /> Correct
        </Button>
        <Button
          size="sm"
          className="h-7 text-xs"
          onClick={() => onApprove(assumption.text)}
        >
          <ThumbsUp className="h-3.5 w-3.5 mr-1" /> Approve
        </Button>
      </div>
    </div>
  );
}

function QuestionItem({
  question,
  onAnswer,
  onRemove,
  onEdit,
}: {
  question: { id: string; text: string; answer?: string | null; answered_at?: string | null };
  onAnswer: (answer: string) => void;
  onRemove: () => void;
  onEdit: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(question.text);
  const answered = !!question.answered_at;
  return (
    <div className="border rounded-md p-3 bg-card space-y-2">
      <div className="flex items-start gap-2">
        {editing ? (
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="flex-1 min-h-[60px] text-sm"
          />
        ) : (
          <div className="flex-1 text-sm">{question.text}</div>
        )}
        {answered && !editing ? (
          <Badge variant="secondary" className="text-[10px] gap-1">
            <Check className="h-3 w-3" /> Answered
          </Badge>
        ) : null}
        {!editing && (
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditing(true)} title="Correct">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        )}
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onRemove}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      {editing && (
        <div className="flex gap-2 justify-end">
          <Button size="sm" variant="ghost" onClick={() => { setDraft(question.text); setEditing(false); }}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!draft.trim() || draft.trim() === question.text}
            onClick={() => { onEdit(draft.trim()); setEditing(false); }}
          >
            Save
          </Button>
        </div>
      )}
      {answered ? (
        <div className="text-xs text-muted-foreground border-l-2 pl-2">
          {question.answer}
        </div>
      ) : !editing ? (
        <div className="flex gap-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Answer…"
            className="min-h-[60px] text-sm"
          />
          <Button
            size="sm"
            disabled={!text.trim()}
            onClick={() => {
              onAnswer(text.trim());
              setText("");
            }}
          >
            Save
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function AddNoteForm({
  kind,
  placeholder,
  onSubmit,
}: {
  kind: Kind;
  placeholder: string;
  onSubmit: (text: string) => void;
}) {
  const [text, setText] = useState("");
  return (
    <div className="flex gap-2 pt-2 border-t">
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        className="min-h-[60px] text-sm"
      />
      <Button
        size="sm"
        disabled={!text.trim()}
        onClick={() => {
          onSubmit(text.trim());
          setText("");
        }}
      >
        <Plus className="h-3.5 w-3.5 mr-1" /> Add {kind}
      </Button>
    </div>
  );
}

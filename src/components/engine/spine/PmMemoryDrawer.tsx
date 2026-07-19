import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Brain, Check, Loader2, Plus, X } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import {
  getPmMemory,
  addPmNote,
  answerPmQuestion,
  removePmEntry,
} from "@/lib/engine-pm-memory.functions";

type Kind = "fact" | "assumption" | "question" | "decision";

export function PmMemoryDrawer({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const getMem = useServerFn(getPmMemory);
  const addNote = useServerFn(addPmNote);
  const answerQ = useServerFn(answerPmQuestion);
  const removeE = useServerFn(removePmEntry);

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
          <Tabs defaultValue="questions" className="mt-4">
            <TabsList className="grid grid-cols-4 w-full">
              <TabsTrigger value="questions">
                Questions{data?.open_questions?.length ? ` (${data.open_questions.filter((q) => !q.answered_at).length})` : ""}
              </TabsTrigger>
              <TabsTrigger value="facts">Facts</TabsTrigger>
              <TabsTrigger value="assumptions">Assumptions</TabsTrigger>
              <TabsTrigger value="decisions">Decisions</TabsTrigger>
            </TabsList>

            <TabsContent value="questions" className="space-y-3 mt-4">
              {data?.open_questions?.length ? (
                data.open_questions.map((q) => (
                  <QuestionItem
                    key={q.id}
                    question={q}
                    onAnswer={(answer) => answerMut.mutate({ questionId: q.id, answer })}
                    onRemove={() => removeMut.mutate({ kind: "question", id: q.id })}
                  />
                ))
              ) : (
                <EmptyRow text="No open questions. Run the AI PM to surface gaps." />
              )}
              <AddNoteForm
                kind="question"
                placeholder="Add a question the AI PM should track…"
                onSubmit={(text) => addMut.mutate({ kind: "question", text })}
              />
            </TabsContent>

            <TabsContent value="facts" className="space-y-3 mt-4">
              {data?.known_facts?.length ? (
                data.known_facts.map((f) => (
                  <ListRow
                    key={f.id}
                    title={f.text}
                    subtitle={`${f.source} · ${new Date(f.captured_at).toLocaleDateString()}`}
                    onRemove={() => removeMut.mutate({ kind: "fact", id: f.id })}
                  />
                ))
              ) : (
                <EmptyRow text="No facts captured yet." />
              )}
              <AddNoteForm
                kind="fact"
                placeholder="Add a known fact about this project…"
                onSubmit={(text) => addMut.mutate({ kind: "fact", text })}
              />
            </TabsContent>

            <TabsContent value="assumptions" className="space-y-3 mt-4">
              {data?.working_assumptions?.length ? (
                data.working_assumptions.map((a) => (
                  <ListRow
                    key={a.id}
                    title={a.text}
                    subtitle={`confidence: ${a.confidence}`}
                    badge={a.confidence}
                    onRemove={() => removeMut.mutate({ kind: "assumption", id: a.id })}
                  />
                ))
              ) : (
                <EmptyRow text="No working assumptions." />
              )}
              <AddNoteForm
                kind="assumption"
                placeholder="Add a working assumption…"
                onSubmit={(text) => addMut.mutate({ kind: "assumption", text })}
              />
            </TabsContent>

            <TabsContent value="decisions" className="space-y-3 mt-4">
              {data?.decisions_log?.length ? (
                data.decisions_log.map((d) => (
                  <ListRow
                    key={d.id}
                    title={d.text}
                    subtitle={`${d.actor_email ?? "system"} · ${new Date(d.decided_at).toLocaleString()}`}
                    onRemove={() => removeMut.mutate({ kind: "decision", id: d.id })}
                  />
                ))
              ) : (
                <EmptyRow text="No decisions recorded yet." />
              )}
              <AddNoteForm
                kind="decision"
                placeholder="Log a decision…"
                onSubmit={(text) => addMut.mutate({ kind: "decision", text })}
              />
            </TabsContent>
          </Tabs>
        )}
      </SheetContent>
    </Sheet>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <div className="text-sm text-muted-foreground border border-dashed rounded-md p-4">
      {text}
    </div>
  );
}

function ListRow({
  title,
  subtitle,
  badge,
  onRemove,
}: {
  title: string;
  subtitle?: string;
  badge?: string;
  onRemove: () => void;
}) {
  return (
    <div className="group flex gap-2 items-start border rounded-md p-3 bg-card">
      <div className="flex-1 min-w-0">
        <div className="text-sm">{title}</div>
        {subtitle && (
          <div className="text-xs text-muted-foreground mt-0.5">{subtitle}</div>
        )}
      </div>
      {badge && <Badge variant="secondary" className="text-[10px]">{badge}</Badge>}
      <Button
        size="icon"
        variant="ghost"
        className="h-6 w-6 opacity-0 group-hover:opacity-100"
        onClick={onRemove}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function QuestionItem({
  question,
  onAnswer,
  onRemove,
}: {
  question: { id: string; text: string; answer?: string | null; answered_at?: string | null };
  onAnswer: (answer: string) => void;
  onRemove: () => void;
}) {
  const [text, setText] = useState("");
  const answered = !!question.answered_at;
  return (
    <div className="border rounded-md p-3 bg-card space-y-2">
      <div className="flex items-start gap-2">
        <div className="flex-1 text-sm">{question.text}</div>
        {answered ? (
          <Badge variant="secondary" className="text-[10px] gap-1">
            <Check className="h-3 w-3" /> Answered
          </Badge>
        ) : null}
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onRemove}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      {answered ? (
        <div className="text-xs text-muted-foreground border-l-2 pl-2">
          {question.answer}
        </div>
      ) : (
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
      )}
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

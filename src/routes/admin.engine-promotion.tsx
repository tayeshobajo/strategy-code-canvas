import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  listPromotionCandidates,
  proposeEnginePromotion,
  approveEnginePromotion,
  rejectEnginePromotion,
  type PromotionCandidate,
} from "@/lib/engine-milestone-promotion.functions";

export const Route = createFileRoute("/admin/engine-promotion")({
  component: EnginePromotionPage,
});

type ApproveInputs = {
  engineId: string;
  reviewItemId: string;
  ownerEmail: string;
  approverEmail: string;
};

function EnginePromotionPage() {
  const listFn = useServerFn(listPromotionCandidates);
  const proposeFn = useServerFn(proposeEnginePromotion);
  const approveFn = useServerFn(approveEnginePromotion);
  const rejectFn = useServerFn(rejectEnginePromotion);
  const qc = useQueryClient();

  const [approveState, setApproveState] = useState<ApproveInputs>({
    engineId: "",
    reviewItemId: "",
    ownerEmail: "",
    approverEmail: "",
  });
  const [rejectState, setRejectState] = useState({
    engineId: "",
    reviewItemId: "",
    reason: "",
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "engine-promotion"],
    queryFn: () => listFn(),
  });

  const propose = useMutation({
    mutationFn: (c: PromotionCandidate) =>
      proposeFn({ data: { milestoneId: c.milestoneId, engineKind: "ops", cadence: "weekly" } }),
    onSuccess: (r) => {
      toast.success(
        `Draft engine ${r.engineId.slice(0, 8)} created. Review item ${r.reviewItemId.slice(0, 8)} pending.`,
      );
      qc.invalidateQueries({ queryKey: ["admin", "engine-promotion"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const approve = useMutation({
    mutationFn: (input: ApproveInputs) => approveFn({ data: input }),
    onSuccess: () => {
      toast.success("Engine activated.");
      setApproveState({ engineId: "", reviewItemId: "", ownerEmail: "", approverEmail: "" });
      qc.invalidateQueries({ queryKey: ["admin", "engine-promotion"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reject = useMutation({
    mutationFn: (input: { engineId: string; reviewItemId: string; reason: string }) =>
      rejectFn({ data: input }),
    onSuccess: () => {
      toast.success("Promotion rejected.");
      setRejectState({ engineId: "", reviewItemId: "", reason: "" });
      qc.invalidateQueries({ queryKey: ["admin", "engine-promotion"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <div className="p-8 text-white/70">Loading candidates…</div>;
  if (error) return <div className="p-8 text-red-300">Error: {(error as Error).message}</div>;
  if (!data) return <div className="p-8 text-white/60">No data.</div>;

  const pending = data.candidates.filter((c) => !c.alreadyPromoted);
  const promoted = data.candidates.filter((c) => c.alreadyPromoted);

  return (
    <div className="space-y-8 p-4 lg:p-8">
      <div>
        <h1 className="text-2xl font-semibold text-white">Milestone → Engine Promotion</h1>
        <p className="mt-2 max-w-3xl text-sm text-white/60">
          Completed operational milestones can graduate into ongoing business engines only after a
          separate approver activates them. Every step is written to{" "}
          <code className="text-white/80">engine_audit_log</code>. Self-approval is blocked here and
          at the database layer.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-white/10 bg-white/[0.04] text-white shadow-none">
          <CardHeader className="pb-3">
            <CardDescription className="text-white/60">Eligible milestones</CardDescription>
            <CardTitle className="text-3xl">{data.candidates.length}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-sm text-white/50">
            Approved + complete + operational phase.
          </CardContent>
        </Card>
        <Card className="border-white/10 bg-white/[0.04] text-white shadow-none">
          <CardHeader className="pb-3">
            <CardDescription className="text-white/60">Pending promotion</CardDescription>
            <CardTitle className="text-3xl">{pending.length}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-sm text-white/50">Not yet turned into engines.</CardContent>
        </Card>
        <Card className="border-white/10 bg-white/[0.04] text-white shadow-none">
          <CardHeader className="pb-3">
            <CardDescription className="text-white/60">Already promoted</CardDescription>
            <CardTitle className="text-3xl">{promoted.length}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-sm text-white/50">
            Engines exist and are draft, pending, or active.
          </CardContent>
        </Card>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">Candidates</h2>
        {data.candidates.length === 0 ? (
          <div className="rounded border border-white/10 bg-white/[0.02] p-6 text-sm text-white/60">
            No eligible milestones yet.
          </div>
        ) : (
          <div className="overflow-x-auto rounded border border-white/10 bg-white/[0.02]">
            <Table>
              <TableHeader>
                <TableRow className="border-white/10 hover:bg-transparent">
                  <TableHead className="text-white/60">Milestone</TableHead>
                  <TableHead className="text-white/60">Project</TableHead>
                  <TableHead className="text-white/60">Phase</TableHead>
                  <TableHead className="text-white/60">Approved</TableHead>
                  <TableHead className="text-white/60">State</TableHead>
                  <TableHead className="text-white/60">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.candidates.map((c) => (
                  <TableRow key={c.milestoneId} className="border-white/10">
                    <TableCell className="font-medium text-white">{c.milestoneName}</TableCell>
                    <TableCell className="text-white/70">{c.projectName}</TableCell>
                    <TableCell className="text-white/60">{c.phase ?? "—"}</TableCell>
                    <TableCell className="text-sm text-white/60">
                      {c.approvedAt ? new Date(c.approvedAt).toLocaleDateString() : "—"}
                      <div className="text-xs text-white/40">{c.approvedBy ?? ""}</div>
                    </TableCell>
                    <TableCell>
                      {c.alreadyPromoted ? (
                        <Badge className="border-emerald-400/30 bg-emerald-500/10 text-emerald-200">
                          {c.existingEngineStatus ?? "promoted"}
                        </Badge>
                      ) : (
                        <Badge className="border-amber-400/30 bg-amber-500/10 text-amber-200">
                          pending
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {c.alreadyPromoted ? (
                        <span className="text-xs text-white/40 font-mono">
                          {c.existingEngineId?.slice(0, 8)}…
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={propose.isPending}
                          onClick={() => propose.mutate(c)}
                        >
                          Propose promotion
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded border border-white/10 bg-white/[0.02] p-4">
          <h3 className="mb-3 text-sm font-semibold text-white">Approve promotion (activate)</h3>
          <p className="mb-3 text-xs text-white/50">
            Owner email is who runs the engine. Approver must differ from the proposer.
          </p>
          <div className="space-y-2">
            <input
              className="w-full rounded border border-white/10 bg-transparent px-3 py-2 text-sm text-white outline-none focus:border-white/30"
              placeholder="Engine ID"
              value={approveState.engineId}
              onChange={(e) => setApproveState({ ...approveState, engineId: e.target.value })}
            />
            <input
              className="w-full rounded border border-white/10 bg-transparent px-3 py-2 text-sm text-white outline-none focus:border-white/30"
              placeholder="Review item ID"
              value={approveState.reviewItemId}
              onChange={(e) => setApproveState({ ...approveState, reviewItemId: e.target.value })}
            />
            <input
              className="w-full rounded border border-white/10 bg-transparent px-3 py-2 text-sm text-white outline-none focus:border-white/30"
              placeholder="Owner email"
              value={approveState.ownerEmail}
              onChange={(e) => setApproveState({ ...approveState, ownerEmail: e.target.value })}
            />
            <input
              className="w-full rounded border border-white/10 bg-transparent px-3 py-2 text-sm text-white outline-none focus:border-white/30"
              placeholder="Approver email (your signed-in email)"
              value={approveState.approverEmail}
              onChange={(e) =>
                setApproveState({ ...approveState, approverEmail: e.target.value })
              }
            />
            <Button
              disabled={
                approve.isPending ||
                !approveState.engineId ||
                !approveState.reviewItemId ||
                !approveState.ownerEmail ||
                !approveState.approverEmail
              }
              onClick={() => approve.mutate(approveState)}
            >
              {approve.isPending ? "Activating…" : "Approve & activate"}
            </Button>
          </div>
        </div>

        <div className="rounded border border-white/10 bg-white/[0.02] p-4">
          <h3 className="mb-3 text-sm font-semibold text-white">Reject promotion (archive draft)</h3>
          <p className="mb-3 text-xs text-white/50">
            Archives the draft engine and closes the review item. Reason is required and logged.
          </p>
          <div className="space-y-2">
            <input
              className="w-full rounded border border-white/10 bg-transparent px-3 py-2 text-sm text-white outline-none focus:border-white/30"
              placeholder="Engine ID"
              value={rejectState.engineId}
              onChange={(e) => setRejectState({ ...rejectState, engineId: e.target.value })}
            />
            <input
              className="w-full rounded border border-white/10 bg-transparent px-3 py-2 text-sm text-white outline-none focus:border-white/30"
              placeholder="Review item ID"
              value={rejectState.reviewItemId}
              onChange={(e) => setRejectState({ ...rejectState, reviewItemId: e.target.value })}
            />
            <textarea
              className="w-full rounded border border-white/10 bg-transparent px-3 py-2 text-sm text-white outline-none focus:border-white/30"
              rows={3}
              placeholder="Reason"
              value={rejectState.reason}
              onChange={(e) => setRejectState({ ...rejectState, reason: e.target.value })}
            />
            <Button
              variant="destructive"
              disabled={
                reject.isPending ||
                !rejectState.engineId ||
                !rejectState.reviewItemId ||
                rejectState.reason.length < 4
              }
              onClick={() => reject.mutate(rejectState)}
            >
              {reject.isPending ? "Rejecting…" : "Reject promotion"}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

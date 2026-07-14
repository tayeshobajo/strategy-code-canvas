import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useState } from "react";
// react-query not needed here; using local state.
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  scanFamilyImpactForReviews,
  scanAllFamilyImpact,
  type FamilyImpactScanResult,
} from "@/lib/engine-family-impact.functions";

export const Route = createFileRoute("/admin/family-impact")({
  component: FamilyImpactPage,
});

function FamilyImpactPage() {
  const scanFn = useServerFn(scanFamilyImpactForReviews);
  const scanAllFn = useServerFn(scanAllFamilyImpact);
  const [projectId, setProjectId] = useState("");
  const [result, setResult] = useState<FamilyImpactScanResult | null>(null);
  const [allResult, setAllResult] = useState<any>(null);

  const runDry = useMutation({
    mutationFn: () => scanFn({ data: { projectId, dryRun: true } }),
    onSuccess: (r) => {
      setResult(r);
      toast.success(`Dry-run: ${r.emitted.length} would emit, ${r.skipped.length} deduped.`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const runLive = useMutation({
    mutationFn: () => scanFn({ data: { projectId, dryRun: false } }),
    onSuccess: (r) => {
      setResult(r);
      toast.success(`Emitted ${r.emitted.length} review items.`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const runAll = useMutation({
    mutationFn: () => scanAllFn(),
    onSuccess: (r) => {
      setAllResult(r);
      toast.success(`Scanned ${r.families.length} families.`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Family Impact Automation</h1>
        <p className="text-sm text-muted-foreground">
          Scans a project's family tree for cross-project blockers (child not approved,
          stale roll-up, etc.) and emits governance review items so sibling impact stops
          being a read-only inspection. Idempotent by title on pending items.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Single-family scan</CardTitle>
          <CardDescription>Enter any project ID inside the family.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1 max-w-md">
            <Label>Project ID</Label>
            <Input value={projectId} onChange={(e) => setProjectId(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => runDry.mutate()}
              disabled={!projectId || runDry.isPending}
            >
              Dry run
            </Button>
            <Button
              onClick={() => runLive.mutate()}
              disabled={!projectId || runLive.isPending}
            >
              Emit review items
            </Button>
          </div>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle>Scan result — root {result.rootId.slice(0, 8)}</CardTitle>
            <CardDescription>
              {result.totalBlockers} blockers detected · {result.emitted.length} emitted ·{" "}
              {result.skipped.length} deduped
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {result.emitted.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-2">Emitted</h3>
                <ul className="space-y-1 text-sm">
                  {result.emitted.map((e, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <Badge className="bg-emerald-600 text-white">NEW</Badge>
                      <span>{e.title}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {result.skipped.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-2">Skipped (already pending)</h3>
                <ul className="space-y-1 text-sm">
                  {result.skipped.map((e, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <Badge variant="outline">DEDUP</Badge>
                      <span>{e.title}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Workspace-wide scan</CardTitle>
          <CardDescription>Runs every family root. Safe to run repeatedly.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => runAll.mutate()} disabled={runAll.isPending}>
            {runAll.isPending ? "Scanning…" : "Scan all families"}
          </Button>
          {allResult && (
            <pre className="mt-3 text-xs bg-muted p-3 rounded overflow-auto max-h-96">
              {JSON.stringify(allResult, null, 2)}
            </pre>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

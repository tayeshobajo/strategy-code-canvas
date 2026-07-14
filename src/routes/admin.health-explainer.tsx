import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { HealthExplainerPanel } from "@/components/HealthExplainerPanel";
import {
  explainProjectHealth,
  explainEngineHealth,
  type HealthExplanation,
} from "@/lib/engine-health-explainer.functions";

export const Route = createFileRoute("/admin/health-explainer")({
  component: HealthExplainerPage,
});

function HealthExplainerPage() {
  const projectFn = useServerFn(explainProjectHealth);
  const engineFn = useServerFn(explainEngineHealth);
  const [projectId, setProjectId] = useState("");
  const [engineId, setEngineId] = useState("");
  const [explanation, setExplanation] = useState<HealthExplanation | null>(null);

  const explainProject = useMutation({
    mutationFn: () => projectFn({ data: { projectId } }),
    onSuccess: (r) => setExplanation(r),
    onError: (e: Error) => toast.error(e.message),
  });
  const explainEngine = useMutation({
    mutationFn: () => engineFn({ data: { engineId } }),
    onSuccess: (r) => setExplanation(r),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Health Explainability</h1>
        <p className="text-sm text-muted-foreground">
          Every health verdict must be traceable. Enter a project or engine ID to see the
          ranked drivers behind its current status: open review items, engine exceptions,
          cost-pause state, family-impact blockers, and recent high-severity audit events.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Explain a project</CardTitle>
          <CardDescription>Ranks all open drivers for the project.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="max-w-md space-y-1">
            <Label>Project ID</Label>
            <Input value={projectId} onChange={(e) => setProjectId(e.target.value)} />
          </div>
          <Button
            onClick={() => explainProject.mutate()}
            disabled={!projectId || explainProject.isPending}
          >
            Explain project
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Explain a business engine</CardTitle>
          <CardDescription>Scoped to that engine's open exceptions.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="max-w-md space-y-1">
            <Label>Engine ID</Label>
            <Input value={engineId} onChange={(e) => setEngineId(e.target.value)} />
          </div>
          <Button
            onClick={() => explainEngine.mutate()}
            disabled={!engineId || explainEngine.isPending}
          >
            Explain engine
          </Button>
        </CardContent>
      </Card>

      {explanation && <HealthExplainerPanel explanation={explanation} />}
    </div>
  );
}

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { HealthExplanation, HealthSeverity } from "@/lib/engine-health-explainer.functions";

const SEVERITY_STYLE: Record<HealthSeverity, string> = {
  critical: "bg-red-600 text-white",
  high: "bg-orange-500 text-white",
  medium: "bg-amber-500 text-black",
  low: "bg-slate-400 text-black",
  info: "bg-slate-300 text-black",
};

const VERDICT_LABEL: Record<HealthExplanation["verdict"], string> = {
  healthy: "Healthy",
  at_risk: "At risk",
  blocked: "Blocked",
  unknown: "Unknown",
};

const VERDICT_STYLE: Record<HealthExplanation["verdict"], string> = {
  healthy: "bg-emerald-600 text-white",
  at_risk: "bg-amber-600 text-white",
  blocked: "bg-red-700 text-white",
  unknown: "bg-slate-500 text-white",
};

export function HealthExplainerPanel({ explanation }: { explanation: HealthExplanation }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2 flex-wrap">
          <CardTitle>Why this health verdict?</CardTitle>
          <Badge className={VERDICT_STYLE[explanation.verdict]}>
            {VERDICT_LABEL[explanation.verdict]}
          </Badge>
          <Badge variant="outline">score {explanation.score}</Badge>
          <Badge variant="outline">status {explanation.status}</Badge>
        </div>
        <CardDescription>
          {explanation.drivers.length === 0
            ? "No open drivers found. Verdict is based on absence of risk signals."
            : `${explanation.drivers.length} open driver(s), ranked by severity.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {explanation.drivers.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing to show.</p>
        ) : (
          <ul className="space-y-2">
            {explanation.drivers.map((d) => (
              <li key={d.id} className="flex items-start gap-2 text-sm">
                <Badge className={SEVERITY_STYLE[d.severity]}>{d.severity}</Badge>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{d.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {d.detail} · {new Date(d.createdAt).toLocaleString()}
                    {d.evidenceRef && (
                      <span className="ml-1 font-mono opacity-70">
                        [{d.evidenceRef.table}#{d.evidenceRef.id.slice(0, 8)}]
                      </span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

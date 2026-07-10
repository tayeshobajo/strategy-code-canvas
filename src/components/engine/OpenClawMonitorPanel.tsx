import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Activity, AlertTriangle, ShieldAlert, CheckCircle2, Loader2,
  Settings2, RefreshCw, PlayCircle, Bell,
} from "lucide-react";
import {
  getOpenClawMonitor,
  updateOpenClawMonitorSettings,
  runOpenClawMonitorTick,
  acknowledgeOpenClawMonitorEvent,
  type MonitorSnapshot,
  type OpenClawMonitorEvent,
  type MonitorSeverity,
} from "@/lib/engine-openclaw-monitor.functions";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const call = (fn: unknown, data: unknown) => (fn as any)({ data });

function sevTone(s: MonitorSeverity): string {
  if (s === "critical") return "bg-red-100 text-red-800 border-red-300";
  if (s === "warning") return "bg-amber-100 text-amber-800 border-amber-300";
  return "bg-neutral-100 text-neutral-700 border-neutral-300";
}

export function OpenClawMonitorPanel({
  projectId,
  isAdmin = false,
}: { projectId: string; isAdmin?: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["openclaw-monitor", projectId],
    queryFn: () => call(getOpenClawMonitor, { projectId }),
  });
  const snap = q.data as MonitorSnapshot | undefined;

  const [busy, setBusy] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const runTickFn = useServerFn(runOpenClawMonitorTick);
  const ackFn = useServerFn(acknowledgeOpenClawMonitorEvent);
  const updateSettingsFn = useServerFn(updateOpenClawMonitorSettings);

  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["openclaw-monitor", projectId] }),
      qc.invalidateQueries({ queryKey: ["openclaw-queues", projectId] }),
      qc.invalidateQueries({ queryKey: ["openclaw-queue", projectId] }),
      qc.invalidateQueries({ queryKey: ["openclaw-runs", projectId] }),
      qc.invalidateQueries({ queryKey: ["openclaw-status", projectId] }),
      qc.invalidateQueries({ queryKey: ["engine", "build-execution", projectId] }),
      qc.invalidateQueries({ queryKey: ["engine", "build-packet", projectId] }),
      qc.invalidateQueries({ queryKey: ["engine", "build-packets", projectId] }),
      qc.invalidateQueries({ queryKey: ["engine", "build-evidence", projectId] }),
    ]);
    await qc.refetchQueries({ queryKey: ["openclaw-monitor", projectId] });
  };

  const runIt = async (label: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(label);
    try { await fn(); toast.success(ok); await refresh(); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(null); }
  };

  if (q.isLoading) {
    return (
      <section className="rounded-lg border border-neutral-200 bg-white p-4">
        <div className="flex items-center gap-2 text-sm text-neutral-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading monitor…
        </div>
      </section>
    );
  }
  if (q.isError || !snap) {
    return (
      <section className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        Failed to load OpenClaw monitor: {(q.error as Error | undefined)?.message ?? "unknown error"}
      </section>
    );
  }

  const s = snap.settings;
  const c = snap.counts;

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-4 space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-royal" />
          <h2 className="text-base font-semibold">OpenClaw Background Monitor · v4</h2>
          <span className={`text-xs rounded-full px-2 py-0.5 border ${s.enabled ? "bg-emerald-50 text-emerald-700 border-emerald-300" : "bg-neutral-100 text-neutral-600 border-neutral-300"}`}>
            {s.enabled ? "Enabled" : "Disabled"}
          </span>
          <span className="text-xs text-neutral-500">
            last tick: {snap.latest_tick_at ? new Date(snap.latest_tick_at).toLocaleString() : "never"}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => runIt("tick", () => runTickFn({ data: { projectId } }), "Monitor tick complete.")}
            className="inline-flex items-center gap-1.5 rounded border border-neutral-300 bg-white px-3 py-1.5 text-sm hover:bg-neutral-50 disabled:opacity-50"
          >
            <PlayCircle className="h-4 w-4" /> Run Monitor Tick Now
          </button>
          <button
            type="button"
            onClick={refresh}
            className="inline-flex items-center gap-1.5 rounded border border-neutral-300 bg-white px-3 py-1.5 text-sm hover:bg-neutral-50"
          >
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
          {isAdmin ? (
            <button
              type="button"
              onClick={() => setShowSettings((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded border border-neutral-300 bg-white px-3 py-1.5 text-sm hover:bg-neutral-50"
            >
              <Settings2 className="h-4 w-4" /> Settings
            </button>
          ) : null}
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2 text-xs">
        <MonitorCounter label="Critical" value={c.critical_unack} tone="critical" />
        <MonitorCounter label="Warning" value={c.warning_unack} tone="warning" />
        <MonitorCounter label="Info" value={c.info_unack} tone="info" />
        <MonitorCounter label="Stale runs" value={c.stale_runs} tone="warning" />
        <MonitorCounter label="Timed out" value={c.timed_out_runs} tone="critical" />
        <MonitorCounter label="Failed runs" value={c.failed_runs} tone="critical" />
        <MonitorCounter label="Queues attn." value={c.queues_needing_attention} tone="warning" />
        <MonitorCounter label="Awaiting QA" value={c.packets_awaiting_qa} tone="info" />
      </div>

      {isAdmin && showSettings ? (
        <SettingsForm
          initial={s}
          onSave={async (patch) => {
            await runIt("settings", () => updateSettingsFn({ data: { projectId, ...patch } }), "Monitor settings saved.");
            setShowSettings(false);
          }}
        />
      ) : null}

      <div>
        <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
          <Bell className="h-4 w-4" /> Unacknowledged events ({snap.events_unacknowledged.length})
        </h3>
        {snap.events_unacknowledged.length === 0 ? (
          <p className="text-sm text-neutral-500 flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" /> No unacknowledged monitor events.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {snap.events_unacknowledged.slice(0, 25).map((e) => (
              <EventRow
                key={e.id}
                event={e}
                busy={busy === `ack-${e.id}`}
                onAck={() => runIt(`ack-${e.id}`, () => ackFn({ data: { projectId, eventId: e.id } }), "Event acknowledged.")}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function MonitorCounter({ label, value, tone }: { label: string; value: number; tone: MonitorSeverity }) {
  const cls = value > 0 ? sevTone(tone) : "bg-neutral-50 text-neutral-500 border-neutral-200";
  return (
    <div className={`rounded border px-2 py-2 ${cls}`}>
      <div className="text-lg font-semibold leading-none">{value}</div>
      <div className="mt-1 text-[11px] uppercase tracking-wide opacity-80">{label}</div>
    </div>
  );
}

function EventRow({
  event, busy, onAck,
}: { event: OpenClawMonitorEvent; busy: boolean; onAck: () => void }) {
  const icon =
    event.severity === "critical" ? <ShieldAlert className="h-4 w-4 text-red-600" /> :
    event.severity === "warning" ? <AlertTriangle className="h-4 w-4 text-amber-600" /> :
    <Activity className="h-4 w-4 text-neutral-500" />;
  return (
    <li className={`rounded border px-3 py-2 flex items-start gap-2 ${sevTone(event.severity)}`}>
      <div className="pt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-mono uppercase tracking-wide opacity-70">{event.event_type}</div>
        <div className="text-sm">{event.summary}</div>
        <div className="text-[11px] opacity-70 mt-0.5">
          {new Date(event.created_at).toLocaleString()}
        </div>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={onAck}
        className="text-xs rounded border border-white/70 bg-white/60 px-2 py-1 hover:bg-white disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : "Acknowledge"}
      </button>
    </li>
  );
}

function SettingsForm({
  initial, onSave,
}: {
  initial: MonitorSnapshot["settings"];
  onSave: (patch: Partial<MonitorSnapshot["settings"]>) => Promise<void>;
}) {
  const [f, setF] = useState({
    enabled: initial.enabled,
    stale_run_minutes: initial.stale_run_minutes,
    timeout_minutes: initial.timeout_minutes,
    notify_on_failure: initial.notify_on_failure,
    notify_on_timeout: initial.notify_on_timeout,
    notify_on_stale: initial.notify_on_stale,
    allow_auto_refresh: initial.allow_auto_refresh,
    allow_auto_run_next: initial.allow_auto_run_next,
  });
  return (
    <div className="rounded border border-royal/30 bg-royal/5 p-3 space-y-3 text-sm">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <Toggle label="Monitoring enabled" v={f.enabled} on={(v) => setF({ ...f, enabled: v })} />
        <Toggle label="Auto-refresh (mark timed_out)" v={f.allow_auto_refresh} on={(v) => setF({ ...f, allow_auto_refresh: v })} />
        <Toggle label="Notify on failure" v={f.notify_on_failure} on={(v) => setF({ ...f, notify_on_failure: v })} />
        <Toggle label="Notify on timeout" v={f.notify_on_timeout} on={(v) => setF({ ...f, notify_on_timeout: v })} />
        <Toggle label="Notify on stale" v={f.notify_on_stale} on={(v) => setF({ ...f, notify_on_stale: v })} />
        <Toggle
          label={<span>Allow auto-run-next <span className="text-red-600 text-xs">(never accepts/delivers)</span></span>}
          v={f.allow_auto_run_next}
          on={(v) => setF({ ...f, allow_auto_run_next: v })}
        />
        <NumberField label="Stale run minutes" v={f.stale_run_minutes} on={(v) => setF({ ...f, stale_run_minutes: v })} />
        <NumberField label="Timeout minutes" v={f.timeout_minutes} on={(v) => setF({ ...f, timeout_minutes: v })} />
      </div>
      <p className="text-xs text-neutral-600">
        Even with auto-run-next enabled, background monitoring will still refuse
        to advance the queue — it only records that policy on the project. Every
        run must still be started from the Queue Controls; accepts, QA passes,
        deliveries, and portal publishes are always manual.
      </p>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => void onSave(f)}
          className="rounded bg-royal px-3 py-1.5 text-sm text-white hover:bg-royal/90"
        >
          Save settings
        </button>
      </div>
    </div>
  );
}

function Toggle({ label, v, on }: { label: React.ReactNode; v: boolean; on: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2">
      <input type="checkbox" checked={v} onChange={(e) => on(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}
function NumberField({ label, v, on }: { label: string; v: number; on: (v: number) => void }) {
  return (
    <label className="flex items-center justify-between gap-2">
      <span>{label}</span>
      <input
        type="number"
        min={1}
        max={1440}
        value={v}
        onChange={(e) => on(Math.max(1, Math.min(1440, Number(e.target.value) || 1)))}
        className="w-20 rounded border border-neutral-300 px-2 py-1 text-right"
      />
    </label>
  );
}

import { getDnaProfile } from '@/lib/queries'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const supabase = createClient()
  const dna = await getDnaProfile()
  const { data: settings } = await supabase
    .from('settings')
    .select('scraper_interval_minutes, api_search_interval_minutes, auto_followup_hours, daily_brief_time, daily_brief_timezone')
    .eq('id', 1)
    .maybeSingle()
  const scraperIntervalMinutes = settings?.scraper_interval_minutes ?? 30
  const apiSearchIntervalMinutes = settings?.api_search_interval_minutes ?? 30
  const autoFollowupHours = settings?.auto_followup_hours ?? 72
  const dailyBriefTime = settings?.daily_brief_time ?? '07:00'
  const dailyBriefTimezone = settings?.daily_brief_timezone ?? 'America/Chicago'

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <p className="mono-label mb-2">Control Room</p>
        <h1 className="display text-3xl md:text-4xl">Settings</h1>
        <p className="text-sm text-[#596475] mt-1.5">System configuration and integration status.</p>
      </div>

      {/* Scoring Thresholds — read-only snapshot */}
      <div className="tt-card bg-[#FCFAF6] p-6">
        <div className="mb-1">
          <p className="mono-label">Scoring</p>
          <h2 className="text-sm font-semibold mt-1">Thresholds</h2>
        </div>
        <p className="text-xs text-[#596475] mb-4">Current scoring values pulled from your DNA profile. Edit via the Supabase dashboard or CLI.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ReadOnlyField label="Min Hourly Rate" value={`$${dna?.min_hourly_rate ?? 50}/hr`} />
          <ReadOnlyField label="Min Fixed Amount" value={`$${(dna?.min_fixed_amount ?? 2500).toLocaleString()}`} />
          <ReadOnlyField label="Min Client Spend" value={`$${(dna?.min_client_spend ?? 5000).toLocaleString()}`} />
          <ReadOnlyField label="Min Client Hire Rate" value={`${dna?.min_client_hire_rate ?? 30}%`} />
          <ReadOnlyField label="Min Client Rating" value={`★ ${dna?.min_client_rating ?? 4.0}`} />
          <ReadOnlyField label="Max Proposals Count" value={`${dna?.max_proposals_count ?? 50}`} />
        </div>
      </div>

      {/* Automation — read-only */}
      <div className="tt-card bg-[#FCFAF6] p-6">
        <div className="mb-1">
          <p className="mono-label">Automation</p>
          <h2 className="text-sm font-semibold mt-1">Workflows</h2>
        </div>
        <p className="text-xs text-[#596475] mb-4">Automation state is managed by the server scraper and cron jobs. Toggle via environment config.</p>
        <div className="space-y-3">
          <WorkflowStatus label="Best Matches Scraper" description={`Polls Upwork Best Matches every ${scraperIntervalMinutes} min`} active />
          <WorkflowStatus label="API Job Search" description={`DNA-match search every ${apiSearchIntervalMinutes} min`} active />
          <WorkflowStatus label="Auto-Draft Proposals" description="Generates AI drafts for approved jobs" active />
          <WorkflowStatus label="Auto Follow-up" description={`Follow-up on viewed-unresponded proposals after ${autoFollowupHours}h`} active={false} />
          <WorkflowStatus label="Daily Brief" description={`Pipeline summary at ${dailyBriefTime} ${dailyBriefTimezone}`} active />
        </div>
      </div>

      {/* Team */}
      <div className="tt-card bg-[#FCFAF6] p-6">
        <div className="mb-4">
          <p className="mono-label">People</p>
          <h2 className="text-sm font-semibold mt-1">Team Members</h2>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between py-2 border-b border-[#DADEE5]/60">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#01051B] text-xs font-bold text-[#FCFAF6]">TS</div>
              <div>
                <p className="text-sm font-medium text-[#01051B]">Tai Shobajo</p>
                <p className="text-xs text-[#596475]">tai@trusttai.com</p>
              </div>
            </div>
            <span className="mono-label text-[#1D54C1]">Admin</span>
          </div>
        </div>
      </div>

      {/* API Status */}
      <div className="tt-card bg-[#FCFAF6] p-6">
        <div className="mb-4">
          <p className="mono-label">Integrations</p>
          <h2 className="text-sm font-semibold mt-1">Upwork API</h2>
        </div>
        <div className="space-y-3 text-sm">
          <StatusRow label="Status" value="Connected" valueClass="text-[#1F6B3B]" dot="bg-[#1F6B3B]" />
          <StatusRow label="User ID" value="1054354077546004480" mono />
          <StatusRow label="Token Refresh" value="Every 12h (LaunchAgent)" />
          <StatusRow label="Contracts Synced" value={String(dna?.total_contracts_analyzed ?? 284)} mono />
        </div>
      </div>
    </div>
  )
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-[#DADEE5]/70 bg-white px-3.5 py-2.5">
      <span className="text-xs text-[#596475]">{label}</span>
      <span className="text-xs font-medium font-mono text-[#01051B]">{value}</span>
    </div>
  )
}

function WorkflowStatus({ label, description, active }: { label: string; description: string; active: boolean }) {
  return (
    <div className="flex items-start gap-4 justify-between py-2.5 border-b border-[#DADEE5]/40 last:border-0">
      <div className="flex items-start gap-2.5">
        <span className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${active ? 'bg-[#1F6B3B]' : 'bg-[#DADEE5]'}`} />
        <div>
          <p className="text-sm font-medium text-[#01051B]">{label}</p>
          <p className="text-xs text-[#596475] mt-0.5">{description}</p>
        </div>
      </div>
      <span className={`text-[10px] font-mono font-semibold uppercase tracking-wide whitespace-nowrap mt-0.5 ${
        active ? 'text-[#1F6B3B]' : 'text-[#596475]'
      }`}>
        {active ? 'Active' : 'Off'}
      </span>
    </div>
  )
}

function StatusRow({ label, value, valueClass, dot, mono }: { label: string; value: string; valueClass?: string; dot?: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[#596475]">{label}</span>
      <span className={`flex items-center gap-2 ${valueClass || ''} ${mono ? 'font-mono text-xs text-[#01051B]' : ''}`}>
        {dot && <span className={`w-2 h-2 rounded-full ${dot}`} />}
        {value}
      </span>
    </div>
  )
}

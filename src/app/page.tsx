import { getDashboardStats, getRecentJobs, getTopContracts } from '@/lib/queries'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const [stats, recentJobs, topContracts] = await Promise.all([
    getDashboardStats(),
    getRecentJobs(8),
    getTopContracts(5),
  ])

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <p className="mono-label mb-2">Pipeline</p>
        <h1 className="display text-3xl md:text-4xl">Dashboard</h1>
        <p className="text-[#596475] text-sm mt-1.5">Live overview of your Upwork intelligence system.</p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <StatCard label="New Jobs" value={stats.jobsNew} signal />
        <StatCard label="Approved" value={stats.jobsApproved} signal={stats.jobsApproved > 0} />
        <StatCard label="Rejected" value={stats.jobsRejected} />
        <StatCard label="Drafts" value={stats.proposalsDraft} />
        <StatCard label="Submitted" value={stats.proposalsSubmitted} signal={stats.proposalsSubmitted > 0} />
        <StatCard label="Viewed" value={stats.proposalsViewed} />
        <StatCard label="Hired" value={stats.proposalsHired} signal={stats.proposalsHired > 0} />
      </div>

      {/* Two columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Jobs */}
        <div className="tt-card overflow-hidden">
          <div className="px-5 py-4 border-b border-[#DADEE5]">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold">Recent Jobs</h2>
              <a href="/jobs" className="shrink-0 text-xs text-[#1D54C1] hover:underline">View all →</a>
            </div>
          </div>
          <div className="divide-y divide-[#DADEE5]/60">
            {recentJobs.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <p className="text-sm text-[#596475]">No jobs ingested yet.</p>
                <p className="mono-label mt-1">Run the scraper to populate</p>
              </div>
            ) : (
              recentJobs.map((job: any) => (
                <a key={job.id} href={`/jobs/${job.id}`} className="block px-5 py-3 hover:bg-[#EDF2F8]/50 transition-colors group">
                  <div className="flex items-start justify-between gap-3 sm:gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium text-[#01051B] group-hover:text-[#1D54C1] line-clamp-1 transition-colors">{job.title}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 sm:gap-3">
                        {job.budget_type === 'hourly' && job.budget_max && (
                          <span className="text-xs text-[#596475]">${job.budget_min || 0}–${job.budget_max}/hr</span>
                        )}
                        {job.budget_type === 'fixed' && job.budget_max && (
                          <span className="text-xs text-[#596475]">${job.budget_max.toLocaleString()} fixed</span>
                        )}
                        {job.client_total_spent >= 10000 && (
                          <span className="mono-label text-[#1F6B3B]">${(job.client_total_spent / 1000).toFixed(0)}K spent</span>
                        )}
                        {job.client_payment_verified && (
                          <span className="mono-label text-[#1F6B3B]">Verified</span>
                        )}
                        {job.source === 'best_matches' && (
                          <span className="mono-label text-[#1D54C1]">Best Match</span>
                        )}
                      </div>
                    </div>
                    <ScoreBadge score={job.combined_score} />
                  </div>
                </a>
              ))
            )}
          </div>
        </div>

        {/* Top Contracts */}
        <div className="tt-card overflow-hidden">
          <div className="px-5 py-4 border-b border-[#DADEE5]">
            <h2 className="text-sm font-semibold">Top Fixed-Price Contracts</h2>
            <p className="mono-label mt-0.5">DNA Source Data</p>
          </div>
          <div className="divide-y divide-[#DADEE5]/60">
            {topContracts.fixed.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <p className="text-sm text-[#596475]">No fixed-price contracts synced yet.</p>
                <p className="mono-label mt-1">Sync contracts from the History page</p>
              </div>
            ) : (
              topContracts.fixed.map((c: any, i: number) => (
                <div key={i} className="px-5 py-3">
                  <div className="flex items-start justify-between gap-3 sm:gap-4">
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-[#01051B] line-clamp-1">{c.title}</p>
                      <p className="text-xs text-[#596475] mt-0.5">{c.client_name}</p>
                    </div>
                    <span className="text-sm font-semibold text-[#1F6B3B] whitespace-nowrap font-mono">
                      ${c.fixed_amount?.toLocaleString()}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Top hourly */}
      <div className="tt-card overflow-hidden">
        <div className="px-5 py-4 border-b border-[#DADEE5]">
          <h2 className="text-sm font-semibold">Top Hourly Contracts</h2>
          <p className="mono-label mt-0.5">DNA Source Data</p>
        </div>
        {topContracts.hourly.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <p className="text-sm text-[#596475]">No hourly contracts synced yet.</p>
            <p className="mono-label mt-1">Sync contracts from the History page</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-[#DADEE5]/60">
            {topContracts.hourly.map((c: any, i: number) => (
              <div key={i} className="bg-white px-5 py-3">
                <p className="text-[13px] font-medium line-clamp-1">{c.title}</p>
                <div className="mt-1 flex items-center justify-between gap-3">
                  <p className="text-xs text-[#596475]">{c.client_name}</p>
                  <span className="text-sm font-semibold text-[#1D54C1] font-mono">${c.hourly_rate}/hr</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({ label, value, signal }: { label: string; value: number; signal?: boolean }) {
  return (
    <div className="tt-card-tight px-4 py-3">
      <p className="mono-label">{label}</p>
      <p className={`text-2xl font-semibold mt-1 font-mono ${signal ? 'text-[#1D54C1]' : 'text-[#01051B]'}`}>{value}</p>
    </div>
  )
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score == null) return null
  const color = score >= 70 ? 'text-[#1F6B3B] bg-[#1F6B3B]/8' : score >= 40 ? 'text-[#A46815] bg-[#A46815]/8' : 'text-[#596475] bg-[#596475]/8'
  return (
    <span className={`text-xs font-mono font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${color}`}>
      {score}
    </span>
  )
}

export default function Loading() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <div className="h-3 w-16 rounded bg-[#DADEE5] animate-pulse" />
        <div className="h-8 w-48 rounded bg-[#DADEE5] animate-pulse" />
        <div className="h-3 w-64 rounded bg-[#DADEE5] animate-pulse" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="tt-card-tight px-4 py-3 space-y-2">
            <div className="h-2.5 w-12 rounded bg-[#DADEE5] animate-pulse" />
            <div className="h-7 w-10 rounded bg-[#DADEE5] animate-pulse" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SkeletonCard rows={6} />
        <SkeletonCard rows={5} />
      </div>
    </div>
  )
}

function SkeletonCard({ rows }: { rows: number }) {
  return (
    <div className="tt-card overflow-hidden">
      <div className="px-5 py-4 border-b border-[#DADEE5]">
        <div className="h-4 w-32 rounded bg-[#DADEE5] animate-pulse" />
      </div>
      <div className="divide-y divide-[#DADEE5]/60">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="px-5 py-3 space-y-1.5">
            <div className="h-3.5 w-3/4 rounded bg-[#DADEE5] animate-pulse" />
            <div className="h-3 w-1/2 rounded bg-[#EDF2F8] animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  )
}

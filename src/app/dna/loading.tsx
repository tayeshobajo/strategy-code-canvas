export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="h-3 w-14 rounded bg-[#DADEE5] animate-pulse" />
        <div className="h-9 w-28 rounded bg-[#DADEE5] animate-pulse" />
        <div className="h-3 w-52 rounded bg-[#DADEE5] animate-pulse" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="tt-card-tight p-4 space-y-2">
            <div className="h-2.5 w-16 rounded bg-[#DADEE5] animate-pulse" />
            <div className="h-6 w-20 rounded bg-[#DADEE5] animate-pulse" />
          </div>
        ))}
      </div>
      <div className="tt-card overflow-hidden">
        <div className="border-b border-[#DADEE5] px-5 py-4">
          <div className="h-4 w-40 rounded bg-[#DADEE5] animate-pulse" />
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="px-5 py-3 border-b border-[#DADEE5]/60 flex justify-between">
            <div className="h-3.5 w-2/3 rounded bg-[#DADEE5] animate-pulse" />
            <div className="h-3.5 w-16 rounded bg-[#DADEE5] animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  )
}

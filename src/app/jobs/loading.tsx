export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <div className="h-3 w-14 rounded bg-[#DADEE5] animate-pulse" />
          <div className="h-9 w-32 rounded bg-[#DADEE5] animate-pulse" />
          <div className="h-3 w-56 rounded bg-[#DADEE5] animate-pulse" />
        </div>
        <div className="h-9 w-72 rounded-lg bg-[#DADEE5] animate-pulse" />
      </div>
      <div className="tt-card p-4">
        <div className="flex flex-col gap-3 lg:flex-row">
          <div className="flex-1 h-9 rounded-lg bg-[#DADEE5] animate-pulse" />
          <div className="grid grid-cols-3 gap-3 lg:w-64">
            <div className="h-9 rounded-lg bg-[#DADEE5] animate-pulse" />
            <div className="h-9 rounded-lg bg-[#DADEE5] animate-pulse" />
            <div className="h-9 rounded-lg bg-[#DADEE5] animate-pulse" />
          </div>
        </div>
      </div>
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="tt-card p-5">
            <div className="flex gap-4">
              <div className="flex-1 space-y-2">
                <div className="h-4 w-2/3 rounded bg-[#DADEE5] animate-pulse" />
                <div className="h-3 w-1/2 rounded bg-[#EDF2F8] animate-pulse" />
                <div className="flex gap-1.5 mt-2">
                  {Array.from({ length: 4 }).map((_, j) => (
                    <div key={j} className="h-5 w-14 rounded bg-[#EDF2F8] animate-pulse" />
                  ))}
                </div>
              </div>
              <div className="w-11 h-11 rounded-lg bg-[#DADEE5] animate-pulse shrink-0" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

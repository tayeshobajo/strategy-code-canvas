export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="h-3 w-24 rounded bg-[#DADEE5] animate-pulse" />
      <div className="space-y-2">
        <div className="flex gap-2">
          <div className="h-5 w-20 rounded-full bg-[#DADEE5] animate-pulse" />
          <div className="h-5 w-16 rounded-full bg-[#DADEE5] animate-pulse" />
        </div>
        <div className="h-8 w-3/4 rounded bg-[#DADEE5] animate-pulse" />
        <div className="h-3 w-24 rounded bg-[#DADEE5] animate-pulse" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="tt-card-tight p-4 text-center space-y-2">
            <div className="h-2.5 w-12 mx-auto rounded bg-[#DADEE5] animate-pulse" />
            <div className="h-7 w-10 mx-auto rounded bg-[#DADEE5] animate-pulse" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="tt-card p-5 h-20 animate-pulse bg-[#FCFAF6]" />
          <div className="tt-card p-5">
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-16 rounded-xl bg-[#DADEE5] animate-pulse" />
              ))}
            </div>
          </div>
          <div className="tt-card p-5 h-80 animate-pulse bg-[#FCFAF6]" />
        </div>
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="tt-card p-5 space-y-3">
              <div className="h-4 w-16 rounded bg-[#DADEE5] animate-pulse" />
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="flex justify-between">
                  <div className="h-3 w-20 rounded bg-[#EDF2F8] animate-pulse" />
                  <div className="h-3 w-16 rounded bg-[#DADEE5] animate-pulse" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

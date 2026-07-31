export default function Loading() {
  return (
    <div className="space-y-8 max-w-3xl">
      <div className="space-y-2">
        <div className="h-3 w-20 rounded bg-[#DADEE5] animate-pulse" />
        <div className="h-9 w-32 rounded bg-[#DADEE5] animate-pulse" />
        <div className="h-3 w-48 rounded bg-[#DADEE5] animate-pulse" />
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="tt-card p-6 space-y-4">
          <div className="h-4 w-32 rounded bg-[#DADEE5] animate-pulse" />
          <div className="grid grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, j) => (
              <div key={j} className="space-y-1.5">
                <div className="h-2.5 w-28 rounded bg-[#EDF2F8] animate-pulse" />
                <div className="h-9 rounded-lg bg-[#DADEE5] animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

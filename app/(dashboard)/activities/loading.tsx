export default function ActivitiesLoading() {
  return (
    <div className="flex flex-col gap-6 p-6 animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="h-8 w-40 rounded-lg bg-white/10" />
        <div className="h-9 w-36 rounded-lg bg-white/10" />
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-8 w-20 rounded-full bg-white/10" />
        ))}
      </div>

      {/* Activity template cards */}
      <div className="flex flex-col gap-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="flex items-center gap-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
            <div className="h-10 w-10 rounded-xl bg-white/10 shrink-0" />
            <div className="flex flex-col gap-1.5 flex-1">
              <div className="h-4 w-36 rounded bg-white/10" />
              <div className="h-3 w-24 rounded bg-white/10" />
            </div>
            <div className="h-7 w-7 rounded-lg bg-white/10" />
          </div>
        ))}
      </div>
    </div>
  )
}

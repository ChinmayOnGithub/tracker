export default function LeaveLoading() {
  return (
    <div className="flex flex-col gap-6 p-6 animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="h-8 w-36 rounded-lg bg-white/10" />
        <div className="h-9 w-32 rounded-lg bg-white/10" />
      </div>

      {/* Allowance cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-2xl border border-white/10 bg-white/5 p-4 flex flex-col gap-2">
            <div className="h-4 w-20 rounded bg-white/10" />
            <div className="h-6 w-12 rounded bg-white/10" />
            <div className="h-2 w-full rounded-full bg-white/10 mt-1">
              <div className="h-2 w-1/3 rounded-full bg-white/20" />
            </div>
          </div>
        ))}
      </div>

      {/* Leave records list */}
      <div className="flex flex-col gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3">
            <div className="flex flex-col gap-1">
              <div className="h-4 w-24 rounded bg-white/10" />
              <div className="h-3 w-32 rounded bg-white/10" />
            </div>
            <div className="h-6 w-20 rounded-full bg-white/10" />
          </div>
        ))}
      </div>
    </div>
  )
}

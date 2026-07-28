export default function WeightLoading() {
  return (
    <div className="flex flex-col gap-6 p-6 animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="h-8 w-36 rounded-lg bg-white/10" />
        <div className="h-9 w-28 rounded-lg bg-white/10" />
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-2xl border border-white/10 bg-white/5 p-4 flex flex-col gap-2">
            <div className="h-4 w-20 rounded bg-white/10" />
            <div className="h-7 w-16 rounded bg-white/10" />
          </div>
        ))}
      </div>

      {/* Chart area */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5 h-64" />

      {/* Recent entries */}
      <div className="flex flex-col gap-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3">
            <div className="h-4 w-24 rounded bg-white/10" />
            <div className="h-5 w-16 rounded bg-white/10" />
          </div>
        ))}
      </div>
    </div>
  )
}

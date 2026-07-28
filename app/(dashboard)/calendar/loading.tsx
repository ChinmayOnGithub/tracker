export default function CalendarLoading() {
  return (
    <div className="flex flex-col gap-4 p-6 animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="h-8 w-36 rounded-lg bg-white/10" />
        <div className="flex gap-2">
          <div className="h-9 w-9 rounded-lg bg-white/10" />
          <div className="h-9 w-28 rounded-lg bg-white/10" />
          <div className="h-9 w-9 rounded-lg bg-white/10" />
        </div>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 gap-2">
        {['S','M','T','W','T','F','S'].map((_d, i) => (
          <div key={i} className="h-6 rounded bg-white/10" />
        ))}
      </div>

      {/* Calendar grid */}
      {[0, 1, 2, 3, 4].map((row) => (
        <div key={row} className="grid grid-cols-7 gap-2">
          {Array.from({ length: 7 }).map((_, col) => (
            <div key={col} className="h-20 rounded-xl bg-white/5 border border-white/10" />
          ))}
        </div>
      ))}
    </div>
  )
}

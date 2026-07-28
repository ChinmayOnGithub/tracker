export default function JournalLoading() {
  return (
    <div className="flex flex-col gap-6 p-6 animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="h-8 w-40 rounded-lg bg-white/10" />
        <div className="h-9 w-32 rounded-lg bg-white/10" />
      </div>

      {/* Entry cards */}
      {[1, 2, 3].map((i) => (
        <div key={i} className="rounded-2xl border border-white/10 bg-white/5 p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="h-5 w-28 rounded bg-white/10" />
            <div className="h-5 w-16 rounded-full bg-white/10" />
          </div>
          <div className="h-4 w-full rounded bg-white/10" />
          <div className="h-4 w-5/6 rounded bg-white/10" />
          <div className="h-4 w-3/4 rounded bg-white/10" />
        </div>
      ))}
    </div>
  )
}

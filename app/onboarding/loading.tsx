export default function OnboardingLoading() {
  return (
    <main className="h-[100svh] overflow-hidden bg-[#f8f8fa] text-slate-950">
      <div className="mx-auto flex h-full w-full max-w-6xl items-center justify-center p-4 sm:p-6">
        <div className="grid h-full max-h-[760px] w-full overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_24px_80px_-40px_rgba(15,23,42,0.35)]">
          <div className="hidden border-r border-slate-200 bg-slate-50/70 p-6 sm:block">
            <div className="h-7 w-28 animate-pulse rounded-lg bg-slate-200" />
            <div className="mt-10 space-y-3">
              {[1, 2, 3, 4, 5, 6, 7].map((item) => (
                <div key={item} className="h-9 animate-pulse rounded-xl bg-slate-100" />
              ))}
            </div>
          </div>
          <section className="flex min-w-0 flex-col p-5 sm:p-10">
            <div className="flex items-center justify-between">
              <div className="h-2 w-24 animate-pulse rounded-full bg-rose-100" />
              <div className="h-7 w-20 animate-pulse rounded-full bg-slate-100" />
            </div>
            <div className="flex flex-1 items-center">
              <div className="w-full max-w-2xl">
                <div className="h-9 w-3/4 animate-pulse rounded-xl bg-slate-200 sm:h-12" />
                <div className="mt-4 h-4 w-full max-w-xl animate-pulse rounded-lg bg-slate-100" />
                <div className="mt-2 h-4 w-2/3 max-w-lg animate-pulse rounded-lg bg-slate-100" />
                <div className="mt-8 grid gap-3 sm:grid-cols-2">
                  {[1, 2, 3, 4].map((item) => (
                    <div key={item} className="h-16 animate-pulse rounded-2xl border border-slate-100 bg-slate-50" />
                  ))}
                </div>
              </div>
            </div>
            <div className="flex justify-end">
              <div className="h-10 w-28 animate-pulse rounded-xl bg-slate-900/10" />
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}

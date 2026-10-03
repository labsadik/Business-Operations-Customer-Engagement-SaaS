export default function Loading() {
  return (
    <main className="min-h-screen bg-[#f7f8fb]">
      <div className="mx-auto max-w-7xl px-5 py-6 sm:px-6 lg:px-8">
        <div className="h-16 animate-pulse rounded-2xl border border-slate-200 bg-white" />

        <div className="mt-6 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
          <div className="h-3 w-24 animate-pulse rounded-full bg-slate-200" />
          <div className="mt-4 h-9 w-72 max-w-full animate-pulse rounded-xl bg-slate-200" />
          <div className="mt-3 h-4 w-full max-w-xl animate-pulse rounded-lg bg-slate-100" />

          <div className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-20 animate-pulse rounded-2xl border border-slate-200 bg-slate-50" />
            ))}
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.45fr)_360px]">
          <div className="h-[520px] animate-pulse rounded-3xl border border-slate-200 bg-white" />
          <div className="space-y-6">
            <div className="h-56 animate-pulse rounded-3xl border border-slate-200 bg-white" />
            <div className="h-64 animate-pulse rounded-3xl border border-slate-200 bg-white" />
          </div>
        </div>

        <div className="mt-6 h-28 animate-pulse rounded-3xl border border-slate-200 bg-white" />
      </div>
    </main>
  );
}

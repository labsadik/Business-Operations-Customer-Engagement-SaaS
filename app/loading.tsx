export default function Loading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f8fb]">
      <div className="flex items-center gap-3 rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-700 shadow-sm">
        <span className="size-2 animate-pulse rounded-full bg-blue-600" />
        Loading Conventus
      </div>
    </main>
  );
}